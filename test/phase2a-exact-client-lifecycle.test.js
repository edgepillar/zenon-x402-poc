import assert from 'node:assert/strict';
import test from 'node:test';
import { runPhase2AIsolated } from '../test-support/phase2a-sdk-harness.js';

const EMPTY_HASH = '0'.repeat(64);
const ZERO_PUBLIC_KEY = Buffer.alloc(32).toString('base64');
const PREPARE_API_OPERATIONS = Object.freeze([
  'ledger.getFrontierAccountBlock',
  'ledger.getFrontierMomentum',
  'embedded.plasma.getRequiredPoWForAccountBlock',
]);
const EXPECTED_RESTORATION = Object.freeze({
  singletonDescriptorExact: true,
  staticDescriptorsExact: true,
  instanceDescriptorsExact: true,
  keyStoreDescriptorsExact: true,
  keyPairDescriptorsExact: true,
  templateDescriptorsExact: true,
  globalFetchDescriptorExact: true,
  environmentExact: true,
});
const NO_FAILURES = Object.freeze({
  plasmaFailureObserved: false,
  keyCleanupFailureObserved: false,
  connectionCleanupFailureObserved: false,
});

function errorCore({
  constructorName,
  name = constructorName,
  message,
  code = null,
  outcome = null,
  operation = null,
}) {
  return { constructorName, name, message, code, outcome, operation };
}

const CONNECTION_FAILURE_CORE = Object.freeze(errorCore({
  constructorName: 'Error',
  message: 'Phase 2A synthetic failure',
  code: 'phase2a_connection_cleanup_failure',
}));
const TIMEOUT_CLEANUP_FIRST_CORE = Object.freeze(errorCore({
  constructorName: 'Error',
  message: 'Phase 2A synthetic failure',
  code: 'phase2a_connection_cleanup_failure_attempt_1',
}));
const TIMEOUT_CLEANUP_LATE_CORE = Object.freeze(errorCore({
  constructorName: 'Error',
  message: 'Phase 2A synthetic failure',
  code: 'phase2a_connection_cleanup_failure_attempt_3',
}));
const READ_TIMEOUT_CORE = Object.freeze(errorCore({
  constructorName: 'LiveRuntimeError',
  message: 'Zenon RPC observation is unavailable',
  code: 'live_rpc_read_timeout',
  outcome: 'OPERATION_UNAVAILABLE',
  operation: 'stats.networkInfo',
}));

function rejected(core, {
  cause = null,
  teardownDiagnostic = null,
  lateTeardownDiagnostic = null,
  ownEnumerableFieldNames = [],
  ownEnumerablePrimitiveValues = {},
} = {}) {
  return {
    status: 'rejected',
    ...core,
    hasCause: cause !== null,
    cause,
    teardownDiagnostic,
    lateTeardownDiagnostic,
    ownEnumerableFieldNames,
    ownEnumerablePrimitiveValues,
  };
}

function offlineRejection() {
  return rejected(errorCore({
    constructorName: 'Error',
    message: 'PoC supports only its exact experimental live or mock network label',
  }));
}

function syntheticRejection(code) {
  return rejected(errorCore({
    constructorName: 'Error',
    message: 'Phase 2A synthetic failure',
    code,
  }), {
    ownEnumerableFieldNames: ['code'],
    ownEnumerablePrimitiveValues: { code },
  });
}

function safetyRejection(code, cause = null) {
  return rejected(errorCore({
    constructorName: 'ZenonSafetyError',
    message: code,
    code,
  }), {
    cause,
    ownEnumerableFieldNames: ['code', 'name'],
    ownEnumerablePrimitiveValues: { code, name: 'ZenonSafetyError' },
  });
}

function poisonedRejection(cause) {
  const code = 'live_runtime_poisoned_restart_required';
  return rejected(errorCore({
    constructorName: 'LiveRuntimeError',
    message: code,
    code,
  }), {
    cause,
    ownEnumerableFieldNames: ['code', 'name'],
    ownEnumerablePrimitiveValues: { code, name: 'LiveRuntimeError' },
  });
}

function timeoutRejection() {
  return rejected(READ_TIMEOUT_CORE, {
    teardownDiagnostic: TIMEOUT_CLEANUP_FIRST_CORE,
    lateTeardownDiagnostic: TIMEOUT_CLEANUP_LATE_CORE,
    ownEnumerableFieldNames: [
      'code',
      'lateTeardownError',
      'name',
      'operation',
      'outcome',
      'teardownError',
    ],
    ownEnumerablePrimitiveValues: {
      code: 'live_rpc_read_timeout',
      name: 'LiveRuntimeError',
      operation: 'stats.networkInfo',
      outcome: 'OPERATION_UNAVAILABLE',
    },
  });
}

function adversarialProjectionRejection() {
  return rejected(errorCore({
    constructorName: 'Error',
    message: 'Phase 2A synthetic failure',
  }), {
    ownEnumerableFieldNames: ['[redacted-field]', 'code', 'operation', 'outcome'],
    ownEnumerablePrimitiveValues: {
      code: '[redacted]',
      operation: '[redacted]',
      outcome: '[redacted]',
      '[redacted-field]': '[redacted]',
    },
  });
}

function assertRestored(restoration) {
  assert.deepEqual(restoration, EXPECTED_RESTORATION);
}

function assertUnifiedTrace(result) {
  assert.deepEqual(
    result.observedExecutionTrace.map(entry => entry.sequence),
    Array.from({ length: result.observedExecutionTrace.length }, (_, index) => index + 1),
  );
}

function traceOperations(result) {
  return result.observedExecutionTrace.map(entry => entry.operation);
}

function assertOrdered(result, operations) {
  const trace = traceOperations(result);
  let cursor = -1;
  for (const operation of operations) {
    cursor = trace.indexOf(operation, cursor + 1);
    assert.notEqual(cursor, -1, `missing ordered operation ${operation}`);
  }
}

function assertNoPairs(result) {
  assert.deepEqual({
    constructorTemporaryPairs: result.lifecycle.constructorTemporaryPairs,
    operationPairs: result.lifecycle.operationPairs,
    temporary: result.lifecycle.temporary,
    operation: result.lifecycle.operation,
  }, {
    constructorTemporaryPairs: 0,
    operationPairs: 0,
    temporary: null,
    operation: null,
  });
  assert.deepEqual(result.harnessCleanupFacts, {
    pairWipes: [],
    allSensitiveBuffersZeroAfterHarnessTeardown: true,
  });
}

function assertPairLifecycle(result, {
  productionClearOutcome = 'returned',
  operationNonzeroAfterProduction = false,
} = {}) {
  assert.equal(result.lifecycle.constructorTemporaryPairs, 1);
  assert.equal(result.lifecycle.operationPairs, 1);
  assert.deepEqual(result.lifecycle.temporary, {
    index: 0,
    productionClearAttempts: 0,
    productionClearOutcome: 'not-called',
    privateNonzeroBeforeProductionClear: null,
    publicNonzeroBeforeProductionClear: null,
    privateNonzeroAfterProductionClear: null,
    publicNonzeroAfterProductionClear: null,
    privateNonzeroBeforeHarnessTeardown: true,
    publicNonzeroBeforeHarnessTeardown: true,
    harnessTeardownWipeAttempts: 0,
  });
  assert.deepEqual(result.lifecycle.operation, {
    index: 0,
    productionClearAttempts: 1,
    productionClearOutcome,
    privateNonzeroBeforeProductionClear: true,
    publicNonzeroBeforeProductionClear: true,
    privateNonzeroAfterProductionClear: operationNonzeroAfterProduction,
    publicNonzeroAfterProductionClear: operationNonzeroAfterProduction,
    privateNonzeroBeforeHarnessTeardown: operationNonzeroAfterProduction,
    publicNonzeroBeforeHarnessTeardown: operationNonzeroAfterProduction,
    harnessTeardownWipeAttempts: 0,
  });
  assert.deepEqual(result.harnessCleanupFacts, {
    pairWipes: [
      {
        role: 'constructor-temporary',
        index: 0,
        harnessTeardownWipeAttempts: 1,
        privateZeroAfterHarnessTeardown: true,
        publicZeroAfterHarnessTeardown: true,
      },
      {
        role: 'operation',
        index: 0,
        harnessTeardownWipeAttempts: 1,
        privateZeroAfterHarnessTeardown: true,
        publicZeroAfterHarnessTeardown: true,
      },
    ],
    allSensitiveBuffersZeroAfterHarnessTeardown: true,
  });
}

function assertNoPublication(result, fetchCalls = 1) {
  assert.equal(result.lifecycle.publicationCalls, 0);
  assert.equal(result.lifecycle.networkTripwireCalls, 0);
  assert.equal(result.lifecycle.fetchCalls, fetchCalls);
}

function assertOrdinaryOnlineRelease(result) {
  assert.deepEqual(result.releaseEvidence, {
    queuedAfterInitialize: true,
    probeEntered: true,
    connectionCleanupSeenBeforeProbe: true,
    probeResult: { status: 'entered' },
    operationSettled: true,
  });
  assert.equal(result.lifecycle.connectionClearCalls, 1);
  assert.equal(result.lifecycle.clientOwnAfterProduction, true);
  assert.equal(result.lifecycle.clientUndefinedAfterProduction, true);
  assertOrdered(result, ['Zenon.clearConnection', 'ownerProbe.enter']);
  assertRestored(result.restoration);
}

function assertPrepareApiTrace(result, lastOutcome) {
  assert.deepEqual(
    result.prepareBlockApiBoundaryTrace.map(entry => ({
      operation: entry.operation,
      phase: entry.phase,
      outcome: entry.outcome,
    })),
    PREPARE_API_OPERATIONS.map((operation, index) => ({
      operation,
      phase: 'prepare',
      outcome: index === PREPARE_API_OPERATIONS.length - 1 ? lastOutcome : 'fulfilled',
    })),
  );
}

function assertRealPlasmaFailure(result) {
  assert.deepEqual(result.outcome, syntheticRejection('phase2a_plasma_failure'));
  assert.deepEqual(result.failureFacts, {
    plasmaFailureObserved: true,
    keyCleanupFailureObserved: false,
    connectionCleanupFailureObserved: false,
  });
  assertPrepareApiTrace(result, 'rejected');
  assert.deepEqual(traceOperations(result), [
    'fetch.initial',
    'Zenon.setNetworkID',
    'Zenon.getInstance',
    'zenon.initialize',
    'stats.networkInfo',
    'stats.syncInfo',
    'ledger.getFrontierMomentum',
    'authenticateChainProfile',
    'Zenon.setChainID',
    'KeyStore.fromMnemonic',
    'KeyStore.getKeyPair',
    'KeyPair.getAddress',
    'KeyStore.getKeyPair',
    'AccountBlockTemplate.send.enter',
    'Zenon.getChainIdentifier',
    'block-stage.sendReturn',
    'Zenon.prepareBlock.enter',
    'block-stage.prepareEntry',
    'Zenon.getInstance',
    'KeyPair.getAddress',
    'KeyPair.getPublicKey',
    'ledger.getFrontierAccountBlock',
    'block-stage.frontierAccountEntry',
    'ledger.getFrontierMomentum',
    'block-stage.preparationMomentumEntry',
    'embedded.plasma.getRequiredPoWForAccountBlock',
    'block-stage.plasmaEntry',
    'KeyPair.clear.enter',
    'block-stage.beforeProductionClear',
    'block-stage.afterProductionClear',
    'Zenon.clearConnection',
    'ownerProbe.enter',
  ]);

  const stages = result.blockStageSnapshots;
  assert.deepEqual(
    Object.fromEntries(Object.entries(stages).map(([stage, value]) => [stage, value !== null])),
    {
      sendReturn: true,
      prepareEntry: true,
      frontierAccountEntry: true,
      preparationMomentumEntry: true,
      plasmaEntry: true,
      powProviderEntry: false,
      signEntry: false,
      prepareReturn: false,
      beforeProductionClear: true,
      afterProductionClear: true,
    },
  );
  assert.equal(stages.sendReturn.block.data, '');
  assert.notEqual(stages.prepareEntry.block.data, '');
  assert.equal(stages.prepareEntry.block.address, stages.sendReturn.block.address);
  assert.equal(stages.prepareEntry.block.publicKey, '');
  assert.deepEqual(stages.frontierAccountEntry.block, stages.preparationMomentumEntry.block);
  assert.equal(stages.frontierAccountEntry.block.height, 0);
  assert.notEqual(stages.frontierAccountEntry.block.address, stages.sendReturn.block.address);
  assert.notEqual(stages.frontierAccountEntry.block.publicKey, '');
  assert.equal(stages.plasmaEntry.block.height, 1);
  assert.equal(stages.plasmaEntry.block.previousHash, EMPTY_HASH);
  assert.equal(stages.plasmaEntry.block.momentumAcknowledged.height, 101);
  assert.notEqual(stages.plasmaEntry.block.momentumAcknowledged.hash, EMPTY_HASH);
  assert.equal(stages.plasmaEntry.block.hash, EMPTY_HASH);
  assert.equal(stages.plasmaEntry.block.fusedPlasma, 0);
  assert.equal(stages.plasmaEntry.block.difficulty, 0);
  assert.equal(stages.plasmaEntry.block.nonce, '');
  assert.equal(stages.plasmaEntry.block.signature, '');
  assert.deepEqual({
    sendReturn: stages.sendReturn.sequence,
    prepareEntry: stages.prepareEntry.sequence,
    frontierAccountEntry: stages.frontierAccountEntry.sequence,
    preparationMomentumEntry: stages.preparationMomentumEntry.sequence,
    plasmaEntry: stages.plasmaEntry.sequence,
    beforeProductionClear: stages.beforeProductionClear.sequence,
    afterProductionClear: stages.afterProductionClear.sequence,
  }, {
    sendReturn: 16,
    prepareEntry: 18,
    frontierAccountEntry: 23,
    preparationMomentumEntry: 25,
    plasmaEntry: 27,
    beforeProductionClear: 29,
    afterProductionClear: 30,
  });
  assert.deepEqual(stages.beforeProductionClear.block, stages.plasmaEntry.block);
  assert.deepEqual(stages.afterProductionClear, {
    sequence: 30,
    block: { ...stages.beforeProductionClear.block, publicKey: ZERO_PUBLIC_KEY },
    clearOutcome: 'returned',
  });
  assert.deepEqual(result.payloadTransactionSnapshots, {
    productionToJson: null,
    beforeProductionClear: null,
    afterProductionClear: null,
  });
}

test('Phase 2A isolated lifecycle behavior remains exact', async t => {
  await t.test('offline rejection precedes SDK ownership and key derivation', () => {
    const result = runPhase2AIsolated('lifecycle', 'offline_failure');
    assert.deepEqual(result.outcome, offlineRejection());
    assert.deepEqual(result.releaseEvidence, {
      queuedAfterInitialize: false,
      probeEntered: false,
      connectionCleanupSeenBeforeProbe: false,
      probeResult: { status: 'not-queued' },
      operationSettled: true,
    });
    assert.deepEqual(traceOperations(result), ['fetch.initial']);
    assert.deepEqual(result.sdkApiRpcMethodBoundaryTrace, []);
    assert.deepEqual(result.prepareBlockApiBoundaryTrace, []);
    assert.deepEqual(result.failureFacts, NO_FAILURES);
    assertNoPairs(result);
    assert.equal(result.lifecycle.connectionClearCalls, 0);
    assertNoPublication(result);
    assertRestored(result.restoration);
    assertUnifiedTrace(result);
  });

  await t.test('custom asset rejection precedes key derivation', () => {
    const result = runPhase2AIsolated('lifecycle', 'asset_failure');
    assert.deepEqual(result.outcome, safetyRejection('asset_not_found'));
    assert.deepEqual(result.failureFacts, NO_FAILURES);
    assertNoPairs(result);
    assertNoPublication(result);
    assert.deepEqual(result.prepareBlockApiBoundaryTrace, []);
    assertOrdered(result, ['embedded.token.getByZts', 'Zenon.clearConnection', 'ownerProbe.enter']);
    assertOrdinaryOnlineRelease(result);
    assertUnifiedTrace(result);
  });

  await t.test('real SDK prepareBlock rejects at its Plasma API boundary after partial mutation', () => {
    const result = runPhase2AIsolated('lifecycle', 'prepare_failure');
    assertRealPlasmaFailure(result);
    assertPairLifecycle(result);
    assertNoPublication(result);
    assertOrdinaryOnlineRelease(result);
    assertUnifiedTrace(result);
  });

  await t.test('error projection redacts unapproved codes, fields, and secret-shaped values', () => {
    const result = runPhase2AIsolated('lifecycle', 'projection_redaction');
    assert.deepEqual(result.outcome, adversarialProjectionRejection());
    assert.deepEqual(result.failureFacts, {
      plasmaFailureObserved: true,
      keyCleanupFailureObserved: false,
      connectionCleanupFailureObserved: false,
    });
    assertPairLifecycle(result);
    assertPrepareApiTrace(result, 'rejected');
    assertNoPublication(result);
    assertOrdered(result, [
      'embedded.plasma.getRequiredPoWForAccountBlock',
      'KeyPair.clear.enter',
      'Zenon.clearConnection',
      'ownerProbe.enter',
    ]);
    assertOrdinaryOnlineRelease(result);
    assertUnifiedTrace(result);
  });

  await t.test('post-sign preflight rejection clears the operation key before connection cleanup', () => {
    const result = runPhase2AIsolated('lifecycle', 'post_sign_failure');
    assert.deepEqual(result.outcome, safetyRejection('invalid_signature'));
    assert.deepEqual(result.failureFacts, NO_FAILURES);
    assertPairLifecycle(result);
    assertPrepareApiTrace(result, 'fulfilled');
    assertNoPublication(result);
    assertOrdered(result, [
      'KeyPair.sign',
      'AccountBlockTemplate.toJson',
      'KeyPair.clear.enter',
      'block-stage.afterProductionClear',
      'Zenon.clearConnection',
      'ownerProbe.enter',
    ]);
    assertOrdinaryOnlineRelease(result);
    assertUnifiedTrace(result);
  });

  for (const {
    kind,
    productionClearOutcome,
    operationNonzeroAfterProduction,
    plasmaFailureObserved,
  } of [
    {
      kind: 'key_clear_throw_before',
      productionClearOutcome: 'threw-before',
      operationNonzeroAfterProduction: true,
      plasmaFailureObserved: false,
    },
    {
      kind: 'key_clear_then_throw',
      productionClearOutcome: 'threw-after',
      operationNonzeroAfterProduction: false,
      plasmaFailureObserved: false,
    },
    {
      kind: 'key_clear_throw_before_after_work',
      productionClearOutcome: 'threw-before',
      operationNonzeroAfterProduction: true,
      plasmaFailureObserved: true,
    },
    {
      kind: 'key_clear_then_throw_after_work',
      productionClearOutcome: 'threw-after',
      operationNonzeroAfterProduction: false,
      plasmaFailureObserved: true,
    },
  ]) {
    await t.test(`${kind} preserves key-cleanup precedence and post-harness erasure`, () => {
      const result = runPhase2AIsolated('lifecycle', kind);
      assert.deepEqual(result.outcome, safetyRejection('key_cleanup_failed'));
      assert.deepEqual(result.failureFacts, {
        plasmaFailureObserved,
        keyCleanupFailureObserved: true,
        connectionCleanupFailureObserved: false,
      });
      assertPairLifecycle(result, { productionClearOutcome, operationNonzeroAfterProduction });
      assertNoPublication(result);
      assert.equal(
        result.blockStageSnapshots.afterProductionClear.clearOutcome,
        productionClearOutcome,
      );
      if (plasmaFailureObserved) {
        assertPrepareApiTrace(result, 'rejected');
        assert.equal(traceOperations(result).includes('KeyPair.sign'), false);
      } else {
        assertPrepareApiTrace(result, 'fulfilled');
        assertOrdered(result, ['KeyPair.sign', 'AccountBlockTemplate.toJson', 'KeyPair.clear.enter']);
      }
      assertOrdered(result, [
        'embedded.plasma.getRequiredPoWForAccountBlock',
        'KeyPair.clear.enter',
        'block-stage.afterProductionClear',
        'Zenon.clearConnection',
        'ownerProbe.enter',
      ]);
      assertOrdinaryOnlineRelease(result);
      assertUnifiedTrace(result);
    });
  }

  await t.test('finite deferred preparation retains the live key, connection, and owner', () => {
    const result = runPhase2AIsolated('lifecycle', 'deferred_prepare');
    assert.deepEqual(result.outcome, { status: 'fulfilled' });
    assert.deepEqual(result.deferredEvidence, {
      sequence: 19,
      operationKeyDerived: true,
      operationPrivateKeyNonzero: true,
      operationPublicKeyNonzero: true,
      operationProductionClearAttempts: 0,
      harnessTeardownWipeAttempts: 0,
      connectionClearCalls: 0,
      clientHeld: true,
      ownerProbeQueued: true,
      ownerProbeEntered: false,
    });
    assert.deepEqual(result.failureFacts, NO_FAILURES);
    assertPairLifecycle(result);
    assertNoPublication(result, 2);
    assertOrdered(result, [
      'harness.deferredEvidence',
      'KeyPair.getPublicKey',
      'KeyPair.clear.enter',
      'Zenon.clearConnection',
      'ownerProbe.enter',
      'fetch.paid',
    ]);
    assertOrdinaryOnlineRelease(result);
    assertUnifiedTrace(result);
  });

  await t.test('deferred preparation settles safely when validation rejects before initialization', () => {
    const result = runPhase2AIsolated('lifecycle', 'deferred_prepare_preinit_failure');
    assert.deepEqual(result.outcome, offlineRejection());
    assert.equal(result.deferredEvidence, null);
    assert.deepEqual(result.releaseEvidence, {
      queuedAfterInitialize: false,
      probeEntered: false,
      connectionCleanupSeenBeforeProbe: false,
      probeResult: { status: 'not-queued' },
      operationSettled: true,
    });
    assert.deepEqual(traceOperations(result), ['fetch.initial']);
    assert.deepEqual(result.failureFacts, NO_FAILURES);
    assertNoPairs(result);
    assert.equal(result.lifecycle.connectionClearCalls, 0);
    assertNoPublication(result);
    assertRestored(result.restoration);
    assertUnifiedTrace(result);
  });
});

test('Phase 2A isolated connection cleanup failures preserve precedence and poison reuse', async t => {
  for (const {
    mode,
    clearMode,
    clientUndefined,
    productionClearOutcome,
    operationNonzeroAfterProduction,
    plasmaFailureObserved,
    keyCleanupFailureObserved,
  } of [
    {
      mode: 'after_success_throw_before',
      clearMode: 'throw-before',
      clientUndefined: false,
      productionClearOutcome: 'returned',
      operationNonzeroAfterProduction: false,
      plasmaFailureObserved: false,
      keyCleanupFailureObserved: false,
    },
    {
      mode: 'after_work_error_throw_after',
      clearMode: 'throw-after',
      clientUndefined: true,
      productionClearOutcome: 'returned',
      operationNonzeroAfterProduction: false,
      plasmaFailureObserved: true,
      keyCleanupFailureObserved: false,
    },
    {
      mode: 'after_key_cleanup_error_throw_after',
      clearMode: 'throw-after',
      clientUndefined: true,
      productionClearOutcome: 'threw-before',
      operationNonzeroAfterProduction: true,
      plasmaFailureObserved: false,
      keyCleanupFailureObserved: true,
    },
  ]) {
    await t.test(mode, () => {
      const result = runPhase2AIsolated('cleanup-poison', mode);
      const expectedPoison = poisonedRejection(CONNECTION_FAILURE_CORE);
      assert.deepEqual(
        result.outcome,
        safetyRejection('sdk_connection_cleanup_failed', CONNECTION_FAILURE_CORE),
      );
      assert.deepEqual(result.releaseEvidence, {
        queuedAfterInitialize: true,
        probeEntered: false,
        connectionCleanupSeenBeforeProbe: false,
        probeResult: expectedPoison,
        operationSettled: true,
      });
      assert.deepEqual(result.future, expectedPoison);
      assert.deepEqual(result.failureFacts, {
        plasmaFailureObserved,
        keyCleanupFailureObserved,
        connectionCleanupFailureObserved: true,
      });
      assertPairLifecycle(result, { productionClearOutcome, operationNonzeroAfterProduction });
      assertNoPublication(result);
      assert.equal(result.lifecycle.connectionClearCalls, 1);
      assert.equal(result.lifecycle.clientOwnAfterProduction, true);
      assert.equal(result.lifecycle.clientUndefinedAfterProduction, clientUndefined);
      assert.deepEqual(
        result.observedExecutionTrace
          .filter(entry => entry.operation === 'Zenon.clearConnection')
          .map(({ sequence, attempt, mode: observedMode, outcome }) => ({
            sequence,
            attempt,
            mode: observedMode,
            outcome,
          })),
        [{
          sequence: result.observedExecutionTrace.at(-1).sequence,
          attempt: 1,
          mode: clearMode,
          outcome: 'rejected',
        }],
      );
      assert.equal(traceOperations(result).includes('ownerProbe.enter'), false);
      if (plasmaFailureObserved) {
        assertPrepareApiTrace(result, 'rejected');
        assertOrdered(result, [
          'embedded.plasma.getRequiredPoWForAccountBlock',
          'KeyPair.clear.enter',
          'Zenon.clearConnection',
        ]);
      } else {
        assertPrepareApiTrace(result, 'fulfilled');
        assertOrdered(result, [
          'AccountBlockTemplate.toJson',
          'KeyPair.clear.enter',
          'Zenon.clearConnection',
        ]);
      }
      assertRestored(result.nonRuntimeRestoration);
      assertUnifiedTrace(result);
    });
  }
});

test('Phase 2A isolated read timeout retains the client and records immediate and late teardown failures', () => {
  const result = runPhase2AIsolated('timeout-cleanup', 'read_timeout_clear_before');
  const expectedPoison = poisonedRejection(READ_TIMEOUT_CORE);
  assert.deepEqual(result.outcome, timeoutRejection());
  assert.deepEqual(result.releaseEvidence, {
    queuedAfterInitialize: true,
    probeEntered: false,
    connectionCleanupSeenBeforeProbe: false,
    probeResult: expectedPoison,
    operationSettled: true,
  });
  assert.deepEqual(result.future, expectedPoison);
  assert.deepEqual(result.failureFacts, {
    plasmaFailureObserved: false,
    keyCleanupFailureObserved: false,
    connectionCleanupFailureObserved: true,
  });
  assertNoPairs(result);
  assert.deepEqual({
    connectionClearCalls: result.lifecycle.connectionClearCalls,
    clientOwnAfterProduction: result.lifecycle.clientOwnAfterProduction,
    clientUndefinedAfterProduction: result.lifecycle.clientUndefinedAfterProduction,
    clientRetained: result.clientRetained,
  }, {
    connectionClearCalls: 3,
    clientOwnAfterProduction: true,
    clientUndefinedAfterProduction: false,
    clientRetained: true,
  });
  assertNoPublication(result);
  assert.deepEqual(traceOperations(result), [
    'fetch.initial',
    'Zenon.setNetworkID',
    'Zenon.getInstance',
    'zenon.initialize',
    'stats.networkInfo',
    'Zenon.clearConnection',
    'Zenon.clearConnection',
    'Zenon.clearConnection',
  ]);
  assert.deepEqual(
    result.observedExecutionTrace
      .filter(entry => entry.operation === 'Zenon.clearConnection')
      .map(({ sequence, attempt, mode, outcome }) => ({ sequence, attempt, mode, outcome })),
    [
      { sequence: 6, attempt: 1, mode: 'throw-before', outcome: 'rejected' },
      { sequence: 7, attempt: 2, mode: 'throw-before', outcome: 'rejected' },
      { sequence: 8, attempt: 3, mode: 'throw-before', outcome: 'rejected' },
    ],
  );
  assert.deepEqual(
    result.sdkApiRpcMethodBoundaryTrace.map(entry => ({
      sequence: entry.sequence,
      operation: entry.operation,
      phase: entry.phase,
      outcome: entry.outcome,
    })),
    [
      { sequence: 4, operation: 'zenon.initialize', phase: 'readiness', outcome: 'fulfilled' },
      { sequence: 5, operation: 'stats.networkInfo', phase: 'readiness', outcome: 'fulfilled' },
    ],
  );
  assertRestored(result.nonRuntimeRestoration);
  assertUnifiedTrace(result);
});
