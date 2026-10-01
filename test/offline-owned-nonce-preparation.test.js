import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import test, { after, mock } from 'node:test';

const REQUEST_MAGIC = Buffer.from('ZNI1', 'ascii');
const RESPONSE_MAGIC = Buffer.from('ZNO1', 'ascii');
const PROTOCOL_VERSION = 1;
const FRAME_READY = 1;
const FRAME_WRAPPER_INVOKED = 2;
const FRAME_SUCCESS = 3;
const PLACEHOLDER_NONCE = '0'.repeat(16);
const POW_RANGE = 1n << 64n;
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32_GENERATORS = Object.freeze([
  0x3b6a57b2,
  0x26508e6d,
  0x1ea119fa,
  0x3d4233dd,
  0x2a1462b3,
]);
const CONNECTOR_MESSAGE = 'Offline owned nonce preparation rejected';
const INPUT_REJECTED = 'OFFLINE_OWNED_NONCE_PREPARATION_INPUT_REJECTED';
const OWNER_MESSAGE = 'Offline Zenon nonce production rejected';
const OWNER_UNKNOWN = 'OFFLINE_ZENON_NONCE_PRODUCER_OUTCOME_UNKNOWN';
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
const OBJECT_DEFINE_PROPERTY = Object.defineProperty;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const OBJECT_PROTOTYPE = Object.prototype;
const PROMISE_THEN = Promise.prototype.then;
const REFLECT_APPLY = Reflect.apply;
const REFLECT_DELETE_PROPERTY = Reflect.deleteProperty;

const allFakeChildren = new Set();
const candidateBuffers = new Set();
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
    for (const candidate of candidateBuffers) candidate.fill(0);
    spawnMock.mock.restore();
  }
  assert.equal(cleanupComplete, true, 'all test-owned fake resources are closed');
});

const connectorUrl = new URL(
  '../src/zenon/internal/offline-owned-nonce-preparation.js',
  import.meta.url,
);
connectorUrl.searchParams.set('mocked-owned-preparation', '1');
const connectorModule = await import(connectorUrl.href);
const { produceOfflineUnsignedPreparation } = connectorModule;

function serialTest(name, body) {
  test(name, { concurrency: false }, body);
}

function restoreObjectPrototypeThen(descriptor) {
  if (descriptor === undefined) {
    REFLECT_APPLY(REFLECT_DELETE_PROPERTY, Reflect, [OBJECT_PROTOTYPE, 'then']);
    return;
  }
  REFLECT_APPLY(OBJECT_DEFINE_PROPERTY, Object, [
    OBJECT_PROTOTYPE,
    'then',
    descriptor,
  ]);
}

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

function bech32FromBytes(prefix, bytes) {
  const words = fiveBitWords(bytes);
  const prefixExpansion = [
    ...[...prefix].map(character => character.charCodeAt(0) >>> 5),
    0,
    ...[...prefix].map(character => character.charCodeAt(0) & 31),
  ];
  const checksumValue = polymod([
    ...prefixExpansion,
    ...words,
    0, 0, 0, 0, 0, 0,
  ]) ^ 1;
  const checksum = Array.from(
    { length: 6 },
    (_, index) => (checksumValue >>> (5 * (5 - index))) & 31,
  );
  return `${prefix}1${[...words, ...checksum]
    .map(value => BECH32_CHARSET[value])
    .join('')}`;
}

function identity(publicKeyByte = 0x11) {
  const publicKey = Buffer.alloc(32, publicKeyByte);
  const payerCore = Buffer.concat([
    Buffer.alloc(1),
    sha3(publicKey).subarray(0, 19),
  ]);
  return {
    address: bech32FromBytes('z', payerCore),
    payerCore,
    publicKey: publicKey.toString('base64'),
  };
}

function traceFixture({
  mode = 'PRE_DP',
  work = true,
  nonce = PLACEHOLDER_NONCE,
  label = 'owned-preparation',
} = {}) {
  const payer = identity();
  const recipient = identity(0x22).address;
  const data = sha3(Buffer.from(`${label}-data`)).toString('base64');
  const accountHash = sha3(Buffer.from(`${label}-account`)).toString('hex');
  const momentumHash = sha3(Buffer.from(`${label}-momentum`)).toString('hex');
  const dynamic = mode === 'DP_ACTIVE';
  const difficulty = work ? (dynamic ? 3000 : 2) : 0;
  const fusedPlasma = work ? 0 : (dynamic ? 2 : 1);
  const manifest = {
    payer: payer.address,
    publicKey: payer.publicKey,
    intent: {
      toAddress: recipient,
      amount: '42',
      tokenStandard: bech32FromBytes('zts', Buffer.alloc(10, 1)),
      data,
    },
    context: {
      chainIdentifier: 1,
      networkIdentifier: `${label}-network`,
      profileIdentifier: `${label}-profile`,
      epochIdentifier: `${label}-epoch`,
    },
    trustLabel: 'synthetic-recorded',
  };
  const account = { address: payer.address, height: 7, hash: accountHash };
  const momentum = dynamic
    ? {
        chainIdentifier: 1,
        height: 42,
        hash: momentumHash,
        version: 2,
        nextFusionPrice: 1200,
        nextWorkPrice: 1100,
      }
    : {
        chainIdentifier: 1,
        height: 42,
        hash: momentumHash,
        version: 1,
      };
  const trace = {
    phase: 'UNSIGNED',
    expectedManifest: manifest,
    capturedTrace: {
      manifest: structuredClone(manifest),
      quoteRequest: {
        address: payer.address,
        blockType: 2,
        toAddress: recipient,
        data,
      },
      accountFrontierBefore: account,
      accountFrontierAfter: { ...account },
      momentumBefore: momentum,
      rpcObservation: {
        availablePlasma: fusedPlasma,
        basePlasma: 1,
        requiredDifficulty: difficulty,
      },
      momentumAfter: { ...momentum },
      nonceRecord: work
        ? {
            nonce,
            payer: payer.address,
            previousAccountHash: accountHash,
            difficulty,
          }
        : null,
    },
  };
  return {
    trace,
    payerCore: payer.payerCore,
    previousAccountHash: accountHash,
    difficulty,
    fusedPlasma,
    classification: mode,
    originalAmount: manifest.intent.amount,
    originalNetwork: manifest.context.networkIdentifier,
  };
}

function referencePredicate(fixture, nonce) {
  const domain = sha3(Buffer.concat([
    fixture.payerCore,
    Buffer.from(fixture.previousAccountHash, 'hex'),
  ]));
  const work = sha3(Buffer.concat([nonce, domain]));
  const observed = work.readBigUInt64LE(0);
  const threshold = POW_RANGE - (POW_RANGE / BigInt(fixture.difficulty));
  return observed >= threshold;
}

function candidateFor(fixture) {
  for (let value = 0n; value < 1_000_000n; value += 1n) {
    const candidate = Buffer.alloc(8);
    candidate.writeBigUInt64LE(value);
    if (referencePredicate(fixture, candidate)) {
      candidateBuffers.add(candidate);
      return candidate;
    }
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

function successfulFrames(candidate) {
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

function fakeChild(onRequest) {
  const child = new EventEmitter();
  const requestChunks = [];
  const response = new PassThrough();
  let processClosed = false;
  let processFinished = false;
  let closeCode;
  let closeSignal;

  const request = new Writable({
    write(chunk, _encoding, callback) {
      requestChunks.push(Buffer.from(chunk));
      callback();
    },
    final(callback) {
      callback();
      queueMicrotask(() => onRequest(child, Buffer.concat(requestChunks)));
    },
  });

  child.exitCode = null;
  child.signalCode = null;
  child.killed = false;
  child.killSignals = [];
  child.stdio = [null, null, null, request, response];
  child.requestBytes = () => Buffer.concat(requestChunks);
  child.processClosed = () => processClosed;

  child.emitProcessClose = async function emitProcessClose() {
    await Promise.all([streamClose(request), streamClose(response)]);
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
    child.finishProcess(null, signal);
    return true;
  };

  child.forceClose = async function forceClose() {
    if (!processFinished) {
      child.finishProcess(null, 'SIGKILL', { emitClose: false });
    }
    if (!request.destroyed) request.destroy();
    if (!response.destroyed) response.destroy();
    await child.emitProcessClose();
    for (const chunk of requestChunks) chunk.fill(0);
  };

  allFakeChildren.add(child);
  return child;
}

function writeFrames(child, frames) {
  for (const frame of frames) child.stdio[4].write(frame);
}

function configuredAttempt(onRequest) {
  const capture = { calls: 0, child: null };
  spawnImplementation = function spawnScenario() {
    capture.calls += 1;
    if (capture.calls > 1) throw new Error('unexpected retry');
    capture.child = fakeChild(onRequest);
    return capture.child;
  };
  return capture;
}

function requestMatchesFixture(child, fixture) {
  const request = child.requestBytes();
  const previous = Buffer.from(fixture.previousAccountHash, 'hex');
  const matches = request.length === 65 &&
    request.subarray(0, 4).equals(REQUEST_MAGIC) &&
    request[4] === PROTOCOL_VERSION &&
    request.subarray(5, 25).equals(fixture.payerCore) &&
    request.subarray(25, 57).equals(previous) &&
    request.readBigUInt64BE(57) === BigInt(fixture.difficulty);
  request.fill(0);
  previous.fill(0);
  return matches;
}

async function capturedRejection(promise) {
  let observed;
  try {
    await promise;
  } catch (error) {
    observed = error;
  }
  assert.equal(observed instanceof Error, true, 'a fixed rejection is observed');
  return observed;
}

async function assertInputRejected(promise) {
  const error = await capturedRejection(promise);
  assert.equal(error instanceof TypeError, true);
  assert.equal(error.message, CONNECTOR_MESSAGE);
  assert.equal(error.code, INPUT_REJECTED);
  assert.equal(error.stack, undefined);
}

function assertDeepFrozen(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true, 'the result graph is deeply frozen');
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

function sameScope(left, fixture) {
  return left.payer === fixture.trace.expectedManifest.payer &&
    left.previousAccountHash === fixture.previousAccountHash &&
    left.difficulty === fixture.difficulty;
}

function assertNoAuthorityClaims(value) {
  for (const field of [
    'signer', 'wallet', 'rpc', 'runtime', 'capability', 'authorization',
    'freshness', 'replayProtected', 'chainIdentity', 'publish', 'submit',
    'livePayment', 'dynamicPlasmaActivation', 'chainThroughput',
    'sharedSdkSessionParallelism', 'admissionControl', 'payerLock',
    'pricingFreshness',
  ]) {
    assert.equal(field in value, false, `${field} claim remains absent`);
  }
}

function assertSuccessfulResult(result, fixture) {
  assert.deepEqual(Object.keys(result), [
    'qualification', 'composition', 'producerEvidence',
  ]);
  assert.equal(result.qualification, 'OFFLINE_OWNED_PREPARATION_ONLY');
  assert.equal(result.producerEvidence.status, 'VALID');
  assert.equal(sameScope(result.producerEvidence.recordedProofScope, fixture), true,
    'producer evidence retains the original prepared scope');
  assert.deepEqual(result.producerEvidence.lifecycle, EXPECTED_SUCCESS_LIFECYCLE);
  assert.deepEqual(result.producerEvidence.trust, EXPECTED_TRUST);
  assert.equal(result.composition.preparation.classification,
    fixture.classification);
  assert.equal(result.composition.preparation.block.difficulty,
    fixture.difficulty);
  assert.equal(result.composition.preparation.block.fusedPlasma,
    fixture.fusedPlasma);
  assert.equal(result.composition.preparation.block.signature, '');
  assert.equal(result.composition.nonceProof.status, 'VALID');
  assert.equal(sameScope(
    result.composition.nonceProof.recordedProofScope,
    fixture,
  ), true, 'composed proof retains the original prepared scope');
  assert.deepEqual(result.composition.trust, EXPECTED_TRUST);
  assert.deepEqual(result.composition.nonceProof.trust, EXPECTED_TRUST);
  assert.equal(containsFunction(result), false, 'the wrapper is data-only');
  assertNoAuthorityClaims(result);
  assertNoAuthorityClaims(result.composition);
  assertDeepFrozen(result);
}

serialTest('preflight rejects malformed or pre-supplied work before any owner delegate',
  async () => {
    assert.deepEqual(Object.keys(connectorModule), [
      'produceOfflineUnsignedPreparation',
    ]);
    let spawnCalls = 0;
    spawnImplementation = () => {
      spawnCalls += 1;
      throw new Error('preflight must not delegate');
    };

    const extra = traceFixture({ work: false }).trace;
    extra.extra = true;

    let accessorReads = 0;
    const accessor = traceFixture({ work: false }).trace;
    Object.defineProperty(accessor.expectedManifest.intent, 'amount', {
      enumerable: true,
      get() {
        accessorReads += 1;
        return '42';
      },
    });

    let proxyTraps = 0;
    const proxy = new Proxy(traceFixture({ work: false }).trace, {
      get() { proxyTraps += 1; return undefined; },
      getOwnPropertyDescriptor() { proxyTraps += 1; return undefined; },
      getPrototypeOf() { proxyTraps += 1; return Object.prototype; },
      ownKeys() { proxyTraps += 1; return []; },
    });

    const alias = traceFixture({ work: false }).trace;
    alias.capturedTrace.manifest.intent = alias.expectedManifest.intent;

    const manifestMismatch = traceFixture({ work: false }).trace;
    manifestMismatch.capturedTrace.manifest.intent.amount = '43';

    const frontierMismatch = traceFixture({ work: false }).trace;
    frontierMismatch.capturedTrace.accountFrontierAfter.height += 1;

    const quoteMismatch = traceFixture({ mode: 'DP_ACTIVE', work: false }).trace;
    quoteMismatch.capturedTrace.rpcObservation.requiredDifficulty = 1;

    const suppliedProof = traceFixture({ work: true }).trace;
    const nonPlaceholder = Buffer.alloc(8);
    nonPlaceholder.writeBigUInt64LE(1n);
    suppliedProof.capturedTrace.nonceRecord.nonce = nonPlaceholder.toString('hex');
    nonPlaceholder.fill(0);

    const invocations = [
      () => produceOfflineUnsignedPreparation(),
      () => produceOfflineUnsignedPreparation(
        traceFixture({ work: false }).trace,
        undefined,
      ),
      () => produceOfflineUnsignedPreparation(extra),
      () => produceOfflineUnsignedPreparation(accessor),
      () => produceOfflineUnsignedPreparation(proxy),
      () => produceOfflineUnsignedPreparation(alias),
      () => produceOfflineUnsignedPreparation(manifestMismatch),
      () => produceOfflineUnsignedPreparation(frontierMismatch),
      () => produceOfflineUnsignedPreparation(quoteMismatch),
      () => produceOfflineUnsignedPreparation(suppliedProof),
    ];
    for (const invoke of invocations) await assertInputRejected(invoke());

    assert.equal(accessorReads, 0, 'the rejected accessor is never evaluated');
    assert.equal(proxyTraps, 0, 'the rejected proxy executes no traps');
    assert.equal(spawnCalls, 0, 'preflight rejection starts no owner attempt');
  });

serialTest('fully fused PRE_DP and DP_ACTIVE traces remain pure zero-work compositions',
  async () => {
    let spawnCalls = 0;
    spawnImplementation = () => {
      spawnCalls += 1;
      throw new Error('zero work must not delegate');
    };

    for (const fixture of [
      traceFixture({ mode: 'PRE_DP', work: false, label: 'zero-pre' }),
      traceFixture({ mode: 'DP_ACTIVE', work: false, label: 'zero-dp' }),
    ]) {
      const result = await produceOfflineUnsignedPreparation(fixture.trace);
      assert.equal(result.qualification, 'OFFLINE_OWNED_PREPARATION_ONLY');
      assert.equal(result.producerEvidence, null);
      assert.equal(result.composition.preparation.classification,
        fixture.classification);
      assert.equal(result.composition.preparation.block.difficulty, 0);
      assert.equal(result.composition.preparation.block.fusedPlasma,
        fixture.fusedPlasma);
      assert.equal(result.composition.preparation.block.signature, '');
      assert.equal(result.composition.nonceProof.status, 'NOT_REQUIRED');
      assert.deepEqual(result.composition.trust, EXPECTED_TRUST);
      assert.deepEqual(result.composition.nonceProof.trust, EXPECTED_TRUST);
      assert.equal(containsFunction(result), false, 'the zero-work result is data-only');
      assertNoAuthorityClaims(result);
      assertNoAuthorityClaims(result.composition);
      assertDeepFrozen(result);
    }
    assert.equal(spawnCalls, 0, 'zero-work composition starts no owner attempt');
  });

serialTest('rejects inherited callable then before the zero-work async return', async () => {
  const priorThen = REFLECT_APPLY(
    GET_OWN_PROPERTY_DESCRIPTOR,
    Object,
    [OBJECT_PROTOTYPE, 'then'],
  );
  let callableCalls = 0;
  let spawnCalls = 0;
  let outcome;
  spawnImplementation = () => {
    spawnCalls += 1;
    throw new Error('zero work must not delegate');
  };

  try {
    REFLECT_APPLY(OBJECT_DEFINE_PROPERTY, Object, [
      OBJECT_PROTOTYPE,
      'then',
      {
        configurable: true,
        value(resolve) {
          callableCalls += 1;
          resolve('SUBSTITUTED');
        },
        writable: true,
      },
    ]);
    const operation = produceOfflineUnsignedPreparation(
      traceFixture({ mode: 'PRE_DP', work: false, label: 'then-zero' }).trace,
    );
    const settlement = REFLECT_APPLY(PROMISE_THEN, operation, [
      value => {
        outcome = { kind: 'FULFILLED', value };
        return 'FULFILLED';
      },
      error => {
        outcome = { error, kind: 'REJECTED' };
        return 'REJECTED';
      },
    ]);
    await settlement;
  } finally {
    restoreObjectPrototypeThen(priorThen);
  }

  assert.equal(callableCalls, 0, 'the inherited callable is never invoked');
  assert.equal(outcome.kind, 'REJECTED');
  assert.equal(outcome.error.message, CONNECTOR_MESSAGE);
  assert.equal(outcome.error.code, INPUT_REJECTED);
  assert.equal(outcome.error.stack, undefined);
  assert.equal(spawnCalls, 0, 'zero-work rejection starts no owner attempt');
});

serialTest('modeled owner success binds one PRE_DP and one higher-priced DP_ACTIVE scope',
  async () => {
    for (const fixture of [
      traceFixture({ mode: 'PRE_DP', work: true, label: 'work-pre' }),
      traceFixture({ mode: 'DP_ACTIVE', work: true, label: 'work-dp' }),
    ]) {
      const candidate = candidateFor(fixture);
      const capture = configuredAttempt(child => {
        writeFrames(child, successfulFrames(candidate));
        child.finishProcess();
      });

      const result = await produceOfflineUnsignedPreparation(fixture.trace);

      assert.equal(capture.calls, 1, 'one owner child is delegated');
      assert.equal(capture.child.processClosed(), true,
        'the owned fake process closes before settlement');
      assert.equal(capture.child.stdio[3].closed, true,
        'the private request stream closes before settlement');
      assert.equal(capture.child.stdio[4].closed, true,
        'the private response stream closes before settlement');
      assert.equal(requestMatchesFixture(capture.child, fixture), true,
        'the owner request contains the original prepared scope');
      assert.equal(referencePredicate(fixture, candidate), true,
        'the modeled candidate satisfies the independent predicate');
      assertSuccessfulResult(result, fixture);
      if (fixture.classification === 'DP_ACTIVE') {
        assert.equal(
          fixture.trace.capturedTrace.momentumBefore.nextFusionPrice > 1000 &&
            fixture.trace.capturedTrace.momentumBefore.nextWorkPrice > 1000,
          true,
          'the recorded DP_ACTIVE prices are elevated',
        );
      }
    }
  });

serialTest('caller mutation and a complete frame cannot bypass owned closure',
  async () => {
    const fixture = traceFixture({ work: true, label: 'pending-snapshot' });
    const candidate = candidateFor(fixture);
    const original = Object.freeze({
      amount: fixture.originalAmount,
      network: fixture.originalNetwork,
      previousAccountHash: fixture.previousAccountHash,
    });
    const capture = configuredAttempt(child => {
      writeFrames(child, successfulFrames(candidate));
    });

    const operation = produceOfflineUnsignedPreparation(fixture.trace);
    let settlement = 'PENDING';
    const observed = operation.then(
      value => { settlement = 'RESOLVED'; return { kind: 'RESOLVED', value }; },
      error => { settlement = 'REJECTED'; return { kind: 'REJECTED', error }; },
    );

    fixture.trace.expectedManifest.intent.amount = '84';
    fixture.trace.capturedTrace.manifest.intent.amount = '84';
    fixture.trace.expectedManifest.context.networkIdentifier = 'mutated-network';
    fixture.trace.capturedTrace.manifest.context.networkIdentifier =
      'mutated-network';
    const changedHash = sha3(Buffer.from('mutated-account')).toString('hex');
    fixture.trace.capturedTrace.accountFrontierBefore.hash = changedHash;
    fixture.trace.capturedTrace.accountFrontierAfter.hash = changedHash;
    fixture.trace.capturedTrace.nonceRecord.previousAccountHash = changedHash;
    fixture.trace.capturedTrace.rpcObservation.requiredDifficulty = 3;
    fixture.trace.capturedTrace.nonceRecord.difficulty = 3;

    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settlement, 'PENDING',
      'a terminal frame alone does not settle the connector');
    assert.equal(capture.child.processClosed(), false,
      'the owned process close is still withheld');

    capture.child.finishProcess();
    const outcome = await observed;

    assert.equal(settlement, 'RESOLVED');
    assert.equal(outcome.kind, 'RESOLVED',
      'owned closure permits the successful result to settle');
    const result = outcome.value;
    assert.equal(capture.calls, 1, 'caller mutation causes no retry');
    assert.equal(requestMatchesFixture(capture.child, {
      ...fixture,
      previousAccountHash: original.previousAccountHash,
      difficulty: 2,
    }), true, 'the request retains the detached original scope');
    assert.equal(
      result.composition.preparation.block.amount === original.amount,
      true,
      'the original intent is retained',
    );
    assert.equal(
      result.composition.recordedContext.networkIdentifier === original.network,
      true,
      'the original context is retained',
    );
    assert.equal(
      result.composition.preparation.block.previousHash ===
        original.previousAccountHash,
      true,
      'the original account scope is retained',
    );
    assert.equal(result.composition.preparation.block.difficulty, 2,
      'the original selected difficulty is retained');
    assert.equal(result.composition.preparation.block.fusedPlasma, 0,
      'the original selected fused plasma is retained');
    assert.equal(result.producerEvidence.lifecycle.processClose, 'OBSERVED');
    assert.equal(result.producerEvidence.lifecycle.stdioClose, 'OBSERVED');
    assertDeepFrozen(result);
  });

serialTest('owner uncertainty propagates unchanged and is never retried', async () => {
  const fixture = traceFixture({ work: true, label: 'unknown-owner' });
  const capture = configuredAttempt(child => {
    child.stdio[4].write(responseFrame(FRAME_READY));
    child.finishProcess();
  });

  const error = await capturedRejection(
    produceOfflineUnsignedPreparation(fixture.trace),
  );

  assert.equal(error.message, OWNER_MESSAGE);
  assert.equal(error.code, OWNER_UNKNOWN);
  assert.equal(error.stack, undefined);
  assert.equal(error.lifecycle.status, 'OUTCOME_UNKNOWN');
  assert.equal(error.lifecycle.attemptCount, 1);
  assert.equal(error.lifecycle.ready, 'OBSERVED');
  assert.equal(error.lifecycle.wrapperInvocation, 'NOT_OBSERVED_OR_UNKNOWN');
  assert.equal(error.lifecycle.nativeOrWasmEntry, 'NOT_ESTABLISHED');
  assert.equal(error.lifecycle.terminal, 'NOT_OBSERVED_OR_UNKNOWN');
  assert.equal(error.lifecycle.processClose, 'OBSERVED');
  assert.equal(error.lifecycle.stdioClose, 'OBSERVED');
  assert.equal(error.lifecycle.retry, 'NOT_PERFORMED');
  assert.equal(capture.calls, 1, 'uncertainty is not retried');
  assert.equal(capture.child.processClosed(), true,
    'the owned fake process closes before rejection');
});
