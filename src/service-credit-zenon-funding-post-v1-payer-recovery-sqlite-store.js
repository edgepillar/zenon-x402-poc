import { createHash } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { types as utilTypes } from 'node:util';
import {
  snapshotOriginalServiceRequestCustodyPolicy,
  snapshotOriginalServiceRequestCustodyKey,
  captureOriginalServiceRequestCustody,
  parseOriginalServiceRequestCustody,
  serializeOriginalServiceRequestCustody,
} from './service-credit-original-request-custody-contract.js';

import {
  decodeB64Json,
  encodeB64Json,
  EXPERIMENTAL_LIVE_NETWORK,
  MAX_X402_HEADER_ENCODED_BYTES,
  sameRequirements,
  sameResource,
  validateActiveUpfrontRequirement,
  validatePaymentPayloadEnvelope,
  validatePaymentRequired,
} from './x402-wire.js';

export const ZENON_FUNDING_PAYER_RECOVERY_SQLITE_SCHEMA_VERSION = 1;
export const ZENON_FUNDING_PAYER_RECOVERY_CUSTODY_SQLITE_SCHEMA_VERSION = 2;
export const ZENON_FUNDING_PAYER_RECOVERY_STATUS = Object.freeze({
  PREPARED: 'PREPARED',
  ATTEMPT_FENCED: 'ATTEMPT_FENCED',
  OUTCOME_UNKNOWN: 'OUTCOME_UNKNOWN',
  BOUND: 'BOUND',
  PAYMENT_REJECTED: 'PAYMENT_REJECTED',
  PAYMENT_CONFLICT: 'PAYMENT_CONFLICT',
});

const APPLICATION_ID = 0x5a505252;
const DATABASE_USER_VERSION = 1;
const ENVELOPE_SCHEMA_VERSION = 1;
const MAX_RESOURCE_URL_BYTES = 4096;
const MAX_RECORD_BYTES = 48 * 1024;
const MAX_NODES = 4096;
const MAX_DEPTH = 32;
const REQUEST_TARGET = /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@]+(?:\/[A-Za-z0-9\-._~!$&'()*+,;=:@]+)*$/;
const DOT_SEGMENT = /(?:^|\/)\.{1,2}(?:\/|$)/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const STATUSES = Object.freeze(Object.values(ZENON_FUNDING_PAYER_RECOVERY_STATUS));
const TERMINAL_STATUSES = Object.freeze([
  ZENON_FUNDING_PAYER_RECOVERY_STATUS.BOUND,
  ZENON_FUNDING_PAYER_RECOVERY_STATUS.PAYMENT_REJECTED,
  ZENON_FUNDING_PAYER_RECOVERY_STATUS.PAYMENT_CONFLICT,
]);
const OPEN_DATABASE_PATHS = new Set();
const TABLE_META = 'CREATE TABLE payer_recovery_meta(singleton INTEGER PRIMARY KEY CHECK(singleton = 1), resource_url TEXT NOT NULL, owner_epoch INTEGER NOT NULL CHECK(owner_epoch >= 0)) STRICT';
const TABLE_STATE = 'CREATE TABLE payer_recovery_state(singleton INTEGER PRIMARY KEY CHECK(singleton = 1), revision INTEGER NOT NULL CHECK(revision >= 1), status TEXT NOT NULL CHECK(status IN (\'PREPARED\',\'ATTEMPT_FENCED\',\'OUTCOME_UNKNOWN\',\'BOUND\',\'PAYMENT_REJECTED\',\'PAYMENT_CONFLICT\')), ambiguity_latched INTEGER NOT NULL CHECK(ambiguity_latched IN (0,1)), challenge_digest TEXT NOT NULL, payment_digest TEXT NOT NULL, envelope TEXT NOT NULL) STRICT';
const STORE_CLOSE_FAILED = 'ZENON_FUNDING_PAYER_RECOVERY_STORE_CLOSE_FAILED';
const CUSTODY_DATABASE_USER_VERSION = 2;
const CUSTODY_POLICY = snapshotOriginalServiceRequestCustodyPolicy;
const CUSTODY_KEY = snapshotOriginalServiceRequestCustodyKey;
const CUSTODY_CAPTURE = captureOriginalServiceRequestCustody;
const CUSTODY_PARSE = parseOriginalServiceRequestCustody;
const CUSTODY_SERIALIZE = serializeOriginalServiceRequestCustody;
const TABLE_CUSTODY_POLICY = 'CREATE TABLE original_request_custody_policy(singleton INTEGER PRIMARY KEY CHECK(singleton = 1), policy_version INTEGER NOT NULL CHECK(policy_version = 1), max_requests INTEGER NOT NULL CHECK(max_requests >= 1 AND max_requests <= 1024), service_resource_url TEXT NOT NULL) STRICT';
const TABLE_ORIGINAL_REQUESTS = 'CREATE TABLE original_service_requests(grant_id TEXT NOT NULL, request_id TEXT NOT NULL, funding_singleton INTEGER NOT NULL CHECK(funding_singleton = 1) REFERENCES payer_recovery_state(singleton), payment_hash TEXT NOT NULL, network TEXT NOT NULL, service_resource_url TEXT NOT NULL, envelope TEXT NOT NULL, PRIMARY KEY(grant_id,request_id)) STRICT';

function custodyEnabled(config) {
  return Object.hasOwn(config, 'custodyPolicy');
}

function databaseVersion(config) {
  return custodyEnabled(config) ? CUSTODY_DATABASE_USER_VERSION : DATABASE_USER_VERSION;
}

// Read the fixed SQLite header without opening a writable SQLite connection.
// This does not migrate, recover or rewrite a wrong-version existing file.
function assertVersionHeader(config, identity) {
  let descriptor;
  let problem;
  try {
    const noFollow = fsConstants.O_NOFOLLOW ?? 0;
    if (noFollow === 0) fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_UNSAFE_FILE');
    descriptor = openSync(
      config.databasePath,
      fsConstants.O_RDONLY | noFollow | (fsConstants.O_CLOEXEC ?? 0),
    );
    const stat = fstatSync(descriptor, { bigint: true });
    if (!safeFile(stat) || !sameFile(stat, identity)) {
      fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_UNSAFE_FILE');
    }
    const header = Buffer.alloc(100);
    if (readSync(descriptor, header, 0, 100, 0) !== 100
        || header.subarray(0, 16).toString('ascii') !== 'SQLite format 3\0'
        || header.readUInt32BE(60) !== databaseVersion(config)
        || header.readUInt32BE(68) !== APPLICATION_ID) {
      fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_SCHEMA_UNSUPPORTED');
    }
    inspectFile(config, identity);
  } catch (error) {
    problem = failure(
      knownCode(error) ?? 'ZENON_FUNDING_PAYER_RECOVERY_STORE_SCHEMA_UNSUPPORTED',
    );
  } finally {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); }
      catch { problem = failure(STORE_CLOSE_FAILED); }
    }
  }
  if (problem) throw problem;
}

function custodyBinding(current) {
  return {
    fundingResourceUrl: current.resourceUrl,
    paymentHash: current.paymentPayload.payload.transaction.hash,
    network: current.requirement.network,
  };
}

function validateCustodyPolicy(database, config) {
  const code = 'ZENON_FUNDING_PAYER_RECOVERY_STORE_SCHEMA_UNSUPPORTED';
  try {
    const rows = database.prepare(
      'SELECT singleton,policy_version,max_requests,service_resource_url FROM original_request_custody_policy',
    ).all();
    if (rows.length !== 1 || rows[0].singleton !== 1) fail(code);
    const actual = CUSTODY_POLICY({
      policyVersion: rows[0].policy_version,
      maxRequests: rows[0].max_requests,
      serviceResourceUrl: rows[0].service_resource_url,
    }, config.resourceUrl);
    if (actual.policyVersion !== config.custodyPolicy.policyVersion
        || actual.maxRequests !== config.custodyPolicy.maxRequests
        || actual.serviceResourceUrl !== config.custodyPolicy.serviceResourceUrl) fail(code);
    return actual;
  } catch {
    fail(code);
  }
}

function custodyRecordFromRow(row, current, config) {
  const code = 'ZENON_FUNDING_PAYER_RECOVERY_STORE_CORRUPT';
  try {
    if (current === null || row === null || typeof row !== 'object') fail(code);
    const stored = CUSTODY_PARSE(row.envelope);
    const rebound = CUSTODY_CAPTURE({
      originalRequestJson: stored.originalRequestJson,
      originalBodyBase64: stored.originalBodyBase64,
      serviceResourceUrl: stored.serviceResourceUrl,
    }, custodyBinding(current));
    if (row.funding_singleton !== 1
        || row.grant_id !== rebound.grantId || row.request_id !== rebound.requestId
        || row.payment_hash !== rebound.paymentHash || row.network !== rebound.network
        || row.service_resource_url !== rebound.serviceResourceUrl
        || rebound.serviceResourceUrl !== config.custodyPolicy.serviceResourceUrl
        || CUSTODY_SERIALIZE(rebound) !== row.envelope) fail(code);
    return rebound;
  } catch {
    fail(code);
  }
}

function validateCustodyRows(database, config, current) {
  const policy = validateCustodyPolicy(database, config);
  const count = database.prepare(
    'SELECT COUNT(*) AS count FROM original_service_requests',
  ).get()?.count;
  if (!Number.isSafeInteger(count) || count < 0 || count > policy.maxRequests
      || (current === null && count !== 0)) {
    fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_CORRUPT');
  }
  const rows = database.prepare(
    'SELECT * FROM original_service_requests ORDER BY grant_id,request_id LIMIT ?',
  ).all(policy.maxRequests + 1);
  if (rows.length !== count) fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_CORRUPT');
  for (const row of rows) custodyRecordFromRow(row, current, config);
  return count;
}

function custodyRetainInput(input) {
  const code = 'ZENON_FUNDING_PAYER_RECOVERY_STORE_INVALID_INPUT';
  if (input === null || typeof input !== 'object' || utilTypes.isProxy(input)
      || Object.getPrototypeOf(input) !== Object.prototype) fail(code);
  const values = exactDataObject(input, [
    'grantId', 'requestId', 'originalRequestJson', 'originalBodyBase64',
    'serviceResourceUrl',
  ], code);
  let key;
  try { key = CUSTODY_KEY({ grantId: values.grantId, requestId: values.requestId }); }
  catch { fail(code); }
  return {
    key,
    original: {
      originalRequestJson: values.originalRequestJson,
      originalBodyBase64: values.originalBodyBase64,
      serviceResourceUrl: values.serviceResourceUrl,
    },
  };
}

export class ZenonFundingPayerRecoverySqliteStoreError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ZenonFundingPayerRecoverySqliteStoreError';
    this.code = code;
    Object.defineProperty(this, 'stack', {
      value: `ZenonFundingPayerRecoverySqliteStoreError: ${code}`,
      writable: true,
      enumerable: false,
      configurable: true,
    });
  }
}

function failure(code) {
  return new ZenonFundingPayerRecoverySqliteStoreError(code);
}

function fail(code) {
  throw failure(code);
}

function knownCode(error) {
  return error instanceof ZenonFundingPayerRecoverySqliteStoreError ? error.code : null;
}

function byteLength(value) {
  return Buffer.byteLength(value, 'utf8');
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function digest(domain, value) {
  return `sha256:${createHash('sha256')
    .update(domain)
    .update('\0')
    .update(typeof value === 'string' ? value : canonicalJson(value))
    .digest('hex')}`;
}

function exactDataObject(value, keys, code) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || utilTypes.isProxy(value)
  ) fail(code);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(code);
  const observed = Reflect.ownKeys(value);
  if (
    observed.length !== keys.length
    || observed.some(key => typeof key !== 'string' || !keys.includes(key))
  ) fail(code);
  const output = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail(code);
    output[key] = descriptor.value;
  }
  return output;
}

function snapshotJson(value, code) {
  const seen = new Set();
  let nodes = 0;
  function visit(input, depth) {
    nodes += 1;
    if (nodes > MAX_NODES || depth > MAX_DEPTH) fail(code);
    if (input === null || typeof input === 'boolean') return input;
    if (typeof input === 'string') {
      if (byteLength(input) > MAX_RECORD_BYTES) fail(code);
      return input;
    }
    if (typeof input === 'number' && Number.isSafeInteger(input)) return input;
    if (typeof input !== 'object' || utilTypes.isProxy(input) || seen.has(input)) fail(code);
    const prototype = Object.getPrototypeOf(input);
    if (Array.isArray(input)) {
      if (prototype !== Array.prototype || input.length > 512) fail(code);
    } else if (prototype !== Object.prototype && prototype !== null) {
      fail(code);
    }
    seen.add(input);
    const keys = Reflect.ownKeys(input);
    if (keys.length > 512) fail(code);
    const output = Array.isArray(input) ? [] : {};
    let members = 0;
    for (const key of keys) {
      if (typeof key !== 'string') fail(code);
      if (Array.isArray(input) && key === 'length') continue;
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') fail(code);
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail(code);
      if (Array.isArray(input)) {
        if (!/^(?:0|[1-9][0-9]*)$/.test(key) || Number(key) >= input.length) fail(code);
        members += 1;
      }
      output[key] = visit(descriptor.value, depth + 1);
    }
    if (Array.isArray(input) && members !== input.length) fail(code);
    seen.delete(input);
    return output;
  }
  return visit(value, 0);
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function canonicalResourceUrl(value, code) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > MAX_RESOURCE_URL_BYTES
    || byteLength(value) > MAX_RESOURCE_URL_BYTES
    || value.includes('\r')
    || value.includes('\n')
    || value.includes('#')
  ) fail(code);
  let parsed;
  try { parsed = new URL(value); } catch { fail(code); }
  if (
    parsed.protocol !== 'https:'
    || parsed.username !== ''
    || parsed.password !== ''
    || parsed.hostname === ''
    || parsed.search !== ''
    || parsed.hash !== ''
    || parsed.href !== value
    || parsed.pathname === '/'
    || parsed.pathname.length > MAX_RESOURCE_URL_BYTES
    || byteLength(parsed.pathname) > MAX_RESOURCE_URL_BYTES
    || !REQUEST_TARGET.test(parsed.pathname)
    || DOT_SEGMENT.test(parsed.pathname)
  ) fail(code);
  return value;
}

function parseCanonicalHeader(value, validator, code) {
  try {
    if (
      typeof value !== 'string'
      || value.length === 0
      || value.length > MAX_X402_HEADER_ENCODED_BYTES
      || byteLength(value) > MAX_X402_HEADER_ENCODED_BYTES
      || !BASE64.test(value)
    ) fail(code);
    const decoded = decodeB64Json(value, {
      maxDecodedBytes: MAX_X402_HEADER_ENCODED_BYTES,
      maxEncodedBytes: MAX_X402_HEADER_ENCODED_BYTES,
    });
    validator(decoded);
    if (encodeB64Json(decoded, {
      maxEncodedBytes: MAX_X402_HEADER_ENCODED_BYTES,
    }) !== value) fail(code);
    return decoded;
  } catch (error) {
    if (error instanceof ZenonFundingPayerRecoverySqliteStoreError) throw error;
    fail(code);
  }
}

export function captureZenonFundingPostV1PayerRecoveryPair(input, resourceUrl) {
  const code = 'ZENON_FUNDING_PAYER_RECOVERY_STORE_INVALID_INPUT';
  const fixedResource = canonicalResourceUrl(resourceUrl, code);
  const values = exactDataObject(input, ['challenge', 'paymentSignatureHeader'], code);
  const challenge = exactDataObject(values.challenge, [
    'status', 'resourceUrl', 'paymentRequiredHeader', 'paymentRequired',
  ], code);
  if (challenge.status !== 'PAYMENT_REQUIRED' || challenge.resourceUrl !== fixedResource) {
    fail(code);
  }
  const paymentRequired = parseCanonicalHeader(
    challenge.paymentRequiredHeader,
    validatePaymentRequired,
    code,
  );
  let suppliedRequired;
  try {
    suppliedRequired = snapshotJson(challenge.paymentRequired, code);
    validatePaymentRequired(suppliedRequired);
  } catch {
    fail(code);
  }
  if (canonicalJson(paymentRequired) !== canonicalJson(suppliedRequired)) fail(code);
  if (
    paymentRequired.resource.url !== fixedResource
    || !Array.isArray(paymentRequired.accepts)
    || paymentRequired.accepts.length !== 1
  ) fail(code);
  try { validateActiveUpfrontRequirement(paymentRequired.accepts[0]); }
  catch { fail(code); }
  if (paymentRequired.accepts[0].network !== EXPERIMENTAL_LIVE_NETWORK) fail(code);
  const paymentPayload = parseCanonicalHeader(
    values.paymentSignatureHeader,
    validatePaymentPayloadEnvelope,
    code,
  );
  const requirement = paymentRequired.accepts[0];
  if (
    paymentPayload.x402Version !== paymentRequired.x402Version
    || !sameRequirements(paymentPayload.accepted, requirement)
    || !sameResource(paymentPayload.resource, paymentRequired.resource)
  ) fail(code);
  return deepFreeze({
    resourceUrl: fixedResource,
    challengeHeader: challenge.paymentRequiredHeader,
    paymentHeader: values.paymentSignatureHeader,
    paymentRequired,
    paymentPayload,
    requirement,
  });
}

function stateInvariant(status, ambiguityLatched) {
  if (!STATUSES.includes(status) || typeof ambiguityLatched !== 'boolean') return false;
  if (status === ZENON_FUNDING_PAYER_RECOVERY_STATUS.PREPARED) return !ambiguityLatched;
  if (status === ZENON_FUNDING_PAYER_RECOVERY_STATUS.OUTCOME_UNKNOWN) return ambiguityLatched;
  if (
    status === ZENON_FUNDING_PAYER_RECOVERY_STATUS.PAYMENT_REJECTED
    || status === ZENON_FUNDING_PAYER_RECOVERY_STATUS.PAYMENT_CONFLICT
  ) return !ambiguityLatched;
  return true;
}

function envelope(pair, revision, status, ambiguityLatched) {
  const core = {
    schemaVersion: ENVELOPE_SCHEMA_VERSION,
    revision,
    status,
    ambiguityLatched,
    resourceUrl: pair.resourceUrl,
    challengeHeader: pair.challengeHeader,
    paymentHeader: pair.paymentHeader,
  };
  return {
    ...core,
    checksum: digest('zenon-x402:payer-recovery-envelope-v1', core),
  };
}

function recordFromEnvelope(parsed, pair) {
  return deepFreeze({
    revision: parsed.revision,
    status: parsed.status,
    ambiguityLatched: parsed.ambiguityLatched,
    resourceUrl: pair.resourceUrl,
    challengeHeader: pair.challengeHeader,
    paymentHeader: pair.paymentHeader,
    paymentRequired: pair.paymentRequired,
    paymentPayload: pair.paymentPayload,
    requirement: pair.requirement,
  });
}

function parseRow(row, resourceUrl) {
  const code = 'ZENON_FUNDING_PAYER_RECOVERY_STORE_CORRUPT';
  try {
    if (
      row === null
      || typeof row !== 'object'
      || typeof row.envelope !== 'string'
      || byteLength(row.envelope) > MAX_RECORD_BYTES
    ) fail(code);
    const parsed = JSON.parse(row.envelope);
    exactDataObject(parsed, [
      'schemaVersion', 'revision', 'status', 'ambiguityLatched', 'resourceUrl',
      'challengeHeader', 'paymentHeader', 'checksum',
    ], code);
    if (
      parsed.schemaVersion !== ENVELOPE_SCHEMA_VERSION
      || !Number.isSafeInteger(parsed.revision)
      || parsed.revision < 1
      || parsed.resourceUrl !== resourceUrl
      || !stateInvariant(parsed.status, parsed.ambiguityLatched)
      || !DIGEST.test(parsed.checksum)
      || canonicalJson(parsed) !== row.envelope
    ) fail(code);
    const expectedCore = {
      schemaVersion: parsed.schemaVersion,
      revision: parsed.revision,
      status: parsed.status,
      ambiguityLatched: parsed.ambiguityLatched,
      resourceUrl: parsed.resourceUrl,
      challengeHeader: parsed.challengeHeader,
      paymentHeader: parsed.paymentHeader,
    };
    if (
      parsed.checksum !== digest('zenon-x402:payer-recovery-envelope-v1', expectedCore)
    ) fail(code);
    const paymentRequired = parseCanonicalHeader(
      parsed.challengeHeader,
      validatePaymentRequired,
      code,
    );
    const pair = captureZenonFundingPostV1PayerRecoveryPair({
      challenge: {
        status: 'PAYMENT_REQUIRED',
        resourceUrl,
        paymentRequiredHeader: parsed.challengeHeader,
        paymentRequired,
      },
      paymentSignatureHeader: parsed.paymentHeader,
    }, resourceUrl);
    if (
      row.singleton !== 1
      || row.revision !== parsed.revision
      || row.status !== parsed.status
      || row.ambiguity_latched !== Number(parsed.ambiguityLatched)
      || row.challenge_digest !== digest(
        'zenon-x402:payer-recovery-challenge-v1',
        pair.challengeHeader,
      )
      || row.payment_digest !== digest(
        'zenon-x402:payer-recovery-payment-v1',
        pair.paymentHeader,
      )
    ) fail(code);
    return recordFromEnvelope(parsed, pair);
  } catch {
    fail(code);
  }
}

function privateRoot(path) {
  const code = 'ZENON_FUNDING_PAYER_RECOVERY_STORE_UNSAFE_DIRECTORY';
  try {
    if (
      typeof process.getuid !== 'function'
      || !isAbsolute(path)
      || resolve(path) !== path
    ) fail(code);
    const stat = lstatSync(path, { bigint: true });
    if (
      !stat.isDirectory()
      || stat.isSymbolicLink()
      || stat.uid !== BigInt(process.getuid())
      || (stat.mode & 0o777n) !== 0o700n
      || (stat.mode & 0o7000n) !== 0n
      || realpathSync(path) !== path
    ) fail(code);
    return stat;
  } catch (error) {
    throw failure(knownCode(error) ?? code);
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
    const prefix = `${basename(configuration.databasePath)}-`;
    for (const entry of readdirSync(configuration.allowedRoot)) {
      if (!entry.startsWith(prefix)) continue;
      if (creating || entry !== `${basename(configuration.databasePath)}-journal`) {
        fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_UNEXPECTED_SIDECAR');
      }
      if (!safeFile(lstatSync(join(configuration.allowedRoot, entry), { bigint: true }))) {
        fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_UNSAFE_FILE');
      }
    }
    const current = lstatSync(configuration.databasePath, { bigint: true });
    if (
      !safeFile(current)
      || realpathSync(configuration.databasePath) !== configuration.databasePath
      || (expected && !sameFile(expected, current))
    ) fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_UNSAFE_FILE');
    return current;
  } catch (error) {
    throw failure(
      knownCode(error) ?? 'ZENON_FUNDING_PAYER_RECOVERY_STORE_UNSAFE_FILE',
    );
  }
}

function createFile(configuration) {
  let descriptor;
  try {
    const {
      O_CLOEXEC = 0,
      O_CREAT,
      O_EXCL,
      O_NOFOLLOW = 0,
      O_RDWR,
    } = fsConstants;
    if (O_NOFOLLOW === 0) fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_UNSAFE_FILE');
    descriptor = openSync(
      configuration.databasePath,
      O_RDWR | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC,
      0o600,
    );
    fchmodSync(descriptor, 0o600);
    const opened = fstatSync(descriptor, { bigint: true });
    if (!safeFile(opened)) fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_UNSAFE_FILE');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    return inspectFile(configuration, opened, true);
  } catch (error) {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch {}
    }
    throw failure(
      knownCode(error) ?? 'ZENON_FUNDING_PAYER_RECOVERY_STORE_CREATE_FAILED',
    );
  }
}

function syncParentDirectory(parent) {
  let descriptor;
  try {
    const {
      O_CLOEXEC = 0,
      O_DIRECTORY = 0,
      O_NOFOLLOW = 0,
      O_RDONLY,
    } = fsConstants;
    if (O_DIRECTORY === 0 || O_NOFOLLOW === 0) {
      fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_DIRECTORY_SYNC_FAILED');
    }
    descriptor = openSync(parent, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    fsyncSync(descriptor);
    closeSync(descriptor);
  } catch (error) {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch {}
    }
    throw failure(
      knownCode(error) ?? 'ZENON_FUNDING_PAYER_RECOVERY_STORE_DIRECTORY_SYNC_FAILED',
    );
  }
}

function pragmaValue(database, sql, field) {
  return database.prepare(sql).get()?.[field];
}

function configuration(options) {
  const code = 'ZENON_FUNDING_PAYER_RECOVERY_STORE_INVALID_CONFIGURATION';
  const input = exactDataObject(options, [
    'databasePath', 'allowedRoot', 'resourceUrl',
  ], code);
  if (
    typeof input.databasePath !== 'string'
    || typeof input.allowedRoot !== 'string'
    || !isAbsolute(input.databasePath)
    || !isAbsolute(input.allowedRoot)
    || resolve(input.databasePath) !== input.databasePath
    || resolve(input.allowedRoot) !== input.allowedRoot
    || dirname(input.databasePath) !== input.allowedRoot
  ) fail(code);
  privateRoot(input.allowedRoot);
  return Object.freeze({
    databasePath: input.databasePath,
    allowedRoot: input.allowedRoot,
    resourceUrl: canonicalResourceUrl(input.resourceUrl, code),
  });
}

function validateDefinitions(database, config) {
  const definitions = database
    .prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name")
    .all();
  if (custodyEnabled(config)) {
    const expected = [
      ['original_request_custody_policy', TABLE_CUSTODY_POLICY],
      ['original_service_requests', TABLE_ORIGINAL_REQUESTS],
      ['payer_recovery_meta', TABLE_META],
      ['payer_recovery_state', TABLE_STATE],
    ];
    if (definitions.length !== expected.length) {
      fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_SCHEMA_UNSUPPORTED');
    }
    for (let index = 0; index < expected.length; index += 1) {
      if (definitions[index].type !== 'table'
          || definitions[index].name !== expected[index][0]
          || definitions[index].sql !== expected[index][1]) {
        fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_SCHEMA_UNSUPPORTED');
      }
    }
    return;
  }
  if (
    definitions.length !== 2
    || definitions[0].type !== 'table'
    || definitions[0].name !== 'payer_recovery_meta'
    || definitions[0].sql !== TABLE_META
    || definitions[1].type !== 'table'
    || definitions[1].name !== 'payer_recovery_state'
    || definitions[1].sql !== TABLE_STATE
  ) fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_SCHEMA_UNSUPPORTED');
}

function validateDatabase(database, config) {
  if (
    pragmaValue(database, 'PRAGMA application_id', 'application_id') !== APPLICATION_ID
    || pragmaValue(database, 'PRAGMA user_version', 'user_version') !== databaseVersion(config)
    || pragmaValue(database, 'PRAGMA integrity_check', 'integrity_check') !== 'ok'
  ) fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_SCHEMA_UNSUPPORTED');
  validateDefinitions(database, config);
  const meta = database
    .prepare('SELECT singleton,resource_url,owner_epoch FROM payer_recovery_meta')
    .all();
  if (
    meta.length !== 1
    || meta[0].singleton !== 1
    || meta[0].resource_url !== config.resourceUrl
    || !Number.isSafeInteger(meta[0].owner_epoch)
    || meta[0].owner_epoch < 0
  ) fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_SCHEMA_UNSUPPORTED');
  const rows = database.prepare('SELECT * FROM payer_recovery_state').all();
  if (rows.length > 1) fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_CORRUPT');
  if (rows.length === 1) parseRow(rows[0], config.resourceUrl);
  if (custodyEnabled(config)) {
    const current = rows.length === 1 ? parseRow(rows[0], config.resourceUrl) : null;
    validateCustodyRows(database, config, current);
  }
}

function configureConnection(database, creating) {
  database.exec('PRAGMA busy_timeout = 0');
  if (creating) {
    const journalMode = database.prepare(
      'PRAGMA journal_mode = DELETE',
    ).get()?.journal_mode;
    if (journalMode !== 'delete') {
      fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_SCHEMA_UNSUPPORTED');
    }
  }
  database.exec('PRAGMA synchronous = FULL');
  database.exec('PRAGMA foreign_keys = ON');
  database.exec('PRAGMA trusted_schema = OFF');
  database.exec('PRAGMA recursive_triggers = OFF');
  database.exec('PRAGMA locking_mode = EXCLUSIVE');
  if (process.platform === 'darwin') database.exec('PRAGMA fullfsync = ON');
  if (
    pragmaValue(database, 'PRAGMA busy_timeout', 'timeout') !== 0
    || pragmaValue(database, 'PRAGMA synchronous', 'synchronous') !== 2
    || pragmaValue(database, 'PRAGMA foreign_keys', 'foreign_keys') !== 1
    || pragmaValue(database, 'PRAGMA trusted_schema', 'trusted_schema') !== 0
    || pragmaValue(database, 'PRAGMA recursive_triggers', 'recursive_triggers') !== 0
    || pragmaValue(database, 'PRAGMA locking_mode', 'locking_mode') !== 'exclusive'
    || (process.platform === 'darwin'
      && pragmaValue(database, 'PRAGMA fullfsync', 'fullfsync') !== 1)
    || (
      creating
      && pragmaValue(database, 'PRAGMA journal_mode', 'journal_mode') !== 'delete'
    )
  ) fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_SCHEMA_UNSUPPORTED');
}

function validateConnection(database) {
  if (
    pragmaValue(database, 'PRAGMA journal_mode', 'journal_mode') !== 'delete'
    || pragmaValue(database, 'PRAGMA busy_timeout', 'timeout') !== 0
    || pragmaValue(database, 'PRAGMA synchronous', 'synchronous') !== 2
    || pragmaValue(database, 'PRAGMA foreign_keys', 'foreign_keys') !== 1
    || pragmaValue(database, 'PRAGMA trusted_schema', 'trusted_schema') !== 0
    || pragmaValue(database, 'PRAGMA recursive_triggers', 'recursive_triggers') !== 0
    || pragmaValue(database, 'PRAGMA locking_mode', 'locking_mode') !== 'exclusive'
    || (process.platform === 'darwin'
      && pragmaValue(database, 'PRAGMA fullfsync', 'fullfsync') !== 1)
  ) fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_SCHEMA_UNSUPPORTED');
}

function openDatabase(config, identity, creating) {
  if (!creating) assertVersionHeader(config, identity);
  let database;
  let transaction = false;
  let lockAttempted = false;
  try {
    database = new DatabaseSync(config.databasePath, {
      allowExtension: false,
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true,
      readOnly: false,
      timeout: 0,
    });
    inspectFile(config, identity);
    if (!creating) lockAttempted = true;
    configureConnection(database, creating);
    database.exec('BEGIN IMMEDIATE');
    transaction = true;
    validateConnection(database);
    if (creating) {
      database.exec(`PRAGMA application_id = ${APPLICATION_ID}`);
      database.exec(`PRAGMA user_version = ${databaseVersion(config)}`);
      database.exec(TABLE_META);
      database.exec(TABLE_STATE);
      database.prepare(
        'INSERT INTO payer_recovery_meta(singleton,resource_url,owner_epoch) VALUES(1,?,0)',
      ).run(config.resourceUrl);
      if (custodyEnabled(config)) {
        database.exec(TABLE_CUSTODY_POLICY);
        database.exec(TABLE_ORIGINAL_REQUESTS);
        database.prepare(
          'INSERT INTO original_request_custody_policy(singleton,policy_version,max_requests,service_resource_url) VALUES(1,?,?,?)',
        ).run(
          config.custodyPolicy.policyVersion,
          config.custodyPolicy.maxRequests,
          config.custodyPolicy.serviceResourceUrl,
        );
      }
    } else {
      validateDatabase(database, config);
    }
    const advanced = database.prepare(
      'UPDATE payer_recovery_meta SET owner_epoch = owner_epoch + 1 WHERE singleton = 1 AND owner_epoch < 9007199254740991',
    ).run();
    if (advanced.changes !== 1) {
      fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_SCHEMA_UNSUPPORTED');
    }
    database.exec('COMMIT');
    transaction = false;
    validateConnection(database);
    validateDatabase(database, config);
    inspectFile(config, identity);
    return database;
  } catch (error) {
    if (transaction) {
      try { database?.exec('ROLLBACK'); } catch {}
    }
    let closeFailed = false;
    try { database?.close(); } catch { closeFailed = true; }
    if (closeFailed) throw failure(STORE_CLOSE_FAILED);
    if (
      !creating
      && lockAttempted
      && knownCode(error) === null
    ) throw failure('ZENON_FUNDING_PAYER_RECOVERY_STORE_OWNER_BUSY');
    throw failure(
      knownCode(error) ?? 'ZENON_FUNDING_PAYER_RECOVERY_STORE_OPEN_FAILED',
    );
  }
}

function captureHooks(value) {
  if (value === undefined) return undefined;
  const code = 'ZENON_FUNDING_PAYER_RECOVERY_STORE_INVALID_CONFIGURATION';
  if (value === null || typeof value !== 'object'
      || utilTypes.isProxy(value)) fail(code);
  const keys = Reflect.ownKeys(value);
  if (keys.some(key => key !== 'beforeCommit' && key !== 'afterCommit')) fail(code);
  const hooks = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail(code);
    if (typeof descriptor.value !== 'function') fail(code);
    hooks[key] = descriptor.value;
  }
  return Object.freeze(hooks);
}

export class ZenonFundingPayerRecoverySqliteStore {
  #configuration;
  #database;
  #identity;
  #hooks;
  #closed = false;
  #quarantined = false;
  #active = false;

  constructor(config, database, identity, hooks) {
    this.#configuration = config;
    this.#database = database;
    this.#identity = identity;
    this.#hooks = hooks;
  }

  get resourceUrl() {
    return this.#configuration.resourceUrl;
  }

  #assertUsable() {
    if (this.#closed) fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_CLOSED');
    if (this.#quarantined) fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_QUARANTINED');
    try {
      inspectFile(this.#configuration, this.#identity);
      if (this.#database.isOpen !== true) {
        fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_QUARANTINED');
      }
    } catch {
      this.#quarantined = true;
      fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_QUARANTINED');
    }
  }

  #run(operation) {
    this.#assertUsable();
    if (this.#active) fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_REENTRANT_OPERATION');
    this.#active = true;
    try {
      return operation();
    } finally {
      this.#active = false;
    }
  }

  #read() {
    const row = this.#database.prepare('SELECT * FROM payer_recovery_state').get();
    return row ? parseRow(row, this.#configuration.resourceUrl) : null;
  }

  #write(name, operation) {
    return this.#run(() => {
      let begun = false;
      let commitAttempted = false;
      try {
        this.#database.exec('BEGIN IMMEDIATE');
        begun = true;
        const result = operation();
        if (this.#hooks?.beforeCommit) this.#hooks.beforeCommit(name);
        commitAttempted = true;
        this.#database.exec('COMMIT');
        begun = false;
        this.#identity = inspectFile(this.#configuration, this.#identity);
        if (this.#hooks?.afterCommit) this.#hooks.afterCommit(name);
        return result;
      } catch (error) {
        if (begun && !commitAttempted) {
          try {
            this.#database.exec('ROLLBACK');
            begun = false;
          } catch {
            this.#quarantined = true;
            fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_ROLLBACK_FAILED');
          }
        }
        if (commitAttempted) {
          this.#quarantined = true;
          fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_COMMIT_OUTCOME_UNKNOWN');
        }
        throw failure(
          knownCode(error) ?? 'ZENON_FUNDING_PAYER_RECOVERY_STORE_TRANSACTION_FAILED',
        );
      } finally {
        if (begun) {
          try { this.#database.exec('ROLLBACK'); }
          catch { this.#quarantined = true; }
        }
      }
    });
  }

  load() {
    return this.#run(() => {
      try { return this.#read(); }
      catch {
        this.#quarantined = true;
        fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_CORRUPT');
      }
    });
  }

  #requireCustody() {
    if (!custodyEnabled(this.#configuration)) {
      fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_CUSTODY_NOT_ENABLED');
    }
  }

  #custodyState() {
    try {
      const current = this.#read();
      const count = validateCustodyRows(this.#database, this.#configuration, current);
      return { current, count };
    } catch (error) {
      this.#quarantined = true;
      throw failure(
        knownCode(error) ?? 'ZENON_FUNDING_PAYER_RECOVERY_STORE_CORRUPT',
      );
    }
  }

  #checkedCustodyRow(row, current) {
    try { return custodyRecordFromRow(row, current, this.#configuration); }
    catch {
      this.#quarantined = true;
      fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_CORRUPT');
    }
  }

  /**
   * V2 only. Exact input: grantId, requestId, originalRequestJson,
   * originalBodyBase64 and serviceResourceUrl. The explicit key must match
   * the canonical request JSON. No funding binding or credential is accepted.
   */
  retainOriginalRequest(input) {
    this.#requireCustody();
    if (arguments.length !== 1) fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_INVALID_INPUT');
    const captured = custodyRetainInput(input);
    return this.#write('retainOriginalRequest', () => {
      const { current, count } = this.#custodyState();
      if (current === null) fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_INVALID_TRANSITION');
      const row = this.#database.prepare(
        'SELECT * FROM original_service_requests WHERE grant_id=? AND request_id=?',
      ).get(captured.key.grantId, captured.key.requestId);
      let candidate;
      let serialized;
      try {
        candidate = CUSTODY_CAPTURE(captured.original, custodyBinding(current));
        if (candidate.grantId !== captured.key.grantId
            || candidate.requestId !== captured.key.requestId
            || candidate.serviceResourceUrl
              !== this.#configuration.custodyPolicy.serviceResourceUrl) {
          fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_INVALID_INPUT');
        }
        serialized = CUSTODY_SERIALIZE(candidate);
      } catch {
        fail(row === undefined
          ? 'ZENON_FUNDING_PAYER_RECOVERY_STORE_INVALID_INPUT'
          : 'ZENON_FUNDING_PAYER_RECOVERY_STORE_CONFLICT');
      }
      if (row !== undefined) {
        const existing = this.#checkedCustodyRow(row, current);
        if (row.envelope !== serialized) {
          fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_CONFLICT');
        }
        return existing;
      }
      if (count >= this.#configuration.custodyPolicy.maxRequests) {
        fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_CUSTODY_CAPACITY');
      }
      const inserted = this.#database.prepare(
        'INSERT INTO original_service_requests(grant_id,request_id,funding_singleton,payment_hash,network,service_resource_url,envelope) VALUES(?,?,1,?,?,?,?)',
      ).run(
        candidate.grantId,
        candidate.requestId,
        candidate.paymentHash,
        candidate.network,
        candidate.serviceResourceUrl,
        serialized,
      );
      if (inserted.changes !== 1) {
        fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_TRANSACTION_FAILED');
      }
      const stored = this.#database.prepare(
        'SELECT * FROM original_service_requests WHERE grant_id=? AND request_id=?',
      ).get(candidate.grantId, candidate.requestId);
      if (stored?.envelope !== serialized) {
        this.#quarantined = true;
        fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_CORRUPT');
      }
      return this.#checkedCustodyRow(stored, current);
    });
  }

  getOriginalRequest(input) {
    this.#requireCustody();
    if (arguments.length !== 1) fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_INVALID_INPUT');
    let key;
    try { key = CUSTODY_KEY(input); }
    catch { fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_INVALID_INPUT'); }
    return this.#run(() => {
      try {
        const { current } = this.#custodyState();
        const row = this.#database.prepare(
          'SELECT * FROM original_service_requests WHERE grant_id=? AND request_id=?',
        ).get(key.grantId, key.requestId);
        if (row === undefined) return null;
        return this.#checkedCustodyRow(row, current);
      } catch (error) {
        this.#quarantined = true;
        throw failure(
          knownCode(error) ?? 'ZENON_FUNDING_PAYER_RECOVERY_STORE_CORRUPT',
        );
      }
    });
  }

  prepare(input) {
    const pair = captureZenonFundingPostV1PayerRecoveryPair(
      input,
      this.#configuration.resourceUrl,
    );
    return this.#write('prepare', () => {
      const current = this.#read();
      if (current !== null) {
        if (
          current.challengeHeader !== pair.challengeHeader
          || current.paymentHeader !== pair.paymentHeader
        ) fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_CONFLICT');
        return current;
      }
      const persisted = envelope(
        pair,
        1,
        ZENON_FUNDING_PAYER_RECOVERY_STATUS.PREPARED,
        false,
      );
      this.#database.prepare(
        'INSERT INTO payer_recovery_state(singleton,revision,status,ambiguity_latched,challenge_digest,payment_digest,envelope) VALUES(1,?,?,?,?,?,?)',
      ).run(
        persisted.revision,
        persisted.status,
        0,
        digest('zenon-x402:payer-recovery-challenge-v1', pair.challengeHeader),
        digest('zenon-x402:payer-recovery-payment-v1', pair.paymentHeader),
        canonicalJson(persisted),
      );
      return this.#read();
    });
  }

  fenceAttempt(expectedStatus) {
    if (
      expectedStatus !== ZENON_FUNDING_PAYER_RECOVERY_STATUS.PREPARED
      && expectedStatus !== ZENON_FUNDING_PAYER_RECOVERY_STATUS.OUTCOME_UNKNOWN
    ) fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_INVALID_INPUT');
    return this.#write('fenceAttempt', () => {
      const current = this.#read();
      if (current === null || current.status !== expectedStatus) {
        fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_INVALID_TRANSITION');
      }
      const nextEnvelope = envelope(
        current,
        current.revision + 1,
        ZENON_FUNDING_PAYER_RECOVERY_STATUS.ATTEMPT_FENCED,
        current.ambiguityLatched
          || expectedStatus === ZENON_FUNDING_PAYER_RECOVERY_STATUS.OUTCOME_UNKNOWN,
      );
      const updated = this.#database.prepare(
        'UPDATE payer_recovery_state SET revision=?,status=?,ambiguity_latched=?,envelope=? WHERE singleton=1 AND revision=? AND status=?',
      ).run(
        nextEnvelope.revision,
        nextEnvelope.status,
        Number(nextEnvelope.ambiguityLatched),
        canonicalJson(nextEnvelope),
        current.revision,
        current.status,
      );
      if (updated.changes !== 1) {
        fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_INVALID_TRANSITION');
      }
      return this.#read();
    });
  }

  finishAttempt(status) {
    if (
      status !== ZENON_FUNDING_PAYER_RECOVERY_STATUS.OUTCOME_UNKNOWN
      && !TERMINAL_STATUSES.includes(status)
    ) fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_INVALID_INPUT');
    return this.#write('finishAttempt', () => {
      const current = this.#read();
      if (
        current === null
        || current.status !== ZENON_FUNDING_PAYER_RECOVERY_STATUS.ATTEMPT_FENCED
      ) fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_INVALID_TRANSITION');
      if (
        current.ambiguityLatched
        && (
          status === ZENON_FUNDING_PAYER_RECOVERY_STATUS.PAYMENT_REJECTED
          || status === ZENON_FUNDING_PAYER_RECOVERY_STATUS.PAYMENT_CONFLICT
        )
      ) fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_INVALID_TRANSITION');
      const ambiguityLatched = status === ZENON_FUNDING_PAYER_RECOVERY_STATUS.OUTCOME_UNKNOWN
        ? true
        : current.ambiguityLatched;
      const nextEnvelope = envelope(
        current,
        current.revision + 1,
        status,
        ambiguityLatched,
      );
      const updated = this.#database.prepare(
        'UPDATE payer_recovery_state SET revision=?,status=?,ambiguity_latched=?,envelope=? WHERE singleton=1 AND revision=? AND status=\'ATTEMPT_FENCED\'',
      ).run(
        nextEnvelope.revision,
        nextEnvelope.status,
        Number(nextEnvelope.ambiguityLatched),
        canonicalJson(nextEnvelope),
        current.revision,
      );
      if (updated.changes !== 1) {
        fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_INVALID_TRANSITION');
      }
      return this.#read();
    });
  }

  recoverAfterRestart() {
    return this.#write('recoverAfterRestart', () => {
      const current = this.#read();
      if (
        current === null
        || current.status !== ZENON_FUNDING_PAYER_RECOVERY_STATUS.ATTEMPT_FENCED
      ) return current;
      const nextEnvelope = envelope(
        current,
        current.revision + 1,
        ZENON_FUNDING_PAYER_RECOVERY_STATUS.OUTCOME_UNKNOWN,
        true,
      );
      const updated = this.#database.prepare(
        'UPDATE payer_recovery_state SET revision=?,status=\'OUTCOME_UNKNOWN\',ambiguity_latched=1,envelope=? WHERE singleton=1 AND revision=? AND status=\'ATTEMPT_FENCED\'',
      ).run(
        nextEnvelope.revision,
        canonicalJson(nextEnvelope),
        current.revision,
      );
      if (updated.changes !== 1) {
        fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_INVALID_TRANSITION');
      }
      return this.#read();
    });
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    try { this.#database.close(); }
    catch {
      this.#quarantined = true;
      fail(STORE_CLOSE_FAILED);
    }
    OPEN_DATABASE_PATHS.delete(this.#configuration.databasePath);
  }
}

function openStore(options, creating, custody = false) {
  const code = 'ZENON_FUNDING_PAYER_RECOVERY_STORE_INVALID_CONFIGURATION';
  if (
    options === null
    || typeof options !== 'object'
    || Array.isArray(options)
    || utilTypes.isProxy(options)
    || Object.getPrototypeOf(options) !== Object.prototype
  ) fail(code);
  const keys = Reflect.ownKeys(options);
  if (
    keys.length < (custody ? 4 : 3)
    || keys.length > (custody ? 5 : 4)
    || keys.some(key => ![
      'databasePath', 'allowedRoot', 'resourceUrl', 'testHooks',
    ].includes(key) && (!custody || key !== 'custodyPolicy'))
  ) fail(code);
  const base = Object.create(null);
  for (const key of ['databasePath', 'allowedRoot', 'resourceUrl']) {
    const descriptor = Object.getOwnPropertyDescriptor(options, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail(code);
    base[key] = descriptor.value;
  }
  const hookDescriptor = Object.getOwnPropertyDescriptor(options, 'testHooks');
  if (hookDescriptor && (!hookDescriptor.enumerable || !Object.hasOwn(hookDescriptor, 'value'))) {
    fail(code);
  }
  const hooks = captureHooks(hookDescriptor?.value);
  let config = configuration(base);
  if (custody) {
    const descriptor = Object.getOwnPropertyDescriptor(options, 'custodyPolicy');
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail(code);
    let policy;
    try { policy = CUSTODY_POLICY(descriptor.value, config.resourceUrl); }
    catch { fail(code); }
    config = Object.freeze({ ...config, custodyPolicy: policy });
  }
  if (OPEN_DATABASE_PATHS.has(config.databasePath)) {
    fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_OWNER_BUSY');
  }
  OPEN_DATABASE_PATHS.add(config.databasePath);
  let database = null;
  try {
    const identity = creating ? createFile(config) : inspectFile(config);
    database = openDatabase(config, identity, creating);
    if (creating) {
      syncParentDirectory(config.allowedRoot);
    }
    const verifiedIdentity = inspectFile(config, identity);
    return new ZenonFundingPayerRecoverySqliteStore(
      config,
      database,
      verifiedIdentity,
      hooks,
    );
  } catch (error) {
    let closed = knownCode(error) !== STORE_CLOSE_FAILED;
    if (database?.isOpen === true) {
      try { database.close(); }
      catch { closed = false; }
    }
    if (closed) OPEN_DATABASE_PATHS.delete(config.databasePath);
    else fail(STORE_CLOSE_FAILED);
    throw error;
  }
}

export function createZenonFundingPayerRecoverySqliteStore(options) {
  return openStore(options, true);
}

export function openZenonFundingPayerRecoverySqliteStore(options) {
  return openStore(options, false);
}

export function createZenonFundingPayerRecoveryCustodySqliteStoreV2(options) {
  if (arguments.length !== 1) {
    fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_INVALID_CONFIGURATION');
  }
  return openStore(options, true, true);
}

export function openZenonFundingPayerRecoveryCustodySqliteStoreV2(options) {
  if (arguments.length !== 1) {
    fail('ZENON_FUNDING_PAYER_RECOVERY_STORE_INVALID_CONFIGURATION');
  }
  return openStore(options, false, true);
}
