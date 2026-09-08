import crypto from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  realpathSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { types as utilTypes } from 'node:util';
import {
  InMemoryServiceCreditModel,
  REQUEST_STATE,
  SERVICE_CREDIT_MODEL_VERSION,
  SERVICE_CREDIT_STATE_SCHEMA_VERSION,
  ServiceCreditModelError,
} from './service-credit-model.js';
import {
  completeServiceCreditExecution,
  createServiceCreditExecutionContract,
  fenceServiceCreditExecution,
  hydrateServiceCreditExecutionContract,
  markServiceCreditExecutionUnknown,
  prepareServiceCreditExecution,
  recoverServiceCreditExecutions,
} from './service-credit-execution-contract.js';

export const SERVICE_CREDIT_SQLITE_SCHEMA_VERSION = 2;

const APPLICATION_ID = 0x53435244;
const TABLE_NAME = 'service_credit_ledger';
const TABLE_SQL = 'CREATE TABLE service_credit_ledger(singleton INTEGER PRIMARY KEY CHECK(singleton = 1), envelope TEXT NOT NULL) STRICT';
const LEGACY_SQLITE_SCHEMA_VERSION = 1;
const PUBLIC_LEDGER_ENVELOPE_SCHEMA_VERSION = 1;
const PHYSICAL_V2_CHECKSUM_DOMAIN = 'zenon-x402:service-credit-sqlite-physical-v2';
const DURABLE_RESULT_COMMITMENT_DOMAIN = 'zenon-x402:service-credit-sqlite-result-v1';
const MAX_PHYSICAL_ENVELOPE_OVERHEAD_BYTES = 4_096;
const DEFAULT_BUSY_TIMEOUT_MS = 5_000;
const MAX_BUSY_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_STATE_BYTES = 4 * 1024 * 1024;
const HARD_MAX_STATE_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_OFFERS = 256;
const DEFAULT_MAX_GRANTS = 1_024;
const DEFAULT_MAX_REQUESTS = 4_096;
const HARD_MAX_RECORDS = 10_000;
const CHECKSUM = /^sha256:[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const METHOD = /^[A-Z][A-Z0-9_-]{0,15}$/;
const CONTENT_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}$/;
const CONSTRUCTOR_TOKEN = Symbol('ServiceCreditSqliteStore');
const OBJECT_PROTOTYPE = Object.prototype;
const ARRAY_IS_ARRAY = Array.isArray;
const NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;
const OBJECT_HAS_OWN = Object.hasOwn;
const OBJECT_FREEZE = Object.freeze;
const OBJECT_DEFINE_PROPERTY = Object.defineProperty;
const OBJECT_CREATE = Object.create;
const OBJECT_KEYS = Object.keys;
const REFLECT_GET_PROTOTYPE_OF = Reflect.getPrototypeOf;
const REFLECT_GET_OWN_PROPERTY_DESCRIPTOR = Reflect.getOwnPropertyDescriptor;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const REFLECT_APPLY = Reflect.apply;
const REGEXP_TEST = RegExp.prototype.test;
const STRING_INCLUDES = String.prototype.includes;
const ARRAY_INCLUDES = Array.prototype.includes;
const ARRAY_SORT = Array.prototype.sort;
const STRING_FROM = String;
const SET_CONSTRUCTOR = Set;
const SET_HAS = Set.prototype.has;
const SET_ADD = Set.prototype.add;
const JSON_STRINGIFY = JSON.stringify;
const IS_PROXY = utilTypes.isProxy;

export class ServiceCreditSqliteStoreError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ServiceCreditSqliteStoreError';
    this.code = code;
    this.stack = `ServiceCreditSqliteStoreError: ${code}`;
  }
}

function storeFailure(code) {
  return new ServiceCreditSqliteStoreError(code);
}

function failStore(code) {
  throw storeFailure(code);
}

function regexpMatches(pattern, value) {
  return REFLECT_APPLY(REGEXP_TEST, pattern, [value]);
}

function validIdentifier(value) {
  return typeof value === 'string'
    && regexpMatches(IDENTIFIER, value)
    && !REFLECT_APPLY(STRING_INCLUDES, value, ['://']);
}

function captureDurableObject(value, requiredKeys) {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || IS_PROXY(value)
      || ARRAY_IS_ARRAY(value)
      || REFLECT_GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE
    ) {
      failStore('SERVICE_CREDIT_STORE_INVALID_EXECUTION_INPUT');
    }
    const keys = REFLECT_OWN_KEYS(value);
    if (keys.length !== requiredKeys.length) {
      failStore('SERVICE_CREDIT_STORE_INVALID_EXECUTION_INPUT');
    }
    const captured = OBJECT_CREATE(null);
    for (let index = 0; index < requiredKeys.length; index += 1) {
      const key = requiredKeys[index];
      if (!REFLECT_APPLY(ARRAY_INCLUDES, keys, [key])) {
        failStore('SERVICE_CREDIT_STORE_INVALID_EXECUTION_INPUT');
      }
      const descriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(value, key);
      if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) {
        failStore('SERVICE_CREDIT_STORE_INVALID_EXECUTION_INPUT');
      }
      OBJECT_DEFINE_PROPERTY(captured, key, {
        value: descriptor.value,
        enumerable: true,
        writable: false,
        configurable: false,
      });
    }
    for (let index = 0; index < keys.length; index += 1) {
      if (typeof keys[index] !== 'string') {
        failStore('SERVICE_CREDIT_STORE_INVALID_EXECUTION_INPUT');
      }
    }
    return captured;
  } catch (error) {
    const code = storeErrorCode(error);
    throw storeFailure(code ?? 'SERVICE_CREDIT_STORE_INVALID_EXECUTION_INPUT');
  }
}

function captureExpectedRevision(value) {
  if (!NUMBER_IS_SAFE_INTEGER(value) || value < 0) {
    failStore('SERVICE_CREDIT_STORE_INVALID_EXECUTION_INPUT');
  }
  return value;
}

function captureReservationInput(value) {
  const input = captureDurableObject(value, [
    'modelVersion',
    'grantId',
    'requestId',
    'method',
    'routeId',
    'canonicalBodyDigest',
    'selectedContentType',
    'maxCostUnits',
  ]);
  if (
    input.modelVersion !== SERVICE_CREDIT_MODEL_VERSION
    || !validIdentifier(input.grantId)
    || !validIdentifier(input.requestId)
    || typeof input.method !== 'string'
    || !regexpMatches(METHOD, input.method)
    || !validIdentifier(input.routeId)
    || typeof input.canonicalBodyDigest !== 'string'
    || !regexpMatches(CHECKSUM, input.canonicalBodyDigest)
    || typeof input.selectedContentType !== 'string'
    || !regexpMatches(CONTENT_TYPE, input.selectedContentType)
    || !NUMBER_IS_SAFE_INTEGER(input.maxCostUnits)
    || input.maxCostUnits < 1
  ) {
    failStore('SERVICE_CREDIT_STORE_INVALID_EXECUTION_INPUT');
  }
  return OBJECT_FREEZE({ ...input });
}

function captureCachedResult(value) {
  const input = captureDurableObject(value, ['statusCode', 'contentType', 'resultCode']);
  if (
    !NUMBER_IS_SAFE_INTEGER(input.statusCode)
    || input.statusCode < 100
    || input.statusCode > 599
    || typeof input.contentType !== 'string'
    || !regexpMatches(CONTENT_TYPE, input.contentType)
    || !validIdentifier(input.resultCode)
  ) {
    failStore('SERVICE_CREDIT_STORE_INVALID_EXECUTION_INPUT');
  }
  return OBJECT_FREEZE({
    statusCode: input.statusCode,
    contentType: input.contentType,
    resultCode: input.resultCode,
  });
}

function executionContractErrorCode(error) {
  try {
    const descriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(error, 'code');
    return descriptor && OBJECT_HAS_OWN(descriptor, 'value')
      && typeof descriptor.value === 'string'
      && (
        descriptor.value === 'SERVICE_CREDIT_EXECUTION_CONTRACT_INVALID_INPUT'
        || descriptor.value === 'SERVICE_CREDIT_EXECUTION_CONTRACT_INVALID_STATE'
        || descriptor.value === 'SERVICE_CREDIT_EXECUTION_CONTRACT_CONFLICT'
        || descriptor.value === 'SERVICE_CREDIT_EXECUTION_CONTRACT_GENERATION_SEALED'
        || descriptor.value === 'SERVICE_CREDIT_EXECUTION_CONTRACT_CAPACITY_EXCEEDED'
        || descriptor.value === 'SERVICE_CREDIT_EXECUTION_CONTRACT_INVALID_TRANSITION'
      )
      ? descriptor.value
      : null;
  } catch {
    return null;
  }
}

function mappedExecutionFailure(error, persistedState = false) {
  const code = executionContractErrorCode(error);
  if (persistedState || code === 'SERVICE_CREDIT_EXECUTION_CONTRACT_INVALID_STATE') {
    return storeFailure('SERVICE_CREDIT_STORE_CORRUPT');
  }
  const mapped = {
    SERVICE_CREDIT_EXECUTION_CONTRACT_INVALID_INPUT:
      'SERVICE_CREDIT_STORE_INVALID_EXECUTION_INPUT',
    SERVICE_CREDIT_EXECUTION_CONTRACT_CONFLICT:
      'SERVICE_CREDIT_STORE_EXECUTION_CONFLICT',
    SERVICE_CREDIT_EXECUTION_CONTRACT_GENERATION_SEALED:
      'SERVICE_CREDIT_STORE_EXECUTION_GENERATION_SEALED',
    SERVICE_CREDIT_EXECUTION_CONTRACT_CAPACITY_EXCEEDED:
      'SERVICE_CREDIT_STORE_CAPACITY_EXCEEDED',
    SERVICE_CREDIT_EXECUTION_CONTRACT_INVALID_TRANSITION:
      'SERVICE_CREDIT_STORE_EXECUTION_INVALID_TRANSITION',
  }[code];
  return storeFailure(mapped ?? 'SERVICE_CREDIT_STORE_EXECUTION_FAILED');
}

function invokeExecutionContract(operation, persistedState = false) {
  try {
    return operation();
  } catch (error) {
    throw mappedExecutionFailure(error, persistedState);
  }
}

function fixedModelFailure(code) {
  const error = new ServiceCreditModelError(code);
  error.stack = `ServiceCreditModelError: ${code}`;
  return error;
}

function modelErrorCode(error) {
  try {
    if (!(error instanceof ServiceCreditModelError)) return null;
    const descriptor = Reflect.getOwnPropertyDescriptor(error, 'code');
    return descriptor && Object.hasOwn(descriptor, 'value')
      && typeof descriptor.value === 'string'
      ? descriptor.value
      : null;
  } catch {
    return null;
  }
}

function storeErrorCode(error) {
  try {
    if (!(error instanceof ServiceCreditSqliteStoreError)) return null;
    const descriptor = Reflect.getOwnPropertyDescriptor(error, 'code');
    return descriptor && Object.hasOwn(descriptor, 'value')
      && typeof descriptor.value === 'string'
      ? descriptor.value
      : null;
  } catch {
    return null;
  }
}

function captureDataObject(value, requiredKeys, optionalKeys = []) {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || Array.isArray(value)
      || Reflect.getPrototypeOf(value) !== Object.prototype
    ) {
      failStore('SERVICE_CREDIT_STORE_INVALID_CONFIGURATION');
    }
    const allowed = new SET_CONSTRUCTOR([...requiredKeys, ...optionalKeys]);
    const keys = Reflect.ownKeys(value);
    if (keys.some(
      key => typeof key !== 'string' || !REFLECT_APPLY(SET_HAS, allowed, [key]),
    )) {
      failStore('SERVICE_CREDIT_STORE_INVALID_CONFIGURATION');
    }
    const captured = Object.create(null);
    for (const key of keys) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
        failStore('SERVICE_CREDIT_STORE_INVALID_CONFIGURATION');
      }
      captured[key] = descriptor.value;
    }
    if (requiredKeys.some(key => !Object.hasOwn(captured, key))) {
      failStore('SERVICE_CREDIT_STORE_INVALID_CONFIGURATION');
    }
    return captured;
  } catch (error) {
    const code = storeErrorCode(error);
    throw storeFailure(code ?? 'SERVICE_CREDIT_STORE_INVALID_CONFIGURATION');
  }
}

function boundedInteger(value, minimum, maximum) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function captureHooks(input) {
  if (input === undefined) return Object.freeze({});
  const value = captureDataObject(input, [], [
    'beforeBegin',
    'afterBegin',
    'beforeCommit',
    'afterCommit',
  ]);
  for (const hook of Object.values(value)) {
    if (typeof hook !== 'function') failStore('SERVICE_CREDIT_STORE_INVALID_CONFIGURATION');
  }
  return Object.freeze({ ...value });
}

function captureConfiguration(options) {
  const value = captureDataObject(options, [
    'databasePath',
    'allowedRoot',
    'deriveCost',
  ], [
    'now',
    'busyTimeoutMs',
    'maxStateBytes',
    'maxOffers',
    'maxGrants',
    'maxRequests',
    'testHooks',
  ]);
  if (
    typeof value.databasePath !== 'string'
    || typeof value.allowedRoot !== 'string'
    || !isAbsolute(value.databasePath)
    || !isAbsolute(value.allowedRoot)
    || typeof value.deriveCost !== 'function'
    || (Object.hasOwn(value, 'now') && typeof value.now !== 'function')
  ) {
    failStore('SERVICE_CREDIT_STORE_INVALID_CONFIGURATION');
  }
  const databasePath = resolve(value.databasePath);
  const allowedRoot = resolve(value.allowedRoot);
  if (databasePath !== value.databasePath || allowedRoot !== value.allowedRoot) {
    failStore('SERVICE_CREDIT_STORE_INVALID_CONFIGURATION');
  }
  const busyTimeoutMs = value.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS;
  const maxStateBytes = value.maxStateBytes ?? DEFAULT_MAX_STATE_BYTES;
  const maxOffers = value.maxOffers ?? DEFAULT_MAX_OFFERS;
  const maxGrants = value.maxGrants ?? DEFAULT_MAX_GRANTS;
  const maxRequests = value.maxRequests ?? DEFAULT_MAX_REQUESTS;
  if (
    !boundedInteger(busyTimeoutMs, 1, MAX_BUSY_TIMEOUT_MS)
    || !boundedInteger(maxStateBytes, 512, HARD_MAX_STATE_BYTES)
    || !boundedInteger(maxOffers, 1, HARD_MAX_RECORDS)
    || !boundedInteger(maxGrants, 1, HARD_MAX_RECORDS)
    || !boundedInteger(maxRequests, 1, HARD_MAX_RECORDS)
  ) {
    failStore('SERVICE_CREDIT_STORE_INVALID_CONFIGURATION');
  }
  return Object.freeze({
    databasePath,
    allowedRoot,
    deriveCost: value.deriveCost,
    now: value.now ?? Date.now,
    busyTimeoutMs,
    maxStateBytes,
    maxOffers,
    maxGrants,
    maxRequests,
    testHooks: captureHooks(value.testHooks),
  });
}

function within(root, candidate) {
  const fromRoot = relative(root, candidate);
  return fromRoot === '' || (
    fromRoot !== '..'
    && !fromRoot.startsWith(`..${sep}`)
    && !isAbsolute(fromRoot)
  );
}

function privateDirectory(stat, uid) {
  return stat.isDirectory()
    && !stat.isSymbolicLink()
    && stat.uid === BigInt(uid)
    && (stat.mode & 0o777n) === 0o700n
    && (stat.mode & 0o7000n) === 0n;
}

function safeDatabaseFile(stat, uid) {
  return stat.isFile()
    && !stat.isSymbolicLink()
    && stat.uid === BigInt(uid)
    && stat.nlink === 1n
    && (stat.mode & 0o777n) === 0o600n
    && (stat.mode & 0o7000n) === 0n;
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameInitialGeneration(left, right) {
  return sameIdentity(left, right)
    && left.uid === right.uid
    && left.gid === right.gid
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function validatePathBoundary(configuration) {
  try {
    if (typeof process.getuid !== 'function') {
      failStore('SERVICE_CREDIT_STORE_UNSAFE_DIRECTORY');
    }
    const uid = process.getuid();
    if (!Number.isSafeInteger(uid) || uid < 0) {
      failStore('SERVICE_CREDIT_STORE_UNSAFE_DIRECTORY');
    }
    const parent = dirname(configuration.databasePath);
    if (
      configuration.databasePath === configuration.allowedRoot
      || !within(configuration.allowedRoot, configuration.databasePath)
      || !within(configuration.allowedRoot, parent)
    ) {
      failStore('SERVICE_CREDIT_STORE_PATH_OUTSIDE_ALLOWED_ROOT');
    }
    const fromRoot = relative(configuration.allowedRoot, parent);
    const components = fromRoot === '' ? [] : fromRoot.split(sep);
    let current = configuration.allowedRoot;
    for (const component of ['', ...components]) {
      if (component !== '') current = resolve(current, component);
      const stat = lstatSync(current, { bigint: true });
      if (!privateDirectory(stat, uid) || realpathSync(current) !== current) {
        failStore('SERVICE_CREDIT_STORE_UNSAFE_DIRECTORY');
      }
    }
    const realRoot = realpathSync(configuration.allowedRoot);
    const realParent = realpathSync(parent);
    if (!within(realRoot, realParent)) {
      failStore('SERVICE_CREDIT_STORE_PATH_OUTSIDE_ALLOWED_ROOT');
    }
    return { parent, uid };
  } catch (error) {
    const code = storeErrorCode(error);
    throw storeFailure(code ?? 'SERVICE_CREDIT_STORE_UNSAFE_DIRECTORY');
  }
}

function createExclusiveDatabaseFile(configuration, boundary) {
  let descriptor;
  try {
    const { O_CLOEXEC = 0, O_CREAT, O_EXCL, O_NOFOLLOW = 0, O_RDWR } = fsConstants;
    if (
      ![O_CLOEXEC, O_CREAT, O_EXCL, O_NOFOLLOW, O_RDWR].every(Number.isInteger)
      || O_NOFOLLOW === 0
    ) {
      failStore('SERVICE_CREDIT_STORE_UNSAFE_FILE');
    }
    descriptor = openSync(
      configuration.databasePath,
      O_RDWR | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC,
      0o600,
    );
    fchmodSync(descriptor, 0o600);
    const opened = fstatSync(descriptor, { bigint: true });
    if (!safeDatabaseFile(opened, boundary.uid)) {
      failStore('SERVICE_CREDIT_STORE_UNSAFE_FILE');
    }
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    const pathStat = lstatSync(configuration.databasePath, { bigint: true });
    if (!safeDatabaseFile(pathStat, boundary.uid) || !sameInitialGeneration(opened, pathStat)) {
      failStore('SERVICE_CREDIT_STORE_UNSAFE_FILE');
    }
    return pathStat;
  } catch (error) {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch {}
    }
    const code = storeErrorCode(error);
    if (code !== null) throw storeFailure(code);
    let alreadyExists = false;
    try {
      const descriptor = Reflect.getOwnPropertyDescriptor(error, 'code');
      alreadyExists = descriptor && Object.hasOwn(descriptor, 'value')
        && descriptor.value === 'EEXIST';
    } catch {}
    throw storeFailure(
      alreadyExists
        ? 'SERVICE_CREDIT_STORE_ALREADY_EXISTS'
        : 'SERVICE_CREDIT_STORE_CREATE_FAILED',
    );
  }
}

function inspectExistingDatabaseFile(configuration, boundary) {
  try {
    const stat = lstatSync(configuration.databasePath, { bigint: true });
    if (
      !safeDatabaseFile(stat, boundary.uid)
      || realpathSync(configuration.databasePath) !== configuration.databasePath
    ) {
      failStore('SERVICE_CREDIT_STORE_UNSAFE_FILE');
    }
    return stat;
  } catch (error) {
    const code = storeErrorCode(error);
    if (code !== null) throw storeFailure(code);
    let missing = false;
    try {
      const descriptor = Reflect.getOwnPropertyDescriptor(error, 'code');
      missing = descriptor && Object.hasOwn(descriptor, 'value')
        && descriptor.value === 'ENOENT';
    } catch {}
    throw storeFailure(
      missing ? 'SERVICE_CREDIT_STORE_MISSING' : 'SERVICE_CREDIT_STORE_UNSAFE_FILE',
    );
  }
}

function rejectWalSidecars(configuration) {
  for (const suffix of ['-wal', '-shm']) {
    try {
      lstatSync(`${configuration.databasePath}${suffix}`, { bigint: true });
      failStore('SERVICE_CREDIT_STORE_UNSAFE_FILE');
    } catch (error) {
      const code = storeErrorCode(error);
      if (code !== null) throw storeFailure(code);
      let missing = false;
      try {
        const descriptor = Reflect.getOwnPropertyDescriptor(error, 'code');
        missing = descriptor && Object.hasOwn(descriptor, 'value')
          && descriptor.value === 'ENOENT';
      } catch {}
      if (!missing) failStore('SERVICE_CREDIT_STORE_UNSAFE_FILE');
    }
  }
}

function inspectHotJournal(configuration, uid) {
  try {
    const stat = lstatSync(`${configuration.databasePath}-journal`, { bigint: true });
    if (!safeDatabaseFile(stat, uid)) failStore('SERVICE_CREDIT_STORE_UNSAFE_FILE');
    return true;
  } catch (error) {
    const code = storeErrorCode(error);
    if (code !== null) throw storeFailure(code);
    let missing = false;
    try {
      const descriptor = Reflect.getOwnPropertyDescriptor(error, 'code');
      missing = descriptor && Object.hasOwn(descriptor, 'value')
        && descriptor.value === 'ENOENT';
    } catch {}
    if (!missing) failStore('SERVICE_CREDIT_STORE_UNSAFE_FILE');
    return false;
  }
}

function openDatabase(configuration, before, creating) {
  let database;
  try {
    if (!creating) rejectWalSidecars(configuration);
    const hotJournal = !creating && inspectHotJournal(configuration, process.getuid());
    database = new DatabaseSync(configuration.databasePath, {
      allowExtension: false,
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true,
      readOnly: false,
      timeout: configuration.busyTimeoutMs,
    });
    const after = lstatSync(configuration.databasePath, { bigint: true });
    if (
      !safeDatabaseFile(after, process.getuid())
      || (hotJournal ? !sameIdentity(before, after) : !sameInitialGeneration(before, after))
    ) {
      failStore('SERVICE_CREDIT_STORE_UNSAFE_FILE');
    }
    configureConnection(database, configuration.busyTimeoutMs, creating);
    return database;
  } catch (error) {
    try { database?.close(); } catch {}
    const code = storeErrorCode(error);
    if (!creating && code === 'SERVICE_CREDIT_STORE_CONFIGURATION_FAILED') {
      throw storeFailure('SERVICE_CREDIT_STORE_CORRUPT');
    }
    throw storeFailure(
      code ?? (creating ? 'SERVICE_CREDIT_STORE_OPEN_FAILED' : 'SERVICE_CREDIT_STORE_CORRUPT'),
    );
  }
}

function pragmaValue(database, sql, field) {
  const row = database.prepare(sql).get();
  return row?.[field];
}

function configureConnection(database, busyTimeoutMs, creating) {
  try {
    database.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
    const journal = pragmaValue(
      database,
      creating ? 'PRAGMA journal_mode = DELETE' : 'PRAGMA journal_mode',
      'journal_mode',
    );
    if (journal !== 'delete') failStore('SERVICE_CREDIT_STORE_SCHEMA_UNSUPPORTED');
    database.exec('PRAGMA synchronous = FULL');
    database.exec('PRAGMA foreign_keys = ON');
    database.exec('PRAGMA trusted_schema = OFF');
    database.exec('PRAGMA recursive_triggers = OFF');
    if (process.platform === 'darwin') database.exec('PRAGMA fullfsync = ON');
    assertConnectionSettings(database, busyTimeoutMs);
  } catch (error) {
    const code = storeErrorCode(error);
    throw storeFailure(code ?? 'SERVICE_CREDIT_STORE_CONFIGURATION_FAILED');
  }
}

function assertConnectionSettings(database, busyTimeoutMs) {
  try {
    if (
      pragmaValue(database, 'PRAGMA journal_mode', 'journal_mode') !== 'delete'
      || pragmaValue(database, 'PRAGMA busy_timeout', 'timeout') !== busyTimeoutMs
      || pragmaValue(database, 'PRAGMA synchronous', 'synchronous') !== 2
      || pragmaValue(database, 'PRAGMA foreign_keys', 'foreign_keys') !== 1
      || pragmaValue(database, 'PRAGMA trusted_schema', 'trusted_schema') !== 0
      || pragmaValue(database, 'PRAGMA recursive_triggers', 'recursive_triggers') !== 0
      || (
        process.platform === 'darwin'
        && pragmaValue(database, 'PRAGMA fullfsync', 'fullfsync') !== 1
      )
    ) {
      failStore('SERVICE_CREDIT_STORE_CONFIGURATION_FAILED');
    }
  } catch (error) {
    const code = storeErrorCode(error);
    throw storeFailure(code ?? 'SERVICE_CREDIT_STORE_CONFIGURATION_FAILED');
  }
}

function isPlainObject(value) {
  return value !== null
    && typeof value === 'object'
    && !IS_PROXY(value)
    && !ARRAY_IS_ARRAY(value)
    && REFLECT_GET_PROTOTYPE_OF(value) === OBJECT_PROTOTYPE;
}

function exactKeys(value, expected) {
  if (!isPlainObject(value)) return false;
  const keys = REFLECT_OWN_KEYS(value);
  if (keys.length !== expected.length) return false;
  for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
    const key = keys[keyIndex];
    if (typeof key !== 'string') return false;
    let allowed = false;
    for (let index = 0; index < expected.length; index += 1) {
      if (expected[index] === key) {
        allowed = true;
        break;
      }
    }
    if (!allowed) return false;
    const descriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(value, key);
    if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) return false;
  }
  return true;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON_STRINGIFY(value);
  if (ARRAY_IS_ARRAY(value)) {
    let output = '[';
    for (let index = 0; index < value.length; index += 1) {
      if (index > 0) output += ',';
      output += canonicalJson(value[index]);
    }
    return `${output}]`;
  }
  const keys = OBJECT_KEYS(value);
  REFLECT_APPLY(ARRAY_SORT, keys, []);
  let output = '{';
  for (let index = 0; index < keys.length; index += 1) {
    if (index > 0) output += ',';
    const key = keys[index];
    output += `${JSON_STRINGIFY(key)}:${canonicalJson(value[key])}`;
  }
  return `${output}}`;
}

function publicChecksumFor(schemaVersion, revision, state) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson({
    revision,
    schemaVersion,
    state,
  })).digest('hex')}`;
}

function physicalV2ChecksumFor(physicalVersion, revision, ledgerState, executionState) {
  return `sha256:${crypto.createHash('sha256')
    .update(PHYSICAL_V2_CHECKSUM_DOMAIN)
    .update('\0')
    .update(canonicalJson({
      executionState,
      ledgerState,
      physicalVersion,
      revision,
    }))
    .digest('hex')}`;
}

function durableResultCommitmentFor(cachedResult) {
  return `sha256:${crypto.createHash('sha256')
    .update(DURABLE_RESULT_COMMITMENT_DOMAIN)
    .update('\0')
    .update(canonicalJson(cachedResult))
    .digest('hex')}`;
}

function frozenSnapshot(value) {
  if (value === null || typeof value !== 'object') return value;
  if (ARRAY_IS_ARRAY(value)) {
    const copy = [];
    for (let index = 0; index < value.length; index += 1) {
      OBJECT_DEFINE_PROPERTY(copy, STRING_FROM(index), {
        value: frozenSnapshot(value[index]),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return OBJECT_FREEZE(copy);
  }
  const copy = {};
  const keys = OBJECT_KEYS(value);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    OBJECT_DEFINE_PROPERTY(copy, key, {
      value: frozenSnapshot(value[key]),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return OBJECT_FREEZE(copy);
}

function publicEnvelopeFor(revision, state) {
  const envelope = {
    schemaVersion: PUBLIC_LEDGER_ENVELOPE_SCHEMA_VERSION,
    revision,
    state,
  };
  return OBJECT_FREEZE({
    ...envelope,
    checksum: publicChecksumFor(envelope.schemaVersion, envelope.revision, envelope.state),
  });
}

function physicalEnvelopeFor(revision, ledgerState, executionState) {
  const envelope = {
    physicalVersion: SERVICE_CREDIT_SQLITE_SCHEMA_VERSION,
    revision,
    ledgerState,
    executionState,
  };
  return OBJECT_FREEZE({
    ...envelope,
    checksum: physicalV2ChecksumFor(
      envelope.physicalVersion,
      envelope.revision,
      envelope.ledgerState,
      envelope.executionState,
    ),
  });
}

function ledgerRequestKey(request) {
  return `${request.grantId}\0${request.requestId}`;
}

function executionRequestProjection(request) {
  return {
    modelVersion: request.modelVersion,
    grantId: request.grantId,
    requestId: request.requestId,
    requestDigest: request.requestDigest,
    method: request.method,
    routeId: request.routeId,
    canonicalBodyDigest: request.canonicalBodyDigest,
    selectedContentType: request.selectedContentType,
    maxCostUnits: request.maxCostUnits,
    costUnits: request.costUnits,
  };
}

function reservationMatchesLedger(request, input) {
  return request.modelVersion === input.modelVersion
    && request.grantId === input.grantId
    && request.requestId === input.requestId
    && request.method === input.method
    && request.routeId === input.routeId
    && request.canonicalBodyDigest === input.canonicalBodyDigest
    && request.selectedContentType === input.selectedContentType
    && request.maxCostUnits === input.maxCostUnits;
}

function findLedgerRequest(ledgerState, grantId, requestId) {
  for (let index = 0; index < ledgerState.requests.length; index += 1) {
    const request = ledgerState.requests[index];
    if (request.grantId === grantId && request.requestId === requestId) return request;
  }
  return null;
}

function findDurableExecutionByRequest(executionState, grantId, requestId) {
  for (let index = 0; index < executionState.executions.length; index += 1) {
    const execution = executionState.executions[index];
    if (execution.request.grantId === grantId && execution.request.requestId === requestId) {
      return execution;
    }
  }
  return null;
}

function findDurableExecution(executionState, executionId) {
  for (let index = 0; index < executionState.executions.length; index += 1) {
    if (executionState.executions[index].executionId === executionId) {
      return executionState.executions[index];
    }
  }
  return null;
}

function assertDurableCrossLinks(configuration, ledgerState, executionState) {
  if (executionState === null) return;
  if (executionState.capacity > configuration.maxRequests) {
    failStore('SERVICE_CREDIT_STORE_CAPACITY_EXCEEDED');
  }
  const linked = new SET_CONSTRUCTOR();
  let nonterminalCount = 0;
  for (let index = 0; index < executionState.executions.length; index += 1) {
    const execution = executionState.executions[index];
    const request = findLedgerRequest(
      ledgerState,
      execution.request.grantId,
      execution.request.requestId,
    );
    if (
      request === null
      || canonicalJson(execution.request) !== canonicalJson(executionRequestProjection(request))
    ) {
      failStore('SERVICE_CREDIT_STORE_CORRUPT');
    }
    const key = ledgerRequestKey(request);
    if (REFLECT_APPLY(SET_HAS, linked, [key])) failStore('SERVICE_CREDIT_STORE_CORRUPT');
    REFLECT_APPLY(SET_ADD, linked, [key]);
    if (execution.terminalClassification === 'NONE') {
      nonterminalCount += 1;
      if (
        request.state !== REQUEST_STATE.EXECUTING
        || !REFLECT_APPLY(
          ARRAY_INCLUDES,
          ['PREPARED', 'MAY_HAVE_STARTED'],
          [execution.fencePhase],
        )
      ) {
        failStore('SERVICE_CREDIT_STORE_CORRUPT');
      }
    } else if (execution.terminalClassification === 'NOT_INVOKED') {
      if (request.state !== REQUEST_STATE.FAILED_RELEASED) {
        failStore('SERVICE_CREDIT_STORE_CORRUPT');
      }
    } else if (execution.terminalClassification === 'SUCCEEDED') {
      if (
        request.state !== REQUEST_STATE.SUCCEEDED
        || request.cachedResult === null
        || execution.resultCommitment !== durableResultCommitmentFor(request.cachedResult)
      ) {
        failStore('SERVICE_CREDIT_STORE_CORRUPT');
      }
    } else if (
      execution.terminalClassification !== 'OUTCOME_UNKNOWN'
      || request.state !== REQUEST_STATE.OUTCOME_UNKNOWN
    ) {
      failStore('SERVICE_CREDIT_STORE_CORRUPT');
    }
  }
  if (nonterminalCount > 1) failStore('SERVICE_CREDIT_STORE_CORRUPT');
  for (let index = 0; index < ledgerState.requests.length; index += 1) {
    const request = ledgerState.requests[index];
    if (
      (request.state === REQUEST_STATE.RESERVED
        || request.state === REQUEST_STATE.EXECUTING
        || request.state === REQUEST_STATE.OUTCOME_UNKNOWN)
      && !REFLECT_APPLY(SET_HAS, linked, [ledgerRequestKey(request)])
    ) {
      failStore('SERVICE_CREDIT_STORE_CORRUPT');
    }
  }
}

function legacyRequestMutation(operation) {
  return operation === 'reserveRequest'
    || operation === 'beginExecution'
    || operation === 'releaseBeforeExecution'
    || operation === 'completeExecution'
    || operation === 'markOutcomeUnknown'
    || operation === 'reconcileRequest';
}

function sameExecutionConfiguration(state, candidate) {
  return state.contractVersion === candidate.contractVersion
    && state.ledgerId === candidate.ledgerId
    && state.capacity === candidate.capacity
    && canonicalJson(state.policy) === canonicalJson(candidate.policy)
    && state.generation.generationId === candidate.generation.generationId;
}

function hasNonterminalLedgerRequest(ledgerState) {
  for (let index = 0; index < ledgerState.requests.length; index += 1) {
    const state = ledgerState.requests[index].state;
    if (
      state === REQUEST_STATE.RESERVED
      || state === REQUEST_STATE.EXECUTING
      || state === REQUEST_STATE.OUTCOME_UNKNOWN
    ) {
      return true;
    }
  }
  return false;
}

function hasNonterminalExecution(executionState) {
  for (let index = 0; index < executionState.executions.length; index += 1) {
    if (executionState.executions[index].terminalClassification === 'NONE') return true;
  }
  return false;
}

function receipt(value) {
  return frozenSnapshot(value);
}

function assertCapacity(configuration, state) {
  if (
    !exactKeys(state, ['schemaVersion', 'modelVersion', 'offers', 'grants', 'requests'])
    || !Array.isArray(state.offers)
    || !Array.isArray(state.grants)
    || !Array.isArray(state.requests)
  ) {
    failStore('SERVICE_CREDIT_STORE_CORRUPT');
  }
  if (
    state.offers.length > configuration.maxOffers
    || state.grants.length > configuration.maxGrants
    || state.requests.length > configuration.maxRequests
    || Buffer.byteLength(canonicalJson(state)) > configuration.maxStateBytes
  ) {
    failStore('SERVICE_CREDIT_STORE_CAPACITY_EXCEEDED');
  }
}

function assertPhysicalEnvelopeCapacity(configuration, envelope) {
  if (
    Buffer.byteLength(canonicalJson(envelope))
      > configuration.maxStateBytes + MAX_PHYSICAL_ENVELOPE_OVERHEAD_BYTES
  ) {
    failStore('SERVICE_CREDIT_STORE_CAPACITY_EXCEEDED');
  }
}

function syncParentDirectory(parent) {
  let descriptor;
  try {
    const { O_CLOEXEC = 0, O_DIRECTORY = 0, O_NOFOLLOW = 0, O_RDONLY } = fsConstants;
    if (
      ![O_CLOEXEC, O_DIRECTORY, O_NOFOLLOW, O_RDONLY].every(Number.isInteger)
      || O_DIRECTORY === 0
      || O_NOFOLLOW === 0
    ) {
      failStore('SERVICE_CREDIT_STORE_DIRECTORY_SYNC_FAILED');
    }
    descriptor = openSync(parent, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
  } catch (error) {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch {}
    }
    const code = storeErrorCode(error);
    throw storeFailure(code ?? 'SERVICE_CREDIT_STORE_DIRECTORY_SYNC_FAILED');
  }
}

/**
 * Crash-safe, single-host reference persistence for InMemoryServiceCreditModel
 * on a reliable local filesystem. SQLite serializes writers across processes;
 * no process-local queue is used. Network and cloud-synchronized filesystems
 * are outside the supported boundary.
 *
 * Clock and pricing callbacks are synchronous, bounded, trusted server policy.
 * They can run while BEGIN IMMEDIATE is held so the transition is checked
 * against the exact ledger revision being committed. They must never perform
 * external effects. The fixed busy timeout therefore makes callback duration
 * and writer contention an explicit availability limit.
 *
 * Physical format v2 stores the current ledger state and nullable exact
 * execution-contract state under one revision and integrity commitment. New
 * and migrated stores retain null until explicit one-way initialization. Public
 * load and metadata results intentionally retain the legacy schema-v1 envelope
 * projection used by the current HTTP and composition boundaries. Physical-v1
 * files are accepted only by the explicit fail-closed migrator; ordinary open
 * never migrates, repairs, downgrades, or deletes a database.
 * Explicit durable methods recompute pure execution-contract transitions from
 * freshly read compound state under BEGIN IMMEDIATE. Their APPLIED, UNCHANGED,
 * and STALE receipts never expose invocation permission; runtime ownership is
 * a separate boundary.
 *
 * This persistence class does not itself perform HTTP handling, capability
 * proof verification, or settlement verification. The separate inactive mock
 * activation adapter verifies its exact synthetic evidence before atomically
 * asking this store to persist the activation and grant. Authoritative live
 * activation, capability issuance, and live service-credit wiring remain
 * unimplemented. This class also does not implement wallet or RPC integration,
 * live payments, callback invocation, runtime deadline enforcement,
 * reconciliation evidence, deletion, retention, compaction, tombstones,
 * downgrade, automatic migration, or distributed transactions,
 * and it is not a production-readiness claim.
 * Same-UID code and the host kernel are trusted;
 * no portable ACL claim is made. reconcileRequest remains a privileged
 * server-only method and is not authority granted to a capability holder.
 * A raw store handle exposes activateGrantFromTrustedRecord and therefore is
 * grant-minting/admin authority. That method is deliberately conspicuous but is
 * not cryptographically inaccessible; never expose the store handle or method
 * to clients or HTTP handlers. deriveCost and funding-policy implementations are
 * trusted server code whose semantics are not hashed or authenticated. Semantic
 * changes require new policy identifiers or versions and a new offer version;
 * identifier reuse cannot be detected here.
 */
export class ServiceCreditSqliteStore {
  #database;
  #configuration;
  #identity;
  #closed = false;
  #quarantined = false;
  #operationActive = false;
  #callbackActive = false;
  #callbackReentryAttempted = false;

  constructor(token, configuration, database, identity) {
    if (token !== CONSTRUCTOR_TOKEN) failStore('SERVICE_CREDIT_STORE_INVALID_CONFIGURATION');
    this.#configuration = configuration;
    this.#database = database;
    this.#identity = identity;
  }

  static create(options) {
    const configuration = captureConfiguration(options);
    const boundary = validatePathBoundary(configuration);
    const before = createExclusiveDatabaseFile(configuration, boundary);
    const database = openDatabase(configuration, before, true);
    const store = new ServiceCreditSqliteStore(
      CONSTRUCTOR_TOKEN,
      configuration,
      database,
      before,
    );
    try {
      store.#initializeNew();
      syncParentDirectory(boundary.parent);
      store.#refreshIdentity();
      return store;
    } catch (error) {
      store.#closeAfterFailure();
      const code = storeErrorCode(error);
      throw storeFailure(code ?? 'SERVICE_CREDIT_STORE_CREATE_FAILED');
    }
  }

  static openExisting(options) {
    const configuration = captureConfiguration(options);
    const boundary = validatePathBoundary(configuration);
    const before = inspectExistingDatabaseFile(configuration, boundary);
    const database = openDatabase(configuration, before, false);
    const store = new ServiceCreditSqliteStore(
      CONSTRUCTOR_TOKEN,
      configuration,
      database,
      before,
    );
    try {
      store.#runTransaction('openExisting', () => {
        store.#validateDatabase();
        store.#readLedger();
        return null;
      });
      store.#refreshIdentity();
      return store;
    } catch (error) {
      store.#closeAfterFailure();
      const code = storeErrorCode(error);
      throw storeFailure(code ?? 'SERVICE_CREDIT_STORE_OPEN_FAILED');
    }
  }

  static migrateExisting(options) {
    const configuration = captureConfiguration(options);
    const boundary = validatePathBoundary(configuration);
    const before = inspectExistingDatabaseFile(configuration, boundary);
    const database = openDatabase(configuration, before, false);
    const store = new ServiceCreditSqliteStore(
      CONSTRUCTOR_TOKEN,
      configuration,
      database,
      before,
    );
    try {
      store.#runTransaction('migrateExisting', () => {
        store.#validateDatabase(LEGACY_SQLITE_SCHEMA_VERSION);
        const { envelope, model } = store.#readLegacyLedger();
        const state = model.exportState();
        for (let index = 0; index < state.requests.length; index += 1) {
          const requestState = state.requests[index].state;
          if (
            requestState === REQUEST_STATE.EXECUTING
            || requestState === REQUEST_STATE.OUTCOME_UNKNOWN
          ) {
            failStore('SERVICE_CREDIT_STORE_MIGRATION_UNSAFE');
          }
        }
        const next = physicalEnvelopeFor(envelope.revision, state, null);
        assertPhysicalEnvelopeCapacity(configuration, next);
        const updated = store.#database.prepare(
          `UPDATE ${TABLE_NAME} SET envelope = ? WHERE singleton = 1`,
        ).run(canonicalJson(next));
        if (updated.changes !== 1) failStore('SERVICE_CREDIT_STORE_CORRUPT');
        store.#database.exec(`PRAGMA user_version = ${SERVICE_CREDIT_SQLITE_SCHEMA_VERSION}`);
        store.#validateDatabase();
        store.#readLedger();
        return { changed: true };
      });
      return store;
    } catch (error) {
      store.#closeAfterFailure();
      const code = storeErrorCode(error);
      throw storeFailure(code ?? 'SERVICE_CREDIT_STORE_MIGRATION_FAILED');
    }
  }

  registerOffer(input) {
    return this.#modelOperation('registerOffer', input);
  }

  getOffer(input) {
    return this.#modelOperation('getOffer', input);
  }

  activateGrantFromTrustedRecord(input) {
    return this.#modelOperation('activateGrantFromTrustedRecord', input);
  }

  getActivation(activationId) {
    return this.#modelOperation('getActivation', activationId);
  }

  getGrant(grantId) {
    return this.#modelOperation('getGrant', grantId);
  }

  revokeGrant(input) {
    return this.#modelOperation('revokeGrant', input);
  }

  reserveRequest(input) {
    return this.#modelOperation('reserveRequest', input);
  }

  getRequest(input) {
    return this.#modelOperation('getRequest', input);
  }

  beginExecution(input) {
    return this.#modelOperation('beginExecution', input);
  }

  releaseBeforeExecution(input) {
    return this.#modelOperation('releaseBeforeExecution', input);
  }

  completeExecution(input) {
    return this.#modelOperation('completeExecution', input);
  }

  markOutcomeUnknown(input) {
    return this.#modelOperation('markOutcomeUnknown', input);
  }

  reconcileRequest(input) {
    return this.#modelOperation('reconcileRequest', input);
  }

  getDurableExecutionSnapshot() {
    if (arguments.length !== 0) {
      failStore('SERVICE_CREDIT_STORE_INVALID_EXECUTION_INPUT');
    }
    return this.#runPublicOperation(() => this.#runTransaction(
      'getDurableExecutionSnapshot',
      () => {
        this.#validateDatabase();
        const { executionState, physicalEnvelope } = this.#readLedger();
        return receipt({
          revision: physicalEnvelope.revision,
          executionState,
        });
      },
    ));
  }

  initializeDurableExecution(options) {
    if (arguments.length !== 1) {
      failStore('SERVICE_CREDIT_STORE_INVALID_EXECUTION_INPUT');
    }
    return this.#runPublicOperation(() => {
      const input = captureDurableObject(options, [
        'expectedRevision',
        'ledgerId',
        'policy',
        'capacity',
      ]);
      const expectedRevision = captureExpectedRevision(input.expectedRevision);
      const candidate = invokeExecutionContract(() => createServiceCreditExecutionContract({
        ledgerId: input.ledgerId,
        policy: input.policy,
        capacity: input.capacity,
      }));
      const outcome = this.#runTransaction('initializeDurableExecution', () => {
        this.#validateDatabase();
        const { executionState, physicalEnvelope } = this.#readLedger();
        if (physicalEnvelope.revision !== expectedRevision) {
          return {
            changed: false,
            result: receipt({
              disposition: 'STALE',
              revision: physicalEnvelope.revision,
              executionState,
            }),
          };
        }
        if (candidate.capacity > this.#configuration.maxRequests) {
          failStore('SERVICE_CREDIT_STORE_CAPACITY_EXCEEDED');
        }
        if (executionState !== null) {
          if (!sameExecutionConfiguration(executionState, candidate)) {
            failStore('SERVICE_CREDIT_STORE_EXECUTION_CONFLICT');
          }
          return {
            changed: false,
            result: receipt({
              disposition: 'UNCHANGED',
              revision: physicalEnvelope.revision,
              executionState,
            }),
          };
        }
        if (hasNonterminalLedgerRequest(physicalEnvelope.ledgerState)) {
          failStore('SERVICE_CREDIT_STORE_EXECUTION_INITIALIZATION_UNSAFE');
        }
        const next = this.#persistCompound(
          physicalEnvelope,
          physicalEnvelope.ledgerState,
          candidate,
        );
        return {
          changed: true,
          result: receipt({
            disposition: 'APPLIED',
            revision: next.revision,
            executionState: candidate,
          }),
        };
      });
      return outcome.result;
    });
  }

  prepareDurableExecution(options) {
    if (arguments.length !== 1) {
      failStore('SERVICE_CREDIT_STORE_INVALID_EXECUTION_INPUT');
    }
    return this.#runPublicOperation(() => {
      const input = captureDurableObject(options, [
        'expectedRevision',
        'request',
        'selectedDurationMs',
      ]);
      const expectedRevision = captureExpectedRevision(input.expectedRevision);
      const requestInput = captureReservationInput(input.request);
      if (!NUMBER_IS_SAFE_INTEGER(input.selectedDurationMs) || input.selectedDurationMs < 1) {
        failStore('SERVICE_CREDIT_STORE_INVALID_EXECUTION_INPUT');
      }
      const outcome = this.#runTransaction('prepareDurableExecution', () => {
        this.#validateDatabase();
        const { executionState, physicalEnvelope } = this.#readLedger();
        if (physicalEnvelope.revision !== expectedRevision) {
          return {
            changed: false,
            result: receipt({
              disposition: 'STALE',
              revision: physicalEnvelope.revision,
              request: null,
              execution: null,
            }),
          };
        }
        if (executionState === null) {
          failStore('SERVICE_CREDIT_STORE_DURABLE_EXECUTION_DISABLED');
        }
        const existingRequest = findLedgerRequest(
          physicalEnvelope.ledgerState,
          requestInput.grantId,
          requestInput.requestId,
        );
        if (existingRequest !== null && !reservationMatchesLedger(existingRequest, requestInput)) {
          throw fixedModelFailure('REQUEST_ID_CONFLICT');
        }
        const existingExecution = findDurableExecutionByRequest(
          executionState,
          requestInput.grantId,
          requestInput.requestId,
        );
        if (existingExecution !== null) {
          if (existingExecution.selectedDurationMs !== input.selectedDurationMs) {
            failStore('SERVICE_CREDIT_STORE_EXECUTION_CONFLICT');
          }
          return {
            changed: false,
            result: receipt({
              disposition: 'UNCHANGED',
              revision: physicalEnvelope.revision,
              request: existingRequest,
              execution: existingExecution,
            }),
          };
        }
        if (input.selectedDurationMs > executionState.policy.maxDurationMs) {
          failStore('SERVICE_CREDIT_STORE_INVALID_EXECUTION_INPUT');
        }
        if (existingRequest !== null) {
          failStore('SERVICE_CREDIT_STORE_EXECUTION_INVALID_TRANSITION');
        }
        if (executionState.generation.state === 'SEALED') {
          failStore('SERVICE_CREDIT_STORE_EXECUTION_GENERATION_SEALED');
        }
        if (executionState.executions.length >= executionState.capacity) {
          failStore('SERVICE_CREDIT_STORE_CAPACITY_EXCEEDED');
        }
        if (hasNonterminalExecution(executionState)) {
          throw fixedModelFailure('UNRESOLVED_EXECUTION');
        }
        const wallClockStartMs = this.#captureTrustedNow();
        if (!NUMBER_IS_SAFE_INTEGER(wallClockStartMs + input.selectedDurationMs)) {
          failStore('SERVICE_CREDIT_STORE_INVALID_EXECUTION_INPUT');
        }
        const model = this.#modelAt(physicalEnvelope.ledgerState, wallClockStartMs);
        const reserved = model.reserveRequest(requestInput);
        const began = model.beginExecution({
          grantId: reserved.request.grantId,
          requestId: reserved.request.requestId,
        });
        if (began.executionAuthorized !== true) {
          failStore('SERVICE_CREDIT_STORE_EXECUTION_INVALID_TRANSITION');
        }
        const prepared = invokeExecutionContract(() => prepareServiceCreditExecution({
          state: executionState,
          request: executionRequestProjection(began.request),
          policy: executionState.policy,
          selectedDurationMs: input.selectedDurationMs,
          wallClockStartMs,
        }));
        if (prepared.replayed || prepared.execution.fencePhase !== 'PREPARED') {
          failStore('SERVICE_CREDIT_STORE_INVARIANT_VIOLATION');
        }
        const ledgerState = model.exportState();
        const next = this.#persistCompound(physicalEnvelope, ledgerState, prepared.state);
        return {
          changed: true,
          result: receipt({
            disposition: 'APPLIED',
            revision: next.revision,
            request: began.request,
            execution: prepared.execution,
          }),
        };
      });
      return outcome.result;
    });
  }

  persistDurableExecutionFence(options) {
    if (arguments.length !== 1) {
      failStore('SERVICE_CREDIT_STORE_INVALID_EXECUTION_INPUT');
    }
    return this.#runPublicOperation(() => {
      const input = captureDurableObject(options, ['expectedRevision', 'executionId']);
      const expectedRevision = captureExpectedRevision(input.expectedRevision);
      if (!validIdentifier(input.executionId)) {
        failStore('SERVICE_CREDIT_STORE_INVALID_EXECUTION_INPUT');
      }
      const outcome = this.#runTransaction('persistDurableExecutionFence', () => {
        this.#validateDatabase();
        const { executionState, physicalEnvelope } = this.#readLedger();
        if (physicalEnvelope.revision !== expectedRevision) {
          return {
            changed: false,
            result: receipt({
              disposition: 'STALE',
              revision: physicalEnvelope.revision,
              execution: null,
            }),
          };
        }
        if (executionState === null) {
          failStore('SERVICE_CREDIT_STORE_DURABLE_EXECUTION_DISABLED');
        }
        const current = findDurableExecution(executionState, input.executionId);
        if (current === null) failStore('SERVICE_CREDIT_STORE_EXECUTION_NOT_FOUND');
        if (
          current.terminalClassification !== 'NONE'
          || current.fencePhase === 'MAY_HAVE_STARTED'
        ) {
          return {
            changed: false,
            result: receipt({
              disposition: 'UNCHANGED',
              revision: physicalEnvelope.revision,
              execution: current,
            }),
          };
        }
        if (executionState.generation.state === 'SEALED') {
          failStore('SERVICE_CREDIT_STORE_EXECUTION_GENERATION_SEALED');
        }
        const wallClockNowMs = this.#captureTrustedNow();
        const fenced = invokeExecutionContract(() => fenceServiceCreditExecution({
          state: executionState,
          executionId: input.executionId,
          wallClockNowMs,
        })).fenceTransitionCandidate;
        const model = this.#modelAt(physicalEnvelope.ledgerState, wallClockNowMs);
        if (fenced.execution.terminalClassification === 'NOT_INVOKED') {
          this.#releaseExecutingWithoutDurableUnknown(model, fenced.execution.request);
        } else if (fenced.execution.fencePhase !== 'MAY_HAVE_STARTED') {
          failStore('SERVICE_CREDIT_STORE_INVARIANT_VIOLATION');
        }
        const ledgerState = model.exportState();
        const next = this.#persistCompound(physicalEnvelope, ledgerState, fenced.state);
        return {
          changed: true,
          result: receipt({
            disposition: 'APPLIED',
            revision: next.revision,
            execution: fenced.execution,
          }),
        };
      });
      return outcome.result;
    });
  }

  completeDurableExecution(options) {
    if (arguments.length !== 1) {
      failStore('SERVICE_CREDIT_STORE_INVALID_EXECUTION_INPUT');
    }
    return this.#runPublicOperation(() => {
      const input = captureDurableObject(options, [
        'expectedRevision',
        'executionId',
        'cachedResult',
      ]);
      const expectedRevision = captureExpectedRevision(input.expectedRevision);
      if (!validIdentifier(input.executionId)) {
        failStore('SERVICE_CREDIT_STORE_INVALID_EXECUTION_INPUT');
      }
      const cachedResult = captureCachedResult(input.cachedResult);
      const resultCommitment = durableResultCommitmentFor(cachedResult);
      const outcome = this.#runTransaction('completeDurableExecution', () => {
        this.#validateDatabase();
        const { executionState, physicalEnvelope } = this.#readLedger();
        if (physicalEnvelope.revision !== expectedRevision) {
          return {
            changed: false,
            result: receipt({
              disposition: 'STALE',
              revision: physicalEnvelope.revision,
              winner: null,
              request: null,
              execution: null,
            }),
          };
        }
        if (executionState === null) {
          failStore('SERVICE_CREDIT_STORE_DURABLE_EXECUTION_DISABLED');
        }
        const current = findDurableExecution(executionState, input.executionId);
        if (current === null) failStore('SERVICE_CREDIT_STORE_EXECUTION_NOT_FOUND');
        if (cachedResult.contentType !== current.request.selectedContentType) {
          failStore('SERVICE_CREDIT_STORE_INVALID_EXECUTION_INPUT');
        }
        const completed = invokeExecutionContract(() => completeServiceCreditExecution({
          state: executionState,
          executionId: input.executionId,
          resultCommitment,
        }));
        if (!completed.transitioned) {
          if (completed.winner === 'SUCCEEDED') {
            const model = this.#modelAt(physicalEnvelope.ledgerState, 0);
            model.completeExecution({
              grantId: current.request.grantId,
              requestId: current.request.requestId,
              cachedResult,
            });
          }
          const requestState = findLedgerRequest(
            physicalEnvelope.ledgerState,
            current.request.grantId,
            current.request.requestId,
          );
          return {
            changed: false,
            result: receipt({
              disposition: 'UNCHANGED',
              revision: physicalEnvelope.revision,
              winner: completed.winner,
              request: requestState,
              execution: completed.execution,
            }),
          };
        }
        const model = this.#modelAt(physicalEnvelope.ledgerState, 0);
        const modelResult = model.completeExecution({
          grantId: current.request.grantId,
          requestId: current.request.requestId,
          cachedResult,
        });
        const ledgerState = model.exportState();
        const next = this.#persistCompound(physicalEnvelope, ledgerState, completed.state);
        return {
          changed: true,
          result: receipt({
            disposition: 'APPLIED',
            revision: next.revision,
            winner: completed.winner,
            request: modelResult.request,
            execution: completed.execution,
          }),
        };
      });
      return outcome.result;
    });
  }

  markDurableExecutionUnknown(options) {
    if (arguments.length !== 1) {
      failStore('SERVICE_CREDIT_STORE_INVALID_EXECUTION_INPUT');
    }
    return this.#runPublicOperation(() => {
      const input = captureDurableObject(options, [
        'expectedRevision',
        'executionId',
        'reason',
      ]);
      const expectedRevision = captureExpectedRevision(input.expectedRevision);
      if (!validIdentifier(input.executionId) || typeof input.reason !== 'string') {
        failStore('SERVICE_CREDIT_STORE_INVALID_EXECUTION_INPUT');
      }
      const outcome = this.#runTransaction('markDurableExecutionUnknown', () => {
        this.#validateDatabase();
        const { executionState, physicalEnvelope } = this.#readLedger();
        if (physicalEnvelope.revision !== expectedRevision) {
          return {
            changed: false,
            result: receipt({
              disposition: 'STALE',
              revision: physicalEnvelope.revision,
              winner: null,
              request: null,
              execution: null,
            }),
          };
        }
        if (executionState === null) {
          failStore('SERVICE_CREDIT_STORE_DURABLE_EXECUTION_DISABLED');
        }
        const current = findDurableExecution(executionState, input.executionId);
        if (current === null) failStore('SERVICE_CREDIT_STORE_EXECUTION_NOT_FOUND');
        const unknown = invokeExecutionContract(() => markServiceCreditExecutionUnknown({
          state: executionState,
          executionId: input.executionId,
          reason: input.reason,
        }));
        if (!unknown.transitioned) {
          const requestState = findLedgerRequest(
            physicalEnvelope.ledgerState,
            current.request.grantId,
            current.request.requestId,
          );
          return {
            changed: false,
            result: receipt({
              disposition: 'UNCHANGED',
              revision: physicalEnvelope.revision,
              winner: unknown.winner,
              request: requestState,
              execution: unknown.execution,
            }),
          };
        }
        const model = this.#modelAt(physicalEnvelope.ledgerState, 0);
        const modelResult = model.markOutcomeUnknown({
          grantId: current.request.grantId,
          requestId: current.request.requestId,
        });
        const ledgerState = model.exportState();
        const next = this.#persistCompound(physicalEnvelope, ledgerState, unknown.state);
        return {
          changed: true,
          result: receipt({
            disposition: 'APPLIED',
            revision: next.revision,
            winner: unknown.winner,
            request: modelResult.request,
            execution: unknown.execution,
          }),
        };
      });
      return outcome.result;
    });
  }

  recoverDurableExecutionsAfterRestart(options) {
    if (arguments.length !== 1) {
      failStore('SERVICE_CREDIT_STORE_INVALID_EXECUTION_INPUT');
    }
    return this.#runPublicOperation(() => {
      const input = captureDurableObject(options, ['expectedRevision']);
      const expectedRevision = captureExpectedRevision(input.expectedRevision);
      const outcome = this.#runTransaction('recoverDurableExecutionsAfterRestart', () => {
        this.#validateDatabase();
        const { executionState, physicalEnvelope } = this.#readLedger();
        if (physicalEnvelope.revision !== expectedRevision) {
          return {
            changed: false,
            result: receipt({
              disposition: 'STALE',
              revision: physicalEnvelope.revision,
              noInvocationCount: 0,
              outcomeUnknownCount: 0,
              executionState: null,
            }),
          };
        }
        if (executionState === null) {
          failStore('SERVICE_CREDIT_STORE_DURABLE_EXECUTION_DISABLED');
        }
        const wallClockNowMs = this.#captureTrustedNow();
        const recovered = invokeExecutionContract(() => recoverServiceCreditExecutions({
          state: executionState,
          wallClockNowMs,
        }));
        if (!recovered.transitioned) {
          return {
            changed: false,
            result: receipt({
              disposition: 'UNCHANGED',
              revision: physicalEnvelope.revision,
              noInvocationCount: 0,
              outcomeUnknownCount: 0,
              executionState,
            }),
          };
        }
        const model = this.#modelAt(physicalEnvelope.ledgerState, wallClockNowMs);
        for (let index = 0; index < executionState.executions.length; index += 1) {
          const before = executionState.executions[index];
          const after = findDurableExecution(recovered.state, before.executionId);
          if (before.terminalClassification !== 'NONE' || after === null) continue;
          if (after.terminalClassification === 'NOT_INVOKED') {
            this.#releaseExecutingWithoutDurableUnknown(model, before.request);
          } else if (after.terminalClassification === 'OUTCOME_UNKNOWN') {
            model.markOutcomeUnknown({
              grantId: before.request.grantId,
              requestId: before.request.requestId,
            });
          }
        }
        const ledgerState = model.exportState();
        const next = this.#persistCompound(physicalEnvelope, ledgerState, recovered.state);
        return {
          changed: true,
          result: receipt({
            disposition: 'APPLIED',
            revision: next.revision,
            noInvocationCount: recovered.noInvocationCount,
            outcomeUnknownCount: recovered.outcomeUnknownCount,
            executionState: recovered.state,
          }),
        };
      });
      return outcome.result;
    });
  }

  load() {
    return this.#runPublicOperation(() => this.#runTransaction('load', () => {
      this.#validateDatabase();
      const { publicEnvelope } = this.#readLedger();
      return frozenSnapshot(publicEnvelope);
    }));
  }

  getMetadata() {
    return this.#runPublicOperation(() => this.#runTransaction('getMetadata', () => {
      this.#validateDatabase();
      const { publicEnvelope } = this.#readLedger();
      return frozenSnapshot({
        schemaVersion: publicEnvelope.schemaVersion,
        modelVersion: publicEnvelope.state.modelVersion,
        revision: publicEnvelope.revision,
        checksum: publicEnvelope.checksum,
      });
    }));
  }

  close() {
    return this.#runPublicOperation(() => {
      if (this.#closed) return;
      try {
        if (this.#database?.isTransaction) {
          this.#quarantined = true;
          failStore('SERVICE_CREDIT_STORE_CLOSE_FAILED');
        }
        this.#database.close();
        this.#closed = true;
      } catch (error) {
        this.#closed = true;
        this.#quarantined = true;
        const code = storeErrorCode(error);
        throw storeFailure(code ?? 'SERVICE_CREDIT_STORE_CLOSE_FAILED');
      }
    });
  }

  #captureTrustedNow() {
    const value = this.#invokeTrustedCallback(this.#configuration.now, []);
    if (!NUMBER_IS_SAFE_INTEGER(value) || value < 0) {
      failStore('SERVICE_CREDIT_STORE_INVALID_CLOCK');
    }
    return value;
  }

  #modelAt(ledgerState, wallClockNowMs) {
    try {
      return InMemoryServiceCreditModel.fromState({
        deriveCost: context => this.#invokeTrustedCallback(
          this.#configuration.deriveCost,
          [context],
        ),
        now: () => wallClockNowMs,
      }, ledgerState);
    } catch (error) {
      const code = modelErrorCode(error);
      if (code !== null) throw fixedModelFailure(code);
      const storeCode = storeErrorCode(error);
      throw storeFailure(storeCode ?? 'SERVICE_CREDIT_STORE_CORRUPT');
    }
  }

  #releaseExecutingWithoutDurableUnknown(model, request) {
    const reference = {
      grantId: request.grantId,
      requestId: request.requestId,
    };
    const unknown = model.markOutcomeUnknown(reference);
    if (!unknown.transitioned || unknown.request.state !== REQUEST_STATE.OUTCOME_UNKNOWN) {
      failStore('SERVICE_CREDIT_STORE_INVARIANT_VIOLATION');
    }
    const released = model.reconcileRequest({
      ...reference,
      outcome: REQUEST_STATE.FAILED_RELEASED,
    });
    if (!released.transitioned || released.request.state !== REQUEST_STATE.FAILED_RELEASED) {
      failStore('SERVICE_CREDIT_STORE_INVARIANT_VIOLATION');
    }
    return released.request;
  }

  #persistCompound(physicalEnvelope, ledgerState, executionState) {
    this.#assertPersistableState(ledgerState);
    assertCapacity(this.#configuration, ledgerState);
    assertDurableCrossLinks(this.#configuration, ledgerState, executionState);
    if (physicalEnvelope.revision === Number.MAX_SAFE_INTEGER) {
      failStore('SERVICE_CREDIT_STORE_CAPACITY_EXCEEDED');
    }
    const next = physicalEnvelopeFor(
      physicalEnvelope.revision + 1,
      ledgerState,
      executionState,
    );
    assertPhysicalEnvelopeCapacity(this.#configuration, next);
    const updated = this.#database.prepare(
      `UPDATE ${TABLE_NAME} SET envelope = ? WHERE singleton = 1 AND envelope = ?`,
    ).run(canonicalJson(next), canonicalJson(physicalEnvelope));
    if (updated.changes !== 1) failStore('SERVICE_CREDIT_STORE_CORRUPT');
    return next;
  }

  #initializeNew() {
    const model = new InMemoryServiceCreditModel({
      deriveCost: this.#configuration.deriveCost,
      now: this.#configuration.now,
    });
    const state = model.exportState();
    assertCapacity(this.#configuration, state);
    const envelope = physicalEnvelopeFor(0, state, null);
    assertPhysicalEnvelopeCapacity(this.#configuration, envelope);
    this.#runTransaction('create', () => {
      this.#database.exec(`PRAGMA application_id = ${APPLICATION_ID}`);
      this.#database.exec(`PRAGMA user_version = ${SERVICE_CREDIT_SQLITE_SCHEMA_VERSION}`);
      this.#database.exec(TABLE_SQL);
      this.#database.prepare(
        `INSERT INTO ${TABLE_NAME}(singleton, envelope) VALUES (1, ?)`,
      ).run(canonicalJson(envelope));
      this.#validateDatabase();
      this.#readLedger();
      return null;
    });
  }

  #modelOperation(operation, input) {
    return this.#runPublicOperation(() => {
      const outcome = this.#runTransaction(operation, () => {
        this.#validateDatabase();
        const { executionState, physicalEnvelope, model } = this.#readLedger();
        if (executionState !== null && legacyRequestMutation(operation)) {
          failStore('SERVICE_CREDIT_STORE_LEGACY_EXECUTION_MUTATION_BLOCKED');
        }
        const beforeState = model.exportState();
        const beforeCanonical = canonicalJson(beforeState);
        let result;
        let deferredDomainError = null;
        try {
          result = model[operation](input);
        } catch (error) {
          const code = modelErrorCode(error);
          if (code === null) throw error;
          deferredDomainError = fixedModelFailure(code);
        }
        const afterState = model.exportState();
        const afterCanonical = canonicalJson(afterState);
        const changed = beforeCanonical !== afterCanonical;
        if (changed) {
          this.#assertPersistableState(afterState);
          assertCapacity(this.#configuration, afterState);
          if (physicalEnvelope.revision === Number.MAX_SAFE_INTEGER) {
            failStore('SERVICE_CREDIT_STORE_CAPACITY_EXCEEDED');
          }
          assertDurableCrossLinks(this.#configuration, afterState, executionState);
          const next = physicalEnvelopeFor(
            physicalEnvelope.revision + 1,
            afterState,
            executionState,
          );
          assertPhysicalEnvelopeCapacity(this.#configuration, next);
          const updated = this.#database.prepare(
            `UPDATE ${TABLE_NAME} SET envelope = ? WHERE singleton = 1`,
          ).run(canonicalJson(next));
          if (updated.changes !== 1) failStore('SERVICE_CREDIT_STORE_CORRUPT');
        }
        return { changed, deferredDomainError, result };
      });
      if (outcome.deferredDomainError) throw outcome.deferredDomainError;
      return outcome.result;
    });
  }

  #readLedger() {
    try {
      const { envelope, text } = this.#readRawEnvelope();
      if (!exactKeys(envelope, [
        'physicalVersion',
        'revision',
        'ledgerState',
        'executionState',
        'checksum',
      ])) {
        failStore('SERVICE_CREDIT_STORE_CORRUPT');
      }
      if (envelope.physicalVersion !== SERVICE_CREDIT_SQLITE_SCHEMA_VERSION) {
        failStore('SERVICE_CREDIT_STORE_SCHEMA_UNSUPPORTED');
      }
      if (
        !Number.isSafeInteger(envelope.revision)
        || envelope.revision < 0
        || !regexpMatches(CHECKSUM, envelope.checksum ?? '')
      ) {
        failStore('SERVICE_CREDIT_STORE_CORRUPT');
      }
      const { model, normalizedState } = this.#hydrateLedgerState(envelope.ledgerState);
      let normalizedExecutionState = null;
      if (envelope.executionState !== null) {
        normalizedExecutionState = invokeExecutionContract(
          () => hydrateServiceCreditExecutionContract(envelope.executionState),
          true,
        );
      }
      assertDurableCrossLinks(
        this.#configuration,
        normalizedState,
        normalizedExecutionState,
      );
      const normalizedEnvelope = physicalEnvelopeFor(
        envelope.revision,
        normalizedState,
        normalizedExecutionState,
      );
      if (
        canonicalJson(normalizedState) !== canonicalJson(envelope.ledgerState)
        || normalizedEnvelope.checksum !== envelope.checksum
        || canonicalJson(envelope) !== text
      ) {
        failStore('SERVICE_CREDIT_STORE_CORRUPT');
      }
      assertPhysicalEnvelopeCapacity(this.#configuration, normalizedEnvelope);
      return {
        executionState: normalizedExecutionState,
        physicalEnvelope: normalizedEnvelope,
        publicEnvelope: publicEnvelopeFor(envelope.revision, normalizedState),
        model,
      };
    } catch (error) {
      const code = storeErrorCode(error);
      throw storeFailure(code ?? 'SERVICE_CREDIT_STORE_CORRUPT');
    }
  }

  #readLegacyLedger() {
    try {
      const { envelope, text } = this.#readRawEnvelope();
      if (!exactKeys(envelope, ['schemaVersion', 'revision', 'state', 'checksum'])) {
        failStore('SERVICE_CREDIT_STORE_CORRUPT');
      }
      if (envelope.schemaVersion !== LEGACY_SQLITE_SCHEMA_VERSION) {
        failStore('SERVICE_CREDIT_STORE_SCHEMA_UNSUPPORTED');
      }
      if (
        !Number.isSafeInteger(envelope.revision)
        || envelope.revision < 0
        || !regexpMatches(CHECKSUM, envelope.checksum ?? '')
      ) {
        failStore('SERVICE_CREDIT_STORE_CORRUPT');
      }
      const { model, normalizedState } = this.#hydrateLedgerState(envelope.state);
      const normalizedEnvelope = publicEnvelopeFor(envelope.revision, normalizedState);
      if (
        canonicalJson(normalizedState) !== canonicalJson(envelope.state)
        || normalizedEnvelope.checksum !== envelope.checksum
        || canonicalJson(envelope) !== text
      ) {
        failStore('SERVICE_CREDIT_STORE_CORRUPT');
      }
      return { envelope: normalizedEnvelope, model };
    } catch (error) {
      const code = storeErrorCode(error);
      throw storeFailure(code ?? 'SERVICE_CREDIT_STORE_CORRUPT');
    }
  }

  #readRawEnvelope() {
    const countRow = this.#database.prepare(
      `SELECT count(*) AS entries FROM ${TABLE_NAME}`,
    ).get();
    if (countRow?.entries !== 1) failStore('SERVICE_CREDIT_STORE_CORRUPT');
    const sizeRow = this.#database.prepare(
      `SELECT singleton, typeof(envelope) AS kind, length(CAST(envelope AS BLOB)) AS bytes FROM ${TABLE_NAME}`,
    ).get();
    if (
      sizeRow?.singleton !== 1
      || sizeRow?.kind !== 'text'
      || !Number.isSafeInteger(sizeRow?.bytes)
      || sizeRow.bytes < 1
      || sizeRow.bytes
        > this.#configuration.maxStateBytes + MAX_PHYSICAL_ENVELOPE_OVERHEAD_BYTES
    ) {
      failStore('SERVICE_CREDIT_STORE_CORRUPT');
    }
    const text = this.#database.prepare(
      `SELECT envelope FROM ${TABLE_NAME} WHERE singleton = 1`,
    ).get()?.envelope;
    if (typeof text !== 'string' || Buffer.byteLength(text) !== sizeRow.bytes) {
      failStore('SERVICE_CREDIT_STORE_CORRUPT');
    }
    let envelope;
    try {
      envelope = JSON.parse(text);
    } catch {
      failStore('SERVICE_CREDIT_STORE_CORRUPT');
    }
    return { envelope, text };
  }

  #hydrateLedgerState(state) {
    if (
      !isPlainObject(state)
      || !Object.hasOwn(state, 'schemaVersion')
      || !Object.hasOwn(state, 'modelVersion')
      || !Number.isSafeInteger(state.schemaVersion)
      || !Number.isSafeInteger(state.modelVersion)
    ) {
      failStore('SERVICE_CREDIT_STORE_CORRUPT');
    }
    if (
      state.schemaVersion !== SERVICE_CREDIT_STATE_SCHEMA_VERSION
      || state.modelVersion !== SERVICE_CREDIT_MODEL_VERSION
    ) {
      failStore('SERVICE_CREDIT_STORE_SCHEMA_UNSUPPORTED');
    }
    if (
      !Array.isArray(state.offers)
      || !Array.isArray(state.grants)
      || !Array.isArray(state.requests)
    ) {
      failStore('SERVICE_CREDIT_STORE_CORRUPT');
    }
    assertCapacity(this.#configuration, state);
    let model;
    try {
      model = InMemoryServiceCreditModel.fromState({
        deriveCost: context => this.#invokeTrustedCallback(
          this.#configuration.deriveCost,
          [context],
        ),
        now: () => this.#invokeTrustedCallback(this.#configuration.now, []),
      }, state);
    } catch {
      failStore('SERVICE_CREDIT_STORE_CORRUPT');
    }
    return { model, normalizedState: model.exportState() };
  }

  #validateDatabase(expectedVersion = SERVICE_CREDIT_SQLITE_SCHEMA_VERSION) {
    try {
      assertConnectionSettings(this.#database, this.#configuration.busyTimeoutMs);
      const integrityRows = this.#database.prepare('PRAGMA integrity_check').all();
      if (
        integrityRows.length !== 1
        || integrityRows[0]?.integrity_check !== 'ok'
      ) {
        failStore('SERVICE_CREDIT_STORE_CORRUPT');
      }
      if (
        pragmaValue(this.#database, 'PRAGMA application_id', 'application_id') !== APPLICATION_ID
        || pragmaValue(this.#database, 'PRAGMA user_version', 'user_version')
          !== expectedVersion
      ) {
        failStore('SERVICE_CREDIT_STORE_SCHEMA_UNSUPPORTED');
      }
      const schema = this.#database.prepare(
        "SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
      ).all();
      if (
        schema.length !== 1
        || schema[0]?.type !== 'table'
        || schema[0]?.name !== TABLE_NAME
        || schema[0]?.tbl_name !== TABLE_NAME
        || schema[0]?.sql !== TABLE_SQL
      ) {
        failStore('SERVICE_CREDIT_STORE_CORRUPT');
      }
      const columns = this.#database.prepare(`PRAGMA table_xinfo(${TABLE_NAME})`).all();
      if (
        columns.length !== 2
        || columns[0]?.cid !== 0
        || columns[0]?.name !== 'singleton'
        || columns[0]?.type !== 'INTEGER'
        || columns[0]?.notnull !== 0
        || columns[0]?.dflt_value !== null
        || columns[0]?.pk !== 1
        || columns[0]?.hidden !== 0
        || columns[1]?.cid !== 1
        || columns[1]?.name !== 'envelope'
        || columns[1]?.type !== 'TEXT'
        || columns[1]?.notnull !== 1
        || columns[1]?.dflt_value !== null
        || columns[1]?.pk !== 0
        || columns[1]?.hidden !== 0
        || this.#database.prepare('PRAGMA foreign_key_check').all().length !== 0
      ) {
        failStore('SERVICE_CREDIT_STORE_CORRUPT');
      }
      const table = this.#database.prepare('PRAGMA table_list').all()
        .find(row => row?.schema === 'main' && row?.name === TABLE_NAME);
      if (table?.type !== 'table' || table?.ncol !== 2 || table?.wr !== 0 || table?.strict !== 1) {
        failStore('SERVICE_CREDIT_STORE_CORRUPT');
      }
    } catch (error) {
      const code = storeErrorCode(error);
      throw storeFailure(code ?? 'SERVICE_CREDIT_STORE_CORRUPT');
    }
  }

  #runTransaction(operation, body) {
    this.#assertUsable();
    this.#assertFileIdentity();
    let transactionStarted = false;
    let commitAttempted = false;
    let committed = false;
    try {
      this.#invokeHook('beforeBegin', operation, false);
      this.#database.exec('BEGIN IMMEDIATE');
      transactionStarted = true;
      this.#invokeHook('afterBegin', operation, false);
      const value = body();
      const changed = value !== null && typeof value === 'object' && value.changed === true;
      this.#invokeHook('beforeCommit', operation, changed);
      commitAttempted = true;
      this.#database.exec('COMMIT');
      transactionStarted = false;
      committed = true;
      this.#refreshIdentity();
      this.#invokeHook('afterCommit', operation, changed);
      return value;
    } catch (error) {
      if (transactionStarted && this.#database?.isTransaction) {
        try {
          this.#database.exec('ROLLBACK');
          transactionStarted = false;
        } catch {
          this.#quarantine();
          throw storeFailure('SERVICE_CREDIT_STORE_ROLLBACK_FAILED');
        }
      }
      if (committed || commitAttempted) {
        this.#quarantine();
        throw storeFailure('SERVICE_CREDIT_STORE_COMMIT_FAILED');
      }
      const modelCode = modelErrorCode(error);
      if (modelCode !== null) throw fixedModelFailure(modelCode);
      const storeCode = storeErrorCode(error);
      throw storeFailure(storeCode ?? 'SERVICE_CREDIT_STORE_TRANSACTION_FAILED');
    } finally {
      let transactionStillActive = transactionStarted;
      if (!transactionStillActive) {
        try {
          transactionStillActive = this.#database?.isOpen === true
            && this.#database.isTransaction === true;
        } catch {
          transactionStillActive = false;
        }
      }
      if (transactionStillActive) {
        try {
          this.#database.exec('ROLLBACK');
        } catch {
          this.#quarantine();
        }
      }
    }
  }

  #assertPersistableState(state) {
    try {
      const recovered = InMemoryServiceCreditModel.fromState({
        deriveCost: this.#configuration.deriveCost,
        now: this.#configuration.now,
      }, state);
      if (canonicalJson(recovered.exportState()) !== canonicalJson(state)) {
        failStore('SERVICE_CREDIT_STORE_INVARIANT_VIOLATION');
      }
    } catch (error) {
      const code = storeErrorCode(error);
      throw storeFailure(code ?? 'SERVICE_CREDIT_STORE_INVARIANT_VIOLATION');
    }
  }

  #runPublicOperation(operation) {
    if (this.#operationActive) {
      if (this.#callbackActive) this.#callbackReentryAttempted = true;
      throw storeFailure('SERVICE_CREDIT_STORE_REENTRANT_OPERATION');
    }
    this.#operationActive = true;
    try {
      return operation();
    } finally {
      this.#operationActive = false;
    }
  }

  #invokeTrustedCallback(callback, args) {
    if (this.#callbackActive) {
      this.#callbackReentryAttempted = true;
      throw storeFailure('SERVICE_CREDIT_STORE_REENTRANT_OPERATION');
    }
    this.#callbackActive = true;
    this.#callbackReentryAttempted = false;
    let value;
    let failed = false;
    try {
      value = Reflect.apply(callback, undefined, args);
    } catch {
      failed = true;
    }
    const reentered = this.#callbackReentryAttempted;
    this.#callbackActive = false;
    this.#callbackReentryAttempted = false;
    if (failed || reentered) {
      throw storeFailure('SERVICE_CREDIT_STORE_CALLBACK_FAILED');
    }
    return value;
  }

  #invokeHook(name, operation, changed) {
    const hook = this.#configuration.testHooks[name];
    if (!hook) return;
    const value = this.#invokeTrustedCallback(hook, [Object.freeze({ operation, changed })]);
    if (value !== undefined) failStore('SERVICE_CREDIT_STORE_TEST_HOOK_FAILED');
  }

  #assertUsable() {
    if (this.#closed) failStore('SERVICE_CREDIT_STORE_CLOSED');
    if (this.#quarantined || !this.#database?.isOpen) {
      failStore('SERVICE_CREDIT_STORE_QUARANTINED');
    }
  }

  #assertFileIdentity() {
    try {
      validatePathBoundary(this.#configuration);
      rejectWalSidecars(this.#configuration);
      const current = lstatSync(this.#configuration.databasePath, { bigint: true });
      if (
        !safeDatabaseFile(current, process.getuid())
        || !sameIdentity(this.#identity, current)
        || realpathSync(this.#configuration.databasePath) !== this.#configuration.databasePath
      ) {
        failStore('SERVICE_CREDIT_STORE_UNSAFE_FILE');
      }
    } catch (error) {
      const code = storeErrorCode(error);
      throw storeFailure(code ?? 'SERVICE_CREDIT_STORE_UNSAFE_FILE');
    }
  }

  #refreshIdentity() {
    this.#assertFileIdentity();
    this.#identity = lstatSync(this.#configuration.databasePath, { bigint: true });
  }

  #quarantine() {
    this.#quarantined = true;
    this.#closeAfterFailure();
  }

  #closeAfterFailure() {
    try { this.#database?.close(); } catch {}
    this.#closed = true;
  }
}

export function createServiceCreditSqliteStore(options) {
  return ServiceCreditSqliteStore.create(options);
}

export function openServiceCreditSqliteStore(options) {
  return ServiceCreditSqliteStore.openExisting(options);
}

export function migrateServiceCreditSqliteStore(options) {
  return ServiceCreditSqliteStore.migrateExisting(options);
}
