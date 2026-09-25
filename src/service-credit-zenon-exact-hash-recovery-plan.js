import { createHash } from 'node:crypto';
import { types as utilTypes } from 'node:util';

import { MAX_ZENON_AMOUNT, validateResource } from './x402-wire.js';

const ERROR_CODE = 'zenon_exact_hash_recovery_plan_rejected';
const PLAN_VERSION = 1;
const OBSERVATION_VERSION = 1;
const MAX_INPUT_BYTES = 256 * 1024;
const MAX_INPUT_NODES = 4096;
const MAX_INPUT_MEMBERS = 8192;
const MAX_OBJECT_KEYS = 128;
const MAX_ARRAY_LENGTH = 4096;
const MAX_DEPTH = 24;
const MAX_STRING_BYTES = 128 * 1024;
const MAX_KEY_BYTES = 256;

const SUBMISSION_ACKNOWLEDGED = 'SUBMISSION_ACKNOWLEDGED';
const SUBMISSION_OUTCOME_UNKNOWN = 'SUBMISSION_OUTCOME_UNKNOWN';
const MOMENTUM_INCLUDED = 'MOMENTUM_INCLUDED';
const DELIVERY_NONE = 'NONE';

const SNAPSHOT_FIELDS = Object.freeze(['revision', 'kind', 'entry']);
const RECORD_FIELDS = Object.freeze([
  'authorizationKey',
  'transactionHash',
  'chainProfile',
  'intentDigest',
  'resourceIdentity',
  'resourceDigest',
  'payer',
  'signedAccountBlock',
  'evidenceState',
  'momentumEvidence',
  'deliveryState',
  'cachedResponse',
  'createdAt',
  'updatedAt',
]);
const CHAIN_PROFILE_FIELDS = Object.freeze([
  'version', 'chainIdentifier', 'genesisMomentumHash',
]);
const ACCOUNT_BLOCK_FIELDS = Object.freeze([
  'version', 'chainIdentifier', 'blockType', 'hash', 'previousHash', 'height',
  'momentumAcknowledged', 'address', 'toAddress', 'amount', 'tokenStandard',
  'fromBlockHash', 'data', 'fusedPlasma', 'difficulty', 'nonce', 'publicKey',
  'signature',
]);
const MOMENTUM_ACKNOWLEDGED_FIELDS = Object.freeze(['hash', 'height']);
const OBSERVATION_BASE_FIELDS = Object.freeze(['observationVersion', 'status']);
const EXACT_OBSERVATION_FIELDS = Object.freeze([
  'observationVersion', 'status', 'accountBlock', 'confirmationDetail',
]);
const CONFIRMATION_FIELDS = Object.freeze([
  'numConfirmations', 'momentumHeight', 'momentumHash', 'momentumTimestamp',
]);

const HASH = /^[0-9a-f]{64}$/;
const NONCE = /^[0-9a-f]{16}$/;
const POSITIVE_DECIMAL = /^[1-9][0-9]*$/;

const ARRAY_IS_ARRAY = Array.isArray;
const ARRAY_INCLUDES = Array.prototype.includes;
const ARRAY_PROTOTYPE = Array.prototype;
const ARRAY_SORT = Array.prototype.sort;
const BUFFER_BYTE_LENGTH = Buffer.byteLength;
const BUFFER_FROM = Buffer.from;
const BUFFER_TO_STRING = Buffer.prototype.toString;
const DATE_CONSTRUCTOR = Date;
const DATE_PARSE = Date.parse;
const DATE_TO_ISO_STRING = Date.prototype.toISOString;
const JSON_STRINGIFY = JSON.stringify;
const NUMBER_IS_NAN = Number.isNaN;
const NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;
const OBJECT_CREATE = Object.create;
const OBJECT_DEFINE_PROPERTY = Object.defineProperty;
const OBJECT_FREEZE = Object.freeze;
const OBJECT_HAS_OWN = Object.hasOwn;
const OBJECT_IS = Object.is;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_APPLY = Reflect.apply;
const REFLECT_GET_OWN_PROPERTY_DESCRIPTOR = Reflect.getOwnPropertyDescriptor;
const REFLECT_GET_PROTOTYPE_OF = Reflect.getPrototypeOf;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const REGEXP_TEST = RegExp.prototype.test;
const IS_PROXY = utilTypes.isProxy;
const NATIVE_WEAK_SET = WeakSet;
const WEAK_SET_ADD = NATIVE_WEAK_SET.prototype.add;
const WEAK_SET_DELETE = NATIVE_WEAK_SET.prototype.delete;
const WEAK_SET_HAS = NATIVE_WEAK_SET.prototype.has;

class ZenonExactHashRecoveryPlanError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'ZenonExactHashRecoveryPlanError';
    this.code = ERROR_CODE;
    this.stack = undefined;
  }
}

function reject() {
  throw new ZenonExactHashRecoveryPlanError();
}

function matches(expression, value) {
  return REFLECT_APPLY(REGEXP_TEST, expression, [value]);
}

function byteLength(value) {
  return REFLECT_APPLY(BUFFER_BYTE_LENGTH, Buffer, [value, 'utf8']);
}

function addBudget(budget, field, amount, maximum) {
  budget[field] += amount;
  if (budget[field] > maximum) reject();
}

function dataDescriptor(value, key) {
  let descriptor;
  try {
    descriptor = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      Reflect,
      [value, key],
    );
  } catch {
    reject();
  }
  if (!descriptor || descriptor.enumerable !== true || !OBJECT_HAS_OWN(descriptor, 'value')) {
    reject();
  }
  return descriptor;
}

function captureArray(value, keys, budget, seen, depth) {
  const lengthDescriptor = REFLECT_APPLY(
    REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
    Reflect,
    [value, 'length'],
  );
  if (!lengthDescriptor || !OBJECT_HAS_OWN(lengthDescriptor, 'value') ||
      !REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [lengthDescriptor.value]) ||
      lengthDescriptor.value < 0 || lengthDescriptor.value > MAX_ARRAY_LENGTH ||
      keys.length !== lengthDescriptor.value + 1) {
    reject();
  }
  const output = new Array(lengthDescriptor.value);
  for (let index = 0; index < lengthDescriptor.value; index += 1) {
    const key = String(index);
    const descriptor = dataDescriptor(value, key);
    REFLECT_APPLY(OBJECT_DEFINE_PROPERTY, Object, [output, key, {
      configurable: true,
      enumerable: true,
      value: captureJson(descriptor.value, budget, seen, depth + 1),
      writable: true,
    }]);
  }
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (key !== 'length' &&
        (typeof key !== 'string' || !matches(/^(0|[1-9][0-9]*)$/, key) ||
          Number(key) >= lengthDescriptor.value)) {
      reject();
    }
  }
  return REFLECT_APPLY(OBJECT_FREEZE, Object, [output]);
}

function captureObject(value, keys, budget, seen, depth) {
  if (keys.length > MAX_OBJECT_KEYS) reject();
  addBudget(budget, 'members', keys.length, MAX_INPUT_MEMBERS);
  const output = REFLECT_APPLY(OBJECT_CREATE, Object, [OBJECT_PROTOTYPE]);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (typeof key !== 'string') reject();
    const keyBytes = byteLength(key);
    if (keyBytes > MAX_KEY_BYTES) reject();
    addBudget(budget, 'bytes', keyBytes, MAX_INPUT_BYTES);
    const descriptor = dataDescriptor(value, key);
    REFLECT_APPLY(OBJECT_DEFINE_PROPERTY, Object, [output, key, {
      configurable: true,
      enumerable: true,
      value: captureJson(descriptor.value, budget, seen, depth + 1),
      writable: true,
    }]);
  }
  return REFLECT_APPLY(OBJECT_FREEZE, Object, [output]);
}

function captureJson(value, budget, seen, depth) {
  if (depth > MAX_DEPTH) reject();
  addBudget(budget, 'nodes', 1, MAX_INPUT_NODES);
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const bytes = byteLength(value);
    if (bytes > MAX_STRING_BYTES) reject();
    addBudget(budget, 'bytes', bytes, MAX_INPUT_BYTES);
    return value;
  }
  if (typeof value === 'number') {
    if (!REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [value]) ||
        REFLECT_APPLY(OBJECT_IS, Object, [value, -0])) reject();
    return value;
  }
  if (typeof value !== 'object') reject();

  let proxy;
  let prototype;
  let keys;
  try {
    proxy = REFLECT_APPLY(IS_PROXY, undefined, [value]);
    if (proxy) reject();
    prototype = REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, Reflect, [value]);
    keys = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [value]);
  } catch {
    reject();
  }
  if (REFLECT_APPLY(WEAK_SET_HAS, seen, [value])) reject();
  REFLECT_APPLY(WEAK_SET_ADD, seen, [value]);
  let captured;
  if (REFLECT_APPLY(ARRAY_IS_ARRAY, undefined, [value])) {
    if (prototype !== ARRAY_PROTOTYPE) reject();
    addBudget(budget, 'members', keys.length - 1, MAX_INPUT_MEMBERS);
    captured = captureArray(value, keys, budget, seen, depth);
  } else {
    if (prototype !== OBJECT_PROTOTYPE) reject();
    captured = captureObject(value, keys, budget, seen, depth);
  }
  REFLECT_APPLY(WEAK_SET_DELETE, seen, [value]);
  return captured;
}

function captureInputs(snapshot, observation) {
  const budget = { bytes: 0, nodes: 0, members: 0 };
  return {
    snapshot: captureJson(snapshot, budget, new NATIVE_WEAK_SET(), 0),
    observation: captureJson(observation, budget, new NATIVE_WEAK_SET(), 0),
  };
}

function exactObject(value, fields) {
  if (value === null || typeof value !== 'object' ||
      REFLECT_APPLY(ARRAY_IS_ARRAY, undefined, [value]) ||
      REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, Reflect, [value]) !== OBJECT_PROTOTYPE) {
    reject();
  }
  const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [value]);
  if (keys.length !== fields.length) reject();
  for (let index = 0; index < fields.length; index += 1) {
    if (!OBJECT_HAS_OWN(value, fields[index])) reject();
  }
  for (let index = 0; index < keys.length; index += 1) {
    if (typeof keys[index] !== 'string' ||
        !REFLECT_APPLY(ARRAY_INCLUDES, fields, [keys[index]])) reject();
  }
  return value;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    return REFLECT_APPLY(JSON_STRINGIFY, JSON, [value]);
  }
  if (REFLECT_APPLY(ARRAY_IS_ARRAY, undefined, [value])) {
    let output = '[';
    for (let index = 0; index < value.length; index += 1) {
      if (index !== 0) output += ',';
      output += canonicalJson(value[index]);
    }
    return `${output}]`;
  }
  const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [value]);
  REFLECT_APPLY(ARRAY_SORT, keys, []);
  let output = '{';
  for (let index = 0; index < keys.length; index += 1) {
    if (index !== 0) output += ',';
    output += `${REFLECT_APPLY(JSON_STRINGIFY, JSON, [keys[index]])}:${canonicalJson(value[keys[index]])}`;
  }
  return `${output}}`;
}

function digest(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function validTimestamp(value) {
  if (typeof value !== 'string' || value.length !== 24) return false;
  let milliseconds;
  let canonical;
  try {
    milliseconds = REFLECT_APPLY(DATE_PARSE, DATE_CONSTRUCTOR, [value]);
    if (REFLECT_APPLY(NUMBER_IS_NAN, Number, [milliseconds])) return false;
    canonical = REFLECT_APPLY(
      DATE_TO_ISO_STRING,
      new DATE_CONSTRUCTOR(milliseconds),
      [],
    );
  } catch {
    return false;
  }
  return canonical === value;
}

function canonicalBase64(value, expectedBytes) {
  if (typeof value !== 'string') return null;
  let decoded;
  try {
    decoded = REFLECT_APPLY(BUFFER_FROM, Buffer, [value, 'base64']);
    if (decoded.length !== expectedBytes ||
        REFLECT_APPLY(BUFFER_TO_STRING, decoded, ['base64']) !== value) return null;
  } catch {
    return null;
  }
  return decoded;
}

function validateChainProfile(value) {
  const profile = exactObject(value, CHAIN_PROFILE_FIELDS);
  if (profile.version !== 1 || typeof profile.chainIdentifier !== 'string' ||
      profile.chainIdentifier.length > 20 ||
      !matches(POSITIVE_DECIMAL, profile.chainIdentifier) ||
      BigInt(profile.chainIdentifier) > BigInt(Number.MAX_SAFE_INTEGER) ||
      typeof profile.genesisMomentumHash !== 'string' ||
      !matches(HASH, profile.genesisMomentumHash)) {
    reject();
  }
  return profile;
}

function validateSignedAccountBlock(value, record) {
  const block = exactObject(value, ACCOUNT_BLOCK_FIELDS);
  const acknowledged = exactObject(
    block.momentumAcknowledged,
    MOMENTUM_ACKNOWLEDGED_FIELDS,
  );
  if (block.version !== 1 || block.blockType !== 2 ||
      !REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [block.chainIdentifier]) ||
      block.chainIdentifier <= 0 ||
      String(block.chainIdentifier) !== record.chainProfile.chainIdentifier ||
      typeof block.hash !== 'string' || !matches(HASH, block.hash) ||
      block.hash !== record.transactionHash ||
      typeof block.previousHash !== 'string' || !matches(HASH, block.previousHash) ||
      typeof block.fromBlockHash !== 'string' || !matches(HASH, block.fromBlockHash) ||
      !REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [block.height]) || block.height <= 0 ||
      typeof acknowledged.hash !== 'string' || !matches(HASH, acknowledged.hash) ||
      !REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [acknowledged.height]) ||
      acknowledged.height < 0 ||
      typeof block.address !== 'string' || block.address !== record.payer ||
      block.address.length < 10 || block.address.length > 128 ||
      typeof block.toAddress !== 'string' ||
      block.toAddress.length < 10 || block.toAddress.length > 128 ||
      typeof block.amount !== 'string' || block.amount.length > 77 ||
      !matches(POSITIVE_DECIMAL, block.amount) || BigInt(block.amount) > MAX_ZENON_AMOUNT ||
      typeof block.tokenStandard !== 'string' ||
      block.tokenStandard.length < 10 || block.tokenStandard.length > 128 ||
      !REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [block.fusedPlasma]) ||
      block.fusedPlasma < 0 ||
      !REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [block.difficulty]) ||
      block.difficulty < 0 ||
      typeof block.nonce !== 'string' || !matches(NONCE, block.nonce) ||
      canonicalBase64(block.publicKey, 32) === null ||
      canonicalBase64(block.signature, 64) === null) {
    reject();
  }
  const data = canonicalBase64(block.data, 32);
  if (data === null || REFLECT_APPLY(BUFFER_TO_STRING, data, ['hex']) !== record.intentDigest) {
    reject();
  }
  return block;
}

function validateRecord(value) {
  const record = exactObject(value, RECORD_FIELDS);
  if (typeof record.authorizationKey !== 'string' || !matches(HASH, record.authorizationKey) ||
      typeof record.transactionHash !== 'string' || !matches(HASH, record.transactionHash) ||
      typeof record.intentDigest !== 'string' || !matches(HASH, record.intentDigest) ||
      typeof record.resourceDigest !== 'string' || !matches(HASH, record.resourceDigest) ||
      typeof record.payer !== 'string' || record.payer.length < 10 || record.payer.length > 128 ||
      !validTimestamp(record.createdAt) || !validTimestamp(record.updatedAt) ||
      record.updatedAt < record.createdAt ||
      !REFLECT_APPLY(ARRAY_INCLUDES, [
        SUBMISSION_OUTCOME_UNKNOWN,
        SUBMISSION_ACKNOWLEDGED,
      ], [record.evidenceState]) ||
      record.momentumEvidence !== null || record.deliveryState !== DELIVERY_NONE ||
      record.cachedResponse !== null) {
    reject();
  }
  validateChainProfile(record.chainProfile);
  try {
    validateResource(record.resourceIdentity);
  } catch {
    reject();
  }
  if (digest(record.resourceIdentity) !== record.resourceDigest ||
      digest({
        domain: 'zenon-x402-authorization-v1',
        chainProfile: record.chainProfile,
        intentDigest: record.intentDigest,
        resourceDigest: record.resourceDigest,
        transactionHash: record.transactionHash,
      }) !== record.authorizationKey) {
    reject();
  }
  validateSignedAccountBlock(record.signedAccountBlock, record);
  return record;
}

function validateSnapshot(value) {
  const snapshot = exactObject(value, SNAPSHOT_FIELDS);
  if (!REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [snapshot.revision]) ||
      snapshot.revision < 0 || snapshot.kind !== 'record') reject();
  return { revision: snapshot.revision, record: validateRecord(snapshot.entry) };
}

function validateConfirmationDetail(value) {
  const detail = exactObject(value, CONFIRMATION_FIELDS);
  if (!REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [detail.numConfirmations]) ||
      detail.numConfirmations < 1 ||
      !REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [detail.momentumHeight]) ||
      detail.momentumHeight < 1 ||
      typeof detail.momentumHash !== 'string' || !matches(HASH, detail.momentumHash) ||
      !REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [detail.momentumTimestamp]) ||
      detail.momentumTimestamp < 0) {
    reject();
  }
  return detail;
}

function noMutation(snapshot, reason) {
  return buildPlan(snapshot, 'NO_MUTATION', reason, null);
}

function evidenceUpdate(snapshot, reason, evidenceState, confirmationDetail) {
  return buildPlan(snapshot, 'EVIDENCE_UPDATE', reason, OBJECT_FREEZE({
    evidenceState,
    confirmationDetail,
  }));
}

function buildPlan(snapshot, disposition, reason, update) {
  const record = snapshot.record;
  return OBJECT_FREEZE({
    planVersion: PLAN_VERSION,
    scope: 'SOURCE_ONLY_EXACT_HASH',
    disposition,
    reason,
    identity: OBJECT_FREEZE({
      authorizationKey: record.authorizationKey,
      transactionHash: record.transactionHash,
    }),
    expected: OBJECT_FREEZE({
      revision: snapshot.revision,
      evidenceState: record.evidenceState,
      deliveryState: DELIVERY_NONE,
    }),
    update,
    assertions: OBJECT_FREEZE({
      nonpublication: 'NOT_ESTABLISHED',
      canonicality: 'NOT_ESTABLISHED',
      chainFinality: 'NOT_ESTABLISHED',
      independentAuthentication: 'NOT_ESTABLISHED',
    }),
    sideEffects: 'NONE',
  });
}

/**
 * Plan one post-ambiguity exact-hash evidence transition. Inputs are captured
 * as bounded data, and the returned descriptor owns no mutation or I/O path.
 */
export function planZenonExactHashRecovery(snapshotInput, observationInput) {
  if (arguments.length !== 2) reject();
  const captured = captureInputs(snapshotInput, observationInput);
  const snapshot = validateSnapshot(captured.snapshot);
  const observation = captured.observation;
  if (observation === null || typeof observation !== 'object' ||
      REFLECT_APPLY(ARRAY_IS_ARRAY, undefined, [observation]) ||
      REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, Reflect, [observation]) !== OBJECT_PROTOTYPE) {
    reject();
  }
  exactObject(observation, observation.status === 'EXACT_MATCH'
    ? EXACT_OBSERVATION_FIELDS
    : OBSERVATION_BASE_FIELDS);
  if (observation.observationVersion !== OBSERVATION_VERSION) reject();

  if (observation.status === 'UNAVAILABLE') {
    return noMutation(snapshot, 'OBSERVATION_UNAVAILABLE');
  }
  if (observation.status === 'ABSENT') {
    return noMutation(snapshot, 'EXACT_HASH_ABSENT');
  }
  if (observation.status !== 'EXACT_MATCH') reject();

  const observedBlock = exactObject(observation.accountBlock, ACCOUNT_BLOCK_FIELDS);
  if (canonicalJson(observedBlock) !== canonicalJson(snapshot.record.signedAccountBlock)) {
    reject();
  }
  if (observation.confirmationDetail === null) {
    return snapshot.record.evidenceState === SUBMISSION_OUTCOME_UNKNOWN
      ? evidenceUpdate(
        snapshot,
        'EXACT_HASH_OBSERVED',
        SUBMISSION_ACKNOWLEDGED,
        null,
      )
      : noMutation(snapshot, 'ALREADY_ACKNOWLEDGED');
  }
  const confirmationDetail = validateConfirmationDetail(observation.confirmationDetail);
  return evidenceUpdate(
    snapshot,
    'EXACT_HASH_INCLUDED',
    MOMENTUM_INCLUDED,
    confirmationDetail,
  );
}
