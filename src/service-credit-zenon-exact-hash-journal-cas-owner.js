import { types as utilTypes } from 'node:util';

import { SettlementJournal } from './settlement-journal.js';
import { planZenonExactHashRecovery } from './service-credit-zenon-exact-hash-recovery-plan.js';

const REJECTED_ERROR_CODE = 'zenon_exact_hash_journal_cas_owner_rejected';
const OUTCOME_UNKNOWN_ERROR_CODE =
  'zenon_exact_hash_journal_cas_owner_outcome_unknown';
const DELIVERY_NONE = 'NONE';
const SUBMISSION_ACKNOWLEDGED = 'SUBMISSION_ACKNOWLEDGED';
const MOMENTUM_INCLUDED = 'MOMENTUM_INCLUDED';

const IDENTITY_FIELDS = Object.freeze(['authorizationKey', 'transactionHash']);
const RESULT_FIELDS = Object.freeze(['changed', 'record']);
const RECORD_FIELDS = Object.freeze([
  'authorizationKey',
  'transactionHash',
  'chainProfile',
  'intentDigest',
  'resourceIdentity',
  'resourceDigest',
  'payer',
  'signedAccountBlock',
  'evidenceState',
  'momentumEvidence',
  'deliveryState',
  'cachedResponse',
  'createdAt',
  'updatedAt',
]);
const MOMENTUM_EVIDENCE_FIELDS = Object.freeze([
  'observedAt',
  'confirmationDetail',
]);
const CONFIRMATION_FIELDS = Object.freeze([
  'numConfirmations',
  'momentumHeight',
  'momentumHash',
  'momentumTimestamp',
]);
const OWNER_METHODS = Object.freeze([
  'getEntrySnapshot',
  'compareAndUpdateEvidence',
]);
const HASH = /^[0-9a-f]{64}$/;

const GET_ENTRY_SNAPSHOT = SettlementJournal.prototype.getEntrySnapshot;
const COMPARE_AND_UPDATE_EVIDENCE = SettlementJournal.prototype.compareAndUpdateEvidence;
const OBJECT_FREEZE = Object.freeze;
const OBJECT_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const OBJECT_GET_PROTOTYPE_OF = Object.getPrototypeOf;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_APPLY = Reflect.apply;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const REGEXP_TEST = RegExp.prototype.test;
const IS_PROXY = utilTypes.isProxy;

class ZenonExactHashJournalCasOwnerError extends Error {
  constructor() {
    super(REJECTED_ERROR_CODE);
    this.name = 'ZenonExactHashJournalCasOwnerError';
    this.code = REJECTED_ERROR_CODE;
    this.stack = undefined;
  }
}

class ZenonExactHashJournalCasOwnerOutcomeUnknownError extends Error {
  constructor() {
    super(OUTCOME_UNKNOWN_ERROR_CODE);
    this.name = 'ZenonExactHashJournalCasOwnerOutcomeUnknownError';
    this.code = OUTCOME_UNKNOWN_ERROR_CODE;
    this.stack = undefined;
  }
}

function reject() {
  throw new ZenonExactHashJournalCasOwnerError();
}

function outcomeUnknown() {
  throw new ZenonExactHashJournalCasOwnerOutcomeUnknownError();
}

function isProxy(value) {
  return REFLECT_APPLY(IS_PROXY, undefined, [value]);
}

function ownDataValues(value, fields) {
  if (value === null || typeof value !== 'object' || isProxy(value) ||
      REFLECT_APPLY(OBJECT_GET_PROTOTYPE_OF, Object, [value]) !== OBJECT_PROTOTYPE) {
    reject();
  }
  const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [value]);
  if (keys.length !== fields.length) reject();
  const captured = {};
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const descriptor = REFLECT_APPLY(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR,
      Object,
      [value, field],
    );
    if (!descriptor || descriptor.enumerable !== true ||
        !Object.hasOwn(descriptor, 'value')) {
      reject();
    }
    captured[field] = descriptor.value;
  }
  for (let index = 0; index < keys.length; index += 1) {
    if (typeof keys[index] !== 'string' || !fields.includes(keys[index])) reject();
  }
  return captured;
}

function captureIdentity(value) {
  const identity = ownDataValues(value, IDENTITY_FIELDS);
  if (typeof identity.authorizationKey !== 'string' ||
      !REFLECT_APPLY(REGEXP_TEST, HASH, [identity.authorizationKey]) ||
      typeof identity.transactionHash !== 'string' ||
      !REFLECT_APPLY(REGEXP_TEST, HASH, [identity.transactionHash])) {
    reject();
  }
  return OBJECT_FREEZE({
    authorizationKey: identity.authorizationKey,
    transactionHash: identity.transactionHash,
  });
}

function validateJournal(journal) {
  if (journal === null || typeof journal !== 'object' || isProxy(journal) ||
      REFLECT_APPLY(OBJECT_GET_PROTOTYPE_OF, Object, [journal]) !==
        SettlementJournal.prototype) {
    reject();
  }
  for (let index = 0; index < OWNER_METHODS.length; index += 1) {
    const descriptor = REFLECT_APPLY(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR,
      Object,
      [journal, OWNER_METHODS[index]],
    );
    if (descriptor !== undefined) reject();
  }
}

function validPlan(plan, identity, revision, record) {
  return plan?.planVersion === 1 &&
    plan.scope === 'SOURCE_ONLY_EXACT_HASH' &&
    plan.identity?.authorizationKey === identity.authorizationKey &&
    plan.identity?.transactionHash === identity.transactionHash &&
    plan.expected?.revision === revision &&
    plan.expected?.evidenceState === record.evidenceState &&
    plan.expected?.deliveryState === DELIVERY_NONE &&
    plan.assertions?.nonpublication === 'NOT_ESTABLISHED' &&
    plan.assertions?.canonicality === 'NOT_ESTABLISHED' &&
    plan.assertions?.chainFinality === 'NOT_ESTABLISHED' &&
    plan.assertions?.independentAuthentication === 'NOT_ESTABLISHED' &&
    plan.sideEffects === 'NONE';
}

function sameConfirmationDetail(actualInput, expectedInput) {
  const actual = ownDataValues(actualInput, CONFIRMATION_FIELDS);
  const expected = ownDataValues(expectedInput, CONFIRMATION_FIELDS);
  for (let index = 0; index < CONFIRMATION_FIELDS.length; index += 1) {
    const field = CONFIRMATION_FIELDS[index];
    if (actual[field] !== expected[field]) return false;
  }
  return true;
}

function validateCasResult(resultInput, identity, evidenceState, confirmationDetail) {
  const result = ownDataValues(resultInput, RESULT_FIELDS);
  if (result.changed !== true) reject();
  const record = ownDataValues(result.record, RECORD_FIELDS);
  if (record.authorizationKey !== identity.authorizationKey ||
      record.transactionHash !== identity.transactionHash ||
      record.evidenceState !== evidenceState ||
      record.deliveryState !== DELIVERY_NONE || record.cachedResponse !== null) {
    reject();
  }
  if (evidenceState === SUBMISSION_ACKNOWLEDGED) {
    if (confirmationDetail !== null || record.momentumEvidence !== null) reject();
    return;
  }
  if (evidenceState !== MOMENTUM_INCLUDED || confirmationDetail === null) reject();
  const momentumEvidence = ownDataValues(
    record.momentumEvidence,
    MOMENTUM_EVIDENCE_FIELDS,
  );
  if (typeof momentumEvidence.observedAt !== 'string' ||
      !sameConfirmationDetail(
        momentumEvidence.confirmationDetail,
        confirmationDetail,
      )) {
    reject();
  }
}

function status(statusValue, evidenceState) {
  return OBJECT_FREEZE({
    status: statusValue,
    evidenceState,
    nonpublication: 'NOT_ESTABLISHED',
  });
}

/**
 * Apply one explicitly invoked, source-only exact-hash journal transition.
 */
export async function applyZenonExactHashRecoveryJournalCas(
  journal,
  identityInput,
  observation,
) {
  let casEntered = false;
  try {
    if (arguments.length !== 3) reject();
    validateJournal(journal);
    const identity = captureIdentity(identityInput);
    const snapshot = await REFLECT_APPLY(GET_ENTRY_SNAPSHOT, journal, [
      identity.authorizationKey,
      identity.transactionHash,
    ]);
    const plan = planZenonExactHashRecovery(snapshot, observation);
    const snapshotValues = ownDataValues(snapshot, ['revision', 'kind', 'entry']);
    const record = ownDataValues(snapshotValues.entry, RECORD_FIELDS);
    if (!validPlan(plan, identity, snapshotValues.revision, record)) reject();

    if (plan.disposition === 'NO_MUTATION') {
      if (plan.update !== null) reject();
      return status('NO_MUTATION', plan.expected.evidenceState);
    }
    if (plan.disposition !== 'EVIDENCE_UPDATE' || plan.update === null ||
        ![SUBMISSION_ACKNOWLEDGED, MOMENTUM_INCLUDED]
          .includes(plan.update.evidenceState)) {
      reject();
    }

    const casArguments = [{
      expectedRevision: snapshotValues.revision,
      expectedRecord: snapshotValues.entry,
      evidenceState: plan.update.evidenceState,
      confirmationDetail: plan.update.confirmationDetail,
    }];
    casEntered = true;
    const result = await REFLECT_APPLY(
      COMPARE_AND_UPDATE_EVIDENCE,
      journal,
      casArguments,
    );
    validateCasResult(
      result,
      identity,
      plan.update.evidenceState,
      plan.update.confirmationDetail,
    );
    return status('EVIDENCE_UPDATED', plan.update.evidenceState);
  } catch {
    if (casEntered) outcomeUnknown();
    reject();
  }
}
