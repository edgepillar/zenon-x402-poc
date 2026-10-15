import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import test, { after, mock } from 'node:test';

import { composeOfflinePreparationTrace } from
  '../src/zenon/internal/offline-observation-to-preparation-contract.js';
import { composeOfflinePreparationWithNonceProof } from
  '../src/zenon/internal/offline-preparation-nonce-contract.js';
import { prepareUnsignedZenonPaymentBlock } from
  '../src/zenon/internal/pre-sign-account-block-preparation.js';

const REJECTION_CODE = 'offline_preparation_nonce_contract_rejected';
const PLACEHOLDER_NONCE = '0'.repeat(16);
const POW_RANGE = 1n << 64n;
const RESPONSE_MAGIC = Buffer.from('ZNO1', 'ascii');
const PROTOCOL_VERSION = 1;
const FRAME_READY = 1;
const FRAME_WRAPPER_INVOKED = 2;
const FRAME_SUCCESS = 3;
const RESPONSE_MAXIMUM_BYTES = 29;
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32_GENERATORS = Object.freeze([
  0x3b6a57b2,
  0x26508e6d,
  0x1ea119fa,
  0x3d4233dd,
  0x2a1462b3,
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

const ORIGINAL_SPAWN = childProcess.spawn;
const childObservations = [];
let delegatedSpawnCount = 0;
let producerInvocationCount = 0;

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

function addressIdentity(publicKey) {
  const core = Buffer.concat([
    Buffer.alloc(1),
    sha3(publicKey).subarray(0, 19),
  ]);
  return { address: bech32FromBytes('z', core), core };
}

function streamCloseObservation(stream, markClosed) {
  if (stream?.closed === true) {
    markClosed();
    return Promise.resolve();
  }
  if (stream === null || typeof stream !== 'object' ||
      typeof stream.once !== 'function') return Promise.resolve();
  return new Promise(resolve => {
    stream.once('close', () => {
      markClosed();
      resolve();
    });
  });
}

function observeOwnedChild(child, ordinal) {
  const request = child.stdio?.[3];
  const response = child.stdio?.[4];
  const capture = Buffer.alloc(RESPONSE_MAXIMUM_BYTES);
  const state = {
    exitObserved: false,
    exitCode: undefined,
    exitSignal: undefined,
    processClosed: false,
    closeCode: undefined,
    closeSignal: undefined,
    requestPresent: request !== null && typeof request === 'object',
    requestClosed: false,
    responsePresent: response !== null && typeof response === 'object',
    responseClosed: false,
    responseStoredBytes: 0,
    responseOverflow: false,
    responseNonBuffer: false,
  };

  child.once('exit', (code, signal) => {
    state.exitObserved = true;
    state.exitCode = code;
    state.exitSignal = signal;
  });
  const processClose = new Promise(resolve => {
    child.once('close', (code, signal) => {
      state.processClosed = true;
      state.closeCode = code;
      state.closeSignal = signal;
      resolve();
    });
  });

  if (response !== null && typeof response === 'object' &&
      typeof response.on === 'function') {
    response.on('data', chunk => {
      if (!Buffer.isBuffer(chunk)) {
        state.responseNonBuffer = true;
        return;
      }
      const available = capture.length - state.responseStoredBytes;
      const copied = Math.min(available, chunk.length);
      if (copied > 0) {
        chunk.copy(capture, state.responseStoredBytes, 0, copied);
        state.responseStoredBytes += copied;
      }
      if (copied !== chunk.length) state.responseOverflow = true;
    });
  }

  const requestClose = streamCloseObservation(request, () => {
    state.requestClosed = true;
  });
  const responseClose = streamCloseObservation(response, () => {
    state.responseClosed = true;
  });

  return {
    ordinal,
    child,
    request,
    response,
    capture,
    state,
    closed: Promise.all([processClose, requestClose, responseClose]),
  };
}

const spawnSpy = mock.method(
  childProcess,
  'spawn',
  function observedSpawn(...args) {
    if (delegatedSpawnCount >= 2) {
      throw new Error('parallel qualification permits exactly two child delegates');
    }
    const ordinal = delegatedSpawnCount;
    delegatedSpawnCount += 1;
    const child = Reflect.apply(ORIGINAL_SPAWN, this, args);
    childObservations.push(observeOwnedChild(child, ordinal));
    return child;
  },
);

function cleanOwnedClosure(observation) {
  const { state } = observation;
  return state.exitObserved && state.exitCode === 0 &&
    state.exitSignal === null && state.processClosed &&
    state.closeCode === 0 && state.closeSignal === null &&
    state.requestPresent && state.requestClosed &&
    state.responsePresent && state.responseClosed;
}

function observedProtocolMatchesResult(observation, produced) {
  const { capture, state } = observation;
  if (state.responseNonBuffer || state.responseOverflow ||
      state.responseStoredBytes !== RESPONSE_MAXIMUM_BYTES ||
      !/^[0-9a-f]{16}$/.test(produced.nonce)) return false;

  const expectedFrames = [
    [FRAME_READY, 0],
    [FRAME_WRAPPER_INVOKED, 0],
    [FRAME_SUCCESS, 8],
  ];
  let offset = 0;
  let candidateMatches = false;
  for (const [expectedType, expectedLength] of expectedFrames) {
    if (offset + 7 + expectedLength > state.responseStoredBytes ||
        !capture.subarray(offset, offset + 4).equals(RESPONSE_MAGIC) ||
        capture[offset + 4] !== PROTOCOL_VERSION ||
        capture[offset + 5] !== expectedType ||
        capture[offset + 6] !== expectedLength) return false;
    if (expectedType === FRAME_SUCCESS) {
      const producedBytes = Buffer.from(produced.nonce, 'hex');
      candidateMatches = capture
        .subarray(offset + 7, offset + 7 + expectedLength)
        .equals(producedBytes);
      producedBytes.fill(0);
    }
    offset += 7 + expectedLength;
  }
  return offset === state.responseStoredBytes && candidateMatches;
}

after(async () => {
  let everyOwnedResourceClosed = false;
  try {
    await Promise.all(childObservations.map(observation => observation.closed));
    everyOwnedResourceClosed = childObservations.every(cleanOwnedClosure);
  } finally {
    for (const observation of childObservations) observation.capture.fill(0);
    spawnSpy.mock.restore();
  }
  assert.equal(childProcess.spawn === ORIGINAL_SPAWN, true,
    'the call-through spawn spy is restored');
  assert.equal(producerInvocationCount, 2,
    'the production API is invoked exactly twice');
  assert.equal(delegatedSpawnCount, 2,
    'exactly two owned children are delegated');
  assert.equal(everyOwnedResourceClosed, true,
    'both owned processes and private streams are closed');
});

const ownerUrl = new URL(
  '../src/zenon/internal/offline-pow-producer-owner.js',
  import.meta.url,
);
ownerUrl.searchParams.set('parallel-composition-evidence', '1');
const { produceOfflineZenonNonce } = await import(ownerUrl.href);

function preparedCase({
  label,
  payerByte,
  recipientByte,
  amount,
  accountHeight,
  momentumHeight,
}) {
  const payerPublicKey = Buffer.alloc(32, payerByte);
  const payerIdentity = addressIdentity(payerPublicKey);
  const recipient = addressIdentity(Buffer.alloc(32, recipientByte)).address;
  const data = sha3(Buffer.from(`${label}-data`)).toString('base64');
  const accountHash = sha3(Buffer.from(`${label}-account`)).toString('hex');
  const momentumHash = sha3(Buffer.from(`${label}-momentum`)).toString('hex');
  const manifest = {
    payer: payerIdentity.address,
    publicKey: payerPublicKey.toString('base64'),
    intent: {
      toAddress: recipient,
      amount,
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
  const account = {
    address: payerIdentity.address,
    height: accountHeight,
    hash: accountHash,
  };
  const momentum = {
    chainIdentifier: 1,
    height: momentumHeight,
    hash: momentumHash,
    version: 1,
  };
  const rawTrace = {
    phase: 'UNSIGNED',
    expectedManifest: manifest,
    capturedTrace: {
      manifest: structuredClone(manifest),
      quoteRequest: {
        address: payerIdentity.address,
        blockType: 2,
        toAddress: recipient,
        data,
      },
      accountFrontierBefore: account,
      accountFrontierAfter: { ...account },
      momentumBefore: momentum,
      rpcObservation: {
        availablePlasma: 0,
        basePlasma: 1,
        requiredDifficulty: 2,
      },
      momentumAfter: { ...momentum },
      nonceRecord: {
        nonce: PLACEHOLDER_NONCE,
        payer: payerIdentity.address,
        previousAccountHash: accountHash,
        difficulty: 2,
      },
    },
  };
  const staged = composeOfflinePreparationTrace(rawTrace);
  const initialPreparation = prepareUnsignedZenonPaymentBlock(
    staged.preparationInput,
  );
  const originalScope = Object.freeze({
    payer: initialPreparation.block.address,
    previousAccountHash: initialPreparation.block.previousHash,
    difficulty: initialPreparation.block.difficulty,
  });
  return {
    amount,
    payerCore: payerIdentity.core,
    rawTrace,
    staged,
    initialPreparation,
    originalScope,
  };
}

function independentPredicate(payerCore, scope, nonce) {
  const domain = sha3(Buffer.concat([
    payerCore,
    Buffer.from(scope.previousAccountHash, 'hex'),
  ]));
  const work = sha3(Buffer.concat([
    Buffer.from(nonce, 'hex'),
    domain,
  ]));
  const observed = work.readBigUInt64LE(0);
  const threshold = POW_RANGE - (POW_RANGE / BigInt(scope.difficulty));
  return observed >= threshold;
}

function sameScope(left, right) {
  return left.payer === right.payer &&
    left.previousAccountHash === right.previousAccountHash &&
    left.difficulty === right.difficulty;
}

function assertScopeEqual(left, right, label) {
  assert.equal(sameScope(left, right), true, label);
}

function attachProducedNonce(trace, scope, nonce) {
  const positiveTrace = structuredClone(trace);
  positiveTrace.capturedTrace.nonceRecord = {
    nonce,
    payer: scope.payer,
    previousAccountHash: scope.previousAccountHash,
    difficulty: scope.difficulty,
  };
  return positiveTrace;
}

function assertRejected(trace, label) {
  let classification = 'NOT_REJECTED';
  try {
    composeOfflinePreparationWithNonceProof(trace);
  } catch (error) {
    classification = error instanceof TypeError && error.code === REJECTION_CODE
      ? 'EXPECTED_REJECTION'
      : 'UNEXPECTED_REJECTION';
  }
  assert.equal(classification, 'EXPECTED_REJECTION', label);
}

function assertDeepFrozen(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true, 'result graph is deeply frozen');
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (Object.hasOwn(descriptor, 'value')) {
      assertDeepFrozen(descriptor.value, seen);
    }
  }
}

function containsFunction(value, seen = new Set()) {
  if (typeof value === 'function') return true;
  if (value === null || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  return Reflect.ownKeys(value).some(key => containsFunction(value[key], seen));
}

function assertNoAuthorityClaims(value) {
  for (const field of [
    'signer', 'wallet', 'rpc', 'runtime', 'capability', 'authorization',
    'freshness', 'replayProtected', 'chainIdentity', 'publish', 'submit',
    'livePayment', 'chainThroughput', 'sharedSdkSessionParallelism',
    'admissionControl', 'payerLock', 'dynamicPlasmaActivation',
    'pricingFreshness',
  ]) {
    assert.equal(field in value, false, `${field} claim remains absent`);
  }
}

test(
  'two real owned children qualify isolated PRE_DP compositions only',
  { concurrency: false },
  async () => {
    const fixtures = [
      preparedCase({
        label: 'parallel-composition-a',
        payerByte: 0x11,
        recipientByte: 0x22,
        amount: '42',
        accountHeight: 7,
        momentumHeight: 42,
      }),
      preparedCase({
        label: 'parallel-composition-b',
        payerByte: 0x44,
        recipientByte: 0x55,
        amount: '84',
        accountHeight: 9,
        momentumHeight: 43,
      }),
    ];

    assert.equal(fixtures.every(fixture =>
      fixture.staged.compatibility.classification === 'PRE_DP' &&
      fixture.staged.trust.nonceProof === 'NOT_VERIFIED' &&
      fixture.initialPreparation.classification === 'PRE_DP' &&
      fixture.initialPreparation.block.difficulty === 2 &&
      fixture.initialPreparation.block.signature === ''), true,
    'both original preparations are unsigned PRE_DP difficulty-two scopes');
    assert.equal(fixtures[0].payerCore.equals(fixtures[1].payerCore), false,
      'payer cores are distinct');
    assert.equal(
      fixtures[0].originalScope.previousAccountHash ===
        fixtures[1].originalScope.previousAccountHash,
      false,
      'previous account hashes are distinct',
    );
    assert.equal(sameScope(
      fixtures[0].originalScope,
      fixtures[1].originalScope,
    ), false, 'original proof scopes are distinct');
    assert.equal(
      fixtures[0].rawTrace.expectedManifest.intent.amount ===
        fixtures[1].rawTrace.expectedManifest.intent.amount,
      false,
      'original preparation intents are distinguishable',
    );

    const suppliedScopes = fixtures.map(fixture => Object.freeze({
      payer: fixture.originalScope.payer,
      previousAccountHash: fixture.originalScope.previousAccountHash,
      difficulty: fixture.originalScope.difficulty,
    }));

    producerInvocationCount += 1;
    const operationA = produceOfflineZenonNonce(suppliedScopes[0]);
    producerInvocationCount += 1;
    const operationB = produceOfflineZenonNonce(suppliedScopes[1]);
    const outcomes = await Promise.allSettled([operationA, operationB]);

    await Promise.all(childObservations.map(observation => observation.closed));
    assert.equal(outcomes.every(outcome => outcome.status === 'fulfilled'), true,
      'both production operations fulfill under total observation');
    assert.equal(childObservations.length === 2, true,
      'two owned child observations are retained');

    const produced = [outcomes[0].value, outcomes[1].value];
    assert.equal(childObservations[0].child !== childObservations[1].child, true,
      'the owner created distinct child processes');
    assert.equal(
      childObservations[0].request !== childObservations[1].request &&
        childObservations[0].response !== childObservations[1].response,
      true,
      'the owned children have isolated private streams',
    );

    for (let index = 0; index < fixtures.length; index += 1) {
      const fixture = fixtures[index];
      const result = produced[index];
      const observation = childObservations[index];
      assert.equal(observation.ordinal === index, true,
        'each result remains associated with its spawn order');
      assert.equal(cleanOwnedClosure(observation), true,
        'owned exit, process close, and private stream closes are observed');
      assert.equal(observedProtocolMatchesResult(observation, result), true,
        'the exact owned child emitted the ordered successful candidate');
      assert.equal(result.qualification, 'OFFLINE_NONCE_PRODUCER_ONLY');
      assert.equal(result.status, 'VALID');
      assert.equal(/^[0-9a-f]{16}$/.test(result.nonce), true,
        'the candidate is canonical');
      assertScopeEqual(result.recordedProofScope, fixture.originalScope,
        'the produced scope equals its original prepared scope');
      assert.equal(independentPredicate(
        fixture.payerCore,
        fixture.originalScope,
        result.nonce,
      ), true, 'the independent chain-style predicate is valid');
      assert.deepEqual(result.lifecycle, EXPECTED_SUCCESS_LIFECYCLE);
      assert.deepEqual(result.trust, EXPECTED_TRUST);
      assert.equal(result.recordedProofScope !== suppliedScopes[index], true,
        'the recorded producer scope is detached from its call input');
      assert.equal(containsFunction(result), false,
        'the producer result is data-only');
      assertNoAuthorityClaims(result);
      assertDeepFrozen(result);
    }

    const compositions = fixtures.map((fixture, index) => {
      const positiveTrace = attachProducedNonce(
        fixture.rawTrace,
        fixture.originalScope,
        produced[index].nonce,
      );
      const reusableTrace = structuredClone(positiveTrace);
      const composed = composeOfflinePreparationWithNonceProof(positiveTrace);
      return { positiveTrace, reusableTrace, composed };
    });

    for (let index = 0; index < fixtures.length; index += 1) {
      const fixture = fixtures[index];
      const result = produced[index];
      const { positiveTrace, composed } = compositions[index];
      assert.equal(composed.qualification, 'OFFLINE_PREPARATION_NONCE_ONLY');
      assert.equal(composed.preparation.classification, 'PRE_DP');
      assert.equal(composed.preparation.block.signature, '');
      assert.equal(composed.nonceProof.status, 'VALID');
      assert.equal(composed.preparation.block.nonce === result.nonce, true,
        'the composed block retains its own candidate');
      assertScopeEqual(
        positiveTrace.capturedTrace.nonceRecord,
        fixture.originalScope,
        'the raw trace records its original scope',
      );
      assertScopeEqual({
        payer: composed.preparation.block.address,
        previousAccountHash: composed.preparation.block.previousHash,
        difficulty: composed.preparation.block.difficulty,
      }, fixture.originalScope, 'the unsigned block retains its original scope');
      assertScopeEqual(
        composed.nonceProof.recordedProofScope,
        fixture.originalScope,
        'the composed predicate retains its original scope',
      );
      assert.deepEqual(composed.trust, EXPECTED_TRUST);
      assert.deepEqual(composed.nonceProof.trust, EXPECTED_TRUST);
      assert.equal(containsFunction(composed), false,
        'the composed result is data-only');
      assertNoAuthorityClaims(composed);
      assertDeepFrozen(composed);
      assert.equal(composed.preparation !== fixture.initialPreparation, true,
        'the composed preparation is detached from the staged preparation');
      assert.equal(
        composed.recordedContext !== positiveTrace.expectedManifest.context,
        true,
        'the recorded context is detached from the raw trace',
      );

      positiveTrace.expectedManifest.intent.amount = '999';
      positiveTrace.capturedTrace.manifest.intent.amount = '999';
      assert.equal(composed.preparation.block.amount === fixture.amount, true,
        'later trace mutation cannot alter the composed result');
    }

    for (let index = 0; index < fixtures.length; index += 1) {
      const mismatch = structuredClone(compositions[index].reusableTrace);
      mismatch.capturedTrace.nonceRecord.payer =
        fixtures[1 - index].originalScope.payer;
      assertRejected(mismatch,
        'each existing candidate rejects an exact recorded-scope mismatch');
    }

    assert.equal(producerInvocationCount, 2,
      'negative composition cases reuse the two existing candidates');
    assert.equal(delegatedSpawnCount, 2,
      'no retry or replacement child is delegated');
    assert.equal(produced.every(result =>
      result.lifecycle.nativeOrWasmEntry === 'NOT_ESTABLISHED' &&
      result.lifecycle.networkBoundary ===
        'TRUSTED_ARTIFACT_JS_DENIAL_FACADE_NOT_OS_SANDBOX'), true,
    'qualification remains wrapper-observed and offline-only');
  },
);
