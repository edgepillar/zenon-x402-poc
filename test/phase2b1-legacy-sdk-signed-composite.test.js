import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { invokeLegacySdk105SignedComposite } from '../src/zenon/internal/legacy-sdk-1-0-5-signed-composite.js';

const CHILD_SUCCESS = 'PHASE2B1_ACTIVATED\n';
const CHILD_SOURCE = String.raw`
const SUCCESS = 'PHASE2B1_ACTIVATED\n';
const FAILURE = 'PHASE2B1_CHILD_FAILED\n';
const writeStdout = process.stdout.write.bind(process.stdout);
const writeStderr = process.stderr.write.bind(process.stderr);
let terminalWritten = false;

function terminateWithFailure() {
  if (!terminalWritten) {
    terminalWritten = true;
    writeStderr(FAILURE);
  }
  process.exit(1);
}

process.once('uncaughtException', terminateWithFailure);
process.once('unhandledRejection', terminateWithFailure);

const originalConsole = globalThis.console;
const originalConsoleDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'console');
const originalConsoleDescriptors = Object.getOwnPropertyDescriptors(originalConsole);
const suppressedConsole = new Proxy(Object.create(null), {
  get() {
    return () => {};
  },
});

let consoleSuppressed = false;
let session;
let profilerEnabled = false;
let coverageStarted = false;
let completed = false;

function requireCondition(condition) {
  if (!condition) throw new Error('PHASE2B1_CHILD_CHECK_FAILED');
}

function postInspector(method, parameters) {
  return new Promise((resolve, reject) => {
    session.post(method, parameters ?? {}, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

function descriptorsMatch(left, right) {
  if (!left || !right) return left === right;
  return left.configurable === right.configurable &&
    left.enumerable === right.enumerable &&
    left.writable === right.writable &&
    left.value === right.value &&
    left.get === right.get &&
    left.set === right.set;
}

function consoleStateMatches() {
  if (!descriptorsMatch(
    Object.getOwnPropertyDescriptor(globalThis, 'console'),
    originalConsoleDescriptor,
  )) return false;
  const current = Object.getOwnPropertyDescriptors(originalConsole);
  const expectedKeys = Reflect.ownKeys(originalConsoleDescriptors);
  const currentKeys = Reflect.ownKeys(current);
  if (expectedKeys.length !== currentKeys.length) return false;
  return expectedKeys.every((key, index) =>
    key === currentKeys[index] &&
    descriptorsMatch(current[key], originalConsoleDescriptors[key]));
}

try {
  requireCondition(originalConsoleDescriptor && 'value' in originalConsoleDescriptor);
  Object.defineProperty(globalThis, 'console', {
    ...originalConsoleDescriptor,
    value: suppressedConsole,
  });
  consoleSuppressed = true;

  const [{ readFile }, { Session }, { isDeepStrictEqual }, harness] = await Promise.all([
    import('node:fs/promises'),
    import('node:inspector'),
    import('node:util'),
    import(process.env.PHASE2B1_HARNESS_URL),
  ]);
  const fixtureId = process.env.PHASE2B1_FIXTURE_ID;
  requireCondition(fixtureId === 'A' || fixtureId === 'B' || fixtureId === 'C');
  const manifest = JSON.parse(await readFile(
    new URL(process.env.PHASE2B1_MANIFEST_URL),
    'utf8',
  ));
  const expected = manifest.scenarios?.[fixtureId];
  requireCondition(expected !== undefined);
  const helperModuleUrl = new URL(process.env.PHASE2B1_HELPER_URL).href;

  session = new Session();
  session.connect();
  await postInspector('Profiler.enable');
  profilerEnabled = true;
  await postInspector('Profiler.startPreciseCoverage', {
    callCount: true,
    detailed: true,
  });
  coverageStarted = true;
  const captured = await harness.capturePhase2AScenario(fixtureId);
  const coverage = await postInspector('Profiler.takePreciseCoverage');

  requireCondition(isDeepStrictEqual(
    captured.golden,
    manifest.scenarios[fixtureId],
  ) === true);
  requireCondition(isDeepStrictEqual(captured.outcome, { status: 'fulfilled' }));
  requireCondition(isDeepStrictEqual(captured.restoration, {
    singletonDescriptorExact: true,
    staticDescriptorsExact: true,
    instanceDescriptorsExact: true,
    keyStoreDescriptorsExact: true,
    keyPairDescriptorsExact: true,
    templateDescriptorsExact: true,
    globalFetchDescriptorExact: true,
    environmentExact: true,
  }));
  requireCondition(isDeepStrictEqual(captured.failureFacts, {
    plasmaFailureObserved: false,
    keyCleanupFailureObserved: false,
    connectionCleanupFailureObserved: false,
  }));
  requireCondition(isDeepStrictEqual(captured.releaseEvidence, {
    queuedAfterInitialize: true,
    probeEntered: true,
    connectionCleanupSeenBeforeProbe: true,
    probeResult: { status: 'entered' },
    operationSettled: true,
  }));
  requireCondition(captured.networkTripwireCalls === 0);
  requireCondition(captured.lifecycle?.publicationCalls === 0);
  requireCondition(captured.lifecycle?.networkTripwireCalls === 0);
  requireCondition(captured.lifecycle?.fetchCalls === 2);
  requireCondition(captured.deferredEvidence === null);
  requireCondition(isDeepStrictEqual(
    captured.lifecycle,
    expected.expected.lifecycle,
  ));
  requireCondition(isDeepStrictEqual(
    captured.harnessCleanupFacts,
    expected.expected.harnessCleanupFacts,
  ));
  requireCondition(
    captured.harnessCleanupFacts?.allSensitiveBuffersZeroAfterHarnessTeardown === true,
  );
  requireCondition(
    captured.harnessCleanupFacts?.pairWipes?.length === 2 &&
    captured.harnessCleanupFacts.pairWipes.every(record =>
      record.harnessTeardownWipeAttempts === 1 &&
      record.privateZeroAfterHarnessTeardown === true &&
      record.publicZeroAfterHarnessTeardown === true),
  );
  requireCondition(
    captured.observedExecutionTrace.filter(
      event => event.operation === 'Zenon.prepareBlock.enter',
    ).length === 1,
  );
  requireCondition(
    captured.observedExecutionTrace.filter(
      event => event.operation === 'Zenon.prepareBlock.return',
    ).length === 1,
  );

  const scripts = coverage.result.filter(script => script.url === helperModuleUrl);
  requireCondition(scripts.length === 1);
  const functions = scripts[0].functions.filter(
    entry => entry.functionName === 'invokeLegacySdk105SignedComposite',
  );
  requireCondition(functions.length === 1);
  requireCondition(Array.isArray(functions[0].ranges) && functions[0].ranges.length > 0);
  requireCondition(functions[0].ranges[0].count === 1);
  completed = true;
} catch {
  completed = false;
} finally {
  if (coverageStarted) {
    try {
      await postInspector('Profiler.stopPreciseCoverage');
    } catch {
      completed = false;
    }
  }
  if (profilerEnabled) {
    try {
      await postInspector('Profiler.disable');
    } catch {
      completed = false;
    }
  }
  if (session) {
    try {
      session.disconnect();
    } catch {
      completed = false;
    }
  }
  if (consoleSuppressed) {
    try {
      Object.defineProperty(globalThis, 'console', originalConsoleDescriptor);
    } catch {
      completed = false;
    }
  }
  if (!consoleStateMatches()) completed = false;
}

if (completed) {
  terminalWritten = true;
  writeStdout(SUCCESS);
} else {
  terminalWritten = true;
  writeStderr(FAILURE);
  process.exitCode = 1;
}
`;

const HARNESS_URL = new URL('../test-support/phase2a-sdk-harness.js', import.meta.url).href;
const MANIFEST_URL = new URL('./fixtures/phase2a-exact-client-goldens.v1.json', import.meta.url).href;
const HELPER_URL = new URL(
  '../src/zenon/internal/legacy-sdk-1-0-5-signed-composite.js',
  import.meta.url,
).href;

function requireSuccessfulChild(child) {
  if (
    child.error !== undefined ||
    child.status !== 0 ||
    child.signal !== null ||
    child.stdout !== CHILD_SUCCESS ||
    child.stderr !== ''
  ) {
    throw new Error('Phase 2B.1 activation child failed');
  }
}

test('legacy SDK 1.0.5 signed-composite boundary is transparent and active', async () => {
  const block = Object.freeze({ kind: 'synthetic-account-block' });
  let keyCleanupCalls = 0;
  const keyPair = Object.freeze({
    kind: 'synthetic-public-key-capability',
    clear() {
      keyCleanupCalls += 1;
    },
  });
  const prepared = Object.freeze({ kind: 'synthetic-prepared-block' });
  const originalPromise = Promise.resolve(prepared);
  let calls = 0;
  let observedThis;
  let observedBlock;
  let observedKeyPair;
  const zenon = Object.freeze({
    prepareBlock(receivedBlock, receivedKeyPair) {
      calls += 1;
      observedThis = this;
      observedBlock = receivedBlock;
      observedKeyPair = receivedKeyPair;
      return originalPromise;
    },
  });

  const returnedPromise = invokeLegacySdk105SignedComposite(zenon, block, keyPair);
  assert.strictEqual(returnedPromise, originalPromise);
  assert.strictEqual(await returnedPromise, prepared);
  assert.equal(calls, 1);
  assert.strictEqual(observedThis, zenon);
  assert.strictEqual(observedBlock, block);
  assert.strictEqual(observedKeyPair, keyPair);
  assert.equal(keyCleanupCalls, 0);
  assert.deepEqual(block, { kind: 'synthetic-account-block' });

  const synchronousSentinel = new Error('Phase 2B.1 synthetic synchronous sentinel');
  let observedSynchronousError;
  let synchronousCalls = 0;
  try {
    invokeLegacySdk105SignedComposite(Object.freeze({
      prepareBlock() {
        synchronousCalls += 1;
        throw synchronousSentinel;
      },
    }), block, keyPair);
  } catch (error) {
    observedSynchronousError = error;
  }
  assert.equal(synchronousCalls, 1);
  assert.strictEqual(observedSynchronousError, synchronousSentinel);
  assert.equal(keyCleanupCalls, 0);

  const rejectionSentinel = new Error('Phase 2B.1 synthetic rejection sentinel');
  const originalRejection = Promise.reject(rejectionSentinel);
  let rejectionCalls = 0;
  const returnedRejection = invokeLegacySdk105SignedComposite(Object.freeze({
    prepareBlock() {
      rejectionCalls += 1;
      return originalRejection;
    },
  }), block, keyPair);
  assert.strictEqual(returnedRejection, originalRejection);
  const observedRejection = await returnedRejection.then(
    () => null,
    error => error,
  );
  assert.equal(rejectionCalls, 1);
  assert.strictEqual(observedRejection, rejectionSentinel);
  assert.equal(keyCleanupCalls, 0);

  // Stack, caller, and performance details are non-contractual. Precise
  // coverage below is supplementary activation evidence and is not fixture-recorded.
  for (const fixtureId of ['A', 'B', 'C']) {
    const child = spawnSync(
      process.execPath,
      ['--no-warnings', '--input-type=module', '--eval', CHILD_SOURCE],
      {
        encoding: 'utf8',
        env: {
          PHASE2B1_FIXTURE_ID: fixtureId,
          PHASE2B1_HARNESS_URL: HARNESS_URL,
          PHASE2B1_MANIFEST_URL: MANIFEST_URL,
          PHASE2B1_HELPER_URL: HELPER_URL,
        },
        killSignal: 'SIGKILL',
        maxBuffer: 64 * 1024,
        shell: false,
        timeout: 15_000,
      },
    );
    requireSuccessfulChild(child);
  }
});
