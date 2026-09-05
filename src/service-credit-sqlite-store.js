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
import {
  InMemoryServiceCreditModel,
  SERVICE_CREDIT_MODEL_VERSION,
  SERVICE_CREDIT_STATE_SCHEMA_VERSION,
  ServiceCreditModelError,
} from './service-credit-model.js';

export const SERVICE_CREDIT_SQLITE_SCHEMA_VERSION = 1;

const APPLICATION_ID = 0x53435244;
const TABLE_NAME = 'service_credit_ledger';
const TABLE_SQL = 'CREATE TABLE service_credit_ledger(singleton INTEGER PRIMARY KEY CHECK(singleton = 1), envelope TEXT NOT NULL) STRICT';
const DEFAULT_BUSY_TIMEOUT_MS = 5_000;
const MAX_BUSY_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_STATE_BYTES = 4 * 1024 * 1024;
const HARD_MAX_STATE_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_OFFERS = 256;
const DEFAULT_MAX_GRANTS = 1_024;
const DEFAULT_MAX_REQUESTS = 4_096;
const HARD_MAX_RECORDS = 10_000;
const CHECKSUM = /^sha256:[0-9a-f]{64}$/;
const CONSTRUCTOR_TOKEN = Symbol('ServiceCreditSqliteStore');

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
    const allowed = new Set([...requiredKeys, ...optionalKeys]);
    const keys = Reflect.ownKeys(value);
    if (keys.some(key => typeof key !== 'string' || !allowed.has(key))) {
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
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, expected) {
  if (!isPlainObject(value)) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.length) return false;
  const allowed = new Set(expected);
  for (const key of keys) {
    if (typeof key !== 'string' || !allowed.has(key)) return false;
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) return false;
  }
  return true;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function checksumFor(schemaVersion, revision, state) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson({
    revision,
    schemaVersion,
    state,
  })).digest('hex')}`;
}

function frozenSnapshot(value) {
  if (value === null || typeof value !== 'object') return value;
  const copy = Array.isArray(value)
    ? value.map(frozenSnapshot)
    : Object.fromEntries(Object.keys(value).map(key => [key, frozenSnapshot(value[key])]));
  return Object.freeze(copy);
}

function envelopeFor(revision, state) {
  const envelope = {
    schemaVersion: SERVICE_CREDIT_SQLITE_SCHEMA_VERSION,
    revision,
    state,
  };
  return Object.freeze({
    ...envelope,
    checksum: checksumFor(envelope.schemaVersion, envelope.revision, envelope.state),
  });
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
 * This persistence class does not itself perform HTTP handling, capability
 * proof verification, or settlement verification. The separate inactive mock
 * activation adapter verifies its exact synthetic evidence before atomically
 * asking this store to persist the activation and grant. Authoritative live
 * activation, capability issuance, and live service-credit wiring remain
 * unimplemented. This class also does not implement wallet or RPC integration,
 * live payments, external-effect execution, reconciliation evidence, deletion,
 * retention, compaction, tombstones, migration, or distributed transactions,
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

  load() {
    return this.#runPublicOperation(() => this.#runTransaction('load', () => {
      this.#validateDatabase();
      const { envelope } = this.#readLedger();
      return frozenSnapshot(envelope);
    }));
  }

  getMetadata() {
    return this.#runPublicOperation(() => this.#runTransaction('getMetadata', () => {
      this.#validateDatabase();
      const { envelope } = this.#readLedger();
      return frozenSnapshot({
        schemaVersion: envelope.schemaVersion,
        modelVersion: envelope.state.modelVersion,
        revision: envelope.revision,
        checksum: envelope.checksum,
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

  #initializeNew() {
    const model = new InMemoryServiceCreditModel({
      deriveCost: this.#configuration.deriveCost,
      now: this.#configuration.now,
    });
    const state = model.exportState();
    assertCapacity(this.#configuration, state);
    const envelope = envelopeFor(0, state);
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
        const { envelope, model } = this.#readLedger();
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
          if (envelope.revision === Number.MAX_SAFE_INTEGER) {
            failStore('SERVICE_CREDIT_STORE_CAPACITY_EXCEEDED');
          }
          const next = envelopeFor(envelope.revision + 1, afterState);
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
        || sizeRow.bytes > this.#configuration.maxStateBytes + 4_096
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
      if (!exactKeys(envelope, ['schemaVersion', 'revision', 'state', 'checksum'])) {
        failStore('SERVICE_CREDIT_STORE_CORRUPT');
      }
      if (envelope.schemaVersion !== SERVICE_CREDIT_SQLITE_SCHEMA_VERSION) {
        failStore('SERVICE_CREDIT_STORE_SCHEMA_UNSUPPORTED');
      }
      if (
        !Number.isSafeInteger(envelope.revision)
        || envelope.revision < 0
        || !CHECKSUM.test(envelope.checksum ?? '')
      ) {
        failStore('SERVICE_CREDIT_STORE_CORRUPT');
      }
      if (
        !isPlainObject(envelope.state)
        || !Object.hasOwn(envelope.state, 'schemaVersion')
        || !Object.hasOwn(envelope.state, 'modelVersion')
        || !Number.isSafeInteger(envelope.state.schemaVersion)
        || !Number.isSafeInteger(envelope.state.modelVersion)
      ) {
        failStore('SERVICE_CREDIT_STORE_CORRUPT');
      }
      if (
        envelope.state.schemaVersion !== SERVICE_CREDIT_STATE_SCHEMA_VERSION
        || envelope.state.modelVersion !== SERVICE_CREDIT_MODEL_VERSION
      ) {
        failStore('SERVICE_CREDIT_STORE_SCHEMA_UNSUPPORTED');
      }
      if (
        !Array.isArray(envelope.state.offers)
        || !Array.isArray(envelope.state.grants)
        || !Array.isArray(envelope.state.requests)
      ) {
        failStore('SERVICE_CREDIT_STORE_CORRUPT');
      }
      assertCapacity(this.#configuration, envelope.state);
      let model;
      try {
        model = InMemoryServiceCreditModel.fromState({
          deriveCost: context => this.#invokeTrustedCallback(
            this.#configuration.deriveCost,
            [context],
          ),
          now: () => this.#invokeTrustedCallback(this.#configuration.now, []),
        }, envelope.state);
      } catch {
        failStore('SERVICE_CREDIT_STORE_CORRUPT');
      }
      const normalizedState = model.exportState();
      const normalizedEnvelope = envelopeFor(envelope.revision, normalizedState);
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

  #validateDatabase() {
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
          !== SERVICE_CREDIT_SQLITE_SCHEMA_VERSION
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
