import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import * as contractModule from '../src/service-credit-execution-contract.js';
import {
  completeServiceCreditExecution,
  createServiceCreditExecutionContract,
  fenceServiceCreditExecution,
  hydrateServiceCreditExecutionContract,
  markServiceCreditExecutionUnknown,
  prepareServiceCreditExecution,
  recoverServiceCreditExecutions,
} from '../src/service-credit-execution-contract.js';

const SOURCE_PATH = fileURLToPath(new URL('../src/service-credit-execution-contract.js', import.meta.url));
const MODULE_URL = new URL('../src/service-credit-execution-contract.js', import.meta.url).href;
const SHA_A = `sha256:${'a'.repeat(64)}`;
const SHA_B = `sha256:${'b'.repeat(64)}`;
const SHA_C = `sha256:${'c'.repeat(64)}`;
const POLICY = Object.freeze({
  policyId: 'deadline.reference.v1',
  policyVersion: 1,
  maxDurationMs: 10_000,
});

function request(requestId = 'request.contract.a', overrides = {}) {
  return {
    modelVersion: 1,
    grantId: 'grant.contract.reference',
    requestId,
    requestDigest: SHA_A,
    method: 'POST',
    routeId: 'service-credit.execute.v1',
    canonicalBodyDigest: SHA_B,
    selectedContentType: 'application/json',
    maxCostUnits: 3,
    costUnits: 2,
    ...overrides,
  };
}

function create(overrides = {}) {
  return createServiceCreditExecutionContract({
    ledgerId: 'ledger.contract.reference',
    policy: POLICY,
    capacity: 16,
    ...overrides,
  });
}

function prepare(state, requestValue = request(), overrides = {}) {
  return prepareServiceCreditExecution({
    state,
    request: requestValue,
    policy: POLICY,
    selectedDurationMs: 1_000,
    wallClockStartMs: 10_000,
    ...overrides,
  });
}

function fenced(state, requestValue = request(), overrides = {}) {
  const prepared = prepare(state, requestValue, overrides);
  const result = fenceServiceCreditExecution({
    state: prepared.state,
    executionId: prepared.execution.executionId,
    wallClockNowMs: 10_001,
  });
  return { prepared, fence: result.fenceTransitionCandidate };
}

function errorCode(operation, expectedCode) {
  assert.throws(operation, error => {
    assert.equal(error?.name, 'ServiceCreditExecutionContractError');
    assert.equal(error?.code, expectedCode);
    assert.equal(error?.message, expectedCode);
    assert.equal(error?.stack, `ServiceCreditExecutionContractError: ${expectedCode}`);
    assert.equal(Object.hasOwn(error, 'cause'), false);
    assert.deepEqual(Reflect.ownKeys(error).sort(), ['code', 'message', 'name', 'stack']);
    return true;
  });
}

function assertDeepFrozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

test('module has only the bounded pure contract surface', () => {
  assert.deepEqual(Object.keys(contractModule).sort(), [
    'completeServiceCreditExecution',
    'createServiceCreditExecutionContract',
    'fenceServiceCreditExecution',
    'hydrateServiceCreditExecutionContract',
    'markServiceCreditExecutionUnknown',
    'prepareServiceCreditExecution',
    'recoverServiceCreditExecutions',
  ]);
  for (const name of Object.keys(contractModule)) assert.equal(typeof contractModule[name], 'function');
  for (const forbidden of ['reconcile', 'successor', 'clearGeneration', 'migrate', 'downgrade']) {
    assert.equal(Object.hasOwn(contractModule, forbidden), false);
  }
});

test('create returns one exact deterministic open generation and reads no runtime clock', () => {
  const listeners = ['beforeExit', 'exit', 'SIGINT', 'SIGTERM', 'unhandledRejection']
    .map(name => process.listenerCount(name));
  const handles = process._getActiveHandles().length;
  const first = create();
  const second = create();
  assert.deepEqual(first, second);
  assert.deepEqual(Reflect.ownKeys(first), [
    'contractVersion',
    'ledgerId',
    'policy',
    'capacity',
    'generation',
    'executions',
  ]);
  assert.deepEqual(Reflect.ownKeys(first.generation), [
    'generationVersion',
    'generationId',
    'sequence',
    'state',
    'seal',
  ]);
  assert.equal(first.contractVersion, 1);
  assert.equal(first.ledgerId, 'ledger.contract.reference');
  assert.deepEqual(first.policy, POLICY);
  assert.equal(first.capacity, 16);
  assert.match(first.generation.generationId, /^sha256:[0-9a-f]{64}$/);
  assert.equal(first.generation.sequence, 1);
  assert.equal(first.generation.state, 'OPEN');
  assert.equal(first.generation.seal, null);
  assert.deepEqual(first.executions, []);
  assertDeepFrozen(first);
  assert.deepEqual(
    ['beforeExit', 'exit', 'SIGINT', 'SIGTERM', 'unhandledRejection']
      .map(name => process.listenerCount(name)),
    listeners,
  );
  assert.equal(process._getActiveHandles().length, handles);
});

test('one-shot hashing preserves the established domain-separated identity bytes', () => {
  const state = create();
  const canonicalPolicy = {
    maxDurationMs: POLICY.maxDurationMs,
    policyId: POLICY.policyId,
    policyVersion: POLICY.policyVersion,
  };
  const generationMaterial = {
    capacity: 16,
    contractVersion: 1,
    ledgerId: 'ledger.contract.reference',
    policy: canonicalPolicy,
    sequence: 1,
  };
  const expectedGenerationId = `sha256:${createHash('sha256')
    .update('zenon-x402-service-credit-execution-generation-v1\0', 'ascii')
    .update(JSON.stringify(generationMaterial), 'utf8')
    .digest('hex')}`;
  assert.ok(
    state.generation.generationId === expectedGenerationId,
    'generation identity bytes must remain compatible',
  );

  const prepared = prepare(state);
  const canonicalRequest = {
    canonicalBodyDigest: SHA_B,
    costUnits: 2,
    grantId: 'grant.contract.reference',
    maxCostUnits: 3,
    method: 'POST',
    modelVersion: 1,
    requestDigest: SHA_A,
    requestId: 'request.contract.a',
    routeId: 'service-credit.execute.v1',
    selectedContentType: 'application/json',
  };
  const executionMaterial = {
    contractVersion: 1,
    generationId: expectedGenerationId,
    ledgerId: 'ledger.contract.reference',
    policy: canonicalPolicy,
    request: canonicalRequest,
    selectedDurationMs: 1_000,
    wallClockDeadlineMs: 11_000,
    wallClockStartMs: 10_000,
  };
  const expectedExecutionId = `sha256:${createHash('sha256')
    .update('zenon-x402-service-credit-execution-contract-v1\0', 'ascii')
    .update(JSON.stringify(executionMaterial), 'utf8')
    .digest('hex')}`;
  assert.ok(
    prepared.execution.executionId === expectedExecutionId,
    'execution identity bytes must remain compatible',
  );
});

test('generation and execution identities are deterministic and domain separated', () => {
  const state = create();
  const first = prepare(state);
  const replay = prepare(state);
  const otherLedger = prepare(create({ ledgerId: 'ledger.contract.other' }));
  const otherRequest = prepare(state, request('request.contract.b'));
  assert.equal(first.execution.executionId, replay.execution.executionId);
  assert.notEqual(first.execution.executionId, first.state.generation.generationId);
  assert.notEqual(first.execution.executionId, otherLedger.execution.executionId);
  assert.notEqual(first.execution.executionId, otherRequest.execution.executionId);
});

test('create and hydrate reject hostile or noncanonical shapes without invoking hooks', () => {
  let effects = 0;
  const hostile = new Proxy({}, {
    getPrototypeOf() {
      effects += 1;
      throw new Error('unreachable');
    },
    ownKeys() {
      effects += 1;
      throw new Error('unreachable');
    },
  });
  errorCode(
    () => createServiceCreditExecutionContract(hostile),
    'SERVICE_CREDIT_EXECUTION_CONTRACT_INVALID_INPUT',
  );
  errorCode(
    () => hydrateServiceCreditExecutionContract(hostile),
    'SERVICE_CREDIT_EXECUTION_CONTRACT_INVALID_STATE',
  );
  assert.equal(effects, 0);

  for (const candidate of [
    null,
    [],
    Object.create(null),
    { ledgerId: 'ledger.contract.reference', policy: POLICY, capacity: 1, extra: true },
    Object.defineProperty({ policy: POLICY, capacity: 1 }, 'ledgerId', {
      enumerable: true,
      get() {
        effects += 1;
        return 'ledger.contract.reference';
      },
    }),
    { ledgerId: 'ledger.contract.reference', policy: { ...POLICY, extra: true }, capacity: 1 },
    { ledgerId: 'ledger.contract.reference', policy: POLICY, capacity: 0 },
  ]) {
    errorCode(
      () => createServiceCreditExecutionContract(candidate),
      'SERVICE_CREDIT_EXECUTION_CONTRACT_INVALID_INPUT',
    );
  }
  assert.equal(effects, 0);

  const state = structuredClone(create());
  state.extra = true;
  errorCode(
    () => hydrateServiceCreditExecutionContract(state),
    'SERVICE_CREDIT_EXECUTION_CONTRACT_INVALID_STATE',
  );
});

test('hydrate validates identities and returns a detached canonical frozen state', () => {
  const original = structuredClone(prepare(create()).state);
  const hydrated = hydrateServiceCreditExecutionContract(original);
  assert.deepEqual(hydrated, original);
  assert.notEqual(hydrated, original);
  assertDeepFrozen(hydrated);
  original.ledgerId = 'ledger.changed.after.capture';
  original.policy.policyId = 'deadline.changed';
  original.executions[0].request.requestId = 'request.changed';
  assert.equal(hydrated.ledgerId, 'ledger.contract.reference');
  assert.equal(hydrated.policy.policyId, POLICY.policyId);
  assert.equal(hydrated.executions[0].request.requestId, 'request.contract.a');

  for (const mutate of [
    value => { value.generation.generationId = SHA_C; },
    value => { value.executions[0].executionId = SHA_C; },
    value => { value.executions[0].wallClockDeadlineMs += 1; },
    value => { value.executions[0].policy.maxDurationMs += 1; },
  ]) {
    const invalid = structuredClone(hydrated);
    mutate(invalid);
    errorCode(
      () => hydrateServiceCreditExecutionContract(invalid),
      'SERVICE_CREDIT_EXECUTION_CONTRACT_INVALID_STATE',
    );
  }
});

test('prepare binds the complete request, policy, duration, deadline, and never authorizes invocation', () => {
  const initial = create();
  const outcome = prepare(initial);
  assert.deepEqual(initial.executions, []);
  assert.equal(outcome.replayed, false);
  assert.deepEqual(Reflect.ownKeys(outcome), ['state', 'execution', 'replayed']);
  assert.deepEqual(Reflect.ownKeys(outcome.execution), [
    'executionVersion',
    'executionId',
    'generationId',
    'request',
    'policy',
    'selectedDurationMs',
    'wallClockStartMs',
    'wallClockDeadlineMs',
    'fencePhase',
    'terminalClassification',
    'terminalReason',
    'resultCommitment',
    'uncertaintyReason',
  ]);
  assert.deepEqual(outcome.execution.request, request());
  assert.deepEqual(outcome.execution.policy, POLICY);
  assert.equal(outcome.execution.wallClockDeadlineMs, 11_000);
  assert.equal(outcome.execution.fencePhase, 'PREPARED');
  assert.equal(outcome.execution.terminalClassification, 'NONE');
  assert.equal(Object.hasOwn(outcome, 'invocationAuthorized'), false);
  assertDeepFrozen(outcome);
});

test('duration bounds and checked wall-clock addition fail before mutation', () => {
  const state = create();
  for (const overrides of [
    { selectedDurationMs: 0 },
    { selectedDurationMs: POLICY.maxDurationMs + 1 },
    { selectedDurationMs: 1.5 },
    { wallClockStartMs: -1 },
    { wallClockStartMs: Number.MAX_SAFE_INTEGER, selectedDurationMs: 1 },
  ]) {
    errorCode(
      () => prepare(state, request(), overrides),
      'SERVICE_CREDIT_EXECUTION_CONTRACT_INVALID_INPUT',
    );
    assert.deepEqual(state.executions, []);
  }
});

test('prepare exact replay converges while policy and request conflicts take precedence', () => {
  const first = prepare(create());
  const replay = prepare(first.state);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.state, first.state);
  assert.equal(replay.execution.executionId, first.execution.executionId);

  const changedPolicy = { ...POLICY, maxDurationMs: POLICY.maxDurationMs + 1 };
  errorCode(
    () => prepare(first.state, request(), { policy: changedPolicy }),
    'SERVICE_CREDIT_EXECUTION_CONTRACT_CONFLICT',
  );
  errorCode(
    () => prepare(first.state, request('request.contract.a', { requestDigest: SHA_C })),
    'SERVICE_CREDIT_EXECUTION_CONTRACT_CONFLICT',
  );
});

test('fence is a distinct candidate step and grants no invocation authority', () => {
  const prepared = prepare(create());
  assert.equal(prepared.execution.fencePhase, 'PREPARED');
  const firstResult = fenceServiceCreditExecution({
    state: prepared.state,
    executionId: prepared.execution.executionId,
    wallClockNowMs: 10_500,
  });
  assert.deepEqual(Reflect.ownKeys(firstResult), ['fenceTransitionCandidate']);
  const first = firstResult.fenceTransitionCandidate;
  assert.equal(first.execution.fencePhase, 'MAY_HAVE_STARTED');
  const replayResult = fenceServiceCreditExecution({
    state: first.state,
    executionId: first.execution.executionId,
    wallClockNowMs: 50_000,
  });
  const replay = replayResult.fenceTransitionCandidate;
  assert.deepEqual(replay.state, first.state);
  assert.deepEqual(replay.execution, first.execution);
});

test('fence returns only a repeatable transition candidate and never invocation authority', () => {
  const prepared = prepare(create());
  const input = {
    state: prepared.state,
    executionId: prepared.execution.executionId,
    wallClockNowMs: 10_001,
  };
  const first = fenceServiceCreditExecution(input);
  const repeatedFromSameSnapshot = fenceServiceCreditExecution(input);

  assert.deepEqual(first, repeatedFromSameSnapshot);
  assert.deepEqual(Reflect.ownKeys(first), ['fenceTransitionCandidate']);
  assert.deepEqual(
    Reflect.ownKeys(first.fenceTransitionCandidate),
    ['state', 'execution'],
  );
  assert.equal(first.fenceTransitionCandidate.execution.fencePhase, 'MAY_HAVE_STARTED');
});

test('deadline equality and backward wall movement never authorize or seal a prepared execution', () => {
  for (const [wallClockNowMs, reason] of [
    [9_999, 'CLOCK_REGRESSION'],
    [11_000, 'DEADLINE_REACHED'],
    [12_000, 'DEADLINE_REACHED'],
  ]) {
    const prepared = prepare(create());
    const result = fenceServiceCreditExecution({
      state: prepared.state,
      executionId: prepared.execution.executionId,
      wallClockNowMs,
    });
    const outcome = result.fenceTransitionCandidate;
    assert.equal(outcome.execution.terminalClassification, 'NOT_INVOKED');
    assert.equal(outcome.execution.terminalReason, reason);
    assert.equal(outcome.state.generation.state, 'OPEN');
    assert.equal(outcome.state.generation.seal, null);
  }
});

test('success wins immutably and later uncertainty cannot downgrade or seal it', () => {
  const { fence } = fenced(create());
  const success = completeServiceCreditExecution({
    state: fence.state,
    executionId: fence.execution.executionId,
    resultCommitment: SHA_C,
  });
  assert.equal(success.transitioned, true);
  assert.equal(success.winner, 'SUCCEEDED');
  assert.equal(success.execution.terminalClassification, 'SUCCEEDED');
  assert.equal(success.execution.resultCommitment, SHA_C);
  assert.equal(success.state.generation.state, 'OPEN');

  const later = markServiceCreditExecutionUnknown({
    state: success.state,
    executionId: success.execution.executionId,
    reason: 'DISCONNECTED',
  });
  assert.equal(later.transitioned, false);
  assert.equal(later.winner, 'SUCCEEDED');
  assert.deepEqual(later.state, success.state);

  const replay = completeServiceCreditExecution({
    state: success.state,
    executionId: success.execution.executionId,
    resultCommitment: SHA_C,
  });
  assert.equal(replay.transitioned, false);
  assert.equal(replay.winner, 'SUCCEEDED');
  errorCode(
    () => completeServiceCreditExecution({
      state: success.state,
      executionId: success.execution.executionId,
      resultCommitment: SHA_B,
    }),
    'SERVICE_CREDIT_EXECUTION_CONTRACT_CONFLICT',
  );
});

test('uncertainty wins immutably, seals globally, and late success cannot mutate it', () => {
  const { fence } = fenced(create());
  const unknown = markServiceCreditExecutionUnknown({
    state: fence.state,
    executionId: fence.execution.executionId,
    reason: 'DEADLINE_EXPIRED',
  });
  assert.equal(unknown.transitioned, true);
  assert.equal(unknown.winner, 'OUTCOME_UNKNOWN');
  assert.equal(unknown.execution.terminalClassification, 'OUTCOME_UNKNOWN');
  assert.equal(unknown.execution.uncertaintyReason, 'DEADLINE_EXPIRED');
  assert.equal(unknown.state.generation.state, 'SEALED');
  assert.deepEqual(unknown.state.generation.seal, {
    executionId: unknown.execution.executionId,
    reason: 'DEADLINE_EXPIRED',
  });

  const late = completeServiceCreditExecution({
    state: unknown.state,
    executionId: unknown.execution.executionId,
    resultCommitment: SHA_C,
  });
  assert.equal(late.transitioned, false);
  assert.equal(late.winner, 'OUTCOME_UNKNOWN');
  assert.deepEqual(late.state, unknown.state);

  const replay = markServiceCreditExecutionUnknown({
    state: unknown.state,
    executionId: unknown.execution.executionId,
    reason: 'DEADLINE_EXPIRED',
  });
  assert.equal(replay.transitioned, false);
  assert.deepEqual(replay.state, unknown.state);
  errorCode(
    () => markServiceCreditExecutionUnknown({
      state: unknown.state,
      executionId: unknown.execution.executionId,
      reason: 'DISCONNECTED',
    }),
    'SERVICE_CREDIT_EXECUTION_CONTRACT_CONFLICT',
  );
});

test('sealed generation preserves existing replay precedence and denies new preparation', () => {
  const first = prepare(create());
  const fencedFirstResult = fenceServiceCreditExecution({
    state: first.state,
    executionId: first.execution.executionId,
    wallClockNowMs: 10_001,
  });
  const fencedFirst = fencedFirstResult.fenceTransitionCandidate;
  const unknown = markServiceCreditExecutionUnknown({
    state: fencedFirst.state,
    executionId: fencedFirst.execution.executionId,
    reason: 'LOST_CONTROL',
  });
  const exactReplay = prepare(unknown.state);
  assert.equal(exactReplay.replayed, true);
  errorCode(
    () => prepare(unknown.state, request('request.contract.a', { requestDigest: SHA_C })),
    'SERVICE_CREDIT_EXECUTION_CONTRACT_CONFLICT',
  );
  errorCode(
    () => prepare(unknown.state, request('request.contract.new')),
    'SERVICE_CREDIT_EXECUTION_CONTRACT_GENERATION_SEALED',
  );
});

test('already-fenced siblings can terminalize after one sibling seals the generation', () => {
  const initial = create();
  const first = fenced(initial, request('request.contract.a'));
  const secondPrepared = prepare(first.fence.state, request('request.contract.b'));
  const secondResult = fenceServiceCreditExecution({
    state: secondPrepared.state,
    executionId: secondPrepared.execution.executionId,
    wallClockNowMs: 10_001,
  });
  const second = secondResult.fenceTransitionCandidate;
  const sealed = markServiceCreditExecutionUnknown({
    state: second.state,
    executionId: first.fence.execution.executionId,
    reason: 'SHUTDOWN_UNCERTAIN',
  });
  const completedSibling = completeServiceCreditExecution({
    state: sealed.state,
    executionId: second.execution.executionId,
    resultCommitment: SHA_C,
  });
  assert.equal(completedSibling.winner, 'SUCCEEDED');
  assert.equal(completedSibling.state.generation.state, 'SEALED');
  assert.deepEqual(
    completedSibling.state.executions.map(value => value.terminalClassification).sort(),
    ['OUTCOME_UNKNOWN', 'SUCCEEDED'],
  );
});

test('a prepared sibling cannot cross a seal into invocation', () => {
  const first = fenced(create(), request('request.contract.a'));
  const second = prepare(first.fence.state, request('request.contract.b'));
  const sealed = markServiceCreditExecutionUnknown({
    state: second.state,
    executionId: first.fence.execution.executionId,
    reason: 'ABORT_REQUESTED',
  });
  errorCode(
    () => fenceServiceCreditExecution({
      state: sealed.state,
      executionId: second.execution.executionId,
      wallClockNowMs: 10_002,
    }),
    'SERVICE_CREDIT_EXECUTION_CONTRACT_GENERATION_SEALED',
  );
});

test('recovery releases prepared work safely and does not seal', () => {
  const prepared = prepare(create());
  const recovered = recoverServiceCreditExecutions({
    state: prepared.state,
    wallClockNowMs: 10_500,
  });
  assert.equal(recovered.transitioned, true);
  assert.equal(recovered.noInvocationCount, 1);
  assert.equal(recovered.outcomeUnknownCount, 0);
  assert.equal(recovered.state.executions[0].terminalClassification, 'NOT_INVOKED');
  assert.equal(recovered.state.executions[0].terminalReason, 'RECOVERY_PREPARED');
  assert.equal(recovered.state.generation.state, 'OPEN');
});

test('recovery maps fenced work to unknown and classifies wall-clock movement conservatively', () => {
  for (const [wallClockNowMs, reason] of [
    [9_999, 'CLOCK_REGRESSION'],
    [10_500, 'RESTART_LOST_CONTROL'],
    [11_000, 'DEADLINE_EXPIRED'],
    [12_000, 'DEADLINE_EXPIRED'],
  ]) {
    const { fence } = fenced(create());
    const recovered = recoverServiceCreditExecutions({
      state: fence.state,
      wallClockNowMs,
    });
    assert.equal(recovered.transitioned, true);
    assert.equal(recovered.noInvocationCount, 0);
    assert.equal(recovered.outcomeUnknownCount, 1);
    assert.equal(recovered.state.executions[0].terminalClassification, 'OUTCOME_UNKNOWN');
    assert.equal(recovered.state.executions[0].uncertaintyReason, reason);
    assert.equal(recovered.state.generation.state, 'SEALED');
  }
});

test('recovery handles prepared, fenced, and terminal siblings deterministically', () => {
  let state = create({ capacity: 5 });
  const prepared = prepare(state, request('request.contract.prepared'));
  state = prepared.state;
  const fencedValue = fenced(state, request('request.contract.fenced'));
  state = fencedValue.fence.state;
  const succeededValue = fenced(state, request('request.contract.succeeded'));
  const succeeded = completeServiceCreditExecution({
    state: succeededValue.fence.state,
    executionId: succeededValue.fence.execution.executionId,
    resultCommitment: SHA_C,
  });
  const recovered = recoverServiceCreditExecutions({
    state: succeeded.state,
    wallClockNowMs: 11_000,
  });
  assert.equal(recovered.noInvocationCount, 1);
  assert.equal(recovered.outcomeUnknownCount, 1);
  assert.deepEqual(
    recovered.state.executions.map(value => value.terminalClassification).sort(),
    ['NOT_INVOKED', 'OUTCOME_UNKNOWN', 'SUCCEEDED'],
  );
  const replay = recoverServiceCreditExecutions({
    state: recovered.state,
    wallClockNowMs: 50_000,
  });
  assert.equal(replay.transitioned, false);
  assert.deepEqual(replay.state, recovered.state);
});

test('multiple fenced records recover deterministically under one global seal', () => {
  const first = fenced(create(), request('request.contract.b'));
  const second = fenced(first.fence.state, request('request.contract.a'));
  const recovered = recoverServiceCreditExecutions({
    state: second.fence.state,
    wallClockNowMs: 10_500,
  });
  assert.equal(recovered.outcomeUnknownCount, 2);
  assert.equal(recovered.state.generation.state, 'SEALED');
  const expectedTrigger = recovered.state.executions[0].executionId;
  assert.equal(recovered.state.generation.seal.executionId, expectedTrigger);
  assert.equal(recovered.state.generation.seal.reason, 'RESTART_LOST_CONTROL');
});

test('capacity saturation fails closed without mutation or compaction', () => {
  const initial = create({ capacity: 1 });
  const first = prepare(initial);
  const before = JSON.stringify(first.state);
  errorCode(
    () => prepare(first.state, request('request.contract.second')),
    'SERVICE_CREDIT_EXECUTION_CONTRACT_CAPACITY_EXCEEDED',
  );
  assert.equal(JSON.stringify(first.state), before);
  assert.equal(first.state.executions.length, 1);
});

test('malformed transitions and arbitrary values produce fixed private failures', () => {
  const protectedText = 'private-input-must-not-escape';
  const state = create();
  for (const operation of [
    () => prepareServiceCreditExecution({ state, request: request(), policy: POLICY }),
    () => fenceServiceCreditExecution({ state, executionId: protectedText, wallClockNowMs: 0 }),
    () => completeServiceCreditExecution({ state, executionId: protectedText, resultCommitment: SHA_C }),
    () => markServiceCreditExecutionUnknown({ state, executionId: protectedText, reason: 'UNKNOWN_REASON' }),
    () => recoverServiceCreditExecutions({ state, wallClockNowMs: -1 }),
  ]) {
    assert.throws(operation, error => {
      assert.equal(JSON.stringify(error).includes(protectedText), false);
      assert.equal(String(error).includes(protectedText), false);
      assert.equal(String(error.stack).includes(protectedText), false);
      assert.equal(Object.hasOwn(error, 'cause'), false);
      return true;
    });
  }
});

test('operations reject proxies, accessors, symbols, and exotic prototypes without effects', () => {
  let effects = 0;
  const state = create();
  const accessor = { state, request: request(), policy: POLICY, selectedDurationMs: 1_000 };
  Object.defineProperty(accessor, 'wallClockStartMs', {
    enumerable: true,
    get() {
      effects += 1;
      return 10_000;
    },
  });
  const proxy = new Proxy({}, {
    getPrototypeOf() {
      effects += 1;
      throw new Error('unreachable');
    },
  });
  for (const candidate of [
    accessor,
    proxy,
    Object.assign(Object.create(null), {
      state,
      request: request(),
      policy: POLICY,
      selectedDurationMs: 1_000,
      wallClockStartMs: 10_000,
    }),
    Object.assign({
      state,
      request: request(),
      policy: POLICY,
      selectedDurationMs: 1_000,
      wallClockStartMs: 10_000,
    }, { [Symbol('unexpected')]: true }),
  ]) {
    errorCode(
      () => prepareServiceCreditExecution(candidate),
      'SERVICE_CREDIT_EXECUTION_CONTRACT_INVALID_INPUT',
    );
  }
  assert.equal(effects, 0);
});

test('all outputs are detached, deeply frozen, JSON-safe, and canonically serializable', () => {
  const inputRequest = request();
  const inputPolicy = { ...POLICY };
  const outcome = prepareServiceCreditExecution({
    state: create(),
    request: inputRequest,
    policy: inputPolicy,
    selectedDurationMs: 1_000,
    wallClockStartMs: 10_000,
  });
  const serialized = JSON.stringify(outcome);
  assert.equal(serialized, JSON.stringify(outcome));
  assert.equal(serialized.includes('undefined'), false);
  assert.equal(serialized.includes('[object Object]'), false);
  assertDeepFrozen(outcome);
  inputRequest.requestId = 'request.changed';
  inputPolicy.policyId = 'deadline.changed';
  assert.equal(outcome.execution.request.requestId, 'request.contract.a');
  assert.equal(outcome.execution.policy.policyId, POLICY.policyId);
});

test('post-import intrinsic poisoning cannot alter selection, authorization, sealing, or errors', () => {
  const script = `
    import { createHash } from 'node:crypto';
    import { types as utilTypes } from 'node:util';
    const contract = await import(${JSON.stringify(MODULE_URL)});
    const safeDefine = Object.defineProperty;
    const safeGetDescriptor = Object.getOwnPropertyDescriptor;
    const safeGetPrototypeOf = Object.getPrototypeOf;
    const safeHasOwn = Object.hasOwn;
    const safeOwnKeys = Reflect.ownKeys;
    const safeDeleteProperty = Reflect.deleteProperty;
    const patches = [];
    let patchCount = 0;
    let hostileCalls = 0;
    const rememberAndDefine = (target, key, descriptor) => {
      const previous = safeGetDescriptor(target, key);
      patches[patchCount] = [target, key, previous];
      patchCount += 1;
      safeDefine(target, key, descriptor);
    };
    const rememberAndReplace = (target, key, replacement) => {
      rememberAndDefine(target, key, {
        ...safeGetDescriptor(target, key),
        value: replacement,
      });
    };
    const restore = () => {
      for (let index = patchCount - 1; index >= 0; index -= 1) {
        const patch = patches[index];
        if (patch[2] === undefined) safeDeleteProperty(patch[0], patch[1]);
        else safeDefine(patch[0], patch[1], patch[2]);
      }
      patchCount = 0;
    };
    const poison = () => {
      hostileCalls += 1;
      throw new Error('blocked');
    };
    const policy = Object.freeze({
      policyId: 'deadline.reference.v1',
      policyVersion: 1,
      maxDurationMs: 10000,
    });
    const options = Object.freeze({
      ledgerId: 'ledger.contract.reference',
      policy,
      capacity: 16,
    });
    const requestA = Object.freeze({
      modelVersion: 1,
      grantId: 'grant.contract.reference',
      requestId: 'request.contract.a',
      requestDigest: 'sha256:' + 'a'.repeat(64),
      method: 'POST',
      routeId: 'service-credit.execute.v1',
      canonicalBodyDigest: 'sha256:' + 'b'.repeat(64),
      selectedContentType: 'application/json',
      maxCostUnits: 3,
      costUnits: 2,
    });
    const requestB = Object.freeze({ ...requestA, requestId: 'request.contract.b' });
    const changedA = Object.freeze({ ...requestA, requestDigest: 'sha256:' + 'c'.repeat(64) });
    const initial = contract.createServiceCreditExecutionContract(options);
    const preparedA = contract.prepareServiceCreditExecution({
      state: initial,
      request: requestA,
      policy,
      selectedDurationMs: 1000,
      wallClockStartMs: 10000,
    });
    const preparedB = contract.prepareServiceCreditExecution({
      state: preparedA.state,
      request: requestB,
      policy,
      selectedDurationMs: 1000,
      wallClockStartMs: 10000,
    });
    const expectedGenerationId = initial.generation.generationId;
    const expectedA = preparedA.execution.executionId;
    const expectedB = preparedB.execution.executionId;
    let phaseOneSafe = false;
    rememberAndReplace(Array.prototype, 'find', function poisonedFind() {
      hostileCalls += 1;
      return this[0];
    });
    try {
      const selectedResult = contract.fenceServiceCreditExecution({
        state: preparedB.state,
        executionId: expectedB,
        wallClockNowMs: 10001,
      });
      const selected = selectedResult.fenceTransitionCandidate;
      phaseOneSafe = hostileCalls === 0
        && safeOwnKeys(selectedResult).length === 1
        && safeOwnKeys(selectedResult)[0] === 'fenceTransitionCandidate'
        && selected.execution.executionId === expectedB
        && selected.state.executions[0].fencePhase === 'PREPARED'
        && selected.state.executions[1].fencePhase === 'MAY_HAVE_STARTED';
    } catch {
      phaseOneSafe = false;
    } finally {
      restore();
      hostileCalls = 0;
    }

    const arrayMethods = ['includes', 'map', 'filter', 'find', 'sort', 'every', 'push'];
    const objectMethods = [
      'keys',
      'values',
      'entries',
      'freeze',
      'hasOwn',
      'create',
      'defineProperty',
      'getOwnPropertyDescriptor',
      'getPrototypeOf',
    ];
    const reflectMethods = [
      'apply',
      'ownKeys',
      'getOwnPropertyDescriptor',
      'getPrototypeOf',
    ];
    const functionMethods = ['apply', 'call', 'bind'];
    const setMethods = ['has', 'add'];
    const hashPrototype = safeGetPrototypeOf(createHash('sha256'));
    for (let index = 0; index < arrayMethods.length; index += 1) {
      rememberAndReplace(Array.prototype, arrayMethods[index], poison);
    }
    rememberAndReplace(Array.prototype, Symbol.iterator, poison);
    for (let index = 0; index < objectMethods.length; index += 1) {
      rememberAndReplace(Object, objectMethods[index], poison);
    }
    for (let index = 0; index < reflectMethods.length; index += 1) {
      rememberAndReplace(Reflect, reflectMethods[index], poison);
    }
    for (let index = 0; index < functionMethods.length; index += 1) {
      rememberAndReplace(Function.prototype, functionMethods[index], poison);
    }
    rememberAndReplace(Array, 'isArray', poison);
    rememberAndReplace(Number, 'isSafeInteger', poison);
    rememberAndReplace(utilTypes, 'isProxy', poison);
    for (let index = 0; index < setMethods.length; index += 1) {
      rememberAndReplace(Set.prototype, setMethods[index], poison);
    }
    rememberAndReplace(String.prototype, 'includes', poison);
    rememberAndReplace(RegExp.prototype, 'test', poison);
    rememberAndReplace(RegExp.prototype, 'exec', poison);
    rememberAndReplace(JSON, 'stringify', poison);
    rememberAndReplace(hashPrototype, 'update', poison);
    rememberAndReplace(hashPrototype, 'digest', poison);
    rememberAndReplace(globalThis, 'Set', function PoisonedSet() {
      hostileCalls += 1;
      throw new Error('blocked');
    });
    rememberAndReplace(globalThis, 'String', poison);
    rememberAndDefine(Object.prototype, 'ledgerId', {
      configurable: true,
      enumerable: false,
      set: poison,
    });
    rememberAndDefine(Array.prototype, '0', {
      configurable: true,
      enumerable: false,
      set: poison,
    });

    let passed = false;
    try {
      const recreated = contract.createServiceCreditExecutionContract(options);
      const replayA = contract.prepareServiceCreditExecution({
        state: preparedB.state,
        request: requestA,
        policy,
        selectedDurationMs: 1000,
        wallClockStartMs: 10000,
      });
      const fencedBResult = contract.fenceServiceCreditExecution({
        state: replayA.state,
        executionId: expectedB,
        wallClockNowMs: 10001,
      });
      const fencedB = fencedBResult.fenceTransitionCandidate;
      const unknownB = contract.markServiceCreditExecutionUnknown({
        state: fencedB.state,
        executionId: expectedB,
        reason: 'LOST_CONTROL',
      });
      const sealedReplayA = contract.prepareServiceCreditExecution({
        state: unknownB.state,
        request: requestA,
        policy,
        selectedDurationMs: 1000,
        wallClockStartMs: 10000,
      });
      const late = contract.completeServiceCreditExecution({
        state: unknownB.state,
        executionId: expectedB,
        resultCommitment: 'sha256:' + 'c'.repeat(64),
      });
      let conflict = null;
      let sealed = null;
      try {
        contract.prepareServiceCreditExecution({
          state: unknownB.state,
          request: changedA,
          policy,
          selectedDurationMs: 1000,
          wallClockStartMs: 10000,
        });
      } catch (error) {
        conflict = error;
      }
      try {
        contract.fenceServiceCreditExecution({
          state: unknownB.state,
          executionId: expectedA,
          wallClockNowMs: 10001,
        });
      } catch (error) {
        sealed = error;
      }
      const fixedConflict = conflict !== null
        && conflict.name === 'ServiceCreditExecutionContractError'
        && conflict.code === 'SERVICE_CREDIT_EXECUTION_CONTRACT_CONFLICT'
        && conflict.message === conflict.code
        && conflict.stack === 'ServiceCreditExecutionContractError: ' + conflict.code
        && !safeHasOwn(conflict, 'cause');
      const fixedSeal = sealed !== null
        && sealed.name === 'ServiceCreditExecutionContractError'
        && sealed.code === 'SERVICE_CREDIT_EXECUTION_CONTRACT_GENERATION_SEALED'
        && sealed.message === sealed.code
        && sealed.stack === 'ServiceCreditExecutionContractError: ' + sealed.code
        && !safeHasOwn(sealed, 'cause');
      passed = phaseOneSafe
        && hostileCalls === 0
        && recreated.generation.generationId === expectedGenerationId
        && replayA.replayed === true
        && replayA.execution.executionId === expectedA
        && fencedB.execution.executionId === expectedB
        && fencedB.state.executions[0].fencePhase === 'PREPARED'
        && fencedB.state.executions[1].fencePhase === 'MAY_HAVE_STARTED'
        && unknownB.winner === 'OUTCOME_UNKNOWN'
        && unknownB.state.generation.state === 'SEALED'
        && unknownB.state.generation.seal.executionId === expectedB
        && sealedReplayA.replayed === true
        && late.winner === 'OUTCOME_UNKNOWN'
        && fixedConflict
        && fixedSeal;
    } catch {
      passed = false;
    } finally {
      restore();
    }
    process.exit(passed ? 0 : 71);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    encoding: 'utf8',
  });
  assert.equal(result.stdout.length, 0);
  assert.equal(result.stderr.length, 0);
  assert.equal(result.status, 0);
});

test('source remains inert, pure, and disconnected from every runtime module', () => {
  const source = readFileSync(SOURCE_PATH, 'utf8');
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]).sort();
  assert.deepEqual(imports, ['node:crypto', 'node:util']);
  assert.doesNotMatch(source, /from\s+['"]\.\//);
  assert.doesNotMatch(
    source,
    /\b(?:Date\.now|performance|hrtime|setTimeout|setInterval|queueMicrotask|AbortController|fetch|WebSocket|listen|connect|sqlite|child_process|worker_threads|process\.|console\.|Math\.random|randomBytes|randomUUID)\b/,
  );
  assert.doesNotMatch(source, /\b(?:reconcile|successor|downgrade|migrate)\b/i);
  assert.match(source, /import \{ hash as cryptoHash \} from 'node:crypto'/);
  assert.doesNotMatch(source, /\bcreateHash\b|\.update\s*\(|\.digest\s*\(|\binstanceof\b/);
});
