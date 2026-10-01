import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { after, mock, test } from 'node:test';

const RESPONSE_MAGIC = Buffer.from('ZNO1', 'ascii');
const REQUEST_MAGIC = Buffer.from('ZNI1', 'ascii');
const PROTOCOL_VERSION = 1;
const FRAME_READY = 1;
const FRAME_WRAPPER_INVOKED = 2;
const FRAME_SUCCESS = 3;
const FIXED_ERROR_MESSAGE = 'Offline Zenon nonce production rejected';
const OUTCOME_UNKNOWN = 'OFFLINE_ZENON_NONCE_PRODUCER_OUTCOME_UNKNOWN';
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32_GENERATORS = Object.freeze([
  0x3b6a57b2,
  0x26508e6d,
  0x1ea119fa,
  0x3d4233dd,
  0x2a1462b3,
]);
const POW_RANGE = 1n << 64n;
const PAYER_CORE_A = Buffer.concat([
  Buffer.alloc(1),
  sha3(Buffer.alloc(32, 0x11)).subarray(0, 19),
]);
const PAYER_CORE_B = Buffer.concat([
  Buffer.alloc(1),
  sha3(Buffer.alloc(32, 0x22)).subarray(0, 19),
]);
const MUTATED_PAYER_CORE = Buffer.concat([
  Buffer.alloc(1),
  sha3(Buffer.alloc(32, 0x33)).subarray(0, 19),
]);
const PREVIOUS_HASH_A = sha3(
  Buffer.from('mocked-concurrency-previous-a'),
).toString('hex');
const PREVIOUS_HASH_B = sha3(
  Buffer.from('mocked-concurrency-previous-b'),
).toString('hex');
const MUTATED_PREVIOUS_HASH = sha3(
  Buffer.from('mocked-concurrency-mutated-previous'),
).toString('hex');
const SCOPE_A = Object.freeze({
  payer: payerFromCore(PAYER_CORE_A),
  previousAccountHash: PREVIOUS_HASH_A,
  difficulty: 2,
});
const SCOPE_B = Object.freeze({
  payer: payerFromCore(PAYER_CORE_B),
  previousAccountHash: PREVIOUS_HASH_B,
  difficulty: 2,
});
const CANDIDATE_A = findCandidate(PAYER_CORE_A, SCOPE_A);
const CANDIDATE_B = findCandidate(PAYER_CORE_B, SCOPE_B);
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

const allFakeChildren = new Set();
let spawnImplementation = () => {
  throw new Error('unexpected unconfigured mocked spawn');
};
const spawnMock = mock.method(childProcess, 'spawn', function mockedSpawn(...args) {
  return Reflect.apply(spawnImplementation, this, args);
});

after(async () => {
  let cleanupComplete = true;
  try {
    for (const child of allFakeChildren) {
      await child.forceClose();
      cleanupComplete &&= child.processClosed() &&
        child.stdio[3].closed === true && child.stdio[4].closed === true;
    }
  } finally {
    spawnMock.mock.restore();
  }
  assert.equal(cleanupComplete, true, 'all controlled fake children are closed');
});

const ownerUrl = new URL(
  '../src/zenon/internal/offline-pow-producer-owner.js',
  import.meta.url,
);
ownerUrl.searchParams.set('mocked-concurrency-evidence', '1');
const { produceOfflineZenonNonce } = await import(ownerUrl.href);

function sha3(value) {
  return createHash('sha3-256').update(value).digest();
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

function referencePredicate(payerCore, scope, nonce) {
  const domain = sha3(Buffer.concat([
    payerCore,
    Buffer.from(scope.previousAccountHash, 'hex'),
  ]));
  const work = sha3(Buffer.concat([nonce, domain]));
  const observed = work.readBigUInt64LE(0);
  const threshold = POW_RANGE - (POW_RANGE / BigInt(scope.difficulty));
  return observed >= threshold;
}

function findCandidate(payerCore, scope) {
  for (let value = 0n; value < 65_536n; value += 1n) {
    const nonce = Buffer.alloc(8);
    nonce.writeBigUInt64LE(value);
    if (referencePredicate(payerCore, scope, nonce)) return nonce;
  }
  throw new Error('bounded public candidate search failed');
}

function responseFrame(type, payload = Buffer.alloc(0)) {
  const frame = Buffer.alloc(7 + payload.length);
  RESPONSE_MAGIC.copy(frame, 0);
  frame[4] = PROTOCOL_VERSION;
  frame[5] = type;
  frame[6] = payload.length;
  payload.copy(frame, 7);
  return frame;
}

function successFrames(candidate) {
  return [
    responseFrame(FRAME_READY),
    responseFrame(FRAME_WRAPPER_INVOKED),
    responseFrame(FRAME_SUCCESS, candidate),
  ];
}

function streamClose(stream) {
  if (stream.closed === true) return Promise.resolve();
  return new Promise(resolve => stream.once('close', resolve));
}

function fakeChild({ autoCloseOnKill = true, killResult = true } = {}) {
  const child = new EventEmitter();
  const requestChunks = [];
  const response = new PassThrough();
  let processClosed = false;
  let processFinished = false;
  let closeCode;
  let closeSignal;
  let closeCount = 0;

  const request = new Writable({
    write(chunk, _encoding, callback) {
      requestChunks.push(Buffer.from(chunk));
      callback();
    },
  });

  child.exitCode = null;
  child.signalCode = null;
  child.killed = false;
  child.killSignals = [];
  child.stdio = [null, null, null, request, response];
  child.requestBytes = () => Buffer.concat(requestChunks);
  child.processClosed = () => processClosed;
  child.closeCount = () => closeCount;

  child.emitProcessClose = async function emitProcessClose() {
    await Promise.all([streamClose(request), streamClose(response)]);
    if (processClosed) return;
    processClosed = true;
    closeCount += 1;
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
    if (autoCloseOnKill && killResult) child.finishProcess(null, signal);
    return killResult;
  };

  child.forceClose = async function forceClose() {
    if (!processFinished) {
      child.finishProcess(null, 'SIGKILL', { emitClose: false });
    }
    if (!request.destroyed) request.destroy();
    if (!response.destroyed) response.destroy();
    await child.emitProcessClose();
  };

  allFakeChildren.add(child);
  return child;
}

function configureSpawn(children) {
  const capture = { calls: 0, returned: [] };
  let index = 0;
  spawnImplementation = () => {
    capture.calls += 1;
    const child = children[index];
    index += 1;
    if (child === undefined) throw new Error('unexpected extra mocked spawn');
    capture.returned.push(child);
    return child;
  };
  return capture;
}

function tracked(promise) {
  const observation = { state: 'PENDING', completion: null };
  observation.completion = promise.then(
    value => {
      observation.state = 'RESOLVED';
      return { kind: 'RESOLVED', value };
    },
    error => {
      observation.state = 'REJECTED';
      return { kind: 'REJECTED', error };
    },
  );
  return observation;
}

function assertSuccess(outcome, expectedScope, expectedCandidate) {
  assert.equal(outcome.kind, 'RESOLVED', 'mocked actor resolves successfully');
  const result = outcome.value;
  assert.equal(result.status, 'VALID');
  assert.equal(result.nonce === expectedCandidate.toString('hex'), true,
    'candidate stays actor-local');
  assert.equal(sameScope(result.recordedProofScope, expectedScope), true,
    'recorded scope stays actor-local');
  assert.deepEqual(result.lifecycle, EXPECTED_SUCCESS_LIFECYCLE);
  assert.deepEqual(result.trust, EXPECTED_TRUST);
  assertDeepFrozen(result);
  return result;
}

function assertUnknown(outcome, expectedTermination) {
  assert.equal(outcome.kind, 'REJECTED', 'faulted actor rejects');
  const error = outcome.error;
  assert.equal(error?.message, FIXED_ERROR_MESSAGE);
  assert.equal(error?.code, OUTCOME_UNKNOWN);
  assert.equal(error?.stack, undefined);
  assert.equal(error?.lifecycle?.status, 'OUTCOME_UNKNOWN');
  assert.equal(error?.lifecycle?.attemptCount, 1);
  assert.equal(error?.lifecycle?.wrapperInvocation, 'NOT_OBSERVED_OR_UNKNOWN');
  assert.equal(error?.lifecycle?.nativeOrWasmEntry, 'NOT_ESTABLISHED');
  assert.equal(error?.lifecycle?.terminal, 'NOT_OBSERVED_OR_UNKNOWN');
  assert.equal(error?.lifecycle?.processClose, 'OBSERVED');
  assert.equal(error?.lifecycle?.stdioClose, 'OBSERVED');
  assert.equal(error?.lifecycle?.termination, expectedTermination);
  assert.equal(error?.lifecycle?.retry, 'NOT_PERFORMED');
  assertDeepFrozen(error);
}

function sameScope(left, right) {
  return left.payer === right.payer &&
    left.previousAccountHash === right.previousAccountHash &&
    left.difficulty === right.difficulty;
}

function exactRequest(frame, payerCore, scope) {
  if (!Buffer.isBuffer(frame) || frame.length !== 65) return false;
  return frame.subarray(0, 4).equals(REQUEST_MAGIC) &&
    frame[4] === PROTOCOL_VERSION &&
    frame.subarray(5, 25).equals(payerCore) &&
    frame.subarray(25, 57).equals(Buffer.from(scope.previousAccountHash, 'hex')) &&
    frame.readBigUInt64BE(57) === BigInt(scope.difficulty);
}

function interleaveFrames(childA, framesA, childB, framesB) {
  for (let index = 0; index < framesA.length; index += 1) {
    const frameA = framesA[index];
    const frameB = framesB[index];
    const cutA = Math.max(1, Math.floor(frameA.length / 2));
    const cutB = Math.max(1, Math.floor(frameB.length / 2));
    childA.stdio[4].write(frameA.subarray(0, cutA));
    childB.stdio[4].write(frameB.subarray(0, cutB));
    childB.stdio[4].write(frameB.subarray(cutB));
    childA.stdio[4].write(frameA.subarray(cutA));
  }
}

function assertDeepFrozen(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true, 'returned graph is deeply frozen');
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (Object.hasOwn(descriptor, 'value')) assertDeepFrozen(descriptor.value, seen);
  }
}

function flush() {
  return new Promise(resolve => setImmediate(resolve));
}

function serialTest(name, body) {
  test(name, { concurrency: false }, body);
}

serialTest(
  'mocked transport isolates two interleaved owners without global admission claims',
  async () => {
    const childA = fakeChild();
    const childB = fakeChild();
    const capture = configureSpawn([childA, childB]);
    const inputA = { ...SCOPE_A };
    const inputB = { ...SCOPE_B };
    const originalA = { ...inputA };
    const originalB = { ...inputB };
    const actorA = tracked(produceOfflineZenonNonce(inputA));
    const actorB = tracked(produceOfflineZenonNonce(inputB));

    inputA.payer = payerFromCore(MUTATED_PAYER_CORE);
    inputA.previousAccountHash = MUTATED_PREVIOUS_HASH;
    inputA.difficulty = 3;
    inputB.payer = payerFromCore(MUTATED_PAYER_CORE);
    inputB.previousAccountHash = MUTATED_PREVIOUS_HASH;
    inputB.difficulty = 3;
    await flush();

    assert.equal(capture.calls, 2);
    assert.equal(childA !== childB, true, 'owned child identities are isolated');
    assert.equal(childA.stdio[3] !== childB.stdio[3], true,
      'private request streams are isolated');
    assert.equal(childA.stdio[4] !== childB.stdio[4], true,
      'private response streams are isolated');
    assert.equal(exactRequest(childA.requestBytes(), PAYER_CORE_A, originalA), true,
      'actor A retains its exact original request frame');
    assert.equal(exactRequest(childB.requestBytes(), PAYER_CORE_B, originalB), true,
      'actor B retains its exact original request frame');
    assert.equal(referencePredicate(PAYER_CORE_A, originalA, CANDIDATE_A), true,
      'actor A candidate passes its independently computed predicate');
    assert.equal(referencePredicate(PAYER_CORE_B, originalB, CANDIDATE_B), true,
      'actor B candidate passes its independently computed predicate');
    assert.equal(CANDIDATE_A.equals(CANDIDATE_B), false,
      'actor candidates remain distinct');

    interleaveFrames(
      childA,
      successFrames(CANDIDATE_A),
      childB,
      successFrames(CANDIDATE_B),
    );
    childB.finishProcess();
    const outcomeB = await actorB.completion;

    assertSuccess(outcomeB, originalB, CANDIDATE_B);
    assert.equal(actorA.state, 'PENDING', 'actor A remains pending on its own close');
    assert.equal(childA.closeCount(), 0, 'actor A process close remains withheld');
    assert.equal(childA.stdio[4].closed, false,
      'actor A response closure remains withheld');
    assert.equal(childB.closeCount(), 1, 'actor B closes independently');
    assert.equal(childA.killSignals.length, 0);
    assert.equal(childB.killSignals.length, 0);

    childA.finishProcess();
    const outcomeA = await actorA.completion;
    assertSuccess(outcomeA, originalA, CANDIDATE_A);
    assert.equal(childA.closeCount(), 1, 'actor A closes exactly once');
    assert.equal(capture.calls, 2, 'neither actor retries');
  },
);

serialTest(
  'one incomplete mocked IPC fault terminates only its owned actor and preserves peers',
  async () => {
    const childA = fakeChild({ autoCloseOnKill: false });
    const childB = fakeChild();
    const decoy = fakeChild();
    const capture = configureSpawn([childA, childB]);
    const actorA = tracked(produceOfflineZenonNonce({ ...SCOPE_A }));
    const actorB = tracked(produceOfflineZenonNonce({ ...SCOPE_B }));
    await flush();

    const incomplete = responseFrame(FRAME_READY).subarray(0, 5);
    childA.stdio[4].write(incomplete);
    childA.stdio[4].destroy(new Error('controlled mocked response fault'));
    await flush();

    assert.equal(actorA.state, 'PENDING', 'faulted actor awaits its own close');
    assert.deepEqual(childA.killSignals, ['SIGKILL']);
    assert.equal(childB.killSignals.length, 0, 'peer actor is not terminated');
    assert.equal(decoy.killSignals.length, 0, 'unowned decoy is not terminated');
    assert.equal(childB.processClosed(), false, 'peer remains independently owned');
    assert.equal(decoy.processClosed(), false, 'decoy remains untouched');

    for (const frame of successFrames(CANDIDATE_B)) childB.stdio[4].write(frame);
    childB.finishProcess();
    const outcomeB = await actorB.completion;
    assertSuccess(outcomeB, SCOPE_B, CANDIDATE_B);
    assert.equal(actorA.state, 'PENDING', 'peer completion cannot settle actor A');

    childA.finishProcess(null, 'SIGKILL');
    const outcomeA = await actorA.completion;
    assertUnknown(outcomeA, 'REQUESTED');
    assert.equal(childA.closeCount(), 1, 'faulted actor closes exactly once');
    assert.equal(childB.closeCount(), 1, 'successful peer closes exactly once');
    assert.equal(capture.calls, 2, 'faulted and successful actors do not retry');

    await decoy.forceClose();
  },
);

serialTest(
  'an unacknowledged owned kill remains pending while an isolated peer progresses',
  async () => {
    const childA = fakeChild({ autoCloseOnKill: false, killResult: false });
    const childB = fakeChild();
    const capture = configureSpawn([childA, childB]);
    const actorA = tracked(produceOfflineZenonNonce({ ...SCOPE_A }));
    const actorB = tracked(produceOfflineZenonNonce({ ...SCOPE_B }));
    await flush();

    childA.stdio[4].write(Buffer.alloc(30));
    await flush();
    assert.deepEqual(childA.killSignals, ['SIGKILL']);
    assert.equal(actorA.state, 'PENDING',
      'unacknowledged termination cannot settle before owned close');
    assert.equal(childA.closeCount(), 0);

    for (const frame of successFrames(CANDIDATE_B)) childB.stdio[4].write(frame);
    childB.finishProcess();
    const outcomeB = await actorB.completion;
    assertSuccess(outcomeB, SCOPE_B, CANDIDATE_B);
    assert.equal(actorA.state, 'PENDING', 'peer progress does not release actor A');
    assert.equal(childB.killSignals.length, 0);

    childA.finishProcess(null, 'SIGKILL');
    const outcomeA = await actorA.completion;
    assertUnknown(outcomeA, 'FAILED');
    assert.equal(childA.closeCount(), 1);
    assert.equal(childB.closeCount(), 1);
    assert.equal(capture.calls, 2, 'no actor retries');
  },
);
