import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { after, mock, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const PROTOCOL_MAGIC = Buffer.from('ZNO1', 'ascii');
const REQUEST_MAGIC = Buffer.from('ZNI1', 'ascii');
const PROTOCOL_VERSION = 1;
const FRAME_READY = 1;
const FRAME_WRAPPER_INVOKED = 2;
const FRAME_SUCCESS = 3;
const FRAME_REJECTION = 4;
const CHILD_DEADLINE_MS = 3_000;
const CLEANUP_GRACE_MS = 500;
const CALLER_SETTLEMENT_BOUND_MS = CHILD_DEADLINE_MS + CLEANUP_GRACE_MS;
const SETTLEMENT_TIMEOUT = Symbol('SETTLEMENT_TIMEOUT');
const FIXED_ERROR_MESSAGE = 'Offline Zenon nonce production rejected';
const OUTCOME_UNKNOWN = 'OFFLINE_ZENON_NONCE_PRODUCER_OUTCOME_UNKNOWN';
const INVALID_CANDIDATE = 'OFFLINE_ZENON_NONCE_PRODUCER_INVALID_CANDIDATE';
const CHILD_REJECTED = 'OFFLINE_ZENON_NONCE_PRODUCER_CHILD_REJECTED';
const INPUT_REJECTED = 'OFFLINE_ZENON_NONCE_PRODUCER_INPUT_REJECTED';
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32_GENERATORS = Object.freeze([
  0x3b6a57b2,
  0x26508e6d,
  0x1ea119fa,
  0x3d4233dd,
  0x2a1462b3,
]);
const PAYER_CORE = Buffer.concat([
  Buffer.alloc(1),
  createHash('sha3-256').update(Buffer.alloc(32, 1)).digest().subarray(0, 19),
]);
const PREVIOUS_ACCOUNT_HASH = createHash('sha3-256')
  .update(Buffer.from('previous-0'))
  .digest('hex');
const VALID_NONCE = Buffer.from([3, 0, 0, 0, 0, 0, 0, 0]);
const INVALID_NONCE = Buffer.from([1, 0, 0, 0, 0, 0, 0, 0]);
const CHILD_PATH = fileURLToPath(new URL(
  '../src/zenon/internal/offline-pow-producer-child.js',
  import.meta.url,
));
const OWNER_PATH = fileURLToPath(new URL(
  '../src/zenon/internal/offline-pow-producer-owner.js',
  import.meta.url,
));
const PACKAGE_PATH = fileURLToPath(new URL('../package.json', import.meta.url));
const SOURCE_ROOT = fileURLToPath(new URL('../src/', import.meta.url));
const DEPENDENCY_NAMES = Object.freeze([
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
const EXPECTED_TRUST = Object.freeze({
  sourceAuthentication: 'NOT_ESTABLISHED',
  chainAuthentication: 'NOT_ESTABLISHED',
  canonicality: 'NOT_ESTABLISHED',
  finality: 'NOT_ESTABLISHED',
  liveFreshness: 'NOT_ESTABLISHED',
  signingAuthorization: 'NOT_ESTABLISHED',
});
const EXPECTED_SUCCESS_LIFECYCLE = Object.freeze({
  status: 'COMPLETED',
  attemptCount: 1,
  ready: 'OBSERVED',
  wrapperInvocation: 'JS_WRAPPER_INVOKED',
  nativeOrWasmEntry: 'NOT_ESTABLISHED',
  terminal: 'SUCCESS',
  processExit: 'ZERO',
  processClose: 'OBSERVED',
  stdioClose: 'OBSERVED',
  termination: 'NOT_REQUESTED',
  retry: 'NOT_PERFORMED',
  networkBoundary: 'TRUSTED_ARTIFACT_JS_DENIAL_FACADE_NOT_OS_SANDBOX',
});

let spawnImplementation = () => {
  throw new Error('unexpected unconfigured spawn');
};
const spawnMock = mock.method(childProcess, 'spawn', function mockedSpawn(...args) {
  return Reflect.apply(spawnImplementation, this, args);
});

const ownerModule = await import('../src/zenon/internal/offline-pow-producer-owner.js');
const { produceOfflineZenonNonce } = ownerModule;

after(() => {
  spawnMock.mock.restore();
});

function serialTest(name, body) {
  test(name, { concurrency: false }, body);
}

function polymod(values) {
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

function fiveBitWords(bytes) {
  const words = [];
  let accumulator = 0;
  let bits = 0;
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      words.push((accumulator >>> bits) & 31);
    }
  }
  if (bits > 0) words.push((accumulator << (5 - bits)) & 31);
  return words;
}

function payerFromCore(core) {
  const words = fiveBitWords(core);
  const checksumValue = polymod([3, 0, 26, ...words, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum = Array.from(
    { length: 6 },
    (_, index) => (checksumValue >>> (5 * (5 - index))) & 31,
  );
  return `z1${[...words, ...checksum]
    .map(value => BECH32_CHARSET[value])
    .join('')}`;
}

function scope(difficulty = 1) {
  return {
    payer: payerFromCore(PAYER_CORE),
    previousAccountHash: PREVIOUS_ACCOUNT_HASH,
    difficulty,
  };
}

function responseFrame(type, payload = Buffer.alloc(0)) {
  const frame = Buffer.alloc(7 + payload.length);
  PROTOCOL_MAGIC.copy(frame, 0);
  frame[4] = PROTOCOL_VERSION;
  frame[5] = type;
  frame[6] = payload.length;
  payload.copy(frame, 7);
  return frame;
}

function successfulFrames(nonce = Buffer.alloc(8)) {
  return [
    responseFrame(FRAME_READY),
    responseFrame(FRAME_WRAPPER_INVOKED),
    responseFrame(FRAME_SUCCESS, nonce),
  ];
}

function streamClose(stream) {
  if (stream.closed === true) return Promise.resolve();
  return new Promise(resolve => stream.once('close', resolve));
}

function fakeChild(onRequest, {
  inputWriteError = false,
  autoCloseOnKill = true,
  holdRequestClose = false,
  holdResponseClose = false,
  killReturnsFalse = false,
  killThrows = false,
} = {}) {
  const child = new EventEmitter();
  const requestChunks = [];
  const response = new PassThrough();
  let processClosed = false;
  let processFinished = false;
  let closeCode;
  let closeSignal;

  const request = new Writable({
    write(chunk, _encoding, callback) {
      if (inputWriteError) {
        callback(new Error('private input failure detail'));
        return;
      }
      requestChunks.push(Buffer.from(chunk));
      callback();
    },
    final(callback) {
      callback();
      queueMicrotask(() => {
        if (typeof onRequest === 'function') {
          onRequest(child, Buffer.concat(requestChunks));
        }
      });
    },
  });
  const destroyRequest = request.destroy.bind(request);
  const destroyResponse = response.destroy.bind(response);
  if (holdRequestClose) {
    request.destroy = function holdDestroy() {
      return request;
    };
  }
  if (holdResponseClose) {
    response.destroy = function holdDestroy() {
      return response;
    };
  }

  child.exitCode = null;
  child.signalCode = null;
  child.killed = false;
  child.killSignals = [];
  child.stdio = [null, null, null, request, response];
  child.listenerBaselines = Object.freeze({
    childError: child.listenerCount('error'),
    requestError: request.listenerCount('error'),
    responseData: response.listenerCount('data'),
    responseError: response.listenerCount('error'),
  });

  child.releaseHeldStreamCloses = function releaseHeldStreamCloses() {
    if (holdRequestClose && !request.closed) destroyRequest();
    if (holdResponseClose && !response.closed) destroyResponse();
  };

  child.emitProcessClose = async function emitProcessClose() {
    await Promise.all([streamClose(request), streamClose(response)]);
    if (processClosed) return;
    processClosed = true;
    child.emit('close', closeCode, closeSignal);
  };

  child.emitProcessCloseWithoutStreams = function emitProcessCloseWithoutStreams() {
    if (processClosed) return;
    processClosed = true;
    child.emit('close', closeCode, closeSignal);
  };

  child.finishProcess = function finishProcess(code = 0, signal = null, {
    emitClose = true,
    endOutput = true,
  } = {}) {
    if (processFinished) return;
    processFinished = true;
    closeCode = code;
    closeSignal = signal;
    child.exitCode = code;
    child.signalCode = signal;
    child.emit('exit', code, signal);
    if (endOutput && !response.destroyed && !response.writableEnded) response.end();
    if (emitClose) void child.emitProcessClose();
  };

  child.kill = function kill(signal) {
    child.killed = true;
    child.killSignals.push(signal);
    if (killThrows) throw new Error('private kill failure detail');
    if (killReturnsFalse) return false;
    if (autoCloseOnKill) child.finishProcess(null, signal);
    return true;
  };

  return child;
}

function writeFrames(child, frames, { fragment = false } = {}) {
  for (const frame of frames) {
    if (fragment) {
      for (const byte of frame) child.stdio[4].write(Buffer.from([byte]));
    } else {
      child.stdio[4].write(frame);
    }
  }
}

function configuredAttempt(onRequest, options) {
  const capture = { calls: [], child: null };
  spawnImplementation = function spawnScenario(...args) {
    capture.calls.push(args);
    capture.child = fakeChild(onRequest, options);
    return capture.child;
  };
  return capture;
}

async function fixedRejection(promise, code) {
  let observed;
  try {
    await promise;
  } catch (error) {
    observed = error;
  }
  assert.equal(observed?.message, FIXED_ERROR_MESSAGE);
  assert.equal(observed?.code, code);
  assert.equal(observed?.stack, undefined);
  return observed;
}

function trackedSettlement(promise) {
  const tracked = { count: 0, promise: undefined };
  tracked.promise = promise.then(
    value => {
      tracked.count += 1;
      return { kind: 'FULFILLED', value };
    },
    error => {
      tracked.count += 1;
      return { error, kind: 'REJECTED' };
    },
  );
  return tracked;
}

async function settlementWithin(promise, milliseconds) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise(resolve => {
        timeout = setTimeout(() => resolve(SETTLEMENT_TIMEOUT), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function assertOwnerListenersReleased(child) {
  assert.equal(
    child.listenerCount('error'),
    child.listenerBaselines.childError,
  );
  assert.equal(
    child.stdio[3].listenerCount('error'),
    child.listenerBaselines.requestError,
  );
  assert.equal(
    child.stdio[4].listenerCount('data'),
    child.listenerBaselines.responseData,
  );
  assert.equal(
    child.stdio[4].listenerCount('error'),
    child.listenerBaselines.responseError,
  );
}

function assertDeepFrozen(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (Object.hasOwn(descriptor, 'value')) assertDeepFrozen(descriptor.value, seen);
  }
}

function containsFunction(value, seen = new Set()) {
  if (typeof value === 'function') return true;
  if (value === null || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  return Reflect.ownKeys(value).some(key => containsFunction(value[key], seen));
}

function javascriptFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...javascriptFiles(path));
    if (entry.isFile() && entry.name.endsWith('.js')) files.push(path);
  }
  return files;
}

function invalidChecksum(address) {
  const finalIndex = BECH32_CHARSET.indexOf(address.at(-1));
  return `${address.slice(0, -1)}${BECH32_CHARSET[(finalIndex + 1) % BECH32_CHARSET.length]}`;
}

serialTest('exports only the fixed producer and rejects hostile input before spawn', () => {
  assert.deepEqual(Object.keys(ownerModule), ['produceOfflineZenonNonce']);
  let spawnCalls = 0;
  spawnImplementation = () => {
    spawnCalls += 1;
    throw new Error('must not spawn');
  };

  const base = scope(2);
  const missing = { ...base };
  delete missing.difficulty;
  const nonenumerable = { ...base };
  Object.defineProperty(nonenumerable, 'difficulty', { value: 2, enumerable: false });
  let accessorReads = 0;
  const accessor = { ...base };
  Object.defineProperty(accessor, 'difficulty', {
    enumerable: true,
    get() { accessorReads += 1; return 2; },
  });
  let calls = 0;
  function executableInput() { calls += 1; }
  const coercive = {
    valueOf() { calls += 1; return 2; },
    toString() { calls += 1; return '2'; },
    [Symbol.toPrimitive]() { calls += 1; return 2; },
  };
  let proxyTraps = 0;
  const proxy = new Proxy(base, {
    get() { proxyTraps += 1; return undefined; },
    getOwnPropertyDescriptor() { proxyTraps += 1; return undefined; },
    getPrototypeOf() { proxyTraps += 1; return Object.prototype; },
    ownKeys() { proxyTraps += 1; return []; },
  });
  const invalid = [
    undefined,
    null,
    [],
    executableInput,
    missing,
    { ...base, extra: true },
    { ...base, [Symbol('extra')]: true },
    nonenumerable,
    accessor,
    Object.assign(Object.create(null), base),
    Object.assign(Object.create({}), base),
    proxy,
    { ...base, payer: base.payer.toUpperCase() },
    { ...base, payer: invalidChecksum(base.payer) },
    { ...base, payer: new String(base.payer) },
    { ...base, previousAccountHash: base.previousAccountHash.toUpperCase() },
    { ...base, previousAccountHash: base.previousAccountHash.slice(1) },
    { ...base, difficulty: 0 },
    { ...base, difficulty: -0 },
    { ...base, difficulty: -1 },
    { ...base, difficulty: 1.5 },
    { ...base, difficulty: Number.MAX_SAFE_INTEGER + 1 },
    { ...base, difficulty: '2' },
    { ...base, difficulty: 2n },
    { ...base, difficulty: new Number(2) },
    { ...base, difficulty: coercive },
  ];
  assert.throws(() => produceOfflineZenonNonce(), error => error?.code === INPUT_REJECTED);
  assert.throws(
    () => produceOfflineZenonNonce(base, undefined),
    error => error?.code === INPUT_REJECTED,
  );
  for (const input of invalid) {
    assert.throws(
      () => produceOfflineZenonNonce(input),
      error => error?.code === INPUT_REJECTED,
    );
  }
  assert.equal(accessorReads, 0);
  assert.equal(proxyTraps, 0);
  assert.equal(calls, 0);
  assert.equal(spawnCalls, 0);
});

serialTest('uses one fixed command, exact binary scope, empty environment, and read-only permissions', async () => {
  let request;
  const capture = configuredAttempt((child, frame) => {
    request = frame;
    writeFrames(child, successfulFrames(), { fragment: true });
    child.finishProcess();
  });
  const input = scope(1);
  const result = await produceOfflineZenonNonce(input);

  assert.equal(capture.calls.length, 1);
  const [executable, args, options] = capture.calls[0];
  assert.equal(executable, realpathSync(process.execPath));
  assert.equal(isAbsolute(executable), true);
  assert.equal(args[0], '--permission');
  assert.equal(args.at(-1), realpathSync(CHILD_PATH));
  assert.equal(args.filter(value => value === realpathSync(CHILD_PATH)).length, 1);
  assert.equal(args.some(value => /--(?:allow-fs-write|allow-child-process|allow-worker|allow-addons|allow-wasi|allow-net|eval|input-type|require|import|env-file)/u.test(value)), false);
  const allowedReads = args
    .filter(value => value.startsWith('--allow-fs-read='))
    .map(value => value.slice('--allow-fs-read='.length));
  const expectedReads = [...new Set([
    realpathSync(CHILD_PATH),
    realpathSync(PACKAGE_PATH),
    ...DEPENDENCY_NAMES.map(name => realpathSync(fileURLToPath(
      new URL(`../node_modules/${name}/`, import.meta.url),
    ))),
  ])];
  assert.deepEqual(allowedReads, expectedReads);
  assert.equal(allowedReads.every(isAbsolute), true);
  assert.equal(allowedReads.includes(realpathSync(new URL('../', import.meta.url))), false);
  assert.equal(allowedReads.includes(realpathSync(new URL('../node_modules/', import.meta.url))), false);
  assert.equal(options.cwd, realpathSync(dirname(CHILD_PATH)));
  assert.equal(options.detached, false);
  assert.equal(options.shell, false);
  assert.deepEqual(options.stdio, ['ignore', 'ignore', 'ignore', 'pipe', 'pipe']);
  assert.equal(options.windowsHide, true);
  assert.equal(Object.getPrototypeOf(options.env), null);
  assert.deepEqual(Reflect.ownKeys(options.env), []);

  assert.equal(request.length, 65);
  assert.equal(request.subarray(0, 4).equals(REQUEST_MAGIC), true);
  assert.equal(request[4], PROTOCOL_VERSION);
  assert.equal(request.subarray(5, 25).equals(PAYER_CORE), true);
  assert.equal(
    request.subarray(25, 57).equals(Buffer.from(input.previousAccountHash, 'hex')),
    true,
  );
  assert.equal(request.readBigUInt64BE(57), 1n);
  assert.equal(result.nonce, Buffer.alloc(8).toString('hex'));
});

serialTest('accepts fragmented exact frames only after terminal, zero exit, stdio close, and reap', async () => {
  let heldChild;
  const capture = configuredAttempt((child) => {
    heldChild = child;
    writeFrames(child, successfulFrames(), { fragment: true });
    child.finishProcess(0, null, { emitClose: false });
  });
  let settled = false;
  const produced = produceOfflineZenonNonce(scope(1)).then(value => {
    settled = true;
    return value;
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false);
  assert.equal(capture.calls.length, 1);
  await heldChild.emitProcessClose();
  const result = await produced;
  assert.equal(settled, true);
  assert.deepEqual(result.lifecycle, EXPECTED_SUCCESS_LIFECYCLE);
});

serialTest('returns only the detached deeply frozen qualification DTO', async () => {
  configuredAttempt((child) => {
    writeFrames(child, successfulFrames());
    child.finishProcess();
  });
  const input = scope(1);
  const snapshot = { ...input };
  const result = await produceOfflineZenonNonce(input);

  input.payer = payerFromCore(Buffer.concat([Buffer.alloc(1), Buffer.alloc(19, 2)]));
  input.previousAccountHash = '00'.repeat(32);
  input.difficulty = 2;
  assert.deepEqual(Object.keys(result), [
    'qualification',
    'status',
    'nonce',
    'recordedProofScope',
    'lifecycle',
    'trust',
  ]);
  assert.equal(result.qualification, 'OFFLINE_NONCE_PRODUCER_ONLY');
  assert.equal(result.status, 'VALID');
  assert.deepEqual(result.recordedProofScope, snapshot);
  assert.notStrictEqual(result.recordedProofScope, input);
  assert.deepEqual(result.lifecycle, EXPECTED_SUCCESS_LIFECYCLE);
  assert.deepEqual(result.trust, EXPECTED_TRUST);
  assert.equal(containsFunction(result), false);
  for (const field of [
    'block', 'signature', 'signer', 'wallet', 'rpc', 'runtime', 'capability',
    'authorization', 'freshness', 'chainIdentity', 'publish', 'submit',
  ]) assert.equal(field in result, false);
  assertDeepFrozen(result);
  assert.throws(() => { result.status = 'INVALID'; }, TypeError);
});

serialTest('binds verification to the original copied scope despite caller mutation', async () => {
  configuredAttempt((child) => {
    writeFrames(child, successfulFrames(VALID_NONCE));
    child.finishProcess();
  });
  const input = scope(2);
  const original = { ...input };
  const produced = produceOfflineZenonNonce(input);
  input.payer = payerFromCore(Buffer.concat([Buffer.alloc(1), Buffer.alloc(19, 4)]));
  input.previousAccountHash = '00'.repeat(32);
  input.difficulty = 1;
  const result = await produced;
  assert.deepEqual(result.recordedProofScope, original);
  assert.equal(result.status, 'VALID');
});

serialTest('rejects a clean but context-invalid candidate after the unchanged verifier check', async () => {
  const capture = configuredAttempt((child) => {
    writeFrames(child, successfulFrames(INVALID_NONCE));
    child.finishProcess();
  });
  const error = await fixedRejection(
    produceOfflineZenonNonce(scope(2)),
    INVALID_CANDIDATE,
  );
  assert.equal(capture.calls.length, 1);
  assert.equal(error.lifecycle.status, 'REJECTED');
  assert.equal(error.lifecycle.terminal, 'SUCCESS');
  assert.equal(error.lifecycle.processExit, 'ZERO');
  assert.equal(error.lifecycle.retry, 'NOT_PERFORMED');
});

serialTest('recognizes only the ordered fixed rejection as a known child rejection', async () => {
  const capture = configuredAttempt((child) => {
    writeFrames(child, [
      responseFrame(FRAME_READY),
      responseFrame(FRAME_WRAPPER_INVOKED),
      responseFrame(FRAME_REJECTION),
    ]);
    child.finishProcess();
  });
  const error = await fixedRejection(
    produceOfflineZenonNonce(scope(1)),
    CHILD_REJECTED,
  );
  assert.equal(capture.calls.length, 1);
  assert.equal(error.lifecycle.status, 'REJECTED');
  assert.equal(error.lifecycle.wrapperInvocation, 'JS_WRAPPER_INVOKED');
  assert.equal(error.lifecycle.nativeOrWasmEntry, 'NOT_ESTABLISHED');
});

serialTest('malformed, truncated, oversized, duplicate, and out-of-order frames are unknown', async () => {
  const cases = [
    [],
    [responseFrame(FRAME_READY).subarray(0, 5)],
    [Buffer.from('BAD!\x01\x01\x00', 'latin1')],
    [responseFrame(FRAME_WRAPPER_INVOKED), responseFrame(FRAME_READY), responseFrame(FRAME_SUCCESS, Buffer.alloc(8))],
    [responseFrame(FRAME_READY), responseFrame(FRAME_READY), responseFrame(FRAME_REJECTION), responseFrame(FRAME_REJECTION)],
    [responseFrame(FRAME_READY), responseFrame(FRAME_WRAPPER_INVOKED), responseFrame(FRAME_SUCCESS, Buffer.alloc(7))],
  ];
  for (const frames of cases) {
    const capture = configuredAttempt((child) => {
      writeFrames(child, frames);
      child.finishProcess();
    });
    const error = await fixedRejection(
      produceOfflineZenonNonce(scope(1)),
      OUTCOME_UNKNOWN,
    );
    assert.equal(capture.calls.length, 1);
    assert.equal(error.lifecycle.status, 'OUTCOME_UNKNOWN');
    assert.equal(error.lifecycle.retry, 'NOT_PERFORMED');
    if (error.lifecycle.wrapperInvocation !== 'JS_WRAPPER_INVOKED') {
      assert.equal(error.lifecycle.wrapperInvocation, 'NOT_OBSERVED_OR_UNKNOWN');
    }
  }

  const oversized = configuredAttempt((child) => {
    child.stdio[4].write(Buffer.alloc(30));
  });
  const oversizedError = await fixedRejection(
    produceOfflineZenonNonce(scope(1)),
    OUTCOME_UNKNOWN,
  );
  assert.equal(oversized.calls.length, 1);
  assert.deepEqual(oversized.child.killSignals, ['SIGKILL']);
  assert.equal(oversizedError.lifecycle.status, 'OUTCOME_UNKNOWN');
});

serialTest('spawn, input, output, nonzero, and signal failures never retry', async () => {
  let spawnCalls = 0;
  spawnImplementation = () => {
    spawnCalls += 1;
    throw new Error('private spawn failure detail');
  };
  let error = await fixedRejection(produceOfflineZenonNonce(scope(1)), OUTCOME_UNKNOWN);
  assert.equal(spawnCalls, 1);
  assert.equal(error.lifecycle.attemptCount, 1);
  assert.equal(error.lifecycle.retry, 'NOT_PERFORMED');

  let capture = configuredAttempt(() => {}, { inputWriteError: true });
  error = await fixedRejection(produceOfflineZenonNonce(scope(1)), OUTCOME_UNKNOWN);
  assert.equal(capture.calls.length, 1);
  assert.deepEqual(capture.child.killSignals, ['SIGKILL']);

  capture = configuredAttempt((child) => {
    child.stdio[4].destroy(new Error('private output failure detail'));
  });
  error = await fixedRejection(produceOfflineZenonNonce(scope(1)), OUTCOME_UNKNOWN);
  assert.equal(capture.calls.length, 1);
  assert.deepEqual(capture.child.killSignals, ['SIGKILL']);

  capture = configuredAttempt((child) => {
    writeFrames(child, successfulFrames());
    child.finishProcess(7, null);
  });
  error = await fixedRejection(produceOfflineZenonNonce(scope(1)), OUTCOME_UNKNOWN);
  assert.equal(capture.calls.length, 1);
  assert.equal(error.lifecycle.processExit, 'NONZERO');

  capture = configuredAttempt((child) => {
    writeFrames(child, successfulFrames());
    child.finishProcess(null, 'SIGTERM');
  });
  error = await fixedRejection(produceOfflineZenonNonce(scope(1)), OUTCOME_UNKNOWN);
  assert.equal(capture.calls.length, 1);
  assert.equal(error.lifecycle.processExit, 'SIGNALLED');
});

serialTest('an asynchronous spawn error is sanitized and reaped as unknown', async () => {
  const capture = configuredAttempt(() => {});
  const produced = produceOfflineZenonNonce(scope(1));
  queueMicrotask(() => capture.child.emit('error', new Error('private child error detail')));
  const error = await fixedRejection(produced, OUTCOME_UNKNOWN);
  assert.equal(capture.calls.length, 1);
  assert.deepEqual(capture.child.killSignals, ['SIGKILL']);
  assert.equal(error.lifecycle.processClose, 'OBSERVED');
  assert.equal(error.lifecycle.stdioClose, 'OBSERVED');
});

serialTest('early exit, missing terminal, missing end, and missing exit remain unknown', async () => {
  const scenarios = [
    child => child.finishProcess(),
    child => {
      writeFrames(child, [responseFrame(FRAME_READY), responseFrame(FRAME_WRAPPER_INVOKED)]);
      child.finishProcess();
    },
    child => {
      writeFrames(child, successfulFrames());
      child.finishProcess(0, null, { endOutput: false });
      child.stdio[4].destroy();
    },
    child => {
      writeFrames(child, successfulFrames());
      child.stdio[4].end();
      void Promise.all([
        streamClose(child.stdio[3]),
        streamClose(child.stdio[4]),
      ]).then(() => child.emit('close', 0, null));
    },
  ];
  for (const scenario of scenarios) {
    const capture = configuredAttempt(scenario);
    const error = await fixedRejection(
      produceOfflineZenonNonce(scope(1)),
      OUTCOME_UNKNOWN,
    );
    assert.equal(capture.calls.length, 1);
    assert.equal(error.lifecycle.status, 'OUTCOME_UNKNOWN');
  }
});

serialTest('termination targets only the owned child and settlement waits for close and reap', async () => {
  const capture = configuredAttempt((child) => {
    child.stdio[4].destroy(new Error('private output failure detail'));
  }, { autoCloseOnKill: false });
  let settled = false;
  const produced = produceOfflineZenonNonce(scope(1)).then(
    value => { settled = true; return value; },
    error => { settled = true; throw error; },
  );
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(capture.child.killSignals, ['SIGKILL']);
  assert.equal(settled, false);
  capture.child.finishProcess(null, 'SIGKILL');
  const error = await fixedRejection(produced, OUTCOME_UNKNOWN);
  assert.equal(settled, true);
  assert.equal(error.lifecycle.termination, 'REQUESTED');
  assert.equal(error.lifecycle.processClose, 'OBSERVED');
  assert.equal(error.lifecycle.stdioClose, 'OBSERVED');
});

serialTest('termination failure is sanitized and remains unknown after eventual reap', async () => {
  const capture = configuredAttempt((child) => {
    child.stdio[4].destroy(new Error('private output failure detail'));
  }, { autoCloseOnKill: false, killThrows: true });
  const produced = produceOfflineZenonNonce(scope(1));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(capture.child.killSignals, ['SIGKILL']);
  capture.child.finishProcess(null, 'SIGKILL');
  const error = await fixedRejection(produced, OUTCOME_UNKNOWN);
  assert.equal(error.lifecycle.termination, 'FAILED');
  assert.equal(error.lifecycle.processClose, 'OBSERVED');
});

serialTest('the fixed caller bound retains an exact child when SIGKILL returns false', async () => {
  const capture = configuredAttempt(() => {}, {
    autoCloseOnKill: false,
    killReturnsFalse: true,
  });
  const started = Date.now();
  const tracked = trackedSettlement(produceOfflineZenonNonce(scope(1)));
  const observed = await settlementWithin(
    tracked.promise,
    CALLER_SETTLEMENT_BOUND_MS + 1_250,
  );
  const elapsed = Date.now() - started;
  let frozenLifecycle;
  let repeatedLateErrorThrew = false;
  let errorListenerRetained = false;
  const processClose = new Promise(resolve => capture.child.once('close', resolve));
  try {
    if (observed !== SETTLEMENT_TIMEOUT && observed.kind === 'REJECTED') {
      frozenLifecycle = { ...observed.error.lifecycle };
      try {
        capture.child.emit('error', new Error('private late child error detail'));
        capture.child.emit('error', new Error('private repeated child error detail'));
      } catch {
        repeatedLateErrorThrew = true;
      }
      errorListenerRetained = capture.child.listenerCount('error') ===
        capture.child.listenerBaselines.childError + 1;
      writeFrames(capture.child, successfulFrames());
    }
  } finally {
    capture.child.finishProcess(null, 'SIGKILL');
    await processClose;
    await new Promise(resolve => setImmediate(resolve));
  }

  assert.notEqual(observed, SETTLEMENT_TIMEOUT);
  assert.equal(observed.kind, 'REJECTED');
  assert.equal(observed.error.message, FIXED_ERROR_MESSAGE);
  assert.equal(observed.error.code, OUTCOME_UNKNOWN);
  assert.equal(observed.error.stack, undefined);
  assert.equal(elapsed >= CALLER_SETTLEMENT_BOUND_MS - 75, true);
  assert.equal(elapsed < CALLER_SETTLEMENT_BOUND_MS + 1_250, true);
  assert.equal(capture.calls.length, 1);
  assert.deepEqual(capture.child.killSignals, ['SIGKILL']);
  assert.equal(repeatedLateErrorThrew, false);
  assert.equal(errorListenerRetained, true);
  assert.equal(observed.error.lifecycle.processExit, 'NOT_OBSERVED');
  assert.equal(observed.error.lifecycle.processClose, 'NOT_OBSERVED');
  assert.equal(observed.error.lifecycle.stdioClose, 'NOT_OBSERVED');
  assert.equal(observed.error.lifecycle.termination, 'FAILED');
  assert.equal(observed.error.lifecycle.retry, 'NOT_PERFORMED');
  assert.equal(
    observed.error.lifecycle.ownerDisposition,
    'RETAINED_UNTIL_ACTUAL_CLOSURE',
  );
  assert.deepEqual(observed.error.lifecycle, frozenLifecycle);
  assertDeepFrozen(observed.error.lifecycle);
  assert.equal(tracked.count, 1);
  assertOwnerListenersReleased(capture.child);
});

serialTest('process close cannot slide the bound past either pipe and peers stay isolated', async () => {
  const spawned = [];
  spawnImplementation = function spawnScenario(...args) {
    const index = spawned.length;
    let child;
    if (index === 0 || index === 1) {
      child = fakeChild((ownedChild) => {
        ownedChild.finishProcess(0, null, { emitClose: false });
        ownedChild.emitProcessCloseWithoutStreams();
      }, index === 0 ? { holdRequestClose: true } : { holdResponseClose: true });
    } else if (index === 2) {
      child = fakeChild((ownedChild) => {
        writeFrames(ownedChild, successfulFrames());
        ownedChild.finishProcess();
      });
    } else {
      throw new Error('unexpected extra spawn');
    }
    spawned.push({ args, child });
    return child;
  };
  const decoy = fakeChild(() => {}, { autoCloseOnKill: false });
  const started = Date.now();
  const requestHeld = trackedSettlement(produceOfflineZenonNonce(scope(1)));
  const responseHeld = trackedSettlement(produceOfflineZenonNonce(scope(1)));
  const peer = trackedSettlement(produceOfflineZenonNonce(scope(1)));
  const peerObserved = await settlementWithin(peer.promise, 1_000);
  const heldObserved = await Promise.all([
    settlementWithin(requestHeld.promise, CALLER_SETTLEMENT_BOUND_MS + 1_250),
    settlementWithin(responseHeld.promise, CALLER_SETTLEMENT_BOUND_MS + 1_250),
  ]);
  const elapsed = Date.now() - started;
  const lifecycleSnapshots = heldObserved.map(observed => (
    observed !== SETTLEMENT_TIMEOUT && observed.kind === 'REJECTED'
      ? { ...observed.error.lifecycle }
      : undefined
  ));

  const heldChildren = spawned.slice(0, 2).map(entry => entry.child);
  const heldStreamCloses = heldChildren.flatMap(child => [
    streamClose(child.stdio[3]),
    streamClose(child.stdio[4]),
  ]);
  for (const child of heldChildren) child.releaseHeldStreamCloses();
  await Promise.all(heldStreamCloses);
  await new Promise(resolve => setImmediate(resolve));

  const decoyStreamCloses = [
    streamClose(decoy.stdio[3]),
    streamClose(decoy.stdio[4]),
  ];
  decoy.finishProcess(0, null, { emitClose: false, endOutput: false });
  decoy.stdio[3].destroy();
  decoy.stdio[4].destroy();
  await Promise.all(decoyStreamCloses);
  await decoy.emitProcessClose();

  assert.notEqual(peerObserved, SETTLEMENT_TIMEOUT);
  assert.equal(peerObserved.kind, 'FULFILLED');
  assert.equal(peerObserved.value.status, 'VALID');
  assert.equal(peer.count, 1);
  assert.equal(spawned.length, 3);
  assert.equal(spawned[2].child.killSignals.length, 0);
  assert.deepEqual(decoy.killSignals, []);
  assert.equal(elapsed >= CALLER_SETTLEMENT_BOUND_MS - 75, true);
  assert.equal(elapsed < CALLER_SETTLEMENT_BOUND_MS + 1_250, true);

  for (let index = 0; index < heldObserved.length; index += 1) {
    const observed = heldObserved[index];
    assert.notEqual(observed, SETTLEMENT_TIMEOUT);
    assert.equal(observed.kind, 'REJECTED');
    assert.equal(observed.error.code, OUTCOME_UNKNOWN);
    assert.equal(observed.error.lifecycle.processExit, 'ZERO');
    assert.equal(observed.error.lifecycle.processClose, 'OBSERVED');
    assert.equal(observed.error.lifecycle.stdioClose, 'NOT_OBSERVED');
    assert.equal(
      observed.error.lifecycle.ownerDisposition,
      'RETAINED_UNTIL_ACTUAL_CLOSURE',
    );
    assert.deepEqual(observed.error.lifecycle, lifecycleSnapshots[index]);
    assert.equal(heldChildren[index].killSignals.length, 0);
    assertOwnerListenersReleased(heldChildren[index]);
  }
  assert.equal(requestHeld.count, 1);
  assert.equal(responseHeld.count, 1);
});

serialTest('the single deadline covers a child that never becomes ready', async () => {
  const capture = configuredAttempt(() => {});
  const started = Date.now();
  const error = await fixedRejection(
    produceOfflineZenonNonce(scope(1)),
    OUTCOME_UNKNOWN,
  );
  const elapsed = Date.now() - started;
  assert.equal(elapsed >= CHILD_DEADLINE_MS - 25, true);
  assert.equal(elapsed < CHILD_DEADLINE_MS + 2_000, true);
  assert.equal(capture.calls.length, 1);
  assert.deepEqual(capture.child.killSignals, ['SIGKILL']);
  assert.equal(error.lifecycle.termination, 'REQUESTED');
  assert.equal(error.lifecycle.retry, 'NOT_PERFORMED');
});

serialTest('source keeps the fixed protocol isolated from runtime, signing, RPC, and caller hooks', () => {
  const ownerSource = readFileSync(OWNER_PATH, 'utf8');
  const childSource = readFileSync(CHILD_PATH, 'utf8');
  const ownerImports = Array.from(
    ownerSource.matchAll(/from\s+['"]([^'"]+)['"]/gu),
    match => match[1],
  );
  assert.deepEqual(ownerImports, [
    'node:child_process',
    'node:fs',
    'node:path',
    'node:stream',
    'node:url',
    'node:util',
    './offline-nonce-proof-verifier.js',
  ]);
  assert.equal(
    childSource.match(/znn-typescript-sdk\/dist\/pow\/pow\.js/gu)?.length,
    1,
  );
  assert.doesNotMatch(childSource, /(?:from\s*|import\(\s*)['"]znn-typescript-sdk['"]/u);
  assert.doesNotMatch(
    `${ownerSource}\n${childSource}`,
    /\b(?:getInstance|setPowProvider|prepareBlock|publishRawTransaction|sign|signer|wallet|RPC|WebSocketProvider)\b/u,
  );
  assert.doesNotMatch(
    `${ownerSource}\n${childSource}`,
    /process\.env|process\.send|node:worker_threads|\b(?:fork|exec|execFile)\s*\(/u,
  );
  assert.doesNotMatch(
    childSource,
    /\b(?:writeFile|appendFile|mkdir|mkdtemp|openSync|createWriteStream)\s*\(/u,
  );
  assert.equal(childSource.includes('process.argv.length !== 2'), true);
  assert.equal(childSource.includes('readSync(3,'), true);
  assert.equal(childSource.includes('writeSync(4,'), true);
  assert.equal(childSource.includes('TRUSTED_ARTIFACT_JS_DENIAL_FACADE_NOT_OS_SANDBOX'), true);
  const denialPosition = childSource.indexOf(
    'const NETWORK_BOUNDARY_READY = installNetworkDenialFacade();',
  );
  const importPosition = childSource.indexOf(
    "import('../../../node_modules/znn-typescript-sdk/dist/pow/pow.js')",
  );
  assert.equal(denialPosition >= 0 && denialPosition < importPosition, true);
  assert.equal((childSource.match(/\bgenerate\(domain, request\.difficulty\)/gu) ?? []).length, 1);
  assert.equal(ownerSource.includes("SDK_VERSION !== '1.0.5'"), true);
  assert.equal(ownerSource.includes('setTimeout(onDeadline, CHILD_DEADLINE_MS)'), true);

  const productionFiles = javascriptFiles(SOURCE_ROOT);
  const definitionAndConsumers = productionFiles
    .filter(path => readFileSync(path, 'utf8').includes('produceOfflineZenonNonce'))
    .map(path => relative(SOURCE_ROOT, path))
    .sort();
  assert.deepEqual(definitionAndConsumers, [
    'zenon/internal/offline-owned-nonce-preparation.js',
    'zenon/internal/offline-pow-producer-owner.js',
  ]);
});
