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
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { types as utilTypes } from 'node:util';
import { paymentIntentDigest } from './canonical.js';
import { MAX_X402_HEADER_ENCODED_BYTES, validatePaymentRequired } from './x402-wire.js';
import { deriveZenonFundingObserverSqliteRecordKey } from './service-credit-zenon-funding-observer-sqlite-store.js';

export const ZENON_FUNDING_INTAKE_SQLITE_STORE_SCHEMA_VERSION = 1;
export const ZENON_FUNDING_INTAKE_STATUS = Object.freeze({
  ISSUED: 'ISSUED',
  BOUND: 'BOUND',
});

const APPLICATION_ID = 0x5a464953;
const MAX_CHALLENGES = 16;
const MAX_RECORD_BYTES = 64 * 1024;
const MAX_NODES = 4096;
const MAX_DEPTH = 24;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const HASH = /^[0-9a-f]{64}$/;
const OBSERVER_FILE = /^funding-observer-[0-9a-f]{64}\.sqlite$/;
const TABLE_META = 'CREATE TABLE intake_meta(singleton INTEGER PRIMARY KEY CHECK(singleton = 1), ledger_domain TEXT NOT NULL) STRICT';
const TABLE_CHALLENGES = 'CREATE TABLE intake_challenges(selection_key TEXT PRIMARY KEY, funding_commitment TEXT NOT NULL UNIQUE, intent_digest TEXT NOT NULL UNIQUE, status TEXT NOT NULL CHECK(status IN (\'ISSUED\',\'BOUND\')), transaction_hash TEXT UNIQUE, authorization_key TEXT UNIQUE, payload_digest TEXT, observer_record_key TEXT UNIQUE, observer_file_name TEXT UNIQUE, envelope TEXT NOT NULL, CHECK((status = \'ISSUED\' AND transaction_hash IS NULL AND authorization_key IS NULL AND payload_digest IS NULL AND observer_record_key IS NULL AND observer_file_name IS NULL) OR (status = \'BOUND\' AND transaction_hash IS NOT NULL AND authorization_key IS NOT NULL AND payload_digest IS NOT NULL AND observer_record_key IS NOT NULL AND observer_file_name IS NOT NULL))) STRICT';

export class ZenonFundingIntakeSqliteStoreError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ZenonFundingIntakeSqliteStoreError';
    this.code = code;
    this.stack = `ZenonFundingIntakeSqliteStoreError: ${code}`;
  }
}

function fail(code) {
  throw new ZenonFundingIntakeSqliteStoreError(code);
}

function knownCode(error) {
  return error instanceof ZenonFundingIntakeSqliteStoreError ? error.code : null;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function digest(domain, value) {
  return `sha256:${createHash('sha256').update(domain).update('\0').update(canonicalJson(value)).digest('hex')}`;
}

function snapshot(value) {
  const seen = new Set();
  let nodes = 0;
  function visit(input, depth) {
    nodes += 1;
    if (nodes > MAX_NODES || depth > MAX_DEPTH) fail('ZENON_FUNDING_INTAKE_STORE_INVALID_INPUT');
    if (input === null || typeof input === 'boolean') return input;
    if (typeof input === 'string' && Buffer.byteLength(input, 'utf8') <= MAX_RECORD_BYTES) return input;
    if (typeof input === 'number' && Number.isSafeInteger(input)) return input;
    if (typeof input !== 'object' || utilTypes.isProxy(input) || seen.has(input)) {
      fail('ZENON_FUNDING_INTAKE_STORE_INVALID_INPUT');
    }
    const prototype = Object.getPrototypeOf(input);
    if (Array.isArray(input)) {
      if (prototype !== Array.prototype || input.length > 256) {
        fail('ZENON_FUNDING_INTAKE_STORE_INVALID_INPUT');
      }
    } else if (prototype !== Object.prototype && prototype !== null) {
      fail('ZENON_FUNDING_INTAKE_STORE_INVALID_INPUT');
    }
    seen.add(input);
    const keys = Reflect.ownKeys(input);
    if (keys.length > 256) fail('ZENON_FUNDING_INTAKE_STORE_INVALID_INPUT');
    const output = Array.isArray(input) ? [] : {};
    let arrayMembers = 0;
    for (const key of keys) {
      if (typeof key !== 'string') fail('ZENON_FUNDING_INTAKE_STORE_INVALID_INPUT');
      if (Array.isArray(input) && key === 'length') continue;
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        fail('ZENON_FUNDING_INTAKE_STORE_INVALID_INPUT');
      }
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
        fail('ZENON_FUNDING_INTAKE_STORE_INVALID_INPUT');
      }
      if (Array.isArray(input) && (!/^(?:0|[1-9][0-9]*)$/.test(key) || Number(key) >= input.length)) {
        fail('ZENON_FUNDING_INTAKE_STORE_INVALID_INPUT');
      }
      if (Array.isArray(input)) arrayMembers += 1;
      output[key] = visit(descriptor.value, depth + 1);
    }
    seen.delete(input);
    if (Array.isArray(input) && arrayMembers !== input.length) {
      fail('ZENON_FUNDING_INTAKE_STORE_INVALID_INPUT');
    }
    return output;
  }
  try {
    const copy = visit(value, 0);
    if (Buffer.byteLength(canonicalJson(copy), 'utf8') > MAX_RECORD_BYTES) {
      fail('ZENON_FUNDING_INTAKE_STORE_CAPACITY_EXCEEDED');
    }
    return copy;
  } catch (error) {
    throw new ZenonFundingIntakeSqliteStoreError(
      knownCode(error) ?? 'ZENON_FUNDING_INTAKE_STORE_INVALID_INPUT',
    );
  }
}

/** Bounded descriptor-only JSON capture for the separate untrusted-payment ingress. */
export function snapshotZenonFundingIntakeJson(value) {
  return snapshot(value);
}

function exact(value, keys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('ZENON_FUNDING_INTAKE_STORE_INVALID_INPUT');
  }
  const actual = Object.keys(value).sort();
  if (canonicalJson(actual) !== canonicalJson([...keys].sort())) {
    fail('ZENON_FUNDING_INTAKE_STORE_INVALID_INPUT');
  }
  return value;
}

function safeClockValue(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function deriveZenonFundingIntakeSelectionKey(input) {
  const value = exact(snapshot(input), ['ledgerDomain', 'selection']);
  if (
    typeof value.ledgerDomain !== 'string'
    || value.ledgerDomain.length === 0
    || value.ledgerDomain.length > 128
  ) fail('ZENON_FUNDING_INTAKE_STORE_INVALID_INPUT');
  exact(value.selection, ['offerId', 'offerVersion', 'holderId', 'capabilityCommitment']);
  return digest('zenon-x402:funding-intake-selection-v1', value);
}

function canonicalHeader(paymentRequired) {
  try {
    validatePaymentRequired(paymentRequired);
    const encoded = Buffer.from(canonicalJson(paymentRequired), 'utf8').toString('base64');
    if (encoded.length > MAX_X402_HEADER_ENCODED_BYTES) {
      fail('ZENON_FUNDING_INTAKE_STORE_CAPACITY_EXCEEDED');
    }
    return encoded;
  } catch (error) {
    throw new ZenonFundingIntakeSqliteStoreError(
      knownCode(error) ?? 'ZENON_FUNDING_INTAKE_STORE_INVALID_INPUT',
    );
  }
}

function validateIssueUnchecked(raw, ledgerDomain) {
  const issue = exact(snapshot(raw), [
    'version', 'ledgerDomain', 'selectionKey', 'selection', 'resourceUrl', 'offer',
    'challenge', 'authorityRecord', 'authorityRecordDigest', 'observerCatchUp',
    'observerRoot', 'observerRootIdentity', 'issuedAt', 'frame',
  ]);
  if (
    issue.version !== 1
    || issue.ledgerDomain !== ledgerDomain
    || !DIGEST.test(issue.selectionKey)
    || issue.selectionKey !== deriveZenonFundingIntakeSelectionKey({
      ledgerDomain,
      selection: issue.selection,
    })
    || typeof issue.authorityRecord !== 'string'
    || issue.authorityRecord.length > MAX_RECORD_BYTES
    || !DIGEST.test(issue.authorityRecordDigest)
    || typeof issue.observerRoot !== 'string'
    || !isAbsolute(issue.observerRoot)
    || resolve(issue.observerRoot) !== issue.observerRoot
    || !safeClockValue(issue.issuedAt)
  ) fail('ZENON_FUNDING_INTAKE_STORE_INVALID_INPUT');
  exact(issue.observerRootIdentity, ['dev', 'ino', 'uid', 'mode']);
  if (Object.values(issue.observerRootIdentity).some(part => typeof part !== 'string' || !/^[0-9]+$/.test(part))) {
    fail('ZENON_FUNDING_INTAKE_STORE_INVALID_INPUT');
  }
  exact(issue.challenge, ['activationIntent', 'fundingCommitment', 'paymentRequired']);
  const challenge = issue.challenge;
  if (
    !DIGEST.test(challenge.fundingCommitment)
    || challenge.paymentRequired.resource?.url !== issue.resourceUrl
    || !Array.isArray(challenge.paymentRequired.accepts)
    || challenge.paymentRequired.accepts.length !== 1
    || !safeClockValue(challenge.activationIntent.expiresAt)
    || challenge.activationIntent.expiresAt <= issue.issuedAt
    || challenge.activationIntent.offerId !== issue.selection.offerId
    || challenge.activationIntent.offerVersion !== issue.selection.offerVersion
    || challenge.activationIntent.holderId !== issue.selection.holderId
    || challenge.activationIntent.capabilityCommitment !== issue.selection.capabilityCommitment
    || issue.offer.offerId !== issue.selection.offerId
    || issue.offer.offerVersion !== issue.selection.offerVersion
  ) fail('ZENON_FUNDING_INTAKE_STORE_INVALID_INPUT');
  exact(issue.frame, ['status', 'paymentRequiredHeader', 'body']);
  if (
    issue.frame.status !== 402
    || issue.frame.body !== 'Payment Required'
    || issue.frame.paymentRequiredHeader !== canonicalHeader(challenge.paymentRequired)
  ) fail('ZENON_FUNDING_INTAKE_STORE_INVALID_INPUT');
  return issue;
}

function validateIssue(raw, ledgerDomain) {
  try {
    return validateIssueUnchecked(raw, ledgerDomain);
  } catch (error) {
    throw new ZenonFundingIntakeSqliteStoreError(
      knownCode(error) ?? 'ZENON_FUNDING_INTAKE_STORE_INVALID_INPUT',
    );
  }
}

function validateBindingUnchecked(raw, issue) {
  const binding = exact(snapshot(raw), [
    'transactionHash', 'authorizationKey', 'payloadDigest', 'payer',
    'observerTarget', 'observerInitialState', 'observerRecordKey', 'observerFileName',
  ]);
  if (
    !HASH.test(binding.transactionHash)
    || !HASH.test(binding.authorizationKey)
    || !DIGEST.test(binding.payloadDigest)
    || typeof binding.payer !== 'string'
    || binding.payer.length === 0
    || binding.payer.length > 128
    || !DIGEST.test(binding.observerRecordKey)
    || !OBSERVER_FILE.test(binding.observerFileName)
    || binding.observerFileName !== `funding-observer-${binding.transactionHash}.sqlite`
    || binding.observerTarget.transactionId !== `zenontx:${binding.transactionHash}`
    || binding.observerTarget.payer !== binding.payer
    || binding.payer !== issue.selection.holderId
    || binding.observerTarget.grantFundingCommitment !== issue.challenge.fundingCommitment
    || binding.observerTarget.paymentIntentDigest !== `sha256:${paymentIntentDigest(issue.challenge.paymentRequired, issue.challenge.paymentRequired.accepts[0])}`
    || canonicalJson(binding.observerInitialState.target) !== canonicalJson(binding.observerTarget)
    || deriveZenonFundingObserverSqliteRecordKey(binding.observerInitialState, issue.authorityRecord)
      !== binding.observerRecordKey
  ) fail('ZENON_FUNDING_INTAKE_STORE_INVALID_INPUT');
  return binding;
}

function validateBinding(raw, issue) {
  try {
    return validateBindingUnchecked(raw, issue);
  } catch (error) {
    throw new ZenonFundingIntakeSqliteStoreError(
      knownCode(error) ?? 'ZENON_FUNDING_INTAKE_STORE_INVALID_INPUT',
    );
  }
}

function envelope(issue, binding) {
  const core = { schemaVersion: 1, issue, binding };
  return { ...core, checksum: digest('zenon-x402:funding-intake-envelope-v1', core) };
}

function privateRoot(path) {
  try {
    if (typeof process.getuid !== 'function' || !isAbsolute(path) || resolve(path) !== path) {
      fail('ZENON_FUNDING_INTAKE_STORE_UNSAFE_DIRECTORY');
    }
    const stat = lstatSync(path, { bigint: true });
    if (
      !stat.isDirectory()
      || stat.isSymbolicLink()
      || stat.uid !== BigInt(process.getuid())
      || (stat.mode & 0o777n) !== 0o700n
      || (stat.mode & 0o7000n) !== 0n
      || realpathSync(path) !== path
    ) fail('ZENON_FUNDING_INTAKE_STORE_UNSAFE_DIRECTORY');
    return stat;
  } catch (error) {
    throw new ZenonFundingIntakeSqliteStoreError(
      knownCode(error) ?? 'ZENON_FUNDING_INTAKE_STORE_UNSAFE_DIRECTORY',
    );
  }
}

function safeFile(stat) {
  return stat.isFile()
    && !stat.isSymbolicLink()
    && stat.uid === BigInt(process.getuid())
    && stat.nlink === 1n
    && (stat.mode & 0o777n) === 0o600n
    && (stat.mode & 0o7000n) === 0n;
}

function sameFile(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function inspectFile(configuration, expected, creating = false) {
  try {
    privateRoot(configuration.allowedRoot);
    for (const entry of readdirSync(configuration.allowedRoot)) {
      if (!entry.startsWith(`${basename(configuration.databasePath)}-`)) continue;
      if (creating || entry !== `${basename(configuration.databasePath)}-journal`) {
        fail('ZENON_FUNDING_INTAKE_STORE_UNEXPECTED_SIDECAR');
      }
      if (!safeFile(lstatSync(join(configuration.allowedRoot, entry), { bigint: true }))) {
        fail('ZENON_FUNDING_INTAKE_STORE_UNSAFE_FILE');
      }
    }
    const current = lstatSync(configuration.databasePath, { bigint: true });
    if (
      !safeFile(current)
      || realpathSync(configuration.databasePath) !== configuration.databasePath
      || (expected && !sameFile(expected, current))
    ) fail('ZENON_FUNDING_INTAKE_STORE_UNSAFE_FILE');
    return current;
  } catch (error) {
    throw new ZenonFundingIntakeSqliteStoreError(
      knownCode(error) ?? 'ZENON_FUNDING_INTAKE_STORE_UNSAFE_FILE',
    );
  }
}

function configuration(options) {
  const value = exact(snapshot(options), [
    'databasePath', 'allowedRoot', 'ledgerDomain', 'maxChallenges',
  ]);
  if (
    typeof value.databasePath !== 'string'
    || typeof value.allowedRoot !== 'string'
    || !isAbsolute(value.databasePath)
    || !isAbsolute(value.allowedRoot)
    || resolve(value.databasePath) !== value.databasePath
    || resolve(value.allowedRoot) !== value.allowedRoot
    || dirname(value.databasePath) !== value.allowedRoot
    || typeof value.ledgerDomain !== 'string'
    || value.ledgerDomain.length === 0
    || value.ledgerDomain.length > 128
    || !Number.isSafeInteger(value.maxChallenges)
    || value.maxChallenges < 1
    || value.maxChallenges > MAX_CHALLENGES
  ) fail('ZENON_FUNDING_INTAKE_STORE_INVALID_CONFIGURATION');
  privateRoot(value.allowedRoot);
  return value;
}

function createFile(config) {
  let descriptor;
  try {
    const { O_CLOEXEC = 0, O_CREAT, O_EXCL, O_NOFOLLOW = 0, O_RDWR } = fsConstants;
    if (O_NOFOLLOW === 0) fail('ZENON_FUNDING_INTAKE_STORE_UNSAFE_FILE');
    descriptor = openSync(config.databasePath, O_RDWR | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0o600);
    fchmodSync(descriptor, 0o600);
    const opened = fstatSync(descriptor, { bigint: true });
    if (!safeFile(opened)) fail('ZENON_FUNDING_INTAKE_STORE_UNSAFE_FILE');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    return inspectFile(config, opened, true);
  } catch (error) {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch {}
    }
    throw new ZenonFundingIntakeSqliteStoreError(
      knownCode(error) ?? 'ZENON_FUNDING_INTAKE_STORE_CREATE_FAILED',
    );
  }
}

function syncParentDirectory(parent) {
  let descriptor;
  try {
    const { O_CLOEXEC = 0, O_DIRECTORY = 0, O_NOFOLLOW = 0, O_RDONLY } = fsConstants;
    if (O_DIRECTORY === 0 || O_NOFOLLOW === 0) {
      fail('ZENON_FUNDING_INTAKE_STORE_DIRECTORY_SYNC_FAILED');
    }
    descriptor = openSync(parent, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    fsyncSync(descriptor);
    closeSync(descriptor);
  } catch (error) {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch {}
    }
    throw new ZenonFundingIntakeSqliteStoreError(
      knownCode(error) ?? 'ZENON_FUNDING_INTAKE_STORE_DIRECTORY_SYNC_FAILED',
    );
  }
}

function pragmaValue(database, sql, field) {
  return database.prepare(sql).get()?.[field];
}

function openDatabase(config, identity, creating) {
  let database;
  try {
    database = new DatabaseSync(config.databasePath, {
      allowExtension: false,
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true,
      readOnly: false,
      timeout: 5000,
    });
    inspectFile(config, identity);
    database.exec('PRAGMA busy_timeout = 5000');
    const journalMode = database.prepare(creating ? 'PRAGMA journal_mode = DELETE' : 'PRAGMA journal_mode').get()?.journal_mode;
    if (journalMode !== 'delete') fail('ZENON_FUNDING_INTAKE_STORE_SCHEMA_UNSUPPORTED');
    database.exec('PRAGMA synchronous = FULL');
    database.exec('PRAGMA foreign_keys = ON');
    database.exec('PRAGMA trusted_schema = OFF');
    database.exec('PRAGMA recursive_triggers = OFF');
    if (process.platform === 'darwin') database.exec('PRAGMA fullfsync = ON');
    if (
      pragmaValue(database, 'PRAGMA journal_mode', 'journal_mode') !== 'delete'
      || pragmaValue(database, 'PRAGMA busy_timeout', 'timeout') !== 5000
      || pragmaValue(database, 'PRAGMA synchronous', 'synchronous') !== 2
      || pragmaValue(database, 'PRAGMA foreign_keys', 'foreign_keys') !== 1
      || pragmaValue(database, 'PRAGMA trusted_schema', 'trusted_schema') !== 0
      || pragmaValue(database, 'PRAGMA recursive_triggers', 'recursive_triggers') !== 0
      || (process.platform === 'darwin'
        && pragmaValue(database, 'PRAGMA fullfsync', 'fullfsync') !== 1)
    ) fail('ZENON_FUNDING_INTAKE_STORE_SCHEMA_UNSUPPORTED');
    if (creating) {
      database.exec(`PRAGMA application_id = ${APPLICATION_ID}`);
      database.exec(`PRAGMA user_version = ${ZENON_FUNDING_INTAKE_SQLITE_STORE_SCHEMA_VERSION}`);
      database.exec(TABLE_META);
      database.exec(TABLE_CHALLENGES);
      database.prepare('INSERT INTO intake_meta(singleton,ledger_domain) VALUES(1,?)').run(config.ledgerDomain);
    }
    if (
      database.prepare('PRAGMA application_id').get()?.application_id !== APPLICATION_ID
      || database.prepare('PRAGMA user_version').get()?.user_version !== ZENON_FUNDING_INTAKE_SQLITE_STORE_SCHEMA_VERSION
      || database.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok'
      || database.prepare('SELECT ledger_domain FROM intake_meta WHERE singleton = 1').get()?.ledger_domain !== config.ledgerDomain
    ) fail('ZENON_FUNDING_INTAKE_STORE_SCHEMA_UNSUPPORTED');
    const definitions = database.prepare('SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE \'sqlite_%\' ORDER BY name').all();
    if (
      definitions.length !== 2
      || definitions[0].type !== 'table'
      || definitions[0].name !== 'intake_challenges'
      || definitions[0].sql !== TABLE_CHALLENGES
      || definitions[1].type !== 'table'
      || definitions[1].name !== 'intake_meta'
      || definitions[1].sql !== TABLE_META
    ) fail('ZENON_FUNDING_INTAKE_STORE_SCHEMA_UNSUPPORTED');
    inspectFile(config, identity);
    return database;
  } catch (error) {
    try { database?.close(); } catch {}
    throw new ZenonFundingIntakeSqliteStoreError(
      knownCode(error) ?? 'ZENON_FUNDING_INTAKE_STORE_OPEN_FAILED',
    );
  }
}

function parseRow(row, ledgerDomain) {
  try {
    if (!row || typeof row.envelope !== 'string' || Buffer.byteLength(row.envelope, 'utf8') > MAX_RECORD_BYTES * 2) {
      fail('ZENON_FUNDING_INTAKE_STORE_CORRUPT');
    }
    const parsed = JSON.parse(row.envelope);
    exact(parsed, ['schemaVersion', 'issue', 'binding', 'checksum']);
    if (parsed.schemaVersion !== 1 || canonicalJson(parsed) !== row.envelope) {
      fail('ZENON_FUNDING_INTAKE_STORE_CORRUPT');
    }
    const issue = validateIssue(parsed.issue, ledgerDomain);
    const binding = parsed.binding === null ? null : validateBinding(parsed.binding, issue);
    const expected = envelope(issue, binding);
    if (
      canonicalJson(expected) !== row.envelope
      || row.selection_key !== issue.selectionKey
      || row.funding_commitment !== issue.challenge.fundingCommitment
      || row.intent_digest !== paymentIntentDigest(issue.challenge.paymentRequired, issue.challenge.paymentRequired.accepts[0])
      || row.status !== (binding === null ? 'ISSUED' : 'BOUND')
      || row.transaction_hash !== (binding?.transactionHash ?? null)
      || row.authorization_key !== (binding?.authorizationKey ?? null)
      || row.payload_digest !== (binding?.payloadDigest ?? null)
      || row.observer_record_key !== (binding?.observerRecordKey ?? null)
      || row.observer_file_name !== (binding?.observerFileName ?? null)
    ) fail('ZENON_FUNDING_INTAKE_STORE_CORRUPT');
    return { issue, binding, status: row.status };
  } catch {
    fail('ZENON_FUNDING_INTAKE_STORE_CORRUPT');
  }
}

export class ZenonFundingIntakeSqliteStore {
  #configuration;
  #database;
  #identity;
  #closed = false;
  #quarantined = false;
  #testHooks;

  constructor(config, database, identity, testHooks) {
    this.#configuration = config;
    this.#database = database;
    this.#identity = identity;
    this.#testHooks = testHooks;
  }

  get ledgerDomain() {
    return this.#configuration.ledgerDomain;
  }

  #assertUsable() {
    if (this.#closed) fail('ZENON_FUNDING_INTAKE_STORE_CLOSED');
    if (this.#quarantined) fail('ZENON_FUNDING_INTAKE_STORE_QUARANTINED');
    try {
      inspectFile(this.#configuration, this.#identity);
      if (this.#database.isOpen !== true) fail('ZENON_FUNDING_INTAKE_STORE_QUARANTINED');
    } catch {
      this.#quarantined = true;
      fail('ZENON_FUNDING_INTAKE_STORE_QUARANTINED');
    }
  }

  #readWhere(field, value) {
    this.#assertUsable();
    try {
      const row = this.#database.prepare(`SELECT * FROM intake_challenges WHERE ${field} = ?`).get(value);
      return row ? parseRow(row, this.#configuration.ledgerDomain) : null;
    } catch {
      this.#quarantined = true;
      fail('ZENON_FUNDING_INTAKE_STORE_CORRUPT');
    }
  }

  loadBySelectionKey(selectionKey) {
    if (!DIGEST.test(selectionKey)) fail('ZENON_FUNDING_INTAKE_STORE_INVALID_INPUT');
    return this.#readWhere('selection_key', selectionKey);
  }

  loadByFundingCommitment(fundingCommitment) {
    if (!DIGEST.test(fundingCommitment)) fail('ZENON_FUNDING_INTAKE_STORE_INVALID_INPUT');
    return this.#readWhere('funding_commitment', fundingCommitment);
  }

  loadBound() {
    this.#assertUsable();
    try {
      return this.#database.prepare('SELECT * FROM intake_challenges WHERE status = \'BOUND\' ORDER BY selection_key').all()
        .map(row => parseRow(row, this.#configuration.ledgerDomain));
    } catch {
      this.#quarantined = true;
      fail('ZENON_FUNDING_INTAKE_STORE_CORRUPT');
    }
  }

  #write(operation) {
    this.#assertUsable();
    let begun = false;
    let commitAttempted = false;
    try {
      this.#database.exec('BEGIN IMMEDIATE');
      begun = true;
      const result = operation();
      commitAttempted = true;
      this.#database.exec('COMMIT');
      this.#identity = inspectFile(this.#configuration, this.#identity);
      if (this.#testHooks?.afterCommit) this.#testHooks.afterCommit();
      return result;
    } catch (error) {
      if (begun && !commitAttempted) {
        try { this.#database.exec('ROLLBACK'); } catch { this.#quarantined = true; }
      }
      if (commitAttempted || this.#quarantined) {
        this.#quarantined = true;
        fail('ZENON_FUNDING_INTAKE_STORE_OUTCOME_UNKNOWN');
      }
      throw new ZenonFundingIntakeSqliteStoreError(
        knownCode(error) ?? 'ZENON_FUNDING_INTAKE_STORE_REJECTED',
      );
    }
  }

  issue(rawIssue) {
    const issue = validateIssue(rawIssue, this.#configuration.ledgerDomain);
    const intentDigest = paymentIntentDigest(
      issue.challenge.paymentRequired,
      issue.challenge.paymentRequired.accepts[0],
    );
    return this.#write(() => {
      const existing = this.#database.prepare('SELECT * FROM intake_challenges WHERE selection_key = ?').get(issue.selectionKey);
      if (existing) return parseRow(existing, this.#configuration.ledgerDomain);
      const count = this.#database.prepare('SELECT COUNT(*) AS n FROM intake_challenges').get()?.n;
      if (count >= this.#configuration.maxChallenges) fail('ZENON_FUNDING_INTAKE_STORE_CAPACITY_EXCEEDED');
      const collision = this.#database.prepare('SELECT selection_key FROM intake_challenges WHERE funding_commitment = ? OR intent_digest = ?').get(issue.challenge.fundingCommitment, intentDigest);
      if (collision) fail('ZENON_FUNDING_INTAKE_STORE_CONFLICT');
      this.#database.prepare('INSERT INTO intake_challenges(selection_key,funding_commitment,intent_digest,status,transaction_hash,authorization_key,payload_digest,observer_record_key,observer_file_name,envelope) VALUES(?,?,?,\'ISSUED\',NULL,NULL,NULL,NULL,NULL,?)').run(
        issue.selectionKey,
        issue.challenge.fundingCommitment,
        intentDigest,
        canonicalJson(envelope(issue, null)),
      );
      return { issue, binding: null, status: 'ISSUED' };
    });
  }

  bind(selectionKey, rawBinding) {
    if (!DIGEST.test(selectionKey)) fail('ZENON_FUNDING_INTAKE_STORE_INVALID_INPUT');
    const prior = this.loadBySelectionKey(selectionKey);
    if (prior === null) fail('ZENON_FUNDING_INTAKE_STORE_MISSING');
    const binding = validateBinding(rawBinding, prior.issue);
    return this.#write(() => {
      const row = this.#database.prepare('SELECT * FROM intake_challenges WHERE selection_key = ?').get(selectionKey);
      if (!row) fail('ZENON_FUNDING_INTAKE_STORE_MISSING');
      const current = parseRow(row, this.#configuration.ledgerDomain);
      if (current.binding !== null) {
        if (canonicalJson(current.binding) !== canonicalJson(binding)) {
          fail('ZENON_FUNDING_INTAKE_STORE_CONFLICT');
        }
        return current;
      }
      const collision = this.#database.prepare('SELECT selection_key FROM intake_challenges WHERE transaction_hash = ? OR authorization_key = ? OR observer_record_key = ? OR observer_file_name = ?').get(
        binding.transactionHash,
        binding.authorizationKey,
        binding.observerRecordKey,
        binding.observerFileName,
      );
      if (collision) fail('ZENON_FUNDING_INTAKE_STORE_CONFLICT');
      const updated = this.#database.prepare('UPDATE intake_challenges SET status = \'BOUND\',transaction_hash = ?,authorization_key = ?,payload_digest = ?,observer_record_key = ?,observer_file_name = ?,envelope = ? WHERE selection_key = ? AND status = \'ISSUED\'').run(
        binding.transactionHash,
        binding.authorizationKey,
        binding.payloadDigest,
        binding.observerRecordKey,
        binding.observerFileName,
        canonicalJson(envelope(current.issue, binding)),
        selectionKey,
      );
      if (updated.changes !== 1) fail('ZENON_FUNDING_INTAKE_STORE_OUTCOME_UNKNOWN');
      return { issue: current.issue, binding, status: 'BOUND' };
    });
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    try { this.#database.close(); } catch { fail('ZENON_FUNDING_INTAKE_STORE_CLOSE_FAILED'); }
  }
}

function open(options, creating) {
  if (options === null || typeof options !== 'object' || utilTypes.isProxy(options)) {
    fail('ZENON_FUNDING_INTAKE_STORE_INVALID_CONFIGURATION');
  }
  const permitted = ['databasePath', 'allowedRoot', 'ledgerDomain', 'maxChallenges', 'testHooks'];
  const keys = Reflect.ownKeys(options);
  if (keys.some(key => !permitted.includes(key)) || keys.length < 4 || keys.length > 5) {
    fail('ZENON_FUNDING_INTAKE_STORE_INVALID_CONFIGURATION');
  }
  const configurationInput = {};
  for (const key of permitted.slice(0, 4)) {
    const descriptor = Object.getOwnPropertyDescriptor(options, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
      fail('ZENON_FUNDING_INTAKE_STORE_INVALID_CONFIGURATION');
    }
    configurationInput[key] = descriptor.value;
  }
  const hookDescriptor = Object.getOwnPropertyDescriptor(options, 'testHooks');
  if (hookDescriptor && (!hookDescriptor.enumerable || !Object.hasOwn(hookDescriptor, 'value'))) {
    fail('ZENON_FUNDING_INTAKE_STORE_INVALID_CONFIGURATION');
  }
  const testHooks = hookDescriptor?.value;
  if (testHooks !== undefined && (
    testHooks === null
    || typeof testHooks !== 'object'
    || Reflect.ownKeys(testHooks).some(key => key !== 'afterCommit')
    || (testHooks.afterCommit !== undefined && typeof testHooks.afterCommit !== 'function')
  )) fail('ZENON_FUNDING_INTAKE_STORE_INVALID_CONFIGURATION');
  const config = configuration(configurationInput);
  const identity = creating ? createFile(config) : inspectFile(config);
  const database = openDatabase(config, identity, creating);
  if (creating) {
    try { syncParentDirectory(config.allowedRoot); } catch (error) {
      try { database.close(); } catch {}
      throw error;
    }
  }
  return new ZenonFundingIntakeSqliteStore(config, database, identity, testHooks);
}

export function createZenonFundingIntakeSqliteStore(options) {
  return open(options, true);
}

export function openZenonFundingIntakeSqliteStore(options) {
  return open(options, false);
}
