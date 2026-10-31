import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { verifyOfflineZenonNonceProof } from
  '../src/zenon/internal/offline-nonce-proof-verifier.js';

const CHILD_PATH = fileURLToPath(
  new URL('../test-support/installed-pow-qualification-child.js', import.meta.url),
);
const CHILD_CWD = fileURLToPath(new URL('../test-support/', import.meta.url));
const PACKAGE_PATH = fileURLToPath(new URL('../package.json', import.meta.url));
const READ_ROOTS = Object.freeze([
  CHILD_PATH,
  PACKAGE_PATH,
  ...[
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
  ].map(name => fileURLToPath(new URL(`../node_modules/${name}/`, import.meta.url))),
]);
const PERMISSION_ARGUMENTS = Object.freeze([
  '--permission',
  ...READ_ROOTS.map(path => `--allow-fs-read=${path}`),
]);
const FIXED_MODES = Object.freeze([
  'import-only',
  'generate-2',
  'generate-3',
  'empty',
  'truncated',
  'malformed',
  'high-bit',
  'oversized',
  'invalid-nonce',
  'nonzero',
  'child-error',
  'delayed',
]);
const CHILD_DEADLINE_MS = 3_000;
const NONCE_FRAME_BYTES = 16;
const NETWORK_DENIED_FRAME = Buffer.from('NETWORK_DENIED\n', 'ascii');
const SDK_INVOCATION_FRAME = Buffer.from('SDK_INVOCATION\n', 'ascii');
const IMPORT_CLASSIFICATIONS = Object.freeze([
  'IMPORT_READY',
  'READ_DENIED',
  'IMPORT_REJECTED',
]);
const IMPORT_CLASSIFICATION_FRAMES = Object.freeze(
  IMPORT_CLASSIFICATIONS.map(value => Buffer.from(value, 'ascii')),
);
const MAX_IMPORT_FRAME_BYTES = Math.max(
  ...IMPORT_CLASSIFICATION_FRAMES.map(frame => frame.length),
);
const FIXED_REJECTION_MESSAGE = 'installed qualification rejected';
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32_GENERATORS = Object.freeze([
  0x3b6a57b2,
  0x26508e6d,
  0x1ea119fa,
  0x3d4233dd,
  0x2a1462b3,
]);
const ADDRESS_CORE = Buffer.concat([
  Buffer.alloc(1),
  createHash('sha3-256')
    .update('installed-pow-qualification-public-payer')
    .digest()
    .subarray(0, 19),
]);
const PREVIOUS_ACCOUNT_HASH = createHash('sha3-256')
  .update('installed-pow-qualification-public-previous-hash')
  .digest('hex');
const KNOWN_INVALID_NONCE = '0200000000000000';
const EXPECTED_TRUST = Object.freeze({
  sourceAuthentication: 'NOT_ESTABLISHED',
  chainAuthentication: 'NOT_ESTABLISHED',
  canonicality: 'NOT_ESTABLISHED',
  finality: 'NOT_ESTABLISHED',
  liveFreshness: 'NOT_ESTABLISHED',
  signingAuthorization: 'NOT_ESTABLISHED',
});

let childCreationCount = 0;
let generatorAttemptCount = 0;
let sdkInvocationObservedCount = 0;
let generatorVerifiedCount = 0;
let predicateVerificationCount = 0;
let generatorQualification = 'NOT_RUN';
let generatorHalted = false;
let importClassification = 'NOT_RUN';
let lastInvocation;
let lastLifecycle;
let lastFailureClassification;
let lastGeneratorFailureClassification;
const diagnosticTotals = {
  tests: 0,
  pass: 0,
  fail: 0,
  skipped: 0,
  cancelled: 0,
  todo: 0,
};

function generatorCounterSnapshot(record) {
  return Object.freeze({
    generatorAttemptCount: record.generatorAttemptCount,
    sdkInvocationObservedCount: record.sdkInvocationObservedCount,
  });
}

function currentGeneratorCounterSnapshot() {
  return generatorCounterSnapshot({
    generatorAttemptCount,
    sdkInvocationObservedCount,
  });
}

function generatorCountersUnchanged(before, after) {
  return before.generatorAttemptCount === after.generatorAttemptCount &&
    before.sdkInvocationObservedCount === after.sdkInvocationObservedCount;
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

function syntheticPayer() {
  const words = fiveBitWords(ADDRESS_CORE);
  const checksumValue = polymod([3, 0, 26, ...words, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum = Array.from(
    { length: 6 },
    (_, index) => (checksumValue >>> (5 * (5 - index))) & 31,
  );
  return `z1${[...words, ...checksum]
    .map(value => BECH32_CHARSET[value])
    .join('')}`;
}

const FIXTURE_CONTEXT = Object.freeze({
  payer: syntheticPayer(),
  previousAccountHash: PREVIOUS_ACCOUNT_HASH,
});

function fixedFailure(stage, failure) {
  const classification = Object.freeze({ stage, failure });
  lastFailureClassification = classification;
  const error = new Error(FIXED_REJECTION_MESSAGE);
  Object.defineProperty(error, 'stack', {
    configurable: false,
    enumerable: false,
    value: undefined,
    writable: false,
  });
  Object.defineProperty(error, 'classification', {
    configurable: false,
    enumerable: true,
    value: classification,
    writable: false,
  });
  return error;
}

function rejectController(stage, failure) {
  throw fixedFailure(stage, failure);
}

function validateMode(mode) {
  if (typeof mode !== 'string' || !FIXED_MODES.includes(mode)) {
    throw new TypeError('qualification mode rejected');
  }
}

function maximumPayloadBytes(mode) {
  if (mode === 'import-only') return MAX_IMPORT_FRAME_BYTES;
  if (mode === 'generate-2' || mode === 'generate-3') {
    return SDK_INVOCATION_FRAME.length + NONCE_FRAME_BYTES;
  }
  return NONCE_FRAME_BYTES;
}

function exactBytesAt(frame, offset, expected) {
  return frame.subarray(offset, offset + expected.length).equals(expected);
}

function exactNonceFrame(frame) {
  if (frame.length !== NONCE_FRAME_BYTES) {
    rejectController('FRAME', 'LENGTH_REJECTED');
  }
  for (const byte of frame) {
    const decimal = byte >= 0x30 && byte <= 0x39;
    const lowerHex = byte >= 0x61 && byte <= 0x66;
    if (!decimal && !lowerHex) rejectController('FRAME', 'BYTE_REJECTED');
  }
  return frame.toString('latin1');
}

function importDiagnosticResult(frame) {
  for (let index = 0; index < IMPORT_CLASSIFICATION_FRAMES.length; index += 1) {
    if (frame.equals(IMPORT_CLASSIFICATION_FRAMES[index])) {
      return Object.freeze({
        kind: 'IMPORT_DIAGNOSTIC',
        classification: IMPORT_CLASSIFICATIONS[index],
        networkStatus: 'NETWORK_DENIED',
      });
    }
  }
  rejectController('FRAME', 'IMPORT_LABEL_REJECTED');
}

function nonceCandidateResult(nonce) {
  return Object.freeze({
    kind: 'NONCE_CANDIDATE',
    nonce,
    networkStatus: 'NETWORK_DENIED',
  });
}

function exactNonceCandidate(result) {
  if (result === null || typeof result !== 'object' ||
      result.kind !== 'NONCE_CANDIDATE' ||
      typeof result.nonce !== 'string') {
    rejectController('FRAME', 'NONCE_CANDIDATE_REQUIRED');
  }
  return result.nonce;
}

function runFixedChild(mode) {
  validateMode(mode);
  childCreationCount += 1;
  const executable = process.execPath;
  const arguments_ = [...PERMISSION_ARGUMENTS, CHILD_PATH, mode];
  const environment = Object.create(null);
  const options = {
    cwd: CHILD_CWD,
    detached: false,
    env: environment,
    shell: false,
    stdio: ['ignore', 'ignore', 'ignore', 'pipe'],
    windowsHide: true,
  };
  lastInvocation = Object.freeze({
    executableIsProcessExecPath: executable === process.execPath,
    modeIsFinalArgument: arguments_.at(-1) === mode,
    permissionArgumentCount: arguments_.filter(value => value === '--permission').length,
    readAllowanceCount: arguments_
      .filter(value => value.startsWith('--allow-fs-read=')).length,
    hasWriteAllowance: arguments_
      .some(value => value.startsWith('--allow-fs-write=')),
    hasChildAllowance: arguments_.includes('--allow-child-process'),
    hasWorkerAllowance: arguments_.includes('--allow-worker'),
    hasAddonAllowance: arguments_.includes('--allow-addons'),
    hasWasiAllowance: arguments_.includes('--allow-wasi'),
    hasNetworkAllowance: arguments_.some(value => value === '--allow-net'),
    environmentKeyCount: Reflect.ownKeys(environment).length,
    cwdIsFixed: options.cwd === CHILD_CWD,
    detached: options.detached,
    shell: options.shell,
    stdioShape: options.stdio.join(','),
    hasExecArgvOption: Object.hasOwn(options, 'execArgv'),
  });

  let child;
  try {
    child = spawn(executable, arguments_, options);
  } catch {
    rejectController('STARTUP', 'SPAWN_REJECTED');
  }

  return (async () => {
    const frameLimit = NETWORK_DENIED_FRAME.length + maximumPayloadBytes(mode);
    const frame = Buffer.alloc(frameLimit + 1);
    const privatePipe = child.stdio[3];
    let storedBytes = 0;
    let overflow = false;
    let childError = false;
    let pipeError = false;
    let deadlineObserved = false;
    let closeObserved = false;
    let closeCode;
    let closeSignal;
    let terminationRequested = false;
    let networkDenialObserved = false;
    let sdkInvocationObserved = false;

    function terminateOwnedChild() {
      if (terminationRequested || closeObserved ||
          child.exitCode !== null || child.signalCode !== null) return;
      terminationRequested = true;
      try { child.kill('SIGKILL'); } catch {}
    }

    const closePromise = new Promise(resolve => {
      child.once('error', () => {
        childError = true;
        terminateOwnedChild();
      });
      child.once('close', (code, signal) => {
        closeObserved = true;
        closeCode = code;
        closeSignal = signal;
        resolve();
      });
    });

    if (!privatePipe) {
      pipeError = true;
      terminateOwnedChild();
    } else {
      privatePipe.on('data', chunk => {
        const available = frame.length - storedBytes;
        const copied = Math.min(available, chunk.length);
        if (copied > 0) chunk.copy(frame, storedBytes, 0, copied);
        storedBytes += copied;
        if (!networkDenialObserved && storedBytes >= NETWORK_DENIED_FRAME.length &&
            exactBytesAt(frame, 0, NETWORK_DENIED_FRAME)) {
          networkDenialObserved = true;
        }
        const sdkInvocationOffset = NETWORK_DENIED_FRAME.length;
        if (!sdkInvocationObserved &&
            (mode === 'generate-2' || mode === 'generate-3') &&
            storedBytes >= sdkInvocationOffset + SDK_INVOCATION_FRAME.length &&
            networkDenialObserved &&
            exactBytesAt(frame, sdkInvocationOffset, SDK_INVOCATION_FRAME)) {
          sdkInvocationObserved = true;
          sdkInvocationObservedCount += 1;
        }
        if (copied !== chunk.length || storedBytes > frameLimit) {
          overflow = true;
          terminateOwnedChild();
        }
      });
      privatePipe.once('error', () => {
        pipeError = true;
        terminateOwnedChild();
      });
    }

    const deadline = setTimeout(() => {
      deadlineObserved = true;
      terminateOwnedChild();
    }, CHILD_DEADLINE_MS);

    try {
      await closePromise;
      if (deadlineObserved) rejectController('DEADLINE', 'LIMIT_REACHED');
      if (overflow) rejectController('FRAME', 'TOO_LONG');
      if (childError) rejectController('STARTUP', 'CHILD_ERROR');
      if (pipeError) rejectController('STARTUP', 'PIPE_ERROR');
      if (!networkDenialObserved) {
        rejectController('STARTUP', 'NETWORK_PROBE_UNCONFIRMED');
      }
      if (closeSignal !== null) rejectController('EXIT', 'SIGNALLED');
      if (closeCode !== 0) rejectController('EXIT', 'NONZERO');
      const payload = frame.subarray(NETWORK_DENIED_FRAME.length, storedBytes);
      if (mode === 'import-only') {
        return importDiagnosticResult(payload);
      }
      if (mode === 'generate-2' || mode === 'generate-3') {
        if (!sdkInvocationObserved ||
            payload.length < SDK_INVOCATION_FRAME.length ||
            !exactBytesAt(payload, 0, SDK_INVOCATION_FRAME)) {
          rejectController('FRAME', 'SDK_INVOCATION_UNCONFIRMED');
        }
        return nonceCandidateResult(exactNonceFrame(
          payload.subarray(SDK_INVOCATION_FRAME.length),
        ));
      }
      return nonceCandidateResult(exactNonceFrame(payload));
    } finally {
      clearTimeout(deadline);
      if (!closeObserved) {
        terminateOwnedChild();
        await closePromise;
      }
      if (privatePipe && !privatePipe.destroyed) privatePipe.destroy();
      frame.fill(0);
      lastLifecycle = Object.freeze({
        closeObserved,
        deadlineObserved,
        terminationRequested,
        networkDenialObserved,
        sdkInvocationObserved,
      });
    }
  })();
}

function validateDifficulty(difficulty) {
  if (typeof difficulty !== 'number' || !Number.isSafeInteger(difficulty) ||
      (difficulty !== 2 && difficulty !== 3)) {
    throw new TypeError('qualification difficulty rejected');
  }
}

function exactQualifiedResult(difficulty, nonce) {
  predicateVerificationCount += 1;
  let result;
  try {
    result = verifyOfflineZenonNonceProof({
      payer: FIXTURE_CONTEXT.payer,
      previousAccountHash: FIXTURE_CONTEXT.previousAccountHash,
      difficulty,
      nonce,
    });
  } catch {
    throw fixedFailure('PREDICATE', 'VERIFIER_REJECTED');
  }
  if (result.status !== 'VALID') {
    throw fixedFailure('PREDICATE', 'NONCE_INVALID');
  }
  try {
    assert.deepEqual(result, {
      qualification: 'OFFLINE_NONCE_PREDICATE_ONLY',
      status: 'VALID',
      recordedProofScope: {
        payer: FIXTURE_CONTEXT.payer,
        previousAccountHash: FIXTURE_CONTEXT.previousAccountHash,
        difficulty,
      },
      trust: EXPECTED_TRUST,
    });
    assert.deepEqual(Reflect.ownKeys(result), [
      'qualification', 'status', 'recordedProofScope', 'trust',
    ]);
  } catch {
    throw fixedFailure('PREDICATE', 'RESULT_SHAPE_REJECTED');
  }
  return result;
}

function qualifyInstalledGenerator(difficulty) {
  validateDifficulty(difficulty);
  if (generatorHalted) {
    const error = fixedFailure('LATCH', 'HALTED');
    lastGeneratorFailureClassification = error.classification;
    throw error;
  }
  generatorAttemptCount += 1;
  generatorQualification = 'FAIL';
  return runFixedChild(`generate-${difficulty}`)
    .then(result => exactQualifiedResult(
      difficulty,
      exactNonceCandidate(result),
    ))
    .then(result => {
      generatorVerifiedCount += 1;
      generatorQualification = 'PASS';
      return result;
    })
    .catch(error => {
      generatorHalted = true;
      generatorQualification = 'FAIL';
      if (error?.message === FIXED_REJECTION_MESSAGE &&
          error.classification !== undefined) {
        lastGeneratorFailureClassification = error.classification;
        throw error;
      }
      const classified = fixedFailure('PREDICATE', 'UNCLASSIFIED_REJECTION');
      lastGeneratorFailureClassification = classified.classification;
      throw classified;
    });
}

async function expectFixedFailure(promise, expected) {
  let observed;
  try {
    await promise;
  } catch (error) {
    observed = error;
  }
  assert.equal(observed?.message, FIXED_REJECTION_MESSAGE);
  assert.deepEqual(observed?.classification, expected);
}

function expectFixedThrow(callback, expected) {
  let observed;
  try {
    callback();
  } catch (error) {
    observed = error;
  }
  assert.equal(observed?.message, FIXED_REJECTION_MESSAGE);
  assert.deepEqual(observed?.classification, expected);
}

function diagnosticTest(name, body) {
  test(name, { concurrency: false }, async () => {
    const beforeGeneratorCounters = currentGeneratorCounterSnapshot();
    diagnosticTotals.tests += 1;
    try {
      await body();
      assert.equal(
        generatorCountersUnchanged(
          beforeGeneratorCounters,
          currentGeneratorCounterSnapshot(),
        ),
        true,
      );
      diagnosticTotals.pass += 1;
    } catch (error) {
      diagnosticTotals.fail += 1;
      throw error;
    }
  });
}

after(() => {
  const observedFailure = lastFailureClassification ?? {
    stage: 'NOT_RUN',
    failure: 'NOT_RUN',
  };
  const generatorFailure = lastGeneratorFailureClassification ?? {
    stage: 'NOT_RUN',
    failure: 'NOT_RUN',
  };
  const runKind = generatorAttemptCount === 0
    ? 'DIAGNOSTIC_ONLY'
    : 'GENERATOR_AND_DIAGNOSTIC';
  process.stdout.write(
    `scope=INSTALLED_POW_QUALIFICATION runKind=${runKind} `
      + 'totalsKind=DIAGNOSTIC_SUBSET '
      + `diagnosticTests=${diagnosticTotals.tests} `
      + `diagnosticPass=${diagnosticTotals.pass} `
      + `diagnosticFail=${diagnosticTotals.fail} `
      + `diagnosticSkipped=${diagnosticTotals.skipped} `
      + `diagnosticCancelled=${diagnosticTotals.cancelled} `
      + `diagnosticTodo=${diagnosticTotals.todo} `
      + `importClassification=${importClassification} `
      + `lastObservedFailureStage=${observedFailure.stage} `
      + `lastObservedFailure=${observedFailure.failure} `
      + `lastGeneratorFailureStage=${generatorFailure.stage} `
      + `lastGeneratorFailure=${generatorFailure.failure} `
      + `generatorAttemptCount=${generatorAttemptCount} `
      + `sdkInvocationObservedCount=${sdkInvocationObservedCount} `
      + `generatorVerifiedCount=${generatorVerifiedCount} `
      + `predicateVerificationCount=${predicateVerificationCount} `
      + `generatorQualification=${generatorQualification}\n`,
  );
});

test('installed SDK difficulty-2 output passes only the offline nonce predicate',
  { concurrency: false }, async () => {
    await qualifyInstalledGenerator(2);
  });

test('installed SDK difficulty-3 output passes only the offline nonce predicate',
  { concurrency: false }, async () => {
    await qualifyInstalledGenerator(3);
  });

diagnosticTest(
  'diagnostic counter bookkeeping preserves nonzero pre-existing evidence',
  () => {
    const before = generatorCounterSnapshot({
      generatorAttemptCount: 7,
      sdkInvocationObservedCount: 3,
    });
    const after = generatorCounterSnapshot({
      generatorAttemptCount: 7,
      sdkInvocationObservedCount: 3,
    });
    assert.deepEqual(before, {
      generatorAttemptCount: 7,
      sdkInvocationObservedCount: 3,
    });
    assert.equal(generatorCountersUnchanged(before, after), true);
  },
);

diagnosticTest('installed SDK import-only diagnostic remains non-authoritative',
  async () => {
    const beforePredicates = predicateVerificationCount;
    const result = await runFixedChild('import-only');
    importClassification = result.classification;
    assert.deepEqual(result, {
      kind: 'IMPORT_DIAGNOSTIC',
      classification: 'IMPORT_READY',
      networkStatus: 'NETWORK_DENIED',
    });
    assert.equal(Object.hasOwn(result, 'nonce'), false);
    assert.equal(predicateVerificationCount, beforePredicates);
  });

diagnosticTest('difficulty validation rejects without child creation or coercion',
  () => {
    let coercions = 0;
    let getterReads = 0;
    const coercive = {
      valueOf() { coercions += 1; return 2; },
      toString() { coercions += 1; return '2'; },
      [Symbol.toPrimitive]() { coercions += 1; return 2; },
    };
    const accessor = {};
    Object.defineProperty(accessor, 'valueOf', {
      get() { getterReads += 1; return () => 2; },
    });
    const beforeChildren = childCreationCount;
    const beforeAttempts = generatorAttemptCount;
    for (const difficulty of [
      undefined, null, Number.NaN, -1, -0, 0, 1, 2.5, 4,
      Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1,
      '2', new Number(2), coercive, accessor, 2n,
    ]) {
      assert.throws(() => qualifyInstalledGenerator(difficulty), TypeError);
    }
    assert.equal(childCreationCount, beforeChildren);
    assert.equal(generatorAttemptCount, beforeAttempts);
    assert.equal(coercions, 0);
    assert.equal(getterReads, 0);
  });

diagnosticTest(
  'fixed frame validation rejects empty, truncated, malformed, high-bit, oversized, nonzero, and child-error outcomes',
  async () => {
    const beforePredicates = predicateVerificationCount;
    const cases = [
      ['empty', { stage: 'FRAME', failure: 'LENGTH_REJECTED' }],
      ['truncated', { stage: 'FRAME', failure: 'LENGTH_REJECTED' }],
      ['malformed', { stage: 'FRAME', failure: 'BYTE_REJECTED' }],
      ['high-bit', { stage: 'FRAME', failure: 'BYTE_REJECTED' }],
      ['oversized', { stage: 'FRAME', failure: 'TOO_LONG' }],
      ['nonzero', { stage: 'EXIT', failure: 'NONZERO' }],
      ['child-error', { stage: 'EXIT', failure: 'NONZERO' }],
    ];
    for (const [mode, expected] of cases) {
      await expectFixedFailure(runFixedChild(mode), expected);
      assert.equal(lastLifecycle.closeObserved, true);
      assert.equal(lastLifecycle.networkDenialObserved, true);
      assert.equal(lastLifecycle.sdkInvocationObserved, false);
    }
    assert.equal(predicateVerificationCount, beforePredicates);
  });

diagnosticTest('a clean child exit cannot elevate a canonical known-invalid nonce',
  async () => {
    const result = await runFixedChild('invalid-nonce');
    const returnedNonce = exactNonceCandidate(result);
    assert.equal(returnedNonce, KNOWN_INVALID_NONCE);
    const beforePredicates = predicateVerificationCount;
    expectFixedThrow(
      () => exactQualifiedResult(2, returnedNonce),
      { stage: 'PREDICATE', failure: 'NONCE_INVALID' },
    );
    assert.equal(predicateVerificationCount, beforePredicates + 1);
  });

diagnosticTest('fixed delay reaches the hard deadline and awaits owned-child close',
  async () => {
    const started = Date.now();
    await expectFixedFailure(
      runFixedChild('delayed'),
      { stage: 'DEADLINE', failure: 'LIMIT_REACHED' },
    );
    const elapsed = Date.now() - started;
    assert.equal(elapsed >= CHILD_DEADLINE_MS - 25, true);
    assert.equal(elapsed < CHILD_DEADLINE_MS + 2_000, true);
    assert.deepEqual(lastLifecycle, {
      closeObserved: true,
      deadlineObserved: true,
      terminationRequested: true,
      networkDenialObserved: true,
      sdkInvocationObserved: false,
    });
  });

diagnosticTest(
  'trusted installed-artifact accidental-access safeguards stay fixed, private, and non-authoritative',
  async () => {
    const major = Number(process.versions.node.split('.')[0]);
    assert.equal(Number.isInteger(major) && major >= 24, true);
    const beforeChildren = childCreationCount;
    assert.throws(() => runFixedChild('arbitrary-mode'), TypeError);
    assert.equal(childCreationCount, beforeChildren);
    await expectFixedFailure(
      runFixedChild('empty'),
      { stage: 'FRAME', failure: 'LENGTH_REJECTED' },
    );
    assert.deepEqual(lastInvocation, {
      executableIsProcessExecPath: true,
      modeIsFinalArgument: true,
      permissionArgumentCount: 1,
      readAllowanceCount: READ_ROOTS.length,
      hasWriteAllowance: false,
      hasChildAllowance: false,
      hasWorkerAllowance: false,
      hasAddonAllowance: false,
      hasWasiAllowance: false,
      hasNetworkAllowance: false,
      environmentKeyCount: 0,
      cwdIsFixed: true,
      detached: false,
      shell: false,
      stdioShape: 'ignore,ignore,ignore,pipe',
      hasExecArgvOption: false,
    });
    assert.equal(lastLifecycle.closeObserved, true);
    assert.equal(lastLifecycle.networkDenialObserved, true);
    assert.equal(lastLifecycle.sdkInvocationObserved, false);
    assert.equal(READ_ROOTS.includes(CHILD_CWD), false);
    assert.equal(READ_ROOTS.includes(
      fileURLToPath(new URL('../node_modules/', import.meta.url)),
    ), false);
    assert.equal(READ_ROOTS.includes(
      fileURLToPath(new URL('../', import.meta.url)),
    ), false);
    assert.equal(new Set(READ_ROOTS).size, READ_ROOTS.length);

    const childSource = readFileSync(CHILD_PATH, 'utf8');
    const boundaryPosition = childSource.indexOf(
      'const NETWORK_BOUNDARY_READY = installNetworkDenial();',
    );
    const probePosition = childSource.indexOf(
      'const NETWORK_DENIAL_PROBE_READY = probeConfirmedNetworkDenial();',
    );
    const sdkImportPosition = childSource.indexOf(
      "'../node_modules/znn-typescript-sdk/dist/pow/pow.js'",
    );
    assert.equal(
      boundaryPosition >= 0 && boundaryPosition < probePosition &&
        probePosition < sdkImportPosition,
      true,
    );
    assert.equal(childSource.match(/confirmedDeny\(\);/g)?.length, 1);
    assert.match(childSource, /confirmedDeny !== denyNetwork/);
    const diagnosticStart = childSource.indexOf('async function diagnoseImport()');
    const diagnosticEnd = childSource.indexOf('async function main()');
    assert.equal(
      diagnosticStart >= 0 && diagnosticStart < diagnosticEnd,
      true,
    );
    const diagnosticSource = childSource.slice(diagnosticStart, diagnosticEnd);
    assert.doesNotMatch(
      diagnosticSource,
      /\b(?:init|generate|benchmark|createPowModule|WebAssembly)\s*\(/,
    );
    assert.equal(
      childSource.match(/znn-typescript-sdk\/dist\/pow\/pow\.js/g)?.length,
      1,
    );
    assert.doesNotMatch(
      childSource,
      /(?:from\s*|import\(\s*)['"]znn-typescript-sdk['"]/,
    );
    assert.doesNotMatch(
      childSource,
      /\b(?:Zenon|getInstance|setPowProvider|prepareBlock|sign|wallet|RPC)\b/,
    );
    assert.doesNotMatch(childSource, /process\.env|process\.send|node:child_process/);
    assert.doesNotMatch(
      childSource,
      /\b(?:writeFile|appendFile|mkdir|mkdtemp|openSync|createWriteStream)\s*\(/,
    );
    assert.doesNotMatch(
      childSource,
      /\.(?:connect|listen|request|get|createServer|createConnection|createSocket)\s*\(/,
    );
  });
