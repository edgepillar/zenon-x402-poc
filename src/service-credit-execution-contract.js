import { hash as cryptoHash } from 'node:crypto';
import { types as utilTypes } from 'node:util';

const REFLECT_APPLY = Reflect.apply;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const REFLECT_GET_PROTOTYPE_OF = Reflect.getPrototypeOf;
const REFLECT_GET_OWN_PROPERTY_DESCRIPTOR = Reflect.getOwnPropertyDescriptor;
const OBJECT_CREATE = Object.create;
const OBJECT_DEFINE_PROPERTY = Object.defineProperty;
const OBJECT_FREEZE = Object.freeze;
const OBJECT_HAS_OWN = Object.hasOwn;
const OBJECT_KEYS = Object.keys;
const OBJECT_PROTOTYPE = Object.prototype;
const ARRAY_IS_ARRAY = Array.isArray;
const ARRAY_PROTOTYPE = Array.prototype;
const ARRAY_SORT = Array.prototype.sort;
const NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;
const REGEXP_EXEC = RegExp.prototype.exec;
const STRING_INCLUDES = String.prototype.includes;
const STRING_FROM = String;
const JSON_STRINGIFY = JSON.stringify;
const SET_CONSTRUCTOR = Set;
const SET_HAS = Set.prototype.has;
const SET_ADD = Set.prototype.add;
const IS_PROXY = utilTypes.isProxy;

const CONTRACT_VERSION = 1;
const GENERATION_VERSION = 1;
const EXECUTION_VERSION = 1;
const MAX_EXECUTIONS = 100_000;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const METHOD = /^[A-Z][A-Z0-9_-]{0,15}$/;
const CONTENT_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}$/;
const SHA256_COMMITMENT = /^sha256:[0-9a-f]{64}$/;
const GENERATION_DOMAIN = 'zenon-x402-service-credit-execution-generation-v1\0';
const EXECUTION_DOMAIN = 'zenon-x402-service-credit-execution-contract-v1\0';

const CODE = OBJECT_FREEZE({
  invalidInput: 'SERVICE_CREDIT_EXECUTION_CONTRACT_INVALID_INPUT',
  invalidState: 'SERVICE_CREDIT_EXECUTION_CONTRACT_INVALID_STATE',
  conflict: 'SERVICE_CREDIT_EXECUTION_CONTRACT_CONFLICT',
  sealed: 'SERVICE_CREDIT_EXECUTION_CONTRACT_GENERATION_SEALED',
  capacity: 'SERVICE_CREDIT_EXECUTION_CONTRACT_CAPACITY_EXCEEDED',
  invalidTransition: 'SERVICE_CREDIT_EXECUTION_CONTRACT_INVALID_TRANSITION',
});

const ROOT_KEYS = OBJECT_FREEZE([
  'contractVersion',
  'ledgerId',
  'policy',
  'capacity',
  'generation',
  'executions',
]);
const POLICY_KEYS = OBJECT_FREEZE(['policyId', 'policyVersion', 'maxDurationMs']);
const GENERATION_KEYS = OBJECT_FREEZE([
  'generationVersion',
  'generationId',
  'sequence',
  'state',
  'seal',
]);
const SEAL_KEYS = OBJECT_FREEZE(['executionId', 'reason']);
const REQUEST_KEYS = OBJECT_FREEZE([
  'modelVersion',
  'grantId',
  'requestId',
  'requestDigest',
  'method',
  'routeId',
  'canonicalBodyDigest',
  'selectedContentType',
  'maxCostUnits',
  'costUnits',
]);
const EXECUTION_KEYS = OBJECT_FREEZE([
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
const CREATE_KEYS = OBJECT_FREEZE(['ledgerId', 'policy', 'capacity']);
const PREPARE_KEYS = OBJECT_FREEZE([
  'state',
  'request',
  'policy',
  'selectedDurationMs',
  'wallClockStartMs',
]);
const FENCE_KEYS = OBJECT_FREEZE(['state', 'executionId', 'wallClockNowMs']);
const COMPLETE_KEYS = OBJECT_FREEZE(['state', 'executionId', 'resultCommitment']);
const UNKNOWN_KEYS = OBJECT_FREEZE(['state', 'executionId', 'reason']);
const RECOVER_KEYS = OBJECT_FREEZE(['state', 'wallClockNowMs']);
const FENCE_PHASES = OBJECT_FREEZE(['PREPARED', 'MAY_HAVE_STARTED']);
const TERMINAL_CLASSIFICATIONS = OBJECT_FREEZE([
  'NONE',
  'NOT_INVOKED',
  'SUCCEEDED',
  'OUTCOME_UNKNOWN',
]);
const NO_INVOCATION_REASONS = OBJECT_FREEZE([
  'CLOCK_REGRESSION',
  'DEADLINE_REACHED',
  'RECOVERY_PREPARED',
]);
const EXTERNAL_UNCERTAINTY_REASONS = OBJECT_FREEZE([
  'ABORT_REQUESTED',
  'DEADLINE_EXPIRED',
  'DISCONNECTED',
  'LOST_CONTROL',
  'SHUTDOWN_UNCERTAIN',
]);
const ALL_UNCERTAINTY_REASONS = OBJECT_FREEZE([
  'ABORT_REQUESTED',
  'DEADLINE_EXPIRED',
  'DISCONNECTED',
  'LOST_CONTROL',
  'SHUTDOWN_UNCERTAIN',
  'CLOCK_REGRESSION',
  'RESTART_LOST_CONTROL',
]);

function defineOwnData(target, key, value, enumerable = true) {
  OBJECT_DEFINE_PROPERTY(target, key, {
    value,
    enumerable,
    writable: true,
    configurable: true,
  });
}

function setArrayValue(target, index, value) {
  defineOwnData(target, STRING_FROM(index), value);
}

function appendArrayValue(target, value) {
  setArrayValue(target, target.length, value);
}

class ServiceCreditExecutionContractError extends Error {
  constructor(code) {
    super(code);
    defineOwnData(this, 'name', 'ServiceCreditExecutionContractError');
    defineOwnData(this, 'code', code);
    defineOwnData(this, 'stack', `ServiceCreditExecutionContractError: ${code}`, false);
  }
}

function fail(code) {
  throw new ServiceCreditExecutionContractError(code);
}

function arrayHas(value, expected) {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === expected) return true;
  }
  return false;
}

function regexpMatches(expression, value) {
  return REFLECT_APPLY(REGEXP_EXEC, expression, [value]) !== null;
}

function setHas(set, value) {
  return REFLECT_APPLY(SET_HAS, set, [value]);
}

function setAdd(set, value) {
  REFLECT_APPLY(SET_ADD, set, [value]);
}

function sortedCopy(value, compare) {
  const result = [];
  for (let index = 0; index < value.length; index += 1) {
    setArrayValue(result, index, value[index]);
  }
  REFLECT_APPLY(ARRAY_SORT, result, [compare]);
  return result;
}

function exactDataObject(value, keys, code) {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || ARRAY_IS_ARRAY(value)
      || IS_PROXY(value)
      || REFLECT_GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE
    ) {
      fail(code);
    }
    const observed = REFLECT_OWN_KEYS(value);
    if (observed.length !== keys.length) fail(code);
    const captured = OBJECT_CREATE(null);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (!arrayHas(observed, key)) fail(code);
      const descriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(value, key);
      if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) fail(code);
      defineOwnData(captured, key, descriptor.value);
    }
    return captured;
  } catch {
    fail(code);
  }
}

function exactDataArray(value, maximum, code) {
  try {
    if (
      !ARRAY_IS_ARRAY(value)
      || IS_PROXY(value)
      || REFLECT_GET_PROTOTYPE_OF(value) !== ARRAY_PROTOTYPE
    ) {
      fail(code);
    }
    const length = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(value, 'length');
    if (
      !length
      || length.enumerable
      || !OBJECT_HAS_OWN(length, 'value')
      || !NUMBER_IS_SAFE_INTEGER(length.value)
      || length.value < 0
      || length.value > maximum
    ) {
      fail(code);
    }
    const keys = REFLECT_OWN_KEYS(value);
    if (keys.length !== length.value + 1 || keys[length.value] !== 'length') fail(code);
    const captured = [];
    for (let index = 0; index < length.value; index += 1) {
      const key = STRING_FROM(index);
      if (keys[index] !== key) fail(code);
      const descriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(value, key);
      if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) fail(code);
      appendArrayValue(captured, descriptor.value);
    }
    return captured;
  } catch {
    fail(code);
  }
}

function snapshot(value) {
  if (value === null || typeof value !== 'object') return value;
  if (ARRAY_IS_ARRAY(value)) {
    const result = [];
    for (let index = 0; index < value.length; index += 1) {
      setArrayValue(result, index, snapshot(value[index]));
    }
    return OBJECT_FREEZE(result);
  }
  const result = {};
  const keys = OBJECT_KEYS(value);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    defineOwnData(result, key, snapshot(value[key]));
  }
  return OBJECT_FREEZE(result);
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON_STRINGIFY(value);
  if (ARRAY_IS_ARRAY(value)) {
    let result = '[';
    for (let index = 0; index < value.length; index += 1) {
      if (index !== 0) result += ',';
      result += canonicalJson(value[index]);
    }
    return `${result}]`;
  }
  const keys = sortedCopy(OBJECT_KEYS(value), undefined);
  let result = '{';
  for (let index = 0; index < keys.length; index += 1) {
    if (index !== 0) result += ',';
    const key = keys[index];
    result += `${JSON_STRINGIFY(key)}:${canonicalJson(value[key])}`;
  }
  return `${result}}`;
}

function sameJson(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function sha256(domain, value) {
  return `sha256:${cryptoHash('sha256', `${domain}${canonicalJson(value)}`, 'hex')}`;
}

function validIdentifier(value) {
  return typeof value === 'string'
    && regexpMatches(IDENTIFIER, value)
    && !REFLECT_APPLY(STRING_INCLUDES, value, ['://']);
}

function positiveSafeInteger(value) {
  return NUMBER_IS_SAFE_INTEGER(value) && value > 0;
}

function nonnegativeSafeInteger(value) {
  return NUMBER_IS_SAFE_INTEGER(value) && value >= 0;
}

function normalizePolicy(value, code) {
  const input = exactDataObject(value, POLICY_KEYS, code);
  if (
    !validIdentifier(input.policyId)
    || !positiveSafeInteger(input.policyVersion)
    || !positiveSafeInteger(input.maxDurationMs)
  ) {
    fail(code);
  }
  return {
    policyId: input.policyId,
    policyVersion: input.policyVersion,
    maxDurationMs: input.maxDurationMs,
  };
}

function normalizeRequest(value, code) {
  const input = exactDataObject(value, REQUEST_KEYS, code);
  if (
    !positiveSafeInteger(input.modelVersion)
    || !validIdentifier(input.grantId)
    || !validIdentifier(input.requestId)
    || typeof input.requestDigest !== 'string'
    || !regexpMatches(SHA256_COMMITMENT, input.requestDigest)
    || typeof input.method !== 'string'
    || !regexpMatches(METHOD, input.method)
    || !validIdentifier(input.routeId)
    || typeof input.canonicalBodyDigest !== 'string'
    || !regexpMatches(SHA256_COMMITMENT, input.canonicalBodyDigest)
    || typeof input.selectedContentType !== 'string'
    || !regexpMatches(CONTENT_TYPE, input.selectedContentType)
    || !positiveSafeInteger(input.maxCostUnits)
    || !positiveSafeInteger(input.costUnits)
    || input.costUnits > input.maxCostUnits
  ) {
    fail(code);
  }
  return {
    modelVersion: input.modelVersion,
    grantId: input.grantId,
    requestId: input.requestId,
    requestDigest: input.requestDigest,
    method: input.method,
    routeId: input.routeId,
    canonicalBodyDigest: input.canonicalBodyDigest,
    selectedContentType: input.selectedContentType,
    maxCostUnits: input.maxCostUnits,
    costUnits: input.costUnits,
  };
}

function generationIdentity(ledgerId, policy, capacity) {
  return sha256(GENERATION_DOMAIN, {
    contractVersion: CONTRACT_VERSION,
    ledgerId,
    policy,
    capacity,
    sequence: 1,
  });
}

function executionIdentity(ledgerId, generationId, request, policy, selectedDurationMs,
  wallClockStartMs, wallClockDeadlineMs) {
  return sha256(EXECUTION_DOMAIN, {
    contractVersion: CONTRACT_VERSION,
    ledgerId,
    generationId,
    request,
    policy,
    selectedDurationMs,
    wallClockStartMs,
    wallClockDeadlineMs,
  });
}

function requestKey(request) {
  return `${request.grantId}\0${request.requestId}`;
}

function compareExecution(left, right) {
  const leftKey = requestKey(left.request);
  const rightKey = requestKey(right.request);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function normalizeSeal(value, code) {
  if (value === null) return null;
  const input = exactDataObject(value, SEAL_KEYS, code);
  if (
    typeof input.executionId !== 'string'
    || !regexpMatches(SHA256_COMMITMENT, input.executionId)
    || typeof input.reason !== 'string'
    || !arrayHas(ALL_UNCERTAINTY_REASONS, input.reason)
  ) {
    fail(code);
  }
  return { executionId: input.executionId, reason: input.reason };
}

function normalizeExecution(value, ledgerId, generationId, rootPolicy, code) {
  const input = exactDataObject(value, EXECUTION_KEYS, code);
  const request = normalizeRequest(input.request, code);
  const policy = normalizePolicy(input.policy, code);
  if (
    input.executionVersion !== EXECUTION_VERSION
    || input.generationId !== generationId
    || !sameJson(policy, rootPolicy)
    || !positiveSafeInteger(input.selectedDurationMs)
    || input.selectedDurationMs > policy.maxDurationMs
    || !nonnegativeSafeInteger(input.wallClockStartMs)
    || !nonnegativeSafeInteger(input.wallClockDeadlineMs)
    || input.wallClockStartMs + input.selectedDurationMs !== input.wallClockDeadlineMs
    || !NUMBER_IS_SAFE_INTEGER(input.wallClockDeadlineMs)
    || typeof input.executionId !== 'string'
    || !regexpMatches(SHA256_COMMITMENT, input.executionId)
    || !arrayHas(FENCE_PHASES, input.fencePhase)
    || !arrayHas(TERMINAL_CLASSIFICATIONS, input.terminalClassification)
  ) {
    fail(code);
  }
  const expectedIdentity = executionIdentity(
    ledgerId,
    generationId,
    request,
    policy,
    input.selectedDurationMs,
    input.wallClockStartMs,
    input.wallClockDeadlineMs,
  );
  if (input.executionId !== expectedIdentity) fail(code);

  const commonNulls = input.terminalReason === null
    && input.resultCommitment === null
    && input.uncertaintyReason === null;
  if (input.terminalClassification === 'NONE') {
    if (!commonNulls) fail(code);
  } else if (input.terminalClassification === 'NOT_INVOKED') {
    if (
      input.fencePhase !== 'PREPARED'
      || typeof input.terminalReason !== 'string'
      || !arrayHas(NO_INVOCATION_REASONS, input.terminalReason)
      || input.resultCommitment !== null
      || input.uncertaintyReason !== null
    ) {
      fail(code);
    }
  } else if (input.terminalClassification === 'SUCCEEDED') {
    if (
      input.fencePhase !== 'MAY_HAVE_STARTED'
      || input.terminalReason !== null
      || typeof input.resultCommitment !== 'string'
      || !regexpMatches(SHA256_COMMITMENT, input.resultCommitment)
      || input.uncertaintyReason !== null
    ) {
      fail(code);
    }
  } else if (
    input.fencePhase !== 'MAY_HAVE_STARTED'
    || input.terminalReason !== null
    || input.resultCommitment !== null
    || typeof input.uncertaintyReason !== 'string'
    || !arrayHas(ALL_UNCERTAINTY_REASONS, input.uncertaintyReason)
  ) {
    fail(code);
  }

  return {
    executionVersion: EXECUTION_VERSION,
    executionId: input.executionId,
    generationId,
    request,
    policy,
    selectedDurationMs: input.selectedDurationMs,
    wallClockStartMs: input.wallClockStartMs,
    wallClockDeadlineMs: input.wallClockDeadlineMs,
    fencePhase: input.fencePhase,
    terminalClassification: input.terminalClassification,
    terminalReason: input.terminalReason,
    resultCommitment: input.resultCommitment,
    uncertaintyReason: input.uncertaintyReason,
  };
}

function normalizeState(value) {
  const code = CODE.invalidState;
  const input = exactDataObject(value, ROOT_KEYS, code);
  const policy = normalizePolicy(input.policy, code);
  if (
    input.contractVersion !== CONTRACT_VERSION
    || !validIdentifier(input.ledgerId)
    || !positiveSafeInteger(input.capacity)
    || input.capacity > MAX_EXECUTIONS
  ) {
    fail(code);
  }
  const generationInput = exactDataObject(input.generation, GENERATION_KEYS, code);
  const expectedGenerationId = generationIdentity(input.ledgerId, policy, input.capacity);
  const seal = normalizeSeal(generationInput.seal, code);
  if (
    generationInput.generationVersion !== GENERATION_VERSION
    || generationInput.generationId !== expectedGenerationId
    || generationInput.sequence !== 1
    || (generationInput.state !== 'OPEN' && generationInput.state !== 'SEALED')
    || (generationInput.state === 'OPEN' && seal !== null)
    || (generationInput.state === 'SEALED' && seal === null)
  ) {
    fail(code);
  }
  const values = exactDataArray(input.executions, input.capacity, code);
  const executions = [];
  const requestKeys = new SET_CONSTRUCTOR();
  const executionIds = new SET_CONSTRUCTOR();
  let prior = null;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const execution = normalizeExecution(
      value,
      input.ledgerId,
      expectedGenerationId,
      policy,
      code,
    );
    const key = requestKey(execution.request);
    if (
      setHas(requestKeys, key)
      || setHas(executionIds, execution.executionId)
      || (prior !== null && compareExecution(prior, execution) >= 0)
    ) {
      fail(code);
    }
    setAdd(requestKeys, key);
    setAdd(executionIds, execution.executionId);
    appendArrayValue(executions, execution);
    prior = execution;
  }
  let unknownCount = 0;
  for (let index = 0; index < executions.length; index += 1) {
    if (executions[index].terminalClassification === 'OUTCOME_UNKNOWN') unknownCount += 1;
  }
  if (unknownCount === 0 && generationInput.state !== 'OPEN') fail(code);
  if (unknownCount > 0 && generationInput.state !== 'SEALED') fail(code);
  if (seal !== null) {
    let trigger = null;
    for (let index = 0; index < executions.length; index += 1) {
      if (executions[index].executionId === seal.executionId) {
        trigger = executions[index];
        break;
      }
    }
    if (
      !trigger
      || trigger.terminalClassification !== 'OUTCOME_UNKNOWN'
      || trigger.uncertaintyReason !== seal.reason
    ) {
      fail(code);
    }
  }
  return snapshot({
    contractVersion: CONTRACT_VERSION,
    ledgerId: input.ledgerId,
    policy,
    capacity: input.capacity,
    generation: {
      generationVersion: GENERATION_VERSION,
      generationId: expectedGenerationId,
      sequence: 1,
      state: generationInput.state,
      seal,
    },
    executions,
  });
}

function makeState(state, executions, generation = state.generation) {
  return normalizeState({
    contractVersion: CONTRACT_VERSION,
    ledgerId: state.ledgerId,
    policy: state.policy,
    capacity: state.capacity,
    generation,
    executions: sortedCopy(executions, compareExecution),
  });
}

function replaceExecution(state, replacement, generation = state.generation) {
  const executions = [];
  for (let index = 0; index < state.executions.length; index += 1) {
    const value = state.executions[index];
    setArrayValue(
      executions,
      index,
      value.executionId === replacement.executionId ? replacement : value,
    );
  }
  return makeState(state, executions, generation);
}

function findExecution(state, executionId) {
  if (typeof executionId !== 'string' || !regexpMatches(SHA256_COMMITMENT, executionId)) {
    fail(CODE.invalidInput);
  }
  for (let index = 0; index < state.executions.length; index += 1) {
    if (state.executions[index].executionId === executionId) return state.executions[index];
  }
  fail(CODE.invalidTransition);
}

function executionOutcome(state, executionId) {
  for (let index = 0; index < state.executions.length; index += 1) {
    if (state.executions[index].executionId === executionId) return state.executions[index];
  }
  fail(CODE.invalidState);
}

function sealFor(execution, reason) {
  return {
    generationVersion: GENERATION_VERSION,
    generationId: execution.generationId,
    sequence: 1,
    state: 'SEALED',
    seal: { executionId: execution.executionId, reason },
  };
}

export function createServiceCreditExecutionContract(options) {
  if (arguments.length !== 1) fail(CODE.invalidInput);
  const input = exactDataObject(options, CREATE_KEYS, CODE.invalidInput);
  const policy = normalizePolicy(input.policy, CODE.invalidInput);
  if (
    !validIdentifier(input.ledgerId)
    || !positiveSafeInteger(input.capacity)
    || input.capacity > MAX_EXECUTIONS
  ) {
    fail(CODE.invalidInput);
  }
  const generationId = generationIdentity(input.ledgerId, policy, input.capacity);
  return normalizeState({
    contractVersion: CONTRACT_VERSION,
    ledgerId: input.ledgerId,
    policy,
    capacity: input.capacity,
    generation: {
      generationVersion: GENERATION_VERSION,
      generationId,
      sequence: 1,
      state: 'OPEN',
      seal: null,
    },
    executions: [],
  });
}

export function hydrateServiceCreditExecutionContract(state) {
  if (arguments.length !== 1) fail(CODE.invalidState);
  return normalizeState(state);
}

export function prepareServiceCreditExecution(options) {
  if (arguments.length !== 1) fail(CODE.invalidInput);
  const input = exactDataObject(options, PREPARE_KEYS, CODE.invalidInput);
  const state = normalizeState(input.state);
  const request = normalizeRequest(input.request, CODE.invalidInput);
  const policy = normalizePolicy(input.policy, CODE.invalidInput);
  if (
    !positiveSafeInteger(input.selectedDurationMs)
    || input.selectedDurationMs > policy.maxDurationMs
    || !nonnegativeSafeInteger(input.wallClockStartMs)
  ) {
    fail(CODE.invalidInput);
  }
  const wallClockDeadlineMs = input.wallClockStartMs + input.selectedDurationMs;
  if (!NUMBER_IS_SAFE_INTEGER(wallClockDeadlineMs)) fail(CODE.invalidInput);

  const key = requestKey(request);
  let existing = null;
  for (let index = 0; index < state.executions.length; index += 1) {
    if (requestKey(state.executions[index].request) === key) {
      existing = state.executions[index];
      break;
    }
  }
  if (existing) {
    if (
      !sameJson(existing.request, request)
      || !sameJson(existing.policy, policy)
      || existing.selectedDurationMs !== input.selectedDurationMs
      || existing.wallClockStartMs !== input.wallClockStartMs
      || existing.wallClockDeadlineMs !== wallClockDeadlineMs
    ) {
      fail(CODE.conflict);
    }
    return snapshot({ state, execution: existing, replayed: true });
  }
  if (!sameJson(policy, state.policy)) fail(CODE.conflict);
  if (state.generation.state === 'SEALED') fail(CODE.sealed);
  if (state.executions.length >= state.capacity) fail(CODE.capacity);

  const executionId = executionIdentity(
    state.ledgerId,
    state.generation.generationId,
    request,
    policy,
    input.selectedDurationMs,
    input.wallClockStartMs,
    wallClockDeadlineMs,
  );
  const execution = {
    executionVersion: EXECUTION_VERSION,
    executionId,
    generationId: state.generation.generationId,
    request,
    policy,
    selectedDurationMs: input.selectedDurationMs,
    wallClockStartMs: input.wallClockStartMs,
    wallClockDeadlineMs,
    fencePhase: 'PREPARED',
    terminalClassification: 'NONE',
    terminalReason: null,
    resultCommitment: null,
    uncertaintyReason: null,
  };
  const executions = [];
  for (let index = 0; index < state.executions.length; index += 1) {
    setArrayValue(executions, index, state.executions[index]);
  }
  appendArrayValue(executions, execution);
  const next = makeState(state, executions);
  return snapshot({
    state: next,
    execution: executionOutcome(next, executionId),
    replayed: false,
  });
}

export function fenceServiceCreditExecution(options) {
  if (arguments.length !== 1) fail(CODE.invalidInput);
  const input = exactDataObject(options, FENCE_KEYS, CODE.invalidInput);
  const state = normalizeState(input.state);
  if (!nonnegativeSafeInteger(input.wallClockNowMs)) fail(CODE.invalidInput);
  const execution = findExecution(state, input.executionId);
  if (execution.terminalClassification !== 'NONE') {
    return snapshot({
      fenceTransitionCandidate: { state, execution },
    });
  }
  if (execution.fencePhase === 'MAY_HAVE_STARTED') {
    return snapshot({
      fenceTransitionCandidate: { state, execution },
    });
  }
  if (state.generation.state === 'SEALED') fail(CODE.sealed);

  let replacement;
  if (input.wallClockNowMs < execution.wallClockStartMs) {
    replacement = {
      ...execution,
      terminalClassification: 'NOT_INVOKED',
      terminalReason: 'CLOCK_REGRESSION',
    };
  } else if (input.wallClockNowMs >= execution.wallClockDeadlineMs) {
    replacement = {
      ...execution,
      terminalClassification: 'NOT_INVOKED',
      terminalReason: 'DEADLINE_REACHED',
    };
  } else {
    replacement = { ...execution, fencePhase: 'MAY_HAVE_STARTED' };
  }
  const next = replaceExecution(state, replacement);
  return snapshot({
    fenceTransitionCandidate: {
      state: next,
      execution: executionOutcome(next, execution.executionId),
    },
  });
}

export function completeServiceCreditExecution(options) {
  if (arguments.length !== 1) fail(CODE.invalidInput);
  const input = exactDataObject(options, COMPLETE_KEYS, CODE.invalidInput);
  const state = normalizeState(input.state);
  if (
    typeof input.resultCommitment !== 'string'
    || !regexpMatches(SHA256_COMMITMENT, input.resultCommitment)
  ) {
    fail(CODE.invalidInput);
  }
  const execution = findExecution(state, input.executionId);
  if (execution.terminalClassification === 'SUCCEEDED') {
    if (execution.resultCommitment !== input.resultCommitment) fail(CODE.conflict);
    return snapshot({ state, execution, transitioned: false, winner: 'SUCCEEDED' });
  }
  if (execution.terminalClassification === 'OUTCOME_UNKNOWN') {
    return snapshot({ state, execution, transitioned: false, winner: 'OUTCOME_UNKNOWN' });
  }
  if (
    execution.terminalClassification !== 'NONE'
    || execution.fencePhase !== 'MAY_HAVE_STARTED'
  ) {
    fail(CODE.invalidTransition);
  }
  const replacement = {
    ...execution,
    terminalClassification: 'SUCCEEDED',
    resultCommitment: input.resultCommitment,
  };
  const next = replaceExecution(state, replacement);
  return snapshot({
    state: next,
    execution: executionOutcome(next, execution.executionId),
    transitioned: true,
    winner: 'SUCCEEDED',
  });
}

export function markServiceCreditExecutionUnknown(options) {
  if (arguments.length !== 1) fail(CODE.invalidInput);
  const input = exactDataObject(options, UNKNOWN_KEYS, CODE.invalidInput);
  const state = normalizeState(input.state);
  if (
    typeof input.reason !== 'string'
    || !arrayHas(EXTERNAL_UNCERTAINTY_REASONS, input.reason)
  ) {
    fail(CODE.invalidInput);
  }
  const execution = findExecution(state, input.executionId);
  if (execution.terminalClassification === 'SUCCEEDED') {
    return snapshot({ state, execution, transitioned: false, winner: 'SUCCEEDED' });
  }
  if (execution.terminalClassification === 'OUTCOME_UNKNOWN') {
    if (execution.uncertaintyReason !== input.reason) fail(CODE.conflict);
    return snapshot({ state, execution, transitioned: false, winner: 'OUTCOME_UNKNOWN' });
  }
  if (
    execution.terminalClassification !== 'NONE'
    || execution.fencePhase !== 'MAY_HAVE_STARTED'
  ) {
    fail(CODE.invalidTransition);
  }
  const replacement = {
    ...execution,
    terminalClassification: 'OUTCOME_UNKNOWN',
    uncertaintyReason: input.reason,
  };
  const generation = state.generation.state === 'OPEN'
    ? sealFor(replacement, input.reason)
    : state.generation;
  const next = replaceExecution(state, replacement, generation);
  return snapshot({
    state: next,
    execution: executionOutcome(next, execution.executionId),
    transitioned: true,
    winner: 'OUTCOME_UNKNOWN',
  });
}

export function recoverServiceCreditExecutions(options) {
  if (arguments.length !== 1) fail(CODE.invalidInput);
  const input = exactDataObject(options, RECOVER_KEYS, CODE.invalidInput);
  const state = normalizeState(input.state);
  if (!nonnegativeSafeInteger(input.wallClockNowMs)) fail(CODE.invalidInput);

  let noInvocationCount = 0;
  let outcomeUnknownCount = 0;
  let trigger = null;
  const executions = [];
  for (let index = 0; index < state.executions.length; index += 1) {
    const execution = state.executions[index];
    if (execution.terminalClassification !== 'NONE') {
      setArrayValue(executions, index, execution);
      continue;
    }
    if (execution.fencePhase === 'PREPARED') {
      noInvocationCount += 1;
      setArrayValue(executions, index, {
        ...execution,
        terminalClassification: 'NOT_INVOKED',
        terminalReason: 'RECOVERY_PREPARED',
      });
      continue;
    }
    let reason = 'RESTART_LOST_CONTROL';
    if (input.wallClockNowMs < execution.wallClockStartMs) reason = 'CLOCK_REGRESSION';
    else if (input.wallClockNowMs >= execution.wallClockDeadlineMs) reason = 'DEADLINE_EXPIRED';
    const replacement = {
      ...execution,
      terminalClassification: 'OUTCOME_UNKNOWN',
      uncertaintyReason: reason,
    };
    outcomeUnknownCount += 1;
    if (trigger === null) trigger = replacement;
    setArrayValue(executions, index, replacement);
  }
  if (noInvocationCount === 0 && outcomeUnknownCount === 0) {
    return snapshot({ state, transitioned: false, noInvocationCount: 0, outcomeUnknownCount: 0 });
  }
  const generation = state.generation.state === 'OPEN' && trigger !== null
    ? sealFor(trigger, trigger.uncertaintyReason)
    : state.generation;
  const next = makeState(state, executions, generation);
  return snapshot({
    state: next,
    transitioned: true,
    noInvocationCount,
    outcomeUnknownCount,
  });
}
