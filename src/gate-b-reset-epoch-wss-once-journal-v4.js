import { createHash } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { types as utilTypes } from 'node:util';

import { canonicalJson } from './canonical.js';
import {
  GATE_B_RESET_EPOCH_WSS_ONCE_ARTIFACT_FAMILY_V4,
  GATE_B_RESET_EPOCH_WSS_ONCE_WORKSPACE_FAMILY_V4,
  assertGateBResetEpochWssOnceExecutionBindingV4,
  bindGateBResetEpochWssOnceArtifactsV4,
} from './gate-b-reset-epoch-wss-once-artifacts-v4.js';

const INVALID = 'gate_b_reset_epoch_wss_once_journal_v4_invalid';
const INVALID_CONFIGURATION =
  'gate_b_reset_epoch_wss_once_journal_v4_invalid_configuration';
const UNSAFE_WORKSPACE =
  'gate_b_reset_epoch_wss_once_journal_v4_unsafe_workspace';
const UNSAFE_FILE = 'gate_b_reset_epoch_wss_once_journal_v4_unsafe_file';
const WORKSPACE_NOT_EMPTY =
  'gate_b_reset_epoch_wss_once_journal_v4_workspace_not_empty';
const CREATE_FAILED = 'gate_b_reset_epoch_wss_once_journal_v4_create_failed';
const OPEN_FAILED = 'gate_b_reset_epoch_wss_once_journal_v4_open_failed';
const OWNER_BUSY = 'gate_b_reset_epoch_wss_once_journal_v4_owner_busy';
const SCHEMA_UNSUPPORTED =
  'gate_b_reset_epoch_wss_once_journal_v4_schema_unsupported';
const CORRUPT = 'gate_b_reset_epoch_wss_once_journal_v4_corrupt';
const CLOSED = 'gate_b_reset_epoch_wss_once_journal_v4_closed';
const QUARANTINED = 'gate_b_reset_epoch_wss_once_journal_v4_quarantined';
const REENTRANT_OPERATION =
  'gate_b_reset_epoch_wss_once_journal_v4_reentrant_operation';
const INVALID_TRANSITION =
  'gate_b_reset_epoch_wss_once_journal_v4_invalid_transition';
const TRANSACTION_FAILED =
  'gate_b_reset_epoch_wss_once_journal_v4_transaction_failed';
const COMMIT_OUTCOME_UNKNOWN =
  'gate_b_reset_epoch_wss_once_journal_v4_commit_outcome_unknown';
const ROLLBACK_FAILED =
  'gate_b_reset_epoch_wss_once_journal_v4_rollback_failed';
const CLOSE_FAILED = 'gate_b_reset_epoch_wss_once_journal_v4_close_failed';
const DIRECTORY_SYNC_FAILED =
  'gate_b_reset_epoch_wss_once_journal_v4_directory_sync_failed';

const APPLICATION_ID = 0x47425234;
const DATABASE_USER_VERSION = 4;
const ENVELOPE_VERSION = 4;
const MAXIMUM_ENVELOPE_BYTES = 256 * 1024;
const MAXIMUM_SAFE_REVISION = Number.MAX_SAFE_INTEGER;
const CHECKSUM = /^sha256:[0-9a-f]{64}$/;
const CONFIGURATION_DIGEST = /^[0-9a-f]{64}$/;
const PAYMENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const JOURNALS = new WeakSet();
const JOURNAL_STORES = new WeakMap();
const OPEN_DATABASE_PATHS = new Set();

export const GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_FILE_V4 =
  'gate-b-reset-epoch-wss-once-journal-v4.sqlite3';

const META_TABLE = 'gate_b_reset_epoch_wss_once_meta_v4';
const STATE_TABLE = 'gate_b_reset_epoch_wss_once_state_v4';
const META_TABLE_SQL = `CREATE TABLE ${META_TABLE}(singleton INTEGER PRIMARY KEY CHECK(singleton = 1),artifact_family TEXT NOT NULL,journal_version INTEGER NOT NULL CHECK(journal_version = 4),configuration_digest TEXT NOT NULL,execution_binding_digest TEXT NOT NULL,payment_request_digest TEXT NOT NULL,workspace_family TEXT NOT NULL,workspace_generation TEXT NOT NULL,owner_epoch INTEGER NOT NULL CHECK(owner_epoch >= 0 AND owner_epoch <= 9007199254740991)) STRICT`;
const STATE_TABLE_SQL = `CREATE TABLE ${STATE_TABLE}(singleton INTEGER PRIMARY KEY CHECK(singleton = 1),revision INTEGER NOT NULL CHECK(revision >= 0 AND revision <= 9007199254740991),phase TEXT NOT NULL CHECK(phase IN ('EMPTY','PREPARATION_ARMED','PAYMENT_PREPARED','FACILITATOR_VALIDATION_ARMED','FACILITATOR_VALIDATED','SUBMISSION_OUTCOME_UNKNOWN','PUBLICATION_BLOCKED')),envelope_checksum TEXT NOT NULL,envelope TEXT NOT NULL) STRICT`;

const OPTION_FIELDS = Object.freeze([
  'authorization', 'configurationBytes', 'review', 'workspaceRoot',
]);
const PREPARED_PAYMENT_FIELDS = Object.freeze([
  'buyerPreparationVersion', 'executionBinding', 'paymentId', 'payer',
  'requestId', 'state', 'submissionOutcome',
]);
const VALIDATION_FIELDS = Object.freeze([
  'executionBinding', 'facilitatorValidationVersion', 'paymentId', 'payer',
  'state', 'submissionOutcome',
]);
const RECONCILIATION_FIELDS = Object.freeze([
  'executionBinding', 'paymentId', 'payer', 'reconciliationVersion', 'state',
  'submissionOutcome',
]);
const ENVELOPE_FIELDS = Object.freeze([
  'artifactFamily', 'checksum', 'configurationDigest', 'executionBinding',
  'journalVersion', 'liveRunAuthorized', 'paymentRequest', 'phase',
  'preparedPayment', 'publicationAuthorized', 'reconciliation', 'revision',
  'validation', 'workspace',
]);

export const GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4 = Object.freeze({
  EMPTY: 'EMPTY',
  PREPARATION_ARMED: 'PREPARATION_ARMED',
  PAYMENT_PREPARED: 'PAYMENT_PREPARED',
  FACILITATOR_VALIDATION_ARMED: 'FACILITATOR_VALIDATION_ARMED',
  FACILITATOR_VALIDATED: 'FACILITATOR_VALIDATED',
  SUBMISSION_OUTCOME_UNKNOWN: 'SUBMISSION_OUTCOME_UNKNOWN',
  PUBLICATION_BLOCKED: 'PUBLICATION_BLOCKED',
});

export class GateBResetEpochWssOnceJournalV4Error extends Error {
  constructor(code = INVALID) {
    super(code);
    this.name = 'GateBResetEpochWssOnceJournalV4Error';
    this.code = code;
    this.stack = undefined;
  }
}

function failure(code = INVALID) {
  return new GateBResetEpochWssOnceJournalV4Error(code);
}

function fail(code = INVALID) {
  throw failure(code);
}

function knownCode(error) {
  return error instanceof GateBResetEpochWssOnceJournalV4Error
    ? error.code
    : null;
}

function exactPlainObject(value, fields, code = INVALID) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value) ||
      ARRAY_IS_ARRAY(value) || GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) {
    fail(code);
  }
  const keys = REFLECT_OWN_KEYS(value);
  if (keys.length !== fields.length) fail(code);
  const snapshot = Object.create(null);
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, field);
    if (!descriptor || !HAS_OWN(descriptor, 'value') ||
        descriptor.enumerable !== true) fail(code);
    snapshot[field] = descriptor.value;
  }
  for (let index = 0; index < keys.length; index += 1) {
    if (typeof keys[index] !== 'string' || !fields.includes(keys[index])) {
      fail(code);
    }
  }
  return snapshot;
}

function safeString(value, maximumBytes, code = INVALID) {
  if (typeof value !== 'string' || value.length < 1 ||
      Buffer.byteLength(value, 'utf8') > maximumBytes ||
      /[\u0000-\u001f\u007f]/u.test(value)) fail(code);
  return value;
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function digest(domain, value) {
  return `sha256:${createHash('sha256')
    .update(domain, 'utf8')
    .update('\0', 'utf8')
    .update(typeof value === 'string' ? value : canonicalJson(value), 'utf8')
    .digest('hex')}`;
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function exactExecutionBinding(value, artifacts, code) {
  try {
    const binding = assertGateBResetEpochWssOnceExecutionBindingV4(value);
    if (!same(binding, artifacts.executionBinding)) fail(code);
    return binding;
  } catch (error) {
    throw failure(knownCode(error) ?? code);
  }
}

function freezePreparedPayment(value, artifacts, code = INVALID) {
  const payment = exactPlainObject(value, PREPARED_PAYMENT_FIELDS, code);
  if (payment.buyerPreparationVersion !== 4 ||
      typeof payment.paymentId !== 'string' || !PAYMENT_ID.test(payment.paymentId) ||
      payment.requestId !== artifacts.paymentRequest.requestId ||
      payment.state !== 'BUYER_PREPARED_OFFLINE_FAKE' ||
      payment.submissionOutcome !== 'NOT_ATTEMPTED') fail(code);
  const executionBinding = exactExecutionBinding(
    payment.executionBinding,
    artifacts,
    code,
  );
  return Object.freeze({
    buyerPreparationVersion: 4,
    executionBinding,
    paymentId: payment.paymentId,
    payer: safeString(payment.payer, 256, code),
    requestId: payment.requestId,
    state: 'BUYER_PREPARED_OFFLINE_FAKE',
    submissionOutcome: 'NOT_ATTEMPTED',
  });
}

function freezeValidation(value, artifacts, preparedPayment, code = INVALID) {
  const validation = exactPlainObject(value, VALIDATION_FIELDS, code);
  if (validation.facilitatorValidationVersion !== 4 ||
      validation.paymentId !== preparedPayment.paymentId ||
      validation.payer !== preparedPayment.payer) fail(code);
  const executionBinding = exactExecutionBinding(
    validation.executionBinding,
    artifacts,
    code,
  );
  const valid = validation.state === 'VALIDATED_NO_SUBMISSION' &&
    validation.submissionOutcome === 'NOT_ATTEMPTED';
  const unknown = validation.state === 'SUBMISSION_OUTCOME_UNKNOWN' &&
    validation.submissionOutcome === 'UNKNOWN';
  if (!valid && !unknown) fail(code);
  return Object.freeze({
    executionBinding,
    facilitatorValidationVersion: 4,
    paymentId: validation.paymentId,
    payer: validation.payer,
    state: validation.state,
    submissionOutcome: validation.submissionOutcome,
  });
}

function freezeReconciliation(value, artifacts, preparedPayment, code = INVALID) {
  const reconciliation = exactPlainObject(value, RECONCILIATION_FIELDS, code);
  if (reconciliation.reconciliationVersion !== 4 ||
      reconciliation.paymentId !== preparedPayment.paymentId ||
      reconciliation.payer !== preparedPayment.payer ||
      reconciliation.state !== 'SAME_PAYMENT_RECONCILED_OFFLINE_FAKE' ||
      reconciliation.submissionOutcome !==
        'RESOLVED_WITHOUT_PUBLICATION_AUTHORITY') fail(code);
  const executionBinding = exactExecutionBinding(
    reconciliation.executionBinding,
    artifacts,
    code,
  );
  return Object.freeze({
    executionBinding,
    paymentId: reconciliation.paymentId,
    payer: reconciliation.payer,
    reconciliationVersion: 4,
    state: 'SAME_PAYMENT_RECONCILED_OFFLINE_FAKE',
    submissionOutcome: 'RESOLVED_WITHOUT_PUBLICATION_AUTHORITY',
  });
}

function stateInvariant(state, artifacts, code) {
  if (!Number.isSafeInteger(state.revision) || state.revision < 0 ||
      Object.is(state.revision, -0)) fail(code);
  const preparedPayment = state.preparedPayment === null
    ? null
    : freezePreparedPayment(state.preparedPayment, artifacts, code);
  const validation = state.validation === null
    ? null
    : freezeValidation(state.validation, artifacts, preparedPayment, code);
  const reconciliation = state.reconciliation === null
    ? null
    : freezeReconciliation(
      state.reconciliation,
      artifacts,
      preparedPayment,
      code,
    );
  const validValidation = validation?.state === 'VALIDATED_NO_SUBMISSION';
  const unknownValidation = validation?.state === 'SUBMISSION_OUTCOME_UNKNOWN';
  let valid = false;
  switch (state.phase) {
    case GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.EMPTY:
      valid = state.revision === 0 && preparedPayment === null &&
        validation === null && reconciliation === null;
      break;
    case GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.PREPARATION_ARMED:
      valid = state.revision === 1 && preparedPayment === null &&
        validation === null && reconciliation === null;
      break;
    case GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.PAYMENT_PREPARED:
      valid = state.revision === 2 && preparedPayment !== null &&
        validation === null && reconciliation === null;
      break;
    case GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4
      .FACILITATOR_VALIDATION_ARMED:
      valid = state.revision === 3 && preparedPayment !== null &&
        validation === null && reconciliation === null;
      break;
    case GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.FACILITATOR_VALIDATED:
      valid = state.revision === 4 && preparedPayment !== null &&
        validValidation && reconciliation === null;
      break;
    case GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4
      .SUBMISSION_OUTCOME_UNKNOWN:
      valid = state.revision === 4 && preparedPayment !== null &&
        unknownValidation && reconciliation === null;
      break;
    case GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.PUBLICATION_BLOCKED:
      valid = state.revision === 5 && preparedPayment !== null && (
        (validValidation && reconciliation === null) ||
        (unknownValidation && reconciliation !== null)
      );
      break;
    default:
      valid = false;
  }
  if (!valid) fail(code);
  return deepFreeze({
    phase: state.phase,
    preparedPayment,
    reconciliation,
    revision: state.revision,
    validation,
  });
}

function envelopeCore(artifacts, state) {
  return {
    artifactFamily: GATE_B_RESET_EPOCH_WSS_ONCE_ARTIFACT_FAMILY_V4,
    configurationDigest: artifacts.configurationDigest,
    executionBinding: artifacts.executionBinding,
    journalVersion: 4,
    liveRunAuthorized: false,
    paymentRequest: artifacts.paymentRequest,
    phase: state.phase,
    preparedPayment: state.preparedPayment,
    publicationAuthorized: false,
    reconciliation: state.reconciliation,
    revision: state.revision,
    validation: state.validation,
    workspace: artifacts.workspace,
  };
}

function createEnvelope(artifacts, candidate) {
  const state = stateInvariant(candidate, artifacts, INVALID_TRANSITION);
  const core = envelopeCore(artifacts, state);
  return deepFreeze({
    ...core,
    checksum: digest(
      'zenon-x402:gate-b-reset-epoch-wss-once-journal-envelope-v4',
      core,
    ),
  });
}

function parseEnvelope(text, artifacts) {
  try {
    if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') < 2 ||
        Buffer.byteLength(text, 'utf8') > MAXIMUM_ENVELOPE_BYTES) fail(CORRUPT);
    const parsed = JSON.parse(text);
    exactPlainObject(parsed, ENVELOPE_FIELDS, CORRUPT);
    if (canonicalJson(parsed) !== text ||
        parsed.artifactFamily !== GATE_B_RESET_EPOCH_WSS_ONCE_ARTIFACT_FAMILY_V4 ||
        parsed.journalVersion !== ENVELOPE_VERSION ||
        parsed.liveRunAuthorized !== false ||
        parsed.publicationAuthorized !== false ||
        typeof parsed.configurationDigest !== 'string' ||
        !CONFIGURATION_DIGEST.test(parsed.configurationDigest) ||
        parsed.configurationDigest !== artifacts.configurationDigest ||
        !same(parsed.paymentRequest, artifacts.paymentRequest) ||
        !same(parsed.workspace, artifacts.workspace) ||
        typeof parsed.checksum !== 'string' || !CHECKSUM.test(parsed.checksum)) {
      fail(CORRUPT);
    }
    exactExecutionBinding(parsed.executionBinding, artifacts, CORRUPT);
    const state = stateInvariant(parsed, artifacts, CORRUPT);
    const core = envelopeCore(artifacts, state);
    if (parsed.checksum !== digest(
      'zenon-x402:gate-b-reset-epoch-wss-once-journal-envelope-v4',
      core,
    )) fail(CORRUPT);
    return Object.freeze({ ...state, checksum: parsed.checksum });
  } catch (error) {
    throw failure(knownCode(error) ?? CORRUPT);
  }
}

function snapshotState(artifacts, state) {
  return Object.freeze({
    artifactFamily: GATE_B_RESET_EPOCH_WSS_ONCE_ARTIFACT_FAMILY_V4,
    configurationDigest: artifacts.configurationDigest,
    executionBinding: artifacts.executionBinding,
    journalVersion: 4,
    liveRunAuthorized: false,
    paymentRequest: artifacts.paymentRequest,
    phase: state.phase,
    preparedPayment: state.preparedPayment,
    publicationAuthorized: false,
    reconciliation: state.reconciliation,
    revision: state.revision,
    validation: state.validation,
    workspace: artifacts.workspace,
  });
}

function safeFile(stat) {
  return stat.isFile() && !stat.isSymbolicLink() &&
    stat.uid === BigInt(process.getuid()) && stat.nlink === 1n &&
    (stat.mode & 0o777n) === 0o600n && (stat.mode & 0o7000n) === 0n;
}

function sameFile(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function privateWorkspace(path, expected) {
  try {
    if (typeof process.getuid !== 'function' || typeof path !== 'string' ||
        !isAbsolute(path) || resolve(path) !== path) fail(UNSAFE_WORKSPACE);
    const stat = lstatSync(path, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink() ||
        stat.uid !== BigInt(process.getuid()) ||
        (stat.mode & 0o777n) !== 0o700n ||
        (stat.mode & 0o7000n) !== 0n || realpathSync(path) !== path ||
        (expected && !sameFile(stat, expected))) fail(UNSAFE_WORKSPACE);
    return stat;
  } catch (error) {
    throw failure(knownCode(error) ?? UNSAFE_WORKSPACE);
  }
}

function assertEmptyWorkspace(configuration) {
  try {
    privateWorkspace(configuration.workspaceRoot, configuration.workspaceIdentity);
    if (readdirSync(configuration.workspaceRoot).length !== 0) {
      fail(WORKSPACE_NOT_EMPTY);
    }
  } catch (error) {
    throw failure(knownCode(error) ?? UNSAFE_WORKSPACE);
  }
}

function inspectDatabaseFile(configuration, expected) {
  try {
    privateWorkspace(configuration.workspaceRoot, configuration.workspaceIdentity);
    const databaseName = basename(configuration.databasePath);
    const journalName = `${databaseName}-journal`;
    const entries = readdirSync(configuration.workspaceRoot).sort();
    if (!entries.includes(databaseName) ||
        entries.some(entry => entry !== databaseName && entry !== journalName)) {
      fail(UNSAFE_FILE);
    }
    const current = lstatSync(configuration.databasePath, { bigint: true });
    if (!safeFile(current) ||
        realpathSync(configuration.databasePath) !== configuration.databasePath ||
        (expected && !sameFile(current, expected))) fail(UNSAFE_FILE);
    if (entries.includes(journalName)) {
      const journalPath = join(configuration.workspaceRoot, journalName);
      const journal = lstatSync(journalPath, { bigint: true });
      if (!safeFile(journal) || realpathSync(journalPath) !== journalPath) {
        fail(UNSAFE_FILE);
      }
    }
    return current;
  } catch (error) {
    throw failure(knownCode(error) ?? UNSAFE_FILE);
  }
}

function createDatabaseFile(configuration) {
  let descriptor;
  try {
    assertEmptyWorkspace(configuration);
    const {
      O_CLOEXEC = 0,
      O_CREAT,
      O_EXCL,
      O_NOFOLLOW = 0,
      O_RDWR,
    } = fsConstants;
    if (O_NOFOLLOW === 0) fail(UNSAFE_FILE);
    descriptor = openSync(
      configuration.databasePath,
      O_RDWR | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC,
      0o600,
    );
    fchmodSync(descriptor, 0o600);
    const opened = fstatSync(descriptor, { bigint: true });
    if (!safeFile(opened)) fail(UNSAFE_FILE);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    return inspectDatabaseFile(configuration, opened);
  } catch (error) {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch {}
    }
    throw failure(knownCode(error) ?? CREATE_FAILED);
  }
}

function syncWorkspaceDirectory(configuration) {
  let descriptor;
  try {
    privateWorkspace(configuration.workspaceRoot, configuration.workspaceIdentity);
    const {
      O_CLOEXEC = 0,
      O_DIRECTORY = 0,
      O_NOFOLLOW = 0,
      O_RDONLY,
    } = fsConstants;
    if (O_DIRECTORY === 0 || O_NOFOLLOW === 0) fail(DIRECTORY_SYNC_FAILED);
    descriptor = openSync(
      configuration.workspaceRoot,
      O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC,
    );
    const opened = fstatSync(descriptor, { bigint: true });
    if (!opened.isDirectory() ||
        !sameFile(opened, configuration.workspaceIdentity)) {
      fail(DIRECTORY_SYNC_FAILED);
    }
    fsyncSync(descriptor);
    closeSync(descriptor);
  } catch (error) {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch {}
    }
    throw failure(knownCode(error) ?? DIRECTORY_SYNC_FAILED);
  }
}

function captureHooks(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object' || IS_PROXY(value) ||
      ARRAY_IS_ARRAY(value) || GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) {
    fail(INVALID_CONFIGURATION);
  }
  const keys = REFLECT_OWN_KEYS(value);
  if (keys.some(key => key !== 'beforeCommit' && key !== 'afterCommit')) {
    fail(INVALID_CONFIGURATION);
  }
  const hooks = Object.create(null);
  for (const key of keys) {
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
    if (!descriptor || !HAS_OWN(descriptor, 'value') ||
        descriptor.enumerable !== true || typeof descriptor.value !== 'function' ||
        IS_PROXY(descriptor.value)) fail(INVALID_CONFIGURATION);
    hooks[key] = descriptor.value;
  }
  return Object.freeze(hooks);
}

function captureConfiguration(options) {
  try {
    if (options === null || typeof options !== 'object' || IS_PROXY(options) ||
        ARRAY_IS_ARRAY(options) || GET_PROTOTYPE_OF(options) !== OBJECT_PROTOTYPE) {
      fail(INVALID_CONFIGURATION);
    }
    const keys = REFLECT_OWN_KEYS(options);
    if (keys.length < OPTION_FIELDS.length || keys.length > OPTION_FIELDS.length + 1 ||
        keys.some(key => !OPTION_FIELDS.includes(key) && key !== 'testHooks')) {
      fail(INVALID_CONFIGURATION);
    }
    const input = Object.create(null);
    for (const field of OPTION_FIELDS) {
      const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(options, field);
      if (!descriptor || !HAS_OWN(descriptor, 'value') ||
          descriptor.enumerable !== true) fail(INVALID_CONFIGURATION);
      input[field] = descriptor.value;
    }
    const hookDescriptor = GET_OWN_PROPERTY_DESCRIPTOR(options, 'testHooks');
    if (hookDescriptor && (!HAS_OWN(hookDescriptor, 'value') ||
        hookDescriptor.enumerable !== true)) fail(INVALID_CONFIGURATION);
    const artifacts = bindGateBResetEpochWssOnceArtifactsV4(
      input.configurationBytes,
      input.review,
      input.authorization,
    );
    const workspaceIdentity = privateWorkspace(input.workspaceRoot);
    return Object.freeze({
      artifacts,
      databasePath: join(
        input.workspaceRoot,
        GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_FILE_V4,
      ),
      hooks: captureHooks(hookDescriptor?.value),
      workspaceIdentity,
      workspaceRoot: input.workspaceRoot,
    });
  } catch (error) {
    throw failure(knownCode(error) ?? INVALID_CONFIGURATION);
  }
}

function pragmaValue(database, sql, field) {
  return database.prepare(sql).get()?.[field];
}

function validateConnection(database, creating = false) {
  if (pragmaValue(database, 'PRAGMA busy_timeout', 'timeout') !== 0 ||
      pragmaValue(database, 'PRAGMA synchronous', 'synchronous') !== 2 ||
      pragmaValue(database, 'PRAGMA foreign_keys', 'foreign_keys') !== 1 ||
      pragmaValue(database, 'PRAGMA trusted_schema', 'trusted_schema') !== 0 ||
      pragmaValue(database, 'PRAGMA recursive_triggers', 'recursive_triggers') !== 0 ||
      pragmaValue(database, 'PRAGMA locking_mode', 'locking_mode') !== 'exclusive' ||
      (process.platform === 'darwin' &&
        pragmaValue(database, 'PRAGMA fullfsync', 'fullfsync') !== 1) ||
      (creating &&
        pragmaValue(database, 'PRAGMA journal_mode', 'journal_mode') !== 'delete')) {
    fail(SCHEMA_UNSUPPORTED);
  }
}

function configureConnection(database, creating) {
  database.exec('PRAGMA busy_timeout = 0');
  if (creating) {
    const journalMode = database.prepare('PRAGMA journal_mode = DELETE')
      .get()?.journal_mode;
    if (journalMode !== 'delete') fail(SCHEMA_UNSUPPORTED);
  }
  database.exec('PRAGMA synchronous = FULL');
  database.exec('PRAGMA foreign_keys = ON');
  database.exec('PRAGMA trusted_schema = OFF');
  database.exec('PRAGMA recursive_triggers = OFF');
  database.exec('PRAGMA locking_mode = EXCLUSIVE');
  if (process.platform === 'darwin') database.exec('PRAGMA fullfsync = ON');
  validateConnection(database, creating);
}

function readStateRow(database, artifacts) {
  const row = database.prepare(`SELECT * FROM ${STATE_TABLE}`).get();
  if (!row || typeof row !== 'object' || row.singleton !== 1 ||
      !Number.isSafeInteger(row.revision) || typeof row.phase !== 'string' ||
      typeof row.envelope_checksum !== 'string' ||
      typeof row.envelope !== 'string') fail(CORRUPT);
  const state = parseEnvelope(row.envelope, artifacts);
  if (row.revision !== state.revision || row.phase !== state.phase ||
      row.envelope_checksum !== state.checksum) fail(CORRUPT);
  return state;
}

function validateDefinitions(database) {
  const definitions = database.prepare(
    "SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
  ).all();
  if (definitions.length !== 2 ||
      definitions[0].type !== 'table' || definitions[0].name !== META_TABLE ||
      definitions[0].sql !== META_TABLE_SQL ||
      definitions[1].type !== 'table' || definitions[1].name !== STATE_TABLE ||
      definitions[1].sql !== STATE_TABLE_SQL) fail(SCHEMA_UNSUPPORTED);
}

function validateDatabase(database, configuration) {
  const { artifacts } = configuration;
  if (pragmaValue(database, 'PRAGMA journal_mode', 'journal_mode') !== 'delete' ||
      pragmaValue(database, 'PRAGMA application_id', 'application_id') !==
        APPLICATION_ID ||
      pragmaValue(database, 'PRAGMA user_version', 'user_version') !==
        DATABASE_USER_VERSION ||
      pragmaValue(database, 'PRAGMA integrity_check', 'integrity_check') !== 'ok') {
    fail(SCHEMA_UNSUPPORTED);
  }
  validateDefinitions(database);
  const meta = database.prepare(`SELECT * FROM ${META_TABLE}`).all();
  if (meta.length !== 1 || meta[0].singleton !== 1 ||
      meta[0].artifact_family !== GATE_B_RESET_EPOCH_WSS_ONCE_ARTIFACT_FAMILY_V4 ||
      meta[0].journal_version !== 4 ||
      meta[0].configuration_digest !== artifacts.configurationDigest ||
      meta[0].execution_binding_digest !== digest(
        'zenon-x402:gate-b-reset-epoch-wss-once-execution-binding-v4',
        artifacts.executionBinding,
      ) || meta[0].payment_request_digest !== digest(
        'zenon-x402:gate-b-reset-epoch-wss-once-payment-request-v4',
        artifacts.paymentRequest,
      ) || meta[0].workspace_family !==
        GATE_B_RESET_EPOCH_WSS_ONCE_WORKSPACE_FAMILY_V4 ||
      meta[0].workspace_generation !== artifacts.workspace.generation ||
      !Number.isSafeInteger(meta[0].owner_epoch) || meta[0].owner_epoch < 1) {
    fail(SCHEMA_UNSUPPORTED);
  }
  const rows = database.prepare(`SELECT * FROM ${STATE_TABLE}`).all();
  if (rows.length !== 1) fail(CORRUPT);
  readStateRow(database, artifacts);
}

function initializeDatabase(database, configuration) {
  const { artifacts } = configuration;
  database.exec(`PRAGMA application_id = ${APPLICATION_ID}`);
  database.exec(`PRAGMA user_version = ${DATABASE_USER_VERSION}`);
  database.exec(META_TABLE_SQL);
  database.exec(STATE_TABLE_SQL);
  database.prepare(
    `INSERT INTO ${META_TABLE}(singleton,artifact_family,journal_version,configuration_digest,execution_binding_digest,payment_request_digest,workspace_family,workspace_generation,owner_epoch) VALUES(1,?,?,?,?,?,?,?,0)`,
  ).run(
    GATE_B_RESET_EPOCH_WSS_ONCE_ARTIFACT_FAMILY_V4,
    4,
    artifacts.configurationDigest,
    digest(
      'zenon-x402:gate-b-reset-epoch-wss-once-execution-binding-v4',
      artifacts.executionBinding,
    ),
    digest(
      'zenon-x402:gate-b-reset-epoch-wss-once-payment-request-v4',
      artifacts.paymentRequest,
    ),
    GATE_B_RESET_EPOCH_WSS_ONCE_WORKSPACE_FAMILY_V4,
    artifacts.workspace.generation,
  );
  const initial = createEnvelope(artifacts, {
    phase: GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.EMPTY,
    preparedPayment: null,
    reconciliation: null,
    revision: 0,
    validation: null,
  });
  database.prepare(
    `INSERT INTO ${STATE_TABLE}(singleton,revision,phase,envelope_checksum,envelope) VALUES(1,?,?,?,?)`,
  ).run(0, initial.phase, initial.checksum, canonicalJson(initial));
}

function openDatabase(configuration, identity, creating) {
  let database;
  let transaction = false;
  let lockAttempted = false;
  try {
    database = new DatabaseSync(configuration.databasePath, {
      allowExtension: false,
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true,
      readOnly: false,
      timeout: 0,
    });
    inspectDatabaseFile(configuration, identity);
    if (!creating) lockAttempted = true;
    configureConnection(database, creating);
    database.exec('BEGIN IMMEDIATE');
    transaction = true;
    validateConnection(database, creating);
    if (creating) initializeDatabase(database, configuration);
    else validateDatabase(database, configuration);
    const advanced = database.prepare(
      `UPDATE ${META_TABLE} SET owner_epoch=owner_epoch+1 WHERE singleton=1 AND owner_epoch<9007199254740991`,
    ).run();
    if (advanced.changes !== 1) fail(SCHEMA_UNSUPPORTED);
    database.exec('COMMIT');
    transaction = false;
    validateConnection(database);
    validateDatabase(database, configuration);
    inspectDatabaseFile(configuration, identity);
    return database;
  } catch (error) {
    if (transaction) {
      try { database?.exec('ROLLBACK'); } catch {}
    }
    let closeFailed = false;
    try { database?.close(); } catch { closeFailed = true; }
    if (closeFailed) throw failure(CLOSE_FAILED);
    if (!creating && lockAttempted && knownCode(error) === null) {
      throw failure(OWNER_BUSY);
    }
    throw failure(knownCode(error) ?? (creating ? CREATE_FAILED : OPEN_FAILED));
  }
}

class DurableJournalV4 {
  #configuration;
  #database;
  #identity;
  #closed = false;
  #quarantined = false;
  #active = false;

  constructor(configuration, database, identity) {
    this.#configuration = configuration;
    this.#database = database;
    this.#identity = identity;
  }

  get artifacts() {
    return this.#configuration.artifacts;
  }

  #quarantine() {
    this.#quarantined = true;
  }

  #assertUsable() {
    if (this.#closed) fail(CLOSED);
    if (this.#quarantined) fail(QUARANTINED);
    try {
      this.#identity = inspectDatabaseFile(this.#configuration, this.#identity);
      if (this.#database.isOpen !== true) fail(QUARANTINED);
    } catch {
      this.#quarantine();
      fail(QUARANTINED);
    }
  }

  #run(operation) {
    this.#assertUsable();
    if (this.#active) fail(REENTRANT_OPERATION);
    this.#active = true;
    try {
      return operation();
    } finally {
      this.#active = false;
    }
  }

  #read() {
    return readStateRow(this.#database, this.artifacts);
  }

  #invokeHook(name, operation) {
    const hook = this.#configuration.hooks?.[name];
    if (hook) hook(operation);
  }

  #write(operation, body) {
    return this.#run(() => {
      let begun = false;
      let commitAttempted = false;
      let committed = false;
      try {
        this.#database.exec('BEGIN IMMEDIATE');
        begun = true;
        const result = body();
        this.#invokeHook('beforeCommit', operation);
        commitAttempted = true;
        this.#database.exec('COMMIT');
        begun = false;
        committed = true;
        this.#identity = inspectDatabaseFile(
          this.#configuration,
          this.#identity,
        );
        this.#invokeHook('afterCommit', operation);
        return result;
      } catch (error) {
        if (begun && !commitAttempted) {
          try {
            this.#database.exec('ROLLBACK');
            begun = false;
          } catch {
            this.#quarantine();
            fail(ROLLBACK_FAILED);
          }
        }
        if (committed || commitAttempted) {
          this.#quarantine();
          fail(COMMIT_OUTCOME_UNKNOWN);
        }
        const code = knownCode(error);
        if (code === CORRUPT || code === SCHEMA_UNSUPPORTED) this.#quarantine();
        throw failure(code ?? TRANSACTION_FAILED);
      } finally {
        let active = begun;
        if (!active) {
          try { active = this.#database.isTransaction === true; }
          catch { active = false; }
        }
        if (active) {
          try { this.#database.exec('ROLLBACK'); }
          catch { this.#quarantine(); }
        }
      }
    });
  }

  snapshot() {
    return this.#run(() => {
      try {
        return snapshotState(this.artifacts, this.#read());
      } catch {
        this.#quarantine();
        fail(CORRUPT);
      }
    });
  }

  assertBinding(artifacts) {
    try {
      if (!artifacts || typeof artifacts !== 'object' || IS_PROXY(artifacts) ||
          artifacts.configurationDigest !== this.artifacts.configurationDigest ||
          !same(artifacts.executionBinding, this.artifacts.executionBinding) ||
          !same(artifacts.paymentRequest, this.artifacts.paymentRequest) ||
          !same(artifacts.workspace, this.artifacts.workspace)) fail(INVALID);
      return this.snapshot();
    } catch (error) {
      throw failure(knownCode(error) ?? INVALID);
    }
  }

  #transition(operation, expectedRevision, expectedPhase, nextPhase, patch = {}) {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 ||
        Object.is(expectedRevision, -0)) fail(INVALID_TRANSITION);
    return this.#write(operation, () => {
      const current = this.#read();
      if (current.revision !== expectedRevision ||
          current.phase !== expectedPhase ||
          current.revision >= MAXIMUM_SAFE_REVISION) fail(INVALID_TRANSITION);
      const candidate = {
        phase: nextPhase,
        preparedPayment: HAS_OWN(patch, 'preparedPayment')
          ? patch.preparedPayment
          : current.preparedPayment,
        reconciliation: HAS_OWN(patch, 'reconciliation')
          ? patch.reconciliation
          : current.reconciliation,
        revision: current.revision + 1,
        validation: HAS_OWN(patch, 'validation')
          ? patch.validation
          : current.validation,
      };
      const next = createEnvelope(this.artifacts, candidate);
      const updated = this.#database.prepare(
        `UPDATE ${STATE_TABLE} SET revision=?,phase=?,envelope_checksum=?,envelope=? WHERE singleton=1 AND revision=? AND phase=?`,
      ).run(
        next.revision,
        next.phase,
        next.checksum,
        canonicalJson(next),
        current.revision,
        current.phase,
      );
      if (updated.changes !== 1) fail(INVALID_TRANSITION);
      const persisted = this.#read();
      if (persisted.revision !== next.revision || persisted.phase !== next.phase ||
          persisted.checksum !== next.checksum) fail(CORRUPT);
      return snapshotState(this.artifacts, persisted);
    });
  }

  armPreparation(expectedRevision) {
    return this.#transition(
      'armPreparation',
      expectedRevision,
      GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.EMPTY,
      GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.PREPARATION_ARMED,
    );
  }

  recordPreparedPayment(expectedRevision, value) {
    let preparedPayment;
    try {
      preparedPayment = freezePreparedPayment(value, this.artifacts);
    } catch {
      fail(INVALID);
    }
    return this.#transition(
      'recordPreparedPayment',
      expectedRevision,
      GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.PREPARATION_ARMED,
      GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.PAYMENT_PREPARED,
      { preparedPayment },
    );
  }

  armFacilitatorValidation(expectedRevision) {
    return this.#transition(
      'armFacilitatorValidation',
      expectedRevision,
      GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.PAYMENT_PREPARED,
      GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4
        .FACILITATOR_VALIDATION_ARMED,
    );
  }

  recordFacilitatorValidation(expectedRevision, value) {
    return this.#write('recordFacilitatorValidation', () => {
      const current = this.#read();
      if (current.revision !== expectedRevision || current.phase !==
          GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4
            .FACILITATOR_VALIDATION_ARMED || current.preparedPayment === null ||
          current.revision >= MAXIMUM_SAFE_REVISION) fail(INVALID_TRANSITION);
      let validation;
      try {
        validation = freezeValidation(
          value,
          this.artifacts,
          current.preparedPayment,
        );
      } catch {
        fail(INVALID);
      }
      const phase = validation.state === 'SUBMISSION_OUTCOME_UNKNOWN'
        ? GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4
          .SUBMISSION_OUTCOME_UNKNOWN
        : GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.FACILITATOR_VALIDATED;
      const next = createEnvelope(this.artifacts, {
        phase,
        preparedPayment: current.preparedPayment,
        reconciliation: null,
        revision: current.revision + 1,
        validation,
      });
      const updated = this.#database.prepare(
        `UPDATE ${STATE_TABLE} SET revision=?,phase=?,envelope_checksum=?,envelope=? WHERE singleton=1 AND revision=? AND phase=?`,
      ).run(
        next.revision,
        next.phase,
        next.checksum,
        canonicalJson(next),
        current.revision,
        current.phase,
      );
      if (updated.changes !== 1) fail(INVALID_TRANSITION);
      const persisted = this.#read();
      if (persisted.checksum !== next.checksum) fail(CORRUPT);
      return snapshotState(this.artifacts, persisted);
    });
  }

  blockPublication(expectedRevision) {
    return this.#transition(
      'blockPublication',
      expectedRevision,
      GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.FACILITATOR_VALIDATED,
      GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.PUBLICATION_BLOCKED,
    );
  }

  reconcileUnknown(expectedRevision, value) {
    return this.#write('reconcileUnknown', () => {
      const current = this.#read();
      if (current.revision !== expectedRevision || current.phase !==
          GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4
            .SUBMISSION_OUTCOME_UNKNOWN || current.preparedPayment === null ||
          current.revision >= MAXIMUM_SAFE_REVISION) fail(INVALID_TRANSITION);
      let reconciliation;
      try {
        reconciliation = freezeReconciliation(
          value,
          this.artifacts,
          current.preparedPayment,
        );
      } catch {
        fail(INVALID);
      }
      const next = createEnvelope(this.artifacts, {
        phase: GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.PUBLICATION_BLOCKED,
        preparedPayment: current.preparedPayment,
        reconciliation,
        revision: current.revision + 1,
        validation: current.validation,
      });
      const updated = this.#database.prepare(
        `UPDATE ${STATE_TABLE} SET revision=?,phase=?,envelope_checksum=?,envelope=? WHERE singleton=1 AND revision=? AND phase=?`,
      ).run(
        next.revision,
        next.phase,
        next.checksum,
        canonicalJson(next),
        current.revision,
        current.phase,
      );
      if (updated.changes !== 1) fail(INVALID_TRANSITION);
      const persisted = this.#read();
      if (persisted.checksum !== next.checksum) fail(CORRUPT);
      return snapshotState(this.artifacts, persisted);
    });
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    try {
      this.#database.close();
      OPEN_DATABASE_PATHS.delete(this.#configuration.databasePath);
    } catch {
      this.#quarantine();
      fail(CLOSE_FAILED);
    }
  }
}

function attachStore(store) {
  const journal = Object.freeze(Object.create(null));
  JOURNALS.add(journal);
  JOURNAL_STORES.set(journal, store);
  return journal;
}

function storeFor(journal) {
  if (journal === null || typeof journal !== 'object' || IS_PROXY(journal) ||
      !JOURNALS.has(journal)) fail(INVALID);
  const store = JOURNAL_STORES.get(journal);
  if (!store) fail(INVALID);
  return store;
}

function openJournal(options, creating) {
  const configuration = captureConfiguration(options);
  if (OPEN_DATABASE_PATHS.has(configuration.databasePath)) fail(OWNER_BUSY);
  OPEN_DATABASE_PATHS.add(configuration.databasePath);
  let database;
  try {
    const identity = creating
      ? createDatabaseFile(configuration)
      : inspectDatabaseFile(configuration);
    database = openDatabase(configuration, identity, creating);
    if (creating) syncWorkspaceDirectory(configuration);
    const verifiedIdentity = inspectDatabaseFile(configuration, identity);
    return attachStore(new DurableJournalV4(
      configuration,
      database,
      verifiedIdentity,
    ));
  } catch (error) {
    let closed = knownCode(error) !== CLOSE_FAILED;
    if (database?.isOpen === true) {
      try { database.close(); }
      catch { closed = false; }
    }
    if (closed) OPEN_DATABASE_PATHS.delete(configuration.databasePath);
    else fail(CLOSE_FAILED);
    throw failure(knownCode(error) ?? (creating ? CREATE_FAILED : OPEN_FAILED));
  }
}

/**
 * Creates one durable, fake-only operation journal in an otherwise empty,
 * current-user 0700 directory. The fixed SQLite file is current-user 0600,
 * single-link, and opened with an exclusive owner. Reliable local filesystems
 * are required; network and cloud-synchronized filesystems are unsupported.
 * Ordinary open never migrates, repairs, replaces, or deletes another format.
 */
export function createGateBResetEpochWssOnceJournalV4(options) {
  return openJournal(options, true);
}

export function openGateBResetEpochWssOnceJournalV4(options) {
  return openJournal(options, false);
}

export function closeGateBResetEpochWssOnceJournalV4(journal) {
  storeFor(journal).close();
}

export function snapshotGateBResetEpochWssOnceJournalV4(journal) {
  return storeFor(journal).snapshot();
}

export function assertGateBResetEpochWssOnceJournalBindingV4(journal, artifacts) {
  return storeFor(journal).assertBinding(artifacts);
}

export function armGateBResetEpochWssOncePreparationV4(journal, expectedRevision) {
  return storeFor(journal).armPreparation(expectedRevision);
}

export function recordGateBResetEpochWssOncePreparedPaymentV4(
  journal,
  expectedRevision,
  preparedPayment,
) {
  return storeFor(journal).recordPreparedPayment(
    expectedRevision,
    preparedPayment,
  );
}

export function armGateBResetEpochWssOnceFacilitatorValidationV4(
  journal,
  expectedRevision,
) {
  return storeFor(journal).armFacilitatorValidation(expectedRevision);
}

export function recordGateBResetEpochWssOnceFacilitatorValidationV4(
  journal,
  expectedRevision,
  validation,
) {
  return storeFor(journal).recordFacilitatorValidation(
    expectedRevision,
    validation,
  );
}

export function blockGateBResetEpochWssOncePublicationV4(
  journal,
  expectedRevision,
) {
  return storeFor(journal).blockPublication(expectedRevision);
}

export function reconcileGateBResetEpochWssOnceUnknownV4(
  journal,
  expectedRevision,
  reconciliation,
) {
  return storeFor(journal).reconcileUnknown(
    expectedRevision,
    reconciliation,
  );
}
