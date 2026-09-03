import { fork } from 'node:child_process';
import { closeSync, fstatSync, readSync } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { types as utilTypes } from 'node:util';

import {
  createLiveEvidenceObserver,
  recordLiveEvidencePhase,
} from './live-observation.js';
import {
  CURRENT_TESTNET_WSS_ONCE_POLICY,
  parseLiveRoleInput,
  parseLiveEvidenceRunConfig,
  parseCurrentTestnetWssOnceRoleInput,
  parseCurrentTestnetWssOnceRunConfig,
  parsePublicWsOnceRoleInput,
  parsePublicWsOnceRunConfig,
  PUBLIC_WS_ONCE_POLICY,
} from './live-evidence-runner.js';
import { liveSdkRuntime } from './live-runtime.js';
import { createResourceServer } from './resource-server.js';
import {
  DELIVERY_STATES,
  EVIDENCE_STATES,
  SettlementJournal,
} from './settlement-journal.js';
import { ExactZenonFacilitator, probeZenonRoleReadiness } from './zenon-payment.js';
import {
  GATE_B_CURRENT_TESTNET_SDK_NETWORK_ID,
  selectGateBCurrentTestnetPolicy,
  selectOperatorTrustedTestnetPolicy,
} from './zenon/operator-trusted-testnet-profile.js';

const WORKER_ERROR = 'live_evidence_worker_failed';
const IPC_VERSION = 1;
const MAX_IPC_BYTES = 64 * 1024;
const MAX_IPC_DEPTH = 16;
const MAX_IPC_NODES = 4096;
const MAX_IPC_MEMBERS = 4096;
const MAX_IPC_STRING_BYTES = 16 * 1024;
const MAX_IPC_OBSERVATIONS = 32;
const MAX_REQUEST_ID = 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const EXIT_TIMEOUT_MS = 30_000;
const TERMINATE_GRACE_MS = 1_000;
const SEND_TIMEOUT_MS = 5_000;
const DISCONNECT_STOP_TIMEOUT_MS = 1_000;
const INHERITED_FACILITATOR_RPC_FD = 4;
const HISTORICAL_WSS_EXECUTION_MODE = 'historical-wss-v1';
const ROLE_INPUT_MAX_BYTES = 64 * 1024;
const DEFINE_PROPERTY = Object.defineProperty;
const FREEZE = Object.freeze;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_OWN_PROPERTY_DESCRIPTORS = Object.getOwnPropertyDescriptors;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_IS = Object.is;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const CONTROLLERS = new WeakSet();
const FACILITATOR_PHASES = FREEZE([
  'facilitator_owner_wait_started',
  'facilitator_owner_acquired',
  'facilitator_readiness_started',
  'facilitator_readiness_finished',
  'publication_started',
  'publication_acknowledged',
  'inclusion_wait_started',
  'momentum_inclusion_observed',
  'facilitator_owner_released',
  'delivery_started',
  'delivery_finished',
]);
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DECIMAL = /^(?:0|[1-9]\d*)$/;
const FILE_GENERATION_FIELDS = FREEZE(['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs']);
const DIRECTORY_IDENTITY_FIELDS = FREEZE(['dev', 'ino']);

function workerError() {
  const error = new Error(WORKER_ERROR);
  error.name = 'LiveEvidenceWorkerError';
  error.code = WORKER_ERROR;
  error.stack = `LiveEvidenceWorkerError: ${WORKER_ERROR}`;
  return error;
}

function fail() {
  throw workerError();
}

function ownData(target, key, value) {
  DEFINE_PROPERTY(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

function append(array, value) {
  ownData(array, String(array.length), value);
}

function exactPlainObject(value, fields) {
  if (!value || typeof value !== 'object' || IS_PROXY(value) || Array.isArray(value) ||
      GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  let descriptors;
  let keys;
  try {
    descriptors = GET_OWN_PROPERTY_DESCRIPTORS(value);
    keys = REFLECT_OWN_KEYS(value);
  } catch {
    fail();
  }
  if (keys.length !== fields.length) fail();
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = descriptors[key];
    let allowed = false;
    for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1) {
      if (key === fields[fieldIndex]) allowed = true;
    }
    if (typeof key !== 'string' || !allowed || !descriptor ||
        !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) fail();
  }
  for (let index = 0; index < fields.length; index += 1) {
    if (!HAS_OWN(descriptors, fields[index])) fail();
  }
  return descriptors;
}

function detachedIpcSnapshot(value) {
  const state = { nodes: 0, members: 0 };
  function capture(node, depth) {
    state.nodes += 1;
    if (state.nodes > MAX_IPC_NODES || depth > MAX_IPC_DEPTH) fail();
    if (node === null || typeof node === 'boolean') return node;
    if (typeof node === 'string') {
      if (Buffer.byteLength(node, 'utf8') > MAX_IPC_STRING_BYTES) fail();
      return node;
    }
    if (typeof node === 'number') {
      if (!Number.isSafeInteger(node) || Object.is(node, -0)) fail();
      return node;
    }
    if (!node || typeof node !== 'object' || IS_PROXY(node)) fail();
    const isArray = Array.isArray(node);
    if (GET_PROTOTYPE_OF(node) !== (isArray ? Array.prototype : OBJECT_PROTOTYPE)) fail();
    let descriptors;
    let keys;
    try {
      descriptors = GET_OWN_PROPERTY_DESCRIPTORS(node);
      keys = REFLECT_OWN_KEYS(node);
    } catch {
      fail();
    }
    const output = isArray ? [] : {};
    if (isArray) {
      const length = descriptors.length?.value;
      if (!Number.isSafeInteger(length) || length < 0 || length > MAX_IPC_MEMBERS ||
          keys.length !== length + 1) fail();
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) fail();
        state.members += 1;
        if (state.members > MAX_IPC_MEMBERS) fail();
        append(output, capture(descriptor.value, depth + 1));
      }
      for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (typeof key !== 'string' || (key !== 'length' && !/^(?:0|[1-9]\d*)$/.test(key))) fail();
      }
    } else {
      for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        const descriptor = descriptors[key];
        if (typeof key !== 'string' || !descriptor || !HAS_OWN(descriptor, 'value') ||
            descriptor.enumerable !== true) fail();
        state.members += 1;
        if (state.members > MAX_IPC_MEMBERS) fail();
        ownData(output, key, capture(descriptor.value, depth + 1));
      }
    }
    return output;
  }
  const snapshot = capture(value, 0);
  let encoded;
  try {
    encoded = JSON.stringify(snapshot);
  } catch {
    fail();
  }
  if (Buffer.byteLength(encoded, 'utf8') > MAX_IPC_BYTES) fail();
  return snapshot;
}

function exactMessage(value, type, requestId, fields) {
  const snapshot = detachedIpcSnapshot(value);
  const allFields = ['ipcVersion', 'requestId', 'type'];
  for (let index = 0; index < fields.length; index += 1) append(allFields, fields[index]);
  const descriptors = exactPlainObject(snapshot, allFields);
  if (descriptors.ipcVersion.value !== IPC_VERSION || descriptors.type.value !== type ||
      descriptors.requestId.value !== requestId || !Number.isSafeInteger(requestId) ||
      requestId < 1 || requestId > MAX_REQUEST_ID) fail();
  return snapshot;
}

function snapshotEvents(events) {
  if (IS_PROXY(events) || !Array.isArray(events) || events.length > MAX_IPC_OBSERVATIONS) fail();
  const output = [];
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    exactPlainObject(event, ['sequence', 'phase', 'role', 'clockDomain', 'utc', 'monotonicMs']);
    if (!Number.isSafeInteger(event.sequence) || OBJECT_IS(event.sequence, -0) ||
        event.sequence !== index ||
        event.role !== 'facilitator' || !FACILITATOR_PHASES.includes(event.phase) ||
        event.clockDomain !== 'facilitator-monotonic-v1' ||
        typeof event.utc !== 'string' || !UTC_TIMESTAMP.test(event.utc) ||
        !Number.isFinite(Date.parse(event.utc)) || new Date(Date.parse(event.utc)).toISOString() !== event.utc ||
        !Number.isSafeInteger(event.monotonicMs) || event.monotonicMs < 0 ||
        OBJECT_IS(event.monotonicMs, -0)) fail();
    append(output, event);
  }
  return FREEZE(output);
}

function recordContained(observer, events, phase) {
  try {
    const event = recordLiveEvidencePhase(observer, 'facilitator', phase);
    if (event && events.length < MAX_IPC_OBSERVATIONS) append(events, event);
  } catch {
    // Optional evidence must never change settlement or delivery semantics.
  }
}

export function createObservedFacilitatorAdapter(facilitator, observer) {
  if (!facilitator || typeof facilitator.settle !== 'function' ||
      typeof facilitator.markDeliveryPending !== 'function' ||
      typeof facilitator.markDelivered !== 'function' ||
      typeof facilitator.snapshotLiveEvidenceObservations !== 'function') fail();
  const deliveryEvents = [];
  const adapter = {
    settle: facilitator.settle.bind(facilitator),
    async markDeliveryPending(settlement) {
      recordContained(observer, deliveryEvents, 'delivery_started');
      return facilitator.markDeliveryPending(settlement);
    },
    async markDelivered(settlement, cachedResponse) {
      const delivered = await facilitator.markDelivered(settlement, cachedResponse);
      recordContained(observer, deliveryEvents, 'delivery_finished');
      return delivered;
    },
    snapshotLiveEvidenceObservations() {
      const events = [];
      const settlementEvents = facilitator.snapshotLiveEvidenceObservations();
      for (let index = 0; index < settlementEvents.length; index += 1) {
        append(events, settlementEvents[index]);
      }
      for (let index = 0; index < deliveryEvents.length; index += 1) {
        append(events, deliveryEvents[index]);
      }
      return snapshotEvents(events);
    },
  };
  return FREEZE(adapter);
}

function explicitEnvironment(config, rpcEndpoint, executionMode = HISTORICAL_WSS_EXECUTION_MODE) {
  const sdkNetworkId = executionMode === PUBLIC_WS_ONCE_POLICY.executionMode ||
      executionMode === CURRENT_TESTNET_WSS_ONCE_POLICY.executionMode
    ? GATE_B_CURRENT_TESTNET_SDK_NETWORK_ID
    : executionMode === HISTORICAL_WSS_EXECUTION_MODE
      ? '3'
      : fail();
  return FREEZE({
    ZENON_LIVE_ACK: config.acknowledgements.live,
    ZENON_NETWORK_ID: sdkNetworkId,
    ZENON_RPC_URL: rpcEndpoint,
    ZENON_ASSET: config.expectedPaymentRequired.accepts[0].asset,
  });
}

function exactFileGeneration(value) {
  exactPlainObject(value, FILE_GENERATION_FIELDS);
  const copy = {};
  for (let index = 0; index < FILE_GENERATION_FIELDS.length; index += 1) {
    const field = FILE_GENERATION_FIELDS[index];
    if (typeof value[field] !== 'string' || !DECIMAL.test(value[field])) fail();
    ownData(copy, field, value[field]);
  }
  return FREEZE(copy);
}

function generationFromStat(stat) {
  const generation = {};
  for (let index = 0; index < FILE_GENERATION_FIELDS.length; index += 1) {
    const field = FILE_GENERATION_FIELDS[index];
    const value = stat[field];
    if (typeof value !== 'bigint' || value < 0n) fail();
    ownData(generation, field, value.toString());
  }
  return FREEZE(generation);
}

function sameGeneration(left, right) {
  for (let index = 0; index < FILE_GENERATION_FIELDS.length; index += 1) {
    const field = FILE_GENERATION_FIELDS[index];
    if (left[field] !== right[field]) return false;
  }
  return true;
}

function exactDirectoryIdentity(value) {
  exactPlainObject(value, DIRECTORY_IDENTITY_FIELDS);
  const copy = {};
  for (let index = 0; index < DIRECTORY_IDENTITY_FIELDS.length; index += 1) {
    const field = DIRECTORY_IDENTITY_FIELDS[index];
    if (typeof value[field] !== 'string' || !DECIMAL.test(value[field])) fail();
    ownData(copy, field, value[field]);
  }
  return FREEZE(copy);
}

async function assertExpectedPrivateDirectory(path, expectedIdentity) {
  const expected = exactDirectoryIdentity(expectedIdentity);
  const stat = await lstat(path, { bigint: true });
  const uidMatches = typeof process.getuid !== 'function' || stat.uid === BigInt(process.getuid());
  if (!stat.isDirectory() || stat.isSymbolicLink() ||
      Number(stat.mode & 0o777n) !== 0o700 || !uidMatches) fail();
  const observed = { dev: stat.dev.toString(), ino: stat.ino.toString() };
  if (observed.dev !== expected.dev || observed.ino !== expected.ino) fail();
}

function assertInheritedFileStat(stat) {
  const uidMatches = typeof process.getuid !== 'function' || stat.uid === BigInt(process.getuid());
  if (!stat.isFile() || stat.nlink !== 1n || Number(stat.mode & 0o777n) !== 0o600 ||
      !uidMatches || stat.size < 1n || stat.size > BigInt(ROLE_INPUT_MAX_BYTES)) fail();
}

export async function readInheritedLiveRoleInput(
  fd,
  expectedGeneration,
  role = 'facilitator-rpc',
) {
  let bytes;
  try {
    if (!Number.isSafeInteger(fd) || fd < 0 ||
        (role !== 'facilitator-rpc' && role !== 'facilitator-public-ws-once-rpc' &&
          role !== 'facilitator-current-testnet-wss-once-rpc')) fail();
    const generation = exactFileGeneration(expectedGeneration);
    const before = fstatSync(fd, { bigint: true });
    assertInheritedFileStat(before);
    if (!sameGeneration(generationFromStat(before), generation)) fail();
    const size = Number(before.size);
    bytes = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const count = readSync(fd, bytes, offset, size - offset, offset);
      if (!Number.isSafeInteger(count) || count <= 0) fail();
      offset += count;
    }
    const after = fstatSync(fd, { bigint: true });
    assertInheritedFileStat(after);
    if (!sameGeneration(generationFromStat(after), generation)) fail();
    if (role === 'facilitator-public-ws-once-rpc') {
      return parsePublicWsOnceRoleInput(bytes.toString('utf8'), 'facilitator-rpc');
    }
    if (role === 'facilitator-current-testnet-wss-once-rpc') {
      return parseCurrentTestnetWssOnceRoleInput(
        bytes.toString('utf8'),
        'facilitator-rpc',
      );
    }
    return parseLiveRoleInput(bytes.toString('utf8'), role);
  } catch {
    fail();
  } finally {
    if (Buffer.isBuffer(bytes)) bytes.fill(0);
    try { closeSync(fd); } catch {}
  }
}

function workerUidMatches(stat) {
  return typeof process.getuid !== 'function' || stat.uid === process.getuid();
}

async function assertPrivateWorkerDirectory(path) {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700 ||
      !workerUidMatches(stat)) fail();
}

function assertJournalDescendant(workspaceRoot, journalDirectory) {
  if (!isAbsolute(workspaceRoot) || !isAbsolute(journalDirectory) ||
      resolve(workspaceRoot) !== workspaceRoot || resolve(journalDirectory) !== journalDirectory) fail();
  const rel = relative(workspaceRoot, journalDirectory);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail();
}

class BoundaryCheckedSettlementJournal extends SettlementJournal {
  constructor(options, boundary) {
    super(options);
    DEFINE_PROPERTY(this, 'boundary', {
      value: boundary,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }

  async guarded(method, args) {
    await this.boundary();
    const result = await Reflect.apply(method, this, args);
    await this.boundary();
    return result;
  }

  async load(...args) { return this.guarded(super.load, args); }
  async putValidated(...args) { return this.guarded(super.putValidated, args); }
  async get(...args) { return this.guarded(super.get, args); }
  async findByTransactionHash(...args) {
    return this.guarded(super.findByTransactionHash, args);
  }
  async getTombstone(...args) { return this.guarded(super.getTombstone, args); }
  async findTombstoneByTransactionHash(...args) {
    return this.guarded(super.findTombstoneByTransactionHash, args);
  }
  async listReconciliationCandidates(...args) {
    return this.guarded(super.listReconciliationCandidates, args);
  }
  async getEntrySnapshot(...args) { return this.guarded(super.getEntrySnapshot, args); }
  async compareAndUpdateEvidence(...args) {
    return this.guarded(super.compareAndUpdateEvidence, args);
  }
  async replaceRecordWithTombstone(...args) {
    return this.guarded(super.replaceRecordWithTombstone, args);
  }
  async recordLateMomentumEvidence(...args) {
    return this.guarded(super.recordLateMomentumEvidence, args);
  }
  async updateEvidence(...args) { return this.guarded(super.updateEvidence, args); }
  async markDeliveryPending(...args) { return this.guarded(super.markDeliveryPending, args); }
  async markDelivered(...args) { return this.guarded(super.markDelivered, args); }
  async list(...args) { return this.guarded(super.list, args); }
}

function plausibleRecoveryRecord(snapshot) {
  if (snapshot.schemaVersion !== 1 || !Number.isSafeInteger(snapshot.revision) ||
      snapshot.revision < 1 || snapshot.revision > 6 ||
      !Array.isArray(snapshot.records) || snapshot.records.length !== 1) return false;
  const record = snapshot.records[0];
  if (!record || typeof record !== 'object') return false;
  const evidence = record.evidenceState;
  const delivery = record.deliveryState;
  if (delivery === DELIVERY_STATES.DELIVERED) {
    return evidence === EVIDENCE_STATES.MOMENTUM_INCLUDED && snapshot.revision >= 4;
  }
  if (delivery === DELIVERY_STATES.DELIVERY_PENDING) {
    return evidence === EVIDENCE_STATES.MOMENTUM_INCLUDED && snapshot.revision >= 3;
  }
  if (delivery !== DELIVERY_STATES.NONE) return false;
  if (evidence === EVIDENCE_STATES.VALIDATED) return snapshot.revision === 1;
  if (evidence === EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN) return snapshot.revision === 2;
  if (evidence === EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED) {
    return snapshot.revision === 2 || snapshot.revision === 3;
  }
  if (evidence === EVIDENCE_STATES.MOMENTUM_INCLUDED) {
    return snapshot.revision >= 2 && snapshot.revision <= 4;
  }
  return false;
}

function validFinalJournal(snapshot, recovery) {
  if (snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.records) ||
      snapshot.records.length !== 1 || !Number.isSafeInteger(snapshot.revision)) return false;
  const record = snapshot.records[0];
  if (!record || record.evidenceState !== EVIDENCE_STATES.MOMENTUM_INCLUDED ||
      record.deliveryState !== DELIVERY_STATES.DELIVERED || record.cachedResponse === null ||
      record.cachedResponse === undefined) return false;
  return recovery
    ? snapshot.revision >= 4 && snapshot.revision <= 6
    : snapshot.revision === 5;
}

const DEFAULT_START_DEPENDENCIES = FREEZE({
  probeRoleReadiness: probeZenonRoleReadiness,
  createFacilitator: options => new ExactZenonFacilitator(options),
  createServer: options => createResourceServer(options),
  runtimePoisoned: () => liveSdkRuntime.poisoned,
});

function exactStartDependencies(value) {
  if (value === undefined) return DEFAULT_START_DEPENDENCIES;
  const fields = ['probeRoleReadiness', 'createFacilitator', 'createServer', 'runtimePoisoned'];
  const descriptors = exactPlainObject(value, fields);
  const captured = {};
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (typeof descriptors[field].value !== 'function') fail();
    ownData(captured, field, descriptors[field].value);
  }
  return FREEZE(captured);
}

export async function startDefaultLiveEvidenceFacilitatorRuntime(
  message,
  dependencies = undefined,
) {
  const runtimeDependencies = exactStartDependencies(dependencies);
  const executionMode = message.executionMode === undefined
    ? HISTORICAL_WSS_EXECUTION_MODE
    : message.executionMode;
  if (executionMode !== HISTORICAL_WSS_EXECUTION_MODE &&
      executionMode !== PUBLIC_WS_ONCE_POLICY.executionMode &&
      executionMode !== CURRENT_TESTNET_WSS_ONCE_POLICY.executionMode) fail();
  const currentTestnetOnce = executionMode === PUBLIC_WS_ONCE_POLICY.executionMode ||
    executionMode === CURRENT_TESTNET_WSS_ONCE_POLICY.executionMode;
  if (currentTestnetOnce && message.recovery !== false) fail();
  const assertBoundary = currentTestnetOnce
    ? async () => {
      await assertExpectedPrivateDirectory(message.workspaceRoot, message.workspaceIdentity);
      await assertExpectedPrivateDirectory(
        dirname(message.journalDirectory),
        message.runDirectoryIdentity,
      );
    }
    : async () => {};
  const config = executionMode === PUBLIC_WS_ONCE_POLICY.executionMode
    ? parsePublicWsOnceRunConfig(`${JSON.stringify(message.config)}\n`)
    : executionMode === CURRENT_TESTNET_WSS_ONCE_POLICY.executionMode
      ? parseCurrentTestnetWssOnceRunConfig(`${JSON.stringify(message.config)}\n`)
      : parseLiveEvidenceRunConfig(`${JSON.stringify(message.config)}\n`);
  const role = executionMode === PUBLIC_WS_ONCE_POLICY.executionMode
    ? 'facilitator-public-ws-once-rpc'
    : executionMode === CURRENT_TESTNET_WSS_ONCE_POLICY.executionMode
      ? 'facilitator-current-testnet-wss-once-rpc'
      : 'facilitator-rpc';
  const secret = await readInheritedLiveRoleInput(
    INHERITED_FACILITATOR_RPC_FD,
    message.facilitatorRpcGeneration,
    role,
  );
  const policy = currentTestnetOnce
    ? selectGateBCurrentTestnetPolicy(
      config.profileName,
      config.acknowledgements.operatorTrust,
      config.acknowledgements.live,
    )
    : selectOperatorTrustedTestnetPolicy(
      config.profileName,
      config.acknowledgements.operatorTrust,
      config.acknowledgements.live,
    );
  const environment = explicitEnvironment(config, secret.rpcEndpoint, executionMode);
  await assertBoundary();
  assertJournalDescendant(message.workspaceRoot, message.journalDirectory);
  await assertPrivateWorkerDirectory(dirname(message.journalDirectory));
  const Journal = currentTestnetOnce ? BoundaryCheckedSettlementJournal : SettlementJournal;
  const journalOptions = {
    directory: message.journalDirectory,
    allowedRoot: dirname(message.journalDirectory),
  };
  const journal = currentTestnetOnce
    ? new Journal(journalOptions, assertBoundary)
    : new Journal(journalOptions);
  const initial = await journal.load();
  await assertBoundary();
  await assertPrivateWorkerDirectory(message.journalDirectory);
  if (message.recovery) {
    if (!plausibleRecoveryRecord(initial)) fail();
  } else if (initial.schemaVersion !== 1 || initial.revision !== 0 ||
      !Array.isArray(initial.records) || initial.records.length !== 0) fail();
  await assertBoundary();
  await Reflect.apply(runtimeDependencies.probeRoleReadiness, undefined, [{
    role: 'facilitator',
    asset: config.expectedPaymentRequired.accepts[0].asset,
    operatorTrustedChainPolicy: policy,
    environment,
    rpcTimeoutMs: config.runtime.rpcTimeoutMs,
  }]);
  await assertBoundary();
  const observer = createLiveEvidenceObserver();
  const facilitator = Reflect.apply(runtimeDependencies.createFacilitator, undefined, [{
    environment,
    operatorTrustedChainPolicy: policy,
    journal,
    rpcTimeoutMs: config.runtime.rpcTimeoutMs,
    reconciliationRetentionMs: null,
    lifecycleObserver: observer,
  }]);
  const adapter = createObservedFacilitatorAdapter(facilitator, observer);
  const resourceUrl = config.expectedPaymentRequired.resource.url;
  const advertisedBaseUrl = resourceUrl.slice(0, -'/paid'.length);
  const app = Reflect.apply(runtimeDependencies.createServer, undefined, [{
    facilitator: adapter,
    requirement: config.expectedPaymentRequired.accepts[0],
    host: '127.0.0.1',
    port: config.runtime.listenPort,
    advertisedBaseUrl,
  }]);
  if (!app || typeof app.listen !== 'function' || typeof app.close !== 'function') fail();
  await assertBoundary();
  await app.listen();
  await assertBoundary();
  let stopped = false;
  let finalSnapshot;
  return {
    snapshotObservations() {
      const events = adapter.snapshotLiveEvidenceObservations();
      return FREEZE({ evidenceEligible: events.length === 11, events });
    },
    poisoned() {
      return Reflect.apply(runtimeDependencies.runtimePoisoned, undefined, []) === true;
    },
    async stop({ final }) {
      if (stopped) return finalSnapshot;
      stopped = true;
      await assertBoundary();
      await app.close();
      await assertBoundary();
      if (!final) return null;
      const snapshot = await journal.load();
      await assertBoundary();
      if (!validFinalJournal(snapshot, message.recovery)) fail();
      finalSnapshot = FREEZE({
        quiescent: true,
        schemaVersion: snapshot.schemaVersion,
        revision: snapshot.revision,
        records: snapshot.records,
      });
      return finalSnapshot;
    },
  };
}

const defaultStart = startDefaultLiveEvidenceFacilitatorRuntime;

function exactRequest(message, type, fields) {
  const requestId = message && typeof message === 'object'
    ? GET_OWN_PROPERTY_DESCRIPTOR(message, 'requestId')?.value
    : undefined;
  return exactMessage(message, type, requestId, fields);
}

function ownMessageType(message) {
  try {
    if (!message || typeof message !== 'object' || IS_PROXY(message) ||
        GET_PROTOTYPE_OF(message) !== OBJECT_PROTOTYPE) return undefined;
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(message, 'type');
    return descriptor && HAS_OWN(descriptor, 'value') && descriptor.enumerable === true &&
      typeof descriptor.value === 'string'
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}

function sendMessage(channel, message) {
  return new Promise((resolveSend, rejectSend) => {
    let completed = false;
    const timer = setTimeout(() => finish(workerError()), SEND_TIMEOUT_MS);
    const finish = error => {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      if (error) rejectSend(workerError());
      else resolveSend();
    };
    try {
      const accepted = channel.send(message, finish);
      if (accepted === false && channel.connected === false) finish(workerError());
    } catch {
      finish(workerError());
    }
  });
}

export async function runLiveEvidenceFacilitatorWorker(options = {}) {
  const supplied = options === undefined ? {} : options;
  if (!supplied || typeof supplied !== 'object' || IS_PROXY(supplied)) fail();
  let keys;
  try { keys = REFLECT_OWN_KEYS(supplied); } catch { fail(); }
  const descriptors = exactPlainObject(supplied, keys);
  const allowed = ['channel', 'start', 'shutdownTimeoutMs', 'forceExit'];
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (typeof key !== 'string' || !allowed.includes(key)) fail();
  }
  const channel = HAS_OWN(descriptors, 'channel') ? descriptors.channel.value : process;
  const start = HAS_OWN(descriptors, 'start') ? descriptors.start.value : defaultStart;
  const shutdownTimeoutMs = HAS_OWN(descriptors, 'shutdownTimeoutMs')
    ? descriptors.shutdownTimeoutMs.value
    : DISCONNECT_STOP_TIMEOUT_MS;
  const forceExit = HAS_OWN(descriptors, 'forceExit')
    ? descriptors.forceExit.value
    : (channel === process ? code => process.exit(code) : () => {});
  if (!channel || typeof channel.on !== 'function' || typeof channel.send !== 'function' ||
      typeof start !== 'function' || !Number.isSafeInteger(shutdownTimeoutMs) ||
      shutdownTimeoutMs < 1 || shutdownTimeoutMs > 30_000 || typeof forceExit !== 'function') fail();
  let runtime;
  let running = false;
  let handling = false;
  let stopping = false;
  let expectedRequestId = 1;
  let shutdownPromise;
  let startInProgress = false;
  let startSettled;
  let normalStopRequest;
  let failureRequestId;
  let coordinatorDisconnected = false;
  let expectedDisconnect = false;
  let watchdogTimer;
  let watchdogDeadline;
  let forcedExit = false;
  let publicPreloaded = false;

  const requestIdOf = rawMessage => {
    try {
      if (!rawMessage || typeof rawMessage !== 'object' || IS_PROXY(rawMessage)) return undefined;
      const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(rawMessage, 'requestId');
      return descriptor && HAS_OWN(descriptor, 'value') && descriptor.enumerable === true
        ? descriptor.value
        : undefined;
    } catch {
      return undefined;
    }
  };

  const forceSanitizedExit = () => {
    if (forcedExit) return;
    forcedExit = true;
    if (watchdogTimer) clearTimeout(watchdogTimer);
    watchdogTimer = undefined;
    if (channel === process) process.exitCode = 1;
    try { Reflect.apply(forceExit, undefined, [1]); } catch {}
  };

  const armHardWatchdog = () => {
    const candidateDeadline = Date.now() + shutdownTimeoutMs;
    if (!Number.isSafeInteger(candidateDeadline)) forceSanitizedExit();
    if (watchdogDeadline !== undefined && watchdogDeadline <= candidateDeadline) return;
    if (watchdogTimer) clearTimeout(watchdogTimer);
    watchdogDeadline = candidateDeadline;
    watchdogTimer = setTimeout(forceSanitizedExit, shutdownTimeoutMs);
  };

  const remainingShutdownTime = () => {
    if (watchdogDeadline === undefined) fail();
    const remaining = watchdogDeadline - Date.now();
    if (!Number.isSafeInteger(remaining) || remaining <= 0) {
      forceSanitizedExit();
      fail();
    }
    return remaining;
  };

  const awaitShutdownStep = async operation => {
    try {
      return await boundedTimer(Promise.resolve(operation), remainingShutdownTime());
    } catch {
      forceSanitizedExit();
      fail();
    }
  };

  const clearHardWatchdog = () => {
    if (watchdogTimer) clearTimeout(watchdogTimer);
    watchdogTimer = undefined;
    watchdogDeadline = undefined;
  };

  const beginShutdown = ({ requestId, final, protocol = false, disconnected = false } = {}) => {
    stopping = true;
    if (disconnected) coordinatorDisconnected = true;
    if (protocol && failureRequestId === undefined) {
      failureRequestId = Number.isSafeInteger(requestId) && requestId >= 1 &&
        requestId <= MAX_REQUEST_ID
        ? requestId
        : 1;
    }
    if (typeof final === 'boolean' && normalStopRequest === undefined) {
      normalStopRequest = { requestId, final };
    }
    armHardWatchdog();
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      try {
        if (startInProgress && startSettled) await awaitShutdownStep(startSettled.promise);
        let snapshot = null;
        if (runtime && typeof runtime.stop === 'function') {
          const cleanFinal = normalStopRequest !== undefined && failureRequestId === undefined &&
            coordinatorDisconnected === false
            ? normalStopRequest.final
            : false;
          snapshot = await awaitShutdownStep(runtime.stop({ final: cleanFinal }));
        }
        if (failureRequestId !== undefined && channel.connected !== false) {
          await awaitShutdownStep(sendMessage(channel, {
            ipcVersion: IPC_VERSION,
            requestId: failureRequestId,
            type: 'FAILED',
            code: WORKER_ERROR,
          }));
        } else if (normalStopRequest !== undefined && coordinatorDisconnected === false) {
          await awaitShutdownStep(sendMessage(channel, {
            ipcVersion: IPC_VERSION,
            requestId: normalStopRequest.requestId,
            type: 'STOPPED',
            snapshot,
          }));
        }
        running = false;
        try {
          expectedDisconnect = true;
          if (typeof channel.disconnect === 'function' && channel.connected !== false) {
            channel.disconnect();
          }
        } catch {
          forceSanitizedExit();
          return undefined;
        }
        if (coordinatorDisconnected || failureRequestId !== undefined) {
          if (channel === process) process.exitCode = 1;
        }
        return snapshot;
      } catch {
        forceSanitizedExit();
        return undefined;
      }
    })();
    return shutdownPromise;
  };

  const protocolFailure = requestId => beginShutdown({ requestId, protocol: true });

  const handleMessage = async (rawMessage, requestId) => {
    try {
      if (requestId !== expectedRequestId || requestId > MAX_REQUEST_ID) fail();
      const messageType = ownMessageType(rawMessage);
      if (messageType === 'PRELOAD') {
        exactRequest(rawMessage, 'PRELOAD', []);
        if (running || runtime || startInProgress || publicPreloaded) fail();
        publicPreloaded = true;
        expectedRequestId += 1;
        await sendMessage(channel, {
          ipcVersion: IPC_VERSION,
          requestId,
          type: 'PRELOADED',
        });
        return;
      }
      if (messageType === 'START' || messageType === 'START_PUBLIC_WS_ONCE' ||
          messageType === 'START_CURRENT_TESTNET_WSS_ONCE') {
        const currentTestnetOnce = messageType === 'START_PUBLIC_WS_ONCE' ||
          messageType === 'START_CURRENT_TESTNET_WSS_ONCE';
        const expectedExecutionMode = messageType === 'START_PUBLIC_WS_ONCE'
          ? PUBLIC_WS_ONCE_POLICY.executionMode
          : messageType === 'START_CURRENT_TESTNET_WSS_ONCE'
            ? CURRENT_TESTNET_WSS_ONCE_POLICY.executionMode
            : HISTORICAL_WSS_EXECUTION_MODE;
        const message = exactRequest(rawMessage, messageType, currentTestnetOnce
          ? [
            'config', 'facilitatorRpcGeneration', 'workspaceRoot',
            'journalDirectory', 'recovery', 'executionMode',
            'workspaceIdentity', 'runDirectoryIdentity',
          ]
          : [
            'config', 'facilitatorRpcGeneration', 'workspaceRoot',
            'journalDirectory', 'recovery',
          ]);
        if (running || typeof message.recovery !== 'boolean' ||
            publicPreloaded !== currentTestnetOnce ||
            (currentTestnetOnce && (message.recovery !== false ||
              message.executionMode !== expectedExecutionMode))) fail();
        for (const field of ['workspaceRoot', 'journalDirectory']) {
          if (typeof message[field] !== 'string' || message[field].length === 0 ||
              Buffer.byteLength(message[field], 'utf8') > MAX_IPC_STRING_BYTES) fail();
        }
        exactFileGeneration(message.facilitatorRpcGeneration);
        if (currentTestnetOnce) {
          exactDirectoryIdentity(message.workspaceIdentity);
          exactDirectoryIdentity(message.runDirectoryIdentity);
        }
        expectedRequestId += 1;
        startInProgress = true;
        startSettled = createDeferred();
        try {
          runtime = await start(message);
        } finally {
          startInProgress = false;
          startSettled.resolve();
        }
        if (stopping) {
          await beginShutdown({ disconnected: coordinatorDisconnected });
          return;
        }
        running = true;
        await sendMessage(channel, { ipcVersion: IPC_VERSION, requestId, type: 'READY' });
        return;
      }
      if (!running || !runtime) fail();
      if (messageType === 'OBSERVATIONS') {
        exactRequest(rawMessage, 'OBSERVATIONS', []);
        expectedRequestId += 1;
        const observation = runtime.snapshotObservations();
        if (stopping) fail();
        await sendMessage(channel, {
          ipcVersion: IPC_VERSION,
          requestId,
          type: 'OBSERVATIONS',
          evidenceEligible: observation.evidenceEligible,
          events: observation.events,
        });
        return;
      }
      if (messageType === 'STATUS') {
        exactRequest(rawMessage, 'STATUS', []);
        expectedRequestId += 1;
        const poisoned = runtime.poisoned() === true;
        if (stopping) fail();
        await sendMessage(channel, {
          ipcVersion: IPC_VERSION,
          requestId,
          type: 'STATUS',
          poisoned,
        });
        return;
      }
      if (messageType === 'STOP') {
        const message = exactRequest(rawMessage, 'STOP', ['final']);
        if (typeof message.final !== 'boolean') fail();
        expectedRequestId += 1;
        await beginShutdown({ requestId, final: message.final });
        return;
      }
      fail();
    } catch {
      await protocolFailure(requestId);
    } finally {
      handling = false;
    }
  };

  channel.on('message', rawMessage => {
    const requestId = requestIdOf(rawMessage);
    if (handling || stopping) {
      void protocolFailure(requestId);
      return;
    }
    handling = true;
    void handleMessage(rawMessage, requestId);
  });
  channel.on('disconnect', () => {
    if (expectedDisconnect) {
      clearHardWatchdog();
      return;
    }
    coordinatorDisconnected = true;
    armHardWatchdog();
    void beginShutdown({ disconnected: true });
  });
  return true;
}

function createDeferred() {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function boundedTimer(promise, timeoutMs) {
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => rejectPromise(workerError()), timeoutMs);
    promise.then(
      value => {
        clearTimeout(timer);
        resolvePromise(value);
      },
      () => {
        clearTimeout(timer);
        rejectPromise(workerError());
      },
    );
  });
}

function destroyChildPipes(child) {
  for (const stream of [child?.stdout, child?.stderr]) {
    try {
      if (stream && typeof stream.destroy === 'function' && stream.destroyed !== true) {
        stream.destroy();
      }
    } catch {}
  }
}

function trackChildLifecycle(child) {
  if (!child || typeof child.on !== 'function') return undefined;
  const exitedDeferred = createDeferred();
  const closedDeferred = createDeferred();
  const disconnectedDeferred = createDeferred();
  const state = {
    exited: false,
    closed: false,
    disconnected: child.connected === false,
    code: undefined,
    signal: undefined,
    exitPromise: exitedDeferred.promise,
    closePromise: closedDeferred.promise,
    disconnectPromise: disconnectedDeferred.promise,
  };
  if (state.disconnected) disconnectedDeferred.resolve();
  child.on('disconnect', () => {
    if (state.disconnected) return;
    state.disconnected = true;
    disconnectedDeferred.resolve();
  });
  child.on('exit', (code, signal) => {
    if (state.exited) return;
    state.exited = true;
    state.code = code;
    state.signal = signal;
    exitedDeferred.resolve();
  });
  child.on('close', (code, signal) => {
    if (!state.exited) {
      state.exited = true;
      state.code = code;
      state.signal = signal;
      exitedDeferred.resolve();
    }
    if (!state.disconnected) {
      state.disconnected = true;
      disconnectedDeferred.resolve();
    }
    if (state.closed) return;
    state.closed = true;
    closedDeferred.resolve();
  });
  if (child.exitCode !== null && child.exitCode !== undefined) {
    state.exited = true;
    state.code = child.exitCode;
    state.signal = child.signalCode ?? null;
    exitedDeferred.resolve();
  }
  return state;
}

async function terminatePartialChild(child, knownLifecycleState) {
  if (!child) return;
  const lifecycleState = knownLifecycleState ?? trackChildLifecycle(child);
  try { if (!lifecycleState?.closed && typeof child.kill === 'function') child.kill('SIGTERM'); } catch {}
  if (lifecycleState) {
    try {
      await boundedTimer(lifecycleState.closePromise, TERMINATE_GRACE_MS);
    } catch {
      destroyChildPipes(child);
      try { if (!lifecycleState.closed && typeof child.kill === 'function') child.kill('SIGKILL'); } catch {}
      try { await boundedTimer(lifecycleState.closePromise, TERMINATE_GRACE_MS); } catch {}
    }
    destroyChildPipes(child);
    if (!lifecycleState.closed) fail();
  } else {
    destroyChildPipes(child);
  }
}

function captureControllerOptions(options) {
  const descriptors = exactPlainObject(options, [
    'config', 'facilitatorRpcFd', 'facilitatorRpcGeneration', 'workspaceRoot',
    'journalDirectory', 'recovery', 'forkProcess', 'executionMode',
    'workspaceIdentity', 'runDirectoryIdentity',
  ]);
  const config = detachedIpcSnapshot(descriptors.config.value);
  const stringFields = ['workspaceRoot', 'journalDirectory'];
  const captured = { config };
  for (let index = 0; index < stringFields.length; index += 1) {
    const value = descriptors[stringFields[index]].value;
    if (typeof value !== 'string' || value.length === 0 ||
        Buffer.byteLength(value, 'utf8') > MAX_IPC_STRING_BYTES) fail();
    ownData(captured, stringFields[index], value);
  }
  const fd = descriptors.facilitatorRpcFd.value;
  if (!Number.isSafeInteger(fd) || fd < 0) fail();
  ownData(captured, 'facilitatorRpcFd', fd);
  const generation = exactFileGeneration(detachedIpcSnapshot(
    descriptors.facilitatorRpcGeneration.value,
  ));
  ownData(captured, 'facilitatorRpcGeneration', generation);
  if (typeof descriptors.recovery.value !== 'boolean' ||
      typeof descriptors.forkProcess.value !== 'function') fail();
  const executionMode = descriptors.executionMode.value;
  if (executionMode !== HISTORICAL_WSS_EXECUTION_MODE &&
      executionMode !== PUBLIC_WS_ONCE_POLICY.executionMode &&
      executionMode !== CURRENT_TESTNET_WSS_ONCE_POLICY.executionMode) fail();
  const currentTestnetOnce = executionMode === PUBLIC_WS_ONCE_POLICY.executionMode ||
    executionMode === CURRENT_TESTNET_WSS_ONCE_POLICY.executionMode;
  if (currentTestnetOnce &&
      descriptors.recovery.value !== false) fail();
  if (currentTestnetOnce) {
    ownData(captured, 'workspaceIdentity', exactDirectoryIdentity(
      detachedIpcSnapshot(descriptors.workspaceIdentity.value),
    ));
    ownData(captured, 'runDirectoryIdentity', exactDirectoryIdentity(
      detachedIpcSnapshot(descriptors.runDirectoryIdentity.value),
    ));
  } else if (descriptors.workspaceIdentity.value !== undefined ||
      descriptors.runDirectoryIdentity.value !== undefined) {
    fail();
  }
  ownData(captured, 'recovery', descriptors.recovery.value);
  ownData(captured, 'forkProcess', descriptors.forkProcess.value);
  ownData(captured, 'executionMode', executionMode);
  return captured;
}

export function assertLiveEvidenceFacilitatorController(controller) {
  if (!controller || (typeof controller !== 'object' && typeof controller !== 'function') ||
      IS_PROXY(controller) || !CONTROLLERS.has(controller)) fail();
  return controller;
}

export async function startLiveEvidenceFacilitatorWorker(options = {}) {
  let child;
  let lifecycleState;
  try {
    if (!options || typeof options !== 'object' || IS_PROXY(options) || Array.isArray(options) ||
        GET_PROTOTYPE_OF(options) !== OBJECT_PROTOTYPE) fail();
    let keys;
    try { keys = REFLECT_OWN_KEYS(options); } catch { fail(); }
    const normalized = {};
    const defaults = {
      recovery: false,
      forkProcess: fork,
      executionMode: HISTORICAL_WSS_EXECUTION_MODE,
      workspaceIdentity: undefined,
      runDirectoryIdentity: undefined,
    };
    const allowed = [
      'config', 'facilitatorRpcFd', 'facilitatorRpcGeneration', 'workspaceRoot',
      'journalDirectory', 'recovery', 'forkProcess', 'executionMode',
      'workspaceIdentity', 'runDirectoryIdentity',
    ];
    for (let index = 0; index < allowed.length; index += 1) {
      const key = allowed[index];
      const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(options, key);
      if (descriptor) {
        if (!HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) fail();
        ownData(normalized, key, descriptor.value);
      } else if (HAS_OWN(defaults, key)) {
        ownData(normalized, key, defaults[key]);
      } else {
        fail();
      }
    }
    if (keys.length > allowed.length) fail();
    for (let index = 0; index < keys.length; index += 1) {
      if (typeof keys[index] !== 'string' || !allowed.includes(keys[index])) fail();
    }
    const captured = captureControllerOptions(normalized);
    const startSnapshot = {
      ipcVersion: IPC_VERSION,
      requestId: 1,
      type: captured.executionMode === PUBLIC_WS_ONCE_POLICY.executionMode
        ? 'START_PUBLIC_WS_ONCE'
        : captured.executionMode === CURRENT_TESTNET_WSS_ONCE_POLICY.executionMode
          ? 'START_CURRENT_TESTNET_WSS_ONCE'
          : 'START',
      config: captured.config,
      facilitatorRpcGeneration: captured.facilitatorRpcGeneration,
      workspaceRoot: captured.workspaceRoot,
      journalDirectory: captured.journalDirectory,
      recovery: captured.recovery,
    };
    const currentTestnetOnce = captured.executionMode === PUBLIC_WS_ONCE_POLICY.executionMode ||
      captured.executionMode === CURRENT_TESTNET_WSS_ONCE_POLICY.executionMode;
    if (currentTestnetOnce) {
      ownData(startSnapshot, 'executionMode', captured.executionMode);
      ownData(startSnapshot, 'workspaceIdentity', captured.workspaceIdentity);
      ownData(startSnapshot, 'runDirectoryIdentity', captured.runDirectoryIdentity);
    }
    const capturedStartSnapshot = detachedIpcSnapshot(startSnapshot);

    child = Reflect.apply(captured.forkProcess, undefined, [
      fileURLToPath(import.meta.url),
      [],
      {
        stdio: ['ignore', 'pipe', 'pipe', 'ipc', captured.facilitatorRpcFd],
        env: {},
        execArgv: [],
      },
    ]);
    lifecycleState = trackChildLifecycle(child);
    if (!child || typeof child.on !== 'function' || typeof child.send !== 'function') fail();
    if (!lifecycleState) fail();
    let pending;
    let failed = false;
    let stopped = false;
    let nextRequestId = 1;
    let outputBytes = 0;
    let terminationPromise;
    const rejectPending = () => {
      failed = true;
      if (pending) {
        pending.reject(workerError());
        pending = undefined;
      }
    };
    const startFailureReap = () => {
      rejectPending();
      void terminateAndAwait().catch(() => {});
    };
    child.on('exit', () => {
      if (pending || !stopped) startFailureReap();
    });
    child.on('close', () => {
      if (pending || !stopped) startFailureReap();
    });
    child.on('error', () => {
      startFailureReap();
    });
    const countOutput = chunk => {
      if (failed) return;
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes > MAX_IPC_BYTES) {
        startFailureReap();
      }
    };
    if (child.stdout && typeof child.stdout.on === 'function') child.stdout.on('data', countOutput);
    if (child.stderr && typeof child.stderr.on === 'function') child.stderr.on('data', countOutput);

    function terminateAndAwait() {
      if (terminationPromise) return terminationPromise;
      terminationPromise = (async () => {
        if (lifecycleState.closed) {
          destroyChildPipes(child);
          return;
        }
        try {
          if (!lifecycleState.closed && typeof child.kill === 'function') child.kill('SIGTERM');
        } catch {}
        try {
          await boundedTimer(lifecycleState.closePromise, TERMINATE_GRACE_MS);
        } catch {
          destroyChildPipes(child);
          try {
            if (!lifecycleState.closed && typeof child.kill === 'function') child.kill('SIGKILL');
          } catch {}
          await boundedTimer(lifecycleState.closePromise, TERMINATE_GRACE_MS);
        }
        destroyChildPipes(child);
      })();
      return terminationPromise;
    }

    function validateReply(rawMessage, expectedType, requestId) {
      if (expectedType === 'PRELOADED') {
        return exactMessage(rawMessage, 'PRELOADED', requestId, []);
      }
      if (expectedType === 'READY') return exactMessage(rawMessage, 'READY', requestId, []);
      if (expectedType === 'STATUS') {
        const message = exactMessage(rawMessage, 'STATUS', requestId, ['poisoned']);
        if (typeof message.poisoned !== 'boolean') fail();
        return message;
      }
      if (expectedType === 'OBSERVATIONS') {
        const message = exactMessage(rawMessage, 'OBSERVATIONS', requestId, [
          'evidenceEligible', 'events',
        ]);
        if (typeof message.evidenceEligible !== 'boolean' || IS_PROXY(message.events) ||
            !Array.isArray(message.events) ||
            message.events.length > MAX_IPC_OBSERVATIONS) fail();
        snapshotEvents(message.events);
        return message;
      }
      if (expectedType === 'STOPPED') {
        const message = exactMessage(rawMessage, 'STOPPED', requestId, ['snapshot']);
        const snapshot = message.snapshot;
        if (snapshot === null) return message;
        exactPlainObject(snapshot, ['quiescent', 'schemaVersion', 'revision', 'records']);
        if (snapshot.quiescent !== true || snapshot.schemaVersion !== 1 ||
            !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 4 ||
            snapshot.revision > 6 || IS_PROXY(snapshot.records) ||
            !Array.isArray(snapshot.records) || snapshot.records.length !== 1) fail();
        return message;
      }
      fail();
    }

    child.on('message', rawMessage => {
      if (!pending) {
        startFailureReap();
        return;
      }
      try {
        const failedMessage = ownMessageType(rawMessage) === 'FAILED'
          ? exactMessage(rawMessage, 'FAILED', pending.requestId, ['code'])
          : null;
        if (failedMessage) {
          if (failedMessage.code !== WORKER_ERROR) fail();
          throw workerError();
        }
        const message = validateReply(rawMessage, pending.expected, pending.requestId);
        const current = pending;
        pending = undefined;
        current.resolve(message);
      } catch {
        startFailureReap();
      }
    });

    async function request(type, fields, expected) {
      if (failed) {
        if (terminationPromise) await terminationPromise;
        fail();
      }
      if (lifecycleState.exited || pending || nextRequestId > MAX_REQUEST_ID) fail();
      const requestId = nextRequestId;
      nextRequestId += 1;
      const message = { ipcVersion: IPC_VERSION, requestId, type };
      const fieldNames = Object.keys(fields);
      for (let index = 0; index < fieldNames.length; index += 1) {
        ownData(message, fieldNames[index], fields[fieldNames[index]]);
      }
      const snapshot = detachedIpcSnapshot(message);
      const deferred = createDeferred();
      pending = { ...deferred, expected, requestId };
      const deadline = Date.now() + REQUEST_TIMEOUT_MS;
      try {
        const sent = createDeferred();
        let callbackUsed = false;
        const callback = error => {
          if (callbackUsed) return;
          callbackUsed = true;
          if (error) sent.reject(workerError());
          else sent.resolve();
        };
        const accepted = child.send(snapshot, callback);
        if (accepted === false && child.connected === false) callback(workerError());
        let remaining = deadline - Date.now();
        if (remaining <= 0) fail();
        await boundedTimer(sent.promise, remaining);
        remaining = deadline - Date.now();
        if (remaining <= 0) fail();
        return await boundedTimer(deferred.promise, remaining);
      } catch {
        rejectPending();
        await terminateAndAwait();
        fail();
      }
    }

    async function stopAndConfirmExit(final) {
      if (lifecycleState.closed) return undefined;
      stopped = true;
      try {
        const message = await request('STOP', { final }, 'STOPPED');
        if (final && message.snapshot === null) fail();
        if (!final && message.snapshot !== null) fail();
        if (final && (captured.recovery
          ? message.snapshot.revision < 4 || message.snapshot.revision > 6
          : message.snapshot.revision !== 5)) fail();
        await boundedTimer(lifecycleState.closePromise, EXIT_TIMEOUT_MS);
        destroyChildPipes(child);
        if (!lifecycleState.disconnected || failed || lifecycleState.code !== 0 ||
            lifecycleState.signal !== null) fail();
        return message.snapshot;
      } catch {
        try { await terminateAndAwait(); } catch {}
        fail();
      }
    }

    const controller = {
      async start() {
        await request(capturedStartSnapshot.type, {
          config: capturedStartSnapshot.config,
          facilitatorRpcGeneration: capturedStartSnapshot.facilitatorRpcGeneration,
          workspaceRoot: capturedStartSnapshot.workspaceRoot,
          journalDirectory: capturedStartSnapshot.journalDirectory,
          recovery: capturedStartSnapshot.recovery,
          ...(currentTestnetOnce
            ? {
              executionMode: captured.executionMode,
              workspaceIdentity: captured.workspaceIdentity,
              runDirectoryIdentity: captured.runDirectoryIdentity,
            }
            : {}),
        }, 'READY');
      },
      async snapshotObservations() {
        const message = await request('OBSERVATIONS', {}, 'OBSERVATIONS');
        return FREEZE({
          evidenceEligible: message.evidenceEligible,
          events: snapshotEvents(message.events),
        });
      },
      async poisoned() {
        const message = await request('STATUS', {}, 'STATUS');
        return message.poisoned;
      },
      async closeAndSnapshot() {
        return stopAndConfirmExit(true);
      },
      async exit() {
        await stopAndConfirmExit(false);
      },
      async terminate() {
        failed = true;
        await terminateAndAwait();
      },
      async exited() {
        return lifecycleState.closed;
      },
    };
    if (currentTestnetOnce) {
      ownData(controller, 'preload', async () => {
        await request('PRELOAD', {}, 'PRELOADED');
      });
    }
    FREEZE(controller);
    CONTROLLERS.add(controller);
    return controller;
  } catch {
    await terminatePartialChild(child, lifecycleState);
    fail();
  }
}

if (typeof process.send === 'function' &&
    typeof process.argv[1] === 'string' &&
    fileURLToPath(import.meta.url) === process.argv[1]) {
  void runLiveEvidenceFacilitatorWorker().catch(() => {
    try {
      process.send({
        ipcVersion: IPC_VERSION,
        requestId: 1,
        type: 'FAILED',
        code: WORKER_ERROR,
      });
    } catch {}
  });
}
