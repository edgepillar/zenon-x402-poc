import { performance } from 'node:perf_hooks';
import { types as utilTypes } from 'node:util';
import { paymentIntentDigest, sha256Hex } from './canonical.js';
import {
  createPaymentCapabilities,
  EXPERIMENTAL_LIVE_NETWORK,
  MAX_ZENON_AMOUNT,
  sameRequirements,
  validatePaymentPayloadEnvelope,
  validatePaymentRequired,
  validateRequirement,
  validateZenonChainProfile,
} from './x402-wire.js';
import {
  LIVE_RPC_OUTCOMES,
  LIVE_RUNTIME_ERROR_CODES,
  liveSdkRuntime,
} from './live-runtime.js';
import {
  DELIVERY_STATES,
  EVIDENCE_STATES,
  SettlementJournal,
} from './settlement-journal.js';
import { invokeLegacySdk105SignedComposite } from './zenon/internal/legacy-sdk-1-0-5-signed-composite.js';
import {
  isOperatorTrustedTestnetPolicy,
} from './zenon/operator-trusted-testnet-profile.js';
import {
  assertOperatorTrustedChainEvidence,
  assertOperatorTrustedChainPolicy,
  observeOperatorTrustedChainPolicy,
} from './zenon/operator-trusted-chain-policy.js';
import {
  assertLiveEvidenceObserver,
  recordLiveEvidencePhase,
} from './live-observation.js';

const TESTNET_NETWORK_ID = 3;
const MAX_DATA_BYTES = 32;
const MAX_CONFIRMATION_WAIT_MS = 5 * 60_000;
const DEFAULT_RPC_TIMEOUT_MS = 10_000;
const UNCONFIRMED_PAGE_SIZE = 50;
const MAX_UNCONFIRMED_BLOCKS = 200;
const MINIMUM_RECONCILIATION_RETENTION_MS = 3_600_000;
const MAXIMUM_RECONCILIATION_RETENTION_MS = 2_592_000_000;
const RECONCILIATION_MAINTENANCE_BATCH_SIZE = 64;
const RECONCILIATION_OUTCOME_KEYS = Object.freeze([
  'included', 'acknowledged', 'terminalized', 'lateInclusionRecorded',
  'unavailable', 'capacityBlocked', 'conflicted', 'unchanged',
]);
const HASH_HEX = /^[0-9a-f]{64}$/;
const NONCE_HEX = /^[0-9a-f]{16}$/;
const CANONICAL_DECIMAL = /^(0|[1-9]\d*)$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const CREATE_OBJECT = Object.create;
const DEFINE_PROPERTY = Object.defineProperty;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const REFLECT_APPLY = Reflect.apply;
const ARRAY_IS_ARRAY = Array.isArray;
const HAS_OWN = Object.hasOwn;
const BUFFER_IS_BUFFER = Buffer.isBuffer;
const BUFFER_EQUALS = Buffer.prototype.equals;
const OBJECT_PROTOTYPE = Object.prototype;
const BUFFER_PROTOTYPE = Buffer.prototype;
const OBJECT_FREEZE = Object.freeze;
const IS_PROMISE = utilTypes.isPromise;
const IS_PROXY = utilTypes.isProxy;
const PROMISE_CONSTRUCTOR = Promise;
const PROMISE_PROTOTYPE = Promise.prototype;
const PROMISE_THEN = Promise.prototype.then;
const PROMISE_SPECIES = Symbol.species;
const PROMISE_SPECIES_GETTER =
  GET_OWN_PROPERTY_DESCRIPTOR(PROMISE_CONSTRUCTOR, PROMISE_SPECIES)?.get;
const ACCOUNT_BLOCK_FIELDS = new Set([
  'version', 'chainIdentifier', 'blockType', 'hash', 'previousHash', 'height',
  'momentumAcknowledged', 'address', 'toAddress', 'amount', 'tokenStandard',
  'fromBlockHash', 'data', 'fusedPlasma', 'difficulty', 'nonce', 'publicKey', 'signature',
]);
const LIVE_PAYMENT_CAPABILITIES = createPaymentCapabilities([{
  scheme: 'exact',
  network: EXPERIMENTAL_LIVE_NETWORK,
  paymentFlows: ['upfront'],
}]);
const EVIDENCE_RANK = new Map([
  [EVIDENCE_STATES.VALIDATED, 0],
  [EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN, 1],
  [EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED, 2],
  [EVIDENCE_STATES.MOMENTUM_INCLUDED, 3],
]);

let cachedDeps;
const CLIENT_RUNTIME_ENVIRONMENTS = new WeakMap();
const FACILITATOR_RUNTIME_ENVIRONMENTS = new WeakMap();
const CLIENT_LIFECYCLE_OBSERVATIONS = new WeakMap();
const FACILITATOR_LIFECYCLE_OBSERVATIONS = new WeakMap();

async function loadZenonDeps() {
  if (cachedDeps) return cachedDeps;
  const sdk = await import('znn-typescript-sdk');
  const ed = await import('@noble/ed25519');
  const { sha512 } = await import('@noble/hashes/sha2');
  ed.etc.sha512Sync = (...messages) => sha512(ed.etc.concatBytes(...messages));
  cachedDeps = { sdk, ed };
  return cachedDeps;
}

export class ZenonSafetyError extends Error {
  constructor(code, cause) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = 'ZenonSafetyError';
    this.code = code;
  }
}

function safetyError(code, cause) {
  throw new ZenonSafetyError(code, cause);
}

function shieldInternalReadPromise(value) {
  const descriptor = REFLECT_APPLY(CREATE_OBJECT, undefined, [null]);
  descriptor.value = PROMISE_THEN;
  descriptor.enumerable = false;
  descriptor.configurable = false;
  descriptor.writable = false;
  DEFINE_PROPERTY(value, 'then', descriptor);
  return value;
}

function createReadSettlement(fulfilled, value) {
  const settlement = REFLECT_APPLY(CREATE_OBJECT, undefined, [null]);
  DEFINE_PROPERTY(settlement, 'fulfilled', {
    value: fulfilled,
    enumerable: true,
    configurable: false,
    writable: false,
  });
  DEFINE_PROPERTY(settlement, 'value', {
    value,
    enumerable: true,
    configurable: false,
    writable: false,
  });
  return REFLECT_APPLY(OBJECT_FREEZE, undefined, [settlement]);
}

function fulfilledReadSettlement(value) {
  return createReadSettlement(true, value);
}

function rejectedReadSettlement(value) {
  return createReadSettlement(false, value);
}

function assertNativeReadPromise(value) {
  if (value === null || typeof value !== 'object' ||
      REFLECT_APPLY(IS_PROXY, undefined, [value]) ||
      !REFLECT_APPLY(IS_PROMISE, undefined, [value])) {
    safetyError('operator_trusted_chain_observation_unavailable');
  }
  let prototype;
  let keys;
  let constructorDescriptor;
  let speciesDescriptor;
  try {
    prototype = REFLECT_APPLY(GET_PROTOTYPE_OF, undefined, [value]);
    keys = REFLECT_APPLY(REFLECT_OWN_KEYS, undefined, [value]);
    constructorDescriptor = REFLECT_APPLY(
      GET_OWN_PROPERTY_DESCRIPTOR,
      undefined,
      [PROMISE_PROTOTYPE, 'constructor'],
    );
    speciesDescriptor = REFLECT_APPLY(
      GET_OWN_PROPERTY_DESCRIPTOR,
      undefined,
      [PROMISE_CONSTRUCTOR, PROMISE_SPECIES],
    );
  } catch {
    safetyError('operator_trusted_chain_observation_unavailable');
  }
  for (let index = 0; index < keys.length; index += 1) {
    if (typeof keys[index] === 'string') {
      safetyError('operator_trusted_chain_observation_unavailable');
    }
  }
  if (prototype !== PROMISE_PROTOTYPE || !constructorDescriptor ||
      !REFLECT_APPLY(HAS_OWN, undefined, [constructorDescriptor, 'value']) ||
      constructorDescriptor.value !== PROMISE_CONSTRUCTOR || !speciesDescriptor ||
      REFLECT_APPLY(HAS_OWN, undefined, [speciesDescriptor, 'value']) ||
      speciesDescriptor.get !== PROMISE_SPECIES_GETTER ||
      speciesDescriptor.set !== undefined) {
    safetyError('operator_trusted_chain_observation_unavailable');
  }
}

function isNativeReadPromise(value) {
  if (value !== null && (typeof value === 'object' || typeof value === 'function') &&
      REFLECT_APPLY(IS_PROXY, undefined, [value])) {
    safetyError('operator_trusted_chain_observation_unavailable');
  }
  if (!REFLECT_APPLY(IS_PROMISE, undefined, [value])) return false;
  assertNativeReadPromise(value);
  return true;
}

function settleNativeReadPromise(value) {
  assertNativeReadPromise(value);
  let bridge;
  try {
    bridge = REFLECT_APPLY(PROMISE_THEN, value, [
      fulfilledReadSettlement,
      rejectedReadSettlement,
    ]);
  } catch {
    safetyError('operator_trusted_chain_observation_unavailable');
  }
  assertNativeReadPromise(bridge);
  return shieldInternalReadPromise(bridge);
}

async function normalizeOperatorTrustedReadResult(value) {
  if (!isNativeReadPromise(value)) return createReadSettlement(true, value);
  return settleNativeReadPromise(value);
}

function readRuntimeFailureCode(value) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function') ||
      REFLECT_APPLY(IS_PROXY, undefined, [value])) return undefined;
  let descriptor;
  try {
    descriptor = REFLECT_APPLY(GET_OWN_PROPERTY_DESCRIPTOR, undefined, [value, 'code']);
  } catch {
    return undefined;
  }
  if (!descriptor || !REFLECT_APPLY(HAS_OWN, undefined, [descriptor, 'value'])) {
    return undefined;
  }
  return descriptor.value;
}

function runtimeEnvironment(value) {
  if (!isNonArrayObject(value)) safetyError('invalid_runtime_environment');
  return value;
}

function configuredLifecycleObserver(value) {
  if (value === undefined) return undefined;
  try {
    assertLiveEvidenceObserver(value);
  } catch {
    safetyError('live_observation_invalid');
  }
  return value;
}

function appendObservation(buffer, event) {
  if (!buffer || !event) return;
  DEFINE_PROPERTY(buffer, String(buffer.length), {
    value: event,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

function recordLifecycle(observer, buffer, role, phase, capturedUtc) {
  if (observer === undefined) return undefined;
  try {
    const recorded = recordLiveEvidencePhase(observer, role, phase);
    if (!recorded) return undefined;
    const event = capturedUtc === undefined
      ? recorded
      : Object.freeze({
        sequence: recorded.sequence,
        phase: recorded.phase,
        role: recorded.role,
        clockDomain: recorded.clockDomain,
        utc: capturedUtc,
        monotonicMs: recorded.monotonicMs,
      });
    appendObservation(buffer, event);
    return event;
  } catch {
    // Observation is optional evidence. It must never change, delay, or expose
    // the settlement operation it describes.
    return undefined;
  }
}

function snapshotLifecycleObservations(buffer) {
  const output = [];
  if (buffer) {
    for (let index = 0; index < buffer.length; index += 1) appendObservation(output, buffer[index]);
  }
  return Object.freeze(output);
}

function requireLiveAck(environment = process.env) {
  if (environment.ZENON_LIVE_ACK !== 'I_UNDERSTAND_TESTNET_ONLY') {
    safetyError('live_mode_not_acknowledged');
  }
}

function configuredTestnetNetworkId(environment = process.env) {
  const networkId = Number(environment.ZENON_NETWORK_ID ?? TESTNET_NETWORK_ID);
  if (networkId !== TESTNET_NETWORK_ID) safetyError('configured_network_is_not_testnet');
  return networkId;
}

function validSafeInteger(value, { min = 0 } = {}) {
  return Number.isSafeInteger(value) && value >= min;
}

function isNonArrayObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validNetworkPeer(value) {
  return isNonArrayObject(value) &&
    typeof value.publicKey === 'string' && value.publicKey.length > 0 && value.publicKey.length <= 1024 &&
    typeof value.ip === 'string' && value.ip.length > 0 && value.ip.length <= 512;
}

function configuredRpcTimeout(value = process.env.ZENON_RPC_TIMEOUT_MS ?? DEFAULT_RPC_TIMEOUT_MS) {
  const timeoutMs = Number(value);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) {
    safetyError('invalid_rpc_timeout');
  }
  return timeoutMs;
}

function decodeCanonicalBase64(value, expectedBytes, field) {
  if (typeof value !== 'string' || !BASE64.test(value)) safetyError(`malformed_${field}`);
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length !== expectedBytes || bytes.toString('base64') !== value) {
    safetyError(`malformed_${field}`);
  }
  return bytes;
}

/** Reject malformed wire values before SDK deserialization or cryptography. */
export function validateAccountBlockJson(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json) || Object.getPrototypeOf(json) !== Object.prototype) {
    safetyError('malformed_transaction');
  }
  if (Object.keys(json).length !== ACCOUNT_BLOCK_FIELDS.size ||
      Object.keys(json).some(field => !ACCOUNT_BLOCK_FIELDS.has(field))) {
    safetyError('unexpected_or_missing_transaction_field');
  }
  if (json.version !== 1) safetyError('malformed_version');
  if (!validSafeInteger(json.chainIdentifier, { min: 1 })) safetyError('malformed_chain_identifier');
  if (!validSafeInteger(json.blockType, { min: 1 })) safetyError('malformed_block_type');
  for (const field of ['hash', 'previousHash', 'fromBlockHash']) {
    if (typeof json[field] !== 'string' || !HASH_HEX.test(json[field])) safetyError(`malformed_${field}`);
  }
  if (!validSafeInteger(json.height, { min: 1 })) safetyError('malformed_height');
  const acknowledged = json.momentumAcknowledged;
  if (!acknowledged || typeof acknowledged !== 'object' || Array.isArray(acknowledged) ||
      Object.getPrototypeOf(acknowledged) !== Object.prototype ||
      Object.keys(acknowledged).length !== 2 ||
      !Object.hasOwn(acknowledged, 'hash') || !Object.hasOwn(acknowledged, 'height') ||
      !HASH_HEX.test(acknowledged.hash ?? '') || !validSafeInteger(acknowledged.height)) {
    safetyError('malformed_momentum_acknowledged');
  }
  for (const field of ['address', 'toAddress']) {
    if (typeof json[field] !== 'string' || json[field].length < 10 || json[field].length > 128) {
      safetyError(`malformed_${field}`);
    }
  }
  if (typeof json.amount !== 'string' || json.amount.length > 77 || !CANONICAL_DECIMAL.test(json.amount) ||
      BigInt(json.amount) <= 0n || BigInt(json.amount) > MAX_ZENON_AMOUNT) {
    safetyError('malformed_amount');
  }
  if (typeof json.tokenStandard !== 'string' || json.tokenStandard.length < 10 || json.tokenStandard.length > 128) {
    safetyError('malformed_token_standard');
  }
  const data = decodeCanonicalBase64(json.data, MAX_DATA_BYTES, 'data');
  if (!validSafeInteger(json.fusedPlasma) || !validSafeInteger(json.difficulty)) safetyError('malformed_plasma');
  if (typeof json.nonce !== 'string' || !NONCE_HEX.test(json.nonce)) safetyError('malformed_nonce');
  const publicKey = decodeCanonicalBase64(json.publicKey, 32, 'public_key');
  const signature = decodeCanonicalBase64(json.signature, 64, 'signature');
  return { data, publicKey, signature };
}

function uintBE(value, bytes) {
  let integer = BigInt(value);
  if (integer < 0n) safetyError('negative_hash_integer');
  const output = Buffer.alloc(bytes);
  for (let index = bytes - 1; index >= 0; index -= 1) {
    output[index] = Number(integer & 0xffn);
    integer >>= 8n;
  }
  if (integer !== 0n) safetyError('oversized_hash_integer');
  return output;
}

function materializeBlock(json, sdk) {
  const { publicKey, signature } = validateAccountBlockJson(json);
  let block;
  try {
    block = sdk.AccountBlockTemplate.fromJson(json);
  } catch (error) {
    safetyError('malformed_transaction', error);
  }
  block.publicKey = publicKey;
  block.signature = signature;
  return block;
}

function normalizeObservedByteField(value, expectedBytes, field) {
  let direct;
  try {
    direct = Buffer.from(value);
  } catch (error) {
    safetyError('malformed_observed_account_block', error);
  }
  if (direct.length === expectedBytes) return direct;

  // SDK 1.0.5 AccountBlock.fromJson() uses Buffer.from(base64String)
  // without an encoding argument for publicKey/signature. Accept only that
  // precise canonical-Base64-in-an-ASCII-buffer representation in addition to
  // correctly decoded bytes; all other representations still fail closed.
  const encoded = direct.toString('ascii');
  if (!Buffer.from(encoded, 'ascii').equals(direct)) {
    safetyError('malformed_observed_account_block');
  }
  try {
    return decodeCanonicalBase64(encoded, expectedBytes, field);
  } catch (error) {
    safetyError('malformed_observed_account_block', error);
  }
}

/**
 * Mirrors the installed SDK's non-exported utilities/block.getTxHash.
 * The valid payment range is narrower than this 32-byte serialization field.
 */
export function computeBlockHash(block, sdk) {
  const emptyHash = sdk.Hash.digest(Buffer.alloc(0));
  const dataHash = sdk.Hash.digest(block.data);
  return sdk.Hash.digest(Buffer.concat([
    uintBE(block.version, 8),
    uintBE(block.chainIdentifier, 8),
    uintBE(block.blockType, 8),
    Buffer.from(block.previousHash.getBytes()),
    uintBE(block.height, 8),
    Buffer.from(block.momentumAcknowledged.getBytes()),
    Buffer.from(block.address.getBytes()),
    Buffer.from(block.toAddress.getBytes()),
    uintBE(block.amount.toString(), 32),
    Buffer.from(block.tokenStandard.getBytes()),
    Buffer.from(block.fromBlockHash.getBytes()),
    Buffer.from(emptyHash.getBytes()),
    Buffer.from(dataHash.getBytes()),
    uintBE(block.fusedPlasma, 8),
    uintBE(block.difficulty, 8),
    Buffer.from(block.nonce, 'hex'),
  ]));
}

/**
 * Validate an RPC observation as the exact signed AccountBlock that passed
 * offline preflight. A matching lookup key alone is not trusted as evidence.
 */
function inspectObservedAccountBlock(observed, sdk) {
  if (!observed || typeof observed !== 'object' || typeof observed.toJson !== 'function') {
    safetyError('malformed_observed_account_block');
  }

  let serialized;
  let observedJson;
  let decoded;
  let computedHash;
  let observedHash;
  let observedPublicKey;
  let observedSignature;
  try {
    serialized = observed.toJson();
    if (!serialized || typeof serialized !== 'object' || Array.isArray(serialized)) {
      safetyError('malformed_observed_account_block');
    }
    observedJson = {};
    for (const field of ACCOUNT_BLOCK_FIELDS) {
      if (!Object.hasOwn(serialized, field)) safetyError('malformed_observed_account_block');
      observedJson[field] = serialized[field];
    }
    observedPublicKey = normalizeObservedByteField(observed.publicKey, 32, 'public_key');
    observedSignature = normalizeObservedByteField(observed.signature, 64, 'signature');
    observedJson.publicKey = observedPublicKey.toString('base64');
    observedJson.signature = observedSignature.toString('base64');
    decoded = validateAccountBlockJson(observedJson);
    computedHash = computeBlockHash(observed, sdk).toString();
    observedHash = observed.hash?.toString();
  } catch (error) {
    if (error instanceof ZenonSafetyError) throw error;
    safetyError('malformed_observed_account_block', error);
  }

  if (!observedPublicKey.equals(decoded.publicKey) ||
      !observedSignature.equals(decoded.signature)) {
    safetyError('observed_transaction_mismatch');
  }
  const confirmationDetail = observed.confirmationDetail === undefined || observed.confirmationDetail === null
    ? null
    : normalizeConfirmationDetail(observed.confirmationDetail);
  return {
    observed,
    observedJson,
    decoded,
    computedHash,
    observedHash,
    observedPublicKey,
    observedSignature,
    confirmationDetail,
  };
}

export function validateObservedAccountBlock(observed, preflight, sdk) {
  const inspected = inspectObservedAccountBlock(observed, sdk);
  if (sha256Hex(inspected.observedJson) !== sha256Hex(preflight.signedAccountBlock) ||
      inspected.computedHash !== preflight.transactionHash ||
      inspected.observedHash !== preflight.transactionHash ||
      !inspected.observedPublicKey.equals(Buffer.from(preflight.block.publicKey)) ||
      !inspected.observedSignature.equals(Buffer.from(preflight.block.signature))) {
    safetyError('observed_transaction_mismatch');
  }
  return observed;
}

function descriptorSafeObject(value, expectedPrototype, requiredKeys) {
  if (value === null || typeof value !== 'object') {
    safetyError('payer_balance_observation_unavailable');
  }
  let prototype;
  let keys;
  try {
    if (IS_PROXY(value) || ARRAY_IS_ARRAY(value)) {
      safetyError('payer_balance_observation_unavailable');
    }
    prototype = GET_PROTOTYPE_OF(value);
    keys = REFLECT_OWN_KEYS(value);
  } catch {
    safetyError('payer_balance_observation_unavailable');
  }
  if (prototype !== expectedPrototype) safetyError('payer_balance_observation_unavailable');
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (typeof key !== 'string') safetyError('payer_balance_observation_unavailable');
    let descriptor;
    try {
      descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
    } catch {
      safetyError('payer_balance_observation_unavailable');
    }
    if (!descriptor || !descriptor.enumerable || !HAS_OWN(descriptor, 'value')) {
      safetyError('payer_balance_observation_unavailable');
    }
  }
  const values = CREATE_OBJECT(null);
  for (let index = 0; index < requiredKeys.length; index += 1) {
    const key = requiredKeys[index];
    let descriptor;
    try {
      descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
    } catch {
      safetyError('payer_balance_observation_unavailable');
    }
    if (!descriptor || !descriptor.enumerable || !HAS_OWN(descriptor, 'value')) {
      safetyError('payer_balance_observation_unavailable');
    }
    DEFINE_PROPERTY(values, key, {
      value: descriptor.value,
      enumerable: true,
      writable: false,
      configurable: false,
    });
  }
  return values;
}

function descriptorSafeSdkBytes(value, expectedPrototype, field, expectedLength) {
  const snapshot = descriptorSafeObject(value, expectedPrototype, [field]);
  const bytes = snapshot[field];
  let prototype;
  try {
    if (IS_PROXY(bytes)) safetyError('payer_balance_observation_unavailable');
    prototype = GET_PROTOTYPE_OF(bytes);
  } catch {
    safetyError('payer_balance_observation_unavailable');
  }
  if (!BUFFER_IS_BUFFER(bytes) || prototype !== BUFFER_PROTOTYPE || bytes.length !== expectedLength) {
    safetyError('payer_balance_observation_unavailable');
  }
  return bytes;
}

function equalSdkBytes(left, right) {
  try {
    return REFLECT_APPLY(BUFFER_EQUALS, left, [right]);
  } catch {
    safetyError('payer_balance_observation_unavailable');
  }
}

function validatePayerBalanceObservation(observed, preflight, requirements, sdk) {
  if (observed === null) {
    safetyError('payer_balance_observation_unavailable');
  }

  const account = descriptorSafeObject(
    observed,
    sdk.AccountInfo.prototype,
    ['address', 'blockCount', 'balanceInfoMap'],
  );
  if (!validSafeInteger(account.blockCount) || account.blockCount !== preflight.block.height - 1) {
    safetyError('payer_balance_observation_unavailable');
  }

  const observedAddress = descriptorSafeObject(
    account.address,
    sdk.Address.prototype,
    ['hrp', 'core'],
  );
  const expectedAddress = descriptorSafeObject(
    preflight.block.address,
    sdk.Address.prototype,
    ['hrp', 'core'],
  );
  if (observedAddress.hrp !== expectedAddress.hrp ||
      !equalSdkBytes(
        descriptorSafeSdkBytes(account.address, sdk.Address.prototype, 'core', sdk.Address.coreSize),
        descriptorSafeSdkBytes(preflight.block.address, sdk.Address.prototype, 'core', sdk.Address.coreSize),
      )) {
    safetyError('payer_balance_observation_unavailable');
  }

  const balanceMap = descriptorSafeObject(account.balanceInfoMap, OBJECT_PROTOTYPE, []);
  let selectedDescriptor;
  try {
    selectedDescriptor = GET_OWN_PROPERTY_DESCRIPTOR(account.balanceInfoMap, requirements.asset);
  } catch {
    safetyError('payer_balance_observation_unavailable');
  }
  if (selectedDescriptor === undefined) return 0n;
  if (!selectedDescriptor.enumerable || !HAS_OWN(selectedDescriptor, 'value')) {
    safetyError('payer_balance_observation_unavailable');
  }
  const selected = descriptorSafeObject(
    selectedDescriptor.value,
    sdk.BalanceInfoListItem.prototype,
    ['token', 'balance'],
  );
  if (typeof selected.balance !== 'bigint' || selected.balance < 0n) {
    safetyError('payer_balance_observation_unavailable');
  }
  const token = descriptorSafeObject(selected.token, sdk.Token.prototype, ['tokenStandard']);
  if (!equalSdkBytes(
    descriptorSafeSdkBytes(token.tokenStandard, sdk.TokenStandard.prototype, 'core', sdk.TokenStandard.coreSize),
    descriptorSafeSdkBytes(preflight.tokenStandard, sdk.TokenStandard.prototype, 'core', sdk.TokenStandard.coreSize),
  )) {
    safetyError('payer_balance_observation_unavailable');
  }
  void balanceMap;
  return selected.balance;
}

function validateObservedJournalRecord(observed, record, sdk) {
  const inspected = inspectObservedAccountBlock(observed, sdk);
  if (sha256Hex(inspected.observedJson) !== sha256Hex(record.signedAccountBlock) ||
      inspected.computedHash !== record.transactionHash ||
      inspected.observedHash !== record.transactionHash) {
    safetyError('observed_transaction_mismatch');
  }
  return inspected;
}

function validateObservedTombstoneBlock(observed, tombstone, sdk) {
  const inspected = inspectObservedAccountBlock(observed, sdk);
  const signedAccountBlockDigest = sha256Hex({
    domain: 'zenon-x402-signed-account-block-v1',
    signedAccountBlock: inspected.observedJson,
  });
  if (inspected.computedHash !== tombstone.transactionHash ||
      inspected.observedHash !== tombstone.transactionHash ||
      inspected.observedJson.address !== tombstone.payer ||
      String(inspected.observedJson.chainIdentifier) !== tombstone.chainProfile.chainIdentifier ||
      signedAccountBlockDigest !== tombstone.signedAccountBlockDigest) {
    safetyError('observed_transaction_mismatch');
  }
  return inspected;
}

function chainProfilesEqual(left, right) {
  return left?.version === right?.version &&
    left?.chainIdentifier === right?.chainIdentifier &&
    left?.genesisMomentumHash === right?.genesisMomentumHash;
}

function shieldNodeReadinessResult(result) {
  const descriptor = CREATE_OBJECT(null);
  descriptor.value = undefined;
  descriptor.enumerable = false;
  descriptor.writable = false;
  descriptor.configurable = false;
  DEFINE_PROPERTY(result, 'then', descriptor);
  return result;
}

function cloneChainProfile(profile) {
  return {
    version: profile.version,
    chainIdentifier: profile.chainIdentifier,
    genesisMomentumHash: profile.genesisMomentumHash,
  };
}

function clearConnection(zenon) {
  if (zenon?.client) zenon.clearConnection();
}

function runRead(scope, zenon, timeoutMs, operation, execute) {
  return scope.runRpcWithDeadline({
    category: 'read',
    operation,
    timeoutMs,
    execute,
    teardown: () => clearConnection(zenon),
  });
}

function runPublication(scope, zenon, timeoutMs, operation, execute) {
  return scope.runRpcWithDeadline({
    category: 'publication',
    operation,
    timeoutMs,
    execute,
    teardown: () => clearConnection(zenon),
  });
}

/**
 * Check node health and apply exactly one injected chain-trust mechanism.
 * Network information and the frontier Momentum are node self-reports. The
 * operator-trusted path is deliberately distinct from authenticated identity.
 */
export async function assertZenonNodeReady(
  zenon,
  sdk,
  authenticateChainProfile,
  expectedChainProfile,
  {
    callRead = (_operation, execute) => execute(),
    operatorTrustedChainPolicy,
  } = {},
) {
  validateZenonChainProfile(expectedChainProfile);
  const hasAuthenticatorInput = authenticateChainProfile !== undefined;
  const hasAuthenticator = typeof authenticateChainProfile === 'function';
  const hasOperatorPolicy = operatorTrustedChainPolicy !== undefined;
  if (hasOperatorPolicy) {
    try {
      assertOperatorTrustedChainPolicy(operatorTrustedChainPolicy, expectedChainProfile);
    } catch {
      safetyError('operator_trusted_chain_policy_invalid');
    }
  }
  if (hasAuthenticatorInput && hasOperatorPolicy) safetyError('chain_trust_policy_conflict');
  let networkInfo;
  let syncInfo;
  let frontierMomentum;
  try {
    // Sequential calls are intentional. Promise.all could abandon sibling SDK
    // continuations when one shared-client request fails first.
    networkInfo = await callRead('stats.networkInfo', () => zenon.stats.networkInfo());
    syncInfo = await callRead('stats.syncInfo', () => zenon.stats.syncInfo());
    frontierMomentum = await callRead('ledger.getFrontierMomentum', () => zenon.ledger.getFrontierMomentum());
  } catch (error) {
    if (error?.code === LIVE_RUNTIME_ERROR_CODES.READ_TIMEOUT ||
        error?.code === LIVE_RUNTIME_ERROR_CODES.POISONED) throw error;
    safetyError('node_health_unavailable', error);
  }
  if (!networkInfo || !validSafeInteger(networkInfo.numPeers, { min: 1 }) ||
      !validNetworkPeer(networkInfo.self) || !Array.isArray(networkInfo.peers) ||
      networkInfo.peers.some(peer => !validNetworkPeer(peer))) {
    safetyError('malformed_node_network_info');
  }
  if (!syncInfo || syncInfo.state !== sdk.SyncState.SyncDone ||
      !validSafeInteger(syncInfo.currentHeight, { min: 1 }) ||
      !validSafeInteger(syncInfo.targetHeight, { min: 1 }) ||
      syncInfo.currentHeight < syncInfo.targetHeight) {
    safetyError('node_not_synchronized');
  }
  const chainId = frontierMomentum?.chainIdentifier;
  if (!validSafeInteger(chainId, { min: 1 }) || !validSafeInteger(frontierMomentum?.height)) {
    safetyError('malformed_frontier_momentum');
  }
  if (String(chainId) !== expectedChainProfile.chainIdentifier) safetyError('node_chain_identifier_mismatch');
  if (!hasAuthenticator && !hasOperatorPolicy) safetyError('node_network_identity_unavailable');

  if (hasOperatorPolicy) {
    let chainTrustEvidence;
    let observedChainTrustEvidence;
    let observationCompleted = false;
    let observationStarted = false;
    try {
      const rawReadResult = callRead(
        'operatorTrustedChainObservation',
        async () => {
          if (observationStarted) {
            safetyError('operator_trusted_chain_observation_unavailable');
          }
          observationStarted = true;
          const evidence = await observeOperatorTrustedChainPolicy(
            operatorTrustedChainPolicy,
            {
              zenon,
              networkInfo,
              syncInfo,
              frontierMomentum,
              expectedChainProfile: cloneChainProfile(expectedChainProfile),
            },
          );
          observedChainTrustEvidence = evidence;
          observationCompleted = true;
          return evidence;
        },
      );
      const settlement = await normalizeOperatorTrustedReadResult(rawReadResult);
      if (settlement.fulfilled !== true) {
        const runtimeCode = readRuntimeFailureCode(settlement.value);
        if (runtimeCode === LIVE_RUNTIME_ERROR_CODES.READ_TIMEOUT ||
            runtimeCode === LIVE_RUNTIME_ERROR_CODES.POISONED) {
          throw settlement.value;
        }
        safetyError('operator_trusted_chain_observation_unavailable');
      }
      chainTrustEvidence = settlement.value;
    } catch (error) {
      if (error?.code === LIVE_RUNTIME_ERROR_CODES.READ_TIMEOUT ||
          error?.code === LIVE_RUNTIME_ERROR_CODES.POISONED) throw error;
      safetyError('operator_trusted_chain_observation_unavailable', error);
    }
    try {
      chainTrustEvidence = assertOperatorTrustedChainEvidence(
        operatorTrustedChainPolicy,
        chainTrustEvidence,
      );
    } catch {
      safetyError('operator_trusted_chain_observation_invalid');
    }
    if (!observationStarted || !observationCompleted ||
        chainTrustEvidence !== observedChainTrustEvidence) {
      safetyError('operator_trusted_chain_observation_invalid');
    }
    if (chainTrustEvidence.remoteChainAuthenticated !== false ||
        HAS_OWN(chainTrustEvidence, 'authenticatedProfile') ||
        !chainProfilesEqual(chainTrustEvidence.chainProfile, expectedChainProfile)) {
      safetyError('operator_trusted_chain_observation_invalid');
    }
    return shieldNodeReadinessResult({
      chainId,
      syncInfo,
      frontierMomentum,
      chainTrustEvidence,
    });
  }

  let authenticatedProfile;
  try {
    authenticatedProfile = await callRead('authenticateChainProfile', () => authenticateChainProfile({
      zenon,
      networkInfo,
      syncInfo,
      frontierMomentum,
      expectedChainProfile: cloneChainProfile(expectedChainProfile),
    }));
    validateZenonChainProfile(authenticatedProfile);
  } catch (error) {
    if (error?.code === LIVE_RUNTIME_ERROR_CODES.READ_TIMEOUT ||
        error?.code === LIVE_RUNTIME_ERROR_CODES.POISONED) throw error;
    safetyError('node_network_identity_unavailable', error);
  }
  if (!chainProfilesEqual(authenticatedProfile, expectedChainProfile)) {
    safetyError('connected_node_chain_profile_mismatch');
  }
  return shieldNodeReadinessResult({
    chainId,
    syncInfo,
    frontierMomentum,
    authenticatedProfile: cloneChainProfile(authenticatedProfile),
  });
}

function parseRpcUrl(environment = process.env) {
  const rpcUrl = environment.ZENON_RPC_URL ?? 'wss://testnet.zenonhub.io:35998';
  let parsed;
  try {
    parsed = new URL(rpcUrl);
  } catch {
    // ERR_INVALID_URL retains the full input (which may contain credentials or
    // private host metadata), so never attach it to the exported error chain.
    safetyError('invalid_rpc_url');
  }
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') safetyError('invalid_rpc_protocol');
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    safetyError('rpc_url_must_not_contain_credentials_or_parameters');
  }
  return rpcUrl;
}

async function withOwnedZenonSession({
  owner,
  expectedChainProfile,
  authenticateChainProfile,
  operatorTrustedChainPolicy,
  environment,
  runtime,
  rpcTimeoutMs,
  lifecycleObserver,
  lifecycleRole,
  lifecycleObservations,
  readinessWork,
  work,
}) {
  const hasAuthenticatorInput = authenticateChainProfile !== undefined;
  const hasAuthenticator = typeof authenticateChainProfile === 'function';
  const hasOperatorPolicy = operatorTrustedChainPolicy !== undefined;
  if (hasOperatorPolicy && !isOperatorTrustedTestnetPolicy(operatorTrustedChainPolicy)) {
    safetyError('operator_trusted_chain_policy_invalid');
  }
  if (hasAuthenticatorInput && hasOperatorPolicy) safetyError('chain_trust_policy_conflict');
  if (!hasAuthenticator && !hasOperatorPolicy) safetyError('node_network_identity_unavailable');
  if (lifecycleObserver !== undefined && lifecycleRole !== 'buyer' &&
      lifecycleRole !== 'facilitator') safetyError('live_observation_invalid');
  recordLifecycle(
    lifecycleObserver,
    lifecycleObservations,
    lifecycleRole,
    `${lifecycleRole}_owner_wait_started`,
  );
  return runtime.withOwner(owner, async scope => {
    recordLifecycle(
      lifecycleObserver,
      lifecycleObservations,
      lifecycleRole,
      `${lifecycleRole}_owner_acquired`,
    );
    let zenon;
    try {
      recordLifecycle(
        lifecycleObserver,
        lifecycleObservations,
        lifecycleRole,
        `${lifecycleRole}_readiness_started`,
      );
      const { sdk, ed } = await loadZenonDeps();
      const networkId = configuredTestnetNetworkId(environment);
      const rpcUrl = parseRpcUrl(environment);
      sdk.Zenon.setNetworkID(networkId);
      zenon = sdk.Zenon.getInstance();
      if (zenon.client) {
        try {
          clearConnection(zenon);
        } catch (error) {
          scope.poison(error);
          safetyError('sdk_connection_cleanup_failed', error);
        }
      }
      try {
        await runRead(scope, zenon, rpcTimeoutMs, 'zenon.initialize', () => zenon.initialize(rpcUrl));
      } catch (error) {
        if (error?.code === LIVE_RUNTIME_ERROR_CODES.READ_TIMEOUT ||
            error?.code === LIVE_RUNTIME_ERROR_CODES.POISONED) throw error;
        safetyError('node_connection_unavailable', error);
      }
      const readiness = await assertZenonNodeReady(
        zenon,
        sdk,
        authenticateChainProfile,
        expectedChainProfile,
        {
          callRead: (operation, execute) => runRead(scope, zenon, rpcTimeoutMs, operation, execute),
          operatorTrustedChainPolicy,
        },
      );
      sdk.Zenon.setChainID(readiness.chainId);
      let readinessFinished = false;
      const finishReadiness = () => {
        if (readinessFinished) return;
        readinessFinished = true;
        recordLifecycle(
          lifecycleObserver,
          lifecycleObservations,
          lifecycleRole,
          `${lifecycleRole}_readiness_finished`,
        );
      };
      const connection = { sdk, ed, zenon, ...readiness, finishReadiness };
      if (readinessWork !== undefined) {
        await readinessWork(connection, scope);
        finishReadiness();
      }
      return await work(connection, scope);
    } finally {
      const alreadyPoisoned = runtime.poisoned;
      try {
        if (zenon !== undefined) clearConnection(zenon);
      } catch (error) {
        scope.poison(error);
        // A prior RPC timeout keeps its stronger evidence classification.
        // Otherwise failed teardown becomes the current operation's error as
        // well as permanently preventing another singleton session.
        if (!alreadyPoisoned) safetyError('sdk_connection_cleanup_failed', error);
      } finally {
        // Record while this callback still owns the runtime. The runtime may
        // grant the next waiter as soon as this callback returns.
        recordLifecycle(
          lifecycleObserver,
          lifecycleObservations,
          lifecycleRole,
          `${lifecycleRole}_owner_released`,
        );
      }
    }
  });
}

/**
 * Check one role's configured node/profile/asset readiness without a wallet.
 * This remains a node-local operator-trusted observation, not authentication.
 */
export async function probeZenonRoleReadiness({
  role,
  asset,
  expectedChainProfile,
  authenticateChainProfile,
  authenticateNodeNetwork,
  operatorTrustedChainPolicy,
  environment = process.env,
  rpcTimeoutMs,
} = {}) {
  if (role !== 'buyer' && role !== 'facilitator') safetyError('invalid_readiness_role');
  const selectedEnvironment = runtimeEnvironment(environment);
  requireLiveAck(selectedEnvironment);
  configuredTestnetNetworkId(selectedEnvironment);
  const chainAuthenticator = authenticateChainProfile ?? authenticateNodeNetwork;
  if (operatorTrustedChainPolicy !== undefined &&
      !isOperatorTrustedTestnetPolicy(operatorTrustedChainPolicy)) {
    safetyError('operator_trusted_chain_policy_invalid');
  }
  if (operatorTrustedChainPolicy !== undefined && chainAuthenticator !== undefined) {
    safetyError('chain_trust_policy_conflict');
  }
  const configuredTimeout = configuredRpcTimeout(
    rpcTimeoutMs ?? selectedEnvironment.ZENON_RPC_TIMEOUT_MS ?? DEFAULT_RPC_TIMEOUT_MS,
  );
  const expected = expectedChainProfile ?? operatorTrustedChainPolicy?.chainProfile?.();
  if (!expected) safetyError('node_network_identity_unavailable');
  try {
    validateZenonChainProfile(expected);
  } catch {
    safetyError('node_network_identity_unavailable');
  }
  if (operatorTrustedChainPolicy !== undefined &&
      !chainProfilesEqual(expected, operatorTrustedChainPolicy.chainProfile())) {
    safetyError('operator_trusted_profile_mismatch');
  }
  const { sdk: offlineSdk } = await loadZenonDeps();
  let tokenStandard;
  try {
    tokenStandard = offlineSdk.TokenStandard.parse(asset);
  } catch {
    safetyError('malformed_requirements');
  }
  if (tokenStandard.toString() !== asset) safetyError('malformed_requirements');
  return withOwnedZenonSession({
    owner: `${role}.readiness-probe`,
    expectedChainProfile: expected,
    authenticateChainProfile: chainAuthenticator,
    operatorTrustedChainPolicy,
    environment: selectedEnvironment,
    runtime: liveSdkRuntime,
    rpcTimeoutMs: configuredTimeout,
    readinessWork: async ({ sdk, zenon }, scope) => {
      await assertAssetExists(
        zenon,
        sdk,
        tokenStandard,
        (operation, execute) => runRead(scope, zenon, configuredTimeout, operation, execute),
      );
    },
    work: async () => Object.freeze({ ready: true, role }),
  });
}

export async function resolveZenonAsset(assetConfig = process.env.ZENON_ASSET ?? 'ZNN') {
  const { sdk } = await loadZenonDeps();
  if (assetConfig.toUpperCase() === 'ZNN') return sdk.ZNN_ZTS.toString();
  if (assetConfig.toUpperCase() === 'QSR') return sdk.QSR_ZTS.toString();
  return sdk.TokenStandard.parse(assetConfig).toString();
}

export async function assertAssetExists(zenon, sdk, tokenStandard, callRead = (_operation, execute) => execute()) {
  if (tokenStandard.toString() === sdk.ZNN_ZTS.toString() ||
      tokenStandard.toString() === sdk.QSR_ZTS.toString()) return;
  let token;
  try {
    token = await callRead('embedded.token.getByZts', () => zenon.embedded.token.getByZts(tokenStandard));
  } catch (error) {
    if (error?.code === LIVE_RUNTIME_ERROR_CODES.READ_TIMEOUT ||
        error?.code === LIVE_RUNTIME_ERROR_CODES.POISONED) throw error;
    safetyError('asset_lookup_failed', error);
  }
  if (!token || token.tokenStandard?.toString() !== tokenStandard.toString()) safetyError('asset_not_found');
}

/** Complete the node's paginated unconfirmed-block snapshot or fail closed. */
export async function assertNoConflictingUnconfirmedBlocks({
  ledger,
  address,
  transactionHash,
  callRead = (_operation, execute) => execute(),
  maximum = MAX_UNCONFIRMED_BLOCKS,
}) {
  const fetchPage = async (page) => {
    try {
      return await callRead(
        `ledger.getUnconfirmedBlocksByAddress.page${page}`,
        () => ledger.getUnconfirmedBlocksByAddress(address, page, UNCONFIRMED_PAGE_SIZE),
      );
    } catch (error) {
      if (error?.code === LIVE_RUNTIME_ERROR_CODES.READ_TIMEOUT ||
          error?.code === LIVE_RUNTIME_ERROR_CODES.POISONED) throw error;
      safetyError('unconfirmed_lookup_failed', error);
    }
  };
  const first = await fetchPage(0);
  const count = first?.count;
  if (!validSafeInteger(count) || count > maximum || !Array.isArray(first?.list) ||
      first.list.length > UNCONFIRMED_PAGE_SIZE || first.list.length > count) {
    safetyError(count > maximum ? 'too_many_unconfirmed_blocks' : 'malformed_unconfirmed_blocks');
  }

  const pages = Math.ceil(count / UNCONFIRMED_PAGE_SIZE);
  const blocks = [];
  for (let page = 0; page < pages; page += 1) {
    const result = page === 0 ? first : await fetchPage(page);
    if (!result || result.count !== count || !Array.isArray(result.list) ||
        result.list.length > UNCONFIRMED_PAGE_SIZE) {
      safetyError('unconfirmed_snapshot_changed');
    }
    const expectedLength = Math.min(UNCONFIRMED_PAGE_SIZE, count - page * UNCONFIRMED_PAGE_SIZE);
    if (result.list.length !== expectedLength) safetyError('incomplete_unconfirmed_snapshot');
    blocks.push(...result.list);
  }
  if (blocks.length !== count) safetyError('incomplete_unconfirmed_snapshot');
  const hashes = new Set();
  for (const block of blocks) {
    let hash;
    try {
      hash = block?.hash?.toString();
    } catch {
      safetyError('malformed_unconfirmed_blocks');
    }
    if (!HASH_HEX.test(hash ?? '') || hashes.has(hash)) safetyError('malformed_unconfirmed_blocks');
    hashes.add(hash);
    if (hash !== transactionHash) safetyError('payer_has_conflicting_unconfirmed_block');
  }

  // Re-read the first page so a changing count/list is not mistaken for a
  // complete snapshot. This remains a best-effort node view, not a consensus lock.
  const check = await fetchPage(0);
  if (!check || check.count !== count || !Array.isArray(check.list) ||
      check.list.length !== first.list.length || check.list.length > UNCONFIRMED_PAGE_SIZE) {
    safetyError('unconfirmed_snapshot_changed');
  }
  let firstHashes;
  let checkHashes;
  try {
    firstHashes = first.list.map(block => block?.hash?.toString());
    checkHashes = check.list.map(block => block?.hash?.toString());
  } catch (error) {
    safetyError('malformed_unconfirmed_blocks', error);
  }
  if (checkHashes.some(hash => !HASH_HEX.test(hash ?? '')) ||
      JSON.stringify(firstHashes) !== JSON.stringify(checkHashes)) {
    safetyError('unconfirmed_snapshot_changed');
  }
}

export class PerPayerQueue {
  constructor() {
    this.tails = new Map();
  }

  async run(key, operation) {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release;
    const current = new Promise(resolve => { release = resolve; });
    this.tails.set(key, current);
    await previous.catch(() => {});
    try {
      return await operation();
    } finally {
      release();
      if (this.tails.get(key) === current) this.tails.delete(key);
    }
  }
}

/** Perform every transaction check that does not require an RPC node. */
export async function preflightZenonPayment(paymentPayload, requirements, paymentRequired) {
  try {
    paymentPayload = structuredClone(paymentPayload);
    requirements = structuredClone(requirements);
    paymentRequired = structuredClone(paymentRequired);
  } catch (error) {
    safetyError('malformed_payment', error);
  }
  try {
    validatePaymentRequired(paymentRequired);
    validateRequirement(requirements);
    validatePaymentPayloadEnvelope(paymentPayload);
  } catch (error) {
    safetyError('malformed_payment', error);
  }
  if (requirements.network !== EXPERIMENTAL_LIVE_NETWORK) safetyError('unsupported_network');
  if (new URL(paymentRequired.resource.url).protocol !== 'https:') safetyError('live_resource_requires_https');
  if (paymentPayload.x402Version !== paymentRequired.x402Version) safetyError('unsupported_version');
  if (!sameRequirements(paymentPayload.accepted, requirements) ||
      !paymentRequired.accepts.some(candidate => sameRequirements(candidate, requirements))) {
    safetyError('requirements_mismatch');
  }
  if (sha256Hex(paymentPayload.resource) !== sha256Hex(paymentRequired.resource)) {
    safetyError('resource_mismatch');
  }

  const txJson = structuredClone(paymentPayload.payload.transaction);
  validateAccountBlockJson(txJson);
  const { sdk, ed } = await loadZenonDeps();
  const block = materializeBlock(txJson, sdk);
  const chainProfile = requirements.extra.zenonChain;
  if (block.blockType !== sdk.BlockTypeEnum.UserSend) safetyError('wrong_block_type');
  if (block.chainIdentifier !== Number(chainProfile.chainIdentifier)) safetyError('wrong_chain_identifier');
  if (block.address.toString() !== txJson.address || block.toAddress.toString() !== txJson.toAddress) {
    safetyError('noncanonical_address');
  }
  if (block.toAddress.toString() !== requirements.payTo) safetyError('wrong_recipient');
  if (block.toAddress.toString() === sdk.EMPTY_ADDRESS.toString() ||
      block.toAddress.getBytes()[0] !== sdk.Address.userByte) safetyError('unsupported_recipient_address');
  if (block.amount.toString() !== requirements.amount) safetyError('wrong_amount');
  if (block.tokenStandard.toString() !== requirements.asset || block.tokenStandard.toString() !== txJson.tokenStandard) {
    safetyError('wrong_asset');
  }
  if (block.fromBlockHash.toString() !== sdk.EMPTY_HASH.toString()) safetyError('unexpected_from_block_hash');

  const expectedIntent = paymentIntentDigest(paymentRequired, requirements);
  if (Buffer.from(block.data).toString('hex') !== expectedIntent ||
      paymentPayload.payload.intentDigest !== expectedIntent) safetyError('intent_mismatch');
  if (sdk.Address.fromPublicKey(block.publicKey).toString() !== block.address.toString()) {
    safetyError('payer_key_mismatch');
  }
  const computedHash = computeBlockHash(block, sdk);
  if (computedHash.toString() !== block.hash.toString()) safetyError('block_hash_mismatch');
  let signatureValid;
  try {
    signatureValid = ed.verify(block.signature, computedHash.getBytes(), block.publicKey, { zip215: false });
  } catch (error) {
    safetyError('invalid_signature', error);
  }
  if (typeof signatureValid !== 'boolean' || !signatureValid) safetyError('invalid_signature');

  const resourceIdentity = structuredClone(paymentRequired.resource);
  const resourceDigest = sha256Hex(resourceIdentity);
  const authorizationKey = sha256Hex({
    domain: 'zenon-x402-authorization-v1',
    chainProfile,
    intentDigest: expectedIntent,
    resourceDigest,
    transactionHash: computedHash.toString(),
  });
  return {
    authorizationKey,
    transactionHash: computedHash.toString(),
    chainProfile: cloneChainProfile(chainProfile),
    intentDigest: expectedIntent,
    resourceIdentity,
    resourceDigest,
    payer: block.address.toString(),
    signedAccountBlock: txJson,
    block,
    tokenStandard: block.tokenStandard,
    requirements,
  };
}

export class ExactZenonClient {
  constructor({
    mnemonic,
    accountIndex,
    authenticateChainProfile,
    authenticateNodeNetwork,
    environment = process.env,
    operatorTrustedChainPolicy,
    rpcTimeoutMs,
    lifecycleObserver,
  } = {}) {
    const selectedEnvironment = runtimeEnvironment(environment);
    const configuredMnemonic = mnemonic ?? selectedEnvironment.ZENON_MNEMONIC;
    const configuredAccountIndex = Number(
      accountIndex ?? selectedEnvironment.ZENON_ACCOUNT_INDEX ?? 0,
    );
    const chainAuthenticator = authenticateChainProfile ?? authenticateNodeNetwork;
    if (operatorTrustedChainPolicy !== undefined &&
        !isOperatorTrustedTestnetPolicy(operatorTrustedChainPolicy)) {
      safetyError('operator_trusted_chain_policy_invalid');
    }
    if (operatorTrustedChainPolicy !== undefined && chainAuthenticator !== undefined) {
      safetyError('chain_trust_policy_conflict');
    }
    const configuredTimeout = configuredRpcTimeout(
      rpcTimeoutMs ?? selectedEnvironment.ZENON_RPC_TIMEOUT_MS ?? DEFAULT_RPC_TIMEOUT_MS,
    );
    const configuredObserver = configuredLifecycleObserver(lifecycleObserver);
    Object.defineProperties(this, {
      mnemonic: {
        value: configuredMnemonic,
        writable: false,
        configurable: false,
        enumerable: false,
      },
      runtime: {
        value: liveSdkRuntime,
        writable: false,
        configurable: false,
        enumerable: false,
      },
      accountIndex: {
        value: configuredAccountIndex,
        writable: false,
        configurable: false,
        enumerable: true,
      },
      authenticateChainProfile: {
        value: chainAuthenticator,
        writable: false,
        configurable: false,
        enumerable: false,
      },
      operatorTrustedChainPolicy: {
        value: operatorTrustedChainPolicy,
        writable: false,
        configurable: false,
        enumerable: false,
      },
      rpcTimeoutMs: {
        value: configuredTimeout,
        writable: false,
        configurable: false,
        enumerable: true,
      },
      lifecycleObserver: {
        value: configuredObserver,
        writable: false,
        configurable: false,
        enumerable: false,
      },
      paymentCapabilities: {
        value: LIVE_PAYMENT_CAPABILITIES,
        writable: false,
        configurable: false,
        enumerable: false,
      },
    });
    CLIENT_RUNTIME_ENVIRONMENTS.set(this, selectedEnvironment);
    CLIENT_LIFECYCLE_OBSERVATIONS.set(this, configuredObserver === undefined ? null : []);
  }

  snapshotLiveEvidenceObservations() {
    return snapshotLifecycleObservations(CLIENT_LIFECYCLE_OBSERVATIONS.get(this));
  }

  async createPaymentPayload(paymentRequired, accepted = paymentRequired?.accepts?.[0]) {
    try {
      paymentRequired = structuredClone(paymentRequired);
      accepted = structuredClone(accepted);
    } catch (error) {
      safetyError('malformed_requirements', error);
    }
    const environment = CLIENT_RUNTIME_ENVIRONMENTS.get(this);
    requireLiveAck(environment);
    configuredTestnetNetworkId(environment);
    try {
      validatePaymentRequired(paymentRequired);
      validateRequirement(accepted);
    } catch (error) {
      safetyError('malformed_requirements', error);
    }
    if (!paymentRequired.accepts.some(candidate => sameRequirements(candidate, accepted))) {
      safetyError('requirements_mismatch');
    }
    if (this.operatorTrustedChainPolicy !== undefined &&
        !chainProfilesEqual(
          accepted.extra.zenonChain,
          this.operatorTrustedChainPolicy.chainProfile(),
        )) {
      safetyError('operator_trusted_profile_mismatch');
    }
    if (accepted.network !== EXPERIMENTAL_LIVE_NETWORK) safetyError('unsupported_network');
    if (new URL(paymentRequired.resource.url).protocol !== 'https:') safetyError('live_resource_requires_https');
    if (accepted.asset === 'ZNN' || accepted.asset === 'QSR') safetyError('unresolved_asset');
    if (typeof this.mnemonic !== 'string' || !this.mnemonic || this.mnemonic.startsWith('replace ')) {
      safetyError('mnemonic_not_configured');
    }
    if (!validSafeInteger(this.accountIndex)) safetyError('invalid_account_index');

    const { sdk: offlineSdk } = await loadZenonDeps();
    let offlineTokenStandard;
    let offlinePayTo;
    try {
      offlineTokenStandard = offlineSdk.TokenStandard.parse(accepted.asset);
      offlinePayTo = offlineSdk.Address.parse(accepted.payTo);
    } catch (error) {
      safetyError('malformed_requirements', error);
    }
    if (offlineTokenStandard.toString() !== accepted.asset || offlinePayTo.toString() !== accepted.payTo ||
        offlinePayTo.toString() === offlineSdk.EMPTY_ADDRESS.toString() ||
        offlinePayTo.getBytes()[0] !== offlineSdk.Address.userByte) {
      safetyError('unsupported_recipient_or_asset');
    }

    return withOwnedZenonSession({
      owner: 'buyer.prepare',
      expectedChainProfile: accepted.extra.zenonChain,
      authenticateChainProfile: this.authenticateChainProfile,
      operatorTrustedChainPolicy: this.operatorTrustedChainPolicy,
      environment,
      runtime: this.runtime,
      rpcTimeoutMs: this.rpcTimeoutMs,
      lifecycleObserver: this.lifecycleObserver,
      lifecycleRole: 'buyer',
      lifecycleObservations: CLIENT_LIFECYCLE_OBSERVATIONS.get(this),
      work: async ({ sdk, zenon, chainId, finishReadiness }, scope) => {
        let keyPair;
        try {
          const tokenStandard = offlineTokenStandard;
          const callRead = (operation, execute) => runRead(scope, zenon, this.rpcTimeoutMs, operation, execute);
          await assertAssetExists(zenon, sdk, tokenStandard, callRead);
          finishReadiness();
          let wallet;
          try {
            wallet = sdk.KeyStore.fromMnemonic(this.mnemonic);
            keyPair = wallet.getKeyPair(this.accountIndex);
          } catch {
            // Do not retain or expose SDK parser/derivation text derived from
            // mnemonic input in the public error chain.
            safetyError('mnemonic_invalid');
          }
          const intentDigest = paymentIntentDigest(paymentRequired, accepted);
          const payTo = offlinePayTo;
          if (payTo.toString() !== accepted.payTo || payTo.toString() === sdk.EMPTY_ADDRESS.toString() ||
              payTo.getBytes()[0] !== sdk.Address.userByte) safetyError('unsupported_recipient_address');
          const block = sdk.AccountBlockTemplate.send(payTo, tokenStandard, BigInt(accepted.amount));
          block.data = Buffer.from(intentDigest, 'hex');

          // prepareBlock() is a composite SDK operation with internal RPC and
          // possible PoW work. SDK 1.0.5 cannot cancel it, so ownership is held
          // until it completes instead of applying a superficial Promise.race.
          recordLifecycle(
            this.lifecycleObserver,
            CLIENT_LIFECYCLE_OBSERVATIONS.get(this),
            'buyer',
            'prepare_block_started',
          );
          const prepared = await invokeLegacySdk105SignedComposite(zenon, block, keyPair);
          recordLifecycle(
            this.lifecycleObserver,
            CLIENT_LIFECYCLE_OBSERVATIONS.get(this),
            'buyer',
            'prepare_block_finished',
          );
          if (prepared.chainIdentifier !== chainId ||
              String(prepared.chainIdentifier) !== accepted.extra.zenonChain.chainIdentifier) {
            safetyError('prepared_chain_mismatch');
          }
          const paymentPayload = {
            x402Version: paymentRequired.x402Version,
            resource: structuredClone(paymentRequired.resource),
            accepted: structuredClone(accepted),
            payload: { transaction: prepared.toJson(), intentDigest },
          };
          // Compare the actual SDK-prepared block with the exact request before
          // returning it to the HTTP client. This is local verification only.
          await preflightZenonPayment(paymentPayload, accepted, paymentRequired);
          return paymentPayload;
        } finally {
          if (keyPair?.clear) {
            try {
              keyPair.clear();
            } catch {
              safetyError('key_cleanup_failed');
            }
          }
        }
      },
    });
  }
}

function journalValidatedInput(preflight) {
  return {
    authorizationKey: preflight.authorizationKey,
    transactionHash: preflight.transactionHash,
    chainProfile: preflight.chainProfile,
    intentDigest: preflight.intentDigest,
    resourceIdentity: preflight.resourceIdentity,
    resourceDigest: preflight.resourceDigest,
    payer: preflight.payer,
    signedAccountBlock: preflight.signedAccountBlock,
  };
}

function assertJournalRecordMatches(record, preflight) {
  if (!record || typeof record !== 'object') safetyError('journal_record_invalid');
  const expected = journalValidatedInput(preflight);
  for (const [field, value] of Object.entries(expected)) {
    if (!Object.hasOwn(record, field) || sha256Hex(record[field]) !== sha256Hex(value)) {
      safetyError('journal_identity_conflict');
    }
  }
}

function strongestEvidenceState(...states) {
  let strongest = EVIDENCE_STATES.VALIDATED;
  for (const state of states) {
    if ((EVIDENCE_RANK.get(state) ?? -1) > EVIDENCE_RANK.get(strongest)) strongest = state;
  }
  return strongest;
}

function noteRecordEvidence(attempt, record) {
  if (!record) return;
  attempt.hasDurableRecord = true;
  attempt.evidenceState = strongestEvidenceState(attempt.evidenceState, record.evidenceState);
  if (Object.values(DELIVERY_STATES).includes(record.deliveryState)) {
    attempt.deliveryState = record.deliveryState;
  }
}

function terminalJournalSettlement(requirements, preflight, record) {
  if (!record) return null;
  if (record.deliveryState === DELIVERY_STATES.DELIVERED) {
    return successful(requirements, preflight, record);
  }
  if (record.deliveryState === DELIVERY_STATES.DELIVERY_PENDING) {
    return failed(
      requirements,
      preflight.transactionHash,
      preflight.payer,
      'delivery_outcome_unknown',
      EVIDENCE_STATES.MOMENTUM_INCLUDED,
      {
        authorizationKey: preflight.authorizationKey,
        retrySamePayment: true,
        deliveryState: record.deliveryState,
      },
    );
  }
  return record.evidenceState === EVIDENCE_STATES.MOMENTUM_INCLUDED
    ? successful(requirements, preflight, record)
    : null;
}

function configuredReconciliationRetention(value) {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) ||
      value < MINIMUM_RECONCILIATION_RETENTION_MS ||
      value > MAXIMUM_RECONCILIATION_RETENTION_MS) {
    safetyError('invalid_reconciliation_retention');
  }
  return value;
}

function signedAccountBlockDigest(signedAccountBlock) {
  return sha256Hex({
    domain: 'zenon-x402-signed-account-block-v1',
    signedAccountBlock,
  });
}

function assertJournalTombstoneMatches(tombstone, preflight) {
  if (!tombstone || typeof tombstone !== 'object') safetyError('journal_record_invalid');
  const expected = {
    authorizationKey: preflight.authorizationKey,
    transactionHash: preflight.transactionHash,
    chainProfile: preflight.chainProfile,
    intentDigest: preflight.intentDigest,
    resourceDigest: preflight.resourceDigest,
    payer: preflight.payer,
    signedAccountBlockDigest: signedAccountBlockDigest(preflight.signedAccountBlock),
  };
  for (const [field, value] of Object.entries(expected)) {
    if (!Object.hasOwn(tombstone, field) || sha256Hex(tombstone[field]) !== sha256Hex(value)) {
      safetyError('journal_identity_conflict');
    }
  }
}

function terminalTombstoneSettlement(requirements, preflight, tombstone) {
  assertJournalTombstoneMatches(tombstone, preflight);
  return failed(
    requirements,
    preflight.transactionHash,
    preflight.payer,
    'payment_reconciliation_terminal',
    tombstone.priorEvidenceState,
    {
      authorizationKey: preflight.authorizationKey,
      deliveryState: DELIVERY_STATES.NONE,
      retrySamePayment: false,
    },
  );
}

function maintenanceEntriesEqual(left, right) {
  return sha256Hex(left) === sha256Hex(right);
}

function sameTombstoneBase(left, right) {
  if (!left || !right) return false;
  return maintenanceEntriesEqual(
    { ...left, lateMomentumEvidence: null },
    { ...right, lateMomentumEvidence: null },
  );
}

function recordCandidateMatchesTombstone(record, tombstone) {
  if (!record || !tombstone) return false;
  return record.authorizationKey === tombstone.authorizationKey &&
    record.transactionHash === tombstone.transactionHash &&
    maintenanceEntriesEqual(record.chainProfile, tombstone.chainProfile) &&
    record.intentDigest === tombstone.intentDigest &&
    record.resourceDigest === tombstone.resourceDigest &&
    record.payer === tombstone.payer &&
    signedAccountBlockDigest(record.signedAccountBlock) === tombstone.signedAccountBlockDigest &&
    record.evidenceState === tombstone.priorEvidenceState &&
    record.createdAt === tombstone.createdAt;
}

function compareMaintenanceCandidates(left, right) {
  for (const field of ['createdAt', 'authorizationKey', 'transactionHash', 'kind']) {
    if (left[field] < right[field]) return -1;
    if (left[field] > right[field]) return 1;
  }
  return 0;
}

function emptyMaintenanceResult() {
  return {
    examined: 0,
    included: 0,
    acknowledged: 0,
    terminalized: 0,
    lateInclusionRecorded: 0,
    unavailable: 0,
    capacityBlocked: 0,
    conflicted: 0,
    unchanged: 0,
  };
}

function finishMaintenanceResult(result, remainingInCycle) {
  const outcomeTotal = RECONCILIATION_OUTCOME_KEYS
    .reduce((total, key) => total + result[key], 0);
  if (outcomeTotal !== result.examined) safetyError('reconciliation_maintenance_result_invalid');
  return Object.freeze(shieldExactFacilitatorResult({
    ...result,
    remainingInCycle,
    cycleComplete: remainingInCycle === 0,
  }));
}

export class ExactZenonFacilitator {
  #reconciliationMaintenance;

  constructor({
    authenticateChainProfile,
    authenticateNodeNetwork,
    environment = process.env,
    operatorTrustedChainPolicy,
    journal = new SettlementJournal(),
    rpcTimeoutMs,
    reconciliationRetentionMs = null,
    lifecycleObserver,
  } = {}) {
    const selectedEnvironment = runtimeEnvironment(environment);
    if (!(journal instanceof SettlementJournal)) safetyError('invalid_settlement_journal');
    const chainAuthenticator = authenticateChainProfile ?? authenticateNodeNetwork;
    if (operatorTrustedChainPolicy !== undefined &&
        !isOperatorTrustedTestnetPolicy(operatorTrustedChainPolicy)) {
      safetyError('operator_trusted_chain_policy_invalid');
    }
    if (operatorTrustedChainPolicy !== undefined && chainAuthenticator !== undefined) {
      safetyError('chain_trust_policy_conflict');
    }
    const configuredTimeout = configuredRpcTimeout(
      rpcTimeoutMs ?? selectedEnvironment.ZENON_RPC_TIMEOUT_MS ?? DEFAULT_RPC_TIMEOUT_MS,
    );
    const configuredRetention = configuredReconciliationRetention(reconciliationRetentionMs);
    const configuredObserver = configuredLifecycleObserver(lifecycleObserver);
    const payerQueue = new PerPayerQueue();
    this.#reconciliationMaintenance = { running: false, worklist: null };
    Object.defineProperties(this, {
      runtime: {
        value: liveSdkRuntime,
        writable: false,
        configurable: false,
        enumerable: false,
      },
      journal: {
        value: journal,
        writable: false,
        configurable: false,
        enumerable: false,
      },
      authenticateChainProfile: {
        value: chainAuthenticator,
        writable: false,
        configurable: false,
        enumerable: false,
      },
      operatorTrustedChainPolicy: {
        value: operatorTrustedChainPolicy,
        writable: false,
        configurable: false,
        enumerable: false,
      },
      rpcTimeoutMs: {
        value: configuredTimeout,
        writable: false,
        configurable: false,
        enumerable: true,
      },
      reconciliationRetentionMs: {
        value: configuredRetention,
        writable: false,
        configurable: false,
        enumerable: true,
      },
      lifecycleObserver: {
        value: configuredObserver,
        writable: false,
        configurable: false,
        enumerable: false,
      },
      payerQueue: {
        value: payerQueue,
        writable: false,
        configurable: false,
        enumerable: false,
      },
    });
    FACILITATOR_RUNTIME_ENVIRONMENTS.set(this, selectedEnvironment);
    FACILITATOR_LIFECYCLE_OBSERVATIONS.set(this, configuredObserver === undefined ? null : []);
  }

  snapshotLiveEvidenceObservations() {
    return snapshotLifecycleObservations(FACILITATOR_LIFECYCLE_OBSERVATIONS.get(this));
  }

  async runReconciliationMaintenance(...args) {
    if (args.length !== 0) safetyError('reconciliation_maintenance_arguments_invalid');
    const state = this.#reconciliationMaintenance;
    if (state.running) safetyError('reconciliation_maintenance_in_progress');
    state.running = true;
    try {
      return await this.#runReconciliationMaintenanceCycle();
    } catch (error) {
      safetyError(errorCode(error));
    } finally {
      state.running = false;
    }
  }

  async #runReconciliationMaintenanceCycle() {
    const state = this.#reconciliationMaintenance;
    if (state.worklist === null) {
      const candidates = await this.journal.listReconciliationCandidates(this.reconciliationRetentionMs);
      state.worklist = [
        ...candidates.records.map(entry => ({
          kind: 'record',
          createdAt: entry.createdAt,
          authorizationKey: entry.authorizationKey,
          transactionHash: entry.transactionHash,
          payer: entry.payer,
          chainProfile: entry.chainProfile,
          entry,
        })),
        ...candidates.tombstones.map(entry => ({
          kind: 'tombstone',
          createdAt: entry.createdAt,
          authorizationKey: entry.authorizationKey,
          transactionHash: entry.transactionHash,
          payer: entry.payer,
          chainProfile: entry.chainProfile,
          entry,
        })),
      ].sort(compareMaintenanceCandidates);
    }

    const result = emptyMaintenanceResult();
    while (result.examined < RECONCILIATION_MAINTENANCE_BATCH_SIZE && state.worklist.length > 0) {
      const candidate = state.worklist[0];
      const outcome = await this.#runReconciliationCandidate(candidate);
      if (!RECONCILIATION_OUTCOME_KEYS.includes(outcome)) {
        safetyError('reconciliation_maintenance_result_invalid');
      }
      result.examined += 1;
      result[outcome] += 1;
      state.worklist.shift();
    }
    const remainingInCycle = state.worklist.length;
    if (remainingInCycle === 0) state.worklist = null;
    return finishMaintenanceResult(result, remainingInCycle);
  }

  async #runReconciliationCandidate(candidate) {
    try {
      return await this.payerQueue.run(
        candidate.payer,
        () => {
          const environment = FACILITATOR_RUNTIME_ENVIRONMENTS.get(this);
          requireLiveAck(environment);
          return withOwnedZenonSession({
            owner: 'facilitator.reconciliation-maintenance',
            expectedChainProfile: candidate.chainProfile,
            authenticateChainProfile: this.authenticateChainProfile,
            operatorTrustedChainPolicy: this.operatorTrustedChainPolicy,
            environment,
            runtime: this.runtime,
            rpcTimeoutMs: this.rpcTimeoutMs,
            work: async (connection, scope) => this.#reconcileMaintenanceCandidate(candidate, connection, scope),
          });
        },
      );
    } catch (error) {
      const code = errorCode(error);
      if (code === 'journal_capacity_exceeded') return 'capacityBlocked';
      if (code === 'journal_compare_and_replace_failed') return 'conflicted';
      throw error;
    }
  }

  async #reconcileMaintenanceCandidate(candidate, connection, scope) {
    const snapshot = await this.journal.getEntrySnapshot(
      candidate.authorizationKey,
      candidate.transactionHash,
    );
    const { kind, entry } = snapshot;
    if (candidate.kind === 'record' && kind === 'record') {
      if (!maintenanceEntriesEqual(candidate.entry, entry)) return 'conflicted';
    } else if (candidate.kind === 'tombstone' && kind === 'tombstone') {
      if (!sameTombstoneBase(candidate.entry, entry)) return 'conflicted';
    } else if (candidate.kind === 'record' && kind === 'tombstone') {
      if (!recordCandidateMatchesTombstone(candidate.entry, entry)) return 'conflicted';
    } else {
      return 'conflicted';
    }

    const { sdk, zenon } = connection;
    let observed;
    try {
      observed = await runRead(
        scope,
        zenon,
        this.rpcTimeoutMs,
        'ledger.getAccountBlockByHash',
        () => zenon.ledger.getAccountBlockByHash(sdk.Hash.parse(entry.transactionHash)),
      );
    } catch (error) {
      if (error?.code === LIVE_RUNTIME_ERROR_CODES.READ_TIMEOUT ||
          error?.code === LIVE_RUNTIME_ERROR_CODES.POISONED) throw error;
      return 'unavailable';
    }

    if (kind === 'record') {
      if (observed !== null) {
        const inspected = validateObservedJournalRecord(observed, entry, sdk);
        if (inspected.confirmationDetail !== null) {
          const updated = await this.journal.compareAndUpdateEvidence({
            expectedRevision: snapshot.revision,
            expectedRecord: entry,
            evidenceState: EVIDENCE_STATES.MOMENTUM_INCLUDED,
            confirmationDetail: inspected.confirmationDetail,
          });
          return updated.changed ? 'included' : 'unchanged';
        }
        const updated = await this.journal.compareAndUpdateEvidence({
          expectedRevision: snapshot.revision,
          expectedRecord: entry,
          evidenceState: EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
          confirmationDetail: null,
        });
        return updated.changed ? 'acknowledged' : 'unchanged';
      }
      await this.journal.replaceRecordWithTombstone({
        expectedRevision: snapshot.revision,
        expectedRecord: entry,
        retentionMs: this.reconciliationRetentionMs,
      });
      return 'terminalized';
    }

    if (observed === null) return 'unchanged';
    const inspected = validateObservedTombstoneBlock(observed, entry, sdk);
    if (inspected.confirmationDetail === null) return 'unchanged';
    const late = await this.journal.recordLateMomentumEvidence({
      expectedRevision: snapshot.revision,
      expectedTombstone: entry,
      confirmationDetail: inspected.confirmationDetail,
    });
    return late.changed ? 'lateInclusionRecorded' : 'unchanged';
  }

  async verify(paymentPayload, requirements, paymentRequired) {
    try {
      const environment = FACILITATOR_RUNTIME_ENVIRONMENTS.get(this);
      requireLiveAck(environment);
      configuredTestnetNetworkId(environment);
      const preflight = await preflightZenonPayment(paymentPayload, requirements, paymentRequired);
      return await withOwnedZenonSession({
        owner: 'facilitator.verify',
        expectedChainProfile: preflight.chainProfile,
        authenticateChainProfile: this.authenticateChainProfile,
        operatorTrustedChainPolicy: this.operatorTrustedChainPolicy,
        environment,
        runtime: this.runtime,
        rpcTimeoutMs: this.rpcTimeoutMs,
        work: async (connection, scope) => {
          await this.#verifyNodeState(preflight, connection, scope, { checkFrontier: true });
          return shieldExactFacilitatorResult({ isValid: true, payer: preflight.payer });
        },
      });
    } catch (error) {
      return invalid(errorCode(error));
    }
  }

  async #verifyNodeState(preflight, connection, scope, { checkFrontier }) {
    const { zenon } = connection;
    const callRead = (operation, execute) => runRead(scope, zenon, this.rpcTimeoutMs, operation, execute);
    await this.#verifyChainAndAsset(preflight, connection, callRead);
    if (checkFrontier) await this.#verifyFrontierState(preflight, connection, callRead);
  }

  async #verifyChainAndAsset(preflight, connection, callRead) {
    const { sdk, zenon, chainId } = connection;
    if (preflight.block.chainIdentifier !== chainId ||
        String(chainId) !== preflight.chainProfile.chainIdentifier) safetyError('wrong_chain_identifier');
    await assertAssetExists(zenon, sdk, preflight.tokenStandard, callRead);
  }

  async #verifyFrontierState(preflight, connection, callRead) {
    const { sdk, zenon } = connection;
    let frontier;
    try {
      frontier = await callRead(
        'ledger.getFrontierAccountBlock',
        () => zenon.ledger.getFrontierAccountBlock(preflight.block.address),
      );
    } catch (error) {
      if (error?.code === LIVE_RUNTIME_ERROR_CODES.READ_TIMEOUT ||
          error?.code === LIVE_RUNTIME_ERROR_CODES.POISONED) throw error;
      safetyError('frontier_lookup_failed', error);
    }
    if (frontier) {
      let frontierHash;
      try {
        frontierHash = frontier.hash?.toString();
      } catch (error) {
        safetyError('malformed_frontier_account_block', error);
      }
      if (!validSafeInteger(frontier.height, { min: 1 }) || !HASH_HEX.test(frontierHash ?? '')) {
        safetyError('malformed_frontier_account_block');
      }
      if (preflight.block.height !== frontier.height + 1) safetyError('stale_height');
      if (preflight.block.previousHash.toString() !== frontierHash) safetyError('stale_frontier');
    } else if (preflight.block.height !== 1 ||
        preflight.block.previousHash.toString() !== sdk.EMPTY_HASH.toString()) {
      safetyError('invalid_first_frontier');
    }
    await assertNoConflictingUnconfirmedBlocks({
      ledger: zenon.ledger,
      address: preflight.block.address,
      transactionHash: preflight.transactionHash,
      callRead,
    });
  }

  async settle(paymentPayload, requirements, paymentRequired) {
    let preflight;
    try {
      const environment = FACILITATOR_RUNTIME_ENVIRONMENTS.get(this);
      requireLiveAck(environment);
      configuredTestnetNetworkId(environment);
      preflight = await preflightZenonPayment(paymentPayload, requirements, paymentRequired);
    } catch (error) {
      return failed(requirements, '', '', errorCode(error), 'VALIDATION_FAILED');
    }
    return this.payerQueue.run(
      preflight.payer,
      () => this.#settleSerialized(preflight, preflight.requirements),
    );
  }

  async #settleSerialized(preflight, requirements) {
    const attempt = {
      evidenceState: EVIDENCE_STATES.VALIDATED,
      deliveryState: DELIVERY_STATES.NONE,
      journalUnavailable: false,
      hasDurableRecord: false,
    };
    let record;
    try {
      const terminal = await this.#terminalTombstone(preflight, requirements, attempt);
      if (terminal) return terminal;
      // A known hash must be reconciled before any frontier-sensitive node
      // checks. This also prevents a retry from being mistaken for a new send.
      record = await this.#journalCall(
        attempt,
        () => this.journal.findByTransactionHash(preflight.transactionHash),
      );
      if (record) {
        assertJournalRecordMatches(record, preflight);
        noteRecordEvidence(attempt, record);
      }
      const recovered = terminalJournalSettlement(requirements, preflight, record);
      if (recovered) return recovered;

      return await withOwnedZenonSession({
        owner: 'facilitator.settle',
        expectedChainProfile: preflight.chainProfile,
        authenticateChainProfile: this.authenticateChainProfile,
        operatorTrustedChainPolicy: this.operatorTrustedChainPolicy,
        environment: FACILITATOR_RUNTIME_ENVIRONMENTS.get(this),
        runtime: this.runtime,
        rpcTimeoutMs: this.rpcTimeoutMs,
        lifecycleObserver: this.lifecycleObserver,
        lifecycleRole: 'facilitator',
        lifecycleObservations: FACILITATOR_LIFECYCLE_OBSERVATIONS.get(this),
        work: async (connection, scope) => this.#settleWithNode(
          preflight,
          requirements,
          connection,
          scope,
          record,
          attempt,
        ),
      });
    } catch (error) {
      let failure = error;
      try {
        const terminal = await this.#terminalTombstone(preflight, requirements, attempt);
        if (terminal) return terminal;
      } catch (tombstoneError) {
        failure = tombstoneError;
      }
      let current = record ?? null;
      try {
        current = await this.#currentRecord(preflight);
        if (current) {
          assertJournalRecordMatches(current, preflight);
          noteRecordEvidence(attempt, current);
        }
      } catch (journalError) {
        if (errorCode(journalError) !== 'journal_identity_conflict') attempt.journalUnavailable = true;
      }
      const evidenceState = strongestEvidenceState(attempt.evidenceState, current?.evidenceState);
      return failed(
        requirements,
        preflight.transactionHash,
        preflight.payer,
        errorCode(failure),
        evidenceState,
        {
          authorizationKey: preflight.authorizationKey,
          retrySamePayment: attempt.journalUnavailable ||
            attempt.hasDurableRecord ||
            shouldRetrySamePayment(failure, evidenceState, this.runtime.poisoned),
          deliveryState: current?.deliveryState ?? attempt.deliveryState,
        },
      );
    }
  }

  async #settleWithNode(preflight, requirements, connection, scope, initialRecord, attempt) {
    const terminal = await this.#terminalTombstone(preflight, requirements, attempt);
    if (terminal) return terminal;
    const { sdk, zenon } = connection;
    const callRead = (operation, execute) => runRead(scope, zenon, this.rpcTimeoutMs, operation, execute);
    let firstInclusionObservedAt;
    let inclusionObservationAttempted = false;
    const lookup = async () => {
      let observed;
      try {
        observed = await callRead(
          'ledger.getAccountBlockByHash',
          () => zenon.ledger.getAccountBlockByHash(sdk.Hash.parse(preflight.transactionHash)),
        );
      } catch (error) {
        if (error?.code === LIVE_RUNTIME_ERROR_CODES.READ_TIMEOUT ||
            error?.code === LIVE_RUNTIME_ERROR_CODES.POISONED) throw error;
        safetyError('account_lookup_failed', error);
      }
      if (observed === null) return null;
      const exact = validateObservedAccountBlock(observed, preflight, sdk);
      if (exact.confirmationDetail !== undefined && exact.confirmationDetail !== null &&
          firstInclusionObservedAt === undefined) {
        firstInclusionObservedAt = new Date().toISOString();
        if (!inclusionObservationAttempted) {
          inclusionObservationAttempted = true;
          recordLifecycle(
            this.lifecycleObserver,
            FACILITATOR_LIFECYCLE_OBSERVATIONS.get(this),
            'facilitator',
            'momentum_inclusion_observed',
            firstInclusionObservedAt,
          );
        }
      }
      return Object.freeze({
        confirmationDetail: exact.confirmationDetail ?? null,
        inclusionObservedAt: exact.confirmationDetail === undefined || exact.confirmationDetail === null
          ? null
          : firstInclusionObservedAt,
      });
    };

    // Another facilitator instance may have journaled this attempt while this
    // caller waited for process-wide SDK ownership. Reconcile it before the
    // frontier check as well.
    if (!initialRecord) {
      initialRecord = await this.#journalCall(
        attempt,
        () => this.journal.findByTransactionHash(preflight.transactionHash),
      );
      if (initialRecord) {
        assertJournalRecordMatches(initialRecord, preflight);
        noteRecordEvidence(attempt, initialRecord);
      }
    }

    // Resolve chain/asset validity before observing the transaction. Once an
    // exact Momentum-included block is observed, no ordinary node RPC remains
    // between that evidence and its durable journal update.
    await this.#verifyChainAndAsset(preflight, connection, callRead);
    connection.finishReadiness();
    let observed = await lookup();
    if (!initialRecord && observed === null) {
      let accountObservation;
      try {
        accountObservation = await callRead(
          'ledger.getAccountInfoByAddress',
          () => zenon.ledger.getAccountInfoByAddress(preflight.block.address),
        );
      } catch (error) {
        if (error?.code === LIVE_RUNTIME_ERROR_CODES.READ_TIMEOUT ||
            error?.code === LIVE_RUNTIME_ERROR_CODES.POISONED) throw error;
        safetyError('payer_balance_lookup_failed');
      }

      // The extra account lookup widens the exact-hash race. Recheck the
      // signed transaction before using this node-local balance observation.
      observed = await lookup();
      if (observed === null) {
        const concurrentTerminal = await this.#terminalTombstone(preflight, requirements, attempt);
        if (concurrentTerminal) return concurrentTerminal;
        initialRecord = await this.#journalCall(
          attempt,
          () => this.journal.findByTransactionHash(preflight.transactionHash),
        );
        if (initialRecord) {
          assertJournalRecordMatches(initialRecord, preflight);
          noteRecordEvidence(attempt, initialRecord);
        } else {
          const observedBalance = validatePayerBalanceObservation(
            accountObservation,
            preflight,
            requirements,
            sdk,
          );
          if (observedBalance < preflight.block.amount) {
            safetyError('insufficient_payer_balance');
          }
        }
      }
    }
    if (observed?.confirmationDetail) {
      attempt.evidenceState = EVIDENCE_STATES.MOMENTUM_INCLUDED;
    } else if (observed) {
      attempt.evidenceState = strongestEvidenceState(
        attempt.evidenceState,
        EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
      );
    }
    if (!observed && (!initialRecord || initialRecord.evidenceState === EVIDENCE_STATES.VALIDATED)) {
      await this.#verifyFrontierState(preflight, connection, callRead);
    }

    const concurrentlyRecovered = terminalJournalSettlement(requirements, preflight, initialRecord);
    if (concurrentlyRecovered) return concurrentlyRecovered;

    if (observed) {
      initialRecord = await this.#ensureValidatedRecord(preflight, initialRecord, attempt);
      const observedRecovery = terminalJournalSettlement(requirements, preflight, initialRecord);
      if (observedRecovery) return observedRecovery;
    }
    if (observed?.confirmationDetail) {
      const included = await this.#recordMomentum(preflight, observed, attempt);
      return successful(requirements, preflight, included);
    }
    if (observed) {
      attempt.evidenceState = strongestEvidenceState(
        attempt.evidenceState,
        EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
      );
      initialRecord = await this.#journalCall(
        attempt,
        () => this.journal.updateEvidence(
          preflight.authorizationKey,
          preflight.transactionHash,
          EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
        ),
      );
      noteRecordEvidence(attempt, initialRecord);
    }

    const wake = observed ? createInactiveWakeup() : await subscribeForSettlementWakeup({
      zenon,
      address: preflight.block.address,
      callRead,
    });
    try {
      if (!observed) {
        initialRecord = await this.#ensureValidatedRecord(preflight, initialRecord, attempt);
        const publicationRecovery = terminalJournalSettlement(requirements, preflight, initialRecord);
        if (publicationRecovery) return publicationRecovery;

        // ACKNOWLEDGED/UNKNOWN records are reconciliation-only. VALIDATED may
        // represent a crash immediately before or after submission, so only the
        // exact same signed block may be retried idempotently.
        if (initialRecord.evidenceState === EVIDENCE_STATES.VALIDATED) {
          const publication = await ensurePublished({
            lookup,
            publish: () => runPublication(
              scope,
              zenon,
              this.rpcTimeoutMs,
              'ledger.publishRawTransaction',
              () => zenon.ledger.publishRawTransaction(preflight.block),
            ),
            observed,
            lifecycleObserver: this.lifecycleObserver,
            lifecycleObservations: FACILITATOR_LIFECYCLE_OBSERVATIONS.get(this),
          });
          observed = publication.observed;
          if (publication.state === EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN) {
            attempt.evidenceState = strongestEvidenceState(
              attempt.evidenceState,
              EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN,
            );
            const ambiguous = await this.#journalCall(
              attempt,
              () => this.journal.updateEvidence(
                preflight.authorizationKey,
                preflight.transactionHash,
                EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN,
              ),
            );
            noteRecordEvidence(attempt, ambiguous);
            return failed(
              requirements,
              preflight.transactionHash,
              preflight.payer,
              'submission_outcome_unknown',
              ambiguous.evidenceState,
              {
                authorizationKey: preflight.authorizationKey,
                retrySamePayment: true,
                deliveryState: ambiguous.deliveryState,
              },
            );
          }
          if (publication.state === EVIDENCE_STATES.MOMENTUM_INCLUDED) {
            const included = await this.#recordMomentum(preflight, observed, attempt);
            return successful(requirements, preflight, included);
          }
          attempt.evidenceState = strongestEvidenceState(
            attempt.evidenceState,
            EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
          );
          initialRecord = await this.#journalCall(
            attempt,
            () => this.journal.updateEvidence(
              preflight.authorizationKey,
              preflight.transactionHash,
              EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
            ),
          );
          noteRecordEvidence(attempt, initialRecord);
        }
      }

      const included = await waitForMomentumInclusion({
        lookup,
        initialObserved: observed,
        timeoutSeconds: requirements.maxTimeoutSeconds,
        wake,
        lifecycleObserver: this.lifecycleObserver,
        lifecycleObservations: FACILITATOR_LIFECYCLE_OBSERVATIONS.get(this),
      });
      if (!included) {
        return failed(
          requirements,
          preflight.transactionHash,
          preflight.payer,
          'momentum_inclusion_timeout',
          initialRecord.evidenceState,
          {
            authorizationKey: preflight.authorizationKey,
            retrySamePayment: true,
            deliveryState: initialRecord.deliveryState,
          },
        );
      }
      const record = await this.#recordMomentum(preflight, included, attempt);
      return successful(requirements, preflight, record);
    } finally {
      wake.close();
    }
  }

  async #journalCall(attempt, operation) {
    try {
      return await operation();
    } catch (error) {
      const code = errorCode(error);
      if (code !== 'journal_identity_conflict' && code !== 'journal_capacity_exceeded') {
        attempt.journalUnavailable = true;
      }
      throw error;
    }
  }

  async #ensureValidatedRecord(preflight, record, attempt) {
    if (record) return record;
    const persisted = await this.#journalCall(
      attempt,
      () => this.journal.putValidated(journalValidatedInput(preflight)),
    );
    assertJournalRecordMatches(persisted, preflight);
    noteRecordEvidence(attempt, persisted);
    return persisted;
  }

  async #recordMomentum(preflight, observed, attempt) {
    const confirmationDetail = normalizeConfirmationDetail(observed.confirmationDetail);
    // Retain this strongest observed evidence in memory before attempting the
    // durable write. A write failure must never downgrade the response.
    attempt.evidenceState = EVIDENCE_STATES.MOMENTUM_INCLUDED;
    const record = await this.#journalCall(
      attempt,
      () => this.journal.updateEvidence(
        preflight.authorizationKey,
        preflight.transactionHash,
        EVIDENCE_STATES.MOMENTUM_INCLUDED,
        {
          observedAt: observed.inclusionObservedAt,
          confirmationDetail,
        },
      ),
    );
    noteRecordEvidence(attempt, record);
    return record;
  }

  async #currentRecord(preflight) {
    return this.journal.get(preflight.authorizationKey, preflight.transactionHash);
  }

  async #terminalTombstone(preflight, requirements, attempt) {
    const tombstone = await this.#journalCall(
      attempt,
      () => this.journal.findTombstoneByTransactionHash(preflight.transactionHash),
    );
    return tombstone ? terminalTombstoneSettlement(requirements, preflight, tombstone) : null;
  }

  async markDeliveryPending(settlement) {
    validateSettlementIdentity(settlement);
    return this.journal.markDeliveryPending(settlement.authorizationKey, settlement.transaction);
  }

  async markDelivered(settlement, cachedResponse) {
    validateSettlementIdentity(settlement);
    return this.journal.markDelivered(settlement.authorizationKey, settlement.transaction, cachedResponse);
  }
}

function validateSettlementIdentity(settlement) {
  if (!settlement || !HASH_HEX.test(settlement.authorizationKey ?? '') ||
      !HASH_HEX.test(settlement.transaction ?? '')) safetyError('invalid_settlement_identity');
}

export function normalizeConfirmationDetail(detail) {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) {
    safetyError('malformed_confirmation_detail');
  }
  let momentumHash;
  try {
    momentumHash = detail.momentumHash?.toString();
  } catch (error) {
    safetyError('malformed_confirmation_detail', error);
  }
  if (!validSafeInteger(detail.numConfirmations, { min: 1 }) ||
      !validSafeInteger(detail.momentumHeight, { min: 1 }) ||
      typeof momentumHash !== 'string' || !HASH_HEX.test(momentumHash) ||
      !validSafeInteger(detail.momentumTimestamp)) {
    safetyError('malformed_confirmation_detail');
  }
  return {
    numConfirmations: detail.numConfirmations,
    momentumHeight: detail.momentumHeight,
    momentumHash,
    momentumTimestamp: detail.momentumTimestamp,
  };
}

function shieldPublicationOutcome(outcome) {
  const descriptor = CREATE_OBJECT(null);
  descriptor.value = undefined;
  descriptor.enumerable = false;
  descriptor.writable = false;
  descriptor.configurable = false;
  DEFINE_PROPERTY(outcome, 'then', descriptor);
  return outcome;
}

export async function ensurePublished({
  lookup,
  publish,
  observed = undefined,
  lifecycleObserver,
  lifecycleObservations,
}) {
  configuredLifecycleObserver(lifecycleObserver);
  let known = observed;
  if (known === undefined) known = await lookup();
  if (known) {
    return shieldPublicationOutcome({
      state: known.confirmationDetail ? EVIDENCE_STATES.MOMENTUM_INCLUDED : EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
      observed: known,
    });
  }

  // In this adapter the publication callback returns the asynchronous SDK
  // request promise. A synchronous throw therefore occurs before that request
  // was started and is a definite local failure, not an uncertain submission.
  // Once a promise has been returned, any rejection is reconciled by hash and
  // remains uncertain when the node still cannot show the exact block.
  const publication = publish();
  recordLifecycle(
    lifecycleObserver,
    lifecycleObservations,
    'facilitator',
    'publication_started',
  );
  try {
    await publication;
  } catch (publicationError) {
    try {
      known = await lookup();
    } catch {
      known = null;
    }
    if (known) {
      return shieldPublicationOutcome({
        state: known.confirmationDetail ? EVIDENCE_STATES.MOMENTUM_INCLUDED : EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
        observed: known,
      });
    }
    return shieldPublicationOutcome({
      state: EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN,
      observed: null,
      publicationError,
    });
  }
  recordLifecycle(
    lifecycleObserver,
    lifecycleObservations,
    'facilitator',
    'publication_acknowledged',
  );
  return shieldPublicationOutcome({
    state: EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
    observed: null,
  });
}

function createInactiveWakeup() {
  return {
    wait: timeoutMs => new Promise(resolve => setTimeout(resolve, timeoutMs)),
    close() {},
  };
}

async function subscribeForSettlementWakeup({ zenon, address, callRead }) {
  const waiters = new Set();
  let active = true;
  const wake = () => {
    for (const waiter of [...waiters]) waiter();
  };
  try {
    const stream = await callRead(
      'subscribe.toAccountBlocksByAddress',
      () => zenon.subscribe.toAccountBlocksByAddress(address),
    );
    stream.onNotification(wake);
  } catch (error) {
    // Ordinary subscription rejection falls back to polling. A deadline error
    // still poisons and must propagate because its continuation is not isolated.
    if (error?.code === LIVE_RUNTIME_ERROR_CODES.READ_TIMEOUT ||
        error?.code === LIVE_RUNTIME_ERROR_CODES.POISONED) throw error;
  }
  return {
    wait(timeoutMs) {
      if (!active) return Promise.resolve();
      return new Promise(resolve => {
        let timer;
        const finish = () => {
          clearTimeout(timer);
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        timer = setTimeout(finish, timeoutMs);
      });
    },
    close() {
      active = false;
      wake();
      waiters.clear();
    },
  };
}

export async function waitForMomentumInclusion({
  lookup,
  initialObserved,
  timeoutSeconds,
  wake,
  lifecycleObserver,
  lifecycleObservations,
}) {
  configuredLifecycleObserver(lifecycleObserver);
  if (initialObserved?.confirmationDetail) return initialObserved;
  if (!Number.isSafeInteger(timeoutSeconds) || timeoutSeconds <= 0 ||
      timeoutSeconds * 1000 > MAX_CONFIRMATION_WAIT_MS) {
    safetyError('invalid_confirmation_timeout');
  }
  recordLifecycle(
    lifecycleObserver,
    lifecycleObservations,
    'facilitator',
    'inclusion_wait_started',
  );
  const timeoutMs = timeoutSeconds * 1000;
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const observed = await lookup();
    if (observed?.confirmationDetail) return observed;
    const remaining = Math.max(0, deadline - performance.now());
    if (remaining === 0) break;
    await wake.wait(Math.min(1000, remaining));
  }
  return null;
}

function errorCode(error) {
  if (typeof error?.code === 'string' && error.code.length <= 128) return error.code;
  if (error?.outcome === LIVE_RPC_OUTCOMES.SUBMISSION_OUTCOME_UNKNOWN) return 'submission_outcome_unknown';
  return 'verification_failed';
}

function shouldRetrySamePayment(error, evidenceState, runtimePoisoned) {
  if (runtimePoisoned || [
    EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
    EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN,
    EVIDENCE_STATES.MOMENTUM_INCLUDED,
  ].includes(evidenceState)) return true;
  return new Set([
    'node_health_unavailable',
    'node_connection_unavailable',
    'node_not_synchronized',
    'node_network_identity_unavailable',
    'malformed_node_network_info',
    'malformed_frontier_momentum',
    'node_chain_identifier_mismatch',
    'connected_node_chain_profile_mismatch',
    'asset_lookup_failed',
    'account_lookup_failed',
    'payer_balance_lookup_failed',
    'payer_balance_observation_unavailable',
    'frontier_lookup_failed',
    'malformed_frontier_account_block',
    'malformed_observed_account_block',
    'observed_transaction_mismatch',
    'malformed_confirmation_detail',
    'unconfirmed_lookup_failed',
    'unconfirmed_snapshot_changed',
    'incomplete_unconfirmed_snapshot',
    'too_many_unconfirmed_blocks',
    LIVE_RUNTIME_ERROR_CODES.READ_TIMEOUT,
    LIVE_RUNTIME_ERROR_CODES.POISONED,
  ]).has(errorCode(error));
}

function shieldExactFacilitatorResult(result) {
  const descriptor = CREATE_OBJECT(null);
  descriptor.value = undefined;
  descriptor.enumerable = false;
  descriptor.writable = false;
  descriptor.configurable = false;
  DEFINE_PROPERTY(result, 'then', descriptor);
  return result;
}

function invalid(reason, payer = '') {
  return shieldExactFacilitatorResult({ isValid: false, invalidReason: reason, payer });
}

function failed(requirements, transaction, payer, errorReason, state, extra = {}) {
  return shieldExactFacilitatorResult({
    success: false,
    network: typeof requirements?.network === 'string' ? requirements.network : '',
    transaction,
    payer: payer ?? '',
    errorReason,
    state,
    ...extra,
  });
}

function successful(requirements, preflight, record) {
  return shieldExactFacilitatorResult({
    success: true,
    network: requirements.network,
    transaction: preflight.transactionHash,
    payer: preflight.payer,
    state: EVIDENCE_STATES.MOMENTUM_INCLUDED,
    authorizationKey: preflight.authorizationKey,
    deliveryState: record.deliveryState,
    ...(record.deliveryState === DELIVERY_STATES.DELIVERED
      ? { cachedResponse: record.cachedResponse }
      : {}),
  });
}
