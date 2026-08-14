import { constants as fsConstants } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  unlink,
} from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_ZENON_AMOUNT } from './x402-wire.js';

export const JOURNAL_SCHEMA_VERSION = 1;
export const EVIDENCE_STATES = Object.freeze({
  VALIDATED: 'VALIDATED',
  SUBMISSION_ACKNOWLEDGED: 'SUBMISSION_ACKNOWLEDGED',
  SUBMISSION_OUTCOME_UNKNOWN: 'SUBMISSION_OUTCOME_UNKNOWN',
  MOMENTUM_INCLUDED: 'MOMENTUM_INCLUDED',
});
export const DELIVERY_STATES = Object.freeze({
  NONE: 'NONE',
  DELIVERY_PENDING: 'DELIVERY_PENDING',
  DELIVERED: 'DELIVERED',
});

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_JOURNAL_DIRECTORY = join(REPOSITORY_ROOT, '.runtime');
const JOURNAL_FILE_NAME = 'settlement-journal.json';
const INITIALIZATION_MARKER_FILE_NAME = '.settlement-journal.initialized';
const DEFAULT_MAX_RECORDS = 256;
const DEFAULT_MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_RECORD_BYTES = 128 * 1024;
const MAX_CACHED_RESPONSE_BYTES = 64 * 1024;
const MAX_JSON_DEPTH = 20;
const HASH_HEX = /^[0-9a-f]{64}$/;
const NONCE_HEX = /^[0-9a-f]{16}$/;
const DECIMAL = /^(0|[1-9]\d*)$/;
const POSITIVE_DECIMAL = /^[1-9]\d*$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const ACCOUNT_BLOCK_FIELDS = Object.freeze([
  'version', 'chainIdentifier', 'blockType', 'hash', 'previousHash', 'height',
  'momentumAcknowledged', 'address', 'toAddress', 'amount', 'tokenStandard',
  'fromBlockHash', 'data', 'fusedPlasma', 'difficulty', 'nonce', 'publicKey', 'signature',
]);
const RECORD_FIELDS = Object.freeze([
  'authorizationKey', 'transactionHash', 'chainProfile', 'intentDigest',
  'resourceIdentity', 'resourceDigest', 'payer', 'signedAccountBlock',
  'evidenceState', 'momentumEvidence', 'deliveryState', 'cachedResponse',
  'createdAt', 'updatedAt',
]);
const IMMUTABLE_RECORD_FIELDS = Object.freeze([
  'authorizationKey', 'transactionHash', 'chainProfile', 'intentDigest',
  'resourceIdentity', 'resourceDigest', 'payer', 'signedAccountBlock',
]);
const FORBIDDEN_PERSISTED_KEYS = new Set([
  'mnemonic', 'privatekey', 'seed', 'authtoken', 'authorization', 'password',
  'secret', 'rpccredentials', 'accesstoken', 'refreshtoken',
]);
const WRITER_QUEUES = new Map();
const UNSUPPORTED_DIRECTORY_SYNC_ERRORS = new Set(['EINVAL', 'ENOTSUP', 'EBADF', 'EISDIR']);

export class SettlementJournalError extends Error {
  constructor(code, cause) {
    super(code, cause ? { cause } : undefined);
    this.name = 'SettlementJournalError';
    this.code = code;
  }
}

function journalError(code, cause) {
  throw new SettlementJournalError(code, cause);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, expected) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function sha256Hex(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : canonicalJson(value)).digest('hex');
}

function recordKey(authorizationKey, transactionHash) {
  if (!HASH_HEX.test(authorizationKey ?? '') || !HASH_HEX.test(transactionHash ?? '')) {
    journalError('journal_record_invalid');
  }
  return `${authorizationKey}:${transactionHash}`;
}

function within(root, candidate) {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === '' || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== '..' && !isAbsolute(pathFromRoot));
}

async function syncDirectory(directory, failureCode = 'journal_directory_sync_failed') {
  let handle;
  try {
    handle = await open(directory, fsConstants.O_RDONLY);
    await handle.sync();
  } catch (error) {
    if (!UNSUPPORTED_DIRECTORY_SYNC_ERRORS.has(error?.code)) journalError(failureCode, error);
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function assertSafeDirectory(directory, allowedRoot) {
  const rootPath = resolve(allowedRoot);
  const directoryPath = resolve(directory);
  if (!within(rootPath, directoryPath)) journalError('journal_path_outside_allowed_root');

  let rootStat;
  try {
    rootStat = await lstat(rootPath);
  } catch (error) {
    journalError('journal_allowed_root_unavailable', error);
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) journalError('journal_unsafe_allowed_root');

  let current = rootPath;
  let directoryCreated = false;
  const pathFromRoot = relative(rootPath, directoryPath);
  const components = pathFromRoot ? pathFromRoot.split(sep) : [];
  for (const component of components) {
    current = join(current, component);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) journalError('journal_unsafe_directory');
    } catch (error) {
      if (error?.code === 'ENOENT') {
        directoryCreated = true;
        break;
      }
      if (error instanceof SettlementJournalError) throw error;
      journalError('journal_directory_unavailable', error);
    }
  }

  try {
    await mkdir(directoryPath, { recursive: true, mode: 0o700 });
    const [realRoot, realDirectory] = await Promise.all([realpath(rootPath), realpath(directoryPath)]);
    if (!within(realRoot, realDirectory)) journalError('journal_unsafe_directory');
    if (directoryCreated) {
      // Persist every newly created directory entry, including the top-level
      // runtime directory's entry in the repository root, where supported.
      let parent = rootPath;
      for (const component of components) {
        await syncDirectory(parent);
        parent = join(parent, component);
      }
    }
  } catch (error) {
    if (error instanceof SettlementJournalError) throw error;
    journalError('journal_directory_unavailable', error);
  }
  return directoryPath;
}

function validateJsonValue(value, { depth = 0, seen = new Set() } = {}) {
  if (depth > MAX_JSON_DEPTH) journalError('journal_record_invalid');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value)) journalError('journal_record_invalid');
    return;
  }
  if (typeof value !== 'object' || seen.has(value)) journalError('journal_record_invalid');
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) validateJsonValue(item, { depth: depth + 1, seen });
  } else {
    if (!isPlainObject(value)) journalError('journal_record_invalid');
    for (const [key, item] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (FORBIDDEN_PERSISTED_KEYS.has(normalizedKey)) journalError('journal_secret_field_forbidden');
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') journalError('journal_record_invalid');
      validateJsonValue(item, { depth: depth + 1, seen });
    }
  }
  seen.delete(value);
}

function cloneJson(value, maximumBytes = MAX_RECORD_BYTES) {
  validateJsonValue(value);
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded) > maximumBytes) journalError('journal_record_too_large');
  return JSON.parse(encoded);
}

function validateTimestamp(value) {
  if (typeof value !== 'string' || value.length !== 24) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

function validateCanonicalBase64(value, expectedBytes) {
  if (typeof value !== 'string' || !BASE64.test(value)) return false;
  const bytes = Buffer.from(value, 'base64');
  return bytes.length === expectedBytes && bytes.toString('base64') === value;
}

function validateChainProfile(profile) {
  if (!exactKeys(profile, ['version', 'chainIdentifier', 'genesisMomentumHash'])) return false;
  if (profile.version !== 1 || typeof profile.chainIdentifier !== 'string' ||
      profile.chainIdentifier.length > 20 || !POSITIVE_DECIMAL.test(profile.chainIdentifier)) return false;
  const chainIdentifier = BigInt(profile.chainIdentifier);
  return chainIdentifier <= BigInt(Number.MAX_SAFE_INTEGER) && HASH_HEX.test(profile.genesisMomentumHash ?? '');
}

function validateResourceIdentity(resource) {
  return exactKeys(resource, ['url', 'description', 'mimeType']) &&
    typeof resource.url === 'string' && resource.url.length > 0 && resource.url.length <= 4096 &&
    typeof resource.description === 'string' && resource.description.length <= 4096 &&
    typeof resource.mimeType === 'string' && resource.mimeType.length > 0 && resource.mimeType.length <= 256;
}

function validateSignedAccountBlock(block, record) {
  if (!exactKeys(block, ACCOUNT_BLOCK_FIELDS)) return false;
  if (block.version !== 1 || block.blockType !== 2 || !Number.isSafeInteger(block.chainIdentifier) || block.chainIdentifier <= 0) return false;
  if (String(block.chainIdentifier) !== record.chainProfile.chainIdentifier) return false;
  if (!HASH_HEX.test(block.hash ?? '') || block.hash !== record.transactionHash ||
      !HASH_HEX.test(block.previousHash ?? '') || !HASH_HEX.test(block.fromBlockHash ?? '')) return false;
  if (!Number.isSafeInteger(block.height) || block.height <= 0) return false;
  if (!exactKeys(block.momentumAcknowledged, ['hash', 'height']) ||
      !HASH_HEX.test(block.momentumAcknowledged.hash ?? '') ||
      !Number.isSafeInteger(block.momentumAcknowledged.height) || block.momentumAcknowledged.height < 0) return false;
  if (typeof block.address !== 'string' || block.address !== record.payer || block.address.length > 128 || block.address.length < 10) return false;
  if (typeof block.toAddress !== 'string' || block.toAddress.length > 128 || block.toAddress.length < 10) return false;
  if (typeof block.amount !== 'string' || block.amount.length > 77 || !POSITIVE_DECIMAL.test(block.amount)) return false;
  const amount = BigInt(block.amount);
  if (amount > MAX_ZENON_AMOUNT) return false;
  if (typeof block.tokenStandard !== 'string' || block.tokenStandard.length > 128 || block.tokenStandard.length < 10) return false;
  if (!validateCanonicalBase64(block.data, 32) || Buffer.from(block.data, 'base64').toString('hex') !== record.intentDigest) return false;
  if (!Number.isSafeInteger(block.fusedPlasma) || block.fusedPlasma < 0 ||
      !Number.isSafeInteger(block.difficulty) || block.difficulty < 0) return false;
  if (!NONCE_HEX.test(block.nonce ?? '') || !validateCanonicalBase64(block.publicKey, 32) ||
      !validateCanonicalBase64(block.signature, 64)) return false;
  return true;
}

function validateMomentumEvidence(evidence) {
  if (!exactKeys(evidence, ['observedAt', 'confirmationDetail']) || !validateTimestamp(evidence.observedAt)) return false;
  const detail = evidence.confirmationDetail;
  if (!exactKeys(detail, ['numConfirmations', 'momentumHeight', 'momentumHash', 'momentumTimestamp']) ||
      !Number.isSafeInteger(detail.numConfirmations) || detail.numConfirmations < 1 ||
      !Number.isSafeInteger(detail.momentumHeight) || detail.momentumHeight < 1 ||
      typeof detail.momentumHash !== 'string' || !HASH_HEX.test(detail.momentumHash) ||
      !Number.isSafeInteger(detail.momentumTimestamp) || detail.momentumTimestamp < 0) return false;
  try {
    cloneJson(evidence, 16 * 1024);
    return true;
  } catch {
    return false;
  }
}

function validateRecord(record) {
  if (!exactKeys(record, RECORD_FIELDS)) return false;
  if (!HASH_HEX.test(record.authorizationKey ?? '') || !HASH_HEX.test(record.transactionHash ?? '') ||
      !HASH_HEX.test(record.intentDigest ?? '') || !HASH_HEX.test(record.resourceDigest ?? '')) return false;
  if (!validateChainProfile(record.chainProfile) || !validateResourceIdentity(record.resourceIdentity)) return false;
  if (sha256Hex(record.resourceIdentity) !== record.resourceDigest) return false;
  if (sha256Hex({
    domain: 'zenon-x402-authorization-v1',
    chainProfile: record.chainProfile,
    intentDigest: record.intentDigest,
    resourceDigest: record.resourceDigest,
    transactionHash: record.transactionHash,
  }) !== record.authorizationKey) return false;
  if (typeof record.payer !== 'string' || record.payer.length < 10 || record.payer.length > 128) return false;
  if (!validateSignedAccountBlock(record.signedAccountBlock, record)) return false;
  if (!Object.values(EVIDENCE_STATES).includes(record.evidenceState) ||
      !Object.values(DELIVERY_STATES).includes(record.deliveryState)) return false;
  if (!validateTimestamp(record.createdAt) || !validateTimestamp(record.updatedAt) || record.updatedAt < record.createdAt) return false;

  if (record.evidenceState === EVIDENCE_STATES.MOMENTUM_INCLUDED) {
    if (!validateMomentumEvidence(record.momentumEvidence)) return false;
  } else if (record.momentumEvidence !== null) {
    return false;
  }
  if (record.deliveryState !== DELIVERY_STATES.NONE && record.evidenceState !== EVIDENCE_STATES.MOMENTUM_INCLUDED) return false;
  if (record.deliveryState === DELIVERY_STATES.DELIVERED) {
    try {
      cloneJson(record.cachedResponse, MAX_CACHED_RESPONSE_BYTES);
    } catch {
      return false;
    }
  } else if (record.cachedResponse !== null) {
    return false;
  }
  try {
    cloneJson(record, MAX_RECORD_BYTES);
  } catch {
    return false;
  }
  return true;
}

function checksumFor(data) {
  return sha256Hex({
    schemaVersion: data.schemaVersion,
    revision: data.revision,
    records: data.records,
  });
}

function emptyJournal() {
  const data = { schemaVersion: JOURNAL_SCHEMA_VERSION, revision: 0, records: {} };
  return { ...data, checksum: checksumFor(data) };
}

function validateJournal(data, maxRecords) {
  if (!exactKeys(data, ['schemaVersion', 'revision', 'records', 'checksum']) ||
      data.schemaVersion !== JOURNAL_SCHEMA_VERSION || !Number.isSafeInteger(data.revision) || data.revision < 0 ||
      !isPlainObject(data.records) || !HASH_HEX.test(data.checksum ?? '') || checksumFor(data) !== data.checksum) {
    journalError('journal_corrupt');
  }
  const entries = Object.entries(data.records);
  if (entries.length > maxRecords) journalError('journal_corrupt');
  const authorizations = new Set();
  const transactions = new Set();
  for (const [key, record] of entries) {
    if (!validateRecord(record) || key !== recordKey(record.authorizationKey, record.transactionHash) ||
        authorizations.has(record.authorizationKey) || transactions.has(record.transactionHash)) {
      journalError('journal_corrupt');
    }
    authorizations.add(record.authorizationKey);
    transactions.add(record.transactionHash);
  }
  return data;
}

function enqueue(filePath, operation) {
  const previous = WRITER_QUEUES.get(filePath) ?? Promise.resolve();
  const running = previous.catch(() => {}).then(operation);
  const tail = running.then(() => undefined, () => undefined);
  WRITER_QUEUES.set(filePath, tail);
  void tail.then(() => {
    if (WRITER_QUEUES.get(filePath) === tail) WRITER_QUEUES.delete(filePath);
  });
  return running;
}

export class SettlementJournal {
  constructor({
    directory = DEFAULT_JOURNAL_DIRECTORY,
    allowedRoot = REPOSITORY_ROOT,
    maxRecords = DEFAULT_MAX_RECORDS,
    maxFileBytes = DEFAULT_MAX_FILE_BYTES,
    clock = () => new Date(),
  } = {}) {
    if (!Number.isSafeInteger(maxRecords) || maxRecords < 1 || maxRecords > 10_000 ||
        !Number.isSafeInteger(maxFileBytes) || maxFileBytes < 1024 || typeof clock !== 'function') {
      journalError('journal_configuration_invalid');
    }
    this.directory = resolve(directory);
    this.allowedRoot = resolve(allowedRoot);
    this.filePath = join(this.directory, JOURNAL_FILE_NAME);
    this.markerPath = join(this.directory, INITIALIZATION_MARKER_FILE_NAME);
    this.maxRecords = maxRecords;
    this.maxFileBytes = maxFileBytes;
    this.clock = clock;
  }

  async #withWriter(operation) {
    return enqueue(this.filePath, async () => {
      await assertSafeDirectory(this.directory, this.allowedRoot);
      return operation();
    });
  }

  async #read() {
    let handle;
    try {
      const initialized = await this.#hasInitializationMarker();
      try {
        const stat = await lstat(this.filePath);
        if (stat.isSymbolicLink() || !stat.isFile()) journalError('journal_unsafe_file');
      } catch (error) {
        if (error?.code === 'ENOENT') {
          if (initialized) journalError('journal_state_missing');
          const data = emptyJournal();
          await this.#write(data);
          return data;
        }
        throw error;
      }
      handle = await open(this.filePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > this.maxFileBytes) journalError('journal_corrupt');
      const text = await handle.readFile({ encoding: 'utf8' });
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        journalError('journal_corrupt', error);
      }
      const data = validateJournal(parsed, this.maxRecords);
      if (!initialized) await this.#ensureInitializationMarker();
      return data;
    } catch (error) {
      if (error instanceof SettlementJournalError) throw error;
      journalError('journal_read_failed', error);
    } finally {
      await handle?.close().catch(() => {});
    }
  }

  async #hasInitializationMarker() {
    let handle;
    try {
      try {
        const stat = await lstat(this.markerPath);
        if (stat.isSymbolicLink() || !stat.isFile()) journalError('journal_marker_corrupt');
      } catch (error) {
        if (error?.code === 'ENOENT') return false;
        throw error;
      }
      handle = await open(this.markerPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size !== 0) journalError('journal_marker_corrupt');
      return true;
    } catch (error) {
      if (error instanceof SettlementJournalError) throw error;
      journalError('journal_marker_read_failed', error);
    } finally {
      await handle?.close().catch(() => {});
    }
  }

  async #ensureInitializationMarker() {
    if (await this.#hasInitializationMarker()) return;
    let handle;
    try {
      handle = await open(this.markerPath, 'wx', 0o600);
      await handle.sync();
      await handle.close();
      handle = undefined;
      await syncDirectory(this.directory, 'journal_marker_sync_failed');
    } catch (error) {
      if (error instanceof SettlementJournalError) throw error;
      if (error?.code === 'EEXIST' && await this.#hasInitializationMarker()) return;
      journalError('journal_marker_write_failed', error);
    } finally {
      await handle?.close().catch(() => {});
    }
  }

  async #write(data) {
    data.checksum = checksumFor(data);
    const serialized = `${JSON.stringify(data, null, 2)}\n`;
    if (Buffer.byteLength(serialized) > this.maxFileBytes) journalError('journal_capacity_exceeded');
    const temporaryPath = join(this.directory, `.${JOURNAL_FILE_NAME}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`);
    let handle;
    let renamed = false;
    try {
      handle = await open(temporaryPath, 'wx', 0o600);
      await handle.writeFile(serialized, { encoding: 'utf8' });
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporaryPath, this.filePath);
      renamed = true;
      await syncDirectory(this.directory);
      await this.#ensureInitializationMarker();
    } catch (error) {
      if (error instanceof SettlementJournalError) throw error;
      journalError(renamed ? 'journal_directory_sync_failed' : 'journal_write_failed', error);
    } finally {
      await handle?.close().catch(() => {});
      if (!renamed) await unlink(temporaryPath).catch(error => {
        if (error?.code !== 'ENOENT') throw error;
      });
    }
  }

  #now() {
    const value = this.clock();
    const timestamp = value instanceof Date ? value.toISOString() : value;
    if (!validateTimestamp(timestamp)) journalError('journal_clock_invalid');
    return timestamp;
  }

  #nextTimestamp(previous) {
    const timestamp = this.#now();
    return timestamp < previous ? previous : timestamp;
  }

  async load() {
    return this.#withWriter(async () => {
      const data = await this.#read();
      return {
        schemaVersion: data.schemaVersion,
        revision: data.revision,
        records: Object.values(data.records).map(record => cloneJson(record)),
      };
    });
  }

  async putValidated(input) {
    const immutable = cloneJson(input);
    const timestamp = this.#now();
    const candidate = {
      ...immutable,
      evidenceState: EVIDENCE_STATES.VALIDATED,
      momentumEvidence: null,
      deliveryState: DELIVERY_STATES.NONE,
      cachedResponse: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    if (!validateRecord(candidate)) journalError('journal_record_invalid');

    return this.#withWriter(async () => {
      const data = await this.#read();
      const key = recordKey(candidate.authorizationKey, candidate.transactionHash);
      const existing = data.records[key];
      if (existing) {
        const unchanged = IMMUTABLE_RECORD_FIELDS.every(field => canonicalJson(existing[field]) === canonicalJson(candidate[field]));
        if (!unchanged) journalError('journal_identity_conflict');
        return cloneJson(existing);
      }
      for (const record of Object.values(data.records)) {
        if (record.authorizationKey === candidate.authorizationKey || record.transactionHash === candidate.transactionHash) {
          journalError('journal_identity_conflict');
        }
      }
      if (Object.keys(data.records).length >= this.maxRecords) {
        // Never silently evict uncertain or delivery evidence. An operator may
        // archive old DELIVERED entries out of band; this PoC fails closed.
        journalError('journal_capacity_exceeded');
      }
      data.records[key] = candidate;
      data.revision += 1;
      await this.#write(data);
      return cloneJson(candidate);
    });
  }

  async get(authorizationKey, transactionHash) {
    return this.#withWriter(async () => {
      const data = await this.#read();
      const record = data.records[recordKey(authorizationKey, transactionHash)];
      return record ? cloneJson(record) : null;
    });
  }

  async findByTransactionHash(transactionHash) {
    if (!HASH_HEX.test(transactionHash ?? '')) journalError('journal_record_invalid');
    return this.#withWriter(async () => {
      const data = await this.#read();
      const record = Object.values(data.records).find(candidate => candidate.transactionHash === transactionHash);
      return record ? cloneJson(record) : null;
    });
  }

  async updateEvidence(authorizationKey, transactionHash, evidenceState, momentumEvidence = undefined) {
    if (!Object.values(EVIDENCE_STATES).includes(evidenceState)) journalError('journal_evidence_invalid');
    return this.#withWriter(async () => {
      const data = await this.#read();
      const key = recordKey(authorizationKey, transactionHash);
      const record = data.records[key];
      if (!record) journalError('journal_record_not_found');

      const current = record.evidenceState;
      const shouldIgnore =
        current === EVIDENCE_STATES.MOMENTUM_INCLUDED ||
        (current === EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED &&
          [EVIDENCE_STATES.VALIDATED, EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN].includes(evidenceState)) ||
        (current === EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN && evidenceState === EVIDENCE_STATES.VALIDATED);
      if (shouldIgnore || current === evidenceState) return cloneJson(record);

      if (evidenceState === EVIDENCE_STATES.MOMENTUM_INCLUDED) {
        if (!validateMomentumEvidence(momentumEvidence)) journalError('journal_momentum_evidence_invalid');
        record.momentumEvidence = cloneJson(momentumEvidence, 16 * 1024);
      } else {
        record.momentumEvidence = null;
      }
      record.evidenceState = evidenceState;
      record.updatedAt = this.#nextTimestamp(record.updatedAt);
      if (!validateRecord(record)) journalError('journal_record_invalid');
      data.revision += 1;
      await this.#write(data);
      return cloneJson(record);
    });
  }

  async markDeliveryPending(authorizationKey, transactionHash) {
    return this.#withWriter(async () => {
      const data = await this.#read();
      const key = recordKey(authorizationKey, transactionHash);
      const record = data.records[key];
      if (!record) journalError('journal_record_not_found');
      if (record.deliveryState === DELIVERY_STATES.DELIVERED || record.deliveryState === DELIVERY_STATES.DELIVERY_PENDING) {
        return { ...cloneJson(record), deliveryClaimed: false };
      }
      if (record.evidenceState !== EVIDENCE_STATES.MOMENTUM_INCLUDED) journalError('journal_momentum_required');
      record.deliveryState = DELIVERY_STATES.DELIVERY_PENDING;
      record.updatedAt = this.#nextTimestamp(record.updatedAt);
      if (!validateRecord(record)) journalError('journal_record_invalid');
      data.revision += 1;
      await this.#write(data);
      return { ...cloneJson(record), deliveryClaimed: true };
    });
  }

  async markDelivered(authorizationKey, transactionHash, cachedResponse) {
    const cached = cloneJson(cachedResponse, MAX_CACHED_RESPONSE_BYTES);
    return this.#withWriter(async () => {
      const data = await this.#read();
      const key = recordKey(authorizationKey, transactionHash);
      const record = data.records[key];
      if (!record) journalError('journal_record_not_found');
      if (record.deliveryState === DELIVERY_STATES.DELIVERED) {
        if (canonicalJson(record.cachedResponse) !== canonicalJson(cached)) journalError('journal_delivery_conflict');
        return cloneJson(record);
      }
      if (record.deliveryState !== DELIVERY_STATES.DELIVERY_PENDING ||
          record.evidenceState !== EVIDENCE_STATES.MOMENTUM_INCLUDED) journalError('journal_delivery_not_pending');
      record.deliveryState = DELIVERY_STATES.DELIVERED;
      record.cachedResponse = cached;
      record.updatedAt = this.#nextTimestamp(record.updatedAt);
      if (!validateRecord(record)) journalError('journal_record_invalid');
      data.revision += 1;
      await this.#write(data);
      return cloneJson(record);
    });
  }

  async list() {
    const loaded = await this.load();
    return loaded.records;
  }
}
