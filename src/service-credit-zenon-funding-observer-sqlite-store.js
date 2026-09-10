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
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { types as utilTypes } from 'node:util';
import {
  applyZenonFundingInclusionObservation,
  applyZenonFundingObserverPage,
  parseZenonFundingObserverState,
  planZenonFundingObserverBackfill,
  projectZenonFundingObservationCandidate,
  serializeZenonFundingObserverState,
  ZENON_FUNDING_OBSERVER_STATE_SCHEMA_VERSION,
  ZenonFundingObserverStateError,
} from './service-credit-zenon-funding-observer-state.js';

export const ZENON_FUNDING_OBSERVER_SQLITE_STORE_SCHEMA_VERSION = 1;

const APPLICATION_ID = 0x5a464f53;
const TABLE_NAME = 'zenon_funding_observer_state';
const INDEX_NAME = 'zenon_funding_observer_state_record_key';
const TABLE_SQL = 'CREATE TABLE zenon_funding_observer_state(singleton INTEGER PRIMARY KEY CHECK(singleton = 1), record_key TEXT NOT NULL, envelope TEXT NOT NULL) STRICT';
const INDEX_SQL = 'CREATE UNIQUE INDEX zenon_funding_observer_state_record_key ON zenon_funding_observer_state(record_key)';
const RECORD_KEY_DOMAIN = 'zenon-x402:funding-observer-sqlite-record-v1';
const ENVELOPE_DOMAIN = 'zenon-x402:funding-observer-sqlite-envelope-v1';
const ENVELOPE_VERSION = 1;
const DEFAULT_BUSY_TIMEOUT_MS = 5_000;
const MAX_BUSY_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_STATE_BYTES = 512 * 1024;
const HARD_MAX_STATE_BYTES = 1024 * 1024;
const MAX_ENVELOPE_OVERHEAD_BYTES = 4_096;
const RECORD_KEY_BYTES = 71;
const MAX_INPUT_NODES = 16_384;
const MAX_INPUT_MEMBERS = 16_384;
const MAX_INPUT_KEY_BYTES = 64 * 1024;
const MAX_INPUT_STRING_BYTES = 512 * 1024;
const MAX_ARRAY_LENGTH = 8_192;
const MAX_DEPTH = 32;
const CHECKSUM = /^sha256:[0-9a-f]{64}$/;
const CONSTRUCTOR_TOKEN = Symbol('ZenonFundingObserverSqliteStore');

const ARRAY_IS_ARRAY = Array.isArray;
const BUFFER_BYTE_LENGTH = Buffer.byteLength;
const JSON_PARSE = JSON.parse;
const JSON_STRINGIFY = JSON.stringify;
const NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;
const OBJECT_CREATE = Object.create;
const OBJECT_DEFINE_PROPERTY = Object.defineProperty;
const OBJECT_FREEZE = Object.freeze;
const OBJECT_HAS_OWN = Object.hasOwn;
const OBJECT_KEYS = Object.keys;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_APPLY = Reflect.apply;
const REFLECT_GET_OWN_PROPERTY_DESCRIPTOR = Reflect.getOwnPropertyDescriptor;
const REFLECT_GET_PROTOTYPE_OF = Reflect.getPrototypeOf;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const ARRAY_SORT = Array.prototype.sort;
const STRING_STARTS_WITH = String.prototype.startsWith;
const IS_PROXY = utilTypes.isProxy;

export class ZenonFundingObserverSqliteStoreError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ZenonFundingObserverSqliteStoreError';
    this.code = code;
    this.stack = `ZenonFundingObserverSqliteStoreError: ${code}`;
  }
}

function failure(code) {
  return new ZenonFundingObserverSqliteStoreError(code);
}

function fail(code) {
  throw failure(code);
}

function storeErrorCode(error) {
  try {
    if (!(error instanceof ZenonFundingObserverSqliteStoreError)) return null;
    const descriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(error, 'code');
    return descriptor && OBJECT_HAS_OWN(descriptor, 'value')
      && typeof descriptor.value === 'string'
      ? descriptor.value
      : null;
  } catch {
    return null;
  }
}

function observerErrorCode(error) {
  try {
    if (!(error instanceof ZenonFundingObserverStateError)) return null;
    const descriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(error, 'code');
    return descriptor && OBJECT_HAS_OWN(descriptor, 'value')
      && typeof descriptor.value === 'string'
      ? descriptor.value
      : null;
  } catch {
    return null;
  }
}

function byteLength(value) {
  return REFLECT_APPLY(BUFFER_BYTE_LENGTH, Buffer, [value, 'utf8']);
}

function hashCommitment(domain, value) {
  return `sha256:${createHash('sha256')
    .update(domain)
    .update('\0')
    .update(canonicalJson(value))
    .digest('hex')}`;
}

function isPlainObject(value) {
  return value !== null
    && typeof value === 'object'
    && !IS_PROXY(value)
    && !ARRAY_IS_ARRAY(value)
    && REFLECT_GET_PROTOTYPE_OF(value) === OBJECT_PROTOTYPE;
}

function exactDataObject(value, requiredKeys, optionalKeys = [], code = 'ZENON_FUNDING_OBSERVER_STORE_INVALID_CONFIGURATION') {
  try {
    if (!isPlainObject(value)) fail(code);
    const keys = REFLECT_OWN_KEYS(value);
    if (keys.length < requiredKeys.length || keys.length > requiredKeys.length + optionalKeys.length) {
      fail(code);
    }
    const allowed = new Set([...requiredKeys, ...optionalKeys]);
    const captured = OBJECT_CREATE(null);
    for (const key of keys) {
      if (typeof key !== 'string' || !allowed.has(key)) fail(code);
      const descriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(value, key);
      if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) fail(code);
      OBJECT_DEFINE_PROPERTY(captured, key, {
        configurable: false,
        enumerable: true,
        value: descriptor.value,
        writable: false,
      });
    }
    for (const key of requiredKeys) {
      if (!OBJECT_HAS_OWN(captured, key)) fail(code);
    }
    return captured;
  } catch (error) {
    const known = storeErrorCode(error);
    throw failure(known ?? code);
  }
}

function addBudget(budget, key, amount, maximum) {
  budget[key] += amount;
  if (budget[key] > maximum) fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
}

function snapshotValue(input, budget, seen, depth) {
  if (depth > MAX_DEPTH) fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
  addBudget(budget, 'nodes', 1, MAX_INPUT_NODES);
  if (input === null || typeof input === 'boolean') return input;
  if (typeof input === 'string') {
    if (input.length > MAX_INPUT_STRING_BYTES) {
      fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
    }
    addBudget(budget, 'stringBytes', byteLength(input), MAX_INPUT_STRING_BYTES);
    return input;
  }
  if (typeof input === 'number') {
    if (!NUMBER_IS_SAFE_INTEGER(input)) fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
    return Object.is(input, -0) ? 0 : input;
  }
  if (
    typeof input !== 'object'
    || IS_PROXY(input)
    || seen.has(input)
    || (
      !ARRAY_IS_ARRAY(input)
      && REFLECT_GET_PROTOTYPE_OF(input) !== OBJECT_PROTOTYPE
    )
  ) {
    fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
  }
  seen.add(input);
  if (ARRAY_IS_ARRAY(input)) {
    const lengthDescriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(input, 'length');
    if (
      !lengthDescriptor
      || !OBJECT_HAS_OWN(lengthDescriptor, 'value')
      || !NUMBER_IS_SAFE_INTEGER(lengthDescriptor.value)
      || lengthDescriptor.value < 0
      || lengthDescriptor.value > MAX_ARRAY_LENGTH
    ) {
      fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
    }
    const keys = REFLECT_OWN_KEYS(input);
    if (keys.length !== lengthDescriptor.value + 1) {
      fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
    }
    addBudget(budget, 'members', lengthDescriptor.value, MAX_INPUT_MEMBERS);
    const output = [];
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const key = `${index}`;
      const descriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(input, key);
      if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) {
        fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
      }
      OBJECT_DEFINE_PROPERTY(output, key, {
        configurable: true,
        enumerable: true,
        value: snapshotValue(descriptor.value, budget, seen, depth + 1),
        writable: true,
      });
    }
    return output;
  }
  const keys = REFLECT_OWN_KEYS(input);
  addBudget(budget, 'members', keys.length, MAX_INPUT_MEMBERS);
  const output = {};
  for (const key of keys) {
    if (typeof key !== 'string' || key.length > MAX_INPUT_KEY_BYTES) {
      fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
    }
    addBudget(budget, 'keyBytes', byteLength(key), MAX_INPUT_KEY_BYTES);
    const descriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(input, key);
    if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) {
      fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
    }
    OBJECT_DEFINE_PROPERTY(output, key, {
      configurable: true,
      enumerable: true,
      value: snapshotValue(descriptor.value, budget, seen, depth + 1),
      writable: true,
    });
  }
  return output;
}

function snapshotJson(input) {
  try {
    return snapshotValue(input, {
      keyBytes: 0,
      members: 0,
      nodes: 0,
      stringBytes: 0,
    }, new WeakSet(), 0);
  } catch (error) {
    const known = storeErrorCode(error);
    throw failure(known ?? 'ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
  }
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

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return OBJECT_FREEZE(value);
}

function cloneTrusted(value) {
  return deepFreeze(REFLECT_APPLY(JSON_PARSE, JSON, [canonicalJson(value)]));
}

function validDigest(value) {
  return typeof value === 'string' && CHECKSUM.test(value);
}

function recordKeyFor(state) {
  return hashCommitment(RECORD_KEY_DOMAIN, {
    storeSchemaVersion: ZENON_FUNDING_OBSERVER_SQLITE_STORE_SCHEMA_VERSION,
    observerRecordId: state.observerRecordId,
    targetBindingDigest: state.targetBindingDigest,
  });
}

export function deriveZenonFundingObserverSqliteRecordKey(initialState) {
  try {
    const stateBytes = serializeZenonFundingObserverState(initialState);
    if (
      stateBytes.length === 0
      || stateBytes.length > HARD_MAX_STATE_BYTES
      || byteLength(stateBytes) > HARD_MAX_STATE_BYTES
    ) {
      fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
    }
    return recordKeyFor(parseZenonFundingObserverState(stateBytes));
  } catch (error) {
    const known = storeErrorCode(error);
    throw failure(known ?? 'ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
  }
}

function envelopeFor(recordKey, stateBytes, observerRevision) {
  const withoutChecksum = {
    envelopeVersion: ENVELOPE_VERSION,
    observerRevision,
    observerStateSchemaVersion: ZENON_FUNDING_OBSERVER_STATE_SCHEMA_VERSION,
    recordKey,
    stateBytes,
  };
  return {
    ...withoutChecksum,
    checksum: hashCommitment(ENVELOPE_DOMAIN, withoutChecksum),
  };
}

function captureHooks(input) {
  if (input === undefined) return OBJECT_FREEZE({});
  const hooks = exactDataObject(input, [], [
    'beforeBegin',
    'afterBegin',
    'beforeWrite',
    'afterWrite',
    'beforeCommit',
    'commitAttempt',
    'afterCommit',
  ]);
  const captured = {};
  for (const key of OBJECT_KEYS(hooks)) {
    if (typeof hooks[key] !== 'function') {
      fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_CONFIGURATION');
    }
    captured[key] = hooks[key];
  }
  return OBJECT_FREEZE(captured);
}

function boundedInteger(value, minimum, maximum) {
  return NUMBER_IS_SAFE_INTEGER(value) && value >= minimum && value <= maximum;
}

function captureCommon(value) {
  if (
    typeof value.databasePath !== 'string'
    || typeof value.allowedRoot !== 'string'
    || !isAbsolute(value.databasePath)
    || !isAbsolute(value.allowedRoot)
  ) {
    fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_CONFIGURATION');
  }
  const databasePath = resolve(value.databasePath);
  const allowedRoot = resolve(value.allowedRoot);
  if (databasePath !== value.databasePath || allowedRoot !== value.allowedRoot) {
    fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_CONFIGURATION');
  }
  const busyTimeoutMs = value.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS;
  const maxStateBytes = value.maxStateBytes ?? DEFAULT_MAX_STATE_BYTES;
  if (
    !boundedInteger(busyTimeoutMs, 1, MAX_BUSY_TIMEOUT_MS)
    || !boundedInteger(maxStateBytes, 4_096, HARD_MAX_STATE_BYTES)
  ) {
    fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_CONFIGURATION');
  }
  return {
    allowedRoot,
    busyTimeoutMs,
    databasePath,
    maxStateBytes,
    testHooks: captureHooks(value.testHooks),
  };
}

function captureCreateConfiguration(options) {
  const value = exactDataObject(options, [
    'databasePath',
    'allowedRoot',
    'initialState',
  ], ['busyTimeoutMs', 'maxStateBytes', 'testHooks']);
  const common = captureCommon(value);
  let state;
  try {
    const stateBytes = serializeZenonFundingObserverState(value.initialState);
    if (byteLength(stateBytes) > common.maxStateBytes) {
      fail('ZENON_FUNDING_OBSERVER_STORE_CAPACITY_EXCEEDED');
    }
    state = parseZenonFundingObserverState(stateBytes);
  } catch (error) {
    const known = storeErrorCode(error);
    throw failure(known ?? 'ZENON_FUNDING_OBSERVER_STORE_INVALID_CONFIGURATION');
  }
  return OBJECT_FREEZE({ ...common, initialState: state });
}

function captureOpenConfiguration(options) {
  const value = exactDataObject(options, [
    'databasePath',
    'allowedRoot',
    'expectedRecordKey',
  ], ['busyTimeoutMs', 'maxStateBytes', 'testHooks']);
  const common = captureCommon(value);
  if (!validDigest(value.expectedRecordKey)) {
    fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_CONFIGURATION');
  }
  return OBJECT_FREEZE({ ...common, expectedRecordKey: value.expectedRecordKey });
}

function within(root, candidate) {
  const fromRoot = relative(root, candidate);
  return fromRoot === '' || (
    fromRoot !== '..'
    && !REFLECT_APPLY(STRING_STARTS_WITH, fromRoot, [`..${sep}`])
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

function sameGeneration(left, right) {
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
      fail('ZENON_FUNDING_OBSERVER_STORE_UNSAFE_DIRECTORY');
    }
    const uid = process.getuid();
    if (!NUMBER_IS_SAFE_INTEGER(uid) || uid < 0) {
      fail('ZENON_FUNDING_OBSERVER_STORE_UNSAFE_DIRECTORY');
    }
    const parent = dirname(configuration.databasePath);
    if (
      configuration.databasePath === configuration.allowedRoot
      || !within(configuration.allowedRoot, configuration.databasePath)
      || !within(configuration.allowedRoot, parent)
    ) {
      fail('ZENON_FUNDING_OBSERVER_STORE_PATH_OUTSIDE_ALLOWED_ROOT');
    }
    const fromRoot = relative(configuration.allowedRoot, parent);
    const components = fromRoot === '' ? [] : fromRoot.split(sep);
    let current = configuration.allowedRoot;
    for (const component of ['', ...components]) {
      if (component !== '') current = resolve(current, component);
      const stat = lstatSync(current, { bigint: true });
      if (!privateDirectory(stat, uid) || realpathSync(current) !== current) {
        fail('ZENON_FUNDING_OBSERVER_STORE_UNSAFE_DIRECTORY');
      }
    }
    if (!within(realpathSync(configuration.allowedRoot), realpathSync(parent))) {
      fail('ZENON_FUNDING_OBSERVER_STORE_PATH_OUTSIDE_ALLOWED_ROOT');
    }
    return { uid };
  } catch (error) {
    const known = storeErrorCode(error);
    throw failure(known ?? 'ZENON_FUNDING_OBSERVER_STORE_UNSAFE_DIRECTORY');
  }
}

function inspectSidecars(configuration, uid, creating = false) {
  try {
    const parent = dirname(configuration.databasePath);
    const basename = configuration.databasePath.slice(parent.length + 1);
    let hotJournal = false;
    for (const entry of readdirSync(parent)) {
      if (!REFLECT_APPLY(STRING_STARTS_WITH, entry, [`${basename}-`])) continue;
      if (creating || entry !== `${basename}-journal`) {
        fail('ZENON_FUNDING_OBSERVER_STORE_UNEXPECTED_SIDECAR');
      }
      const stat = lstatSync(resolve(parent, entry), { bigint: true });
      if (!safeDatabaseFile(stat, uid)) {
        fail('ZENON_FUNDING_OBSERVER_STORE_UNSAFE_FILE');
      }
      hotJournal = true;
    }
    return hotJournal;
  } catch (error) {
    const known = storeErrorCode(error);
    throw failure(known ?? 'ZENON_FUNDING_OBSERVER_STORE_UNSAFE_FILE');
  }
}

function createExclusiveDatabaseFile(configuration, boundary) {
  let descriptor;
  try {
    const { O_CLOEXEC = 0, O_CREAT, O_EXCL, O_NOFOLLOW = 0, O_RDWR } = fsConstants;
    if (O_NOFOLLOW === 0) fail('ZENON_FUNDING_OBSERVER_STORE_UNSAFE_FILE');
    descriptor = openSync(
      configuration.databasePath,
      O_RDWR | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC,
      0o600,
    );
    fchmodSync(descriptor, 0o600);
    const opened = fstatSync(descriptor, { bigint: true });
    if (!safeDatabaseFile(opened, boundary.uid)) {
      fail('ZENON_FUNDING_OBSERVER_STORE_UNSAFE_FILE');
    }
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    const current = lstatSync(configuration.databasePath, { bigint: true });
    if (!safeDatabaseFile(current, boundary.uid) || !sameGeneration(opened, current)) {
      fail('ZENON_FUNDING_OBSERVER_STORE_UNSAFE_FILE');
    }
    return current;
  } catch (error) {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch {}
    }
    const known = storeErrorCode(error);
    if (known !== null) throw failure(known);
    let exists = false;
    try {
      const descriptorCode = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(error, 'code');
      exists = descriptorCode && OBJECT_HAS_OWN(descriptorCode, 'value')
        && descriptorCode.value === 'EEXIST';
    } catch {}
    throw failure(exists
      ? 'ZENON_FUNDING_OBSERVER_STORE_ALREADY_EXISTS'
      : 'ZENON_FUNDING_OBSERVER_STORE_CREATE_FAILED');
  }
}

function inspectExistingDatabaseFile(configuration, boundary) {
  try {
    const stat = lstatSync(configuration.databasePath, { bigint: true });
    if (
      !safeDatabaseFile(stat, boundary.uid)
      || realpathSync(configuration.databasePath) !== configuration.databasePath
    ) {
      fail('ZENON_FUNDING_OBSERVER_STORE_UNSAFE_FILE');
    }
    return stat;
  } catch (error) {
    const known = storeErrorCode(error);
    if (known !== null) throw failure(known);
    let missing = false;
    try {
      const descriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(error, 'code');
      missing = descriptor && OBJECT_HAS_OWN(descriptor, 'value')
        && descriptor.value === 'ENOENT';
    } catch {}
    if (missing) fail('ZENON_FUNDING_OBSERVER_STORE_MISSING');
    fail('ZENON_FUNDING_OBSERVER_STORE_UNSAFE_FILE');
  }
}

function pragmaValue(database, sql, field) {
  return database.prepare(sql).get()?.[field];
}

function assertConnection(database, busyTimeoutMs) {
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
    fail('ZENON_FUNDING_OBSERVER_STORE_CONFIGURATION_FAILED');
  }
}

function configureConnection(database, configuration, creating) {
  try {
    database.exec(`PRAGMA busy_timeout = ${configuration.busyTimeoutMs}`);
    const mode = pragmaValue(
      database,
      creating ? 'PRAGMA journal_mode = DELETE' : 'PRAGMA journal_mode',
      'journal_mode',
    );
    if (mode !== 'delete') fail('ZENON_FUNDING_OBSERVER_STORE_SCHEMA_UNSUPPORTED');
    database.exec('PRAGMA synchronous = FULL');
    database.exec('PRAGMA foreign_keys = ON');
    database.exec('PRAGMA trusted_schema = OFF');
    database.exec('PRAGMA recursive_triggers = OFF');
    if (process.platform === 'darwin') database.exec('PRAGMA fullfsync = ON');
    assertConnection(database, configuration.busyTimeoutMs);
  } catch (error) {
    const known = storeErrorCode(error);
    throw failure(known ?? 'ZENON_FUNDING_OBSERVER_STORE_CONFIGURATION_FAILED');
  }
}

function openDatabase(configuration, before, creating, boundary) {
  let database;
  try {
    const hotJournal = inspectSidecars(configuration, boundary.uid, creating);
    database = new DatabaseSync(configuration.databasePath, {
      allowExtension: false,
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true,
      readOnly: false,
      timeout: configuration.busyTimeoutMs,
    });
    const after = lstatSync(configuration.databasePath, { bigint: true });
    if (
      !safeDatabaseFile(after, boundary.uid)
      || (hotJournal ? !sameIdentity(before, after) : !sameGeneration(before, after))
    ) {
      fail('ZENON_FUNDING_OBSERVER_STORE_UNSAFE_FILE');
    }
    configureConnection(database, configuration, creating);
    return database;
  } catch (error) {
    try { database?.close(); } catch {}
    const known = storeErrorCode(error);
    throw failure(known ?? (creating
      ? 'ZENON_FUNDING_OBSERVER_STORE_OPEN_FAILED'
      : 'ZENON_FUNDING_OBSERVER_STORE_CORRUPT'));
  }
}

function mapObserverFailure(error, persisted = false) {
  const code = observerErrorCode(error);
  if (code === null) {
    throw failure(persisted
      ? 'ZENON_FUNDING_OBSERVER_STORE_CORRUPT'
      : 'ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
  }
  if (code === 'ZENON_FUNDING_OBSERVER_STALE_REVISION') {
    throw failure('ZENON_FUNDING_OBSERVER_STORE_STALE_REVISION');
  }
  throw failure(persisted
    ? 'ZENON_FUNDING_OBSERVER_STORE_CORRUPT'
    : 'ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
}

function captureExpectedRevision(value) {
  if (!NUMBER_IS_SAFE_INTEGER(value) || value < 0) {
    fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
  }
  return value;
}

function publicRecord(recordKey, state) {
  return deepFreeze({
    storeSchemaVersion: ZENON_FUNDING_OBSERVER_SQLITE_STORE_SCHEMA_VERSION,
    recordKey,
    state: cloneTrusted(state),
  });
}

function publicTransition(state, disposition) {
  return deepFreeze({ state: cloneTrusted(state), disposition });
}

export class ZenonFundingObserverSqliteStore {
  #configuration;
  #database;
  #identity;
  #recordKey;
  #closed = false;
  #quarantined = false;
  #operationActive = false;
  #hookActive = false;
  #hookReentry = false;

  constructor(token, configuration, database, identity, recordKey) {
    if (token !== CONSTRUCTOR_TOKEN) {
      fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_CONFIGURATION');
    }
    if (!validDigest(recordKey)) {
      fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_CONFIGURATION');
    }
    this.#configuration = configuration;
    this.#database = database;
    this.#identity = identity;
    this.#recordKey = recordKey;
  }

  static create(options) {
    const configuration = captureCreateConfiguration(options);
    const recordKey = deriveZenonFundingObserverSqliteRecordKey(configuration.initialState);
    const boundary = validatePathBoundary(configuration);
    inspectSidecars(configuration, boundary.uid, true);
    const before = createExclusiveDatabaseFile(configuration, boundary);
    const database = openDatabase(configuration, before, true, boundary);
    const store = new ZenonFundingObserverSqliteStore(
      CONSTRUCTOR_TOKEN,
      configuration,
      database,
      before,
      recordKey,
    );
    try {
      store.#initialize();
      return store;
    } catch (error) {
      store.#closeAfterFailure();
      const known = storeErrorCode(error);
      throw failure(known ?? 'ZENON_FUNDING_OBSERVER_STORE_CREATE_FAILED');
    }
  }

  static openExisting(options) {
    const configuration = captureOpenConfiguration(options);
    const boundary = validatePathBoundary(configuration);
    const before = inspectExistingDatabaseFile(configuration, boundary);
    const database = openDatabase(configuration, before, false, boundary);
    const store = new ZenonFundingObserverSqliteStore(
      CONSTRUCTOR_TOKEN,
      configuration,
      database,
      before,
      configuration.expectedRecordKey,
    );
    try {
      const loaded = store.#readCommitted();
      if (loaded.recordKey !== configuration.expectedRecordKey) {
        fail('ZENON_FUNDING_OBSERVER_STORE_RECORD_KEY_MISMATCH');
      }
      store.#refreshIdentity();
      return store;
    } catch (error) {
      store.#closeAfterFailure();
      const known = storeErrorCode(error);
      throw failure(known ?? 'ZENON_FUNDING_OBSERVER_STORE_OPEN_FAILED');
    }
  }

  load() {
    return this.#runPublic(() => {
      const loaded = this.#safeRead();
      return publicRecord(loaded.recordKey, loaded.state);
    });
  }

  planBackfill(input) {
    const captured = exactDataObject(input, ['expectedRevision', 'frontier'], [],
      'ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
    const expectedRevision = captureExpectedRevision(captured.expectedRevision);
    const frontier = snapshotJson(captured.frontier);
    return this.#runPublic(() => {
      const loaded = this.#safeRead();
      if (loaded.state.revision !== expectedRevision) {
        fail('ZENON_FUNDING_OBSERVER_STORE_STALE_REVISION');
      }
      const outcome = this.#derivePlanOutcome(loaded, expectedRevision, frontier);
      if (canonicalJson(outcome.state) !== canonicalJson(loaded.state)) {
        if (outcome.disposition !== 'QUARANTINED' || outcome.plan !== null) {
          fail('ZENON_FUNDING_OBSERVER_STORE_INVARIANT_VIOLATION');
        }
        return this.#persistPlanningQuarantine(expectedRevision, frontier);
      }
      return cloneTrusted(outcome);
    });
  }

  applyPage(input) {
    const captured = exactDataObject(input, ['expectedRevision', 'plan', 'momentums'], [],
      'ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
    const expectedRevision = captureExpectedRevision(captured.expectedRevision);
    const plan = snapshotJson(captured.plan);
    const momentums = snapshotJson(captured.momentums);
    return this.#mutate('applyPage', expectedRevision, loaded => {
      if (
        plan.observerRecordId !== loaded.state.observerRecordId
        || plan.targetBindingDigest !== loaded.state.targetBindingDigest
        || canonicalJson(plan.authorityGeneration) !== canonicalJson(loaded.state.authorityGeneration)
        || canonicalJson(plan.chainProfile) !== canonicalJson(loaded.state.chainProfile)
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CONTEXT_MISMATCH');
      }
      const page = {
        pageVersion: 1,
        observerRecordId: loaded.state.observerRecordId,
        targetBindingDigest: loaded.state.targetBindingDigest,
        authorityGeneration: cloneTrusted(loaded.state.authorityGeneration),
        chainProfile: cloneTrusted(loaded.state.chainProfile),
        planId: plan.planId,
        startCheckpoint: cloneTrusted(plan.startCheckpoint),
        frontier: cloneTrusted(plan.frontier),
        entries: cloneTrusted(momentums),
      };
      try {
        return applyZenonFundingObserverPage({
          state: cloneTrusted(loaded.state),
          expectedRevision,
          plan: cloneTrusted(plan),
          page,
        });
      } catch (error) {
        mapObserverFailure(error, false);
      }
    });
  }

  applyInclusion(input) {
    const captured = exactDataObject(input, [
      'expectedRevision',
      'target',
      'observation',
    ], [], 'ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
    const expectedRevision = captureExpectedRevision(captured.expectedRevision);
    const target = snapshotJson(captured.target);
    const observation = snapshotJson(captured.observation);
    return this.#mutate('applyInclusion', expectedRevision, loaded => {
      if (canonicalJson(target) !== canonicalJson(loaded.state.target)) {
        fail('ZENON_FUNDING_OBSERVER_STORE_TARGET_MISMATCH');
      }
      try {
        return applyZenonFundingInclusionObservation({
          state: cloneTrusted(loaded.state),
          expectedRevision,
          observerRecordId: loaded.state.observerRecordId,
          targetBindingDigest: loaded.state.targetBindingDigest,
          authorityGeneration: cloneTrusted(loaded.state.authorityGeneration),
          chainProfile: cloneTrusted(loaded.state.chainProfile),
          observation: cloneTrusted(observation),
        });
      } catch (error) {
        mapObserverFailure(error, false);
      }
    });
  }

  projectCommittedCandidate() {
    return this.#runPublic(() => {
      const loaded = this.#safeRead();
      let candidate;
      try {
        candidate = projectZenonFundingObservationCandidate(cloneTrusted(loaded.state));
      } catch (error) {
        mapObserverFailure(error, true);
      }
      return candidate === null ? null : cloneTrusted(candidate);
    });
  }

  close() {
    if (this.#closed) return;
    if (this.#operationActive) {
      if (this.#hookActive) this.#hookReentry = true;
      fail('ZENON_FUNDING_OBSERVER_STORE_REENTRANT_OPERATION');
    }
    this.#operationActive = true;
    try {
      this.#database.close();
      this.#closed = true;
    } catch {
      this.#quarantined = true;
      this.#closeAfterFailure();
      throw failure('ZENON_FUNDING_OBSERVER_STORE_CLOSE_FAILED');
    } finally {
      this.#operationActive = false;
    }
  }

  #initialize() {
    const stateBytes = serializeZenonFundingObserverState(this.#configuration.initialState);
    const recordKey = recordKeyFor(this.#configuration.initialState);
    const envelope = envelopeFor(
      recordKey,
      stateBytes,
      this.#configuration.initialState.revision,
    );
    this.#assertEnvelopeCapacity(envelope);
    this.#runTransaction('create', () => {
      this.#database.exec(`PRAGMA application_id = ${APPLICATION_ID}`);
      this.#database.exec(
        `PRAGMA user_version = ${ZENON_FUNDING_OBSERVER_SQLITE_STORE_SCHEMA_VERSION}`,
      );
      this.#database.exec(TABLE_SQL);
      this.#database.exec(INDEX_SQL);
      this.#database.prepare(
        `INSERT INTO ${TABLE_NAME}(singleton, record_key, envelope) VALUES (1, ?, ?)`,
      ).run(recordKey, canonicalJson(envelope));
      this.#validateDatabase();
      const loaded = this.#readRecord();
      if (loaded.recordKey !== recordKey || loaded.stateBytes !== stateBytes) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
      return { changed: true, recordKey, stateBytes };
    }, outcome => {
      const loaded = this.#readRecord();
      if (loaded.recordKey !== outcome.recordKey || loaded.stateBytes !== outcome.stateBytes) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
      return null;
    });
  }

  #mutate(operation, expectedRevision, transition) {
    return this.#runPublic(() => this.#runTransaction(operation, () => {
      this.#validateDatabase();
      const loaded = this.#readRecord();
      if (loaded.state.revision !== expectedRevision) {
        fail('ZENON_FUNDING_OBSERVER_STORE_STALE_REVISION');
      }
      const outcome = transition(loaded);
      if (
        outcome === null
        || typeof outcome !== 'object'
        || typeof outcome.disposition !== 'string'
        || outcome.state === null
        || typeof outcome.state !== 'object'
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_INVARIANT_VIOLATION');
      }
      let nextStateBytes;
      try {
        nextStateBytes = serializeZenonFundingObserverState(outcome.state);
      } catch (error) {
        mapObserverFailure(error, true);
      }
      if (byteLength(nextStateBytes) > this.#configuration.maxStateBytes) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CAPACITY_EXCEEDED');
      }
      const changed = nextStateBytes !== loaded.stateBytes;
      let expectedEnvelopeText = loaded.envelopeText;
      if (changed) {
        this.#invokeHook('beforeWrite', operation, true);
        const nextEnvelope = envelopeFor(
          loaded.recordKey,
          nextStateBytes,
          outcome.state.revision,
        );
        this.#assertEnvelopeCapacity(nextEnvelope);
        expectedEnvelopeText = canonicalJson(nextEnvelope);
        const updated = this.#database.prepare(
          `UPDATE ${TABLE_NAME} SET envelope = ? WHERE singleton = 1 AND record_key = ? AND envelope = ?`,
        ).run(expectedEnvelopeText, loaded.recordKey, loaded.envelopeText);
        if (updated.changes !== 1) {
          fail('ZENON_FUNDING_OBSERVER_STORE_CONCURRENT_CONFLICT');
        }
        this.#invokeHook('afterWrite', operation, true);
      }
      return {
        changed,
        disposition: outcome.disposition,
        expectedEnvelopeText,
        expectedStateBytes: nextStateBytes,
        recordKey: loaded.recordKey,
      };
    }, transactionResult => {
      this.#validateDatabase();
      const committed = this.#readRecord();
      if (
        committed.recordKey !== transactionResult.recordKey
        || committed.stateBytes !== transactionResult.expectedStateBytes
        || committed.envelopeText !== transactionResult.expectedEnvelopeText
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
      return publicTransition(committed.state, transactionResult.disposition);
    }));
  }

  #derivePlanOutcome(loaded, expectedRevision, frontier) {
    try {
      return planZenonFundingObserverBackfill({
        state: cloneTrusted(loaded.state),
        expectedRevision,
        observerRecordId: loaded.state.observerRecordId,
        targetBindingDigest: loaded.state.targetBindingDigest,
        authorityGeneration: cloneTrusted(loaded.state.authorityGeneration),
        chainProfile: cloneTrusted(loaded.state.chainProfile),
        source: {
          status: 'AVAILABLE',
          frontier: cloneTrusted(frontier),
          checkpointHash: frontier.height < loaded.state.checkpoint.height
            ? null
            : loaded.state.checkpoint.hash,
        },
      });
    } catch (error) {
      mapObserverFailure(error, false);
    }
  }

  #persistPlanningQuarantine(expectedRevision, frontier) {
    return this.#runTransaction('planBackfill', () => {
      this.#validateDatabase();
      const loaded = this.#readRecord();
      if (loaded.state.revision !== expectedRevision) {
        fail('ZENON_FUNDING_OBSERVER_STORE_STALE_REVISION');
      }
      const outcome = this.#derivePlanOutcome(loaded, expectedRevision, frontier);
      let nextStateBytes;
      try {
        nextStateBytes = serializeZenonFundingObserverState(outcome.state);
      } catch (error) {
        mapObserverFailure(error, true);
      }
      if (
        outcome.disposition !== 'QUARANTINED'
        || outcome.plan !== null
        || nextStateBytes === loaded.stateBytes
        || byteLength(nextStateBytes) > this.#configuration.maxStateBytes
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_INVARIANT_VIOLATION');
      }
      this.#invokeHook('beforeWrite', 'planBackfill', true);
      const nextEnvelope = envelopeFor(
        loaded.recordKey,
        nextStateBytes,
        outcome.state.revision,
      );
      this.#assertEnvelopeCapacity(nextEnvelope);
      const expectedEnvelopeText = canonicalJson(nextEnvelope);
      const updated = this.#database.prepare(
        `UPDATE ${TABLE_NAME} SET envelope = ? WHERE singleton = 1 AND record_key = ? AND envelope = ?`,
      ).run(expectedEnvelopeText, loaded.recordKey, loaded.envelopeText);
      if (updated.changes !== 1) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CONCURRENT_CONFLICT');
      }
      this.#invokeHook('afterWrite', 'planBackfill', true);
      return {
        changed: true,
        disposition: outcome.disposition,
        expectedEnvelopeText,
        expectedStateBytes: nextStateBytes,
        recordKey: loaded.recordKey,
      };
    }, transactionResult => {
      this.#validateDatabase();
      const committed = this.#readRecord();
      if (
        committed.recordKey !== transactionResult.recordKey
        || committed.stateBytes !== transactionResult.expectedStateBytes
        || committed.envelopeText !== transactionResult.expectedEnvelopeText
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
      return cloneTrusted({
        state: committed.state,
        disposition: transactionResult.disposition,
        plan: null,
      });
    });
  }

  #safeRead() {
    this.#assertUsable();
    try {
      return this.#readSnapshot(() => {
        this.#validateDatabase();
        return this.#readRecord();
      });
    } catch (error) {
      const code = storeErrorCode(error);
      if (code !== null && this.#mustLatch(code)) this.#quarantine();
      throw failure(code ?? 'ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
    }
  }

  #readCommitted() {
    return this.#readSnapshot(() => {
      this.#validateDatabase();
      return this.#readRecord();
    });
  }

  #readRecord() {
    try {
      const count = this.#database.prepare(`SELECT count(*) AS entries FROM ${TABLE_NAME}`).get();
      if (count?.entries !== 1) fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      const size = this.#database.prepare(
        `SELECT singleton, typeof(record_key) AS record_kind, length(CAST(record_key AS BLOB)) AS record_key_bytes, typeof(envelope) AS envelope_kind, length(CAST(envelope AS BLOB)) AS bytes FROM ${TABLE_NAME}`,
      ).get();
      if (
        size?.singleton !== 1
        || size?.record_kind !== 'text'
        || size?.record_key_bytes !== RECORD_KEY_BYTES
        || size?.envelope_kind !== 'text'
        || !NUMBER_IS_SAFE_INTEGER(size?.bytes)
        || size.bytes < 1
        || size.bytes > this.#configuration.maxStateBytes + MAX_ENVELOPE_OVERHEAD_BYTES
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
      const row = this.#database.prepare(
        `SELECT record_key, envelope FROM ${TABLE_NAME} WHERE singleton = 1`,
      ).get();
      if (
        typeof row?.envelope !== 'string'
        || byteLength(row.envelope) !== size.bytes
        || !validDigest(row.record_key)
        || byteLength(row.record_key) !== RECORD_KEY_BYTES
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
      let envelope;
      try {
        envelope = REFLECT_APPLY(JSON_PARSE, JSON, [row.envelope]);
      } catch {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
      if (
        !isPlainObject(envelope)
        || REFLECT_OWN_KEYS(envelope).length !== 6
        || ![
          'envelopeVersion',
          'observerRevision',
          'observerStateSchemaVersion',
          'recordKey',
          'stateBytes',
          'checksum',
        ].every(key => {
          const descriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(envelope, key);
          return descriptor?.enumerable && OBJECT_HAS_OWN(descriptor, 'value');
        })
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
      if (
        envelope.envelopeVersion !== ENVELOPE_VERSION
        || envelope.observerStateSchemaVersion !== ZENON_FUNDING_OBSERVER_STATE_SCHEMA_VERSION
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_SCHEMA_UNSUPPORTED');
      }
      if (
        !NUMBER_IS_SAFE_INTEGER(envelope.observerRevision)
        || envelope.observerRevision < 0
        || !validDigest(envelope.recordKey)
        || envelope.recordKey !== row.record_key
        || typeof envelope.stateBytes !== 'string'
        || envelope.stateBytes.length === 0
        || envelope.stateBytes.length > this.#configuration.maxStateBytes
        || byteLength(envelope.stateBytes) > this.#configuration.maxStateBytes
        || !validDigest(envelope.checksum)
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
      if (envelope.recordKey !== this.#recordKey) {
        fail('ZENON_FUNDING_OBSERVER_STORE_RECORD_KEY_MISMATCH');
      }
      const expectedEnvelope = envelopeFor(
        envelope.recordKey,
        envelope.stateBytes,
        envelope.observerRevision,
      );
      if (
        expectedEnvelope.checksum !== envelope.checksum
        || canonicalJson(envelope) !== row.envelope
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
      let state;
      try {
        state = parseZenonFundingObserverState(envelope.stateBytes);
      } catch (error) {
        mapObserverFailure(error, true);
      }
      if (
        state.schemaVersion !== envelope.observerStateSchemaVersion
        || state.revision !== envelope.observerRevision
        || recordKeyFor(state) !== envelope.recordKey
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
      return {
        envelopeText: row.envelope,
        recordKey: envelope.recordKey,
        state,
        stateBytes: envelope.stateBytes,
      };
    } catch (error) {
      const known = storeErrorCode(error);
      throw failure(known ?? 'ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
    }
  }

  #validateDatabase() {
    try {
      assertConnection(this.#database, this.#configuration.busyTimeoutMs);
      const integrity = this.#database.prepare('PRAGMA integrity_check').all();
      if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
      if (
        pragmaValue(this.#database, 'PRAGMA application_id', 'application_id') !== APPLICATION_ID
        || pragmaValue(this.#database, 'PRAGMA user_version', 'user_version')
          !== ZENON_FUNDING_OBSERVER_SQLITE_STORE_SCHEMA_VERSION
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_SCHEMA_UNSUPPORTED');
      }
      const schema = this.#database.prepare(
        'SELECT type, name, tbl_name, sql FROM main.sqlite_schema ORDER BY type, name',
      ).all();
      if (
        schema.length !== 2
        || schema[0]?.type !== 'index'
        || schema[0]?.name !== INDEX_NAME
        || schema[0]?.tbl_name !== TABLE_NAME
        || schema[0]?.sql !== INDEX_SQL
        || schema[1]?.type !== 'table'
        || schema[1]?.name !== TABLE_NAME
        || schema[1]?.tbl_name !== TABLE_NAME
        || schema[1]?.sql !== TABLE_SQL
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
      const columns = this.#database.prepare(`PRAGMA table_xinfo(${TABLE_NAME})`).all();
      if (
        columns.length !== 3
        || columns[0]?.name !== 'singleton'
        || columns[0]?.type !== 'INTEGER'
        || columns[0]?.pk !== 1
        || columns[1]?.name !== 'record_key'
        || columns[1]?.type !== 'TEXT'
        || columns[1]?.notnull !== 1
        || columns[2]?.name !== 'envelope'
        || columns[2]?.type !== 'TEXT'
        || columns[2]?.notnull !== 1
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
      const index = this.#database.prepare(`PRAGMA index_xinfo(${INDEX_NAME})`).all();
      if (
        index.length !== 2
        || index[0]?.seqno !== 0
        || index[0]?.cid !== 1
        || index[0]?.name !== 'record_key'
        || index[0]?.key !== 1
        || index[1]?.cid !== -1
        || index[1]?.key !== 0
        || this.#database.prepare('PRAGMA foreign_key_check').all().length !== 0
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
      const table = this.#database.prepare('PRAGMA table_list').all()
        .find(row => row?.schema === 'main' && row?.name === TABLE_NAME);
      if (table?.type !== 'table' || table?.ncol !== 3 || table?.wr !== 0 || table?.strict !== 1) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
    } catch (error) {
      const known = storeErrorCode(error);
      throw failure(known ?? 'ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
    }
  }

  #assertEnvelopeCapacity(envelope) {
    if (
      typeof envelope.stateBytes !== 'string'
      || byteLength(envelope.stateBytes) > this.#configuration.maxStateBytes
      || byteLength(canonicalJson(envelope))
        > this.#configuration.maxStateBytes + MAX_ENVELOPE_OVERHEAD_BYTES
    ) {
      fail('ZENON_FUNDING_OBSERVER_STORE_CAPACITY_EXCEEDED');
    }
  }

  #runTransaction(operation, body, postCommit) {
    this.#assertUsable();
    this.#assertFileIdentity();
    let started = false;
    let commitAttempted = false;
    let committed = false;
    try {
      this.#invokeHook('beforeBegin', operation, false);
      this.#database.exec('BEGIN IMMEDIATE');
      started = true;
      this.#invokeHook('afterBegin', operation, false);
      const outcome = body();
      this.#invokeHook('beforeCommit', operation, outcome?.changed === true);
      commitAttempted = true;
      this.#invokeHook('commitAttempt', operation, outcome?.changed === true);
      this.#database.exec('COMMIT');
      started = false;
      committed = true;
      this.#invokeHook('afterCommit', operation, outcome?.changed === true);
      this.#refreshIdentity();
      return this.#readSnapshot(() => postCommit(outcome));
    } catch (error) {
      if (started && this.#database?.isTransaction) {
        try {
          this.#database.exec('ROLLBACK');
          started = false;
        } catch {
          this.#quarantine();
          throw failure('ZENON_FUNDING_OBSERVER_STORE_ROLLBACK_FAILED');
        }
      }
      if (commitAttempted || committed) {
        this.#quarantine();
        throw failure('ZENON_FUNDING_OBSERVER_STORE_COMMIT_OUTCOME_UNKNOWN');
      }
      const known = storeErrorCode(error);
      if (known !== null && this.#mustLatch(known)) this.#quarantine();
      throw failure(known ?? 'ZENON_FUNDING_OBSERVER_STORE_TRANSACTION_FAILED');
    } finally {
      if (started) {
        try { this.#database.exec('ROLLBACK'); } catch { this.#quarantine(); }
      }
    }
  }

  #runPublic(operation) {
    this.#assertUsable();
    if (this.#operationActive) {
      if (this.#hookActive) this.#hookReentry = true;
      fail('ZENON_FUNDING_OBSERVER_STORE_REENTRANT_OPERATION');
    }
    this.#operationActive = true;
    try {
      return operation();
    } finally {
      this.#operationActive = false;
    }
  }

  #readSnapshot(body) {
    this.#assertUsable();
    this.#assertFileIdentity();
    let started = false;
    try {
      this.#database.exec('BEGIN');
      started = true;
      const value = body();
      this.#database.exec('COMMIT');
      started = false;
      this.#assertFileIdentity();
      return value;
    } catch (error) {
      if (started && this.#database?.isTransaction) {
        try {
          this.#database.exec('ROLLBACK');
          started = false;
        } catch {
          this.#quarantine();
          throw failure('ZENON_FUNDING_OBSERVER_STORE_ROLLBACK_FAILED');
        }
      }
      const known = storeErrorCode(error);
      throw failure(known ?? 'ZENON_FUNDING_OBSERVER_STORE_READ_FAILED');
    } finally {
      if (started) {
        try { this.#database.exec('ROLLBACK'); } catch { this.#quarantine(); }
      }
    }
  }

  #invokeHook(name, operation, changed) {
    const hook = this.#configuration.testHooks[name];
    if (!hook) return;
    this.#hookActive = true;
    this.#hookReentry = false;
    let failed = false;
    let result;
    try {
      result = REFLECT_APPLY(hook, undefined, [OBJECT_FREEZE({ operation, changed })]);
    } catch {
      failed = true;
    }
    const reentered = this.#hookReentry;
    this.#hookActive = false;
    this.#hookReentry = false;
    if (failed || reentered || result !== undefined) {
      fail('ZENON_FUNDING_OBSERVER_STORE_TEST_HOOK_FAILED');
    }
  }

  #assertUsable() {
    if (this.#closed) fail('ZENON_FUNDING_OBSERVER_STORE_CLOSED');
    if (this.#quarantined || this.#database?.isOpen !== true) {
      fail('ZENON_FUNDING_OBSERVER_STORE_QUARANTINED');
    }
  }

  #assertFileIdentity() {
    try {
      const boundary = validatePathBoundary(this.#configuration);
      inspectSidecars(this.#configuration, boundary.uid);
      const current = lstatSync(this.#configuration.databasePath, { bigint: true });
      if (
        !safeDatabaseFile(current, boundary.uid)
        || !sameIdentity(this.#identity, current)
        || realpathSync(this.#configuration.databasePath) !== this.#configuration.databasePath
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_UNSAFE_FILE');
      }
    } catch (error) {
      const known = storeErrorCode(error);
      throw failure(known ?? 'ZENON_FUNDING_OBSERVER_STORE_UNSAFE_FILE');
    }
  }

  #refreshIdentity() {
    this.#assertFileIdentity();
    this.#identity = lstatSync(this.#configuration.databasePath, { bigint: true });
  }

  #mustLatch(code) {
    return code === 'ZENON_FUNDING_OBSERVER_STORE_CORRUPT'
      || code === 'ZENON_FUNDING_OBSERVER_STORE_SCHEMA_UNSUPPORTED'
      || code === 'ZENON_FUNDING_OBSERVER_STORE_RECORD_KEY_MISMATCH'
      || code === 'ZENON_FUNDING_OBSERVER_STORE_UNSAFE_FILE'
      || code === 'ZENON_FUNDING_OBSERVER_STORE_UNEXPECTED_SIDECAR';
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

export function createZenonFundingObserverSqliteStore(options) {
  return ZenonFundingObserverSqliteStore.create(options);
}

export function openZenonFundingObserverSqliteStore(options) {
  return ZenonFundingObserverSqliteStore.openExisting(options);
}
