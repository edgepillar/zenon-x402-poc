import childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs, { constants as fsConstants } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { types as utilTypes } from 'node:util';

import {
  createZenonFundingProviderSigningChildRequest,
  frameZenonFundingProviderSigningChildRequest,
  parseZenonFundingProviderSigningChildResponseFrame,
  ZENON_FUNDING_PROVIDER_SIGNING_CHILD_PROTOCOL_VERSION,
  ZENON_FUNDING_PROVIDER_SIGNING_CHILD_RESPONSE_STATUS,
} from './service-credit-zenon-provider-signing-child-protocol.js';
import {
  parseZenonFundingProviderAttestationAuthorityRecord,
  parseZenonFundingProviderAttestationRequest,
  verifyZenonFundingProviderAttestationEnvelope,
} from './service-credit-zenon-funding-provider-attestation.js';
import {
  ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS,
  ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_VERSION,
  ZenonFundingObserverSqliteStore,
  ZENON_FUNDING_OBSERVER_SQLITE_STORE_SCHEMA_VERSION,
} from './service-credit-zenon-funding-observer-sqlite-store.js';
import {
  ZENON_FUNDING_OBSERVER_STATE_SCHEMA_VERSION,
  ZENON_FUNDING_OBSERVER_STATUS,
  ZENON_FUNDING_OBSERVER_TRUST_CLASSIFICATION,
} from './service-credit-zenon-funding-observer-state.js';

const SPAWN = childProcess.spawn;
const LSTAT_SYNC = fs.lstatSync;
const REALPATH_SYNC = fs.realpathSync;
const OPEN_SYNC = fs.openSync;
const FSTAT_SYNC = fs.fstatSync;
const READ_FILE_SYNC = fs.readFileSync;
const CLOSE_SYNC = fs.closeSync;
const PROCESS_GETEUID = process.geteuid;
const ARRAY_IS_ARRAY = Array.isArray;
const ARRAY_INCLUDES = Array.prototype.includes;
const ARRAY_JOIN = Array.prototype.join;
const ARRAY_MAP = Array.prototype.map;
const ARRAY_REVERSE = Array.prototype.reverse;
const ARRAY_SORT = Array.prototype.sort;
const BUFFER_BYTE_LENGTH = Buffer.byteLength;
const BUFFER_CONCAT = Buffer.concat;
const BUFFER_FROM = Buffer.from;
const BUFFER_IS_BUFFER = Buffer.isBuffer;
const JSON_PARSE = JSON.parse;
const JSON_STRINGIFY = JSON.stringify;
const NATIVE_PROMISE = Promise;
const PROMISE_REJECT = Promise.reject;
const PROMISE_THEN = Promise.prototype.then;
const NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;
const OBJECT_CREATE = Object.create;
const OBJECT_DEFINE_PROPERTY = Object.defineProperty;
const OBJECT_FREEZE = Object.freeze;
const OBJECT_HAS_OWN = Object.hasOwn;
const OBJECT_PROTOTYPE = Object.prototype;
const FUNCTION_PROTOTYPE = Function.prototype;
const REFLECT_APPLY = Reflect.apply;
const REFLECT_GET_OWN_PROPERTY_DESCRIPTOR = Reflect.getOwnPropertyDescriptor;
const REFLECT_GET_PROTOTYPE_OF = Reflect.getPrototypeOf;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const REGEXP_TEST = RegExp.prototype.test;
const STRING_INCLUDES = String.prototype.includes;
const IS_PROXY = utilTypes.isProxy;
const EVENT_ONCE = EventEmitter.prototype.once;
const EVENT_ON = EventEmitter.prototype.on;
const READABLE_ON = Readable.prototype.on;
const READABLE_ONCE = Readable.prototype.once;
const READABLE_DESTROY = Readable.prototype.destroy;
const WRITABLE_END = Writable.prototype.end;
const CHILD_KILL = childProcess.ChildProcess.prototype.kill;
const HASH_PROTOTYPE = Reflect.getPrototypeOf(createHash('sha256'));
const HASH_UPDATE = HASH_PROTOTYPE.update;
const HASH_DIGEST = HASH_PROTOTYPE.digest;

const OBSERVER_PROTOTYPE = ZenonFundingObserverSqliteStore.prototype;
const OBSERVER_LOAD = OBSERVER_PROTOTYPE.load;
const OBSERVER_PEEK = OBSERVER_PROTOTYPE.peekPreparedAttestation;
const OBSERVER_COMMIT = OBSERVER_PROTOTYPE.commitAuthenticatedEnvelope;

const RECORD_KEY_DOMAIN = 'zenon-x402:funding-observer-sqlite-record-v2';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const MAX_PATH_BYTES = 4_096;
const MAX_EXECUTABLE_BYTES = 64 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_TIMEOUT_MS = 60_000;
const MIN_TIMEOUT_MS = 1;
const S_IFMT = BigInt(fsConstants.S_IFMT);
const S_IFREG = BigInt(fsConstants.S_IFREG);
const S_IFDIR = BigInt(fsConstants.S_IFDIR);
const O_NOFOLLOW = fsConstants.O_NOFOLLOW;

const RESULT = Object.freeze({
  APPROVAL_REQUIRED: Object.freeze({ status: 'APPROVAL_REQUIRED' }),
  CLOSED: Object.freeze({ status: 'CLOSED' }),
  EQUIVOCATED: Object.freeze({ status: 'EQUIVOCATED' }),
  INVALIDATED: Object.freeze({ status: 'INVALIDATED' }),
  READY_COMMITTED: Object.freeze({ status: 'READY_COMMITTED' }),
  RECOVERY_WINDOW_EXPIRED: Object.freeze({ status: 'RECOVERY_WINDOW_EXPIRED' }),
  REJECTED: Object.freeze({ status: 'REJECTED' }),
  SIGNER_OUTCOME_UNKNOWN: Object.freeze({ status: 'SIGNER_OUTCOME_UNKNOWN' }),
  STORE_RECOVERY_REQUIRED: Object.freeze({ status: 'STORE_RECOVERY_REQUIRED' }),
});

export class ZenonFundingProviderSigningOperationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ZenonFundingProviderSigningOperationError';
    this.code = code;
    this.stack = `ZenonFundingProviderSigningOperationError: ${code}`;
  }
}

function failure(code) {
  return new ZenonFundingProviderSigningOperationError(code);
}

function fail(code) {
  throw failure(code);
}

function append(array, value) {
  REFLECT_APPLY(OBJECT_DEFINE_PROPERTY, undefined, [array, `${array.length}`, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  }]);
}

function errorCode(error) {
  try {
    const descriptor = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      Reflect,
      [error, 'code'],
    );
    return descriptor && OBJECT_HAS_OWN(descriptor, 'value')
      && typeof descriptor.value === 'string'
      ? descriptor.value
      : null;
  } catch {
    return null;
  }
}

function exactDataObject(input, keys, code) {
  try {
    if (
      input === null
      || typeof input !== 'object'
      || REFLECT_APPLY(IS_PROXY, undefined, [input])
      || REFLECT_APPLY(ARRAY_IS_ARRAY, undefined, [input])
      || REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, Reflect, [input]) !== OBJECT_PROTOTYPE
    ) fail(code);
    const observed = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [input]);
    if (observed.length !== keys.length) fail(code);
    const output = REFLECT_APPLY(OBJECT_CREATE, Object, [null]);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (!REFLECT_APPLY(ARRAY_INCLUDES, observed, [key])) fail(code);
      const descriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        Reflect,
        [input, key],
      );
      if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) fail(code);
      output[key] = descriptor.value;
    }
    return output;
  } catch (error) {
    if (error instanceof ZenonFundingProviderSigningOperationError) throw error;
    fail(code);
  }
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return REFLECT_APPLY(JSON_STRINGIFY, JSON, [value]);
  if (REFLECT_APPLY(ARRAY_IS_ARRAY, undefined, [value])) {
    return `[${REFLECT_APPLY(ARRAY_JOIN, REFLECT_APPLY(ARRAY_MAP, value, [canonicalJson]), [','])}]`;
  }
  const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [value]);
  REFLECT_APPLY(ARRAY_SORT, keys, []);
  const parts = REFLECT_APPLY(ARRAY_MAP, keys, [
    key => `${REFLECT_APPLY(JSON_STRINGIFY, JSON, [key])}:${canonicalJson(value[key])}`,
  ]);
  return `{${REFLECT_APPLY(ARRAY_JOIN, parts, [','])}}`;
}

function cloneTrusted(value) {
  return REFLECT_APPLY(JSON_PARSE, JSON, [canonicalJson(value)]);
}

function sameJson(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function hashCommitment(domain, value) {
  const hash = createHash('sha256');
  REFLECT_APPLY(HASH_UPDATE, hash, [domain, 'utf8']);
  REFLECT_APPLY(HASH_UPDATE, hash, ['\0', 'utf8']);
  REFLECT_APPLY(HASH_UPDATE, hash, [canonicalJson(value), 'utf8']);
  return `sha256:${REFLECT_APPLY(HASH_DIGEST, hash, ['hex'])}`;
}

function exactPrototypeMethod(prototype, name, expected) {
  const descriptor = REFLECT_APPLY(
    REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
    Reflect,
    [prototype, name],
  );
  return descriptor?.value === expected
    && descriptor.enumerable === false
    && descriptor.get === undefined
    && descriptor.set === undefined;
}

function exactObserverStore(store) {
  try {
    return store !== null
      && typeof store === 'object'
      && !REFLECT_APPLY(IS_PROXY, undefined, [store])
      && REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, Reflect, [store]) === OBSERVER_PROTOTYPE
      && REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [store]).length === 0
      && REFLECT_APPLY(REFLECT_GET_OWN_PROPERTY_DESCRIPTOR, Reflect, [store, 'then']) === undefined
      && REFLECT_APPLY(REFLECT_GET_OWN_PROPERTY_DESCRIPTOR, Reflect, [OBJECT_PROTOTYPE, 'then']) === undefined
      && exactPrototypeMethod(OBSERVER_PROTOTYPE, 'load', OBSERVER_LOAD)
      && exactPrototypeMethod(OBSERVER_PROTOTYPE, 'peekPreparedAttestation', OBSERVER_PEEK)
      && exactPrototypeMethod(OBSERVER_PROTOTYPE, 'commitAuthenticatedEnvelope', OBSERVER_COMMIT)
      && REFLECT_APPLY(REFLECT_GET_OWN_PROPERTY_DESCRIPTOR, Reflect, [store, 'load']) === undefined
      && REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        Reflect,
        [store, 'peekPreparedAttestation'],
      ) === undefined
      && REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        Reflect,
        [store, 'commitAuthenticatedEnvelope'],
      ) === undefined;
  } catch {
    return false;
  }
}

function validCallable(value) {
  try {
    return typeof value === 'function'
      && !REFLECT_APPLY(IS_PROXY, undefined, [value])
      && REFLECT_APPLY(REFLECT_GET_OWN_PROPERTY_DESCRIPTOR, Reflect, [value, 'then']) === undefined
      && REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        Reflect,
        [FUNCTION_PROTOTYPE, 'then'],
      ) === undefined;
  } catch {
    return false;
  }
}

function assertAuthorityBinding(loaded, authority, code) {
  const record = exactDataObject(loaded, [
    'storeSchemaVersion', 'recordKey', 'authorityRecordDigest', 'state', 'outbox',
  ], code);
  const outbox = exactDataObject(record.outbox, [
    'outboxVersion', 'revision', 'status',
  ], code);
  const state = record.state;
  if (
    record.storeSchemaVersion !== ZENON_FUNDING_OBSERVER_SQLITE_STORE_SCHEMA_VERSION
    || typeof record.recordKey !== 'string'
    || !REFLECT_APPLY(REGEXP_TEST, DIGEST, [record.recordKey])
    || record.authorityRecordDigest !== authority.authorityRecordDigest
    || state === null
    || typeof state !== 'object'
    || state.schemaVersion !== ZENON_FUNDING_OBSERVER_STATE_SCHEMA_VERSION
    || state.trustClassification !== ZENON_FUNDING_OBSERVER_TRUST_CLASSIFICATION
    || outbox.outboxVersion !== ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_VERSION
    || !REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [outbox.revision])
    || outbox.revision < 0
    || hashCommitment(RECORD_KEY_DOMAIN, {
      storeSchemaVersion: record.storeSchemaVersion,
      observerRecordId: state.observerRecordId,
      targetBindingDigest: state.targetBindingDigest,
      authorityRecordDigest: authority.authorityRecordDigest,
    }) !== record.recordKey
    || !sameJson(state.authorityGeneration, authority.authorityGeneration)
    || !sameJson(state.chainProfile, authority.chainProfile)
    || !sameJson(state.observerPolicy, authority.observerPolicy)
    || !sameJson(state.confirmationPolicy, authority.confirmationPolicy)
  ) fail(code);
  return { ...record, outbox };
}

function immutableBinding(record) {
  return cloneTrusted({
    storeSchemaVersion: record.storeSchemaVersion,
    recordKey: record.recordKey,
    authorityRecordDigest: record.authorityRecordDigest,
    observerRecordId: record.state.observerRecordId,
    targetBindingDigest: record.state.targetBindingDigest,
    authorityGeneration: record.state.authorityGeneration,
    chainProfile: record.state.chainProfile,
    observerPolicy: record.state.observerPolicy,
    confirmationPolicy: record.state.confirmationPolicy,
    target: record.state.target,
    catchUp: {
      maximumPageEntries: record.state.catchUp.maximumPageEntries,
      maximumBackfillSpan: record.state.catchUp.maximumBackfillSpan,
      maximumMembersPerMomentum: record.state.catchUp.maximumMembersPerMomentum,
    },
  });
}

function captureDeadlineRuntime(input) {
  const code = 'ZENON_FUNDING_PROVIDER_SIGNING_INVALID_CONFIGURATION';
  const value = exactDataObject(input, ['schedule', 'cancel'], code);
  if (!validCallable(value.schedule) || !validCallable(value.cancel)) fail(code);
  return Object.freeze({ schedule: value.schedule, cancel: value.cancel });
}

function captureExecutable(input) {
  const code = 'ZENON_FUNDING_PROVIDER_SIGNING_INVALID_CONFIGURATION';
  const value = exactDataObject(input, [
    'executablePath', 'executableDigest', 'protocolVersion',
  ], code);
  if (
    typeof value.executablePath !== 'string'
    || value.executablePath.length === 0
    || value.executablePath.length > MAX_PATH_BYTES
    || REFLECT_APPLY(BUFFER_BYTE_LENGTH, Buffer, [value.executablePath, 'utf8']) > MAX_PATH_BYTES
    || REFLECT_APPLY(STRING_INCLUDES, value.executablePath, ['\0'])
    || !isAbsolute(value.executablePath)
    || resolve(value.executablePath) !== value.executablePath
    || typeof value.executableDigest !== 'string'
    || !REFLECT_APPLY(REGEXP_TEST, DIGEST, [value.executableDigest])
    || value.protocolVersion !== ZENON_FUNDING_PROVIDER_SIGNING_CHILD_PROTOCOL_VERSION
  ) fail(code);
  return Object.freeze({ ...value });
}

function statIdentity(stat, digest) {
  return Object.freeze({
    dev: stat.dev,
    ino: stat.ino,
    mode: stat.mode,
    uid: stat.uid,
    gid: stat.gid,
    nlink: stat.nlink,
    size: stat.size,
    mtimeNs: stat.mtimeNs,
    ctimeNs: stat.ctimeNs,
    digest,
  });
}

function directoryIdentity(stat) {
  return Object.freeze({
    dev: stat.dev,
    ino: stat.ino,
    mode: stat.mode,
    uid: stat.uid,
    gid: stat.gid,
  });
}

function sameDirectoryIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.uid === right.uid
    && left.gid === right.gid;
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.uid === right.uid
    && left.gid === right.gid
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs
    && left.digest === right.digest;
}

function sameExecutableInspection(left, right) {
  if (left.ancestors.length !== right.ancestors.length) return false;
  for (let index = 0; index < left.ancestors.length; index += 1) {
    if (!sameDirectoryIdentity(left.ancestors[index], right.ancestors[index])) return false;
  }
  return sameFileIdentity(left.executable, right.executable);
}

function executableAncestorPaths(executablePath) {
  const paths = [];
  let current = dirname(executablePath);
  while (true) {
    append(paths, current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return REFLECT_APPLY(ARRAY_REVERSE, paths, []);
}

function readEffectiveUid(code) {
  try {
    if (typeof PROCESS_GETEUID !== 'function') fail(code);
    const value = REFLECT_APPLY(PROCESS_GETEUID, process, []);
    if (
      !REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [value])
      || value < 0
    ) fail(code);
    return BigInt(value);
  } catch (error) {
    if (error instanceof ZenonFundingProviderSigningOperationError) throw error;
    fail(code);
  }
}

function safeAncestorMode(stat, uid) {
  if ((stat.mode & S_IFMT) !== S_IFDIR || stat.nlink < 1n) return false;
  if (stat.uid !== uid && stat.uid !== 0n) return false;
  const writable = (stat.mode & 0o022n) !== 0n;
  const special = stat.mode & 0o7000n;
  if (!writable) return special === 0n;
  return stat.uid === 0n && special === 0o1000n;
}

function inspectExecutable(configuration, expectedEffectiveUid) {
  const code = 'ZENON_FUNDING_PROVIDER_SIGNING_UNSAFE_EXECUTABLE';
  let descriptor;
  try {
    if (
      !REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [O_NOFOLLOW])
      || O_NOFOLLOW === 0
    ) fail(code);
    const uid = readEffectiveUid(code);
    if (uid !== expectedEffectiveUid) fail(code);
    const ancestorPaths = executableAncestorPaths(configuration.executablePath);
    const ancestors = [];
    for (let index = 0; index < ancestorPaths.length; index += 1) {
      const component = ancestorPaths[index];
      if (REFLECT_APPLY(REALPATH_SYNC, fs, [component]) !== component) fail(code);
      const observed = REFLECT_APPLY(LSTAT_SYNC, fs, [component, { bigint: true }]);
      if (!safeAncestorMode(observed, uid)) fail(code);
      append(ancestors, directoryIdentity(observed));
    }
    if (
      REFLECT_APPLY(REALPATH_SYNC, fs, [configuration.executablePath])
        !== configuration.executablePath
    ) fail(code);
    const before = REFLECT_APPLY(LSTAT_SYNC, fs, [configuration.executablePath, {
      bigint: true,
    }]);
    if (
      (before.mode & S_IFMT) !== S_IFREG
      || (before.mode & 0o100n) === 0n
      || (before.mode & 0o7000n) !== 0n
      || (before.mode & 0o022n) !== 0n
      || (before.uid !== uid && before.uid !== 0n)
      || before.nlink !== 1n
      || before.size < 1n
      || before.size > BigInt(MAX_EXECUTABLE_BYTES)
    ) fail(code);
    descriptor = REFLECT_APPLY(OPEN_SYNC, fs, [
      configuration.executablePath,
      fsConstants.O_RDONLY | O_NOFOLLOW,
    ]);
    const opened = REFLECT_APPLY(FSTAT_SYNC, fs, [descriptor, { bigint: true }]);
    if (
      before.dev !== opened.dev
      || before.ino !== opened.ino
      || before.mode !== opened.mode
      || before.uid !== opened.uid
      || before.gid !== opened.gid
      || before.nlink !== opened.nlink
      || before.size !== opened.size
      || before.mtimeNs !== opened.mtimeNs
      || before.ctimeNs !== opened.ctimeNs
    ) fail(code);
    const bytes = REFLECT_APPLY(READ_FILE_SYNC, fs, [descriptor]);
    if (!REFLECT_APPLY(BUFFER_IS_BUFFER, Buffer, [bytes]) || BigInt(bytes.length) !== opened.size) {
      fail(code);
    }
    const hasher = createHash('sha256');
    REFLECT_APPLY(HASH_UPDATE, hasher, [bytes]);
    const hash = REFLECT_APPLY(HASH_DIGEST, hasher, ['hex']);
    const digest = `sha256:${hash}`;
    if (digest !== configuration.executableDigest) fail(code);
    return Object.freeze({
      ancestors: Object.freeze(ancestors),
      executable: statIdentity(opened, digest),
    });
  } catch (error) {
    if (error instanceof ZenonFundingProviderSigningOperationError) throw error;
    fail(code);
  } finally {
    if (descriptor !== undefined) {
      try { REFLECT_APPLY(CLOSE_SYNC, fs, [descriptor]); } catch {}
    }
  }
}

function safeCancel(runtime, handle) {
  if (handle === undefined) return;
  try { REFLECT_APPLY(runtime.cancel, undefined, [handle]); } catch {}
}

function safeDestroy(stream) {
  try {
    if (stream !== null && typeof stream === 'object') {
      REFLECT_APPLY(READABLE_DESTROY, stream, []);
    }
  } catch {}
}

function safeKill(child) {
  try {
    if (
      child !== null
      && typeof child === 'object'
      && !REFLECT_APPLY(IS_PROXY, undefined, [child])
      && REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, Reflect, [child])
        === childProcess.ChildProcess.prototype
    ) {
      REFLECT_APPLY(CHILD_KILL, child, ['SIGKILL']);
    }
  } catch {}
}

function captureChildPipes(child) {
  const code = 'ZENON_FUNDING_PROVIDER_SIGNING_SIGNER_OUTCOME_UNKNOWN';
  try {
    if (
      child === null
      || typeof child !== 'object'
      || REFLECT_APPLY(IS_PROXY, undefined, [child])
      || REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        Reflect,
        [child, 'then'],
      ) !== undefined
      || REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        Reflect,
        [OBJECT_PROTOTYPE, 'then'],
      ) !== undefined
    ) fail(code);
    const stdioDescriptor = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      Reflect,
      [child, 'stdio'],
    );
    if (!stdioDescriptor?.enumerable || !OBJECT_HAS_OWN(stdioDescriptor, 'value')) fail(code);
    const stdio = stdioDescriptor.value;
    if (
      !REFLECT_APPLY(ARRAY_IS_ARRAY, undefined, [stdio])
      || REFLECT_APPLY(IS_PROXY, undefined, [stdio])
    ) fail(code);
    const lengthDescriptor = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      Reflect,
      [stdio, 'length'],
    );
    if (!OBJECT_HAS_OWN(lengthDescriptor ?? {}, 'value') || lengthDescriptor.value !== 5) fail(code);
    const entries = [];
    for (let index = 0; index < 5; index += 1) {
      const descriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        Reflect,
        [stdio, `${index}`],
      );
      if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) fail(code);
      append(entries, descriptor.value);
    }
    if (
      entries[0] !== null
      || entries[1] !== null
      || entries[2] !== null
      || entries[3] === null
      || typeof entries[3] !== 'object'
      || REFLECT_APPLY(IS_PROXY, undefined, [entries[3]])
      || REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        Reflect,
        [entries[3], 'then'],
      ) !== undefined
      || entries[4] === null
      || typeof entries[4] !== 'object'
      || REFLECT_APPLY(IS_PROXY, undefined, [entries[4]])
      || REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        Reflect,
        [entries[4], 'then'],
      ) !== undefined
    ) fail(code);
    return { requestPipe: entries[3], responsePipe: entries[4] };
  } catch (error) {
    if (error instanceof ZenonFundingProviderSigningOperationError) throw error;
    fail(code);
  }
}

function armChildExchange(
  child,
  expectedOperationId,
  configuration,
) {
  let beginDispatch;
  let abortBeforeDispatch;
  let wasDispatchPossible;
  let armed = false;
  const result = new NATIVE_PROMISE(resolveExchange => {
    let settled = false;
    let responseEnded = false;
    let childClosed = false;
    let childExited = false;
    let requestFinished = false;
    let dispatchPossible = false;
    let exitCode;
    let exitSignal;
    let total = 0;
    const chunks = [];
    let timeoutHandle;
    let requestPipe;
    let responsePipe;

    const cleanup = () => {
      safeCancel(configuration.deadlineRuntime, timeoutHandle);
      safeDestroy(requestPipe);
      safeDestroy(responsePipe);
    };
    const settleFailure = code => {
      if (settled) return;
      settled = true;
      cleanup();
      safeKill(child);
      resolveExchange(Object.freeze({ code, response: null }));
    };
    const failChannel = () => settleFailure(
      dispatchPossible
        ? 'ZENON_FUNDING_PROVIDER_SIGNING_SIGNER_OUTCOME_UNKNOWN'
        : 'ZENON_FUNDING_PROVIDER_SIGNING_CHILD_CHANNEL_FAILED',
    );
    const failBoundary = error => {
      if (settled) return;
      const code = errorCode(error);
      if (
        code !== 'ZENON_FUNDING_PROVIDER_SIGNING_INVALIDATED'
        && code !== 'ZENON_FUNDING_PROVIDER_SIGNING_EQUIVOCATED'
        && code !== 'ZENON_FUNDING_PROVIDER_SIGNING_STORE_RECOVERY_REQUIRED'
      ) return failChannel();
      settleFailure(code);
    };
    const finish = () => {
      if (settled || !requestFinished || !responseEnded || !childClosed) return;
      if (exitCode !== 0 || exitSignal !== null || total < 5) return failChannel();
      try {
        const frame = REFLECT_APPLY(BUFFER_CONCAT, Buffer, [chunks, total]);
        const response = parseZenonFundingProviderSigningChildResponseFrame(
          frame,
          expectedOperationId,
          configuration.maximumResponseBytes,
        );
        settled = true;
        cleanup();
        resolveExchange(Object.freeze({ code: null, response }));
      } catch {
        failChannel();
      }
    };

    try {
      REFLECT_APPLY(EVENT_ON, child, ['error', failChannel]);
      REFLECT_APPLY(EVENT_ONCE, child, ['exit', (code, signal) => {
        childExited = true;
        exitCode = code;
        exitSignal = signal;
        if (!dispatchPossible || code !== 0 || signal !== null) return failChannel();
        finish();
      }]);
      REFLECT_APPLY(EVENT_ONCE, child, ['close', (code, signal) => {
        childClosed = true;
        if (!childExited) {
          exitCode = code;
          exitSignal = signal;
        }
        if (!dispatchPossible || exitCode !== 0 || exitSignal !== null) return failChannel();
        finish();
      }]);
      ({ requestPipe, responsePipe } = captureChildPipes(child));
      REFLECT_APPLY(EVENT_ON, requestPipe, ['error', failChannel]);
      REFLECT_APPLY(EVENT_ONCE, requestPipe, ['finish', () => {
        requestFinished = true;
        finish();
      }]);
      REFLECT_APPLY(EVENT_ONCE, requestPipe, ['close', () => {
        if (!settled && !requestFinished) failChannel();
      }]);
      REFLECT_APPLY(READABLE_ON, responsePipe, ['data', chunk => {
        if (settled) return;
        if (!REFLECT_APPLY(BUFFER_IS_BUFFER, Buffer, [chunk])) return failChannel();
        total += chunk.length;
        if (total > configuration.maximumResponseBytes + 4) return failChannel();
        append(chunks, REFLECT_APPLY(BUFFER_FROM, Buffer, [chunk]));
      }]);
      REFLECT_APPLY(READABLE_ONCE, responsePipe, ['end', () => {
        responseEnded = true;
        finish();
      }]);
      REFLECT_APPLY(READABLE_ON, responsePipe, ['error', failChannel]);
      REFLECT_APPLY(READABLE_ONCE, responsePipe, ['close', () => {
        if (!settled && !responseEnded) failChannel();
      }]);
      armed = true;
    } catch {
      failChannel();
    }

    beginDispatch = (requestFrame, validateBeforeWrite) => {
      if (settled) return result;
      try {
        timeoutHandle = REFLECT_APPLY(configuration.deadlineRuntime.schedule, undefined, [
          failChannel,
          configuration.timeoutMs,
        ]);
        if (settled) return result;
        validateBeforeWrite();
      } catch (error) {
        failBoundary(error);
        return result;
      }
      if (settled) return result;
      dispatchPossible = true;
      try {
        REFLECT_APPLY(WRITABLE_END, requestPipe, [requestFrame, error => {
          if (error !== undefined && error !== null) failChannel();
        }]);
      } catch {
        failChannel();
      }
      return result;
    };
    abortBeforeDispatch = () => {
      failChannel();
      return result;
    };
    wasDispatchPossible = () => dispatchPossible;
  });
  return Object.freeze({
    armed,
    beginDispatch,
    abortBeforeDispatch,
    result,
    wasDispatchPossible,
  });
}

export function createZenonFundingProviderSigningOperation(options) {
  const invalid = 'ZENON_FUNDING_PROVIDER_SIGNING_INVALID_CONFIGURATION';
  const value = exactDataObject(options, [
    'fundingObserverStore',
    'authorityRecord',
    'signerExecutable',
    'now',
    'deadlineRuntime',
    'timeoutMs',
    'maximumResponseBytes',
  ], invalid);
  if (
    !exactObserverStore(value.fundingObserverStore)
    || typeof value.authorityRecord !== 'string'
    || !validCallable(value.now)
    || !REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [value.timeoutMs])
    || value.timeoutMs < MIN_TIMEOUT_MS
    || value.timeoutMs > MAX_TIMEOUT_MS
    || !REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [value.maximumResponseBytes])
    || value.maximumResponseBytes < 1
    || value.maximumResponseBytes > MAX_RESPONSE_BYTES
  ) fail(invalid);
  const effectiveUid = readEffectiveUid(invalid);
  const signerExecutable = captureExecutable(value.signerExecutable);
  const deadlineRuntime = captureDeadlineRuntime(value.deadlineRuntime);
  let authority;
  let initialRecord;
  try {
    authority = parseZenonFundingProviderAttestationAuthorityRecord(value.authorityRecord);
    initialRecord = assertAuthorityBinding(
      REFLECT_APPLY(OBSERVER_LOAD, value.fundingObserverStore, []),
      authority,
      invalid,
    );
  } catch {
    fail(invalid);
  }
  const observerStore = value.fundingObserverStore;
  const binding = immutableBinding(initialRecord);
  const configuration = Object.freeze({
    deadlineRuntime,
    maximumResponseBytes: value.maximumResponseBytes,
    timeoutMs: value.timeoutMs,
  });
  const state = {
    status: 'NEW',
    inFlight: null,
    closePromise: null,
    closing: false,
  };

  function assertBoundStore(code) {
    if (!exactObserverStore(observerStore)) fail(code);
  }

  function loadBound(code) {
    assertBoundStore(code);
    let loaded;
    try {
      loaded = assertAuthorityBinding(
        REFLECT_APPLY(OBSERVER_LOAD, observerStore, []),
        authority,
        code,
      );
    } catch (error) {
      if (error instanceof ZenonFundingProviderSigningOperationError) throw error;
      fail(code);
    }
    if (!sameJson(immutableBinding(loaded), binding)) fail(code);
    return loaded;
  }

  function loadExactPrepared(expected, afterPossibleDispatch) {
    const unavailable = afterPossibleDispatch
      ? 'ZENON_FUNDING_PROVIDER_SIGNING_SIGNER_OUTCOME_UNKNOWN'
      : 'ZENON_FUNDING_PROVIDER_SIGNING_ATTESTATION_UNAVAILABLE';
    let record;
    try {
      record = loadBound(unavailable);
    } catch (error) {
      if (error instanceof ZenonFundingProviderSigningOperationError) throw error;
      fail(unavailable);
    }
    if (
      expected !== null
      && (
        record.state.status === ZENON_FUNDING_OBSERVER_STATUS.QUARANTINED
        || record.outbox.status
          === ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.INVALIDATED
      )
    ) {
      state.status = 'INVALIDATED';
      fail('ZENON_FUNDING_PROVIDER_SIGNING_INVALIDATED');
    }
    if (
      expected !== null
      && record.outbox.status
        === ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.EQUIVOCATED
    ) {
      state.status = 'EQUIVOCATED';
      fail('ZENON_FUNDING_PROVIDER_SIGNING_EQUIVOCATED');
    }
    if (
      expected !== null
      && record.outbox.status === ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.READY
    ) fail('ZENON_FUNDING_PROVIDER_SIGNING_STORE_RECOVERY_REQUIRED');
    if (
      record.state.status !== ZENON_FUNDING_OBSERVER_STATUS.THRESHOLD_OBSERVED
      || record.outbox.status !== ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.PREPARED
    ) fail(unavailable);
    let request;
    try {
      const prepared = REFLECT_APPLY(OBSERVER_PEEK, observerStore, []);
      if (prepared === null) fail(unavailable);
      request = parseZenonFundingProviderAttestationRequest({
        authorityRecord: authority,
        request: prepared,
      });
    } catch (error) {
      if (error instanceof ZenonFundingProviderSigningOperationError) throw error;
      fail(unavailable);
    }
    const wireRequest = createZenonFundingProviderSigningChildRequest({
      authorityRecord: authority,
      request,
    });
    const snapshot = Object.freeze({
      observerRevision: record.state.revision,
      outboxRevision: record.outbox.revision,
      operationId: wireRequest.operationId,
      requestCanonical: canonicalJson(request),
      wireCanonical: canonicalJson(wireRequest),
      record,
      request,
      wireRequest,
    });
    if (
      expected !== null
      && (
        snapshot.observerRevision !== expected.observerRevision
        || snapshot.outboxRevision !== expected.outboxRevision
        || snapshot.operationId !== expected.operationId
        || snapshot.requestCanonical !== expected.requestCanonical
        || snapshot.wireCanonical !== expected.wireCanonical
      )
    ) fail(unavailable);
    return snapshot;
  }

  async function run() {
    let child;
    let channel;
    try {
      const prepared = loadExactPrepared(null, false);
      const { request, wireRequest } = prepared;
      const beforeExecutable = inspectExecutable(signerExecutable, effectiveUid);
      loadExactPrepared(prepared, false);
      try {
        child = REFLECT_APPLY(SPAWN, childProcess, [signerExecutable.executablePath, [], {
          cwd: '/',
          detached: false,
          env: REFLECT_APPLY(OBJECT_CREATE, Object, [null]),
          shell: false,
          stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'],
          windowsHide: true,
        }]);
      } catch {
        state.status = 'FAILED';
        fail('ZENON_FUNDING_PROVIDER_SIGNING_SPAWN_FAILED');
      }
      channel = armChildExchange(child, wireRequest.operationId, configuration);
      if (!channel.armed) {
        const failed = await channel.result;
        fail(failed.code ?? 'ZENON_FUNDING_PROVIDER_SIGNING_CHILD_CHANNEL_FAILED');
      }
      const afterSpawn = inspectExecutable(signerExecutable, effectiveUid);
      if (!sameExecutableInspection(beforeExecutable, afterSpawn)) {
        fail('ZENON_FUNDING_PROVIDER_SIGNING_UNSAFE_EXECUTABLE');
      }
      loadExactPrepared(prepared, false);
      const requestFrame = frameZenonFundingProviderSigningChildRequest(
        wireRequest,
        authority,
        authority.maximumCanonicalBytes,
      );
      const exchanged = await channel.beginDispatch(
        requestFrame,
        () => loadExactPrepared(prepared, false),
      );
      if (exchanged.code !== null) fail(exchanged.code);
      const response = exchanged.response;
      const afterResponse = inspectExecutable(signerExecutable, effectiveUid);
      if (!sameExecutableInspection(beforeExecutable, afterResponse)) {
        fail('ZENON_FUNDING_PROVIDER_SIGNING_SIGNER_OUTCOME_UNKNOWN');
      }
      loadExactPrepared(prepared, true);
      if (
        response.status
        === ZENON_FUNDING_PROVIDER_SIGNING_CHILD_RESPONSE_STATUS.APPROVAL_REQUIRED
      ) {
        state.status = 'APPROVAL_REQUIRED';
        return RESULT.APPROVAL_REQUIRED;
      }
      if (response.status === ZENON_FUNDING_PROVIDER_SIGNING_CHILD_RESPONSE_STATUS.REJECTED) {
        state.status = 'REJECTED';
        return RESULT.REJECTED;
      }
      if (response.status !== ZENON_FUNDING_PROVIDER_SIGNING_CHILD_RESPONSE_STATUS.READY) {
        fail('ZENON_FUNDING_PROVIDER_SIGNING_SIGNER_OUTCOME_UNKNOWN');
      }
      let now;
      try { now = REFLECT_APPLY(value.now, undefined, []); } catch {
        fail('ZENON_FUNDING_PROVIDER_SIGNING_SIGNER_OUTCOME_UNKNOWN');
      }
      if (!REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [now]) || now < 0) {
        fail('ZENON_FUNDING_PROVIDER_SIGNING_SIGNER_OUTCOME_UNKNOWN');
      }
      try {
        verifyZenonFundingProviderAttestationEnvelope({
          authorityRecord: authority,
          request,
          envelope: response.envelope,
          nowEpochSeconds: now,
          replayMode: 'COMMITTED_REPLAY',
        });
      } catch {
        fail('ZENON_FUNDING_PROVIDER_SIGNING_SIGNER_OUTCOME_UNKNOWN');
      }
      const recoveryWindowExpired = (
        response.envelope.validUntil <= now
        || now - response.envelope.issuedAt > authority.maximumInitialAgeSeconds
      );
      if (!recoveryWindowExpired) {
        try {
          verifyZenonFundingProviderAttestationEnvelope({
            authorityRecord: authority,
            request,
            envelope: response.envelope,
            nowEpochSeconds: now,
            replayMode: 'INITIAL',
          });
        } catch {
          fail('ZENON_FUNDING_PROVIDER_SIGNING_SIGNER_OUTCOME_UNKNOWN');
        }
      }
      const current = loadExactPrepared(prepared, true);
      if (recoveryWindowExpired) {
        state.status = 'RECOVERY_WINDOW_EXPIRED';
        return RESULT.RECOVERY_WINDOW_EXPIRED;
      }
      let committed;
      try {
        committed = REFLECT_APPLY(OBSERVER_COMMIT, observerStore, [{
          expectedObserverRevision: current.observerRevision,
          expectedOutboxRevision: current.outboxRevision,
          attestationId: request.attestationId,
          envelope: response.envelope,
          nowEpochSeconds: now,
        }]);
      } catch (error) {
        if (errorCode(error) === 'ZENON_FUNDING_OBSERVER_STORE_COMMIT_OUTCOME_UNKNOWN') {
          fail('ZENON_FUNDING_PROVIDER_SIGNING_STORE_RECOVERY_REQUIRED');
        }
        fail('ZENON_FUNDING_PROVIDER_SIGNING_STORE_RECOVERY_REQUIRED');
      }
      if (committed?.disposition === 'EQUIVOCATED') {
        state.status = 'EQUIVOCATED';
        return RESULT.EQUIVOCATED;
      }
      if (committed?.disposition !== 'READY') {
        fail('ZENON_FUNDING_PROVIDER_SIGNING_STORE_RECOVERY_REQUIRED');
      }
      state.status = 'READY_COMMITTED';
      return RESULT.READY_COMMITTED;
    } catch (error) {
      const dispatchPossible = channel?.wasDispatchPossible() === true;
      if (channel !== undefined) channel.abortBeforeDispatch();
      else safeKill(child);
      if (errorCode(error) === 'ZENON_FUNDING_PROVIDER_SIGNING_STORE_RECOVERY_REQUIRED') {
        state.status = 'STORE_RECOVERY_REQUIRED';
        return RESULT.STORE_RECOVERY_REQUIRED;
      }
      if (errorCode(error) === 'ZENON_FUNDING_PROVIDER_SIGNING_EQUIVOCATED') {
        state.status = 'EQUIVOCATED';
        return RESULT.EQUIVOCATED;
      }
      if (errorCode(error) === 'ZENON_FUNDING_PROVIDER_SIGNING_SIGNER_OUTCOME_UNKNOWN') {
        state.status = 'SIGNER_OUTCOME_UNKNOWN';
        return RESULT.SIGNER_OUTCOME_UNKNOWN;
      }
      if (dispatchPossible && errorCode(error) === 'ZENON_FUNDING_PROVIDER_SIGNING_UNSAFE_EXECUTABLE') {
        state.status = 'SIGNER_OUTCOME_UNKNOWN';
        return RESULT.SIGNER_OUTCOME_UNKNOWN;
      }
      if (dispatchPossible && !(error instanceof ZenonFundingProviderSigningOperationError)) {
        state.status = 'SIGNER_OUTCOME_UNKNOWN';
        return RESULT.SIGNER_OUTCOME_UNKNOWN;
      }
      if (state.status === 'NEW' || state.status === 'REQUESTING') state.status = 'FAILED';
      throw error instanceof ZenonFundingProviderSigningOperationError
        ? error
        : failure('ZENON_FUNDING_PROVIDER_SIGNING_FAILED');
    }
  }

  function start() {
    if (arguments.length !== 0) {
      return REFLECT_APPLY(PROMISE_REJECT, NATIVE_PROMISE, [
        failure('ZENON_FUNDING_PROVIDER_SIGNING_INVALID_INPUT'),
      ]);
    }
    if (state.inFlight !== null) return state.inFlight;
    if (state.closing || state.status !== 'NEW') {
      return REFLECT_APPLY(PROMISE_REJECT, NATIVE_PROMISE, [
        failure('ZENON_FUNDING_PROVIDER_SIGNING_OPERATION_CLOSED'),
      ]);
    }
    let release;
    const gate = new NATIVE_PROMISE(resolveGate => { release = resolveGate; });
    const inFlight = REFLECT_APPLY(PROMISE_THEN, gate, [run]);
    state.status = 'REQUESTING';
    state.inFlight = inFlight;
    release();
    return state.inFlight;
  }

  function close() {
    if (arguments.length !== 0) {
      return REFLECT_APPLY(PROMISE_REJECT, NATIVE_PROMISE, [
        failure('ZENON_FUNDING_PROVIDER_SIGNING_INVALID_INPUT'),
      ]);
    }
    if (state.closePromise !== null) return state.closePromise;
    state.closing = true;
    state.closePromise = (async () => {
      if (state.inFlight !== null) {
        try { await state.inFlight; } catch {}
      }
      if (state.status === 'SIGNER_OUTCOME_UNKNOWN') return RESULT.SIGNER_OUTCOME_UNKNOWN;
      if (state.status === 'STORE_RECOVERY_REQUIRED') return RESULT.STORE_RECOVERY_REQUIRED;
      if (state.status === 'RECOVERY_WINDOW_EXPIRED') return RESULT.RECOVERY_WINDOW_EXPIRED;
      if (state.status === 'APPROVAL_REQUIRED') return RESULT.APPROVAL_REQUIRED;
      if (state.status === 'REJECTED') return RESULT.REJECTED;
      if (state.status === 'EQUIVOCATED') return RESULT.EQUIVOCATED;
      if (state.status === 'INVALIDATED') return RESULT.INVALIDATED;
      state.status = 'CLOSED';
      return RESULT.CLOSED;
    })();
    return state.closePromise;
  }

  return OBJECT_FREEZE({ start, close });
}
