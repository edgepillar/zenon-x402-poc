import { types as utilTypes } from 'node:util';

import { canonicalJson } from './canonical.js';
import {
  GATE_B_RESET_EPOCH_WSS_ONCE_ARTIFACT_FAMILY_V4,
  assertGateBResetEpochWssOnceExecutionBindingV4,
  bindGateBResetEpochWssOnceArtifactsV4,
} from './gate-b-reset-epoch-wss-once-artifacts-v4.js';
import {
  GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4,
  armGateBResetEpochWssOnceFacilitatorValidationV4,
  armGateBResetEpochWssOncePreparationV4,
  assertGateBResetEpochWssOnceJournalBindingV4,
  blockGateBResetEpochWssOncePublicationV4,
  recordGateBResetEpochWssOnceFacilitatorValidationV4,
  recordGateBResetEpochWssOncePreparedPaymentV4,
  snapshotGateBResetEpochWssOnceJournalV4,
} from './gate-b-reset-epoch-wss-once-journal-v4.js';

const ERROR_CODE = 'gate_b_reset_epoch_wss_once_runner_v4_invalid';
const INPUT_FIELDS = Object.freeze([
  'authorization', 'configurationBytes', 'journal', 'offlineFakes', 'review',
]);
const FAKE_FIELDS = Object.freeze([
  'checkpoint', 'observeBinding', 'prepareBuyerPayment',
  'validateFacilitator',
]);
const OBSERVATION_FIELDS = Object.freeze([
  'executionBinding', 'observationVersion', 'stage',
]);
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROMISE = utilTypes.isPromise;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_APPLY = Reflect.apply;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const RUNNERS = new WeakMap();

export const GATE_B_RESET_EPOCH_WSS_ONCE_CHECKPOINT_V4 = Object.freeze({
  FACILITATOR_VALIDATED: 'FACILITATOR_VALIDATED',
  FACILITATOR_VALIDATION_ARMED: 'FACILITATOR_VALIDATION_ARMED',
  PAYMENT_PREPARED: 'PAYMENT_PREPARED',
  PREPARATION_ARMED: 'PREPARATION_ARMED',
  PUBLICATION_BLOCKED: 'PUBLICATION_BLOCKED',
  SUBMISSION_OUTCOME_UNKNOWN: 'SUBMISSION_OUTCOME_UNKNOWN',
});

export const GATE_B_RESET_EPOCH_WSS_ONCE_OBSERVATION_STAGE_V4 = Object.freeze({
  BUYER_PREPARATION: 'BUYER_PREPARATION',
  FACILITATOR_VALIDATION: 'FACILITATOR_VALIDATION',
});

export const GATE_B_RESET_EPOCH_WSS_ONCE_RESULT_V4 = Object.freeze({
  artifactFamily: GATE_B_RESET_EPOCH_WSS_ONCE_ARTIFACT_FAMILY_V4,
  liveRunAuthorized: false,
  publicationAuthorized: false,
  publicationDecision: 'DO_NOT_PUBLISH',
  resultVersion: 4,
  status: 'OFFLINE_FAKE_EXECUTION_COMPLETE_PUBLICATION_NOT_AUTHORIZED',
});

export class GateBResetEpochWssOnceRunnerV4Error extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBResetEpochWssOnceRunnerV4Error';
    this.code = ERROR_CODE;
    this.stack = undefined;
  }
}

function fail() {
  throw new GateBResetEpochWssOnceRunnerV4Error();
}

function exactPlainObject(value, fields) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value) ||
      ARRAY_IS_ARRAY(value) || GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const keys = REFLECT_OWN_KEYS(value);
  if (keys.length !== fields.length) fail();
  const snapshot = Object.create(null);
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, field);
    if (!descriptor || !HAS_OWN(descriptor, 'value') ||
        descriptor.enumerable !== true) fail();
    snapshot[field] = descriptor.value;
  }
  for (let index = 0; index < keys.length; index += 1) {
    if (typeof keys[index] !== 'string' || !fields.includes(keys[index])) fail();
  }
  return snapshot;
}

function captureOfflineFakes(value) {
  const snapshot = exactPlainObject(value, FAKE_FIELDS);
  const output = Object.create(null);
  for (let index = 0; index < FAKE_FIELDS.length; index += 1) {
    const field = FAKE_FIELDS[index];
    if (typeof snapshot[field] !== 'function' || IS_PROXY(snapshot[field])) fail();
    output[field] = snapshot[field];
  }
  return Object.freeze(output);
}

function exactNativePromise(value) {
  if (!IS_PROMISE(value) || IS_PROXY(value) ||
      GET_PROTOTYPE_OF(value) !== Promise.prototype ||
      GET_OWN_PROPERTY_DESCRIPTOR(value, 'then') !== undefined) fail();
  return value;
}

async function invokeFake(fn, args) {
  let pending;
  try {
    pending = REFLECT_APPLY(fn, undefined, args);
  } catch {
    fail();
  }
  try {
    return await exactNativePromise(pending);
  } catch {
    fail();
  }
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function exactObservation(value, expectedStage, artifacts) {
  const observation = exactPlainObject(value, OBSERVATION_FIELDS);
  if (observation.observationVersion !== 4 ||
      observation.stage !== expectedStage) fail();
  const executionBinding = assertGateBResetEpochWssOnceExecutionBindingV4(
    observation.executionBinding,
  );
  if (!same(executionBinding, artifacts.executionBinding)) fail();
  return Object.freeze({
    executionBinding,
    observationVersion: 4,
    stage: expectedStage,
  });
}

async function observeExactBinding(state, stage) {
  const context = Object.freeze({
    executionBinding: state.artifacts.executionBinding,
    stage,
  });
  const value = await invokeFake(state.fakes.observeBinding, [context]);
  return exactObservation(value, stage, state.artifacts);
}

async function checkpoint(state, name) {
  const result = await invokeFake(state.fakes.checkpoint, [name]);
  if (result !== undefined) fail();
}

function buyerContext(state) {
  return Object.freeze({
    executionBinding: state.artifacts.executionBinding,
    paymentRequest: state.artifacts.paymentRequest,
    workspace: state.artifacts.workspace,
  });
}

function facilitatorContext(state, preparedPayment) {
  return Object.freeze({
    executionBinding: state.artifacts.executionBinding,
    paymentRequest: state.artifacts.paymentRequest,
    preparedPayment,
    workspace: state.artifacts.workspace,
  });
}

async function preparePayment(state, journalState) {
  await observeExactBinding(
    state,
    GATE_B_RESET_EPOCH_WSS_ONCE_OBSERVATION_STAGE_V4.BUYER_PREPARATION,
  );
  journalState = armGateBResetEpochWssOncePreparationV4(
    state.journal,
    journalState.revision,
  );
  await checkpoint(
    state,
    GATE_B_RESET_EPOCH_WSS_ONCE_CHECKPOINT_V4.PREPARATION_ARMED,
  );
  const preparedPayment = await invokeFake(
    state.fakes.prepareBuyerPayment,
    [buyerContext(state)],
  );
  journalState = recordGateBResetEpochWssOncePreparedPaymentV4(
    state.journal,
    journalState.revision,
    preparedPayment,
  );
  await checkpoint(
    state,
    GATE_B_RESET_EPOCH_WSS_ONCE_CHECKPOINT_V4.PAYMENT_PREPARED,
  );
  return journalState;
}

async function validatePayment(state, journalState) {
  await observeExactBinding(
    state,
    GATE_B_RESET_EPOCH_WSS_ONCE_OBSERVATION_STAGE_V4.FACILITATOR_VALIDATION,
  );
  journalState = armGateBResetEpochWssOnceFacilitatorValidationV4(
    state.journal,
    journalState.revision,
  );
  await checkpoint(
    state,
    GATE_B_RESET_EPOCH_WSS_ONCE_CHECKPOINT_V4.FACILITATOR_VALIDATION_ARMED,
  );
  const validation = await invokeFake(
    state.fakes.validateFacilitator,
    [facilitatorContext(state, journalState.preparedPayment)],
  );
  journalState = recordGateBResetEpochWssOnceFacilitatorValidationV4(
    state.journal,
    journalState.revision,
    validation,
  );
  if (journalState.phase ===
      GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.SUBMISSION_OUTCOME_UNKNOWN) {
    await checkpoint(
      state,
      GATE_B_RESET_EPOCH_WSS_ONCE_CHECKPOINT_V4.SUBMISSION_OUTCOME_UNKNOWN,
    );
    fail();
  }
  await checkpoint(
    state,
    GATE_B_RESET_EPOCH_WSS_ONCE_CHECKPOINT_V4.FACILITATOR_VALIDATED,
  );
  return journalState;
}

async function executeOnce(state) {
  let journalState = assertGateBResetEpochWssOnceJournalBindingV4(
    state.journal,
    state.artifacts,
  );
  if (journalState.phase ===
      GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.EMPTY) {
    journalState = await preparePayment(state, journalState);
  } else if (journalState.phase !==
      GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.PAYMENT_PREPARED &&
      journalState.phase !==
        GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.FACILITATOR_VALIDATED) {
    fail();
  }

  if (journalState.phase ===
      GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.PAYMENT_PREPARED) {
    journalState = await validatePayment(state, journalState);
  }
  if (journalState.phase !==
      GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.FACILITATOR_VALIDATED) fail();

  journalState = blockGateBResetEpochWssOncePublicationV4(
    state.journal,
    journalState.revision,
  );
  await checkpoint(
    state,
    GATE_B_RESET_EPOCH_WSS_ONCE_CHECKPOINT_V4.PUBLICATION_BLOCKED,
  );
  if (journalState.phase !==
      GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.PUBLICATION_BLOCKED ||
      journalState.liveRunAuthorized !== false ||
      journalState.publicationAuthorized !== false) fail();
  return GATE_B_RESET_EPOCH_WSS_ONCE_RESULT_V4;
}

export function createGateBResetEpochWssOnceRunnerV4(input) {
  try {
    const snapshot = exactPlainObject(input, INPUT_FIELDS);
    const artifacts = bindGateBResetEpochWssOnceArtifactsV4(
      snapshot.configurationBytes,
      snapshot.review,
      snapshot.authorization,
    );
    assertGateBResetEpochWssOnceJournalBindingV4(snapshot.journal, artifacts);
    const fakes = captureOfflineFakes(snapshot.offlineFakes);
    const runner = Object.create(null);
    const state = {
      artifacts,
      fakes,
      journal: snapshot.journal,
      used: false,
    };
    const execute = async (...args) => {
      if (state.used) fail();
      state.used = true;
      if (args.length !== 0) fail();
      try {
        return await executeOnce(state);
      } catch {
        fail();
      }
    };
    Object.defineProperty(runner, 'execute', {
      configurable: false,
      enumerable: true,
      value: execute,
      writable: false,
    });
    Object.freeze(runner);
    RUNNERS.set(runner, state);
    return runner;
  } catch {
    fail();
  }
}

export function snapshotGateBResetEpochWssOnceRunnerJournalV4(runner) {
  try {
    if (runner === null || typeof runner !== 'object' || IS_PROXY(runner) ||
        !RUNNERS.has(runner)) fail();
    return snapshotGateBResetEpochWssOnceJournalV4(RUNNERS.get(runner).journal);
  } catch {
    fail();
  }
}
