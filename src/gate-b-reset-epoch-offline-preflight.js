import { types as utilTypes } from 'node:util';

import { canonicalJson, paymentIntentDigest, sha256Hex } from './canonical.js';
import { validateGateBQuickTunnelStableBinding } from './gate-b-quick-tunnel-artifact.js';
import {
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_CHAIN_PROFILE,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
  selectPublicTestnetDynamicPlasmaResetEpochExecutionPolicy,
} from './zenon/operator-trusted-testnet-profile.js';

const ERROR_CODE = 'gate_b_reset_epoch_offline_preflight_invalid';
const DOCUMENT_MAX_BYTES = 64 * 1024;
const EXECUTION_MODE = 'reset-epoch-wss-once-v1';
const CONFIG_DIGEST_DOMAIN = 'zenon-x402-reset-epoch-wss-once-config-v1';
const MAXIMUM_AMOUNT = '1';
const MAXIMUM_TIMEOUT_SECONDS = 60;
const ZNN_ASSET = 'zts1znnxxxxxxxxxxxxx9z4ulx';
const RECEIPT_TYPE = 'reset-epoch-offline-preflight-receipt-v1';
const RUN_NOT_AUTHORIZED = 'RUN_NOT_AUTHORIZED';
const LIVE_PAYMENT_DECISION = 'NO_GO';
const ARTIFACT_VALIDATION = 'OFFLINE_RECEIPT_AND_ARTIFACT_VALIDATION_ONLY';
const EVIDENCE_CLASSIFICATION =
  'OPERATOR_ASSERTION_NOT_AUTHENTICATED_CHAIN_EVIDENCE';
const CROSS_CHECK_CLASSIFICATION =
  'OPERATOR_TRUSTED_NONAUTHORITATIVE_CROSS_CHECK';
const INDEPENDENT_REVIEW = 'NOT_PROVEN';
const REVISION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const DIGEST = /^[0-9a-f]{64}$/u;
const RUN_NAME = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const ZENON_BECH32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const ZENON_BECH32_GENERATORS = Object.freeze([
  0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3,
]);
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

export const GATE_B_RESET_EPOCH_OFFLINE_PREFLIGHT = Object.freeze({
  acknowledgements: Object.freeze({
    offlineReceipt:
      'I_UNDERSTAND_THIS_PHASE_CREATES_ONLY_A_NONAUTHORIZING_OFFLINE_PREFLIGHT_RECEIPT',
    operatorAssertion:
      'I_ASSERT_THE_ENTERED_DIGESTS_AND_PAYER_PAYEE_SUMMARY_MATCH_MY_OFFLINE_REVIEW',
    payeeOwnership:
      'I_UNDERSTAND_PAYEE_SYNTAX_AND_DISTINCTNESS_DO_NOT_PROVE_THIRD_PARTY_OWNERSHIP',
  }),
  artifactValidation: ARTIFACT_VALIDATION,
  crossCheckClassification: CROSS_CHECK_CLASSIFICATION,
  evidenceClassification: EVIDENCE_CLASSIFICATION,
  executionMode: EXECUTION_MODE,
  futureLiveConsumerEligible: false,
  independentReview: INDEPENDENT_REVIEW,
  livePaymentDecision: LIVE_PAYMENT_DECISION,
  maximumAmount: MAXIMUM_AMOUNT,
  maximumTimeoutSeconds: MAXIMUM_TIMEOUT_SECONDS,
  receiptType: RECEIPT_TYPE,
  runAuthorization: RUN_NOT_AUTHORIZED,
});

export const GATE_B_RESET_EPOCH_OFFLINE_PROVENANCE = Object.freeze({
  capturedDefault:
    'CAPTURED_DEFAULT_DEPENDENCIES_INHERITED_PROCESS_GROUP_OUTER_OWNERSHIP_UNPROVEN',
  injectedTestOnly:
    'INJECTED_TEST_ONLY_DEPENDENCIES_INHERITED_PROCESS_GROUP_OUTER_OWNERSHIP_UNPROVEN',
});

export class GateBResetEpochOfflinePreflightError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBResetEpochOfflinePreflightError';
    this.code = ERROR_CODE;
    this.stack = `GateBResetEpochOfflinePreflightError: ${ERROR_CODE}`;
  }
}

function fail() {
  throw new GateBResetEpochOfflinePreflightError();
}

function exactObject(value, fields) {
  if (!value || typeof value !== 'object' || IS_PROXY(value) || ARRAY_IS_ARRAY(value) ||
      GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const keys = REFLECT_OWN_KEYS(value);
  if (keys.length !== fields.length) fail();
  for (let index = 0; index < fields.length; index += 1) {
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, fields[index]);
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) fail();
  }
  for (let index = 0; index < keys.length; index += 1) {
    if (typeof keys[index] !== 'string' || !fields.includes(keys[index])) fail();
  }
  return value;
}

function exactArray(value, length) {
  if (!ARRAY_IS_ARRAY(value) || IS_PROXY(value) ||
      GET_PROTOTYPE_OF(value) !== Array.prototype || value.length !== length ||
      REFLECT_OWN_KEYS(value).length !== length + 1) fail();
  for (let index = 0; index < length; index += 1) {
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, String(index));
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) fail();
  }
  return value;
}

function exactString(value, maximumBytes = 4096) {
  if (typeof value !== 'string' || value.length < 1 ||
      Buffer.byteLength(value, 'utf8') > maximumBytes || CONTROL.test(value)) fail();
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) fail();
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) fail();
  }
  return value;
}

function strictCanonicalLineText(text) {
  try {
    if (typeof text !== 'string' || text.length < 3 ||
        Buffer.byteLength(text, 'utf8') > DOCUMENT_MAX_BYTES || !text.endsWith('\n') ||
        text.slice(0, -1).includes('\n') || text.includes('\r')) fail();
    const body = text.slice(0, -1);
    const value = JSON.parse(body);
    if (canonicalJson(value) !== body) fail();
    return value;
  } catch {
    fail();
  }
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    if (ARRAY_IS_ARRAY(value)) {
      for (let index = 0; index < value.length; index += 1) deepFreeze(value[index]);
    } else {
      const keys = Object.keys(value);
      for (let index = 0; index < keys.length; index += 1) deepFreeze(value[keys[index]]);
    }
    Object.freeze(value);
  }
  return value;
}

function bech32Step(checksum, word) {
  const top = checksum >>> 25;
  let result = ((checksum & 0x1ffffff) << 5) ^ word;
  for (let index = 0; index < ZENON_BECH32_GENERATORS.length; index += 1) {
    if ((top >>> index) & 1) result ^= ZENON_BECH32_GENERATORS[index];
  }
  return result >>> 0;
}

export function assertCanonicalZenonUserAddress(value) {
  try {
    if (typeof value !== 'string' || value.length !== 40 ||
        value[0] !== 'z' || value[1] !== '1') fail();
    let checksum = bech32Step(bech32Step(bech32Step(1, 3), 0), 26);
    const words = [];
    for (let index = 2; index < value.length; index += 1) {
      const word = ZENON_BECH32.indexOf(value[index]);
      if (word < 0) fail();
      words.push(word);
      checksum = bech32Step(checksum, word);
    }
    if (checksum !== 1) fail();
    let accumulator = 0;
    let bits = 0;
    const bytes = [];
    let nonzero = false;
    for (let index = 0; index < 32; index += 1) {
      accumulator = (accumulator << 5) | words[index];
      bits += 5;
      if (bits >= 8) {
        bits -= 8;
        const byte = (accumulator >>> bits) & 255;
        bytes.push(byte);
        if (byte !== 0) nonzero = true;
      }
    }
    if (bytes.length !== 20 || bits !== 0 || !nonzero || bytes[0] !== 0) fail();
    let encoded = 'z1';
    accumulator = 0;
    bits = 0;
    checksum = bech32Step(bech32Step(bech32Step(1, 3), 0), 26);
    for (let index = 0; index < bytes.length; index += 1) {
      accumulator = (accumulator << 8) | bytes[index];
      bits += 8;
      while (bits >= 5) {
        bits -= 5;
        const word = (accumulator >>> bits) & 31;
        encoded += ZENON_BECH32[word];
        checksum = bech32Step(checksum, word);
      }
    }
    if (bits !== 0) fail();
    for (let index = 0; index < 6; index += 1) checksum = bech32Step(checksum, 0);
    checksum = (checksum ^ 1) >>> 0;
    for (let index = 5; index >= 0; index -= 1) {
      encoded += ZENON_BECH32[(checksum >>> (5 * index)) & 31];
    }
    if (encoded !== value) fail();
    return value;
  } catch {
    fail();
  }
}

function validateExpectedPaymentRequired(value) {
  exactObject(value, ['accepts', 'resource', 'x402Version']);
  if (value.x402Version !== 2) fail();
  exactObject(value.resource, ['description', 'mimeType', 'url']);
  exactString(value.resource.url, 4096);
  if (!value.resource.url.startsWith('https://') ||
      !value.resource.url.endsWith('/paid') ||
      value.resource.description !== 'Zenon x402 PoC protected resource' ||
      value.resource.mimeType !== 'application/json') fail();
  exactArray(value.accepts, 1);
  const accepted = exactObject(value.accepts[0], [
    'amount', 'asset', 'extra', 'maxTimeoutSeconds', 'network', 'payTo', 'scheme',
  ]);
  if (accepted.scheme !== 'exact' || accepted.network !== 'zenon:testnet' ||
      accepted.asset !== ZNN_ASSET || accepted.amount !== MAXIMUM_AMOUNT ||
      accepted.maxTimeoutSeconds !== MAXIMUM_TIMEOUT_SECONDS) fail();
  assertCanonicalZenonUserAddress(accepted.payTo);
  const extra = exactObject(accepted.extra, [
    'paymentFlow', 'poc', 'settlement', 'zenonChain',
  ]);
  if (extra.paymentFlow !== 'upfront' || extra.poc !== true ||
      extra.settlement !== 'account-block') fail();
  exactObject(extra.zenonChain, ['chainIdentifier', 'genesisMomentumHash', 'version']);
  if (canonicalJson(extra.zenonChain) !==
      canonicalJson(PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_CHAIN_PROFILE)) fail();
}

export function parseGateBResetEpochOfflineRunConfig(text) {
  try {
    const value = strictCanonicalLineText(text);
    exactObject(value, [
      'acknowledgements', 'eventId', 'executionMode', 'expectedPaymentRequired',
      'payer', 'profileName', 'quickTunnel', 'rpcEndpoint', 'runnerVersion',
      'runtime', 'sourceRevision',
    ]);
    if (value.runnerVersion !== 4 || value.executionMode !== EXECUTION_MODE ||
        value.eventId !== PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID ||
        value.rpcEndpoint !== PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT ||
        value.profileName !== PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME ||
        typeof value.sourceRevision !== 'string' || !REVISION.test(value.sourceRevision)) fail();
    assertCanonicalZenonUserAddress(value.payer);
    exactObject(value.acknowledgements, ['live', 'operatorTrust', 'wss']);
    selectPublicTestnetDynamicPlasmaResetEpochExecutionPolicy({
      eventId: value.eventId,
      liveAcknowledgement: value.acknowledgements.live,
      operatorTrustAcknowledgement: value.acknowledgements.operatorTrust,
      profileName: value.profileName,
      rpcEndpoint: value.rpcEndpoint,
      wssAcknowledgement: value.acknowledgements.wss,
    });
    if (validateGateBQuickTunnelStableBinding(value.quickTunnel) !== true) fail();
    validateExpectedPaymentRequired(value.expectedPaymentRequired);
    if (value.payer === value.expectedPaymentRequired.accepts[0].payTo) fail();
    exactObject(value.runtime, [
      'listenPort', 'maxRecoveryAttempts', 'maxRecoveryElapsedMs',
      'recoveryDelayMs', 'rpcTimeoutMs',
    ]);
    if (value.runtime.listenPort !== 41000 || value.runtime.rpcTimeoutMs !== 30000 ||
        value.runtime.maxRecoveryAttempts !== 0 || value.runtime.recoveryDelayMs !== 0 ||
        value.runtime.maxRecoveryElapsedMs !== 1) fail();
    return deepFreeze(value);
  } catch {
    fail();
  }
}

export function gateBResetEpochOfflineConfigDigest(config) {
  try {
    const validated = parseGateBResetEpochOfflineRunConfig(
      `${canonicalJson(config)}\n`,
    );
    return sha256Hex(`${CONFIG_DIGEST_DOMAIN}\n${canonicalJson(validated)}`);
  } catch {
    fail();
  }
}

export function gateBResetEpochOfflinePaymentIntentDigest(config) {
  try {
    const validated = parseGateBResetEpochOfflineRunConfig(
      `${canonicalJson(config)}\n`,
    );
    return paymentIntentDigest(
      validated.expectedPaymentRequired,
      validated.expectedPaymentRequired.accepts[0],
    );
  } catch {
    fail();
  }
}

export function parseGateBResetEpochOfflineRoleInput(text, role) {
  try {
    const value = strictCanonicalLineText(text);
    if (role === 'buyer-rpc' || role === 'facilitator-rpc') {
      exactObject(value, ['rpcEndpoint', 'secretVersion']);
      if (value.secretVersion !== 4 ||
          value.rpcEndpoint !== PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT) fail();
    } else if (role === 'buyer-wallet') {
      exactObject(value, ['accountIndex', 'mnemonic', 'secretVersion']);
      if (value.secretVersion !== 1 || value.accountIndex !== 0) fail();
      exactString(value.mnemonic, 4096);
    } else fail();
    return deepFreeze(value);
  } catch {
    fail();
  }
}

export function parseGateBResetEpochOfflineWalletBytes(bytes) {
  try {
    if (!Buffer.isBuffer(bytes) || bytes.length < 3 || bytes.length > DOCUMENT_MAX_BYTES) fail();
    const text = UTF8_DECODER.decode(bytes);
    if (Buffer.byteLength(text, 'utf8') !== bytes.length) fail();
    return parseGateBResetEpochOfflineRoleInput(text, 'buyer-wallet');
  } catch {
    fail();
  }
}

export function parseGateBResetEpochOfflinePreflightReceipt(text) {
  try {
    const value = strictCanonicalLineText(text);
    exactObject(value, [
      'artifactValidation', 'configDigest', 'crossCheckClassification',
      'evidenceClassification', 'futureLiveConsumerEligible', 'independentReview',
      'livePaymentDecision', 'payee', 'payer', 'paymentIntentDigest',
      'provenanceClassification', 'receiptType', 'receiptVersion',
      'runAuthorization', 'runName', 'sourceRevision',
    ]);
    if (value.receiptVersion !== 1 || value.receiptType !== RECEIPT_TYPE ||
        value.artifactValidation !== ARTIFACT_VALIDATION ||
        value.crossCheckClassification !== CROSS_CHECK_CLASSIFICATION ||
        value.evidenceClassification !== EVIDENCE_CLASSIFICATION ||
        value.futureLiveConsumerEligible !== false ||
        value.independentReview !== INDEPENDENT_REVIEW ||
        value.livePaymentDecision !== LIVE_PAYMENT_DECISION ||
        value.runAuthorization !== RUN_NOT_AUTHORIZED ||
        !RUN_NAME.test(value.runName) || !REVISION.test(value.sourceRevision) ||
        !DIGEST.test(value.configDigest) || !DIGEST.test(value.paymentIntentDigest) ||
        !Object.values(GATE_B_RESET_EPOCH_OFFLINE_PROVENANCE)
          .includes(value.provenanceClassification)) fail();
    assertCanonicalZenonUserAddress(value.payer);
    assertCanonicalZenonUserAddress(value.payee);
    if (value.payer === value.payee) fail();
    return deepFreeze(value);
  } catch {
    fail();
  }
}
