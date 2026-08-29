import { createHash } from 'node:crypto';
import { types as utilTypes } from 'node:util';

import { paymentIntentDigest, sha256Hex } from './canonical.js';
import {
  EXPERIMENTAL_LIVE_NETWORK,
  validateActiveUpfrontRequirement,
  validatePaymentRequired,
  validateResource,
} from './x402-wire.js';
import {
  normalizeConfirmationDetail,
  preflightZenonPayment,
  validateAccountBlockJson,
} from './zenon-payment.js';
import {
  OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE,
  OPERATOR_TRUSTED_PUBLIC_TESTNET_NON_CLAIMS,
  OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME,
  OPERATOR_TRUSTED_PUBLIC_TESTNET_PROVENANCE,
} from './zenon/operator-trusted-testnet-profile.js';

export const LIVE_EVIDENCE_VERSION = 1;

const ERROR_CODE = 'live_evidence_invalid';
const REPOSITORY = 'edgepillar/zenon-x402-poc';
const PACKAGE_VERSION = '0.2.0';
const TRUST_MODE = 'operator-trusted-historical-observation';
const INTEGRITY_ALGORITHM = 'sha256';
const FINAL_MAX_BYTES = 512 * 1024;
const FRAGMENT_LIMITS = Object.freeze({
  manifest: 64 * 1024,
  chain: 64 * 1024,
  http: 128 * 1024,
  journal: 192 * 1024,
  timing: 64 * 1024,
});
const PROTECTED_BODY_MAX_BYTES = 64 * 1024;
const MIN_FINAL_JOURNAL_REVISION = 4;
const MAX_DEPTH = 20;
const MAX_NODES = 8192;
const MAX_MEMBERS = 4096;
const MAX_PUBLIC_STRING_BYTES = 4096;
const HASH_HEX = /^[0-9a-f]{64}$/;
const REVISION_HEX = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
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
const SECTION_NAMES = Object.freeze([
  'source', 'trust', 'payment', 'chain', 'http', 'journal', 'timing', 'nonClaims',
]);
const NON_CLAIM_FIELDS = Object.freeze([
  'authoritativeCurrentNetworkRelease',
  'signedTrustArtifact',
  'authenticatedRpcEndpoint',
  'canonicalRemoteChainIdentity',
  'verifiedFrontierLineage',
  'authenticatedChainIdentity',
  'canonicalNetworkIdentity',
  'irreversibleFinality',
  'facilitatorAuthorship',
  'productionReadiness',
  'phase2C',
  'hardwareWallet',
  'crossProcessExactlyOnce',
  'replayPreventionProvided',
  'resourceAuthorizationProvided',
  'bundleOriginAuthenticated',
  'bundleIntegrityAuthenticated',
  'chainObservationIndependentlyAttested',
  'httpExchangeIndependentlyAttested',
  'facilitatorPublicationProven',
  'buyerReceiptCryptographicallyProven',
  'recipientReceiveObserved',
  'secretAbsenceProven',
]);
const EVENT_PHASES = Object.freeze({
  runner: Object.freeze([
    'challenge_request_started',
    'challenge_402_received',
    'paid_response_received',
  ]),
  buyer: Object.freeze([
    'buyer_owner_wait_started',
    'buyer_owner_acquired',
    'buyer_readiness_started',
    'buyer_readiness_finished',
    'prepare_block_started',
    'prepare_block_finished',
    'buyer_owner_released',
  ]),
  facilitator: Object.freeze([
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
  ]),
});
const CLOCK_DOMAINS = Object.freeze({
  runner: 'runner-monotonic-v1',
  buyer: 'buyer-monotonic-v1',
  facilitator: 'facilitator-monotonic-v1',
});
const DURATION_BINDINGS = Object.freeze({
  challenge: Object.freeze(['runner', 'challenge_request_started', 'challenge_402_received']),
  total: Object.freeze(['runner', 'challenge_402_received', 'paid_response_received']),
  buyerOwnerWait: Object.freeze(['buyer', 'buyer_owner_wait_started', 'buyer_owner_acquired']),
  buyerOwnerHeld: Object.freeze(['buyer', 'buyer_owner_acquired', 'buyer_owner_released']),
  buyerReadiness: Object.freeze(['buyer', 'buyer_readiness_started', 'buyer_readiness_finished']),
  prepareBlock: Object.freeze(['buyer', 'prepare_block_started', 'prepare_block_finished']),
  facilitatorOwnerWait: Object.freeze([
    'facilitator', 'facilitator_owner_wait_started', 'facilitator_owner_acquired',
  ]),
  facilitatorOwnerHeld: Object.freeze([
    'facilitator', 'facilitator_owner_acquired', 'facilitator_owner_released',
  ]),
  facilitatorReadiness: Object.freeze([
    'facilitator', 'facilitator_readiness_started', 'facilitator_readiness_finished',
  ]),
  publication: Object.freeze(['facilitator', 'publication_started', 'publication_acknowledged']),
  inclusionWait: Object.freeze([
    'facilitator', 'inclusion_wait_started', 'momentum_inclusion_observed',
  ]),
  delivery: Object.freeze(['facilitator', 'delivery_started', 'delivery_finished']),
});
const WORK_KINDS = Object.freeze([
  'none', 'fused_plasma_only', 'pow_only', 'fused_plasma_and_pow',
]);
const SECTION_PREFIX = 'zenon-x402-live-evidence-v1:section:';
const BUNDLE_PREFIX = 'zenon-x402-live-evidence-v1:bundle\0';

const ARRAY_IS_ARRAY = Array.isArray;
const ARRAY_PROTOTYPE = Array.prototype;
const BUFFER_BYTE_LENGTH = Buffer.byteLength;
const CREATE = Object.create;
const DEFINE_PROPERTY = Object.defineProperty;
const FREEZE = Object.freeze;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const JSON_PARSE = JSON.parse;
const JSON_STRINGIFY = JSON.stringify;
const OBJECT_IS = Object.is;
const OBJECT_KEYS = Object.keys;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const SET_ADD = Set.prototype.add;
const SET_HAS = Set.prototype.has;
const WEAK_SET_ADD = WeakSet.prototype.add;
const WEAK_SET_DELETE = WeakSet.prototype.delete;
const WEAK_SET_HAS = WeakSet.prototype.has;

export class LiveEvidenceError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'LiveEvidenceError';
    this.code = ERROR_CODE;
    this.stack = `LiveEvidenceError: ${ERROR_CODE}`;
  }
}

function fail() {
  throw new LiveEvidenceError();
}

function ownData(target, key, value) {
  DEFINE_PROPERTY(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

function arrayAppend(array, value) {
  ownData(array, String(array.length), value);
}

function hasUnpairedSurrogate(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function safeInteger(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  return Number.isSafeInteger(value) && !OBJECT_IS(value, -0) && value >= min && value <= max;
}

function encodedPrimitive(value) {
  const encoded = JSON_STRINGIFY(value);
  if (typeof encoded !== 'string') fail();
  return encoded;
}

function consumeBytes(budget, amount) {
  if (!safeInteger(amount) || amount > budget.maximumBytes - budget.bytes) fail();
  budget.bytes += amount;
}

function consumeNode(budget) {
  if (budget.nodes >= MAX_NODES) fail();
  budget.nodes += 1;
}

function consumeMember(budget) {
  if (budget.members >= MAX_MEMBERS) fail();
  budget.members += 1;
}

function descriptorSafeSnapshot(value, maximumBytes = FINAL_MAX_BYTES) {
  try {
    const budget = { maximumBytes, bytes: 0, nodes: 0, members: 0 };
    const snapshot = captureValue(value, 0, new WeakSet(), budget);
    if (budget.bytes > maximumBytes) fail();
    return snapshot;
  } catch {
    fail();
  }
}

function captureValue(value, depth, seen, budget) {
  if (depth > MAX_DEPTH) fail();
  consumeNode(budget);
  if (value === null) {
    consumeBytes(budget, 4);
    return null;
  }
  if (typeof value === 'string') {
    if (hasUnpairedSurrogate(value)) fail();
    const encoded = encodedPrimitive(value);
    consumeBytes(budget, BUFFER_BYTE_LENGTH(encoded, 'utf8'));
    return value;
  }
  if (typeof value === 'boolean') {
    consumeBytes(budget, value ? 4 : 5);
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value) || OBJECT_IS(value, -0)) fail();
    const encoded = encodedPrimitive(value);
    consumeBytes(budget, BUFFER_BYTE_LENGTH(encoded, 'utf8'));
    return value;
  }
  if (typeof value !== 'object' || value === null || IS_PROXY(value)) fail();
  if (WEAK_SET_HAS.call(seen, value)) fail();
  WEAK_SET_ADD.call(seen, value);

  let prototype;
  let keys;
  try {
    prototype = GET_PROTOTYPE_OF(value);
    keys = REFLECT_OWN_KEYS(value);
  } catch {
    fail();
  }
  const array = ARRAY_IS_ARRAY(value);
  if (array !== (prototype === ARRAY_PROTOTYPE)) fail();
  if (!array && prototype !== OBJECT_PROTOTYPE) fail();

  let output;
  if (array) {
    output = [];
    let lengthDescriptor;
    try {
      lengthDescriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, 'length');
    } catch {
      fail();
    }
    if (!lengthDescriptor || !HAS_OWN(lengthDescriptor, 'value') ||
        !safeInteger(lengthDescriptor.value) || keys.length !== lengthDescriptor.value + 1) fail();
    consumeBytes(budget, 2);
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      if (index > 0) consumeBytes(budget, 1);
      const key = String(index);
      let descriptor;
      try {
        descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
      } catch {
        fail();
      }
      if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) fail();
      consumeMember(budget);
      arrayAppend(output, captureValue(descriptor.value, depth + 1, seen, budget));
    }
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (typeof key !== 'string' || (key !== 'length' && !/^(?:0|[1-9]\d*)$/.test(key))) fail();
      if (key !== 'length' && Number(key) >= lengthDescriptor.value) fail();
    }
  } else {
    output = {};
    consumeBytes(budget, 2);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (typeof key !== 'string' || hasUnpairedSurrogate(key)) fail();
      let descriptor;
      try {
        descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
      } catch {
        fail();
      }
      if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) fail();
      if (index > 0) consumeBytes(budget, 1);
      const encodedKey = encodedPrimitive(key);
      consumeBytes(budget, BUFFER_BYTE_LENGTH(encodedKey, 'utf8') + 1);
      consumeMember(budget);
      ownData(output, key, captureValue(descriptor.value, depth + 1, seen, budget));
    }
  }
  WEAK_SET_DELETE.call(seen, value);
  return output;
}

function insertionSortStrings(values) {
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index];
    let cursor = index - 1;
    while (cursor >= 0 && values[cursor] > value) {
      DEFINE_PROPERTY(values, String(cursor + 1), {
        value: values[cursor], enumerable: true, configurable: true, writable: true,
      });
      cursor -= 1;
    }
    DEFINE_PROPERTY(values, String(cursor + 1), {
      value, enumerable: true, configurable: true, writable: true,
    });
  }
}

function canonicalEncodeSnapshot(value, depth = 0) {
  if (depth > MAX_DEPTH) fail();
  if (value === null || typeof value === 'string' || typeof value === 'boolean' ||
      typeof value === 'number') return encodedPrimitive(value);
  if (ARRAY_IS_ARRAY(value)) {
    let output = '[';
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, String(index));
      if (!descriptor || !HAS_OWN(descriptor, 'value')) fail();
      if (index > 0) output += ',';
      output += canonicalEncodeSnapshot(descriptor.value, depth + 1);
    }
    return `${output}]`;
  }
  const sourceKeys = OBJECT_KEYS(value);
  const keys = [];
  for (let index = 0; index < sourceKeys.length; index += 1) arrayAppend(keys, sourceKeys[index]);
  insertionSortStrings(keys);
  let output = '{';
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
    if (!descriptor || !HAS_OWN(descriptor, 'value')) fail();
    if (index > 0) output += ',';
    output += `${encodedPrimitive(key)}:${canonicalEncodeSnapshot(descriptor.value, depth + 1)}`;
  }
  return `${output}}`;
}

function canonicalSnapshot(value, maximumBytes = FINAL_MAX_BYTES) {
  const snapshot = descriptorSafeSnapshot(value, maximumBytes);
  const encoded = canonicalEncodeSnapshot(snapshot);
  if (BUFFER_BYTE_LENGTH(encoded, 'utf8') > maximumBytes) fail();
  return { snapshot, encoded };
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    if (ARRAY_IS_ARRAY(value)) {
      for (let index = 0; index < value.length; index += 1) deepFreeze(value[index]);
    } else {
      const keys = OBJECT_KEYS(value);
      for (let index = 0; index < keys.length; index += 1) deepFreeze(value[keys[index]]);
    }
    FREEZE(value);
  }
  return value;
}

function parseStrictJson(text, maximumBytes = FINAL_MAX_BYTES) {
  try {
    if (typeof text !== 'string' || BUFFER_BYTE_LENGTH(text, 'utf8') > maximumBytes ||
        hasUnpairedSurrogate(text)) fail();
    let index = 0;
    let nodes = 0;
    let members = 0;

    function skipWhitespace() {
      while (index < text.length && (text[index] === ' ' || text[index] === '\n' ||
          text[index] === '\r' || text[index] === '\t')) index += 1;
    }

    function parseString() {
      const start = index;
      if (text[index] !== '"') fail();
      index += 1;
      while (index < text.length) {
        const code = text.charCodeAt(index);
        if (code === 0x22) {
          index += 1;
          const value = JSON_PARSE(text.slice(start, index));
          if (typeof value !== 'string' || hasUnpairedSurrogate(value)) fail();
          return value;
        }
        if (code < 0x20) fail();
        if (code === 0x5c) {
          index += 1;
          if (index >= text.length) fail();
          if (text[index] === 'u') {
            if (!/^[0-9a-fA-F]{4}$/.test(text.slice(index + 1, index + 5))) fail();
            index += 5;
            continue;
          }
          if (!'"\\/bfnrt'.includes(text[index])) fail();
        }
        index += 1;
      }
      fail();
    }

    function parseNumber() {
      const remainder = text.slice(index);
      const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(remainder);
      if (!match) fail();
      index += match[0].length;
      const value = Number(match[0]);
      if (!Number.isFinite(value) || !Number.isSafeInteger(value) || OBJECT_IS(value, -0)) fail();
      return value;
    }

    function parseValue(depth) {
      if (depth > MAX_DEPTH || nodes >= MAX_NODES) fail();
      nodes += 1;
      skipWhitespace();
      const token = text[index];
      if (token === '"') return parseString();
      if (token === '{') {
        index += 1;
        const output = {};
        const seen = new Set();
        skipWhitespace();
        if (text[index] === '}') {
          index += 1;
          return output;
        }
        while (index < text.length) {
          skipWhitespace();
          const key = parseString();
          if (SET_HAS.call(seen, key)) fail();
          SET_ADD.call(seen, key);
          if (members >= MAX_MEMBERS) fail();
          members += 1;
          skipWhitespace();
          if (text[index] !== ':') fail();
          index += 1;
          ownData(output, key, parseValue(depth + 1));
          skipWhitespace();
          if (text[index] === '}') {
            index += 1;
            return output;
          }
          if (text[index] !== ',') fail();
          index += 1;
        }
        fail();
      }
      if (token === '[') {
        index += 1;
        const output = [];
        skipWhitespace();
        if (text[index] === ']') {
          index += 1;
          return output;
        }
        while (index < text.length) {
          if (members >= MAX_MEMBERS) fail();
          members += 1;
          arrayAppend(output, parseValue(depth + 1));
          skipWhitespace();
          if (text[index] === ']') {
            index += 1;
            return output;
          }
          if (text[index] !== ',') fail();
          index += 1;
        }
        fail();
      }
      if (text.startsWith('true', index)) {
        index += 4;
        return true;
      }
      if (text.startsWith('false', index)) {
        index += 5;
        return false;
      }
      if (text.startsWith('null', index)) {
        index += 4;
        return null;
      }
      return parseNumber();
    }

    const value = parseValue(0);
    skipWhitespace();
    if (index !== text.length) fail();
    return value;
  } catch {
    fail();
  }
}

function exactObject(value, expected) {
  if (!value || typeof value !== 'object' || ARRAY_IS_ARRAY(value) ||
      GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const keys = OBJECT_KEYS(value);
  if (keys.length !== expected.length) fail();
  const allowed = new Set(expected);
  for (let index = 0; index < keys.length; index += 1) {
    if (!SET_HAS.call(allowed, keys[index])) fail();
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (!HAS_OWN(value, expected[index])) fail();
  }
  return value;
}

function exactOptionalObject(value, required, optional) {
  if (!value || typeof value !== 'object' || ARRAY_IS_ARRAY(value) ||
      GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const allowed = new Set();
  for (let index = 0; index < required.length; index += 1) SET_ADD.call(allowed, required[index]);
  for (let index = 0; index < optional.length; index += 1) SET_ADD.call(allowed, optional[index]);
  const keys = OBJECT_KEYS(value);
  for (let index = 0; index < keys.length; index += 1) {
    if (!SET_HAS.call(allowed, keys[index])) fail();
  }
  for (let index = 0; index < required.length; index += 1) {
    if (!HAS_OWN(value, required[index])) fail();
  }
  return value;
}

function exactArray(value, length) {
  if (!ARRAY_IS_ARRAY(value) || value.length !== length) fail();
  return value;
}

function stringValue(value, { maximumBytes = MAX_PUBLIC_STRING_BYTES, allowControls = false } = {}) {
  if (typeof value !== 'string' || BUFFER_BYTE_LENGTH(value, 'utf8') > maximumBytes ||
      hasUnpairedSurrogate(value) || (!allowControls && CONTROL_CHARACTERS.test(value))) fail();
  return value;
}

function hashValue(value) {
  if (typeof value !== 'string' || !HASH_HEX.test(value)) fail();
  return value;
}

function timestampValue(value) {
  if (typeof value !== 'string' || !UTC_TIMESTAMP.test(value)) fail();
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) fail();
  return value;
}

function sameJson(left, right) {
  return canonicalEncodeSnapshot(left) === canonicalEncodeSnapshot(right);
}

function sha256Bytes(prefix, encoded) {
  return createHash('sha256').update(prefix, 'utf8').update(encoded, 'utf8').digest('hex');
}

function validateSourceShape(source) {
  exactObject(source, ['repository', 'revision', 'packageVersion', 'nodeMajor']);
  stringValue(source.repository, { maximumBytes: 128 });
  if (typeof source.revision !== 'string' || !REVISION_HEX.test(source.revision)) fail();
  stringValue(source.packageVersion, { maximumBytes: 32 });
  if (!safeInteger(source.nodeMajor, { min: 24, max: 1000 })) fail();
}

function validateChainProfileShape(profile) {
  exactObject(profile, ['version', 'chainIdentifier', 'genesisMomentumHash']);
  if (profile.version !== 1 || typeof profile.chainIdentifier !== 'string' ||
      !/^[1-9]\d*$/.test(profile.chainIdentifier)) fail();
  hashValue(profile.genesisMomentumHash);
}

function validateProvenanceShape(provenance) {
  exactObject(provenance, [
    'repository', 'revision', 'path', 'sourceDate', 'observationHeight',
    'observationHash', 'derivation',
  ]);
  stringValue(provenance.repository, { maximumBytes: 128 });
  if (typeof provenance.revision !== 'string' || !REVISION_HEX.test(provenance.revision)) fail();
  stringValue(provenance.path, { maximumBytes: 256 });
  stringValue(provenance.sourceDate, { maximumBytes: 32 });
  if (!safeInteger(provenance.observationHeight, { min: 1 })) fail();
  hashValue(provenance.observationHash);
  stringValue(provenance.derivation, { maximumBytes: 128 });
}

function validateTrustShape(trust) {
  exactObject(trust, [
    'mode', 'profileName', 'chainIdentifier', 'genesisMomentumHash',
    'provenance', 'remoteChainAuthenticated',
  ]);
  stringValue(trust.mode, { maximumBytes: 64 });
  stringValue(trust.profileName, { maximumBytes: 128 });
  if (typeof trust.chainIdentifier !== 'string' || !/^[1-9]\d*$/.test(trust.chainIdentifier)) fail();
  hashValue(trust.genesisMomentumHash);
  validateProvenanceShape(trust.provenance);
  if (trust.remoteChainAuthenticated !== false) fail();
}

function validateResourceShape(resource) {
  exactOptionalObject(resource, ['url'], [
    'description', 'mimeType', 'serviceName', 'tags', 'iconUrl',
  ]);
  stringValue(resource.url, { maximumBytes: 4096 });
  for (const field of ['description', 'mimeType', 'serviceName', 'iconUrl']) {
    if (HAS_OWN(resource, field)) stringValue(resource[field], { maximumBytes: 4096 });
  }
  if (HAS_OWN(resource, 'tags')) {
    if (!ARRAY_IS_ARRAY(resource.tags) || resource.tags.length > 5) fail();
    for (let index = 0; index < resource.tags.length; index += 1) {
      stringValue(resource.tags[index], { maximumBytes: 32 });
    }
  }
}

function validateRequirementShape(requirement) {
  exactObject(requirement, [
    'scheme', 'network', 'asset', 'amount', 'payTo', 'maxTimeoutSeconds', 'extra',
  ]);
  for (const field of ['scheme', 'network', 'asset', 'amount', 'payTo']) {
    stringValue(requirement[field], { maximumBytes: 128 });
  }
  if (!safeInteger(requirement.maxTimeoutSeconds, { min: 1 })) fail();
  exactObject(requirement.extra, ['poc', 'settlement', 'zenonChain', 'paymentFlow']);
  if (requirement.extra.poc !== true) fail();
  stringValue(requirement.extra.settlement, { maximumBytes: 32 });
  stringValue(requirement.extra.paymentFlow, { maximumBytes: 32 });
  validateChainProfileShape(requirement.extra.zenonChain);
}

function validatePaymentRequiredShape(paymentRequired) {
  exactObject(paymentRequired, ['x402Version', 'resource', 'accepts']);
  if (paymentRequired.x402Version !== 2) fail();
  validateResourceShape(paymentRequired.resource);
  exactArray(paymentRequired.accepts, 1);
  validateRequirementShape(paymentRequired.accepts[0]);
}

function validatePaymentShape(payment) {
  exactObject(payment, ['paymentRequired', 'selectedIndex', 'intentDigest', 'authorizationKey']);
  validatePaymentRequiredShape(payment.paymentRequired);
  if (payment.selectedIndex !== 0) fail();
  hashValue(payment.intentDigest);
  hashValue(payment.authorizationKey);
}

function validateMomentumAcknowledgedShape(momentum) {
  exactObject(momentum, ['hash', 'height']);
  hashValue(momentum.hash);
  if (!safeInteger(momentum.height)) fail();
}

function validateAccountBlockShape(block) {
  exactObject(block, ACCOUNT_BLOCK_FIELDS);
  validateMomentumAcknowledgedShape(block.momentumAcknowledged);
  for (const field of ['hash', 'previousHash', 'fromBlockHash']) hashValue(block[field]);
  for (const field of ['address', 'toAddress', 'amount', 'tokenStandard', 'data', 'nonce', 'publicKey', 'signature']) {
    stringValue(block[field], { maximumBytes: 2048 });
  }
  for (const field of ['version', 'chainIdentifier', 'blockType', 'height', 'fusedPlasma', 'difficulty']) {
    if (!safeInteger(block[field])) fail();
  }
}

function validateConfirmationShape(confirmation) {
  exactObject(confirmation, [
    'observedAt', 'numConfirmations', 'momentumHeight', 'momentumHash', 'momentumTimestamp',
  ]);
  timestampValue(confirmation.observedAt);
  if (!safeInteger(confirmation.numConfirmations, { min: 1 }) ||
      !safeInteger(confirmation.momentumHeight, { min: 1 }) ||
      !safeInteger(confirmation.momentumTimestamp)) fail();
  hashValue(confirmation.momentumHash);
}

function validateChainShape(chain) {
  exactObject(chain, ['accountBlock', 'confirmation']);
  validateAccountBlockShape(chain.accountBlock);
  validateConfirmationShape(chain.confirmation);
}

function validatePaymentResponseShape(response) {
  exactObject(response, ['success', 'network', 'transaction', 'payer', 'state']);
  if (response.success !== true) fail();
  stringValue(response.network, { maximumBytes: 128 });
  hashValue(response.transaction);
  stringValue(response.payer, { maximumBytes: 128 });
  stringValue(response.state, { maximumBytes: 64 });
}

function validateProtectedBodyShape(body) {
  exactObject(body, ['ok', 'message', 'network', 'payer', 'transaction', 'generatedAt']);
  if (body.ok !== true || body.message !== 'paid resource unlocked') fail();
  stringValue(body.network, { maximumBytes: 128 });
  stringValue(body.payer, { maximumBytes: 128 });
  hashValue(body.transaction);
  timestampValue(body.generatedAt);
}

function validateHttpShape(http) {
  exactObject(http, ['initial', 'final']);
  exactObject(http.initial, ['status', 'observedAt']);
  if (http.initial.status !== 402) fail();
  timestampValue(http.initial.observedAt);
  exactObject(http.final, [
    'status', 'observedAt', 'paymentResponse', 'contentType', 'cacheControl',
    'vary', 'bodyText',
  ]);
  if (http.final.status !== 200) fail();
  timestampValue(http.final.observedAt);
  validatePaymentResponseShape(http.final.paymentResponse);
  for (const field of ['contentType', 'cacheControl', 'vary']) {
    stringValue(http.final[field], { maximumBytes: 256 });
  }
  stringValue(http.final.bodyText, {
    maximumBytes: PROTECTED_BODY_MAX_BYTES,
    allowControls: true,
  });
}

function validateConfirmationDetailShape(detail) {
  exactObject(detail, ['numConfirmations', 'momentumHeight', 'momentumHash', 'momentumTimestamp']);
  if (!safeInteger(detail.numConfirmations, { min: 1 }) ||
      !safeInteger(detail.momentumHeight, { min: 1 }) ||
      !safeInteger(detail.momentumTimestamp)) fail();
  hashValue(detail.momentumHash);
}

function validateMomentumEvidenceShape(evidence) {
  exactObject(evidence, ['observedAt', 'confirmationDetail']);
  timestampValue(evidence.observedAt);
  validateConfirmationDetailShape(evidence.confirmationDetail);
}

function validateCachedResponseShape(cached) {
  exactObject(cached, ['status', 'headers', 'body']);
  if (cached.status !== 200) fail();
  exactObject(cached.headers, ['content-type']);
  stringValue(cached.headers['content-type'], { maximumBytes: 256 });
  validateProtectedBodyShape(cached.body);
}

function validateRecordShape(record) {
  exactObject(record, RECORD_FIELDS);
  for (const field of ['authorizationKey', 'transactionHash', 'intentDigest', 'resourceDigest']) {
    hashValue(record[field]);
  }
  validateChainProfileShape(record.chainProfile);
  validateResourceShape(record.resourceIdentity);
  stringValue(record.payer, { maximumBytes: 128 });
  validateAccountBlockShape(record.signedAccountBlock);
  stringValue(record.evidenceState, { maximumBytes: 64 });
  validateMomentumEvidenceShape(record.momentumEvidence);
  stringValue(record.deliveryState, { maximumBytes: 64 });
  validateCachedResponseShape(record.cachedResponse);
  timestampValue(record.createdAt);
  timestampValue(record.updatedAt);
}

function validateJournalShape(journal) {
  exactObject(journal, [
    'sourceSchemaVersion', 'sourceRevision', 'activeRecordCount', 'tombstoneCount', 'record',
  ]);
  if ((journal.sourceSchemaVersion !== 1 && journal.sourceSchemaVersion !== 2) ||
      !safeInteger(journal.sourceRevision) || journal.activeRecordCount !== 1 ||
      journal.tombstoneCount !== 0) fail();
  validateRecordShape(journal.record);
}

function validateEventShape(event) {
  exactObject(event, ['sequence', 'phase', 'role', 'clockDomain', 'utc', 'monotonicMs']);
  if (!safeInteger(event.sequence) || !HAS_OWN(EVENT_PHASES, event.role)) fail();
  stringValue(event.phase, { maximumBytes: 64 });
  if (event.clockDomain !== CLOCK_DOMAINS[event.role]) fail();
  timestampValue(event.utc);
  if (!safeInteger(event.monotonicMs)) fail();
}

function validateDurationsShape(durations) {
  exactObject(durations, OBJECT_KEYS(DURATION_BINDINGS));
  const fields = OBJECT_KEYS(DURATION_BINDINGS);
  for (let index = 0; index < fields.length; index += 1) {
    if (!safeInteger(durations[fields[index]])) fail();
  }
}

function validateWorkShape(work) {
  exactObject(work, ['classification', 'fusedPlasma', 'difficulty']);
  if (!WORK_KINDS.includes(work.classification) || !safeInteger(work.fusedPlasma) ||
      !safeInteger(work.difficulty)) fail();
}

function validateTimingShape(timing, { final = true } = {}) {
  exactObject(timing, final ? ['events', 'durationsMs', 'work'] : ['events', 'durationsMs']);
  if (!ARRAY_IS_ARRAY(timing.events)) fail();
  let expectedCount = 0;
  const roles = OBJECT_KEYS(EVENT_PHASES);
  for (let index = 0; index < roles.length; index += 1) expectedCount += EVENT_PHASES[roles[index]].length;
  if (timing.events.length !== expectedCount) fail();
  for (let index = 0; index < timing.events.length; index += 1) validateEventShape(timing.events[index]);
  validateDurationsShape(timing.durationsMs);
  if (final) validateWorkShape(timing.work);
}

function validateNonClaimsShape(nonClaims) {
  exactObject(nonClaims, NON_CLAIM_FIELDS);
  for (let index = 0; index < NON_CLAIM_FIELDS.length; index += 1) {
    if (nonClaims[NON_CLAIM_FIELDS[index]] !== false) fail();
  }
}

function validateIntegrityShape(integrity) {
  exactObject(integrity, ['algorithm', 'sectionDigests', 'bundleDigest']);
  if (integrity.algorithm !== INTEGRITY_ALGORITHM) fail();
  exactObject(integrity.sectionDigests, SECTION_NAMES);
  for (let index = 0; index < SECTION_NAMES.length; index += 1) {
    hashValue(integrity.sectionDigests[SECTION_NAMES[index]]);
  }
  hashValue(integrity.bundleDigest);
}

function validateBundleShape(bundle) {
  exactObject(bundle, [
    'evidenceVersion', 'source', 'trust', 'payment', 'chain', 'http',
    'journal', 'timing', 'nonClaims', 'integrity',
  ]);
  if (bundle.evidenceVersion !== LIVE_EVIDENCE_VERSION) fail();
  validateSourceShape(bundle.source);
  validateTrustShape(bundle.trust);
  validatePaymentShape(bundle.payment);
  validateChainShape(bundle.chain);
  validateHttpShape(bundle.http);
  validateJournalShape(bundle.journal);
  validateTimingShape(bundle.timing);
  validateNonClaimsShape(bundle.nonClaims);
  validateIntegrityShape(bundle.integrity);
}

function validateFragmentShape(fragment, expectedType) {
  if (!HAS_OWN(FRAGMENT_LIMITS, expectedType)) fail();
  const section = expectedType === 'manifest'
    ? ['source', 'trust', 'payment', 'nonClaims']
    : [expectedType];
  exactObject(fragment, ['fragmentVersion', 'fragmentType', ...section]);
  if (fragment.fragmentVersion !== 1 || fragment.fragmentType !== expectedType) fail();
  if (expectedType === 'manifest') {
    validateSourceShape(fragment.source);
    validateTrustShape(fragment.trust);
    validatePaymentShape(fragment.payment);
    validateNonClaimsShape(fragment.nonClaims);
  } else if (expectedType === 'chain') {
    validateChainShape(fragment.chain);
  } else if (expectedType === 'http') {
    validateHttpShape(fragment.http);
  } else if (expectedType === 'journal') {
    validateJournalShape(fragment.journal);
  } else {
    validateTimingShape(fragment.timing, { final: false });
  }
}

function validatePublicUrl(value, { requireHttps = false } = {}) {
  if (value.includes('?') || value.includes('#')) fail();
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail();
  }
  if ((requireHttps && parsed.protocol !== 'https:') ||
      (!requireHttps && parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
      parsed.username !== '' || parsed.password !== '' || parsed.search !== '' || parsed.hash !== '') fail();
}

function validatePublicResource(resource) {
  try {
    validateResource(resource);
  } catch {
    fail();
  }
  validatePublicUrl(resource.url, { requireHttps: true });
  if (HAS_OWN(resource, 'iconUrl')) validatePublicUrl(resource.iconUrl);
  if (HAS_OWN(resource, 'description')) stringValue(resource.description);
  if (HAS_OWN(resource, 'mimeType')) stringValue(resource.mimeType, { maximumBytes: 256 });
}

function assertPinnedSourceAndTrust(source, trust, nonClaims) {
  if (source.repository !== REPOSITORY || source.packageVersion !== PACKAGE_VERSION ||
      trust.mode !== TRUST_MODE ||
      trust.profileName !== OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME ||
      trust.chainIdentifier !== OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE.chainIdentifier ||
      trust.genesisMomentumHash !== OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE.genesisMomentumHash ||
      trust.remoteChainAuthenticated !== false ||
      !sameJson(trust.provenance, OPERATOR_TRUSTED_PUBLIC_TESTNET_PROVENANCE)) fail();
  const profileClaims = OBJECT_KEYS(OPERATOR_TRUSTED_PUBLIC_TESTNET_NON_CLAIMS);
  for (let index = 0; index < profileClaims.length; index += 1) {
    const key = profileClaims[index];
    if (OPERATOR_TRUSTED_PUBLIC_TESTNET_NON_CLAIMS[key] !== false || nonClaims[key] !== false) fail();
  }
}

function confirmationDetailFromCaptured(confirmation) {
  const detail = {
    numConfirmations: confirmation.numConfirmations,
    momentumHeight: confirmation.momentumHeight,
    momentumHash: confirmation.momentumHash,
    momentumTimestamp: confirmation.momentumTimestamp,
  };
  try {
    return normalizeConfirmationDetail(detail);
  } catch {
    fail();
  }
}

function validateTimingSemantics(timing) {
  const expectedPairs = new Set();
  const roles = OBJECT_KEYS(EVENT_PHASES);
  for (let roleIndex = 0; roleIndex < roles.length; roleIndex += 1) {
    const role = roles[roleIndex];
    const phases = EVENT_PHASES[role];
    for (let phaseIndex = 0; phaseIndex < phases.length; phaseIndex += 1) {
      SET_ADD.call(expectedPairs, `${role}:${phases[phaseIndex]}`);
    }
  }

  const events = new Map();
  const roleCursor = { runner: -1, buyer: -1, facilitator: -1 };
  const roleMonotonic = { runner: -1, buyer: -1, facilitator: -1 };
  let priorUtc = -1;
  for (let index = 0; index < timing.events.length; index += 1) {
    const event = timing.events[index];
    if (event.sequence !== index) fail();
    const eventUtc = Date.parse(event.utc);
    if (eventUtc < priorUtc) fail();
    priorUtc = eventUtc;
    const pair = `${event.role}:${event.phase}`;
    if (!SET_HAS.call(expectedPairs, pair) || events.has(pair)) fail();
    const phaseIndex = EVENT_PHASES[event.role].indexOf(event.phase);
    if (phaseIndex <= roleCursor[event.role] || event.monotonicMs < roleMonotonic[event.role]) fail();
    roleCursor[event.role] = phaseIndex;
    roleMonotonic[event.role] = event.monotonicMs;
    events.set(pair, event);
  }
  if (events.size !== expectedPairs.size) fail();

  const durationNames = OBJECT_KEYS(DURATION_BINDINGS);
  for (let index = 0; index < durationNames.length; index += 1) {
    const name = durationNames[index];
    const [role, startPhase, endPhase] = DURATION_BINDINGS[name];
    const start = events.get(`${role}:${startPhase}`);
    const end = events.get(`${role}:${endPhase}`);
    if (!start || !end || start.clockDomain !== end.clockDomain ||
        end.monotonicMs < start.monotonicMs ||
        timing.durationsMs[name] !== end.monotonicMs - start.monotonicMs) fail();
  }
  const sequenceOrders = [
    ['runner:challenge_402_received', 'buyer:buyer_owner_wait_started'],
    ['buyer:buyer_owner_released', 'facilitator:facilitator_owner_wait_started'],
    ['facilitator:facilitator_owner_released', 'facilitator:delivery_started'],
    ['facilitator:delivery_finished', 'runner:paid_response_received'],
  ];
  for (let index = 0; index < sequenceOrders.length; index += 1) {
    const [before, after] = sequenceOrders[index];
    if (events.get(before).sequence >= events.get(after).sequence) fail();
  }
  return events;
}

function deriveWork(accountBlock) {
  const fused = accountBlock.fusedPlasma > 0;
  const pow = accountBlock.difficulty > 0;
  const classification = fused && pow
    ? 'fused_plasma_and_pow'
    : fused
      ? 'fused_plasma_only'
      : pow
        ? 'pow_only'
        : 'none';
  return {
    classification,
    fusedPlasma: accountBlock.fusedPlasma,
    difficulty: accountBlock.difficulty,
  };
}

function expectedDefaultBody(record, requirements, preflight) {
  const body = record.cachedResponse.body;
  validateProtectedBodyShape(body);
  if (body.network !== requirements.network || body.payer !== preflight.payer ||
      body.transaction !== preflight.transactionHash) fail();
  return {
    ok: true,
    message: 'paid resource unlocked',
    network: requirements.network,
    payer: preflight.payer,
    transaction: preflight.transactionHash,
    generatedAt: body.generatedAt,
  };
}

async function validateContentSemantics(content) {
  assertPinnedSourceAndTrust(content.source, content.trust, content.nonClaims);
  const paymentRequired = content.payment.paymentRequired;
  const requirements = paymentRequired.accepts[0];
  validatePublicResource(paymentRequired.resource);
  try {
    validatePaymentRequired(paymentRequired);
    validateActiveUpfrontRequirement(requirements);
  } catch {
    fail();
  }
  if (requirements.network !== EXPERIMENTAL_LIVE_NETWORK ||
      !sameJson(requirements.extra.zenonChain, OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE)) fail();
  const expectedIntent = paymentIntentDigest(paymentRequired, requirements);
  if (content.payment.intentDigest !== expectedIntent) fail();

  const paymentPayload = {
    x402Version: paymentRequired.x402Version,
    resource: paymentRequired.resource,
    accepted: requirements,
    payload: {
      transaction: content.chain.accountBlock,
      intentDigest: content.payment.intentDigest,
    },
  };
  let preflight;
  try {
    validateAccountBlockJson(content.chain.accountBlock);
    preflight = await preflightZenonPayment(paymentPayload, requirements, paymentRequired);
  } catch {
    fail();
  }
  if (content.payment.authorizationKey !== preflight.authorizationKey) fail();

  const confirmation = content.chain.confirmation;
  const confirmationDetail = confirmationDetailFromCaptured(confirmation);
  if (confirmation.momentumHeight <= content.chain.accountBlock.momentumAcknowledged.height ||
      confirmation.momentumHash === content.chain.accountBlock.momentumAcknowledged.hash) fail();

  const journal = content.journal;
  const record = journal.record;
  if (journal.sourceRevision < MIN_FINAL_JOURNAL_REVISION ||
      record.evidenceState !== 'MOMENTUM_INCLUDED' || record.deliveryState !== 'DELIVERED' ||
      record.authorizationKey !== preflight.authorizationKey ||
      record.transactionHash !== preflight.transactionHash ||
      record.intentDigest !== preflight.intentDigest || record.resourceDigest !== preflight.resourceDigest ||
      record.payer !== preflight.payer || !sameJson(record.chainProfile, preflight.chainProfile) ||
      !sameJson(record.resourceIdentity, paymentRequired.resource) ||
      !sameJson(record.signedAccountBlock, content.chain.accountBlock) ||
      record.momentumEvidence.observedAt !== confirmation.observedAt ||
      !sameJson(record.momentumEvidence.confirmationDetail, confirmationDetail) ||
      record.updatedAt < record.createdAt || record.momentumEvidence.observedAt < record.createdAt) fail();
  if (sha256Hex(record.resourceIdentity) !== record.resourceDigest) fail();

  const expectedBody = expectedDefaultBody(record, requirements, preflight);
  const expectedBodyText = JSON_STRINGIFY(expectedBody, null, 2);
  if (BUFFER_BYTE_LENGTH(expectedBodyText, 'utf8') > PROTECTED_BODY_MAX_BYTES ||
      content.http.final.bodyText !== expectedBodyText ||
      record.cachedResponse.status !== 200 ||
      record.cachedResponse.headers['content-type'] !== 'application/json; charset=utf-8' ||
      !sameJson(record.cachedResponse.body, expectedBody)) fail();

  const response = content.http.final.paymentResponse;
  if (response.network !== requirements.network || response.transaction !== preflight.transactionHash ||
      response.payer !== preflight.payer || response.state !== 'MOMENTUM_INCLUDED' ||
      content.http.final.contentType !== 'application/json; charset=utf-8' ||
      content.http.final.cacheControl !== 'private, no-store, max-age=0' ||
      content.http.final.vary !== 'PAYMENT-SIGNATURE') fail();

  const timingEvents = validateTimingSemantics(content.timing);
  if (!sameJson(content.timing.work, deriveWork(content.chain.accountBlock))) fail();

  const challengeStarted = timingEvents.get('runner:challenge_request_started');
  const challengeReceived = timingEvents.get('runner:challenge_402_received');
  const paidResponse = timingEvents.get('runner:paid_response_received');
  const publicationStarted = timingEvents.get('facilitator:publication_started');
  const inclusionObserved = timingEvents.get('facilitator:momentum_inclusion_observed');
  const deliveryStarted = timingEvents.get('facilitator:delivery_started');
  const deliveryFinished = timingEvents.get('facilitator:delivery_finished');
  if (challengeReceived.utc !== content.http.initial.observedAt ||
      paidResponse.utc !== content.http.final.observedAt ||
      inclusionObserved.utc !== content.chain.confirmation.observedAt ||
      inclusionObserved.utc !== record.momentumEvidence.observedAt ||
      Date.parse(challengeStarted.utc) > Date.parse(challengeReceived.utc) ||
      Date.parse(record.createdAt) > Date.parse(publicationStarted.utc) ||
      Date.parse(publicationStarted.utc) > Date.parse(inclusionObserved.utc) ||
      Date.parse(inclusionObserved.utc) > Date.parse(record.updatedAt) ||
      Date.parse(deliveryStarted.utc) > Date.parse(expectedBody.generatedAt) ||
      Date.parse(expectedBody.generatedAt) > Date.parse(record.updatedAt) ||
      Date.parse(record.updatedAt) > Date.parse(deliveryFinished.utc) ||
      Date.parse(deliveryFinished.utc) > Date.parse(paidResponse.utc)) fail();
}

function sectionDigests(content) {
  const digests = {};
  for (let index = 0; index < SECTION_NAMES.length; index += 1) {
    const name = SECTION_NAMES[index];
    const encoded = canonicalEncodeSnapshot(content[name]);
    ownData(digests, name, sha256Bytes(`${SECTION_PREFIX}${name}\0`, encoded));
  }
  return digests;
}

function createIntegrity(content) {
  const digests = sectionDigests(content);
  const target = {
    evidenceVersion: LIVE_EVIDENCE_VERSION,
    source: content.source,
    trust: content.trust,
    payment: content.payment,
    chain: content.chain,
    http: content.http,
    journal: content.journal,
    timing: content.timing,
    nonClaims: content.nonClaims,
    integrity: {
      algorithm: INTEGRITY_ALGORITHM,
      sectionDigests: digests,
    },
  };
  return {
    algorithm: INTEGRITY_ALGORITHM,
    sectionDigests: digests,
    bundleDigest: sha256Bytes(BUNDLE_PREFIX, canonicalEncodeSnapshot(target)),
  };
}

function validateIntegritySemantics(bundle) {
  const content = {
    source: bundle.source,
    trust: bundle.trust,
    payment: bundle.payment,
    chain: bundle.chain,
    http: bundle.http,
    journal: bundle.journal,
    timing: bundle.timing,
    nonClaims: bundle.nonClaims,
  };
  const expected = createIntegrity(content);
  if (!sameJson(bundle.integrity, expected)) fail();
}

function contentFromFragments(fragments) {
  return {
    source: fragments.manifest.source,
    trust: fragments.manifest.trust,
    payment: fragments.manifest.payment,
    chain: fragments.chain.chain,
    http: fragments.http.http,
    journal: fragments.journal.journal,
    timing: {
      events: fragments.timing.timing.events,
      durationsMs: fragments.timing.timing.durationsMs,
      work: deriveWork(fragments.chain.chain.accountBlock),
    },
    nonClaims: fragments.manifest.nonClaims,
  };
}

async function verifySnapshot(bundle) {
  validateBundleShape(bundle);
  validateIntegritySemantics(bundle);
  await validateContentSemantics(bundle);
}

export function createLiveEvidenceTemplate() {
  return deepFreeze({
    templateVersion: 1,
    requiredFragments: {
      manifest: null,
      chain: null,
      http: null,
      journal: null,
      timing: null,
    },
  });
}

export function parseLiveEvidenceBundle(jsonText) {
  try {
    const parsed = parseStrictJson(jsonText, FINAL_MAX_BYTES);
    const snapshot = descriptorSafeSnapshot(parsed, FINAL_MAX_BYTES);
    validateBundleShape(snapshot);
    return deepFreeze(snapshot);
  } catch {
    fail();
  }
}

export async function assembleLiveEvidenceBundle(options) {
  try {
    const outer = descriptorSafeSnapshot(options, FINAL_MAX_BYTES);
    exactObject(outer, ['manifest', 'chain', 'http', 'journal', 'timing']);
    const fragments = {};
    const names = ['manifest', 'chain', 'http', 'journal', 'timing'];
    for (let index = 0; index < names.length; index += 1) {
      const name = names[index];
      const captured = canonicalSnapshot(outer[name], FRAGMENT_LIMITS[name]).snapshot;
      validateFragmentShape(captured, name);
      ownData(fragments, name, captured);
    }
    const content = contentFromFragments(fragments);
    await validateContentSemantics(content);
    const bundle = {
      evidenceVersion: LIVE_EVIDENCE_VERSION,
      source: content.source,
      trust: content.trust,
      payment: content.payment,
      chain: content.chain,
      http: content.http,
      journal: content.journal,
      timing: content.timing,
      nonClaims: content.nonClaims,
      integrity: createIntegrity(content),
    };
    const snapshot = canonicalSnapshot(bundle, FINAL_MAX_BYTES).snapshot;
    await verifySnapshot(snapshot);
    return deepFreeze(snapshot);
  } catch {
    fail();
  }
}

export async function verifyLiveEvidenceBundle(bundle) {
  try {
    const snapshot = canonicalSnapshot(bundle, FINAL_MAX_BYTES).snapshot;
    await verifySnapshot(snapshot);
    return deepFreeze({ valid: true, evidenceVersion: LIVE_EVIDENCE_VERSION });
  } catch {
    fail();
  }
}

export async function serializeLiveEvidenceBundle(bundle) {
  try {
    const { snapshot } = canonicalSnapshot(bundle, FINAL_MAX_BYTES);
    await verifySnapshot(snapshot);
    const encoded = canonicalEncodeSnapshot(snapshot);
    if (BUFFER_BYTE_LENGTH(encoded, 'utf8') + 1 > FINAL_MAX_BYTES) fail();
    return `${encoded}\n`;
  } catch {
    fail();
  }
}

export function parseLiveEvidenceFragment(jsonText, expectedType) {
  try {
    if (!HAS_OWN(FRAGMENT_LIMITS, expectedType)) fail();
    const parsed = parseStrictJson(jsonText, FRAGMENT_LIMITS[expectedType]);
    const snapshot = canonicalSnapshot(parsed, FRAGMENT_LIMITS[expectedType]).snapshot;
    validateFragmentShape(snapshot, expectedType);
    return deepFreeze(snapshot);
  } catch {
    fail();
  }
}

export function serializeLiveEvidenceTemplate(template = createLiveEvidenceTemplate()) {
  try {
    const snapshot = descriptorSafeSnapshot(template, 4096);
    exactObject(snapshot, ['templateVersion', 'requiredFragments']);
    if (snapshot.templateVersion !== 1) fail();
    exactObject(snapshot.requiredFragments, ['manifest', 'chain', 'http', 'journal', 'timing']);
    const names = ['manifest', 'chain', 'http', 'journal', 'timing'];
    for (let index = 0; index < names.length; index += 1) {
      if (snapshot.requiredFragments[names[index]] !== null) fail();
    }
    return `${canonicalEncodeSnapshot(snapshot)}\n`;
  } catch {
    fail();
  }
}
