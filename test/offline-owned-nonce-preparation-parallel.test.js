import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import test, { after, mock } from 'node:test';

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
let connectorInvocationCount = 0;
let pairFullyObserved = false;
let ownedPairSettlement = null;

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
      throw new Error('parallel owned preparation permits two child delegates');
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

function observedProtocolMatchesEvidence(observation, producerEvidence) {
  const { capture, state } = observation;
  if (producerEvidence === null || typeof producerEvidence !== 'object' ||
      state.responseNonBuffer || state.responseOverflow ||
      state.responseStoredBytes !== RESPONSE_MAXIMUM_BYTES ||
      !/^[0-9a-f]{16}$/.test(producerEvidence.nonce)) return false;

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
      const producedBytes = Buffer.from(producerEvidence.nonce, 'hex');
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
  let passiveBuffersCleared = false;
  try {
    if (ownedPairSettlement !== null) await ownedPairSettlement;
    await Promise.all(childObservations.map(observation => observation.closed));
    everyOwnedResourceClosed = childObservations.every(cleanOwnedClosure);
  } finally {
    for (const observation of childObservations) observation.capture.fill(0);
    passiveBuffersCleared = childObservations.every(
      observation => observation.capture.every(byte => byte === 0),
    );
    ownedPairSettlement = null;
    spawnSpy.mock.restore();
  }
  assert.equal(childProcess.spawn === ORIGINAL_SPAWN, true,
    'the call-through spawn spy is restored');
  assert.equal(passiveBuffersCleared, true,
    'passive response copies are cleared');
  assert.equal(connectorInvocationCount, 2,
    'this test file invokes the connector exactly twice');
  assert.equal(delegatedSpawnCount, 2,
    'exactly two original child delegates are observed');
  assert.equal(everyOwnedResourceClosed, true,
    'both owned processes and their private streams are closed');
  assert.equal(pairFullyObserved, true,
    'both connector outcomes and owned closures were observed');
});

const connectorUrl = new URL(
  '../src/zenon/internal/offline-owned-nonce-preparation.js',
  import.meta.url,
);
connectorUrl.searchParams.set('parallel-owned-preparation-evidence', '1');
const { produceOfflineUnsignedPreparation } = await import(connectorUrl.href);

function recordedFixture({
  label,
  payerByte,
  recipientByte,
  amount,
  accountHeight,
  momentumHeight,
  classification,
}) {
  const payerPublicKey = Buffer.alloc(32, payerByte);
  const payer = addressIdentity(payerPublicKey);
  const recipient = addressIdentity(Buffer.alloc(32, recipientByte)).address;
  const data = sha3(Buffer.from(`${label}-data`)).toString('base64');
  const accountHash = sha3(Buffer.from(`${label}-account`)).toString('hex');
  const momentumHash = sha3(Buffer.from(`${label}-momentum`)).toString('hex');
  const dynamic = classification === 'DP_ACTIVE';
  const difficulty = dynamic ? 3000 : 2;
  const tokenStandard = bech32FromBytes('zts', Buffer.alloc(10, 1));
  const intent = {
    toAddress: recipient,
    amount,
    tokenStandard,
    data,
  };
  const context = {
    chainIdentifier: 1,
    networkIdentifier: `${label}-network`,
    profileIdentifier: `${label}-profile`,
    epochIdentifier: `${label}-epoch`,
  };
  const manifest = {
    payer: payer.address,
    publicKey: payerPublicKey.toString('base64'),
    intent,
    context,
    trustLabel: 'synthetic-recorded',
  };
  const accountBefore = {
    address: payer.address,
    height: accountHeight,
    hash: accountHash,
  };
  const accountAfter = { ...accountBefore };
  const momentumBefore = dynamic
    ? {
        chainIdentifier: 1,
        height: momentumHeight,
        hash: momentumHash,
        version: 2,
        nextFusionPrice: 1200,
        nextWorkPrice: 1100,
      }
    : {
        chainIdentifier: 1,
        height: momentumHeight,
        hash: momentumHash,
        version: 1,
      };
  const momentumAfter = { ...momentumBefore };
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
      accountFrontierBefore: accountBefore,
      accountFrontierAfter: accountAfter,
      momentumBefore,
      rpcObservation: {
        availablePlasma: 0,
        basePlasma: 1,
        requiredDifficulty: difficulty,
      },
      momentumAfter,
      nonceRecord: {
        nonce: PLACEHOLDER_NONCE,
        payer: payer.address,
        previousAccountHash: accountHash,
        difficulty,
      },
    },
  };
  const expected = Object.freeze({
    originalScope: Object.freeze({
      payer: payer.address,
      previousAccountHash: accountHash,
      difficulty,
    }),
    intent: Object.freeze({ ...intent }),
    context: Object.freeze({ ...context }),
    classification,
    fusedPlasma: 0,
    basePlasma: 1,
    momentumHash,
    momentumHeight,
    nextFusionPrice: dynamic ? 1200 : null,
    nextWorkPrice: dynamic ? 1100 : null,
  });
  return { trace, payerCore: payer.core, expected };
}

function mutateCallerTrace(trace, label) {
  const changedRecipient = addressIdentity(Buffer.alloc(32, 0x77)).address;
  const changedData = sha3(Buffer.from(`${label}-changed-data`)).toString('base64');
  const changedAccountHash = sha3(
    Buffer.from(`${label}-changed-account`),
  ).toString('hex');
  const changedMomentumHash = sha3(
    Buffer.from(`${label}-changed-momentum`),
  ).toString('hex');
  for (const manifest of [trace.expectedManifest, trace.capturedTrace.manifest]) {
    manifest.intent.toAddress = changedRecipient;
    manifest.intent.amount = '999';
    manifest.intent.data = changedData;
    manifest.context.networkIdentifier = `${label}-changed-network`;
    manifest.context.profileIdentifier = `${label}-changed-profile`;
    manifest.context.epochIdentifier = `${label}-changed-epoch`;
  }
  trace.capturedTrace.quoteRequest.toAddress = changedRecipient;
  trace.capturedTrace.quoteRequest.data = changedData;
  trace.capturedTrace.accountFrontierBefore.hash = changedAccountHash;
  trace.capturedTrace.accountFrontierAfter.hash = changedAccountHash;
  trace.capturedTrace.momentumBefore.hash = changedMomentumHash;
  trace.capturedTrace.momentumAfter.hash = changedMomentumHash;
  trace.capturedTrace.rpcObservation.requiredDifficulty += 1;
  trace.capturedTrace.nonceRecord.previousAccountHash = changedAccountHash;
  trace.capturedTrace.nonceRecord.difficulty += 1;
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

function sameIntent(block, expected) {
  return block.toAddress === expected.toAddress &&
    block.amount === expected.amount &&
    block.tokenStandard === expected.tokenStandard &&
    block.data === expected.data;
}

function sameContext(left, right) {
  return left.chainIdentifier === right.chainIdentifier &&
    left.networkIdentifier === right.networkIdentifier &&
    left.profileIdentifier === right.profileIdentifier &&
    left.epochIdentifier === right.epochIdentifier;
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
    'livePayment', 'chainThroughput', 'sustainableCapacity',
    'sharedSdkSessionParallelism', 'admissionControl', 'samePayerSafety',
    'payerLock', 'dynamicPlasmaActivation', 'pricingFreshness',
  ]) {
    assert.equal(field in value, false, `${field} claim remains absent`);
  }
}

test(
  'two real owned preparations isolate PRE_DP and recorded DP_ACTIVE inputs',
  { concurrency: false },
  async () => {
    const fixtures = [
      recordedFixture({
        label: 'parallel-owned-preparation-a',
        payerByte: 0x11,
        recipientByte: 0x22,
        amount: '42',
        accountHeight: 7,
        momentumHeight: 42,
        classification: 'PRE_DP',
      }),
      recordedFixture({
        label: 'parallel-owned-preparation-b',
        payerByte: 0x44,
        recipientByte: 0x55,
        amount: '84',
        accountHeight: 9,
        momentumHeight: 43,
        classification: 'DP_ACTIVE',
      }),
    ];

    assert.equal(fixtures[0].payerCore.equals(fixtures[1].payerCore), false,
      'the synthetic payer cores are distinct');
    assert.equal(sameScope(
      fixtures[0].expected.originalScope,
      fixtures[1].expected.originalScope,
    ), false, 'the original proof scopes are distinct');
    assert.equal(
      sameIntent(fixtures[0].expected.intent, fixtures[1].expected.intent),
      false,
      'the original payment intents are distinct',
    );
    assert.equal(sameContext(
      fixtures[0].expected.context,
      fixtures[1].expected.context,
    ), false, 'the original recorded contexts are distinct');
    assert.equal(fixtures.every(fixture =>
      fixture.trace.capturedTrace.rpcObservation.availablePlasma === 0 &&
      fixture.trace.capturedTrace.rpcObservation.basePlasma === 1 &&
      fixture.expected.fusedPlasma === 0 &&
      fixture.expected.basePlasma === 1
    ), true, 'both fixtures retain the fixed base and fused plasma inputs');
    assert.equal(
      fixtures[0].expected.momentumHash === fixtures[1].expected.momentumHash ||
        fixtures[0].expected.momentumHeight ===
          fixtures[1].expected.momentumHeight,
      false,
      'the recorded frontiers are distinct',
    );
    assert.equal(
      fixtures[1].expected.nextFusionPrice === 1200 &&
        fixtures[1].expected.nextWorkPrice === 1100 &&
        fixtures[1].expected.basePlasma === 1 &&
        fixtures[1].expected.originalScope.difficulty === 3000 &&
        fixtures[1].expected.fusedPlasma === 0,
      true,
      'the second fixture is the recorded elevated DP_ACTIVE case',
    );

    connectorInvocationCount += 1;
    const operationA = produceOfflineUnsignedPreparation(fixtures[0].trace);
    connectorInvocationCount += 1;
    const operationB = produceOfflineUnsignedPreparation(fixtures[1].trace);
    const pairOutcome = Promise.allSettled([operationA, operationB]);
    ownedPairSettlement = pairOutcome.then(() => undefined);

    const closedAtSettlement = [false, false];
    const settlementWitnesses = [operationA, operationB].map(
      (operation, index) => operation.then(
        () => {
          const observation = childObservations[index];
          closedAtSettlement[index] = observation !== undefined &&
            cleanOwnedClosure(observation);
        },
        () => {
          const observation = childObservations[index];
          closedAtSettlement[index] = observation !== undefined &&
            cleanOwnedClosure(observation);
        },
      ),
    );

    mutateCallerTrace(fixtures[0].trace, 'caller-a');
    mutateCallerTrace(fixtures[1].trace, 'caller-b');

    const outcomes = await pairOutcome;
    await Promise.all(settlementWitnesses);
    await Promise.all(childObservations.map(observation => observation.closed));

    assert.equal(outcomes.every(outcome => outcome.status === 'fulfilled'), true,
      'both connector operations fulfill under total observation');
    assert.equal(closedAtSettlement.every(Boolean), true,
      'each connector settles only after its owned resources close');
    assert.equal(childObservations.length === 2, true,
      'two owned child observations are retained');
    assert.equal(childObservations[0].child !== childObservations[1].child, true,
      'the connector pair owns distinct child processes');
    assert.equal(
      childObservations[0].request !== childObservations[1].request &&
        childObservations[0].response !== childObservations[1].response,
      true,
      'the owned children use independent private pipes',
    );

    const results = [outcomes[0].value, outcomes[1].value];
    for (let index = 0; index < fixtures.length; index += 1) {
      const { payerCore, expected } = fixtures[index];
      const result = results[index];
      const observation = childObservations[index];
      const evidence = result.producerEvidence;
      const composition = result.composition;
      const block = composition.preparation.block;

      assert.equal(observation.ordinal === index, true,
        'each wrapper remains associated with its owned child');
      assert.equal(cleanOwnedClosure(observation), true,
        'owned zero exit, process close, and private pipe closes are observed');
      assert.equal(observedProtocolMatchesEvidence(observation, evidence), true,
        'the owned terminal frame matches its unchanged producer evidence');
      assert.equal(result.qualification, 'OFFLINE_OWNED_PREPARATION_ONLY');
      assert.deepEqual(Object.keys(result), [
        'qualification', 'composition', 'producerEvidence',
      ]);
      assert.equal(composition.qualification, 'OFFLINE_PREPARATION_NONCE_ONLY');
      assert.equal(evidence.qualification, 'OFFLINE_NONCE_PRODUCER_ONLY');
      assert.equal(evidence.status, 'VALID');
      assert.equal(sameScope(evidence.recordedProofScope, expected.originalScope),
        true, 'producer evidence retains the original derived scope');
      assert.equal(sameScope(
        composition.nonceProof.recordedProofScope,
        expected.originalScope,
      ), true, 'the composed proof retains the original derived scope');
      assert.equal(sameScope({
        payer: block.address,
        previousAccountHash: block.previousHash,
        difficulty: block.difficulty,
      }, expected.originalScope), true,
      'the unsigned block retains the original derived scope');
      assert.equal(block.nonce === evidence.nonce, true,
        'the unsigned block retains its owned candidate');
      assert.equal(independentPredicate(
        payerCore,
        expected.originalScope,
        evidence.nonce,
      ), true, 'the independent chain-style predicate validates the candidate');
      assert.equal(composition.preparation.classification,
        expected.classification);
      assert.equal(block.difficulty, expected.originalScope.difficulty);
      assert.equal(block.fusedPlasma, expected.fusedPlasma);
      assert.equal(block.signature === '', true,
        'unsigned signature remains empty');
      assert.equal(sameIntent(block, expected.intent), true,
        'the original detached intent is retained');
      assert.equal(sameContext(composition.recordedContext, expected.context), true,
        'the original detached context is retained');
      assert.equal(
        block.momentumAcknowledged.hash === expected.momentumHash &&
          block.momentumAcknowledged.height === expected.momentumHeight,
        true,
        'original detached momentum acknowledgement is preserved',
      );
      assert.equal(composition.recordedTrustLabel, 'synthetic-recorded');
      assert.equal(composition.nonceProof.status, 'VALID');
      assert.deepEqual(evidence.lifecycle, EXPECTED_SUCCESS_LIFECYCLE);
      assert.deepEqual(evidence.trust, EXPECTED_TRUST);
      assert.deepEqual(composition.trust, EXPECTED_TRUST);
      assert.deepEqual(composition.nonceProof.trust, EXPECTED_TRUST);
      assert.equal(containsFunction(result), false,
        'the owned preparation wrapper is data-only');
      assertNoAuthorityClaims(result);
      assertNoAuthorityClaims(composition);
      assertNoAuthorityClaims(evidence);
      assertDeepFrozen(result);
    }

    assert.equal(connectorInvocationCount, 2,
      'the pair uses exactly two connector calls without retry');
    assert.equal(delegatedSpawnCount, 2,
      'the pair uses exactly two original delegates without replacement');
    assert.equal(childObservations.every(cleanOwnedClosure), true,
      'no owned child or private pipe remains outstanding');
    pairFullyObserved = true;
  },
);
