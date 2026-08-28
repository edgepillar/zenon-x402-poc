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
import { MAX_ZENON_AMOUNT, validateResource } from './x402-wire.js';

export const JOURNAL_SCHEMA_VERSION = 2;
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
const INITIAL_JOURNAL_SCHEMA_VERSION = 1;
const MAX_TOMBSTONES = 4096;
const MINIMUM_RETENTION_MS = 3_600_000;
const MAXIMUM_RETENTION_MS = 2_592_000_000;
const MAX_RECORD_BYTES = 128 * 1024;
const MAX_CACHED_RESPONSE_BYTES = 64 * 1024;
const MAX_CAS_OPTIONS_BYTES = MAX_RECORD_BYTES + (16 * 1024) + 4096;
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
const TOMBSTONE_FIELDS = Object.freeze([
  'authorizationKey', 'transactionHash', 'chainProfile', 'intentDigest',
  'resourceDigest', 'payer', 'signedAccountBlockDigest', 'priorEvidenceState',
  'createdAt', 'terminalizedAt', 'lateMomentumEvidence',
]);
const TOMBSTONE_PRIOR_EVIDENCE_STATES = new Set([
  EVIDENCE_STATES.VALIDATED,
  EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
  EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN,
]);
const FORBIDDEN_PERSISTED_KEYS = new Set([
  'mnemonic', 'privatekey', 'seed', 'authtoken', 'authorization', 'password',
  'secret', 'rpccredentials', 'accesstoken', 'refreshtoken',
]);
const WRITER_QUEUES = new Map();
const UNSUPPORTED_DIRECTORY_SYNC_ERRORS = new Set(['EINVAL', 'ENOTSUP', 'EBADF', 'EISDIR']);
const ARRAY_IS_ARRAY = Array.isArray;
const DEFINE_PROPERTY = Object.defineProperty;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const JSON_PARSE = JSON.parse;
const JSON_STRINGIFY = JSON.stringify;
const OBJECT_IS = Object.is;
const OBJECT_PROTOTYPE = Object.prototype;
const ARRAY_PROTOTYPE = Array.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const MISSING_OWN_ENTRY = Symbol('missing-own-entry');
const INVALID_JSON_SNAPSHOT = Symbol('invalid-json-snapshot');
const JSON_SNAPSHOT_TOO_LARGE = Symbol('json-snapshot-too-large');

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

function fixedJournalFailure(code) {
  const error = new SettlementJournalError(code);
  error.stack = `SettlementJournalError: ${code}`;
  return error;
}

function fixedJournalErrorCode(error) {
  try {
    if (!(error instanceof SettlementJournalError)) return null;
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(error, 'code');
    return descriptor && HAS_OWN(descriptor, 'value') && typeof descriptor.value === 'string'
      ? descriptor.value
      : null;
  } catch {
    return null;
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || ARRAY_IS_ARRAY(value)) return false;
  const prototype = GET_PROTOTYPE_OF(value);
  return prototype === OBJECT_PROTOTYPE || prototype === null;
}

function exactKeys(value, expected) {
  try {
    if (!isPlainObject(value)) return false;
    const actual = REFLECT_OWN_KEYS(value);
    if (actual.length !== expected.length) return false;
    for (let actualIndex = 0; actualIndex < actual.length; actualIndex += 1) {
      const key = actual[actualIndex];
      if (typeof key !== 'string') return false;
      const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
      if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) return false;
      let found = false;
      for (let expectedIndex = 0; expectedIndex < expected.length; expectedIndex += 1) {
        if (key === expected[expectedIndex]) {
          found = true;
          break;
        }
      }
      if (!found) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function invalidJsonSnapshot() {
  throw INVALID_JSON_SNAPSHOT;
}

function jsonSnapshotTooLarge() {
  throw JSON_SNAPSHOT_TOO_LARGE;
}

function chargeJsonSnapshot(context, value) {
  context.bytes += Buffer.byteLength(value);
  if (context.bytes > context.maximumBytes) jsonSnapshotTooLarge();
}

function captureDescriptorView(value, context) {
  const prototype = GET_PROTOTYPE_OF(value);
  const array = ARRAY_IS_ARRAY(value);
  const arrayPrototype = prototype === ARRAY_PROTOTYPE;
  if (array !== arrayPrototype ||
      (!array && prototype !== OBJECT_PROTOTYPE && prototype !== null)) invalidJsonSnapshot();
  const keys = REFLECT_OWN_KEYS(value);
  if (!array && keys.length > context.maximumBytes) jsonSnapshotTooLarge();
  for (let index = 0; index < keys.length; index += 1) {
    if (typeof keys[index] !== 'string') invalidJsonSnapshot();
  }

  let arrayLength = null;
  if (array) {
    const lengthDescriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, 'length');
    if (!lengthDescriptor || !HAS_OWN(lengthDescriptor, 'value') ||
        !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0 ||
        keys.length !== lengthDescriptor.value + 1 || keys[lengthDescriptor.value] !== 'length') {
      invalidJsonSnapshot();
    }
    arrayLength = lengthDescriptor.value;
    if (arrayLength > context.maximumBytes) jsonSnapshotTooLarge();
    for (let index = 0; index < arrayLength; index += 1) {
      if (keys[index] !== String(index)) invalidJsonSnapshot();
    }
  }

  const descriptors = [];
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
    if (!descriptor || !HAS_OWN(descriptor, 'value')) invalidJsonSnapshot();
    if (array && key === 'length') {
      if (descriptor.enumerable !== false || descriptor.value !== arrayLength) invalidJsonSnapshot();
    } else if (descriptor.enumerable !== true) {
      invalidJsonSnapshot();
    }
    if (!array) chargeJsonSnapshot(context, key);
    defineOwnData(descriptors, String(index), {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      key,
      value: descriptor.value,
      writable: descriptor.writable,
    });
  }
  return { array, arrayLength, descriptors, keys, prototype };
}

function sameDescriptorView(left, right) {
  if (left.prototype !== right.prototype || left.array !== right.array ||
      left.arrayLength !== right.arrayLength || left.keys.length !== right.keys.length) return false;
  for (let index = 0; index < left.keys.length; index += 1) {
    const leftDescriptor = left.descriptors[index];
    const rightDescriptor = right.descriptors[index];
    if (left.keys[index] !== right.keys[index] || leftDescriptor.key !== rightDescriptor.key ||
        leftDescriptor.configurable !== rightDescriptor.configurable ||
        leftDescriptor.enumerable !== rightDescriptor.enumerable ||
        leftDescriptor.writable !== rightDescriptor.writable ||
        !OBJECT_IS(leftDescriptor.value, rightDescriptor.value)) return false;
  }
  return true;
}

function descriptorSafeJsonValue(value, context, depth) {
  if (depth > MAX_JSON_DEPTH) invalidJsonSnapshot();
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    chargeJsonSnapshot(context, value);
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value)) invalidJsonSnapshot();
    return OBJECT_IS(value, -0) ? 0 : value;
  }
  if (typeof value !== 'object' || context.seen.has(value)) invalidJsonSnapshot();

  context.seen.add(value);
  try {
    const firstView = captureDescriptorView(value, context);
    const snapshot = firstView.array ? [] : {};
    for (let index = 0; index < firstView.descriptors.length; index += 1) {
      const descriptor = firstView.descriptors[index];
      if (firstView.array && descriptor.key === 'length') continue;
      const child = descriptorSafeJsonValue(descriptor.value, context, depth + 1);
      defineOwnData(snapshot, descriptor.key, child);
    }
    const secondView = captureDescriptorView(value, { ...context, bytes: 0 });
    if (!sameDescriptorView(firstView, secondView)) invalidJsonSnapshot();
    return snapshot;
  } finally {
    context.seen.delete(value);
  }
}

function jsonIndent(depth, width) {
  let indentation = '';
  for (let index = 0; index < depth * width; index += 1) indentation += ' ';
  return indentation;
}

function orderedJsonKeys(value, sortKeys) {
  const ownKeys = REFLECT_OWN_KEYS(value);
  const keys = [];
  for (let index = 0; index < ownKeys.length; index += 1) {
    const key = ownKeys[index];
    if (typeof key !== 'string') invalidJsonSnapshot();
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) {
      invalidJsonSnapshot();
    }
    defineOwnData(keys, String(index), key);
  }
  if (!sortKeys) return keys;
  for (let index = 1; index < keys.length; index += 1) {
    const key = keys[index];
    let insertion = index;
    while (insertion > 0 && key < keys[insertion - 1]) {
      keys[insertion] = keys[insertion - 1];
      insertion -= 1;
    }
    keys[insertion] = key;
  }
  return keys;
}

function stringifyJsonWithoutHooks(value, space = 0, sortKeys = false,
  maximumBytes = DEFAULT_MAX_FILE_BYTES) {
  const indentationWidth = space === 0 ? 0 : space;
  if (!Number.isSafeInteger(indentationWidth) || indentationWidth < 0 || indentationWidth > 10) {
    invalidJsonSnapshot();
  }
  if (typeof sortKeys !== 'boolean' || !Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    invalidJsonSnapshot();
  }
  const seen = new Set();
  let encoded = '';
  let encodedBytes = 0;

  function emit(fragment) {
    encodedBytes += Buffer.byteLength(fragment);
    if (encodedBytes > maximumBytes) jsonSnapshotTooLarge();
    encoded += fragment;
  }

  function serialize(current, depth) {
    if (depth > MAX_JSON_DEPTH + 4) invalidJsonSnapshot();
    if (current === null || typeof current === 'boolean' || typeof current === 'string') {
      emit(JSON_STRINGIFY(current));
      return;
    }
    if (typeof current === 'number') {
      if (!Number.isFinite(current) || !Number.isSafeInteger(current)) invalidJsonSnapshot();
      emit(JSON_STRINGIFY(current));
      return;
    }
    if (typeof current !== 'object' || seen.has(current)) invalidJsonSnapshot();

    seen.add(current);
    try {
      const array = ARRAY_IS_ARRAY(current);
      const prototype = GET_PROTOTYPE_OF(current);
      if ((array && prototype !== ARRAY_PROTOTYPE) ||
          (!array && prototype !== OBJECT_PROTOTYPE && prototype !== null)) invalidJsonSnapshot();
      const separator = indentationWidth === 0 ? ',' : `,\n${jsonIndent(depth + 1, indentationWidth)}`;
      const colon = indentationWidth === 0 ? ':' : ': ';
      const openIndent = indentationWidth === 0 ? '' : `\n${jsonIndent(depth + 1, indentationWidth)}`;
      const closeIndent = indentationWidth === 0 ? '' : `\n${jsonIndent(depth, indentationWidth)}`;

      if (array) {
        const keys = REFLECT_OWN_KEYS(current);
        const lengthDescriptor = GET_OWN_PROPERTY_DESCRIPTOR(current, 'length');
        if (!lengthDescriptor || !HAS_OWN(lengthDescriptor, 'value') ||
            lengthDescriptor.enumerable !== false ||
            !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0 ||
            keys.length !== lengthDescriptor.value + 1 || keys[lengthDescriptor.value] !== 'length') {
          invalidJsonSnapshot();
        }
        emit('[');
        if (lengthDescriptor.value > 0) emit(openIndent);
        for (let index = 0; index < lengthDescriptor.value; index += 1) {
          const key = String(index);
          if (keys[index] !== key) invalidJsonSnapshot();
          const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(current, key);
          if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) {
            invalidJsonSnapshot();
          }
          if (index > 0) emit(separator);
          serialize(descriptor.value, depth + 1);
        }
        if (lengthDescriptor.value > 0) emit(closeIndent);
        emit(']');
        return;
      }

      const keys = orderedJsonKeys(current, sortKeys);
      emit('{');
      if (keys.length > 0) emit(openIndent);
      for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(current, key);
        if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) {
          invalidJsonSnapshot();
        }
        if (index > 0) emit(separator);
        emit(JSON_STRINGIFY(key));
        emit(colon);
        serialize(descriptor.value, depth + 1);
      }
      if (keys.length > 0) emit(closeIndent);
      emit('}');
    } finally {
      seen.delete(current);
    }
  }

  serialize(value, 0);
  return encoded;
}

function exactCasOptionsSnapshot(value, expected) {
  try {
    const context = { bytes: 0, maximumBytes: MAX_CAS_OPTIONS_BYTES, seen: new Set() };
    const snapshot = descriptorSafeJsonValue(value, context, 0);
    if (!exactKeys(snapshot, expected)) return null;
    const encoded = stringifyJsonWithoutHooks(snapshot, 0, false, MAX_CAS_OPTIONS_BYTES);
    if (Buffer.byteLength(encoded) > MAX_CAS_OPTIONS_BYTES) return null;
    return snapshot;
  } catch {
    return null;
  }
}

function ownDataEntry(value, key, errorCode = 'journal_corrupt') {
  let descriptor;
  try {
    descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
  } catch (error) {
    journalError(errorCode, error);
  }
  if (!descriptor) return MISSING_OWN_ENTRY;
  if (!HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) journalError(errorCode);
  return descriptor.value;
}

function requireOwnData(value, key, errorCode = 'journal_corrupt') {
  const entry = ownDataEntry(value, key, errorCode);
  if (entry === MISSING_OWN_ENTRY) journalError(errorCode);
  return entry;
}

function defineOwnData(value, key, entry) {
  DEFINE_PROPERTY(value, key, {
    configurable: true,
    enumerable: true,
    value: entry,
    writable: true,
  });
}

function journalSchemaVersion(data) {
  return requireOwnData(data, 'schemaVersion');
}

function journalRecords(data) {
  const records = requireOwnData(data, 'records');
  if (!isPlainObject(records)) journalError('journal_corrupt');
  return records;
}

function journalTombstones(data) {
  const schemaVersion = journalSchemaVersion(data);
  if (schemaVersion === INITIAL_JOURNAL_SCHEMA_VERSION) return null;
  if (schemaVersion !== JOURNAL_SCHEMA_VERSION) journalError('journal_corrupt');
  const tombstones = requireOwnData(data, 'tombstones');
  if (!isPlainObject(tombstones)) journalError('journal_corrupt');
  return tombstones;
}

function mapEntry(map, key) {
  if (map === null) return null;
  const entry = ownDataEntry(map, key);
  return entry === MISSING_OWN_ENTRY ? null : entry;
}

function canonicalJson(value, maximumBytes = MAX_RECORD_BYTES) {
  return stringifyJsonWithoutHooks(value, 0, true, maximumBytes);
}

function sha256Hex(value, maximumBytes = MAX_RECORD_BYTES) {
  return createHash('sha256')
    .update(typeof value === 'string' ? value : canonicalJson(value, maximumBytes))
    .digest('hex');
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

function validateJsonValueInternal(value, { depth, seen }) {
  if (depth > MAX_JSON_DEPTH) journalError('journal_record_invalid');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value)) journalError('journal_record_invalid');
    return;
  }
  if (typeof value !== 'object' || seen.has(value)) journalError('journal_record_invalid');
  seen.add(value);
  try {
    const array = ARRAY_IS_ARRAY(value);
    const prototype = GET_PROTOTYPE_OF(value);
    if (array) {
      if (prototype !== ARRAY_PROTOTYPE) journalError('journal_record_invalid');
      const keys = REFLECT_OWN_KEYS(value);
      const lengthDescriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, 'length');
      if (!lengthDescriptor || !HAS_OWN(lengthDescriptor, 'value') ||
          lengthDescriptor.enumerable !== false ||
          !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0 ||
          keys.length !== lengthDescriptor.value + 1 || keys[lengthDescriptor.value] !== 'length') {
        journalError('journal_record_invalid');
      }
      for (let index = 0; index < lengthDescriptor.value; index += 1) {
        const key = String(index);
        if (keys[index] !== key) journalError('journal_record_invalid');
        const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
        if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) {
          journalError('journal_record_invalid');
        }
        validateJsonValueInternal(descriptor.value, { depth: depth + 1, seen });
      }
      return;
    }

    if (prototype !== OBJECT_PROTOTYPE && prototype !== null) journalError('journal_record_invalid');
    const keys = REFLECT_OWN_KEYS(value);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (typeof key !== 'string') journalError('journal_record_invalid');
      const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
      if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) {
        journalError('journal_record_invalid');
      }
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (FORBIDDEN_PERSISTED_KEYS.has(normalizedKey)) journalError('journal_secret_field_forbidden');
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') journalError('journal_record_invalid');
      validateJsonValueInternal(descriptor.value, { depth: depth + 1, seen });
    }
  } finally {
    seen.delete(value);
  }
}

function validateJsonValue(value) {
  try {
    validateJsonValueInternal(value, { depth: 0, seen: new Set() });
  } catch (error) {
    if (error instanceof SettlementJournalError) throw error;
    journalError('journal_record_invalid');
  }
}

function cloneJson(value, maximumBytes = MAX_RECORD_BYTES) {
  let snapshot;
  let encoded;
  try {
    const context = { bytes: 0, maximumBytes, seen: new Set() };
    snapshot = descriptorSafeJsonValue(value, context, 0);
    validateJsonValue(snapshot);
    encoded = stringifyJsonWithoutHooks(snapshot, 0, false, maximumBytes);
  } catch (error) {
    if (error === JSON_SNAPSHOT_TOO_LARGE) journalError('journal_record_too_large');
    if (fixedJournalErrorCode(error) === 'journal_secret_field_forbidden') {
      journalError('journal_secret_field_forbidden');
    }
    journalError('journal_record_invalid');
  }
  if (Buffer.byteLength(encoded) > maximumBytes) journalError('journal_record_too_large');
  return snapshot;
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
  try {
    validateResource(resource);
    return true;
  } catch {
    return false;
  }
}

function validateInputResourceIdentity(input) {
  if (!isPlainObject(input)) return false;
  const descriptor = Object.getOwnPropertyDescriptor(input, 'resourceIdentity');
  return Boolean(descriptor && Object.hasOwn(descriptor, 'value') &&
    validateResourceIdentity(descriptor.value));
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
  if (!validateConfirmationDetail(evidence.confirmationDetail)) return false;
  try {
    cloneJson(evidence, 16 * 1024);
    return true;
  } catch {
    return false;
  }
}

function validateConfirmationDetail(detail) {
  if (!exactKeys(detail, ['numConfirmations', 'momentumHeight', 'momentumHash', 'momentumTimestamp']) ||
      !Number.isSafeInteger(detail.numConfirmations) || detail.numConfirmations < 1 ||
      !Number.isSafeInteger(detail.momentumHeight) || detail.momentumHeight < 1 ||
      typeof detail.momentumHash !== 'string' || !HASH_HEX.test(detail.momentumHash) ||
      !Number.isSafeInteger(detail.momentumTimestamp) || detail.momentumTimestamp < 0) return false;
  try {
    cloneJson(detail, 16 * 1024);
    return true;
  } catch {
    return false;
  }
}

function validRetentionMs(value) {
  return Number.isSafeInteger(value) && value >= MINIMUM_RETENTION_MS && value <= MAXIMUM_RETENTION_MS;
}

function isRetentionEligible(record, timestamp, retentionMs) {
  if (!validRetentionMs(retentionMs) || !validateTimestamp(timestamp) ||
      !TOMBSTONE_PRIOR_EVIDENCE_STATES.has(record.evidenceState) ||
      record.deliveryState !== DELIVERY_STATES.NONE || record.momentumEvidence !== null ||
      record.cachedResponse !== null) return false;
  const createdAtMs = Date.parse(record.createdAt);
  const timestampMs = Date.parse(timestamp);
  return timestampMs >= createdAtMs && timestampMs - createdAtMs >= retentionMs;
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

function validateTombstone(tombstone) {
  if (!exactKeys(tombstone, TOMBSTONE_FIELDS)) return false;
  if (!HASH_HEX.test(tombstone.authorizationKey ?? '') ||
      !HASH_HEX.test(tombstone.transactionHash ?? '') ||
      !HASH_HEX.test(tombstone.intentDigest ?? '') ||
      !HASH_HEX.test(tombstone.resourceDigest ?? '') ||
      !HASH_HEX.test(tombstone.signedAccountBlockDigest ?? '')) return false;
  if (!validateChainProfile(tombstone.chainProfile)) return false;
  if (sha256Hex({
    domain: 'zenon-x402-authorization-v1',
    chainProfile: tombstone.chainProfile,
    intentDigest: tombstone.intentDigest,
    resourceDigest: tombstone.resourceDigest,
    transactionHash: tombstone.transactionHash,
  }) !== tombstone.authorizationKey) return false;
  if (typeof tombstone.payer !== 'string' || tombstone.payer.length < 10 || tombstone.payer.length > 128) return false;
  if (!TOMBSTONE_PRIOR_EVIDENCE_STATES.has(tombstone.priorEvidenceState)) return false;
  if (!validateTimestamp(tombstone.createdAt) || !validateTimestamp(tombstone.terminalizedAt) ||
      tombstone.terminalizedAt < tombstone.createdAt) return false;
  if (tombstone.lateMomentumEvidence !== null &&
      (!validateMomentumEvidence(tombstone.lateMomentumEvidence) ||
        tombstone.lateMomentumEvidence.observedAt < tombstone.terminalizedAt)) return false;
  try {
    cloneJson(tombstone, MAX_RECORD_BYTES);
  } catch {
    return false;
  }
  return true;
}

function tombstoneFromRecord(record, terminalizedAt) {
  return {
    authorizationKey: record.authorizationKey,
    transactionHash: record.transactionHash,
    chainProfile: cloneJson(record.chainProfile),
    intentDigest: record.intentDigest,
    resourceDigest: record.resourceDigest,
    payer: record.payer,
    signedAccountBlockDigest: sha256Hex({
      domain: 'zenon-x402-signed-account-block-v1',
      signedAccountBlock: record.signedAccountBlock,
    }),
    priorEvidenceState: record.evidenceState,
    createdAt: record.createdAt,
    terminalizedAt,
    lateMomentumEvidence: null,
  };
}

function sameTombstoneIdentity(left, right) {
  if (!validateTombstone(left) || !validateTombstone(right)) return false;
  const leftBase = { ...left, lateMomentumEvidence: null };
  const rightBase = { ...right, lateMomentumEvidence: null };
  return canonicalJson(leftBase) === canonicalJson(rightBase);
}

function checksumFor(data, maximumBytes = DEFAULT_MAX_FILE_BYTES) {
  const schemaVersion = journalSchemaVersion(data);
  const content = {
    schemaVersion,
    revision: requireOwnData(data, 'revision'),
    records: journalRecords(data),
  };
  if (schemaVersion === JOURNAL_SCHEMA_VERSION) {
    defineOwnData(content, 'tombstones', journalTombstones(data));
  }
  return sha256Hex(content, maximumBytes);
}

function emptyJournal() {
  const data = { schemaVersion: INITIAL_JOURNAL_SCHEMA_VERSION, revision: 0, records: {} };
  return { ...data, checksum: checksumFor(data) };
}

function validatedMapKeys(map, maximumEntries) {
  const keys = REFLECT_OWN_KEYS(map);
  if (keys.length > maximumEntries) journalError('journal_corrupt');
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (typeof key !== 'string') journalError('journal_corrupt');
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(map, key);
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) {
      journalError('journal_corrupt');
    }
  }
  return keys;
}

function validateJournalStructure(data, maxRecords) {
  try {
    if (!isPlainObject(data)) journalError('journal_corrupt');
    const schemaVersion = journalSchemaVersion(data);
    const v1 = schemaVersion === INITIAL_JOURNAL_SCHEMA_VERSION;
    const v2 = schemaVersion === JOURNAL_SCHEMA_VERSION;
    if (!v1 && !v2) journalError('journal_corrupt');
    const journalFields = v1
      ? ['schemaVersion', 'revision', 'records', 'checksum']
      : ['schemaVersion', 'revision', 'records', 'tombstones', 'checksum'];
    const revision = requireOwnData(data, 'revision');
    const records = journalRecords(data);
    const tombstones = v2 ? journalTombstones(data) : null;
    const checksum = requireOwnData(data, 'checksum');
    if (!exactKeys(data, journalFields) || !Number.isSafeInteger(revision) || revision < 0 ||
        !HASH_HEX.test(checksum ?? '')) journalError('journal_corrupt');

    const recordKeys = validatedMapKeys(records, maxRecords);
    const tombstoneKeys = tombstones === null ? null : validatedMapKeys(tombstones, MAX_TOMBSTONES);
    const authorizations = new Set();
    const transactions = new Set();
    for (let index = 0; index < recordKeys.length; index += 1) {
      const key = recordKeys[index];
      const record = requireOwnData(records, key);
      if (!validateRecord(record) || key !== recordKey(record.authorizationKey, record.transactionHash) ||
          authorizations.has(record.authorizationKey) || transactions.has(record.transactionHash)) {
        journalError('journal_corrupt');
      }
      authorizations.add(record.authorizationKey);
      transactions.add(record.transactionHash);
    }
    if (tombstoneKeys !== null) {
      for (let index = 0; index < tombstoneKeys.length; index += 1) {
        const key = tombstoneKeys[index];
        const tombstone = requireOwnData(tombstones, key);
        if (!validateTombstone(tombstone) ||
            key !== recordKey(tombstone.authorizationKey, tombstone.transactionHash) ||
            authorizations.has(tombstone.authorizationKey) || transactions.has(tombstone.transactionHash)) {
          journalError('journal_corrupt');
        }
        authorizations.add(tombstone.authorizationKey);
        transactions.add(tombstone.transactionHash);
      }
    }
    return checksum;
  } catch {
    throw fixedJournalFailure('journal_corrupt');
  }
}

function validateJournal(data, maxRecords, maxFileBytes = DEFAULT_MAX_FILE_BYTES) {
  try {
    const checksum = validateJournalStructure(data, maxRecords);
    if (checksumFor(data, maxFileBytes) !== checksum) journalError('journal_corrupt');
    return data;
  } catch {
    throw fixedJournalFailure('journal_corrupt');
  }
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
        parsed = JSON_PARSE(text);
      } catch {
        throw fixedJournalFailure('journal_corrupt');
      }
      const data = validateJournal(parsed, this.maxRecords, this.maxFileBytes);
      if (!initialized) await this.#ensureInitializationMarker();
      return data;
    } catch (error) {
      throw fixedJournalFailure(fixedJournalErrorCode(error) ?? 'journal_read_failed');
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
    let handle;
    let temporaryPath;
    let temporaryCreated = false;
    let renamed = false;
    let failure = null;
    let cleanupFailed = false;
    try {
      validateJournalStructure(data, this.maxRecords);
      defineOwnData(data, 'checksum', checksumFor(data, this.maxFileBytes));
      validateJournal(data, this.maxRecords, this.maxFileBytes);
      const serialized = `${stringifyJsonWithoutHooks(data, 2, false, this.maxFileBytes)}\n`;
      if (Buffer.byteLength(serialized) > this.maxFileBytes) journalError('journal_capacity_exceeded');
      temporaryPath = join(
        this.directory,
        `.${JOURNAL_FILE_NAME}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`,
      );
      handle = await open(temporaryPath, 'wx', 0o600);
      temporaryCreated = true;
      await handle.writeFile(serialized, { encoding: 'utf8' });
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporaryPath, this.filePath);
      renamed = true;
      await syncDirectory(this.directory);
      await this.#ensureInitializationMarker();
    } catch (error) {
      const fixedCode = fixedJournalErrorCode(error);
      const code = error === JSON_SNAPSHOT_TOO_LARGE
        ? 'journal_capacity_exceeded'
        : fixedCode !== null
          ? fixedCode
          : renamed
            ? 'journal_directory_sync_failed'
            : 'journal_write_failed';
      failure = fixedJournalFailure(code);
    } finally {
      if (handle) {
        try {
          await handle.close();
        } catch {
          cleanupFailed = true;
        }
      }
      if (temporaryCreated && !renamed && temporaryPath !== undefined) {
        try {
          await unlink(temporaryPath);
        } catch (error) {
          let missing = false;
          try {
            missing = error?.code === 'ENOENT';
          } catch {
            // Cleanup errors are normalized below.
          }
          if (!missing) cleanupFailed = true;
        }
      }
      if (failure) throw failure;
      if (cleanupFailed) throw fixedJournalFailure('journal_cleanup_failed');
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
      const records = journalRecords(data);
      return {
        schemaVersion: journalSchemaVersion(data),
        revision: requireOwnData(data, 'revision'),
        records: Object.values(records).map(record => cloneJson(record)),
      };
    });
  }

  async putValidated(input) {
    const immutable = cloneJson(input);
    if (!validateInputResourceIdentity(immutable)) journalError('journal_record_invalid');
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
      const records = journalRecords(data);
      const tombstones = journalTombstones(data);
      const key = recordKey(candidate.authorizationKey, candidate.transactionHash);
      const existing = mapEntry(records, key);
      if (existing) {
        const unchanged = IMMUTABLE_RECORD_FIELDS.every(field => canonicalJson(existing[field]) === canonicalJson(candidate[field]));
        if (!unchanged) journalError('journal_identity_conflict');
        return cloneJson(existing);
      }
      for (const record of Object.values(records)) {
        if (record.authorizationKey === candidate.authorizationKey || record.transactionHash === candidate.transactionHash) {
          journalError('journal_identity_conflict');
        }
      }
      for (const tombstone of Object.values(tombstones ?? {})) {
        if (tombstone.authorizationKey === candidate.authorizationKey || tombstone.transactionHash === candidate.transactionHash) {
          journalError('journal_identity_conflict');
        }
      }
      if (Object.keys(records).length >= this.maxRecords) {
        // Never silently evict uncertain or delivery evidence. An operator may
        // archive old DELIVERED entries out of band; this PoC fails closed.
        journalError('journal_capacity_exceeded');
      }
      defineOwnData(records, key, candidate);
      data.revision += 1;
      await this.#write(data);
      return cloneJson(candidate);
    });
  }

  async get(authorizationKey, transactionHash) {
    return this.#withWriter(async () => {
      const data = await this.#read();
      const record = mapEntry(journalRecords(data), recordKey(authorizationKey, transactionHash));
      return record ? cloneJson(record) : null;
    });
  }

  async findByTransactionHash(transactionHash) {
    if (!HASH_HEX.test(transactionHash ?? '')) journalError('journal_record_invalid');
    return this.#withWriter(async () => {
      const data = await this.#read();
      const record = Object.values(journalRecords(data)).find(candidate => candidate.transactionHash === transactionHash);
      return record ? cloneJson(record) : null;
    });
  }

  async getTombstone(authorizationKey, transactionHash) {
    return this.#withWriter(async () => {
      const data = await this.#read();
      const tombstone = mapEntry(journalTombstones(data), recordKey(authorizationKey, transactionHash));
      return tombstone ? cloneJson(tombstone) : null;
    });
  }

  async findTombstoneByTransactionHash(transactionHash) {
    if (!HASH_HEX.test(transactionHash ?? '')) journalError('journal_record_invalid');
    return this.#withWriter(async () => {
      const data = await this.#read();
      const tombstone = Object.values(journalTombstones(data) ?? {})
        .find(candidate => candidate.transactionHash === transactionHash);
      return tombstone ? cloneJson(tombstone) : null;
    });
  }

  async listReconciliationCandidates(retentionMs) {
    if (retentionMs !== null && !validRetentionMs(retentionMs)) journalError('journal_retention_invalid');
    return this.#withWriter(async () => {
      const data = await this.#read();
      const records = journalRecords(data);
      const timestamp = retentionMs === null ? null : this.#now();
      return {
        records: retentionMs === null
          ? []
          : Object.values(records)
            .filter(record => isRetentionEligible(record, timestamp, retentionMs))
            .map(record => cloneJson(record)),
        tombstones: Object.values(journalTombstones(data) ?? {}).map(tombstone => cloneJson(tombstone)),
      };
    });
  }

  async getEntrySnapshot(authorizationKey, transactionHash) {
    const key = recordKey(authorizationKey, transactionHash);
    return this.#withWriter(async () => {
      const data = await this.#read();
      const record = mapEntry(journalRecords(data), key);
      if (record) {
        return { revision: data.revision, kind: 'record', entry: cloneJson(record) };
      }
      const tombstone = mapEntry(journalTombstones(data), key);
      if (tombstone) {
        return { revision: data.revision, kind: 'tombstone', entry: cloneJson(tombstone) };
      }
      return { revision: data.revision, kind: null, entry: null };
    });
  }

  async compareAndUpdateEvidence(options) {
    const snapshot = exactCasOptionsSnapshot(options, [
      'expectedRevision', 'expectedRecord', 'evidenceState', 'confirmationDetail',
    ]);
    if (!snapshot || !Number.isSafeInteger(snapshot.expectedRevision) || snapshot.expectedRevision < 0 ||
        !validateRecord(snapshot.expectedRecord) ||
        !TOMBSTONE_PRIOR_EVIDENCE_STATES.has(snapshot.expectedRecord.evidenceState) ||
        snapshot.expectedRecord.deliveryState !== DELIVERY_STATES.NONE ||
        ![EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED, EVIDENCE_STATES.MOMENTUM_INCLUDED]
          .includes(snapshot.evidenceState) ||
        (snapshot.evidenceState === EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED
          ? snapshot.confirmationDetail !== null
          : !validateConfirmationDetail(snapshot.confirmationDetail))) {
      journalError('journal_compare_and_replace_failed');
    }
    const expectedRevision = snapshot.expectedRevision;
    const evidenceState = snapshot.evidenceState;
    const expectedRecord = cloneJson(snapshot.expectedRecord);
    const confirmationDetail = snapshot.confirmationDetail === null
      ? null
      : cloneJson(snapshot.confirmationDetail, 16 * 1024);
    const key = recordKey(expectedRecord.authorizationKey, expectedRecord.transactionHash);

    return this.#withWriter(async () => {
      const data = await this.#read();
      const records = journalRecords(data);
      const current = mapEntry(records, key);
      if (data.revision !== expectedRevision || !current || mapEntry(journalTombstones(data), key) ||
          canonicalJson(current) !== canonicalJson(expectedRecord)) {
        journalError('journal_compare_and_replace_failed');
      }
      const observedAt = this.#now();
      if (current.evidenceState === evidenceState) {
        return { changed: false, record: cloneJson(current) };
      }
      const currentRank = Number(EVIDENCE_STATES.MOMENTUM_INCLUDED === current.evidenceState) * 3 +
        Number(EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED === current.evidenceState) * 2 +
        Number(EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN === current.evidenceState);
      const nextRank = evidenceState === EVIDENCE_STATES.MOMENTUM_INCLUDED ? 3 : 2;
      if (nextRank <= currentRank) journalError('journal_compare_and_replace_failed');

      const durableObservedAt = observedAt < current.updatedAt ? current.updatedAt : observedAt;
      current.evidenceState = evidenceState;
      current.momentumEvidence = confirmationDetail === null
        ? null
        : { observedAt: durableObservedAt, confirmationDetail };
      current.updatedAt = durableObservedAt;
      if (!validateRecord(current)) journalError('journal_compare_and_replace_failed');
      data.revision += 1;
      const writtenRevision = data.revision;
      await this.#write(data);
      const reloaded = await this.#read();
      const reloadedRecord = mapEntry(journalRecords(reloaded), key);
      if (reloaded.revision !== writtenRevision || canonicalJson(reloadedRecord) !== canonicalJson(current)) {
        journalError('journal_write_verification_failed');
      }
      return { changed: true, record: cloneJson(reloadedRecord) };
    });
  }

  async replaceRecordWithTombstone(options) {
    const snapshot = exactCasOptionsSnapshot(options, ['expectedRevision', 'expectedRecord', 'retentionMs']);
    if (!snapshot || !Number.isSafeInteger(snapshot.expectedRevision) || snapshot.expectedRevision < 0 ||
        !validRetentionMs(snapshot.retentionMs) ||
        !validateRecord(snapshot.expectedRecord)) {
      journalError('journal_compare_and_replace_failed');
    }
    const expectedRevision = snapshot.expectedRevision;
    const retentionMs = snapshot.retentionMs;
    const expectedRecord = cloneJson(snapshot.expectedRecord);
    const key = recordKey(expectedRecord.authorizationKey, expectedRecord.transactionHash);

    return this.#withWriter(async () => {
      const data = await this.#read();
      const records = journalRecords(data);
      const current = mapEntry(records, key);
      if (data.revision !== expectedRevision || !current || mapEntry(journalTombstones(data), key) ||
          canonicalJson(current) !== canonicalJson(expectedRecord) ||
          !TOMBSTONE_PRIOR_EVIDENCE_STATES.has(current.evidenceState)) {
        journalError('journal_compare_and_replace_failed');
      }

      const terminalizedAt = this.#now();
      if (!isRetentionEligible(current, terminalizedAt, retentionMs)) journalError('journal_compare_and_replace_failed');
      const currentTombstones = journalTombstones(data);
      if (Object.keys(currentTombstones ?? {}).length >= MAX_TOMBSTONES) journalError('journal_capacity_exceeded');

      const tombstone = tombstoneFromRecord(current, terminalizedAt);
      if (!validateTombstone(tombstone)) journalError('journal_compare_and_replace_failed');
      if (data.schemaVersion === INITIAL_JOURNAL_SCHEMA_VERSION) {
        data.schemaVersion = JOURNAL_SCHEMA_VERSION;
        defineOwnData(data, 'tombstones', {});
      }
      const tombstones = journalTombstones(data);
      delete records[key];
      defineOwnData(tombstones, key, tombstone);
      data.revision += 1;
      const writtenRevision = data.revision;
      await this.#write(data);

      const reloaded = await this.#read();
      const reloadedRecord = mapEntry(journalRecords(reloaded), key);
      const reloadedTombstone = mapEntry(journalTombstones(reloaded), key);
      if (reloaded.schemaVersion !== JOURNAL_SCHEMA_VERSION || reloaded.revision !== writtenRevision ||
          reloadedRecord || canonicalJson(reloadedTombstone) !== canonicalJson(tombstone)) {
        journalError('journal_write_verification_failed');
      }
      return cloneJson(reloadedTombstone);
    });
  }

  async recordLateMomentumEvidence(options) {
    const snapshot = exactCasOptionsSnapshot(options, [
      'expectedRevision', 'expectedTombstone', 'confirmationDetail',
    ]);
    if (!snapshot || !Number.isSafeInteger(snapshot.expectedRevision) || snapshot.expectedRevision < 0 ||
        !validateTombstone(snapshot.expectedTombstone) || !validateConfirmationDetail(snapshot.confirmationDetail)) {
      journalError('journal_compare_and_replace_failed');
    }
    const expectedRevision = snapshot.expectedRevision;
    const expectedTombstone = cloneJson(snapshot.expectedTombstone);
    const confirmationDetail = cloneJson(snapshot.confirmationDetail, 16 * 1024);
    const key = recordKey(expectedTombstone.authorizationKey, expectedTombstone.transactionHash);

    return this.#withWriter(async () => {
      const data = await this.#read();
      const current = mapEntry(journalTombstones(data), key);
      if (!current || mapEntry(journalRecords(data), key) || !sameTombstoneIdentity(current, expectedTombstone)) {
        journalError('journal_compare_and_replace_failed');
      }
      if (current.lateMomentumEvidence !== null) return { changed: false, tombstone: cloneJson(current) };
      if (data.revision !== expectedRevision ||
          canonicalJson(current) !== canonicalJson(expectedTombstone)) {
        journalError('journal_compare_and_replace_failed');
      }

      const observedAt = this.#now();
      current.lateMomentumEvidence = {
        observedAt: observedAt < current.terminalizedAt ? current.terminalizedAt : observedAt,
        confirmationDetail,
      };
      if (!validateTombstone(current)) journalError('journal_compare_and_replace_failed');
      data.revision += 1;
      const writtenRevision = data.revision;
      await this.#write(data);

      const reloaded = await this.#read();
      const reloadedTombstone = mapEntry(journalTombstones(reloaded), key);
      if (reloaded.revision !== writtenRevision ||
          canonicalJson(reloadedTombstone) !== canonicalJson(current)) {
        journalError('journal_write_verification_failed');
      }
      return { changed: true, tombstone: cloneJson(reloadedTombstone) };
    });
  }

  async updateEvidence(authorizationKey, transactionHash, evidenceState, momentumEvidence = undefined) {
    if (!Object.values(EVIDENCE_STATES).includes(evidenceState)) journalError('journal_evidence_invalid');
    let immutableMomentumEvidence = null;
    if (evidenceState === EVIDENCE_STATES.MOMENTUM_INCLUDED) {
      try {
        immutableMomentumEvidence = cloneJson(momentumEvidence, 16 * 1024);
      } catch {
        journalError('journal_momentum_evidence_invalid');
      }
      if (!validateMomentumEvidence(immutableMomentumEvidence)) journalError('journal_momentum_evidence_invalid');
    }
    return this.#withWriter(async () => {
      const data = await this.#read();
      const key = recordKey(authorizationKey, transactionHash);
      const record = mapEntry(journalRecords(data), key);
      if (!record) journalError('journal_record_not_found');

      const current = record.evidenceState;
      const shouldIgnore =
        current === EVIDENCE_STATES.MOMENTUM_INCLUDED ||
        (current === EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED &&
          [EVIDENCE_STATES.VALIDATED, EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN].includes(evidenceState)) ||
        (current === EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN && evidenceState === EVIDENCE_STATES.VALIDATED);
      if (shouldIgnore || current === evidenceState) return cloneJson(record);

      if (evidenceState === EVIDENCE_STATES.MOMENTUM_INCLUDED) {
        record.momentumEvidence = cloneJson(immutableMomentumEvidence, 16 * 1024);
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
      const record = mapEntry(journalRecords(data), key);
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
      const record = mapEntry(journalRecords(data), key);
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

  async list(options = undefined) {
    const includeTombstones = options !== undefined;
    if (includeTombstones && !exactKeys(options, ['includeTombstones'])) {
      journalError('journal_options_invalid');
    }
    if (includeTombstones && options.includeTombstones !== true) journalError('journal_options_invalid');
    return this.#withWriter(async () => {
      const data = await this.#read();
      const records = Object.values(journalRecords(data)).map(record => cloneJson(record));
      if (!includeTombstones) return records;
      return {
        records,
        tombstones: Object.values(journalTombstones(data) ?? {}).map(tombstone => cloneJson(tombstone)),
      };
    });
  }
}
