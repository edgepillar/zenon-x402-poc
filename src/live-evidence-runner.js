import { randomBytes } from 'node:crypto';
import { lookup as lookupDns } from 'node:dns/promises';
import { constants as fsConstants } from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
} from 'node:fs/promises';
import { isIP } from 'node:net';
import { BlockList } from 'node:net';
import { Agent as HttpsAgent, request as requestHttps } from 'node:https';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { types as utilTypes } from 'node:util';

import { paidFetch, reconcilePayment } from './buyer.js';
import { canonicalJson, paymentIntentDigest, sha256Hex } from './canonical.js';
import { validateGateBQuickTunnelStableBinding } from './gate-b-quick-tunnel-artifact.js';
import {
  GATE_B_CURRENT_TESTNET_WSS_ENDPOINT,
  GATE_B_PUBLIC_WS_INPUT_LEAVES,
  GATE_B_PUBLIC_WS_INPUT_LIMITS,
  parseGateBQuickTunnelHostnameSource,
} from './gate-b-public-ws-inputs-schema.js';
import {
  assembleLiveEvidenceBundle,
  parseLiveEvidenceBundle,
  parseLiveEvidenceFragment,
  serializeLiveEvidenceBundle,
  verifyLiveEvidenceBundle,
} from './live-evidence.js';
import {
  createLiveEvidenceObserver,
  finalizeLiveEvidenceTimeline,
  recordLiveEvidencePhase,
} from './live-observation.js';
import { attestPublicWsOnceSourceTree } from './public-ws-source-attestation.js';
import {
  DELIVERY_STATES,
  EVIDENCE_STATES,
  SettlementJournal,
} from './settlement-journal.js';
import {
  createPaymentCapabilities,
  decodeB64Json,
  EXPERIMENTAL_LIVE_NETWORK,
  HEADERS,
  MAX_SETTLEMENT_TIMEOUT_SECONDS,
  MAX_X402_HEADER_ENCODED_BYTES,
  sameRequirements,
  sameResource,
  validateActiveUpfrontRequirement,
  validatePaymentPayloadEnvelope,
  validatePaymentRequired,
} from './x402-wire.js';
import {
  ExactZenonClient,
  preflightZenonPayment,
  probeZenonRoleReadiness,
  validateAccountBlockJson,
} from './zenon-payment.js';
import {
  GATE_B_CURRENT_TESTNET_CHAIN_PROFILE,
  GATE_B_CURRENT_TESTNET_NON_CLAIMS,
  GATE_B_CURRENT_TESTNET_OPERATOR_TRUST_ACKNOWLEDGEMENT,
  GATE_B_CURRENT_TESTNET_PROFILE_NAME,
  GATE_B_CURRENT_TESTNET_PROVENANCE,
  GATE_B_CURRENT_TESTNET_SDK_NETWORK_ID,
  OPERATOR_TRUST_ACKNOWLEDGEMENT,
  OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE,
  OPERATOR_TRUSTED_PUBLIC_TESTNET_NON_CLAIMS,
  OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME,
  OPERATOR_TRUSTED_PUBLIC_TESTNET_PROVENANCE,
  observeOperatorTrustedTestnetPolicy,
  selectGateBCurrentTestnetPolicy,
  selectOperatorTrustedTestnetPolicy,
  TESTNET_LIVE_ACKNOWLEDGEMENT,
} from './zenon/operator-trusted-testnet-profile.js';

const ERROR_CODE = 'live_evidence_run_invalid';
const CONFIG_MAX_BYTES = 64 * 1024;
const ROLE_INPUT_MAX_BYTES = 64 * 1024;
const CHILD_OUTPUT_MAX_BYTES = 64 * 1024;
const MAX_DEPTH = 20;
const MAX_NODES = 8192;
const MAX_MEMBERS = 4096;
const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_DIRECTORY_MODE = 0o700;
const PUBLIC_WS_ONCE_EXECUTION_MODE = 'public-ws-once-v1';
const CURRENT_TESTNET_WSS_ONCE_EXECUTION_MODE = 'current-testnet-wss-once-v1';
const HISTORICAL_WSS_EXECUTION_MODE = 'historical-wss-v1';
const PUBLIC_WS_ONCE_MARKER_NAME = 'PUBLIC_WS_ONCE_CONSUMED';
const PUBLIC_WS_ONCE_TRANSPORT_EXCEPTION =
  'I_EXPLICITLY_ACCEPT_PUBLIC_WS_FOR_EXACTLY_ONE_GATE_B_TESTNET_PAYMENT';
const PUBLIC_WS_ONCE_PAYMENT_ACKNOWLEDGEMENT =
  'I_ACCEPT_ONE_DISPOSABLE_MINIMALLY_FUNDED_TESTNET_PAYMENT_OVER_UNENCRYPTED_UNAUTHENTICATED_PUBLIC_RPC';
const PUBLIC_WS_ONCE_PUBLICATION_ACKNOWLEDGEMENT =
  'I_UNDERSTAND_ARTIFACTS_MUST_NOT_BE_PUBLISHED_UNTIL_INDEPENDENT_VERIFICATION';
const PUBLIC_WS_ONCE_CONFIG_DIGEST_DOMAIN = 'zenon-x402-public-ws-once-config-v2';
const CURRENT_TESTNET_WSS_ONCE_PAYMENT_ACKNOWLEDGEMENT =
  'I_ACCEPT_ONE_DISPOSABLE_MINIMALLY_FUNDED_TESTNET_PAYMENT_OVER_OPERATOR_TRUSTED_WSS_RPC';
const CURRENT_TESTNET_WSS_ONCE_CONFIG_DIGEST_DOMAIN =
  'zenon-x402-current-testnet-wss-once-config-v1';
const INDEPENDENT_FINALIZER_COMMAND = 'finalize-independent-public-ws-once';
const INDEPENDENT_FINALIZER_TRANSPORT = 'https-json-rpc-v1';
const INDEPENDENT_FINALIZER_OUTPUT_NAME = 'independent-evidence-v1';
const INDEPENDENT_FINALIZER_TEST_OUTPUT_NAME =
  'independent-evidence-v1-ineligible-test-only';
const INDEPENDENT_FINALIZER_REPOSITORY = 'edgepillar/zenon-x402-poc';
const INDEPENDENT_FINALIZER_NAME =
  'zenon-x402-independent-public-ws-once-finalizer';
const INDEPENDENT_FINALIZER_REVIEW_ACCEPTANCE =
  'I_ACCEPT_THIS_SEPARATELY_ADMINISTERED_READ_ONLY_ROUTE_AS_THE_INDEPENDENT_REVIEW_AUTHORITY';
const INDEPENDENT_ENDPOINT_CONFIG_DIGEST_DOMAIN =
  'zenon-x402-independent-endpoint-config-v1';
const INDEPENDENT_CANDIDATE_BUNDLE_DIGEST_DOMAIN =
  'zenon-x402-independent-candidate-bundle-bytes-v1';
const INDEPENDENT_FRAGMENT_DIGEST_DOMAIN =
  'zenon-x402-independent-fragment-bytes-v1';
const INDEPENDENT_FRAGMENT_SET_DIGEST_DOMAIN =
  'zenon-x402-independent-five-fragment-set-v1';
const INDEPENDENT_OPERATOR_REVIEW_DIGEST_DOMAIN =
  'zenon-x402-independent-operator-review-v1';
const INDEPENDENT_ROUTE_DIGEST_DOMAIN =
  'zenon-x402-independent-pinned-route-v1';
const INDEPENDENT_ACCOUNT_BLOCK_DIGEST_DOMAIN =
  'zenon-x402-independent-account-block-v1';
const INDEPENDENT_INCLUSION_MOMENTUM_DIGEST_DOMAIN =
  'zenon-x402-independent-inclusion-momentum-v1';
const INDEPENDENT_ATTEMPT_RECORD_DIGEST_DOMAIN =
  'zenon-x402-independent-finalizer-attempt-consumed-v1';
const INDEPENDENT_FINALIZER_RPC_MAX_BYTES = 256 * 1024;
const INDEPENDENT_FINALIZER_ARTIFACT_MAX_BYTES = 512 * 1024;
const INDEPENDENT_FINALIZER_MAX_HEADERS = 4096;
const INDEPENDENT_FINALIZER_ATTEMPT = /^[0-9a-f]{64}$/;
const INDEPENDENT_FINALIZER_ATTEMPT_RECORD =
  /^\.independent-finalizer-attempt-([0-9a-f]{64})\.consumed\.json$/;
const INDEPENDENT_FINALIZER_FRAGMENT_NAMES = Object.freeze([
  'manifest', 'chain', 'http', 'journal', 'timing',
]);
const INDEPENDENT_FINALIZER_RETAINED_INPUT_INDEX = Object.freeze({
  consumedMarker: 7,
  submissionMarker: 8,
  pendingMarker: 9,
  metadata: 10,
  journalMarker: 11,
  journal: 12,
});
const INDEPENDENT_FINALIZER_TRANSCRIPT = Object.freeze([
  'stats.networkInfo',
  'stats.syncInfo',
  'ledger.getFrontierMomentum',
  'ledger.getMomentumsByHeight',
  'ledger.getAccountBlockByHash',
  'ledger.getMomentumByHash',
  'ledger.getFrontierMomentum',
]);
const MAX_RECOVERY_ATTEMPTS = 8;
const MAX_RPC_TIMEOUT_MS = 60_000;
const PAID_RESPONSE_RPC_GRACE_MULTIPLIER = 2;
const MAX_PAID_RESPONSE_TIMEOUT_MS =
  MAX_SETTLEMENT_TIMEOUT_SECONDS * 1000 +
  PAID_RESPONSE_RPC_GRACE_MULTIPLIER * MAX_RPC_TIMEOUT_MS;
const MAX_RECOVERY_DELAY_MS = 60_000;
const MAX_RECOVERY_ELAPSED_MS = 5 * 60_000;
const RUN_NAME = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const REVISION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const LOWERCASE_HASH_64 = /^[0-9a-f]{64}$/;
const DECIMAL = /^(?:0|[1-9]\d*)$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ARRAY_IS_ARRAY = Array.isArray;
const BUFFER_BYTE_LENGTH = Buffer.byteLength;
const DEFINE_PROPERTY = Object.defineProperty;
const FREEZE = Object.freeze;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_OWN_PROPERTY_DESCRIPTORS = Object.getOwnPropertyDescriptors;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const IS_PROMISE = utilTypes.isPromise;
const PROMISE_PROTOTYPE = Promise.prototype;
const JSON_PARSE = JSON.parse;
const JSON_STRINGIFY = JSON.stringify;
const OBJECT_IS = Object.is;
const OBJECT_KEYS = Object.keys;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const PUBLIC_ADDRESS_BLOCKLIST = new BlockList();
const SIGNED_PAYMENT_TRANSPORT_BINDING_STATES = new WeakMap();
const WEAK_MAP_GET = WeakMap.prototype.get;
const WEAK_MAP_SET = WeakMap.prototype.set;

for (const [network, prefix, family] of [
  ['0.0.0.0', 8, 'ipv4'], ['10.0.0.0', 8, 'ipv4'], ['100.64.0.0', 10, 'ipv4'],
  ['127.0.0.0', 8, 'ipv4'], ['169.254.0.0', 16, 'ipv4'], ['172.16.0.0', 12, 'ipv4'],
  ['192.0.0.0', 24, 'ipv4'], ['192.0.2.0', 24, 'ipv4'], ['192.168.0.0', 16, 'ipv4'],
  ['198.18.0.0', 15, 'ipv4'], ['198.51.100.0', 24, 'ipv4'], ['203.0.113.0', 24, 'ipv4'],
  ['224.0.0.0', 4, 'ipv4'], ['240.0.0.0', 4, 'ipv4'],
  ['::', 128, 'ipv6'], ['::1', 128, 'ipv6'],
  ['64:ff9b::', 96, 'ipv6'], ['64:ff9b:1::', 48, 'ipv6'],
  ['100::', 64, 'ipv6'], ['2001::', 23, 'ipv6'], ['2001:db8::', 32, 'ipv6'],
  ['2002::', 16, 'ipv6'], ['fc00::', 7, 'ipv6'], ['fec0::', 10, 'ipv6'],
  ['fe80::', 10, 'ipv6'], ['ff00::', 8, 'ipv6'],
]) {
  PUBLIC_ADDRESS_BLOCKLIST.addSubnet(network, prefix, family);
}

const RUNNER_CAPABILITIES = createPaymentCapabilities([{
  scheme: 'exact',
  network: EXPERIMENTAL_LIVE_NETWORK,
  paymentFlows: ['upfront'],
}]);

const NON_CLAIM_FIELDS = FREEZE([
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

const PUBLIC_WS_ONCE_RECORD_FIELDS = FREEZE([
  'authorizationKey', 'transactionHash', 'chainProfile', 'intentDigest',
  'resourceIdentity', 'resourceDigest', 'payer', 'signedAccountBlock',
  'evidenceState', 'momentumEvidence', 'deliveryState', 'cachedResponse',
  'createdAt', 'updatedAt',
]);

const DURATION_BINDINGS = FREEZE({
  challenge: FREEZE(['runner', 'challenge_request_started', 'challenge_402_received']),
  total: FREEZE(['runner', 'challenge_402_received', 'paid_response_received']),
  buyerOwnerWait: FREEZE(['buyer', 'buyer_owner_wait_started', 'buyer_owner_acquired']),
  buyerOwnerHeld: FREEZE(['buyer', 'buyer_owner_acquired', 'buyer_owner_released']),
  buyerReadiness: FREEZE(['buyer', 'buyer_readiness_started', 'buyer_readiness_finished']),
  prepareBlock: FREEZE(['buyer', 'prepare_block_started', 'prepare_block_finished']),
  facilitatorOwnerWait: FREEZE(['facilitator', 'facilitator_owner_wait_started', 'facilitator_owner_acquired']),
  facilitatorOwnerHeld: FREEZE(['facilitator', 'facilitator_owner_acquired', 'facilitator_owner_released']),
  facilitatorReadiness: FREEZE(['facilitator', 'facilitator_readiness_started', 'facilitator_readiness_finished']),
  publication: FREEZE(['facilitator', 'publication_started', 'publication_acknowledged']),
  inclusionWait: FREEZE(['facilitator', 'inclusion_wait_started', 'momentum_inclusion_observed']),
  delivery: FREEZE(['facilitator', 'delivery_started', 'delivery_finished']),
});

const REQUIRED_PHASES = FREEZE({
  runner: FREEZE([
    'challenge_request_started', 'challenge_402_received', 'paid_response_received',
  ]),
  buyer: FREEZE([
    'buyer_owner_wait_started', 'buyer_owner_acquired', 'buyer_readiness_started',
    'buyer_readiness_finished', 'prepare_block_started', 'prepare_block_finished',
    'buyer_owner_released',
  ]),
  facilitator: FREEZE([
    'facilitator_owner_wait_started', 'facilitator_owner_acquired',
    'facilitator_readiness_started', 'facilitator_readiness_finished',
    'publication_started', 'publication_acknowledged', 'inclusion_wait_started',
    'momentum_inclusion_observed', 'facilitator_owner_released', 'delivery_started',
    'delivery_finished',
  ]),
});

export class LiveEvidenceRunError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'LiveEvidenceRunError';
    this.code = ERROR_CODE;
    this.stack = `LiveEvidenceRunError: ${ERROR_CODE}`;
  }
}

function fail() {
  throw new LiveEvidenceRunError();
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

function parseStrictJson(text, maximumBytes) {
  try {
    if (typeof text !== 'string' || BUFFER_BYTE_LENGTH(text, 'utf8') > maximumBytes ||
        hasUnpairedSurrogate(text)) fail();
    let cursor = 0;
    let nodes = 0;
    let members = 0;

    function whitespace() {
      while (cursor < text.length && (text[cursor] === ' ' || text[cursor] === '\n' ||
          text[cursor] === '\r' || text[cursor] === '\t')) cursor += 1;
    }

    function string() {
      const start = cursor;
      if (text[cursor] !== '"') fail();
      cursor += 1;
      while (cursor < text.length) {
        const code = text.charCodeAt(cursor);
        if (code === 0x22) {
          cursor += 1;
          const value = JSON_PARSE(text.slice(start, cursor));
          if (typeof value !== 'string' || hasUnpairedSurrogate(value)) fail();
          return value;
        }
        if (code < 0x20) fail();
        if (code === 0x5c) {
          cursor += 1;
          if (cursor >= text.length) fail();
          if (text[cursor] === 'u') {
            if (!/^[0-9a-fA-F]{4}$/.test(text.slice(cursor + 1, cursor + 5))) fail();
            cursor += 5;
            continue;
          }
          if (!'"\\/bfnrt'.includes(text[cursor])) fail();
        }
        cursor += 1;
      }
      fail();
    }

    function number() {
      const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(cursor));
      if (!match) fail();
      cursor += match[0].length;
      const value = Number(match[0]);
      if (!Number.isFinite(value) || !Number.isSafeInteger(value) || OBJECT_IS(value, -0)) fail();
      return value;
    }

    function value(depth) {
      if (depth > MAX_DEPTH || nodes >= MAX_NODES) fail();
      nodes += 1;
      whitespace();
      const token = text[cursor];
      if (token === '"') return string();
      if (token === '{') {
        cursor += 1;
        const output = {};
        const seen = new Set();
        whitespace();
        if (text[cursor] === '}') {
          cursor += 1;
          return output;
        }
        while (cursor < text.length) {
          whitespace();
          const key = string();
          if (seen.has(key) || members >= MAX_MEMBERS) fail();
          seen.add(key);
          members += 1;
          whitespace();
          if (text[cursor] !== ':') fail();
          cursor += 1;
          ownData(output, key, value(depth + 1));
          whitespace();
          if (text[cursor] === '}') {
            cursor += 1;
            return output;
          }
          if (text[cursor] !== ',') fail();
          cursor += 1;
        }
        fail();
      }
      if (token === '[') {
        cursor += 1;
        const output = [];
        whitespace();
        if (text[cursor] === ']') {
          cursor += 1;
          return output;
        }
        while (cursor < text.length) {
          if (members >= MAX_MEMBERS) fail();
          members += 1;
          append(output, value(depth + 1));
          whitespace();
          if (text[cursor] === ']') {
            cursor += 1;
            return output;
          }
          if (text[cursor] !== ',') fail();
          cursor += 1;
        }
        fail();
      }
      if (text.startsWith('true', cursor)) {
        cursor += 4;
        return true;
      }
      if (text.startsWith('false', cursor)) {
        cursor += 5;
        return false;
      }
      if (text.startsWith('null', cursor)) {
        cursor += 4;
        return null;
      }
      return number();
    }

    const parsed = value(0);
    whitespace();
    if (cursor !== text.length) fail();
    return parsed;
  } catch {
    fail();
  }
}

function exactObject(value, fields) {
  if (!value || typeof value !== 'object' || IS_PROXY(value) || ARRAY_IS_ARRAY(value) ||
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
  const allowed = new Set(fields);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = descriptors[key];
    if (typeof key !== 'string' || !allowed.has(key) || !descriptor ||
        !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) fail();
  }
  for (let index = 0; index < fields.length; index += 1) {
    if (!HAS_OWN(descriptors, fields[index])) fail();
  }
  return value;
}

function stringValue(value, maximumBytes = 4096) {
  if (typeof value !== 'string' || value.length === 0 ||
      BUFFER_BYTE_LENGTH(value, 'utf8') > maximumBytes || CONTROL.test(value) ||
      hasUnpairedSurrogate(value)) fail();
  return value;
}

function integer(value, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail();
  return value;
}

function canonicalUtc(value) {
  if (typeof value !== 'string' || !UTC_TIMESTAMP.test(value)) return false;
  const numeric = Date.parse(value);
  return Number.isFinite(numeric) && new Date(numeric).toISOString() === value;
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

function exactPublicHttpsPaidUrl(value) {
  stringValue(value, 4096);
  if (value.includes('?') || value.includes('#')) fail();
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail();
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
      parsed.search || parsed.hash || parsed.pathname !== '/paid' ||
      parsed.port !== '' || parsed.href !== value || !parsed.hostname ||
      isIP(parsed.hostname) !== 0 || parsed.hostname !== parsed.hostname.toLowerCase() ||
      parsed.hostname.length > 253) fail();
  const labels = parsed.hostname.split('.');
  if (labels.length < 2) fail();
  for (let index = 0; index < labels.length; index += 1) {
    if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)$/.test(labels[index])) fail();
  }
  const suffix = labels[labels.length - 1];
  if (suffix === 'localhost' || suffix === 'local' || suffix === 'internal' ||
      suffix === 'invalid' || suffix === 'test' || suffix === 'example' ||
      suffix === 'onion' || suffix === 'arpa') fail();
  const registrable = labels.slice(-2).join('.');
  if (registrable === 'example.com' || registrable === 'example.net' ||
      registrable === 'example.org') fail();
  return value;
}

function boundedPromise(promise, timeoutMs) {
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => rejectPromise(new LiveEvidenceRunError()), timeoutMs);
    Promise.resolve(promise).then(
      value => {
        clearTimeout(timer);
        resolvePromise(value);
      },
      () => {
        clearTimeout(timer);
        rejectPromise(new LiveEvidenceRunError());
      },
    );
  });
}

function publicAddress(address, family) {
  if (typeof address !== 'string' || (family !== 4 && family !== 6) ||
      isIP(address) !== family) return false;
  if (family === 6 && /^::ffff:/i.test(address)) return false;
  return !PUBLIC_ADDRESS_BLOCKLIST.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

async function resolvePublicTarget(resourceUrl, timeoutMs, resolver) {
  const parsed = new URL(exactPublicHttpsPaidUrl(resourceUrl));
  let resolved;
  try {
    resolved = await boundedPromise(
      resolver(parsed.hostname, { all: true, verbatim: true }),
      timeoutMs,
    );
  } catch {
    fail();
  }
  if (IS_PROXY(resolved) || !ARRAY_IS_ARRAY(resolved) || resolved.length === 0 ||
      resolved.length > 16) fail();
  const addresses = [];
  for (let index = 0; index < resolved.length; index += 1) {
    const descriptors = exactObject(resolved[index], ['address', 'family']);
    const address = descriptors.address;
    const family = descriptors.family;
    if (!publicAddress(address, family)) fail();
    let duplicate = false;
    for (let prior = 0; prior < addresses.length; prior += 1) {
      if (addresses[prior].address === address && addresses[prior].family === family) duplicate = true;
    }
    if (!duplicate) append(addresses, FREEZE({ address, family }));
  }
  if (addresses.length === 0) fail();
  return FREEZE({ hostname: parsed.hostname, addresses: FREEZE(addresses) });
}

function pinnedLookup(target) {
  return (hostname, options, callback) => {
    try {
      if (hostname !== target.hostname || typeof callback !== 'function') fail();
      const wantsAll = options && typeof options === 'object' && options.all === true;
      if (wantsAll) {
        callback(null, target.addresses.map(item => ({
          address: item.address,
          family: item.family,
        })));
      } else {
        callback(null, target.addresses[0].address, target.addresses[0].family);
      }
    } catch {
      callback(new LiveEvidenceRunError());
    }
  };
}

function responseFromBytes(url, status, headers, bytes) {
  const response = new Response(bytes, { status, headers });
  DEFINE_PROPERTY(response, 'url', {
    value: url,
    enumerable: true,
    configurable: false,
    writable: false,
  });
  DEFINE_PROPERTY(response, 'redirected', {
    value: false,
    enumerable: true,
    configurable: false,
    writable: false,
  });
  return response;
}

function httpsFetchWithPinnedTarget(url, options, target, timeoutMs, requester) {
  return new Promise((resolvePromise, rejectPromise) => {
    let parsed;
    try {
      parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.hostname !== target.hostname ||
          parsed.username || parsed.password || parsed.search || parsed.hash ||
          (parsed.pathname !== '/paid' && parsed.pathname !== '/health')) fail();
    } catch {
      rejectPromise(new LiveEvidenceRunError());
      return;
    }
    const method = options?.method === undefined ? 'GET' : options.method;
    if (typeof method !== 'string' || method !== 'GET') {
      rejectPromise(new LiveEvidenceRunError());
      return;
    }
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) rejectPromise(new LiveEvidenceRunError());
      else resolvePromise(value);
    };
    const timer = setTimeout(() => {
      try { request.destroy(); } catch {}
      finish(new LiveEvidenceRunError());
    }, timeoutMs);
    let request;
    try {
      request = requester(parsed, {
        method,
        headers: options?.headers,
        agent: false,
        lookup: pinnedLookup(target),
        maxHeaderSize: 16 * 1024,
      }, response => {
        const chunks = [];
        let total = 0;
        response.on('data', chunk => {
          total += Buffer.byteLength(chunk);
          if (total > 128 * 1024) {
            try { request.destroy(); } catch {}
            finish(new LiveEvidenceRunError());
            return;
          }
          append(chunks, Buffer.from(chunk));
        });
        response.on('end', () => {
          if (settled || !Number.isInteger(response.statusCode)) return;
          try {
            finish(null, responseFromBytes(
              url,
              response.statusCode,
              response.headers,
              Buffer.concat(chunks, total),
            ));
          } catch {
            finish(new LiveEvidenceRunError());
          }
        });
        response.on('error', () => finish(new LiveEvidenceRunError()));
      });
      request.on('error', () => finish(new LiveEvidenceRunError()));
      request.end();
    } catch {
      finish(new LiveEvidenceRunError());
    }
  });
}

export function computeLiveEvidencePaidResponseTimeoutMs(acceptedRequirement, rpcTimeoutMs) {
  try {
    validateActiveUpfrontRequirement(acceptedRequirement);
    integer(rpcTimeoutMs, 1, MAX_RPC_TIMEOUT_MS);
    const inclusionWindowMs = acceptedRequirement.maxTimeoutSeconds * 1000;
    const rpcGraceMs = rpcTimeoutMs * PAID_RESPONSE_RPC_GRACE_MULTIPLIER;
    const timeoutMs = inclusionWindowMs + rpcGraceMs;
    if (!Number.isSafeInteger(inclusionWindowMs) ||
        !Number.isSafeInteger(rpcGraceMs) ||
        !Number.isSafeInteger(timeoutMs) ||
        timeoutMs <= inclusionWindowMs ||
        timeoutMs > MAX_PAID_RESPONSE_TIMEOUT_MS) fail();
    return timeoutMs;
  } catch {
    fail();
  }
}

function signedPaymentHeader(options) {
  try {
    exactObject(options, ['redirect', 'headers']);
    if (options.redirect !== 'manual') fail();
    exactObject(options.headers, [HEADERS.PAYMENT_SIGNATURE]);
    return stringValue(
      options.headers[HEADERS.PAYMENT_SIGNATURE],
      MAX_X402_HEADER_ENCODED_BYTES,
    );
  } catch {
    fail();
  }
}

export function createLiveEvidenceSignedPaymentTransportBinding(
  paymentRequired,
  acceptedRequirement,
  rpcTimeoutMs,
  paidResponseTimeoutMs,
) {
  try {
    validatePaymentRequired(paymentRequired);
    validateActiveUpfrontRequirement(acceptedRequirement);
    if (!Object.isFrozen(paymentRequired) ||
        !Object.isFrozen(paymentRequired.resource) ||
        !Object.isFrozen(paymentRequired.accepts) ||
        !Object.isFrozen(acceptedRequirement) ||
        !Object.isFrozen(acceptedRequirement.extra) ||
        !Object.isFrozen(acceptedRequirement.extra.zenonChain) ||
        (HAS_OWN(paymentRequired, 'extensions') &&
          !Object.isFrozen(paymentRequired.extensions)) ||
        (HAS_OWN(paymentRequired.resource, 'tags') &&
          !Object.isFrozen(paymentRequired.resource.tags)) ||
        paymentRequired.accepts.length !== 1 ||
        paymentRequired.accepts[0] !== acceptedRequirement ||
        !sameRequirements(paymentRequired.accepts[0], acceptedRequirement) ||
        paymentRequired.resource.url === undefined) fail();
    const canonicalTimeoutMs = computeLiveEvidencePaidResponseTimeoutMs(
      acceptedRequirement,
      rpcTimeoutMs,
    );
    integer(paidResponseTimeoutMs, 1, MAX_PAID_RESPONSE_TIMEOUT_MS);
    if (paidResponseTimeoutMs !== canonicalTimeoutMs) fail();
    const binding = FREEZE({});
    const state = {
      acceptedRequirement,
      encodedPayment: undefined,
      paidResponseTimeoutMs,
      paymentRequired,
      resourceUrl: paymentRequired.resource.url,
      rpcTimeoutMs,
      state: 'UNUSED',
    };
    Reflect.apply(WEAK_MAP_SET, SIGNED_PAYMENT_TRANSPORT_BINDING_STATES, [binding, state]);
    return binding;
  } catch {
    fail();
  }
}

function signedPaymentTransportBindingState(binding, resourceUrl, baseTimeoutMs) {
  try {
    const state = Reflect.apply(
      WEAK_MAP_GET,
      SIGNED_PAYMENT_TRANSPORT_BINDING_STATES,
      [binding],
    );
    if (!state || !Object.isFrozen(binding) || REFLECT_OWN_KEYS(binding).length !== 0 ||
        state.resourceUrl !== resourceUrl || state.rpcTimeoutMs !== baseTimeoutMs ||
        state.paidResponseTimeoutMs <= baseTimeoutMs) fail();
    return state;
  } catch {
    fail();
  }
}

function validateSignedPaymentForTransport(encodedPayment, state) {
  try {
    const paymentPayload = decodeB64Json(encodedPayment, {
      maxDecodedBytes: MAX_X402_HEADER_ENCODED_BYTES,
      maxEncodedBytes: MAX_X402_HEADER_ENCODED_BYTES,
    });
    validatePaymentPayloadEnvelope(paymentPayload);
    validateAccountBlockJson(paymentPayload.payload.transaction);
    if (paymentPayload.x402Version !== state.paymentRequired.x402Version ||
        !sameRequirements(paymentPayload.accepted, state.acceptedRequirement) ||
        !sameResource(paymentPayload.resource, state.paymentRequired.resource) ||
        paymentPayload.payload.intentDigest !== paymentIntentDigest(
          state.paymentRequired,
          state.acceptedRequirement,
        ) ||
        !LOWERCASE_HASH_64.test(paymentPayload.payload.transaction.hash)) fail();
    return paymentPayload;
  } catch {
    fail();
  }
}

export async function createLiveEvidencePublicTransport(options) {
  try {
    const descriptors = exactObject(options, [
      'resourceUrl', 'timeoutMs', 'resolveAddresses', 'requestHttps',
    ]);
    const resourceUrl = exactPublicHttpsPaidUrl(descriptors.resourceUrl);
    const timeoutMs = integer(descriptors.timeoutMs, 1, MAX_RPC_TIMEOUT_MS);
    const resolver = descriptors.resolveAddresses ?? lookupDns;
    const requester = descriptors.requestHttps ?? requestHttps;
    if (typeof resolver !== 'function' || typeof requester !== 'function') fail();
    const target = await resolvePublicTarget(resourceUrl, timeoutMs, resolver);
    const healthUrl = `${resourceUrl.slice(0, -'/paid'.length)}/health`;
    return FREEZE({
      healthUrl,
      fetch(url, fetchOptions = undefined) {
        return httpsFetchWithPinnedTarget(
          url,
          fetchOptions,
          target,
          timeoutMs,
          requester,
        );
      },
      async fetchSignedPayment(url, fetchOptions, suppliedBinding) {
        let state;
        let requestOptions;
        try {
          if (url !== resourceUrl) fail();
          const encodedPayment = signedPaymentHeader(fetchOptions);
          requestOptions = FREEZE({
            redirect: 'manual',
            headers: FREEZE({ [HEADERS.PAYMENT_SIGNATURE]: encodedPayment }),
          });
          state = signedPaymentTransportBindingState(
            suppliedBinding,
            resourceUrl,
            timeoutMs,
          );
          if (state.state === 'BOUND') {
            if (encodedPayment !== state.encodedPayment) fail();
          } else {
            if (state.state === 'VALIDATING') {
              state.state = 'POISONED';
              fail();
            }
            if (state.state !== 'UNUSED') fail();
            const paymentPayload = validateSignedPaymentForTransport(encodedPayment, state);
            state.state = 'VALIDATING';
            try {
              await preflightZenonPayment(
                paymentPayload,
                state.acceptedRequirement,
                state.paymentRequired,
              );
            } catch {
              state.state = 'POISONED';
              fail();
            }
            if (state.state !== 'VALIDATING') {
              state.state = 'POISONED';
              fail();
            }
            state.encodedPayment = encodedPayment;
            state.state = 'BOUND';
          }
        } catch {
          fail();
        }
        return httpsFetchWithPinnedTarget(
          url,
          requestOptions,
          target,
          state.paidResponseTimeoutMs,
          requester,
        );
      },
    });
  } catch {
    fail();
  }
}

function validateExpectedPaymentRequired(
  value,
  expectedProfile = OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE,
) {
  try {
    validatePaymentRequired(value);
    if (!ARRAY_IS_ARRAY(value.accepts) || value.accepts.length !== 1) fail();
    validateActiveUpfrontRequirement(value.accepts[0]);
  } catch {
    fail();
  }
  exactPublicHttpsPaidUrl(value.resource.url);
  const accepted = value.accepts[0];
  if (HAS_OWN(accepted.extra, 'minimumMomentumConfirmations')) fail();
  if (accepted.network !== EXPERIMENTAL_LIVE_NETWORK ||
      accepted.extra.zenonChain.version !== expectedProfile.version ||
      accepted.extra.zenonChain.chainIdentifier !== expectedProfile.chainIdentifier ||
      accepted.extra.zenonChain.genesisMomentumHash !== expectedProfile.genesisMomentumHash) fail();
  return value;
}

export function parseLiveEvidenceRunConfig(jsonText) {
  try {
    const value = parseStrictJson(jsonText, CONFIG_MAX_BYTES);
    exactObject(value, [
      'runnerVersion', 'sourceRevision', 'profileName', 'acknowledgements',
      'expectedPaymentRequired', 'runtime',
    ]);
    if (value.runnerVersion !== 1 || typeof value.sourceRevision !== 'string' ||
        !REVISION.test(value.sourceRevision) ||
        value.profileName !== OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME) fail();
    exactObject(value.acknowledgements, ['live', 'operatorTrust']);
    if (value.acknowledgements.live !== TESTNET_LIVE_ACKNOWLEDGEMENT ||
        value.acknowledgements.operatorTrust !== OPERATOR_TRUST_ACKNOWLEDGEMENT) fail();
    validateExpectedPaymentRequired(value.expectedPaymentRequired);
    exactObject(value.runtime, [
      'listenPort', 'rpcTimeoutMs', 'maxRecoveryAttempts', 'recoveryDelayMs',
      'maxRecoveryElapsedMs',
    ]);
    integer(value.runtime.listenPort, 1, 65_535);
    integer(value.runtime.rpcTimeoutMs, 1, MAX_RPC_TIMEOUT_MS);
    integer(value.runtime.maxRecoveryAttempts, 0, MAX_RECOVERY_ATTEMPTS);
    integer(value.runtime.recoveryDelayMs, 0, MAX_RECOVERY_DELAY_MS);
    integer(value.runtime.maxRecoveryElapsedMs, 1, MAX_RECOVERY_ELAPSED_MS);
    return deepFreeze(value);
  } catch {
    fail();
  }
}

export function parsePublicWsOnceRunConfig(jsonText) {
  try {
    const value = parseStrictJson(jsonText, CONFIG_MAX_BYTES);
    exactObject(value, [
      'runnerVersion', 'sourceRevision', 'profileName', 'acknowledgements',
      'expectedPaymentRequired', 'quickTunnel', 'runtime',
    ]);
    if (value.runnerVersion !== 2 || typeof value.sourceRevision !== 'string' ||
        !REVISION.test(value.sourceRevision) ||
        value.profileName !== GATE_B_CURRENT_TESTNET_PROFILE_NAME) fail();
    exactObject(value.acknowledgements, ['live', 'operatorTrust']);
    if (value.acknowledgements.live !== TESTNET_LIVE_ACKNOWLEDGEMENT ||
        value.acknowledgements.operatorTrust !==
          GATE_B_CURRENT_TESTNET_OPERATOR_TRUST_ACKNOWLEDGEMENT) fail();
    if (validateGateBQuickTunnelStableBinding(value.quickTunnel) !== true) fail();
    validateExpectedPaymentRequired(
      value.expectedPaymentRequired,
      GATE_B_CURRENT_TESTNET_CHAIN_PROFILE,
    );
    exactObject(value.runtime, [
      'listenPort', 'rpcTimeoutMs', 'maxRecoveryAttempts', 'recoveryDelayMs',
      'maxRecoveryElapsedMs',
    ]);
    integer(value.runtime.listenPort, 1, 65_535);
    integer(value.runtime.rpcTimeoutMs, 1, MAX_RPC_TIMEOUT_MS);
    if (value.runtime.maxRecoveryAttempts !== 0 || value.runtime.recoveryDelayMs !== 0) fail();
    integer(value.runtime.maxRecoveryElapsedMs, 1, MAX_RECOVERY_ELAPSED_MS);
    return deepFreeze(value);
  } catch {
    fail();
  }
}

export function publicWsOnceConfigDigest(parsedConfig) {
  try {
    const validated = parsePublicWsOnceRunConfig(`${JSON_STRINGIFY(parsedConfig)}\n`);
    return sha256Hex(
      `${PUBLIC_WS_ONCE_CONFIG_DIGEST_DOMAIN}\n${canonicalJson(validated)}`,
    );
  } catch {
    fail();
  }
}

export function parseCurrentTestnetWssOnceRunConfig(jsonText) {
  try {
    const value = parseStrictJson(jsonText, CONFIG_MAX_BYTES);
    exactObject(value, [
      'runnerVersion', 'executionMode', 'rpcEndpoint', 'sourceRevision', 'profileName',
      'acknowledgements', 'expectedPaymentRequired', 'quickTunnel', 'runtime',
    ]);
    if (value.runnerVersion !== 3 ||
        value.executionMode !== CURRENT_TESTNET_WSS_ONCE_EXECUTION_MODE ||
        value.rpcEndpoint !== GATE_B_CURRENT_TESTNET_WSS_ENDPOINT ||
        typeof value.sourceRevision !== 'string' || !REVISION.test(value.sourceRevision) ||
        value.profileName !== GATE_B_CURRENT_TESTNET_PROFILE_NAME) fail();
    exactObject(value.acknowledgements, ['live', 'operatorTrust']);
    if (value.acknowledgements.live !== TESTNET_LIVE_ACKNOWLEDGEMENT ||
        value.acknowledgements.operatorTrust !==
          GATE_B_CURRENT_TESTNET_OPERATOR_TRUST_ACKNOWLEDGEMENT) fail();
    if (validateGateBQuickTunnelStableBinding(value.quickTunnel) !== true) fail();
    validateExpectedPaymentRequired(
      value.expectedPaymentRequired,
      GATE_B_CURRENT_TESTNET_CHAIN_PROFILE,
    );
    exactObject(value.runtime, [
      'listenPort', 'rpcTimeoutMs', 'maxRecoveryAttempts', 'recoveryDelayMs',
      'maxRecoveryElapsedMs',
    ]);
    integer(value.runtime.listenPort, 1, 65_535);
    integer(value.runtime.rpcTimeoutMs, 1, MAX_RPC_TIMEOUT_MS);
    if (value.runtime.maxRecoveryAttempts !== 0 || value.runtime.recoveryDelayMs !== 0) fail();
    integer(value.runtime.maxRecoveryElapsedMs, 1, MAX_RECOVERY_ELAPSED_MS);
    return deepFreeze(value);
  } catch {
    fail();
  }
}

export function currentTestnetWssOnceConfigDigest(parsedConfig) {
  try {
    const validated = parseCurrentTestnetWssOnceRunConfig(
      `${JSON_STRINGIFY(parsedConfig)}\n`,
    );
    return sha256Hex(
      `${CURRENT_TESTNET_WSS_ONCE_CONFIG_DIGEST_DOMAIN}\n${canonicalJson(validated)}`,
    );
  } catch {
    fail();
  }
}

function parseRpcSecret(value) {
  exactObject(value, ['secretVersion', 'rpcEndpoint']);
  if (value.secretVersion !== 1) fail();
  stringValue(value.rpcEndpoint, 4096);
  if (value.rpcEndpoint.includes('?') || value.rpcEndpoint.includes('#')) fail();
  let parsed;
  try {
    parsed = new URL(value.rpcEndpoint);
  } catch {
    fail();
  }
  if (parsed.protocol !== 'wss:' || parsed.username || parsed.password ||
      parsed.search || parsed.hash || !parsed.hostname || parsed.href !== value.rpcEndpoint) fail();
  return value;
}

function exactPublicWsOnceEndpoint(value) {
  stringValue(value, 4096);
  if (value.includes('%') || value.includes('?') || value.includes('#')) fail();
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail();
  }
  if (parsed.protocol !== 'ws:' || parsed.username || parsed.password ||
      parsed.search || parsed.hash || parsed.pathname !== '/' || parsed.port === '' ||
      parsed.port === '80' || parsed.href !== value || !parsed.hostname) fail();
  const unbracketed = parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']')
    ? parsed.hostname.slice(1, -1)
    : parsed.hostname;
  const family = isIP(unbracketed);
  if ((family !== 4 && family !== 6) || !publicAddress(unbracketed, family)) fail();
  const numericPort = Number(parsed.port);
  if (!Number.isSafeInteger(numericPort) || numericPort < 1 || numericPort > 65_535) fail();
  return value;
}

function parsePublicWsOnceRpcSecret(value) {
  exactObject(value, ['secretVersion', 'rpcEndpoint']);
  if (value.secretVersion !== 2) fail();
  exactPublicWsOnceEndpoint(value.rpcEndpoint);
  return value;
}

function parseCurrentTestnetWssOnceRpcSecret(value) {
  exactObject(value, ['secretVersion', 'rpcEndpoint']);
  if (value.secretVersion !== 3 ||
      value.rpcEndpoint !== GATE_B_CURRENT_TESTNET_WSS_ENDPOINT) fail();
  return value;
}

export function parseLiveRoleInput(jsonText, role) {
  try {
    const value = parseStrictJson(jsonText, ROLE_INPUT_MAX_BYTES);
    if (role === 'buyer-rpc' || role === 'facilitator-rpc') {
      parseRpcSecret(value);
    } else if (role === 'buyer-wallet') {
      exactObject(value, ['secretVersion', 'mnemonic', 'accountIndex']);
      if (value.secretVersion !== 1) fail();
      stringValue(value.mnemonic, 4096);
      integer(value.accountIndex, 0, Number.MAX_SAFE_INTEGER);
    } else {
      fail();
    }
    return deepFreeze(value);
  } catch {
    fail();
  }
}

export function parsePublicWsOnceRoleInput(jsonText, role) {
  try {
    const value = parseStrictJson(jsonText, ROLE_INPUT_MAX_BYTES);
    if (role === 'buyer-rpc' || role === 'facilitator-rpc') {
      parsePublicWsOnceRpcSecret(value);
    } else if (role === 'buyer-wallet') {
      exactObject(value, ['secretVersion', 'mnemonic', 'accountIndex']);
      if (value.secretVersion !== 1) fail();
      stringValue(value.mnemonic, 4096);
      integer(value.accountIndex, 0, Number.MAX_SAFE_INTEGER);
    } else {
      fail();
    }
    return deepFreeze(value);
  } catch {
    fail();
  }
}

export function parseCurrentTestnetWssOnceRoleInput(jsonText, role) {
  try {
    const value = parseStrictJson(jsonText, ROLE_INPUT_MAX_BYTES);
    if (role === 'buyer-rpc' || role === 'facilitator-rpc') {
      parseCurrentTestnetWssOnceRpcSecret(value);
    } else if (role === 'buyer-wallet') {
      exactObject(value, ['secretVersion', 'mnemonic', 'accountIndex']);
      if (value.secretVersion !== 1) fail();
      stringValue(value.mnemonic, 4096);
      integer(value.accountIndex, 0, Number.MAX_SAFE_INTEGER);
    } else {
      fail();
    }
    return deepFreeze(value);
  } catch {
    fail();
  }
}

export async function readLiveRoleInputFile(path, role, workspaceRoot, expectedIdentity) {
  let input;
  try {
    const root = await secureWorkspaceRoot(workspaceRoot);
    input = await openVerifiedProtectedInput(root, path, ROLE_INPUT_MAX_BYTES);
    if (expectedIdentity !== undefined &&
        !sameFileGeneration(input.generation, exactFileGeneration(expectedIdentity))) fail();
    const bytes = await readVerifiedOpenInput(input, ROLE_INPUT_MAX_BYTES);
    return parseLiveRoleInput(bytes.toString('utf8'), role);
  } catch {
    fail();
  } finally {
    await disposeVerifiedInput(input);
  }
}

function modeBits(stat) {
  return stat.mode & 0o777;
}

function currentUidMatches(stat) {
  return typeof process.getuid !== 'function' || stat.uid === process.getuid();
}

async function secureWorkspaceRoot(path) {
  if (typeof path !== 'string' || !isAbsolute(path)) fail();
  const resolvedPath = resolve(path);
  if (resolvedPath !== path) fail();
  const ancestors = [];
  let cursor = resolvedPath;
  while (cursor !== dirname(cursor)) {
    ancestors.unshift(cursor);
    cursor = dirname(cursor);
  }
  for (let index = 0; index < ancestors.length; index += 1) {
    let component;
    try {
      component = await lstat(ancestors[index]);
    } catch {
      fail();
    }
    if (component.isSymbolicLink()) fail();
  }
  let stat;
  try {
    stat = await lstat(resolvedPath);
  } catch {
    fail();
  }
  if (!stat.isDirectory() || stat.isSymbolicLink() || modeBits(stat) !== PRIVATE_DIRECTORY_MODE ||
      !currentUidMatches(stat)) fail();
  return resolvedPath;
}

async function resolvedDescendant(root, path) {
  if (typeof path !== 'string' || !isAbsolute(path)) fail();
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(path);
  if (resolvedPath !== path) fail();
  const rel = relative(resolvedRoot, resolvedPath);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail();
  const components = rel.split(sep);
  let cursor = resolvedRoot;
  for (let index = 0; index < components.length - 1; index += 1) {
    cursor = join(cursor, components[index]);
    let stat;
    try {
      stat = await lstat(cursor);
    } catch {
      fail();
    }
    if (stat.isSymbolicLink()) fail();
    if (!stat.isDirectory() || modeBits(stat) !== PRIVATE_DIRECTORY_MODE ||
        !currentUidMatches(stat)) fail();
  }
  return { resolvedRoot, resolvedPath, rel };
}

async function assertPhysicalDescendant(resolvedRoot, resolvedPath, rel) {
  let physicalRoot;
  let physicalPath;
  try {
    physicalRoot = await realpath(resolvedRoot);
    physicalPath = await realpath(resolvedPath);
  } catch {
    fail();
  }
  const physicalRelative = relative(physicalRoot, physicalPath);
  if (!physicalRelative || physicalRelative === '..' ||
      physicalRelative.startsWith(`..${sep}`) || isAbsolute(physicalRelative) ||
      physicalRelative !== rel) fail();
}

const FILE_GENERATION_FIELDS = FREEZE(['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs']);
const DIRECTORY_IDENTITY_FIELDS = FREEZE(['dev', 'ino']);

function directoryIdentityFromBigIntStat(stat) {
  try {
    const identity = {};
    for (let index = 0; index < DIRECTORY_IDENTITY_FIELDS.length; index += 1) {
      const field = DIRECTORY_IDENTITY_FIELDS[index];
      const value = stat[field];
      if (typeof value !== 'bigint' || value < 0n) fail();
      ownData(identity, field, value.toString());
    }
    return FREEZE(identity);
  } catch {
    fail();
  }
}

function sameDirectoryIdentity(left, right) {
  return DIRECTORY_IDENTITY_FIELDS.every(field => left[field] === right[field]);
}

function assertPrivateBigIntDirectoryStat(stat) {
  const uidMatches = typeof process.getuid !== 'function' || stat.uid === BigInt(process.getuid());
  if (!stat.isDirectory() || stat.isSymbolicLink() ||
      Number(stat.mode & 0o777n) !== PRIVATE_DIRECTORY_MODE || !uidMatches) fail();
}

async function capturePrivateDirectoryState(path, workspaceRoot = false) {
  let handle;
  try {
    if (workspaceRoot) await secureWorkspaceRoot(path);
    else await assertPrivateDirectory(path);
    const pathBefore = await lstat(path, { bigint: true });
    assertPrivateBigIntDirectoryStat(pathBefore);
    const noFollow = fsConstants.O_NOFOLLOW ?? 0;
    const directoryOnly = fsConstants.O_DIRECTORY ?? 0;
    handle = await open(path, fsConstants.O_RDONLY | noFollow | directoryOnly);
    const descriptor = await handle.stat({ bigint: true });
    assertPrivateBigIntDirectoryStat(descriptor);
    const identity = directoryIdentityFromBigIntStat(descriptor);
    if (!sameDirectoryIdentity(directoryIdentityFromBigIntStat(pathBefore), identity)) fail();
    const pathAfter = await lstat(path, { bigint: true });
    assertPrivateBigIntDirectoryStat(pathAfter);
    if (!sameDirectoryIdentity(directoryIdentityFromBigIntStat(pathAfter), identity)) fail();
    return { path, identity, handle, workspaceRoot };
  } catch {
    if (handle) {
      try { await handle.close(); } catch {}
    }
    fail();
  }
}

async function assertPrivateDirectoryState(state) {
  try {
    if (!state || typeof state.path !== 'string' || !state.handle ||
        !state.identity || typeof state.workspaceRoot !== 'boolean') fail();
    if (state.workspaceRoot) await secureWorkspaceRoot(state.path);
    else await assertPrivateDirectory(state.path);
    const descriptor = await state.handle.stat({ bigint: true });
    const pathStat = await lstat(state.path, { bigint: true });
    assertPrivateBigIntDirectoryStat(descriptor);
    assertPrivateBigIntDirectoryStat(pathStat);
    if (!sameDirectoryIdentity(directoryIdentityFromBigIntStat(descriptor), state.identity) ||
        !sameDirectoryIdentity(directoryIdentityFromBigIntStat(pathStat), state.identity)) fail();
  } catch {
    fail();
  }
}

async function disposePrivateDirectoryState(state) {
  if (!state?.handle) return;
  try { await state.handle.close(); } catch {}
  state.handle = undefined;
}

function exactFileGeneration(value) {
  try {
    exactObject(value, FILE_GENERATION_FIELDS);
    const copy = {};
    for (let index = 0; index < FILE_GENERATION_FIELDS.length; index += 1) {
      const field = FILE_GENERATION_FIELDS[index];
      if (typeof value[field] !== 'string' || !DECIMAL.test(value[field])) fail();
      ownData(copy, field, value[field]);
    }
    return FREEZE(copy);
  } catch {
    fail();
  }
}

function generationFromBigIntStat(stat) {
  try {
    const generation = {};
    for (let index = 0; index < FILE_GENERATION_FIELDS.length; index += 1) {
      const field = FILE_GENERATION_FIELDS[index];
      const value = stat[field];
      if (typeof value !== 'bigint' || value < 0n) fail();
      ownData(generation, field, value.toString());
    }
    return FREEZE(generation);
  } catch {
    fail();
  }
}

function sameFileGeneration(left, right) {
  for (let index = 0; index < FILE_GENERATION_FIELDS.length; index += 1) {
    const field = FILE_GENERATION_FIELDS[index];
    if (left[field] !== right[field]) return false;
  }
  return true;
}

function assertPrivateBigIntFileStat(stat, maximumBytes, allowEmpty = false) {
  const uidMatches = typeof process.getuid !== 'function' || stat.uid === BigInt(process.getuid());
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n ||
      Number(stat.mode & 0o777n) !== PRIVATE_FILE_MODE || !uidMatches ||
      (!allowEmpty && stat.size < 1n) || stat.size > BigInt(maximumBytes)) fail();
}

async function assertOpenInputPath(input, generation) {
  const pathStat = await lstat(input.path, { bigint: true });
  assertPrivateBigIntFileStat(pathStat, input.maximumBytes, input.allowEmpty);
  if (!sameFileGeneration(generationFromBigIntStat(pathStat), generation)) fail();
  await resolvedDescendant(input.root, input.path);
  await assertPhysicalDescendant(input.root, input.path, input.rel);
}

async function openVerifiedProtectedInput(
  workspaceRoot,
  path,
  maximumBytes,
  allowEmpty = false,
) {
  let handle;
  try {
    const root = await secureWorkspaceRoot(workspaceRoot);
    const { resolvedRoot, resolvedPath, rel } = await resolvedDescendant(root, path);
    await assertPhysicalDescendant(resolvedRoot, resolvedPath, rel);
    const pathBefore = await lstat(resolvedPath, { bigint: true });
    assertPrivateBigIntFileStat(pathBefore, maximumBytes, allowEmpty);
    const noFollow = fsConstants.O_NOFOLLOW ?? 0;
    handle = await open(resolvedPath, fsConstants.O_RDONLY | noFollow);
    const descriptorBefore = await handle.stat({ bigint: true });
    assertPrivateBigIntFileStat(descriptorBefore, maximumBytes, allowEmpty);
    const generation = generationFromBigIntStat(descriptorBefore);
    if (!sameFileGeneration(generationFromBigIntStat(pathBefore), generation)) fail();
    const input = {
      root: resolvedRoot,
      path: resolvedPath,
      rel,
      maximumBytes,
      allowEmpty,
      generation,
      handle,
      buffer: undefined,
    };
    await assertOpenInputPath(input, generation);
    return input;
  } catch {
    if (handle) {
      try { await handle.close(); } catch {}
    }
    fail();
  }
}

async function readVerifiedOpenInput(input, maximumBytes) {
  try {
    if (!input?.handle || input.maximumBytes !== maximumBytes) fail();
    const before = await input.handle.stat({ bigint: true });
    assertPrivateBigIntFileStat(before, maximumBytes, input.allowEmpty);
    const generation = generationFromBigIntStat(before);
    if (!sameFileGeneration(generation, input.generation)) fail();
    await assertOpenInputPath(input, generation);
    const size = Number(before.size);
    const buffer = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const result = await input.handle.read(buffer, offset, size - offset, offset);
      if (!result || !Number.isSafeInteger(result.bytesRead) || result.bytesRead <= 0) fail();
      offset += result.bytesRead;
    }
    const after = await input.handle.stat({ bigint: true });
    assertPrivateBigIntFileStat(after, maximumBytes, input.allowEmpty);
    if (!sameFileGeneration(generationFromBigIntStat(after), input.generation)) fail();
    await assertOpenInputPath(input, input.generation);
    input.buffer = buffer;
    return buffer;
  } catch {
    fail();
  }
}

async function readIndependentPinnedInput(input) {
  let buffer;
  try {
    if (!input?.handle || !Number.isSafeInteger(input.maximumBytes) ||
        input.maximumBytes < 1 || !Buffer.isBuffer(input.buffer)) fail();
    const before = await input.handle.stat({ bigint: true });
    assertPrivateBigIntFileStat(before, input.maximumBytes, input.allowEmpty);
    if (!sameFileGeneration(generationFromBigIntStat(before), input.generation)) fail();
    await assertOpenInputPath(input, input.generation);
    const size = Number(before.size);
    buffer = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const result = await input.handle.read(buffer, offset, size - offset, offset);
      if (!result || !Number.isSafeInteger(result.bytesRead) || result.bytesRead <= 0) fail();
      offset += result.bytesRead;
    }
    const after = await input.handle.stat({ bigint: true });
    assertPrivateBigIntFileStat(after, input.maximumBytes, input.allowEmpty);
    if (!sameFileGeneration(generationFromBigIntStat(after), input.generation)) fail();
    await assertOpenInputPath(input, input.generation);
    if (Buffer.compare(buffer, input.buffer) !== 0) fail();
    return buffer;
  } catch {
    if (Buffer.isBuffer(buffer)) buffer.fill(0);
    fail();
  }
}

async function assertIndependentPinnedInputBytes(input) {
  const buffer = await readIndependentPinnedInput(input);
  buffer.fill(0);
}

async function disposeVerifiedInput(input) {
  if (!input) return;
  if (Buffer.isBuffer(input.buffer)) input.buffer.fill(0);
  input.buffer = undefined;
  if (input.handle) {
    try { await input.handle.close(); } catch {}
    input.handle = undefined;
  }
}

function exactPreflightOptions(options) {
  exactObject(options, [
    'configPath', 'buyerRpcPath', 'buyerWalletPath', 'facilitatorRpcPath',
    'workspaceRoot', 'runName',
  ]);
  const names = [
    'configPath', 'buyerRpcPath', 'buyerWalletPath', 'facilitatorRpcPath', 'workspaceRoot',
  ];
  for (let index = 0; index < names.length; index += 1) stringValue(options[names[index]], 4096);
  if (typeof options.runName !== 'string' || !RUN_NAME.test(options.runName)) fail();
  const snapshot = {};
  for (let index = 0; index < names.length; index += 1) {
    ownData(snapshot, names[index], options[names[index]]);
  }
  ownData(snapshot, 'runName', options.runName);
  return FREEZE(snapshot);
}

function exactPublicWsOnceOptions(options) {
  exactObject(options, [
    'configPath', 'buyerRpcPath', 'buyerWalletPath', 'facilitatorRpcPath',
    'authorizationPath', 'workspaceRoot', 'runName', 'transportException',
  ]);
  const names = [
    'configPath', 'buyerRpcPath', 'buyerWalletPath', 'facilitatorRpcPath',
    'authorizationPath', 'workspaceRoot',
  ];
  for (let index = 0; index < names.length; index += 1) {
    stringValue(options[names[index]], 4096);
  }
  if (typeof options.runName !== 'string' || !RUN_NAME.test(options.runName) ||
      options.transportException !== PUBLIC_WS_ONCE_TRANSPORT_EXCEPTION) fail();
  const snapshot = {};
  for (let index = 0; index < names.length; index += 1) {
    ownData(snapshot, names[index], options[names[index]]);
  }
  ownData(snapshot, 'runName', options.runName);
  ownData(snapshot, 'transportException', options.transportException);
  return FREEZE(snapshot);
}

function exactCurrentTestnetWssOnceOptions(options) {
  exactObject(options, [
    'configPath', 'buyerRpcPath', 'buyerWalletPath', 'facilitatorRpcPath',
    'authorizationPath', 'workspaceRoot', 'runName', 'executionMode',
  ]);
  const names = [
    'configPath', 'buyerRpcPath', 'buyerWalletPath', 'facilitatorRpcPath',
    'authorizationPath', 'workspaceRoot',
  ];
  for (let index = 0; index < names.length; index += 1) {
    stringValue(options[names[index]], 4096);
  }
  if (typeof options.runName !== 'string' || !RUN_NAME.test(options.runName) ||
      options.executionMode !== CURRENT_TESTNET_WSS_ONCE_EXECUTION_MODE) fail();
  const snapshot = {};
  for (let index = 0; index < names.length; index += 1) {
    ownData(snapshot, names[index], options[names[index]]);
  }
  ownData(snapshot, 'runName', options.runName);
  ownData(snapshot, 'executionMode', options.executionMode);
  return FREEZE(snapshot);
}

export function parsePublicWsOnceAuthorization(jsonText) {
  try {
    const value = parseStrictJson(jsonText, ROLE_INPUT_MAX_BYTES);
    exactObject(value, [
      'authorizationVersion', 'transportException', 'runName', 'sourceRevision',
      'profileName', 'configDigest', 'paymentIntentDigest', 'rpcEndpoint',
      'quickTunnel', 'acknowledgements',
    ]);
    if (value.authorizationVersion !== 2 ||
        value.transportException !== PUBLIC_WS_ONCE_TRANSPORT_EXCEPTION ||
        typeof value.runName !== 'string' || !RUN_NAME.test(value.runName) ||
        typeof value.sourceRevision !== 'string' || !REVISION.test(value.sourceRevision) ||
        value.profileName !== GATE_B_CURRENT_TESTNET_PROFILE_NAME ||
        typeof value.configDigest !== 'string' ||
        !LOWERCASE_HASH_64.test(value.configDigest) ||
        typeof value.paymentIntentDigest !== 'string' ||
        !LOWERCASE_HASH_64.test(value.paymentIntentDigest)) fail();
    if (validateGateBQuickTunnelStableBinding(value.quickTunnel) !== true) fail();
    exactPublicWsOnceEndpoint(value.rpcEndpoint);
    exactObject(value.acknowledgements, ['payment', 'publication']);
    if (value.acknowledgements.payment !== PUBLIC_WS_ONCE_PAYMENT_ACKNOWLEDGEMENT ||
        value.acknowledgements.publication !==
          PUBLIC_WS_ONCE_PUBLICATION_ACKNOWLEDGEMENT) fail();
    return deepFreeze(value);
  } catch {
    fail();
  }
}

export function parseCurrentTestnetWssOnceAuthorization(jsonText) {
  try {
    const value = parseStrictJson(jsonText, ROLE_INPUT_MAX_BYTES);
    exactObject(value, [
      'authorizationVersion', 'executionMode', 'runName', 'sourceRevision',
      'profileName', 'configDigest', 'paymentIntentDigest', 'rpcEndpoint',
      'quickTunnel', 'acknowledgements',
    ]);
    if (value.authorizationVersion !== 3 ||
        value.executionMode !== CURRENT_TESTNET_WSS_ONCE_EXECUTION_MODE ||
        typeof value.runName !== 'string' || !RUN_NAME.test(value.runName) ||
        typeof value.sourceRevision !== 'string' || !REVISION.test(value.sourceRevision) ||
        value.profileName !== GATE_B_CURRENT_TESTNET_PROFILE_NAME ||
        typeof value.configDigest !== 'string' || !LOWERCASE_HASH_64.test(value.configDigest) ||
        typeof value.paymentIntentDigest !== 'string' ||
        !LOWERCASE_HASH_64.test(value.paymentIntentDigest) ||
        value.rpcEndpoint !== GATE_B_CURRENT_TESTNET_WSS_ENDPOINT) fail();
    if (validateGateBQuickTunnelStableBinding(value.quickTunnel) !== true) fail();
    exactObject(value.acknowledgements, ['payment', 'publication']);
    if (value.acknowledgements.payment !==
          CURRENT_TESTNET_WSS_ONCE_PAYMENT_ACKNOWLEDGEMENT ||
        value.acknowledgements.publication !==
          PUBLIC_WS_ONCE_PUBLICATION_ACKNOWLEDGEMENT) fail();
    return deepFreeze(value);
  } catch {
    fail();
  }
}

export function parsePublicWsOnceSupervisorBootstrap(jsonText) {
  try {
    return exactPublicWsOnceOptions(parseStrictJson(jsonText, ROLE_INPUT_MAX_BYTES));
  } catch {
    fail();
  }
}

export function parseCurrentTestnetWssOnceSupervisorBootstrap(jsonText) {
  try {
    return exactCurrentTestnetWssOnceOptions(parseStrictJson(jsonText, ROLE_INPUT_MAX_BYTES));
  } catch {
    fail();
  }
}

export function parsePublicWsOnceIndependentVerification(jsonText, expectedRunName) {
  try {
    if (typeof expectedRunName !== 'string' || !RUN_NAME.test(expectedRunName)) fail();
    const value = parseStrictJson(jsonText, ROLE_INPUT_MAX_BYTES);
    exactObject(value, [
      'verificationVersion', 'runName', 'route', 'sameEndpoint', 'sameOperatorRoute',
      'exactBlockConfirmed', 'paymentIntentBindingConfirmed',
      'momentumInclusionConfirmed',
    ]);
    if (value.verificationVersion !== 1 || value.runName !== expectedRunName ||
        value.route !== 'different-operator-wss-or-https' ||
        value.sameEndpoint !== false || value.sameOperatorRoute !== false ||
        value.exactBlockConfirmed !== true ||
        value.paymentIntentBindingConfirmed !== true ||
        value.momentumInclusionConfirmed !== true) fail();
    return deepFreeze(value);
  } catch {
    fail();
  }
}

function exactPublicDnsHostname(value) {
  stringValue(value, 253);
  if (value !== value.toLowerCase() || isIP(value) !== 0) fail();
  const labels = value.split('.');
  if (labels.length < 2) fail();
  for (let index = 0; index < labels.length; index += 1) {
    if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)$/.test(labels[index])) fail();
  }
  const suffix = labels[labels.length - 1];
  if (suffix === 'localhost' || suffix === 'local' || suffix === 'internal' ||
      suffix === 'invalid' || suffix === 'test' || suffix === 'example' ||
      suffix === 'onion' || suffix === 'arpa') fail();
  const registrable = labels.slice(-2).join('.');
  if (registrable === 'example.com' || registrable === 'example.net' ||
      registrable === 'example.org') fail();
  return value;
}

function canonicalPublicIpAddress(value, expectedFamily) {
  stringValue(value, 64);
  const family = isIP(value);
  if (family !== expectedFamily || !publicAddress(value, family)) fail();
  let canonical;
  if (family === 4) {
    canonical = value.split('.').map(part => String(Number(part))).join('.');
  } else {
    try {
      const parsed = new URL(`https://[${value}]/`);
      canonical = parsed.hostname.slice(1, -1).toLowerCase();
    } catch {
      fail();
    }
  }
  if (canonical !== value) fail();
  return value;
}

function exactOriginalRouteHostname(value) {
  stringValue(value, 253);
  const family = isIP(value);
  if (family === 4 || family === 6) return canonicalPublicIpAddress(value, family);
  return exactPublicDnsHostname(value);
}

function exactIndependentHttpsRpcUrl(value) {
  stringValue(value, 4096);
  if (value.includes('%') || value.includes('?') || value.includes('#')) fail();
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail();
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
      parsed.search || parsed.hash || parsed.port !== '' || parsed.href !== value ||
      !parsed.pathname.startsWith('/') || parsed.pathname.startsWith('//') ||
      CONTROL.test(parsed.pathname)) fail();
  exactPublicDnsHostname(parsed.hostname);
  return value;
}

export function parseIndependentPublicWsOnceEndpointConfig(jsonText) {
  try {
    const value = parseStrictJson(jsonText, CONFIG_MAX_BYTES);
    exactObject(value, [
      'endpointConfigVersion', 'transport', 'rpcUrl', 'originalRoute',
      'selectedFamily', 'dnsTimeoutMs', 'rpcTimeoutMs',
    ]);
    if (value.endpointConfigVersion !== 1 ||
        value.transport !== INDEPENDENT_FINALIZER_TRANSPORT) fail();
    exactIndependentHttpsRpcUrl(value.rpcUrl);
    if (value.selectedFamily !== 4 && value.selectedFamily !== 6) fail();
    exactObject(value.originalRoute, ['hostname', 'addresses', 'nodePublicKey']);
    exactOriginalRouteHostname(value.originalRoute.hostname);
    stringValue(value.originalRoute.nodePublicKey, 4096);
    if (!ARRAY_IS_ARRAY(value.originalRoute.addresses) ||
        value.originalRoute.addresses.length < 1 ||
        value.originalRoute.addresses.length > 16) fail();
    let previousAddressKey;
    for (let index = 0; index < value.originalRoute.addresses.length; index += 1) {
      const address = value.originalRoute.addresses[index];
      exactObject(address, ['address', 'family']);
      if (address.family !== 4 && address.family !== 6) fail();
      canonicalPublicIpAddress(address.address, address.family);
      const addressKey = `${address.family}:${address.address}`;
      if (previousAddressKey !== undefined && addressKey <= previousAddressKey) fail();
      previousAddressKey = addressKey;
    }
    integer(value.dnsTimeoutMs, 1, MAX_RPC_TIMEOUT_MS);
    integer(value.rpcTimeoutMs, 1, MAX_RPC_TIMEOUT_MS);
    const endpointHostname = new URL(value.rpcUrl).hostname;
    if (endpointHostname === value.originalRoute.hostname) fail();
    return deepFreeze(value);
  } catch {
    fail();
  }
}

export function independentPublicWsOnceEndpointConfigDigest(endpointConfig) {
  try {
    const validated = parseIndependentPublicWsOnceEndpointConfig(
      `${JSON_STRINGIFY(endpointConfig)}\n`,
    );
    return sha256Hex(
      `${INDEPENDENT_ENDPOINT_CONFIG_DIGEST_DOMAIN}\0${canonicalJson(validated)}`,
    );
  } catch {
    fail();
  }
}

export function independentPublicWsOnceCandidateBundleDigest(candidateBundleText) {
  try {
    if (typeof candidateBundleText !== 'string' ||
        BUFFER_BYTE_LENGTH(candidateBundleText, 'utf8') < 1 ||
        BUFFER_BYTE_LENGTH(candidateBundleText, 'utf8') >
          INDEPENDENT_FINALIZER_ARTIFACT_MAX_BYTES) fail();
    parseLiveEvidenceBundle(candidateBundleText);
    return sha256Hex(
      `${INDEPENDENT_CANDIDATE_BUNDLE_DIGEST_DOMAIN}\0${candidateBundleText}`,
    );
  } catch {
    fail();
  }
}

export function parseIndependentPublicWsOnceOperatorReview(jsonText) {
  try {
    const value = parseStrictJson(jsonText, ROLE_INPUT_MAX_BYTES);
    exactObject(value, [
      'reviewVersion', 'reviewType', 'finalizerVersion', 'verifierSourceRevision',
      'source', 'run', 'bindings', 'route', 'attestations',
    ]);
    if (value.reviewVersion !== 1 ||
        value.reviewType !== 'independent-public-ws-once-operator-review' ||
        value.finalizerVersion !== 1) fail();
    if (typeof value.verifierSourceRevision !== 'string' ||
        !REVISION.test(value.verifierSourceRevision)) fail();
    exactObject(value.source, ['repository', 'revision', 'packageVersion', 'nodeMajor']);
    if (value.source.repository !== INDEPENDENT_FINALIZER_REPOSITORY ||
        typeof value.source.revision !== 'string' || !REVISION.test(value.source.revision) ||
        typeof value.source.packageVersion !== 'string' ||
        !/^\d+\.\d+\.\d+$/.test(value.source.packageVersion) ||
        !Number.isSafeInteger(value.source.nodeMajor) || value.source.nodeMajor < 24 ||
        value.source.nodeMajor > 1000) fail();
    exactObject(value.run, ['name', 'attemptId']);
    if (typeof value.run.name !== 'string' || !RUN_NAME.test(value.run.name) ||
        typeof value.run.attemptId !== 'string' ||
        !INDEPENDENT_FINALIZER_ATTEMPT.test(value.run.attemptId)) fail();
    exactObject(value.bindings, ['candidateBundleDigest', 'endpointConfigDigest']);
    if (typeof value.bindings.candidateBundleDigest !== 'string' ||
        !LOWERCASE_HASH_64.test(value.bindings.candidateBundleDigest) ||
        typeof value.bindings.endpointConfigDigest !== 'string' ||
        !LOWERCASE_HASH_64.test(value.bindings.endpointConfigDigest)) fail();
    exactObject(value.route, ['transport', 'relationship']);
    if (value.route.transport !== INDEPENDENT_FINALIZER_TRANSPORT ||
        value.route.relationship !== 'different-operator-route') fail();
    exactObject(value.attestations, [
      'separateAdministration', 'noProxyOrAlias', 'readOnlyUse', 'humanAcceptance',
    ]);
    if (value.attestations.separateAdministration !== true ||
        value.attestations.noProxyOrAlias !== true ||
        value.attestations.readOnlyUse !== true ||
        value.attestations.humanAcceptance !==
          INDEPENDENT_FINALIZER_REVIEW_ACCEPTANCE) fail();
    return deepFreeze(value);
  } catch {
    fail();
  }
}

function independentOperatorReviewDigest(review) {
  return sha256Hex(
    `${INDEPENDENT_OPERATOR_REVIEW_DIGEST_DOMAIN}\0${canonicalJson(review)}`,
  );
}

function independentFinalizerAttemptRecordName(attemptId) {
  if (typeof attemptId !== 'string' || !INDEPENDENT_FINALIZER_ATTEMPT.test(attemptId)) fail();
  return `.independent-finalizer-attempt-${attemptId}.consumed.json`;
}

function parseIndependentFinalizerAttemptRecord(jsonText) {
  try {
    const value = parseStrictJson(jsonText, ROLE_INPUT_MAX_BYTES);
    exactObject(value, [
      'attemptConsumedVersion', 'recordType', 'verifierSourceRevision', 'source',
      'run', 'bindings', 'recordDigest',
    ]);
    if (value.attemptConsumedVersion !== 1 ||
        value.recordType !== 'independent-public-ws-once-finalizer-attempt-consumed') fail();
    if (typeof value.verifierSourceRevision !== 'string' ||
        !REVISION.test(value.verifierSourceRevision)) fail();
    exactObject(value.source, ['repository', 'revision', 'packageVersion', 'nodeMajor']);
    if (value.source.repository !== INDEPENDENT_FINALIZER_REPOSITORY ||
        typeof value.source.revision !== 'string' || !REVISION.test(value.source.revision) ||
        typeof value.source.packageVersion !== 'string' ||
        !/^\d+\.\d+\.\d+$/.test(value.source.packageVersion) ||
        !Number.isSafeInteger(value.source.nodeMajor) || value.source.nodeMajor < 24 ||
        value.source.nodeMajor > 1000) fail();
    exactObject(value.run, ['name', 'attemptId']);
    if (typeof value.run.name !== 'string' || !RUN_NAME.test(value.run.name) ||
        typeof value.run.attemptId !== 'string' ||
        !INDEPENDENT_FINALIZER_ATTEMPT.test(value.run.attemptId)) fail();
    exactObject(value.bindings, [
      'candidateBundleDigest', 'fiveFragmentSetDigest', 'endpointConfigDigest',
      'operatorReviewDigest',
    ]);
    for (const field of [
      'candidateBundleDigest', 'fiveFragmentSetDigest', 'endpointConfigDigest',
      'operatorReviewDigest',
    ]) {
      if (typeof value.bindings[field] !== 'string' ||
          !LOWERCASE_HASH_64.test(value.bindings[field])) fail();
    }
    if (typeof value.recordDigest !== 'string' ||
        !LOWERCASE_HASH_64.test(value.recordDigest)) fail();
    const body = {
      attemptConsumedVersion: value.attemptConsumedVersion,
      recordType: value.recordType,
      verifierSourceRevision: value.verifierSourceRevision,
      source: value.source,
      run: value.run,
      bindings: value.bindings,
    };
    if (value.recordDigest !== sha256Hex(
      `${INDEPENDENT_ATTEMPT_RECORD_DIGEST_DOMAIN}\0${canonicalJson(body)}`,
    ) || jsonText !== `${canonicalJson(value)}\n`) fail();
    return deepFreeze(value);
  } catch {
    fail();
  }
}

function createIndependentFinalizerAttemptRecord(
  options,
  verifierSourceRevision,
  source,
  bindings,
) {
  const body = {
    attemptConsumedVersion: 1,
    recordType: 'independent-public-ws-once-finalizer-attempt-consumed',
    verifierSourceRevision,
    source: { ...source },
    run: { name: options.runName, attemptId: options.attemptId },
    bindings: { ...bindings },
  };
  const record = {
    ...body,
    recordDigest: sha256Hex(
      `${INDEPENDENT_ATTEMPT_RECORD_DIGEST_DOMAIN}\0${canonicalJson(body)}`,
    ),
  };
  return parseIndependentFinalizerAttemptRecord(`${canonicalJson(record)}\n`);
}

export function parseIndependentPublicWsOnceFinalizerAssertion(jsonText) {
  try {
    const value = parseStrictJson(jsonText, ROLE_INPUT_MAX_BYTES);
    exactObject(value, [
      'assertionVersion', 'assertionType', 'source', 'run', 'candidate',
      'payment', 'bindings', 'route', 'verifier', 'confirmations',
    ]);
    if (value.assertionVersion !== 1 ||
        value.assertionType !== 'independent-public-ws-once-finalization') fail();
    exactObject(value.source, ['repository', 'revision', 'packageVersion', 'nodeMajor']);
    if (value.source.repository !== INDEPENDENT_FINALIZER_REPOSITORY ||
        typeof value.source.revision !== 'string' || !REVISION.test(value.source.revision) ||
        typeof value.source.packageVersion !== 'string' ||
        !/^\d+\.\d+\.\d+$/.test(value.source.packageVersion) ||
        !Number.isSafeInteger(value.source.nodeMajor) || value.source.nodeMajor < 24 ||
        value.source.nodeMajor > 1000) fail();
    exactObject(value.run, ['name', 'attemptId']);
    if (typeof value.run.name !== 'string' || !RUN_NAME.test(value.run.name) ||
        typeof value.run.attemptId !== 'string' ||
        !INDEPENDENT_FINALIZER_ATTEMPT.test(value.run.attemptId)) fail();
    exactObject(value.candidate, [
      'evidenceVersion', 'candidateBundleDigest', 'fiveFragmentSetDigest',
    ]);
    if (value.candidate.evidenceVersion !== 1 ||
        typeof value.candidate.candidateBundleDigest !== 'string' ||
        !LOWERCASE_HASH_64.test(value.candidate.candidateBundleDigest) ||
        typeof value.candidate.fiveFragmentSetDigest !== 'string' ||
        !LOWERCASE_HASH_64.test(value.candidate.fiveFragmentSetDigest)) fail();
    exactObject(value.payment, [
      'intentDigest', 'accountBlockDigest', 'inclusionMomentumDigest',
    ]);
    for (const field of ['intentDigest', 'accountBlockDigest', 'inclusionMomentumDigest']) {
      if (typeof value.payment[field] !== 'string' ||
          !LOWERCASE_HASH_64.test(value.payment[field])) fail();
    }
    exactObject(value.bindings, ['endpointConfigDigest', 'operatorReviewDigest']);
    for (const field of ['endpointConfigDigest', 'operatorReviewDigest']) {
      if (typeof value.bindings[field] !== 'string' ||
          !LOWERCASE_HASH_64.test(value.bindings[field])) fail();
    }
    exactObject(value.route, [
      'transport', 'relationship', 'routeDigest', 'tlsServerNameAuthenticated',
      'hostnameDifferent', 'addressSetsDisjoint', 'nodeIdentityDifferent',
    ]);
    if (value.route.transport !== INDEPENDENT_FINALIZER_TRANSPORT ||
        value.route.relationship !== 'different-operator-route' ||
        typeof value.route.routeDigest !== 'string' ||
        !LOWERCASE_HASH_64.test(value.route.routeDigest) ||
        value.route.tlsServerNameAuthenticated !== true ||
        value.route.hostnameDifferent !== true ||
        value.route.addressSetsDisjoint !== true ||
        value.route.nodeIdentityDifferent !== true) fail();
    exactObject(value.verifier, [
      'name', 'sourceRevision', 'verifierVersion', 'finalizerVersion',
      'transcriptVersion', 'transcriptLength',
    ]);
    if (value.verifier.name !== INDEPENDENT_FINALIZER_NAME ||
        typeof value.verifier.sourceRevision !== 'string' ||
        !REVISION.test(value.verifier.sourceRevision) ||
        value.verifier.verifierVersion !== 1 || value.verifier.finalizerVersion !== 1 ||
        value.verifier.transcriptVersion !== 1 ||
        value.verifier.transcriptLength !== INDEPENDENT_FINALIZER_TRANSCRIPT.length) fail();
    const confirmationFields = [
      'operatorReviewAccepted', 'separateAdministration', 'noProxyOrAlias',
      'readOnlyUse', 'exactCandidateBundle', 'exactFiveFragmentSet',
      'exactPaymentIntent', 'exactAccountBlock', 'exactInclusionMomentum',
      'pinnedHeightTwoProfile', 'nonRegressingFrontier', 'laterMomentum',
    ];
    exactObject(value.confirmations, confirmationFields);
    for (let index = 0; index < confirmationFields.length; index += 1) {
      if (value.confirmations[confirmationFields[index]] !== true) fail();
    }
    return deepFreeze(value);
  } catch {
    fail();
  }
}

function exactIndependentFinalizerOptions(options) {
  exactObject(options, [
    'endpointConfigPath', 'operatorReviewPath', 'workspaceRoot', 'runName',
    'attemptId',
  ]);
  for (const field of [
    'endpointConfigPath', 'operatorReviewPath', 'workspaceRoot', 'runName', 'attemptId',
  ]) stringValue(options[field], 4096);
  if (!RUN_NAME.test(options.runName) ||
      !INDEPENDENT_FINALIZER_ATTEMPT.test(options.attemptId)) fail();
  const snapshot = {};
  for (const field of [
    'endpointConfigPath', 'operatorReviewPath', 'workspaceRoot', 'runName', 'attemptId',
  ]) ownData(snapshot, field, options[field]);
  return FREEZE(snapshot);
}

export function parseIndependentPublicWsOnceSupervisorBootstrap(jsonText) {
  try {
    const value = parseStrictJson(jsonText, ROLE_INPUT_MAX_BYTES);
    exactObject(value, [
      'bootstrapVersion', 'command', 'endpointConfigPath', 'operatorReviewPath',
      'workspaceRoot', 'runName', 'attemptId',
    ]);
    if (value.bootstrapVersion !== 1 || value.command !== INDEPENDENT_FINALIZER_COMMAND) fail();
    exactIndependentFinalizerOptions({
      endpointConfigPath: value.endpointConfigPath,
      operatorReviewPath: value.operatorReviewPath,
      workspaceRoot: value.workspaceRoot,
      runName: value.runName,
      attemptId: value.attemptId,
    });
    return deepFreeze(value);
  } catch {
    fail();
  }
}

function publicWsOnceConsumedMarker(workspaceRoot) {
  return join(workspaceRoot, PUBLIC_WS_ONCE_MARKER_NAME);
}

async function assertUnusedPublicWsOnceMarker(workspaceRoot) {
  try {
    await lstat(publicWsOnceConsumedMarker(workspaceRoot));
    fail();
  } catch (error) {
    if (error instanceof LiveEvidenceRunError) throw error;
    if (error?.code !== 'ENOENT') fail();
  }
}

export async function persistPublicWsOnceConsumedMarker(workspaceRoot) {
  let workspaceState;
  try {
    workspaceState = await capturePrivateDirectoryState(workspaceRoot, true);
    return await persistPublicWsOnceConsumedMarkerInState(workspaceState);
  } catch {
    fail();
  } finally {
    await disposePrivateDirectoryState(workspaceState);
  }
}

async function persistPublicWsOnceConsumedMarkerInState(workspaceState) {
  let handle;
  try {
    await assertPrivateDirectoryState(workspaceState);
    const root = workspaceState.path;
    const destination = publicWsOnceConsumedMarker(root);
    const noFollow = fsConstants.O_NOFOLLOW ?? 0;
    await assertPrivateDirectoryState(workspaceState);
    handle = await open(
      destination,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | noFollow,
      PRIVATE_FILE_MODE,
    );
    await assertPrivateDirectoryState(workspaceState);
    await handle.writeFile('PUBLIC_WS_ONCE_CONSUMED\n', 'utf8');
    await handle.sync();
    await assertPrivateDirectoryState(workspaceState);
    await handle.close();
    handle = undefined;
    await workspaceState.handle.sync();
    await assertPrivateDirectoryState(workspaceState);
    const stat = await lstat(destination);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 ||
        modeBits(stat) !== PRIVATE_FILE_MODE || !currentUidMatches(stat)) fail();
    await assertPrivateDirectoryState(workspaceState);
    return destination;
  } catch {
    if (handle) {
      try { await handle.close(); } catch {}
    }
    // Never remove this marker: existence means the workspace-scoped one-attempt
    // authorization was consumed, even if a crash or write failure left a partial file.
    fail();
  }
}

async function performPublicWsOncePreflight(options, retainInputs, currentTestnetWss = false) {
  const opened = [];
  let workspaceState;
  try {
    if (typeof currentTestnetWss !== 'boolean') fail();
    options = currentTestnetWss
      ? exactCurrentTestnetWssOnceOptions(options)
      : exactPublicWsOnceOptions(options);
    workspaceState = await capturePrivateDirectoryState(options.workspaceRoot, true);
    const workspaceRoot = workspaceState.path;
    const paths = [
      options.configPath,
      options.buyerRpcPath,
      options.buyerWalletPath,
      options.facilitatorRpcPath,
      options.authorizationPath,
      join(workspaceRoot, GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource),
    ];
    const maximums = [
      CONFIG_MAX_BYTES, ROLE_INPUT_MAX_BYTES, ROLE_INPUT_MAX_BYTES,
      ROLE_INPUT_MAX_BYTES, ROLE_INPUT_MAX_BYTES,
      GATE_B_PUBLIC_WS_INPUT_LIMITS.sourceBytes,
    ];
    for (let index = 0; index < paths.length; index += 1) {
      await assertPrivateDirectoryState(workspaceState);
      append(opened, await openVerifiedProtectedInput(
        workspaceRoot,
        paths[index],
        maximums[index],
      ));
      await assertPrivateDirectoryState(workspaceState);
    }
    const identities = new Set();
    for (let index = 0; index < opened.length; index += 1) {
      const identity = `${opened[index].generation.dev}:${opened[index].generation.ino}`;
      if (identities.has(identity)) fail();
      identities.add(identity);
    }
    const runDirectory = join(workspaceRoot, options.runName);
    try {
      await lstat(runDirectory);
      fail();
    } catch (error) {
      if (error instanceof LiveEvidenceRunError) throw error;
      if (error?.code !== 'ENOENT') fail();
    }
    await assertUnusedPublicWsOnceMarker(workspaceRoot);
    await assertPrivateDirectoryState(workspaceState);
    const configBytes = await readVerifiedOpenInput(opened[0], CONFIG_MAX_BYTES);
    const buyerRpcBytes = await readVerifiedOpenInput(opened[1], ROLE_INPUT_MAX_BYTES);
    const facilitatorRpcBytes = await readVerifiedOpenInput(opened[3], ROLE_INPUT_MAX_BYTES);
    const authorizationBytes = await readVerifiedOpenInput(opened[4], ROLE_INPUT_MAX_BYTES);
    const hostnameSourceBytes = await readVerifiedOpenInput(
      opened[5],
      GATE_B_PUBLIC_WS_INPUT_LIMITS.sourceBytes,
    );
    const parseConfig = currentTestnetWss
      ? parseCurrentTestnetWssOnceRunConfig
      : parsePublicWsOnceRunConfig;
    const parseRole = currentTestnetWss
      ? parseCurrentTestnetWssOnceRoleInput
      : parsePublicWsOnceRoleInput;
    const parseAuthorization = currentTestnetWss
      ? parseCurrentTestnetWssOnceAuthorization
      : parsePublicWsOnceAuthorization;
    const digestConfiguration = currentTestnetWss
      ? currentTestnetWssOnceConfigDigest
      : publicWsOnceConfigDigest;
    const config = parseConfig(configBytes.toString('utf8'));
    const buyerRpc = parseRole(
      buyerRpcBytes.toString('utf8'),
      'buyer-rpc',
    );
    const facilitatorRpc = parseRole(
      facilitatorRpcBytes.toString('utf8'),
      'facilitator-rpc',
    );
    const authorization = parseAuthorization(
      authorizationBytes.toString('utf8'),
    );
    const hostnameSource = parseGateBQuickTunnelHostnameSource(hostnameSourceBytes);
    const intentDigest = paymentIntentDigest(
      config.expectedPaymentRequired,
      config.expectedPaymentRequired.accepts[0],
    );
    const configDigest = digestConfiguration(config);
    if (buyerRpc.rpcEndpoint !== facilitatorRpc.rpcEndpoint ||
        authorization.rpcEndpoint !== buyerRpc.rpcEndpoint ||
        authorization.runName !== options.runName ||
        authorization.sourceRevision !== config.sourceRevision ||
        authorization.profileName !== config.profileName ||
        authorization.configDigest !== configDigest ||
        authorization.paymentIntentDigest !== intentDigest ||
        (currentTestnetWss
          ? authorization.executionMode !== options.executionMode ||
            config.executionMode !== options.executionMode ||
            config.rpcEndpoint !== buyerRpc.rpcEndpoint
          : authorization.transportException !== options.transportException) ||
        config.expectedPaymentRequired.resource.url !==
          `https://${hostnameSource.hostname}/paid` ||
        canonicalJson(hostnameSource.quickTunnel) !== canonicalJson(config.quickTunnel) ||
        canonicalJson(hostnameSource.quickTunnel) !==
          canonicalJson(authorization.quickTunnel)) fail();
    await opened[0].handle.close();
    opened[0].handle = undefined;
    await opened[4].handle.close();
    opened[4].handle = undefined;
    await opened[5].handle.close();
    opened[5].handle = undefined;
    const state = {
      workspaceRoot,
      config,
      configInput: opened[0],
      buyerRpcInput: opened[1],
      buyerWalletInput: opened[2],
      facilitatorRpcInput: opened[3],
      authorizationInput: opened[4],
      hostnameSourceInput: opened[5],
      workspaceState,
    };
    if (!retainInputs) {
      for (let index = 0; index < opened.length; index += 1) {
        await disposeVerifiedInput(opened[index]);
      }
      await disposePrivateDirectoryState(workspaceState);
      workspaceState = undefined;
    }
    return { result: FREEZE({ valid: true }), state };
  } catch {
    for (let index = 0; index < opened.length; index += 1) {
      await disposeVerifiedInput(opened[index]);
    }
    await disposePrivateDirectoryState(workspaceState);
    fail();
  }
}

export async function preflightPublicWsOnceRun(options) {
  return (await performPublicWsOncePreflight(options, false)).result;
}

export async function preflightCurrentTestnetWssOnceRun(options) {
  return (await performPublicWsOncePreflight(options, false, true)).result;
}

async function performLiveEvidencePreflight(options, retainInputs) {
  const opened = [];
  try {
    options = exactPreflightOptions(options);
    const workspaceRoot = await secureWorkspaceRoot(options.workspaceRoot);
    append(opened, await openVerifiedProtectedInput(
      workspaceRoot,
      options.configPath,
      CONFIG_MAX_BYTES,
    ));
    append(opened, await openVerifiedProtectedInput(
      workspaceRoot,
      options.buyerRpcPath,
      ROLE_INPUT_MAX_BYTES,
    ));
    append(opened, await openVerifiedProtectedInput(
      workspaceRoot,
      options.buyerWalletPath,
      ROLE_INPUT_MAX_BYTES,
    ));
    append(opened, await openVerifiedProtectedInput(
      workspaceRoot,
      options.facilitatorRpcPath,
      ROLE_INPUT_MAX_BYTES,
    ));
    const identities = new Set();
    for (let index = 0; index < opened.length; index += 1) {
      const identity = `${opened[index].generation.dev}:${opened[index].generation.ino}`;
      if (identities.has(identity)) fail();
      identities.add(identity);
    }
    const runDirectory = join(workspaceRoot, options.runName);
    try {
      await lstat(runDirectory);
      fail();
    } catch (error) {
      if (error instanceof LiveEvidenceRunError) throw error;
      if (error?.code !== 'ENOENT') fail();
    }
    const configBytes = await readVerifiedOpenInput(opened[0], CONFIG_MAX_BYTES);
    const buyerRpcBytes = await readVerifiedOpenInput(opened[1], ROLE_INPUT_MAX_BYTES);
    const config = parseLiveEvidenceRunConfig(configBytes.toString('utf8'));
    parseLiveRoleInput(buyerRpcBytes.toString('utf8'), 'buyer-rpc');
    await opened[0].handle.close();
    opened[0].handle = undefined;
    const state = {
      workspaceRoot,
      config,
      configInput: opened[0],
      buyerRpcInput: opened[1],
      buyerWalletInput: opened[2],
      facilitatorRpcInput: opened[3],
    };
    if (!retainInputs) {
      for (let index = 0; index < opened.length; index += 1) {
        await disposeVerifiedInput(opened[index]);
      }
    }
    return { result: FREEZE({ valid: true }), state };
  } catch {
    for (let index = 0; index < opened.length; index += 1) {
      await disposeVerifiedInput(opened[index]);
    }
    fail();
  }
}

export async function preflightLiveEvidenceRun(options) {
  return (await performLiveEvidencePreflight(options, false)).result;
}

export function createLifecycleCollector() {
  const events = [];
  let evidenceEligible = true;
  let closed = false;
  const addEvent = source => {
    const event = exactObject(source, [
      'sequence', 'phase', 'role', 'clockDomain', 'utc', 'monotonicMs',
    ]);
    const globalEvent = FREEZE({
      sequence: events.length,
      phase: event.phase,
      role: event.role,
      clockDomain: event.clockDomain,
      utc: event.utc,
      monotonicMs: event.monotonicMs,
    });
    append(events, globalEvent);
    return globalEvent;
  };
  const collector = {
    record(observer, role, phase) {
      if (closed) fail();
      let event;
      try {
        event = recordLiveEvidencePhase(observer, role, phase);
      } catch {
        evidenceEligible = false;
        return null;
      }
      if (!event) {
        evidenceEligible = false;
        return null;
      }
      return addEvent(event);
    },
    add(observations) {
      if (closed || IS_PROXY(observations) || !ARRAY_IS_ARRAY(observations)) fail();
      for (let index = 0; index < observations.length; index += 1) {
        addEvent(observations[index]);
      }
    },
    markIneligible() {
      evidenceEligible = false;
    },
    close() {
      closed = true;
    },
    snapshot() {
      const copy = [];
      for (let index = 0; index < events.length; index += 1) append(copy, events[index]);
      return deepFreeze({ events: copy, evidenceEligible });
    },
  };
  return FREEZE(collector);
}

function v1Timing(events) {
  let expectedCount = 0;
  const roles = OBJECT_KEYS(REQUIRED_PHASES);
  const byPair = new Map();
  for (let roleIndex = 0; roleIndex < roles.length; roleIndex += 1) {
    const role = roles[roleIndex];
    expectedCount += REQUIRED_PHASES[role].length;
  }
  if (events.length !== expectedCount) fail();
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.sequence !== index) fail();
    const pair = `${event.role}:${event.phase}`;
    if (byPair.has(pair)) fail();
    byPair.set(pair, event);
  }
  const durationsMs = {};
  const durationNames = OBJECT_KEYS(DURATION_BINDINGS);
  for (let index = 0; index < durationNames.length; index += 1) {
    const name = durationNames[index];
    const binding = DURATION_BINDINGS[name];
    const start = byPair.get(`${binding[0]}:${binding[1]}`);
    const end = byPair.get(`${binding[0]}:${binding[2]}`);
    if (!start || !end || start.clockDomain !== end.clockDomain ||
        end.monotonicMs < start.monotonicMs) fail();
    ownData(durationsMs, name, end.monotonicMs - start.monotonicMs);
  }
  return { events, durationsMs };
}

async function createRunDirectory(root, runName) {
  const directory = join(root, runName);
  try {
    await mkdir(directory, { mode: PRIVATE_DIRECTORY_MODE });
    await chmod(directory, PRIVATE_DIRECTORY_MODE);
    await assertPrivateDirectory(directory);
    return directory;
  } catch {
    fail();
  }
}

async function assertPrivateDirectory(directory) {
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() ||
      modeBits(stat) !== PRIVATE_DIRECTORY_MODE || !currentUidMatches(stat)) fail();
  return directory;
}

async function atomicPrivateWrite(directory, name, contents, boundary) {
  if (typeof contents !== 'string' || BUFFER_BYTE_LENGTH(contents, 'utf8') > 512 * 1024) fail();
  const destination = join(directory, name);
  const temporary = join(directory, `.partial-${randomBytes(16).toString('hex')}`);
  let handle;
  let created = false;
  try {
    if (boundary) await boundary();
    await assertPrivateDirectory(directory);
    try {
      await lstat(destination);
      fail();
    } catch (error) {
      if (error instanceof LiveEvidenceRunError) throw error;
      if (error?.code !== 'ENOENT') fail();
    }
    handle = await open(temporary, 'wx', PRIVATE_FILE_MODE);
    created = true;
    if (boundary) await boundary();
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
    if (boundary) await boundary();
    await handle.close();
    handle = undefined;
    await rename(temporary, destination);
    if (boundary) await boundary();
    const directoryHandle = await open(directory, fsConstants.O_RDONLY);
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
    const stat = await lstat(destination);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 ||
        modeBits(stat) !== PRIVATE_FILE_MODE || !currentUidMatches(stat)) fail();
    if (boundary) await boundary();
    return destination;
  } catch {
    if (handle) {
      try { await handle.close(); } catch {}
    }
    if (created) {
      try { await rm(temporary, { force: true }); } catch {}
    }
    fail();
  }
}

async function syncDirectory(directory) {
  const handle = await open(directory, fsConstants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function publishPrivateArtifactSet(runDirectory, artifacts) {
  const names = [
    'manifest.json', 'chain.json', 'http.json', 'journal.json', 'timing.json',
    'candidate-bundle.json', 'COMPLETE',
  ];
  exactObject(artifacts, names);
  const destination = join(runDirectory, 'evidence');
  const staging = join(runDirectory, `.evidence-partial-${randomBytes(16).toString('hex')}`);
  let created = false;
  let renamed = false;
  try {
    await mkdir(staging, { mode: PRIVATE_DIRECTORY_MODE });
    created = true;
    await chmod(staging, PRIVATE_DIRECTORY_MODE);
    await assertPrivateDirectory(staging);
    await syncDirectory(staging);
    try {
      await lstat(destination);
      fail();
    } catch (error) {
      if (error instanceof LiveEvidenceRunError) throw error;
      if (error?.code !== 'ENOENT') fail();
    }
    for (let index = 0; index < names.length; index += 1) {
      await atomicPrivateWrite(staging, names[index], artifacts[names[index]]);
    }
    await syncDirectory(staging);
    await rename(staging, destination);
    renamed = true;
    await syncDirectory(runDirectory);
    await assertPrivateDirectory(destination);
    for (let index = 0; index < names.length; index += 1) {
      const stat = await lstat(join(destination, names[index]));
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 ||
          modeBits(stat) !== PRIVATE_FILE_MODE || !currentUidMatches(stat)) fail();
    }
    return destination;
  } catch {
    if (created) {
      try {
        await rm(renamed ? destination : staging, { recursive: true, force: true });
      } catch {}
    }
    fail();
  }
}

async function assertExactPrivateFile(path, expectedContents, allowEmpty = false) {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 ||
        modeBits(stat) !== PRIVATE_FILE_MODE || !currentUidMatches(stat) ||
        (!allowEmpty && stat.size < 1)) fail();
    if (expectedContents !== undefined && await readFile(path, 'utf8') !== expectedContents) fail();
  } catch {
    fail();
  }
}

function publicWsOncePendingMetadata(
  executionMode = PUBLIC_WS_ONCE_EXECUTION_MODE,
) {
  if (executionMode !== PUBLIC_WS_ONCE_EXECUTION_MODE &&
      executionMode !== CURRENT_TESTNET_WSS_ONCE_EXECUTION_MODE) fail();
  if (executionMode === CURRENT_TESTNET_WSS_ONCE_EXECUTION_MODE) {
    return {
      candidateVersion: 2,
      status: 'PENDING_INDEPENDENT_VERIFICATION',
      publicationEligible: false,
      transport: {
        scheme: 'wss',
        confidentialityInTransit: true,
        tlsServerNameAuthenticated: true,
        chainIdentityAuthenticated: false,
        operatorTrustRequired: true,
        endpointDisclosed: false,
      },
      independentVerification: {
        required: true,
        completed: false,
        sameEndpointOrOperatorRouteSufficient: false,
        exactBlockRequired: true,
        paymentIntentBindingRequired: true,
        momentumInclusionRequired: true,
      },
      privateCapture: {
        complete: true,
        independentlyVerified: false,
        publicBundleProduced: false,
        fragmentCount: 5,
      },
      nonClaims: publicWsOnceFalseNonClaims(),
    };
  }
  return {
    candidateVersion: 1,
    status: 'PENDING_INDEPENDENT_VERIFICATION',
    publicationEligible: false,
    transport: {
      scheme: 'ws',
      confidentiality: false,
      peerAuthenticated: false,
      operatorRiskAccepted: true,
      endpointDisclosed: false,
    },
    independentVerification: {
      required: true,
      completed: false,
      sameEndpointOrOperatorRouteSufficient: false,
      exactBlockRequired: true,
      paymentIntentBindingRequired: true,
      momentumInclusionRequired: true,
    },
    privateCapture: {
      complete: true,
      independentlyVerified: false,
      publicBundleProduced: false,
      fragmentCount: 5,
    },
    nonClaims: publicWsOnceFalseNonClaims(),
  };
}

async function assertPublicWsOnceRetainedState(
  workspaceState,
  runState,
  pending,
  expectedJournalSnapshot,
  expectedArtifacts,
  executionMode = PUBLIC_WS_ONCE_EXECUTION_MODE,
) {
  await assertPrivateDirectoryState(workspaceState);
  await assertPrivateDirectoryState(runState);
  await assertExactPrivateFile(
    publicWsOnceConsumedMarker(workspaceState.path),
    'PUBLIC_WS_ONCE_CONSUMED\n',
  );
  await assertExactPrivateFile(join(runState.path, 'SUBMISSION_ARMED'), 'SUBMISSION_ARMED\n');
  const journalDirectory = join(runState.path, 'journal');
  await assertPrivateDirectory(journalDirectory);
  if (JSON_STRINGIFY((await readdir(journalDirectory)).sort()) !==
      JSON_STRINGIFY(['.settlement-journal.initialized', 'settlement-journal.json'])) fail();
  await assertExactPrivateFile(
    join(journalDirectory, '.settlement-journal.initialized'),
    undefined,
    true,
  );
  await assertExactPrivateFile(join(journalDirectory, 'settlement-journal.json'));
  const durableJournal = await new SettlementJournal({
    directory: journalDirectory,
    allowedRoot: runState.path,
  }).load();
  if (!expectedJournalSnapshot || expectedJournalSnapshot.quiescent !== true ||
      durableJournal.schemaVersion !== 1 || durableJournal.revision !== 5 ||
      durableJournal.schemaVersion !== expectedJournalSnapshot.schemaVersion ||
      durableJournal.revision !== expectedJournalSnapshot.revision ||
      !ARRAY_IS_ARRAY(durableJournal.records) || durableJournal.records.length !== 1 ||
      JSON_STRINGIFY(durableJournal.records) !==
        JSON_STRINGIFY(expectedJournalSnapshot.records)) fail();
  const durableRecord = durableJournal.records[0];
  if (durableRecord.evidenceState !== EVIDENCE_STATES.MOMENTUM_INCLUDED ||
      durableRecord.deliveryState !== DELIVERY_STATES.DELIVERED ||
      durableRecord.cachedResponse === null || durableRecord.cachedResponse === undefined) fail();
  const expectedRunEntries = pending
    ? ['SUBMISSION_ARMED', 'journal', 'pending-independent-verification']
    : ['SUBMISSION_ARMED', 'journal'];
  if (JSON_STRINGIFY((await readdir(runState.path)).sort()) !==
      JSON_STRINGIFY(expectedRunEntries)) fail();
  if (pending) {
    const artifactNames = [
      'manifest.json', 'chain.json', 'http.json', 'journal.json', 'timing.json',
    ];
    exactObject(expectedArtifacts, artifactNames);
    const pendingDirectory = join(runState.path, 'pending-independent-verification');
    const captureDirectory = join(pendingDirectory, 'capture');
    await assertPrivateDirectory(pendingDirectory);
    await assertPrivateDirectory(captureDirectory);
    if (JSON_STRINGIFY((await readdir(pendingDirectory)).sort()) !== JSON_STRINGIFY([
      'PENDING_INDEPENDENT_VERIFICATION', 'capture', 'metadata.json',
    ])) fail();
    if (JSON_STRINGIFY((await readdir(captureDirectory)).sort()) !==
        JSON_STRINGIFY(artifactNames.slice().sort())) fail();
    await assertExactPrivateFile(
      join(pendingDirectory, 'PENDING_INDEPENDENT_VERIFICATION'),
      'PENDING_INDEPENDENT_VERIFICATION\n',
    );
    await assertExactPrivateFile(
      join(pendingDirectory, 'metadata.json'),
      `${JSON_STRINGIFY(publicWsOncePendingMetadata(executionMode))}\n`,
    );
    for (let index = 0; index < artifactNames.length; index += 1) {
      const name = artifactNames[index];
      await assertExactPrivateFile(join(captureDirectory, name), expectedArtifacts[name]);
    }
  }
  await assertPrivateDirectoryState(workspaceState);
  await assertPrivateDirectoryState(runState);
}

async function assertPublicWsOnceInputGenerations(preflightState) {
  const inputs = [
    preflightState.configInput,
    preflightState.buyerRpcInput,
    preflightState.buyerWalletInput,
    preflightState.facilitatorRpcInput,
    preflightState.authorizationInput,
    preflightState.hostnameSourceInput,
  ];
  for (let index = 0; index < inputs.length; index += 1) {
    await assertOpenInputPath(inputs[index], inputs[index].generation);
  }
}

async function publishPublicWsOncePendingSet(
  runDirectory,
  artifacts,
  boundary,
  executionMode = PUBLIC_WS_ONCE_EXECUTION_MODE,
) {
  const artifactNames = [
    'manifest.json', 'chain.json', 'http.json', 'journal.json', 'timing.json',
  ];
  exactObject(artifacts, artifactNames);
  const destination = join(runDirectory, 'pending-independent-verification');
  try {
    if (boundary) await boundary();
    await mkdir(destination, { mode: PRIVATE_DIRECTORY_MODE });
    if (boundary) await boundary();
    await chmod(destination, PRIVATE_DIRECTORY_MODE);
    await assertPrivateDirectory(destination);
    const captureDirectory = join(destination, 'capture');
    await mkdir(captureDirectory, { mode: PRIVATE_DIRECTORY_MODE });
    if (boundary) await boundary();
    await chmod(captureDirectory, PRIVATE_DIRECTORY_MODE);
    await assertPrivateDirectory(captureDirectory);
    const metadata = publicWsOncePendingMetadata(executionMode);
    for (let index = 0; index < artifactNames.length; index += 1) {
      const name = artifactNames[index];
      if (typeof artifacts[name] !== 'string' || artifacts[name].length === 0) fail();
      await atomicPrivateWrite(captureDirectory, name, artifacts[name], boundary);
    }
    await atomicPrivateWrite(
      destination,
      'metadata.json',
      `${JSON_STRINGIFY(metadata)}\n`,
      boundary,
    );
    await atomicPrivateWrite(
      destination,
      'PENDING_INDEPENDENT_VERIFICATION',
      'PENDING_INDEPENDENT_VERIFICATION\n',
      boundary,
    );
    await syncDirectory(destination);
    await syncDirectory(runDirectory);
    if (JSON_STRINGIFY((await readdir(captureDirectory)).sort()) !==
        JSON_STRINGIFY(artifactNames.slice().sort())) fail();
    if (JSON_STRINGIFY((await readdir(destination)).sort()) !== JSON_STRINGIFY([
      'PENDING_INDEPENDENT_VERIFICATION', 'capture', 'metadata.json',
    ])) fail();
    if (boundary) await boundary();
    return destination;
  } catch {
    // Preserve partial state after the workspace-scoped one-attempt guard is consumed.
    fail();
  }
}

function environmentForRpc(config, rpcEndpoint, executionMode = HISTORICAL_WSS_EXECUTION_MODE) {
  if (executionMode !== HISTORICAL_WSS_EXECUTION_MODE &&
      executionMode !== PUBLIC_WS_ONCE_EXECUTION_MODE &&
      executionMode !== CURRENT_TESTNET_WSS_ONCE_EXECUTION_MODE) fail();
  const sdkNetworkId = executionMode === PUBLIC_WS_ONCE_EXECUTION_MODE ||
      executionMode === CURRENT_TESTNET_WSS_ONCE_EXECUTION_MODE
    ? GATE_B_CURRENT_TESTNET_SDK_NETWORK_ID
    : '3';
  return FREEZE({
    ZENON_LIVE_ACK: config.acknowledgements.live,
    ZENON_NETWORK_ID: sdkNetworkId,
    ZENON_RPC_URL: rpcEndpoint,
    ZENON_ASSET: config.expectedPaymentRequired.accepts[0].asset,
  });
}

function paymentRequiredEqual(observed, expected) {
  try {
    validatePaymentRequired(observed);
    return observed.x402Version === expected.x402Version &&
      observed.accepts.length === 1 && expected.accepts.length === 1 &&
      sameResource(observed.resource, expected.resource) &&
      sameRequirements(observed.accepts[0], expected.accepts[0]);
  } catch {
    return false;
  }
}

async function boundedResponseText(response, maximumBytes) {
  if (!response?.body || typeof response.body.getReader !== 'function') fail();
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (!result || typeof result.done !== 'boolean') fail();
      if (result.done) break;
      if (!(result.value instanceof Uint8Array)) fail();
      total += result.value.byteLength;
      if (total > maximumBytes) fail();
      append(chunks, result.value);
    }
    return Buffer.concat(chunks, total).toString('utf8');
  } catch {
    try { await reader.cancel(); } catch {}
    fail();
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}

async function defaultOperations(
  options,
  config,
  runDirectory,
  preflightState,
  dependencies = {},
  executionMode = HISTORICAL_WSS_EXECUTION_MODE,
  boundary = async () => {},
  directoryIdentities,
  facilitatorWorkerModule,
) {
  if (executionMode !== HISTORICAL_WSS_EXECUTION_MODE &&
      executionMode !== PUBLIC_WS_ONCE_EXECUTION_MODE &&
      executionMode !== CURRENT_TESTNET_WSS_ONCE_EXECUTION_MODE) fail();
  const currentTestnetOnce = executionMode === PUBLIC_WS_ONCE_EXECUTION_MODE ||
    executionMode === CURRENT_TESTNET_WSS_ONCE_EXECUTION_MODE;
  const roleParser = executionMode === PUBLIC_WS_ONCE_EXECUTION_MODE
    ? parsePublicWsOnceRoleInput
    : executionMode === CURRENT_TESTNET_WSS_ONCE_EXECUTION_MODE
      ? parseCurrentTestnetWssOnceRoleInput
      : parseLiveRoleInput;
  const buyerRpc = roleParser(
    preflightState.buyerRpcInput.buffer.toString('utf8'),
    'buyer-rpc',
  );
  await disposeVerifiedInput(preflightState.buyerRpcInput);
  const readinessProbe = dependencies.probeZenonRoleReadiness ?? probeZenonRoleReadiness;
  const resolveAddresses = dependencies.resolveAddresses ?? lookupDns;
  const httpsRequester = dependencies.requestHttps ?? requestHttps;
  const zenonClientFactory = dependencies.createZenonClient ??
    (clientOptions => new ExactZenonClient(clientOptions));
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
  const environment = environmentForRpc(config, buyerRpc.rpcEndpoint, executionMode);
  let challengeEvent;
  let fetchCalls = 0;
  let armed = false;
  let signedPaymentTransportBinding;
  let publicTransport;
  const armSubmission = async () => {
    if (!armed) {
      await boundary();
      await atomicPrivateWrite(
        runDirectory,
        'SUBMISSION_ARMED',
        'SUBMISSION_ARMED\n',
        boundary,
      );
      await boundary();
      armed = true;
    }
  };
  const operations = {
    async probeBuyerReadiness() {
      await boundary();
      await Reflect.apply(readinessProbe, undefined, [{
        role: 'buyer',
        asset: config.expectedPaymentRequired.accepts[0].asset,
        operatorTrustedChainPolicy: policy,
        environment,
        rpcTimeoutMs: config.runtime.rpcTimeoutMs,
      }]);
      await boundary();
    },
    async probePublicEndpoint() {
      await boundary();
      const resourceUrl = config.expectedPaymentRequired.resource.url;
      exactPublicHttpsPaidUrl(resourceUrl);
      publicTransport = await createLiveEvidencePublicTransport({
        resourceUrl,
        timeoutMs: config.runtime.rpcTimeoutMs,
        resolveAddresses,
        requestHttps: httpsRequester,
      });
      const response = await publicTransport.fetch(publicTransport.healthUrl, { redirect: 'manual' });
      await boundary();
      if (!response || response.redirected || response.url !== publicTransport.healthUrl ||
          response.status !== 200 ||
          response.headers.get('content-type') !== 'application/json; charset=utf-8') fail();
      const bodyText = await boundedResponseText(response, 1024);
      if (bodyText !== JSON_STRINGIFY({ ok: true }, null, 2)) fail();
    },
    async startFacilitator({ recovery = false }) {
      await boundary();
      if (currentTestnetOnce && recovery !== false) fail();
      const worker = currentTestnetOnce
        ? facilitatorWorkerModule
        : await import('./live-evidence-facilitator-worker.js');
      if (!worker || typeof worker.startLiveEvidenceFacilitatorWorker !== 'function' ||
          typeof worker.assertLiveEvidenceFacilitatorController !== 'function') fail();
      const workerOptions = {
        config,
        facilitatorRpcFd: preflightState.facilitatorRpcInput.handle.fd,
        facilitatorRpcGeneration: preflightState.facilitatorRpcInput.generation,
        workspaceRoot: preflightState.workspaceRoot,
        journalDirectory: join(runDirectory, 'journal'),
        recovery,
      };
      if (currentTestnetOnce) ownData(workerOptions, 'executionMode', executionMode);
      if (currentTestnetOnce) {
        exactObject(directoryIdentities, ['workspace', 'runDirectory']);
        ownData(workerOptions, 'workspaceIdentity', directoryIdentities.workspace);
        ownData(workerOptions, 'runDirectoryIdentity', directoryIdentities.runDirectory);
      }
      if (dependencies.forkProcess) ownData(workerOptions, 'forkProcess', dependencies.forkProcess);
      const controller = await worker.startLiveEvidenceFacilitatorWorker(workerOptions);
      await boundary();
      return worker.assertLiveEvidenceFacilitatorController(controller);
    },
    async readBuyerWallet() {
      try {
        await boundary();
        const bytes = await readVerifiedOpenInput(
          preflightState.buyerWalletInput,
          ROLE_INPUT_MAX_BYTES,
        );
        const wallet = parseLiveRoleInput(bytes.toString('utf8'), 'buyer-wallet');
        await boundary();
        return wallet;
      } finally {
        await disposeVerifiedInput(preflightState.buyerWalletInput);
      }
    },
    async paidFetch({ lifecycleObserver, openWallet, onChallenge }) {
      let client;
      const lazyClient = {};
      DEFINE_PROPERTY(lazyClient, 'paymentCapabilities', {
        value: RUNNER_CAPABILITIES,
        enumerable: false,
        writable: false,
        configurable: false,
      });
      ownData(lazyClient, 'createPaymentPayload', async (paymentRequired, accepted) => {
        if (!paymentRequiredEqual(paymentRequired, config.expectedPaymentRequired) ||
            !sameRequirements(accepted, config.expectedPaymentRequired.accepts[0])) fail();
        await boundary();
        const wallet = await openWallet();
        await boundary();
        client = Reflect.apply(zenonClientFactory, undefined, [{
          mnemonic: wallet.mnemonic,
          accountIndex: wallet.accountIndex,
          environment,
          operatorTrustedChainPolicy: policy,
          rpcTimeoutMs: config.runtime.rpcTimeoutMs,
          lifecycleObserver,
        }]);
        if (!client || typeof client.createPaymentPayload !== 'function' ||
            typeof client.snapshotLiveEvidenceObservations !== 'function') fail();
        await boundary();
        const payload = await client.createPaymentPayload(paymentRequired, accepted);
        await boundary();
        return payload;
      });
      const observedFetch = async (url, fetchOptions) => {
        fetchCalls += 1;
        if (!publicTransport || url !== config.expectedPaymentRequired.resource.url || fetchCalls > 2) fail();
        if (fetchCalls === 2) await armSubmission();
        await boundary();
        const transportFetch = fetchCalls === 2
          ? () => publicTransport.fetchSignedPayment(
            url,
            { ...fetchOptions, redirect: 'manual' },
            signedPaymentTransportBinding,
          )
          : () => publicTransport.fetch(url, { ...fetchOptions, redirect: 'manual' });
        const response = await transportFetch();
        await boundary();
        if (!response || response.redirected || response.url !== url ||
            (response.status >= 300 && response.status < 400)) fail();
        if (fetchCalls === 1) {
          if (response.status !== 402) fail();
          const encoded = response.headers.get(HEADERS.PAYMENT_REQUIRED);
          if (typeof encoded !== 'string') fail();
          const required = decodeB64Json(encoded);
          if (!paymentRequiredEqual(required, config.expectedPaymentRequired)) fail();
          const paidResponseTimeoutMs = computeLiveEvidencePaidResponseTimeoutMs(
            config.expectedPaymentRequired.accepts[0],
            config.runtime.rpcTimeoutMs,
          );
          signedPaymentTransportBinding = createLiveEvidenceSignedPaymentTransportBinding(
            config.expectedPaymentRequired,
            config.expectedPaymentRequired.accepts[0],
            config.runtime.rpcTimeoutMs,
            paidResponseTimeoutMs,
          );
          challengeEvent = await onChallenge(required);
        }
        return response;
      };
      let outcome;
      try {
        await boundary();
        outcome = await paidFetch(
          config.expectedPaymentRequired.resource.url,
          lazyClient,
          observedFetch,
        );
        await boundary();
      } catch (error) {
        if (error?.retrySamePayment === true) {
          return {
            kind: 'recovery',
            owner: error,
            buyerObservations: client?.snapshotLiveEvidenceObservations?.() ?? [],
          };
        }
        throw error;
      }
      if (outcome?.settlement?.retrySamePayment === true) {
        return {
          kind: 'recovery',
          owner: outcome,
          buyerObservations: client?.snapshotLiveEvidenceObservations?.() ?? [],
        };
      }
      if (outcome?.response?.status !== 200 || !outcome.paymentPayload || !outcome.settlement) fail();
      const bodyText = await outcome.response.text();
      return {
        kind: 'delivered',
        paymentRequired: outcome.paymentRequired,
        paymentPayload: outcome.paymentPayload,
        settlement: outcome.settlement,
        buyerObservations: client?.snapshotLiveEvidenceObservations?.() ?? [],
        initialObservedAt: challengeEvent?.utc,
        final: {
          status: outcome.response.status,
          contentType: outcome.response.headers.get('content-type'),
          cacheControl: outcome.response.headers.get('cache-control'),
          vary: outcome.response.headers.get('vary'),
          bodyText,
        },
      };
    },
    async reconcilePayment(owner) {
      try {
        const outcome = await reconcilePayment(owner, async (url, fetchOptions) => {
          if (!publicTransport || url !== config.expectedPaymentRequired.resource.url) fail();
          const response = await publicTransport.fetchSignedPayment(
            url,
            { ...fetchOptions, redirect: 'manual' },
            signedPaymentTransportBinding,
          );
          if (!response || response.redirected || response.url !== url ||
              (response.status >= 300 && response.status < 400)) fail();
          return response;
        });
        if (outcome?.settlement?.retrySamePayment === true) {
          return { kind: 'recovery', owner: outcome };
        }
        return { kind: 'delivered', response: outcome.response };
      } catch (error) {
        if (error?.retrySamePayment === true) return { kind: 'recovery', owner: error };
        throw error;
      }
    },
    async assembleCandidate(context) {
      return assembleLiveEvidenceRunCandidate(config, context, runDirectory);
    },
    submissionArmed() {
      return armed;
    },
  };
  return operations;
}

function falseNonClaims() {
  const value = {};
  for (let index = 0; index < NON_CLAIM_FIELDS.length; index += 1) {
    ownData(value, NON_CLAIM_FIELDS[index], false);
  }
  const profileKeys = OBJECT_KEYS(OPERATOR_TRUSTED_PUBLIC_TESTNET_NON_CLAIMS);
  for (let index = 0; index < profileKeys.length; index += 1) {
    if (value[profileKeys[index]] !== false) fail();
  }
  return value;
}

function publicWsOnceFalseNonClaims() {
  const value = falseNonClaims();
  const gateBKeys = OBJECT_KEYS(GATE_B_CURRENT_TESTNET_NON_CLAIMS);
  for (let index = 0; index < gateBKeys.length; index += 1) {
    if (!HAS_OWN(value, gateBKeys[index])) ownData(value, gateBKeys[index], false);
    if (value[gateBKeys[index]] !== false) fail();
  }
  return value;
}

function exactJournalSnapshot(snapshot) {
  if (!snapshot || snapshot.quiescent !== true || snapshot.schemaVersion !== 1 ||
      snapshot.revision !== 5 ||
      !ARRAY_IS_ARRAY(snapshot.records) || snapshot.records.length !== 1) fail();
  return snapshot.records[0];
}

function sameJson(left, right) {
  try {
    return canonicalJson(left) === canonicalJson(right);
  } catch {
    return false;
  }
}

async function validatePublicWsOncePendingState(config, outcome, journalSnapshot) {
  try {
    const record = exactJournalSnapshot(journalSnapshot);
    exactObject(record, PUBLIC_WS_ONCE_RECORD_FIELDS);
    const paymentRequired = config.expectedPaymentRequired;
    const requirements = paymentRequired.accepts[0];
    if (!paymentRequiredEqual(outcome.paymentRequired, paymentRequired)) fail();
    const preflight = await preflightZenonPayment(
      outcome.paymentPayload,
      requirements,
      paymentRequired,
    );
    exactObject(outcome.settlement, [
      'success', 'network', 'transaction', 'payer', 'state',
    ]);
    if (outcome.kind !== 'delivered' || outcome.settlement.success !== true ||
        outcome.settlement.network !== requirements.network ||
        outcome.settlement.transaction !== preflight.transactionHash ||
        outcome.settlement.payer !== preflight.payer ||
        outcome.settlement.state !== 'MOMENTUM_INCLUDED') fail();

    if (record.authorizationKey !== preflight.authorizationKey ||
        record.transactionHash !== preflight.transactionHash ||
        record.intentDigest !== preflight.intentDigest ||
        record.resourceDigest !== preflight.resourceDigest ||
        record.payer !== preflight.payer ||
        !sameJson(record.chainProfile, preflight.chainProfile) ||
        !sameResource(record.resourceIdentity, paymentRequired.resource) ||
        !sameJson(record.signedAccountBlock, outcome.paymentPayload.payload.transaction) ||
        record.evidenceState !== 'MOMENTUM_INCLUDED' ||
        record.deliveryState !== 'DELIVERED') fail();

    if (typeof record.createdAt !== 'string' || !UTC_TIMESTAMP.test(record.createdAt) ||
        typeof record.updatedAt !== 'string' || !UTC_TIMESTAMP.test(record.updatedAt) ||
        !Number.isFinite(Date.parse(record.createdAt)) ||
        !Number.isFinite(Date.parse(record.updatedAt)) ||
        record.updatedAt < record.createdAt) fail();
    exactObject(record.momentumEvidence, ['observedAt', 'confirmationDetail']);
    if (typeof record.momentumEvidence.observedAt !== 'string' ||
        !UTC_TIMESTAMP.test(record.momentumEvidence.observedAt) ||
        !Number.isFinite(Date.parse(record.momentumEvidence.observedAt)) ||
        record.momentumEvidence.observedAt < record.createdAt) fail();
    const confirmation = record.momentumEvidence.confirmationDetail;
    exactObject(confirmation, [
      'numConfirmations', 'momentumHeight', 'momentumHash', 'momentumTimestamp',
    ]);
    if (!Number.isSafeInteger(confirmation.numConfirmations) ||
        confirmation.numConfirmations < 1 ||
        !Number.isSafeInteger(confirmation.momentumHeight) || confirmation.momentumHeight < 1 ||
        !LOWERCASE_HASH_64.test(confirmation.momentumHash) ||
        !Number.isSafeInteger(confirmation.momentumTimestamp) ||
        confirmation.momentumHeight <= record.signedAccountBlock.momentumAcknowledged.height ||
        confirmation.momentumHash === record.signedAccountBlock.momentumAcknowledged.hash) fail();

    exactObject(record.cachedResponse, ['status', 'headers', 'body']);
    exactObject(record.cachedResponse.headers, ['content-type']);
    exactObject(record.cachedResponse.body, [
      'ok', 'message', 'network', 'payer', 'transaction', 'generatedAt',
    ]);
    const expectedBody = {
      ok: true,
      message: 'paid resource unlocked',
      network: requirements.network,
      payer: preflight.payer,
      transaction: preflight.transactionHash,
      generatedAt: record.cachedResponse.body.generatedAt,
    };
    if (typeof expectedBody.generatedAt !== 'string' ||
        !UTC_TIMESTAMP.test(expectedBody.generatedAt) ||
        !Number.isFinite(Date.parse(expectedBody.generatedAt)) ||
        record.cachedResponse.status !== 200 ||
        record.cachedResponse.headers['content-type'] !==
          'application/json; charset=utf-8' ||
        !sameJson(record.cachedResponse.body, expectedBody)) fail();

    exactObject(outcome.final, [
      'status', 'contentType', 'cacheControl', 'vary', 'bodyText',
    ]);
    if (outcome.final.status !== 200 ||
        outcome.final.contentType !== 'application/json; charset=utf-8' ||
        outcome.final.cacheControl !== 'private, no-store, max-age=0' ||
        outcome.final.vary !== 'PAYMENT-SIGNATURE' ||
        outcome.final.bodyText !== JSON_STRINGIFY(expectedBody, null, 2)) fail();
    return FREEZE({ record, preflight });
  } catch {
    fail();
  }
}

function candidateTrust(config) {
  if (config.profileName === GATE_B_CURRENT_TESTNET_PROFILE_NAME) {
    return {
      mode: 'operator-trusted-current-testnet-observation',
      profileName: GATE_B_CURRENT_TESTNET_PROFILE_NAME,
      chainProfile: GATE_B_CURRENT_TESTNET_CHAIN_PROFILE,
      provenance: GATE_B_CURRENT_TESTNET_PROVENANCE,
      nonClaims: publicWsOnceFalseNonClaims(),
    };
  }
  if (config.profileName === OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME) {
    return {
      mode: 'operator-trusted-historical-observation',
      profileName: OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME,
      chainProfile: OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE,
      provenance: OPERATOR_TRUSTED_PUBLIC_TESTNET_PROVENANCE,
      nonClaims: falseNonClaims(),
    };
  }
  fail();
}

async function buildLiveEvidenceRunCandidate(config, context) {
  try {
    const record = exactJournalSnapshot(context.journalSnapshot);
    const preflight = await preflightZenonPayment(
      context.outcome.paymentPayload,
      config.expectedPaymentRequired.accepts[0],
      config.expectedPaymentRequired,
    );
    if (!context.finalEvent || !context.initialObservedAt ||
        context.outcome.final.status !== 200 ||
        context.outcome.settlement.success !== true) fail();
    const timing = v1Timing(context.events);
    const trustInput = candidateTrust(config);
    const manifest = {
      fragmentVersion: 1,
      fragmentType: 'manifest',
      source: {
        repository: 'edgepillar/zenon-x402-poc',
        revision: config.sourceRevision,
        packageVersion: '0.2.0',
        nodeMajor: Number(process.versions.node.split('.')[0]),
      },
      trust: {
        mode: trustInput.mode,
        profileName: trustInput.profileName,
        chainIdentifier: trustInput.chainProfile.chainIdentifier,
        genesisMomentumHash: trustInput.chainProfile.genesisMomentumHash,
        provenance: trustInput.provenance,
        remoteChainAuthenticated: false,
      },
      payment: {
        paymentRequired: config.expectedPaymentRequired,
        selectedIndex: 0,
        intentDigest: paymentIntentDigest(
          config.expectedPaymentRequired,
          config.expectedPaymentRequired.accepts[0],
        ),
        authorizationKey: preflight.authorizationKey,
      },
      nonClaims: trustInput.nonClaims,
    };
    const detail = record.momentumEvidence?.confirmationDetail;
    const chain = {
      fragmentVersion: 1,
      fragmentType: 'chain',
      chain: {
        accountBlock: record.signedAccountBlock,
        confirmation: {
          observedAt: record.momentumEvidence?.observedAt,
          numConfirmations: detail?.numConfirmations,
          momentumHeight: detail?.momentumHeight,
          momentumHash: detail?.momentumHash,
          momentumTimestamp: detail?.momentumTimestamp,
        },
      },
    };
    const http = {
      fragmentVersion: 1,
      fragmentType: 'http',
      http: {
        initial: { status: 402, observedAt: context.initialObservedAt },
        final: {
          status: context.outcome.final.status,
          observedAt: context.finalEvent.utc,
          paymentResponse: context.outcome.settlement,
          contentType: context.outcome.final.contentType,
          cacheControl: context.outcome.final.cacheControl,
          vary: context.outcome.final.vary,
          bodyText: context.outcome.final.bodyText,
        },
      },
    };
    const journal = {
      fragmentVersion: 1,
      fragmentType: 'journal',
      journal: {
        sourceSchemaVersion: 1,
        sourceRevision: context.journalSnapshot.revision,
        activeRecordCount: 1,
        tombstoneCount: 0,
        record,
      },
    };
    const timingFragment = {
      fragmentVersion: 1,
      fragmentType: 'timing',
      timing,
    };
    const fragments = { manifest, chain, http, journal, timing: timingFragment };
    const parsed = {};
    const names = ['manifest', 'chain', 'http', 'journal', 'timing'];
    const encodedFragments = {};
    for (let index = 0; index < names.length; index += 1) {
      const name = names[index];
      const encoded = `${JSON_STRINGIFY(fragments[name])}\n`;
      ownData(encodedFragments, `${name}.json`, encoded);
      ownData(parsed, name, parseLiveEvidenceFragment(encoded, name));
    }
    const bundle = await assembleLiveEvidenceBundle(parsed);
    await verifyLiveEvidenceBundle(bundle);
    return { encodedFragments, bundle };
  } catch {
    fail();
  }
}

export async function assembleLiveEvidenceRunCandidate(config, context, runDirectory) {
  try {
    const { encodedFragments, bundle } = await buildLiveEvidenceRunCandidate(config, context);
    const serialized = await serializeLiveEvidenceBundle(bundle);
    ownData(encodedFragments, 'candidate-bundle.json', serialized);
    ownData(encodedFragments, 'COMPLETE', 'COMPLETE\n');
    await publishPrivateArtifactSet(runDirectory, encodedFragments);
    return serialized;
  } catch {
    fail();
  }
}

function fixedOutcome(status, evidenceEligible) {
  return FREEZE({ status, evidenceEligible });
}

function sampleSubmissionArmed(operations) {
  try {
    return operations && typeof operations.submissionArmed === 'function' &&
      operations.submissionArmed() === true;
  } catch {
    return true;
  }
}

function recoveryOwner(value) {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) fail();
  return value;
}

function capturePublicWsOnceFacilitatorModule(value) {
  try {
    if (!value || typeof value !== 'object' || IS_PROXY(value) || ARRAY_IS_ARRAY(value)) fail();
    const startDescriptor = GET_OWN_PROPERTY_DESCRIPTOR(
      value,
      'startLiveEvidenceFacilitatorWorker',
    );
    const assertDescriptor = GET_OWN_PROPERTY_DESCRIPTOR(
      value,
      'assertLiveEvidenceFacilitatorController',
    );
    if (!startDescriptor || !HAS_OWN(startDescriptor, 'value') ||
        typeof startDescriptor.value !== 'function' || !assertDescriptor ||
        !HAS_OWN(assertDescriptor, 'value') || typeof assertDescriptor.value !== 'function') fail();
    return FREEZE({
      startLiveEvidenceFacilitatorWorker: startDescriptor.value,
      assertLiveEvidenceFacilitatorController: assertDescriptor.value,
    });
  } catch {
    fail();
  }
}

function captureExecutionInjections(injected, publicWsOnce = false) {
  if (typeof publicWsOnce !== 'boolean') fail();
  if (injected === undefined) return FREEZE({});
  if (!injected || typeof injected !== 'object' || IS_PROXY(injected) ||
      ARRAY_IS_ARRAY(injected) || GET_PROTOTYPE_OF(injected) !== OBJECT_PROTOTYPE) fail();
  const allowed = [
    'operations', 'lifecycleObserver', 'monotonicNow', 'delay', 'dependencies',
    'workspaceBoundaryObserver',
  ];
  if (publicWsOnce) {
    append(allowed, 'sourceTreeAttestor');
    append(allowed, 'repositoryModuleLoader');
    append(allowed, 'beforeOriginBind');
  }
  let keys;
  try { keys = REFLECT_OWN_KEYS(injected); } catch { fail(); }
  const captured = {};
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    let allowedKey = false;
    for (let allowedIndex = 0; allowedIndex < allowed.length; allowedIndex += 1) {
      if (key === allowed[allowedIndex]) allowedKey = true;
    }
    const descriptor = typeof key === 'string'
      ? GET_OWN_PROPERTY_DESCRIPTOR(injected, key)
      : undefined;
    if (!allowedKey || !descriptor || !HAS_OWN(descriptor, 'value') ||
        descriptor.enumerable !== true) fail();
    if (key === 'dependencies') {
      const dependencies = descriptor.value;
      if (!dependencies || typeof dependencies !== 'object' || IS_PROXY(dependencies) ||
          ARRAY_IS_ARRAY(dependencies) || GET_PROTOTYPE_OF(dependencies) !== OBJECT_PROTOTYPE) fail();
      const dependencyFields = [
        'probeZenonRoleReadiness', 'resolveAddresses', 'requestHttps',
        'createZenonClient', 'forkProcess',
      ];
      let dependencyKeys;
      try { dependencyKeys = REFLECT_OWN_KEYS(dependencies); } catch { fail(); }
      const dependencySnapshot = {};
      for (let dependencyIndex = 0;
        dependencyIndex < dependencyKeys.length;
        dependencyIndex += 1) {
        const dependencyKey = dependencyKeys[dependencyIndex];
        const dependencyDescriptor = typeof dependencyKey === 'string'
          ? GET_OWN_PROPERTY_DESCRIPTOR(dependencies, dependencyKey)
          : undefined;
        if (!dependencyFields.includes(dependencyKey) || !dependencyDescriptor ||
            !HAS_OWN(dependencyDescriptor, 'value') || dependencyDescriptor.enumerable !== true ||
            typeof dependencyDescriptor.value !== 'function') fail();
        ownData(dependencySnapshot, dependencyKey, dependencyDescriptor.value);
      }
      ownData(captured, key, FREEZE(dependencySnapshot));
    } else {
      if ((key === 'workspaceBoundaryObserver' || key === 'sourceTreeAttestor' ||
          key === 'repositoryModuleLoader' || key === 'beforeOriginBind') &&
          typeof descriptor.value !== 'function') fail();
      ownData(captured, key, descriptor.value);
    }
  }
  return FREEZE(captured);
}

function exactNativePromise(value) {
  if (!IS_PROMISE(value) || IS_PROXY(value) ||
      GET_PROTOTYPE_OF(value) !== PROMISE_PROTOTYPE ||
      GET_OWN_PROPERTY_DESCRIPTOR(value, 'then') !== undefined) fail();
  return value;
}

async function allowExistingDirectOriginBind() {
  return true;
}

export async function executeLiveEvidenceRun(options, injected = {}) {
  let runDirectory;
  let controller;
  let operations;
  let preflightState;
  let submissionArmed = false;
  let boundControllerCleanup = operation => boundedPromise(operation, MAX_RPC_TIMEOUT_MS);
  try {
    injected = captureExecutionInjections(injected);
    const runOptions = exactPreflightOptions(options);
    const preflight = await performLiveEvidencePreflight(runOptions, true);
    preflightState = preflight.state;
    const config = preflightState.config;
    boundControllerCleanup = operation => boundedPromise(operation, config.runtime.rpcTimeoutMs);
    parseLiveEvidenceRunConfig(`${JSON_STRINGIFY(config)}\n`);
    runDirectory = await createRunDirectory(preflightState.workspaceRoot, runOptions.runName);
    const collector = createLifecycleCollector();
    operations = injected.operations ?? await defaultOperations(
      runOptions,
      config,
      runDirectory,
      preflightState,
      injected.dependencies,
    );
    const requiredOperations = [
      'probeBuyerReadiness', 'probePublicEndpoint', 'startFacilitator', 'readBuyerWallet', 'paidFetch',
      'reconcilePayment', 'assembleCandidate', 'submissionArmed',
    ];
    for (let index = 0; index < requiredOperations.length; index += 1) {
      if (typeof operations[requiredOperations[index]] !== 'function') fail();
    }
    const coordinatorObserver = injected.lifecycleObserver ?? createLiveEvidenceObserver();

    await operations.probeBuyerReadiness({ config });
    controller = await operations.startFacilitator({
      config,
      recovery: false,
    });
    if (!controller || typeof controller.start !== 'function' ||
        typeof controller.snapshotObservations !== 'function' ||
        typeof controller.closeAndSnapshot !== 'function' || typeof controller.exit !== 'function' ||
        typeof controller.terminate !== 'function' || typeof controller.exited !== 'function' ||
        typeof controller.poisoned !== 'function') fail();
    await controller.start();
    await operations.probePublicEndpoint({ config });

    let wallet;
    const openWallet = async () => {
      if (wallet === undefined) wallet = await operations.readBuyerWallet({ config });
      return wallet;
    };
    if (!collector.record(coordinatorObserver, 'runner', 'challenge_request_started')) fail();
    let initialEvent;
    const onChallenge = async paymentRequired => {
      if (!paymentRequiredEqual(paymentRequired, config.expectedPaymentRequired)) fail();
      initialEvent = collector.record(coordinatorObserver, 'runner', 'challenge_402_received');
      if (!initialEvent) fail();
      return initialEvent;
    };
    let outcome;
    try {
      outcome = await operations.paidFetch({
        config,
        lifecycleObserver: coordinatorObserver,
        openWallet,
        onChallenge,
      });
    } catch (error) {
      if (error?.retrySamePayment !== true) throw error;
      outcome = { kind: 'recovery', owner: error };
    }
    if (ARRAY_IS_ARRAY(outcome?.buyerObservations)) collector.add(outcome.buyerObservations);
    else collector.markIneligible();
    submissionArmed = sampleSubmissionArmed(operations) || outcome?.kind === 'recovery';

    let recovered = false;
    let attempts = 0;
    let restartEpoch = 0;
    const seenOwners = new WeakSet();
    const monotonicNow = injected.monotonicNow ?? (() => Math.floor(performance.now()));
    if (typeof monotonicNow !== 'function') fail();
    let recoveryStartedAt;
    let recoveryDeadline;
    let recoveryWallDeadline;
    const recoveryNow = () => {
      let now;
      try {
        now = Reflect.apply(monotonicNow, undefined, []);
      } catch {
        fail();
      }
      if (!Number.isSafeInteger(now) || now < 0) fail();
      if (recoveryStartedAt !== undefined && now < recoveryStartedAt) fail();
      return now;
    };
    const startRecoveryDeadline = () => {
      if (recoveryStartedAt !== undefined) return;
      recoveryStartedAt = recoveryNow();
      recoveryDeadline = recoveryStartedAt + config.runtime.maxRecoveryElapsedMs;
      recoveryWallDeadline = Date.now() + config.runtime.maxRecoveryElapsedMs;
      if (!Number.isSafeInteger(recoveryDeadline) ||
          !Number.isSafeInteger(recoveryWallDeadline)) fail();
    };
    const recoveryRemaining = () => Math.min(
      recoveryDeadline - recoveryNow(),
      recoveryWallDeadline - Date.now(),
    );
    const awaitRecovery = async operation => {
      startRecoveryDeadline();
      const remaining = recoveryRemaining();
      if (remaining <= 0) fail();
      return boundedPromise(operation, remaining);
    };
    boundControllerCleanup = operation => {
      if (recoveryStartedAt === undefined) {
        return boundedPromise(operation, config.runtime.rpcTimeoutMs);
      }
      let remaining = 1;
      try {
        remaining = Math.max(1, recoveryRemaining());
      } catch {
        remaining = 1;
      }
      return boundedPromise(operation, remaining);
    };
    while (outcome?.kind === 'recovery') {
      recovered = true;
      collector.markIneligible();
      submissionArmed = true;
      startRecoveryDeadline();
      attempts += 1;
      if (attempts > config.runtime.maxRecoveryAttempts) fail();
      const owner = recoveryOwner(outcome.owner);
      if (seenOwners.has(owner)) fail();
      seenOwners.add(owner);
      if (await awaitRecovery(controller.poisoned())) {
        await awaitRecovery(controller.exit());
        if (!await awaitRecovery(controller.exited())) fail();
        restartEpoch += 1;
        if (restartEpoch > attempts) fail();
        controller = await awaitRecovery(operations.startFacilitator({
          config,
          recovery: true,
          restartEpoch,
        }));
        if (!controller || typeof controller.start !== 'function' ||
            typeof controller.snapshotObservations !== 'function' ||
            typeof controller.closeAndSnapshot !== 'function' ||
            typeof controller.exit !== 'function' || typeof controller.terminate !== 'function' ||
            typeof controller.exited !== 'function' || typeof controller.poisoned !== 'function') fail();
        await awaitRecovery(controller.start());
      }
      if (config.runtime.recoveryDelayMs > 0) {
        const delay = injected.delay ?? (milliseconds => new Promise(resolveDelay => {
          setTimeout(resolveDelay, milliseconds);
        }));
        await awaitRecovery(delay(config.runtime.recoveryDelayMs));
      }
      outcome = await awaitRecovery(operations.reconcilePayment(owner));
      if (recoveryNow() > recoveryDeadline) fail();
    }
    if (!outcome || outcome.kind !== 'delivered') fail();
    let finalEvent;
    try {
      finalEvent = recordLiveEvidencePhase(
        coordinatorObserver,
        'runner',
        'paid_response_received',
      );
    } catch {
      collector.markIneligible();
    }
    let facilitatorState;
    if (typeof controller.snapshotObservations === 'function') {
      facilitatorState = recovered
        ? await awaitRecovery(controller.snapshotObservations())
        : await controller.snapshotObservations();
    }
    if (!facilitatorState || facilitatorState.evidenceEligible !== true ||
        !ARRAY_IS_ARRAY(facilitatorState.events)) {
      collector.markIneligible();
    } else {
      collector.add(facilitatorState.events);
    }
    if (finalEvent) collector.add([finalEvent]);
    else collector.markIneligible();
    const journalSnapshot = recovered
      ? await awaitRecovery(controller.closeAndSnapshot())
      : await controller.closeAndSnapshot();
    controller = undefined;
    collector.close();
    const captured = collector.snapshot();

    if (recovered || captured.evidenceEligible !== true) {
      return fixedOutcome('resolved', false);
    }
    const timeline = finalizeLiveEvidenceTimeline(captured.events);
    v1Timing(timeline);
    exactJournalSnapshot(journalSnapshot);
    await operations.assembleCandidate({
      config,
      outcome,
      events: timeline,
      initialObservedAt: outcome.initialObservedAt ?? initialEvent?.utc,
      finalEvent,
      journalSnapshot,
      runDirectory,
    });
    return fixedOutcome('complete', true);
  } catch {
    submissionArmed = submissionArmed || sampleSubmissionArmed(operations);
    if (controller) {
      try {
        if (submissionArmed && typeof controller.terminate === 'function') {
          await boundControllerCleanup(controller.terminate());
        } else {
          await boundControllerCleanup(controller.exit());
        }
      } catch {}
    }
    if (runDirectory && !submissionArmed) {
      try { await rm(runDirectory, { recursive: true, force: true }); } catch {}
    }
    fail();
  } finally {
    if (preflightState) {
      await disposeVerifiedInput(preflightState.configInput);
      await disposeVerifiedInput(preflightState.buyerRpcInput);
      await disposeVerifiedInput(preflightState.buyerWalletInput);
      await disposeVerifiedInput(preflightState.facilitatorRpcInput);
      await disposeVerifiedInput(preflightState.hostnameSourceInput);
    }
  }
}

async function executeCurrentTestnetOneShotRun(
  options,
  injected,
  currentTestnetWss,
) {
  let runDirectory;
  let runDirectoryState;
  let controller;
  let preflightState;
  let boundControllerCleanup = operation => boundedPromise(operation, MAX_RPC_TIMEOUT_MS);
  try {
    if (typeof currentTestnetWss !== 'boolean') fail();
    injected = captureExecutionInjections(injected, true);
    const executionMode = currentTestnetWss
      ? CURRENT_TESTNET_WSS_ONCE_EXECUTION_MODE
      : PUBLIC_WS_ONCE_EXECUTION_MODE;
    const runOptions = currentTestnetWss
      ? exactCurrentTestnetWssOnceOptions(options)
      : exactPublicWsOnceOptions(options);
    const preflight = await performPublicWsOncePreflight(
      runOptions,
      true,
      currentTestnetWss,
    );
    preflightState = preflight.state;
    const config = preflightState.config;
    boundControllerCleanup = operation => boundedPromise(operation, config.runtime.rpcTimeoutMs);
    (currentTestnetWss
      ? parseCurrentTestnetWssOnceRunConfig
      : parsePublicWsOnceRunConfig)(`${JSON_STRINGIFY(config)}\n`);
    const sourceTreeAttestor = injected.sourceTreeAttestor ?? attestPublicWsOnceSourceTree;
    if (await Reflect.apply(sourceTreeAttestor, undefined, [config.sourceRevision]) !== true) {
      fail();
    }
    const repositoryModuleLoader = injected.repositoryModuleLoader ??
      (() => import('./live-evidence-facilitator-worker.js'));
    const facilitatorWorkerModule = capturePublicWsOnceFacilitatorModule(
      await Reflect.apply(repositoryModuleLoader, undefined, []),
    );

    const assertBoundary = async () => {
      await assertPrivateDirectoryState(preflightState.workspaceState);
      if (runDirectoryState) await assertPrivateDirectoryState(runDirectoryState);
    };
    const boundaryPoint = async phase => {
      await assertBoundary();
      if (injected.workspaceBoundaryObserver) {
        await Reflect.apply(injected.workspaceBoundaryObserver, undefined, [phase]);
      }
      await assertBoundary();
    };

    // This owner-controlled workspace guard is consumed before worker creation,
    // RPC, wallet access, signing, or publication. The retained directory handle
    // detects namespace drift at every checked boundary and is never used to
    // claim confinement against an active same-UID actor.
    await boundaryPoint('before-consumed-marker');
    if (await Reflect.apply(sourceTreeAttestor, undefined, [config.sourceRevision]) !== true) {
      fail();
    }
    await persistPublicWsOnceConsumedMarkerInState(preflightState.workspaceState);
    await boundaryPoint('after-consumed-marker');
    runDirectory = await createRunDirectory(preflightState.workspaceRoot, runOptions.runName);
    runDirectoryState = await capturePrivateDirectoryState(runDirectory, false);
    await boundaryPoint('after-run-directory');

    const collector = createLifecycleCollector();
    await boundaryPoint('before-operations');
    const operations = injected.operations ?? await defaultOperations(
      runOptions,
      config,
      runDirectory,
      preflightState,
      injected.dependencies,
      executionMode,
      assertBoundary,
      {
        workspace: preflightState.workspaceState.identity,
        runDirectory: runDirectoryState.identity,
      },
      facilitatorWorkerModule,
    );
    const requiredOperations = [
      'probeBuyerReadiness', 'probePublicEndpoint', 'startFacilitator',
      'readBuyerWallet', 'paidFetch',
    ];
    for (let index = 0; index < requiredOperations.length; index += 1) {
      if (typeof operations[requiredOperations[index]] !== 'function') fail();
    }
    const coordinatorObserver = injected.lifecycleObserver ?? createLiveEvidenceObserver();
    await boundaryPoint('before-facilitator-create');
    controller = await operations.startFacilitator({ config, recovery: false });
    if (!controller || typeof controller.preload !== 'function' ||
        typeof controller.start !== 'function' ||
        typeof controller.snapshotObservations !== 'function' ||
        typeof controller.closeAndSnapshot !== 'function' ||
        typeof controller.terminate !== 'function') fail();
    await boundaryPoint('after-facilitator-create');
    await boundaryPoint('before-facilitator-preload');
    await controller.preload();
    await boundaryPoint('after-facilitator-preload');
    await boundaryPoint('before-final-source-attestation');
    if (await Reflect.apply(sourceTreeAttestor, undefined, [config.sourceRevision]) !== true) {
      fail();
    }
    // No injected observer or repo-local path-based module load is initiated
    // after this final byte attestation and before the first RPC effect.
    await assertBoundary();
    await operations.probeBuyerReadiness({ config });
    await boundaryPoint('after-buyer-readiness');
    const beforeOriginBind = injected.beforeOriginBind ?? allowExistingDirectOriginBind;
    const originReleased = await exactNativePromise(
      Reflect.apply(beforeOriginBind, undefined, []),
    );
    if (originReleased !== true) fail();
    await boundaryPoint('after-origin-release');
    await controller.start();
    await boundaryPoint('after-facilitator-start');
    await boundaryPoint('before-public-endpoint');
    await operations.probePublicEndpoint({ config });
    await boundaryPoint('after-public-endpoint');

    let wallet;
    const openWallet = async () => {
      if (wallet === undefined) wallet = await operations.readBuyerWallet({ config });
      return wallet;
    };
    if (!collector.record(coordinatorObserver, 'runner', 'challenge_request_started')) fail();
    let initialEvent;
    const onChallenge = async paymentRequired => {
      if (!paymentRequiredEqual(paymentRequired, config.expectedPaymentRequired)) fail();
      initialEvent = collector.record(coordinatorObserver, 'runner', 'challenge_402_received');
      if (!initialEvent) fail();
      return initialEvent;
    };
    await boundaryPoint('before-paid-fetch');
    const outcome = await operations.paidFetch({
      config,
      lifecycleObserver: coordinatorObserver,
      openWallet,
      onChallenge,
    });
    await boundaryPoint('after-paid-fetch');
    if (!outcome || outcome.kind !== 'delivered' ||
        !ARRAY_IS_ARRAY(outcome.buyerObservations)) fail();
    collector.add(outcome.buyerObservations);
    let finalEvent;
    try {
      finalEvent = recordLiveEvidencePhase(
        coordinatorObserver,
        'runner',
        'paid_response_received',
      );
    } catch {
      fail();
    }
    await boundaryPoint('before-facilitator-snapshot');
    const facilitatorState = await controller.snapshotObservations();
    await boundaryPoint('after-facilitator-snapshot');
    if (!facilitatorState || facilitatorState.evidenceEligible !== true ||
        !ARRAY_IS_ARRAY(facilitatorState.events)) fail();
    collector.add(facilitatorState.events);
    collector.add([finalEvent]);
    await boundaryPoint('before-facilitator-close');
    const journalSnapshot = await controller.closeAndSnapshot();
    controller = undefined;
    await boundaryPoint('after-facilitator-close');
    collector.close();
    const captured = collector.snapshot();
    if (captured.evidenceEligible !== true) fail();
    if (!initialEvent || outcome.initialObservedAt !== initialEvent.utc) fail();
    const timeline = finalizeLiveEvidenceTimeline(captured.events);
    v1Timing(timeline);
    await validatePublicWsOncePendingState(config, outcome, journalSnapshot);
    await boundaryPoint('after-pending-validation');
    const candidate = await buildLiveEvidenceRunCandidate(config, {
      outcome,
      events: timeline,
      initialObservedAt: outcome.initialObservedAt,
      finalEvent,
      journalSnapshot,
    });
    await boundaryPoint('after-pending-candidate');
    await boundaryPoint('before-pending-state');
    await assertPublicWsOnceRetainedState(
      preflightState.workspaceState,
      runDirectoryState,
      false,
      journalSnapshot,
      undefined,
      executionMode,
    );
    await assertPublicWsOnceInputGenerations(preflightState);
    await publishPublicWsOncePendingSet(
      runDirectory,
      candidate.encodedFragments,
      assertBoundary,
      executionMode,
    );
    await assertPublicWsOnceRetainedState(
      preflightState.workspaceState,
      runDirectoryState,
      true,
      journalSnapshot,
      candidate.encodedFragments,
      executionMode,
    );
    await assertPublicWsOnceInputGenerations(preflightState);
    await boundaryPoint('after-pending-state');
    return fixedOutcome('pending-independent-verification', false);
  } catch {
    if (controller) {
      try { await boundControllerCleanup(controller.terminate()); } catch {}
    }
    // The fixed consumed marker and any run directory are intentionally preserved.
    fail();
  } finally {
    if (preflightState) {
      await disposeVerifiedInput(preflightState.configInput);
      await disposeVerifiedInput(preflightState.buyerRpcInput);
      await disposeVerifiedInput(preflightState.buyerWalletInput);
      await disposeVerifiedInput(preflightState.facilitatorRpcInput);
      await disposeVerifiedInput(preflightState.authorizationInput);
      await disposeVerifiedInput(preflightState.hostnameSourceInput);
      await disposePrivateDirectoryState(preflightState.workspaceState);
    }
    await disposePrivateDirectoryState(runDirectoryState);
  }
}

export async function executePublicWsOnceRun(options, injected = {}) {
  return executeCurrentTestnetOneShotRun(options, injected, false);
}

export async function executeCurrentTestnetWssOnceRun(options, injected = {}) {
  return executeCurrentTestnetOneShotRun(options, injected, true);
}

function independentFragmentSetDigest(fragmentTexts) {
  try {
    const digests = {};
    for (let index = 0; index < INDEPENDENT_FINALIZER_FRAGMENT_NAMES.length; index += 1) {
      const name = INDEPENDENT_FINALIZER_FRAGMENT_NAMES[index];
      const text = fragmentTexts[`${name}.json`];
      if (typeof text !== 'string' || text.length < 1) fail();
      ownData(digests, name, sha256Hex(
        `${INDEPENDENT_FRAGMENT_DIGEST_DOMAIN}:${name}\0${text}`,
      ));
    }
    return sha256Hex(
      `${INDEPENDENT_FRAGMENT_SET_DIGEST_DOMAIN}\0${canonicalJson(digests)}`,
    );
  } catch {
    fail();
  }
}

function independentAccountBlockDigest(accountBlock) {
  return sha256Hex(
    `${INDEPENDENT_ACCOUNT_BLOCK_DIGEST_DOMAIN}\0${canonicalJson(accountBlock)}`,
  );
}

function independentInclusionMomentumDigest(momentum) {
  return sha256Hex(
    `${INDEPENDENT_INCLUSION_MOMENTUM_DIGEST_DOMAIN}\0${canonicalJson(momentum)}`,
  );
}

function independentPinnedRouteDigest(route) {
  return sha256Hex(
    `${INDEPENDENT_ROUTE_DIGEST_DOMAIN}\0${canonicalJson({
      transport: INDEPENDENT_FINALIZER_TRANSPORT,
      hostname: route.hostname,
      addresses: route.target.addresses,
    })}`,
  );
}

function sameNetworkAddress(left, right) {
  return left.family === right.family && left.address === right.address;
}

async function resolveIndependentFinalizerRoute(endpointConfig, resolver) {
  try {
    const hostname = new URL(endpointConfig.rpcUrl).hostname;
    const target = await resolvePublicTarget(
      `https://${hostname}/paid`,
      endpointConfig.dnsTimeoutMs,
      resolver,
    );
    if (target.hostname === endpointConfig.originalRoute.hostname) fail();
    const candidates = [];
    for (let index = 0; index < target.addresses.length; index += 1) {
      const observed = target.addresses[index];
      const canonicalObserved = {
        address: observed.family === 4
          ? observed.address.split('.').map(part => String(Number(part))).join('.')
          : new URL(`https://[${observed.address}]/`).hostname.slice(1, -1).toLowerCase(),
        family: observed.family,
      };
      for (let prior = 0; prior < endpointConfig.originalRoute.addresses.length; prior += 1) {
        if (sameNetworkAddress(canonicalObserved, endpointConfig.originalRoute.addresses[prior])) {
          fail();
        }
      }
      if (canonicalObserved.family === endpointConfig.selectedFamily) {
        append(candidates, canonicalObserved);
      }
    }
    candidates.sort((left, right) => left.address.localeCompare(right.address));
    if (candidates.length < 1) fail();
    const selected = FREEZE(candidates[0]);
    return FREEZE({
      hostname,
      target: FREEZE({ hostname, addresses: FREEZE([selected]) }),
      selected,
    });
  } catch {
    fail();
  }
}

function captureIndependentRawTransport(value) {
  try {
    exactObject(value, ['request', 'abort', 'close']);
    for (const field of ['request', 'abort', 'close']) {
      if (typeof value[field] !== 'function' || IS_PROXY(value[field])) fail();
    }
    return value;
  } catch {
    fail();
  }
}

function createIndependentFinalizerHttpsRawTransport(endpointConfig, route) {
  if (route.target.addresses.length !== 1 ||
      route.selected !== route.target.addresses[0] ||
      route.selected.family !== endpointConfig.selectedFamily) fail();
  const parsed = new URL(endpointConfig.rpcUrl);
  let activeRequest;
  let closed = false;
  let closing = false;
  let connection;
  let connectionCount = 0;
  let disconnected = false;
  let hardShutdownPerformed = false;
  let poisoned = false;
  const agent = new HttpsAgent({
    keepAlive: true,
    keepAliveMsecs: endpointConfig.rpcTimeoutMs,
    maxFreeSockets: 1,
    maxSockets: 1,
    maxTotalSockets: 1,
    scheduling: 'fifo',
  });
  const createConnection = agent.createConnection;
  agent.createConnection = function createOneConnection(options, callback) {
    if (connectionCount !== 0 || closed || closing || poisoned) fail();
    connectionCount += 1;
    const socket = Reflect.apply(createConnection, this, [{
      ...options,
      rejectUnauthorized: true,
      servername: route.hostname,
    }, callback]);
    if (!socket || IS_PROXY(socket)) fail();
    connection = socket;
    socket.once('close', () => {
      if (!closing) {
        disconnected = true;
        poisoned = true;
      }
    });
    socket.once('error', () => {
      poisoned = true;
    });
    return socket;
  };

  const hardShutdown = () => {
    if (hardShutdownPerformed) return false;
    hardShutdownPerformed = true;
    poisoned = true;
    closed = true;
    closing = false;
    const request = activeRequest;
    activeRequest = undefined;
    try { request?.destroy(); } catch {}
    try { connection?.destroy(); } catch {}
    try { agent.destroy(); } catch {}
    return true;
  };

  const transport = {
    request(requestText, timeoutMs) {
      if (closed || closing || poisoned || disconnected || activeRequest ||
          typeof requestText !== 'string' || requestText.length < 1 ||
          !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 ||
          timeoutMs > MAX_RPC_TIMEOUT_MS) fail();
      const body = Buffer.from(requestText, 'utf8');
      if (body.length > 64 * 1024) fail();
      return new Promise((resolveRequest, rejectRequest) => {
        let request;
        let settled = false;
        const finish = (error, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (activeRequest === request) activeRequest = undefined;
          body.fill(0);
          if (error) {
            poisoned = true;
            rejectRequest(new LiveEvidenceRunError());
          } else {
            resolveRequest(value);
          }
        };
        const timer = setTimeout(() => {
          try { request?.destroy(); } catch {}
          finish(new LiveEvidenceRunError());
        }, timeoutMs);
        try {
          request = requestHttps(parsed, {
            agent,
            autoSelectFamily: false,
            family: route.selected.family,
            headers: {
              accept: 'application/json',
              connection: 'keep-alive',
              'content-length': body.length,
              'content-type': 'application/json',
            },
            lookup: pinnedLookup(route.target),
            maxHeaderSize: 16 * 1024,
            method: 'POST',
            rejectUnauthorized: true,
            servername: route.hostname,
          }, response => {
            const chunks = [];
            let total = 0;
            const contentType = response.headers['content-type'];
            if (response.statusCode !== 200 || response.headers.location !== undefined ||
                response.headers.upgrade !== undefined ||
                response.headers['content-encoding'] !== undefined ||
                response.headers.connection === 'close' ||
                (contentType !== 'application/json' &&
                  contentType !== 'application/json; charset=utf-8')) {
              try { request.destroy(); } catch {}
              finish(new LiveEvidenceRunError());
              return;
            }
            response.on('data', chunk => {
              total += Buffer.byteLength(chunk);
              if (total > INDEPENDENT_FINALIZER_RPC_MAX_BYTES) {
                try { request.destroy(); } catch {}
                finish(new LiveEvidenceRunError());
                return;
              }
              append(chunks, Buffer.from(chunk));
            });
            response.once('aborted', () => finish(new LiveEvidenceRunError()));
            response.once('error', () => finish(new LiveEvidenceRunError()));
            response.once('end', () => {
              if (!response.complete || disconnected || poisoned || !connection ||
                  connection.destroyed || connection.authorized !== true ||
                  connection.authorizationError) {
                finish(new LiveEvidenceRunError());
                return;
              }
              const responseBytes = Buffer.concat(chunks, total);
              try {
                finish(null, responseBytes.toString('utf8'));
              } finally {
                responseBytes.fill(0);
                for (let index = 0; index < chunks.length; index += 1) chunks[index].fill(0);
              }
            });
          });
          activeRequest = request;
          request.once('socket', socket => {
            if (connectionCount !== 1 || (connection && socket !== connection)) {
              try { request.destroy(); } catch {}
              finish(new LiveEvidenceRunError());
            }
          });
          request.once('error', () => finish(new LiveEvidenceRunError()));
          request.write(body);
          request.end();
        } catch {
          try { request?.destroy(); } catch {}
          finish(new LiveEvidenceRunError());
        }
      });
    },
    abort() {
      hardShutdown();
      return true;
    },
    close() {
      if (activeRequest || poisoned || disconnected) {
        hardShutdown();
        return Promise.reject(new LiveEvidenceRunError());
      }
      if (closed || closing) return Promise.reject(new LiveEvidenceRunError());
      closing = true;
      return new Promise((resolveClose, rejectClose) => {
        let settled = false;
        const finish = error => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          closed = true;
          closing = false;
          try { agent.destroy(); } catch {}
          if (error) rejectClose(new LiveEvidenceRunError());
          else resolveClose(true);
        };
        const timer = setTimeout(() => {
          try { connection?.destroy(); } catch {}
          finish(new LiveEvidenceRunError());
        }, endpointConfig.rpcTimeoutMs);
        if (!connection || connectionCount !== 1 || disconnected || connection.destroyed ||
            poisoned) return finish(new LiveEvidenceRunError());
        connection.once('error', () => finish(new LiveEvidenceRunError()));
        connection.once('close', hadError => finish(hadError ? new LiveEvidenceRunError() : null));
        try { connection.end(); } catch { finish(new LiveEvidenceRunError()); }
      });
    },
  };
  return FREEZE(transport);
}

function captureIndependentFinalizerInjections(injected) {
  const defaults = {
    resolveAddresses: lookupDns,
    createRawTransport: createIndependentFinalizerHttpsRawTransport,
    sourceTreeAttestor: attestPublicWsOnceSourceTree,
    boundaryObserver: undefined,
    artifactObserver: undefined,
  };
  if (injected === undefined) return defaults;
  if (!injected || typeof injected !== 'object' || IS_PROXY(injected) ||
      ARRAY_IS_ARRAY(injected) || GET_PROTOTYPE_OF(injected) !== OBJECT_PROTOTYPE) fail();
  const allowed = [
    'resolveAddresses', 'createRawTransport', 'sourceTreeAttestor',
    'boundaryObserver', 'artifactObserver',
  ];
  let keys;
  try { keys = REFLECT_OWN_KEYS(injected); } catch { fail(); }
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(injected, key);
    if (typeof key !== 'string' || !allowed.includes(key) || !descriptor ||
        !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true ||
        typeof descriptor.value !== 'function' || IS_PROXY(descriptor.value)) fail();
    defaults[key] = descriptor.value;
  }
  return defaults;
}

async function dispatchIndependentFinalizerRpc(
  transport,
  seenResponseIds,
  requestId,
  method,
  params,
  timeoutMs,
) {
  let timer;
  try {
    if (!Number.isSafeInteger(requestId) || requestId < 1 || requestId > 7 ||
        INDEPENDENT_FINALIZER_TRANSCRIPT[requestId - 1] !== method ||
        seenResponseIds.has(requestId) || !ARRAY_IS_ARRAY(params)) fail();
    const requestText = JSON_STRINGIFY({ jsonrpc: '2.0', id: requestId, method, params });
    const rawPromise = Reflect.apply(transport.request, transport, [requestText, timeoutMs]);
    if (!IS_PROMISE(rawPromise) || IS_PROXY(rawPromise) ||
        GET_PROTOTYPE_OF(rawPromise) !== PROMISE_PROTOTYPE ||
        GET_OWN_PROPERTY_DESCRIPTOR(rawPromise, 'then') !== undefined) fail();
    const responseText = await new Promise((resolveResponse, rejectResponse) => {
      let settled = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) rejectResponse(new LiveEvidenceRunError());
        else resolveResponse(value);
      };
      timer = setTimeout(() => {
        try { Reflect.apply(transport.abort, transport, []); } catch {}
        finish(new LiveEvidenceRunError());
      }, timeoutMs);
      rawPromise.then(
        value => finish(null, value),
        () => finish(new LiveEvidenceRunError()),
      );
    });
    if (typeof responseText !== 'string' ||
        BUFFER_BYTE_LENGTH(responseText, 'utf8') < 1 ||
        BUFFER_BYTE_LENGTH(responseText, 'utf8') > INDEPENDENT_FINALIZER_RPC_MAX_BYTES) fail();
    const response = parseStrictJson(responseText, INDEPENDENT_FINALIZER_RPC_MAX_BYTES);
    exactObject(response, ['jsonrpc', 'id', 'result']);
    if (response.jsonrpc !== '2.0' || response.id !== requestId ||
        seenResponseIds.has(response.id)) fail();
    seenResponseIds.add(response.id);
    return response.result;
  } catch {
    clearTimeout(timer);
    fail();
  }
}

function exactIndependentNetworkPeer(value) {
  exactObject(value, ['publicKey', 'ip', 'name']);
  stringValue(value.publicKey, 4096);
  stringValue(value.ip, 4096);
  stringValue(value.name, 4096);
  return value;
}

function validateIndependentNetworkInfo(value, endpointConfig) {
  try {
    exactObject(value, ['numPeers', 'self', 'peers']);
    integer(value.numPeers, 1, INDEPENDENT_FINALIZER_MAX_HEADERS);
    exactIndependentNetworkPeer(value.self);
    if (value.self.publicKey === endpointConfig.originalRoute.nodePublicKey ||
        !ARRAY_IS_ARRAY(value.peers) ||
        value.peers.length > INDEPENDENT_FINALIZER_MAX_HEADERS) fail();
    for (let index = 0; index < value.peers.length; index += 1) {
      exactIndependentNetworkPeer(value.peers[index]);
    }
    return value;
  } catch {
    fail();
  }
}

function validateIndependentSyncInfo(value) {
  try {
    exactObject(value, ['state', 'currentHeight', 'targetHeight']);
    if (value.state !== 2) fail();
    integer(value.currentHeight, 1, Number.MAX_SAFE_INTEGER);
    integer(value.targetHeight, 1, Number.MAX_SAFE_INTEGER);
    if (value.currentHeight < value.targetHeight) fail();
    return value;
  } catch {
    fail();
  }
}

function validateIndependentMomentumHeader(value) {
  try {
    exactObject(value, ['address', 'hash', 'height']);
    stringValue(value.address, 128);
    if (typeof value.hash !== 'string' || !LOWERCASE_HASH_64.test(value.hash)) fail();
    integer(value.height, 1, Number.MAX_SAFE_INTEGER);
    return value;
  } catch {
    fail();
  }
}

function validateIndependentMomentum(value) {
  try {
    exactObject(value, [
      'version', 'chainIdentifier', 'hash', 'previousHash', 'height', 'timestamp',
      'data', 'content', 'changesHash', 'publicKey', 'signature', 'producer',
    ]);
    if (value.version !== 1 ||
        typeof value.hash !== 'string' || !LOWERCASE_HASH_64.test(value.hash) ||
        typeof value.previousHash !== 'string' ||
        !LOWERCASE_HASH_64.test(value.previousHash) ||
        typeof value.changesHash !== 'string' ||
        !LOWERCASE_HASH_64.test(value.changesHash)) fail();
    integer(value.chainIdentifier, 1, Number.MAX_SAFE_INTEGER);
    integer(value.height, 1, Number.MAX_SAFE_INTEGER);
    integer(value.timestamp, 0, Number.MAX_SAFE_INTEGER);
    if (typeof value.data !== 'string' || value.data.length > 128 * 1024 ||
        !/^(?:[0-9a-f]{2})*$/.test(value.data)) fail();
    if (!ARRAY_IS_ARRAY(value.content) ||
        value.content.length > INDEPENDENT_FINALIZER_MAX_HEADERS) fail();
    const headers = new Set();
    for (let index = 0; index < value.content.length; index += 1) {
      const header = validateIndependentMomentumHeader(value.content[index]);
      const key = canonicalJson(header);
      if (headers.has(key)) fail();
      headers.add(key);
    }
    if (typeof value.publicKey !== 'string' || value.publicKey.length > 4096 ||
        typeof value.signature !== 'string' || value.signature.length > 4096) fail();
    stringValue(value.producer, 128);
    return value;
  } catch {
    fail();
  }
}

function projectIndependentRpcAccountBlock(value) {
  try {
    const baseFields = [
      'version', 'chainIdentifier', 'blockType', 'hash', 'previousHash', 'height',
      'momentumAcknowledged', 'address', 'toAddress', 'amount', 'tokenStandard',
      'fromBlockHash', 'data', 'fusedPlasma', 'difficulty', 'nonce', 'publicKey',
      'signature',
    ];
    exactObject(value, [
      ...baseFields, 'token', 'descendantBlocks', 'basePlasma', 'usedPlasma',
      'changesHash', 'confirmationDetail', 'pairedAccountBlock',
    ]);
    if (value.token !== null &&
        (!value.token || typeof value.token !== 'object' || ARRAY_IS_ARRAY(value.token))) fail();
    if (!ARRAY_IS_ARRAY(value.descendantBlocks) ||
        value.descendantBlocks.length > INDEPENDENT_FINALIZER_MAX_HEADERS) fail();
    integer(value.basePlasma, 0, Number.MAX_SAFE_INTEGER);
    integer(value.usedPlasma, 0, Number.MAX_SAFE_INTEGER);
    if (typeof value.changesHash !== 'string' ||
        !LOWERCASE_HASH_64.test(value.changesHash) ||
        (value.pairedAccountBlock !== null &&
          (!value.pairedAccountBlock || typeof value.pairedAccountBlock !== 'object' ||
            ARRAY_IS_ARRAY(value.pairedAccountBlock)))) fail();
    exactObject(value.confirmationDetail, [
      'numConfirmations', 'momentumHeight', 'momentumHash', 'momentumTimestamp',
    ]);
    integer(value.confirmationDetail.numConfirmations, 1, Number.MAX_SAFE_INTEGER);
    integer(value.confirmationDetail.momentumHeight, 1, Number.MAX_SAFE_INTEGER);
    integer(value.confirmationDetail.momentumTimestamp, 0, Number.MAX_SAFE_INTEGER);
    if (typeof value.confirmationDetail.momentumHash !== 'string' ||
        !LOWERCASE_HASH_64.test(value.confirmationDetail.momentumHash)) fail();
    const projected = {};
    for (let index = 0; index < baseFields.length; index += 1) {
      ownData(projected, baseFields[index], value[baseFields[index]]);
    }
    validateAccountBlockJson(projected);
    return { accountBlock: projected, confirmationDetail: value.confirmationDetail };
  } catch {
    fail();
  }
}

async function validateIndependentHeightTwo(bundle, openingFrontier, heightTwoList) {
  try {
    const expectedProfile = bundle.payment.paymentRequired.accepts[0].extra.zenonChain;
    const policy = selectGateBCurrentTestnetPolicy(
      bundle.trust.profileName,
      GATE_B_CURRENT_TESTNET_OPERATOR_TRUST_ACKNOWLEDGEMENT,
      TESTNET_LIVE_ACKNOWLEDGEMENT,
    );
    const observation = Promise.resolve(heightTwoList);
    await observation;
    const result = await observeOperatorTrustedTestnetPolicy(policy, {
      zenon: {
        ledger: {
          getMomentumsByHeight() {
            return observation;
          },
        },
      },
      expectedChainProfile: {
        version: expectedProfile.version,
        chainIdentifier: expectedProfile.chainIdentifier,
        genesisMomentumHash: expectedProfile.genesisMomentumHash,
      },
      frontierMomentum: {
        chainIdentifier: openingFrontier.chainIdentifier,
        height: openingFrontier.height,
        hash: openingFrontier.hash,
      },
    });
    if (!result || result.remoteChainAuthenticated !== false ||
        result.observationHeight !== GATE_B_CURRENT_TESTNET_PROVENANCE.observationHeight) fail();
    return result;
  } catch {
    fail();
  }
}

function assertExactRetainedHeader(inclusionMomentum, accountBlock) {
  let matches = 0;
  for (let index = 0; index < inclusionMomentum.content.length; index += 1) {
    const header = inclusionMomentum.content[index];
    if (header.address === accountBlock.address && header.hash === accountBlock.hash &&
        header.height === accountBlock.height) matches += 1;
  }
  if (matches !== 1) fail();
}

function validateIndependentTranscript(
  bundle,
  endpointConfig,
  networkInfo,
  syncInfo,
  openingFrontier,
  heightTwoCount,
  rpcAccountBlock,
  inclusionMomentum,
  closingFrontier,
) {
  try {
    validateIndependentNetworkInfo(networkInfo, endpointConfig);
    validateIndependentSyncInfo(syncInfo);
    validateIndependentMomentum(openingFrontier);
    validateIndependentMomentum(inclusionMomentum);
    validateIndependentMomentum(closingFrontier);
    integer(heightTwoCount, 1, Number.MAX_SAFE_INTEGER);
    const momentumObservations = [openingFrontier, inclusionMomentum, closingFrontier];
    for (let left = 0; left < momentumObservations.length; left += 1) {
      for (let right = left + 1; right < momentumObservations.length; right += 1) {
        if ((momentumObservations[left].height === momentumObservations[right].height &&
              momentumObservations[left].hash !== momentumObservations[right].hash) ||
            (momentumObservations[left].height < momentumObservations[right].height &&
              momentumObservations[left].timestamp >= momentumObservations[right].timestamp) ||
            (momentumObservations[left].height > momentumObservations[right].height &&
              momentumObservations[left].timestamp <= momentumObservations[right].timestamp) ||
            (momentumObservations[left].hash === momentumObservations[right].hash &&
              canonicalJson(momentumObservations[left]) !==
                canonicalJson(momentumObservations[right]))) fail();
      }
    }
    const chainIdentifier = Number(bundle.trust.chainIdentifier);
    const observedConfirmationFrontierHeight =
      rpcAccountBlock.confirmationDetail.momentumHeight +
      rpcAccountBlock.confirmationDetail.numConfirmations - 1;
    if (!Number.isSafeInteger(chainIdentifier) || chainIdentifier < 1 ||
        !Number.isSafeInteger(observedConfirmationFrontierHeight) ||
        openingFrontier.chainIdentifier !== chainIdentifier ||
        inclusionMomentum.chainIdentifier !== chainIdentifier ||
        closingFrontier.chainIdentifier !== chainIdentifier ||
        openingFrontier.height < syncInfo.currentHeight ||
        closingFrontier.height < syncInfo.currentHeight ||
        heightTwoCount < openingFrontier.height ||
        heightTwoCount > closingFrontier.height ||
        observedConfirmationFrontierHeight < openingFrontier.height ||
        observedConfirmationFrontierHeight < heightTwoCount ||
        observedConfirmationFrontierHeight > closingFrontier.height ||
        closingFrontier.height < openingFrontier.height ||
        closingFrontier.timestamp < openingFrontier.timestamp ||
        (closingFrontier.height === openingFrontier.height &&
          closingFrontier.hash !== openingFrontier.hash)) fail();
    const candidateBlock = bundle.chain.accountBlock;
    const candidateConfirmation = bundle.chain.confirmation;
    if (canonicalJson(rpcAccountBlock.accountBlock) !== canonicalJson(candidateBlock) ||
        rpcAccountBlock.confirmationDetail.momentumHash !== candidateConfirmation.momentumHash ||
        rpcAccountBlock.confirmationDetail.momentumHeight !==
          candidateConfirmation.momentumHeight ||
        rpcAccountBlock.confirmationDetail.momentumTimestamp !==
          candidateConfirmation.momentumTimestamp ||
        rpcAccountBlock.confirmationDetail.numConfirmations <
          candidateConfirmation.numConfirmations ||
        inclusionMomentum.hash !== rpcAccountBlock.confirmationDetail.momentumHash ||
        inclusionMomentum.height !== rpcAccountBlock.confirmationDetail.momentumHeight ||
        inclusionMomentum.timestamp !== rpcAccountBlock.confirmationDetail.momentumTimestamp ||
        closingFrontier.height <= inclusionMomentum.height ||
        closingFrontier.timestamp < inclusionMomentum.timestamp) fail();
    assertExactRetainedHeader(inclusionMomentum, candidateBlock);
    return true;
  } catch {
    fail();
  }
}

async function assertIndependentFinalizerPinnedState(state) {
  try {
    await assertPrivateDirectoryState(state.workspaceState);
    await assertPrivateDirectoryState(state.runState);
    await assertPrivateDirectoryState(state.pendingState);
    await assertPrivateDirectoryState(state.captureState);
    await assertPrivateDirectoryState(state.journalState);
    const expectedRunEntries = [
      'SUBMISSION_ARMED', 'journal', 'pending-independent-verification',
    ];
    for (const name of state.attemptRecordNames) append(expectedRunEntries, name);
    if (state.stagingName !== undefined) append(expectedRunEntries, state.stagingName);
    if (state.outputPresent === true) {
      append(expectedRunEntries, state.outputName);
    }
    if (JSON_STRINGIFY((await readdir(state.runState.path)).sort()) !==
        JSON_STRINGIFY(expectedRunEntries.sort())) fail();
    const expectedPendingEntries = [
      'PENDING_INDEPENDENT_VERIFICATION', 'capture', 'metadata.json',
    ];
    if (JSON_STRINGIFY((await readdir(state.pendingState.path)).sort()) !==
        JSON_STRINGIFY(expectedPendingEntries)) fail();
    if (JSON_STRINGIFY((await readdir(state.captureState.path)).sort()) !==
        JSON_STRINGIFY(INDEPENDENT_FINALIZER_FRAGMENT_NAMES.map(name => `${name}.json`).sort())) {
      fail();
    }
    if (JSON_STRINGIFY((await readdir(state.journalState.path)).sort()) !==
        JSON_STRINGIFY(['.settlement-journal.initialized', 'settlement-journal.json'])) fail();
    for (const name of state.attemptRecordNames) {
      await assertExactPrivateFile(join(state.runState.path, name));
    }
    for (let index = 0; index < state.inputs.length; index += 1) {
      await assertOpenInputPath(state.inputs[index], state.inputs[index].generation);
      if (state.baselineReady === true) {
        await assertIndependentPinnedInputBytes(state.inputs[index]);
      }
    }
  } catch {
    fail();
  }
}

async function attestIndependentFinalizerSourceTree(state, dependencies) {
  try {
    if (typeof state.sourceRevision !== 'string' || !REVISION.test(state.sourceRevision) ||
        typeof dependencies.sourceTreeAttestor !== 'function' ||
        IS_PROXY(dependencies.sourceTreeAttestor)) fail();
    const promise = Reflect.apply(
      dependencies.sourceTreeAttestor,
      undefined,
      [state.sourceRevision],
    );
    if (await exactNativePromise(promise) !== true) fail();
  } catch {
    fail();
  }
}

async function independentFinalizerBoundary(state, dependencies, phase) {
  await assertIndependentFinalizerPinnedState(state);
  if (dependencies.boundaryObserver) {
    try {
      await Reflect.apply(dependencies.boundaryObserver, undefined, [phase]);
    } catch {
      fail();
    }
  }
  await assertIndependentFinalizerPinnedState(state);
}

async function recheckIndependentFinalizerBindings(state, options, expected) {
  const snapshots = [];
  try {
    const endpointBytes = await readIndependentPinnedInput(state.inputs[0]);
    append(snapshots, endpointBytes);
    const reviewBytes = await readIndependentPinnedInput(state.inputs[1]);
    append(snapshots, reviewBytes);
    const fragmentTexts = {};
    const fragments = {};
    for (let index = 0; index < INDEPENDENT_FINALIZER_FRAGMENT_NAMES.length; index += 1) {
      const name = INDEPENDENT_FINALIZER_FRAGMENT_NAMES[index];
      const bytes = await readIndependentPinnedInput(state.inputs[index + 2]);
      append(snapshots, bytes);
      const text = bytes.toString('utf8');
      ownData(fragmentTexts, `${name}.json`, text);
      ownData(fragments, name, parseLiveEvidenceFragment(text, name));
    }
    const endpointConfig = parseIndependentPublicWsOnceEndpointConfig(
      endpointBytes.toString('utf8'),
    );
    const review = parseIndependentPublicWsOnceOperatorReview(reviewBytes.toString('utf8'));
    const bundle = exactIndependentCandidateBundle(await assembleLiveEvidenceBundle(fragments));
    await verifyLiveEvidenceBundle(bundle);
    const candidateBundleText = await serializeLiveEvidenceBundle(bundle);
    if (independentPublicWsOnceEndpointConfigDigest(endpointConfig) !==
          expected.endpointConfigDigest ||
        independentOperatorReviewDigest(review) !== expected.operatorReviewDigest ||
        independentPublicWsOnceCandidateBundleDigest(candidateBundleText) !==
          expected.candidateBundleDigest ||
        independentFragmentSetDigest(fragmentTexts) !== expected.fiveFragmentSetDigest ||
        canonicalJson(review.source) !== canonicalJson(bundle.source) ||
        review.run.name !== options.runName || review.run.attemptId !== options.attemptId ||
        review.bindings.candidateBundleDigest !== expected.candidateBundleDigest ||
        review.bindings.endpointConfigDigest !== expected.endpointConfigDigest) fail();
  } catch {
    fail();
  } finally {
    for (let index = 0; index < snapshots.length; index += 1) snapshots[index].fill(0);
  }
}

async function consumeIndependentFinalizerAttempt(state, options, source, bindings) {
  const name = independentFinalizerAttemptRecordName(options.attemptId);
  const path = join(state.runState.path, name);
  const record = createIndependentFinalizerAttemptRecord(
    options,
    state.sourceRevision,
    source,
    bindings,
  );
  const text = `${canonicalJson(record)}\n`;
  let handle;
  let input;
  let retained = false;
  try {
    if (state.attemptRecordNames.has(name)) fail();
    await assertIndependentFinalizerPinnedState(state);
    const flags = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL |
      (fsConstants.O_NOFOLLOW ?? 0);
    handle = await open(path, flags, PRIVATE_FILE_MODE);
    state.attemptRecordNames.add(name);
    await handle.chmod(PRIVATE_FILE_MODE);
    await handle.sync();
    await syncDirectory(state.runState.path);
    await handle.writeFile(text, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await syncDirectory(state.runState.path);
    input = await openVerifiedProtectedInput(
      state.workspaceState.path,
      path,
      ROLE_INPUT_MAX_BYTES,
    );
    const bytes = await readVerifiedOpenInput(input, ROLE_INPUT_MAX_BYTES);
    if (bytes.toString('utf8') !== text ||
        canonicalJson(parseIndependentFinalizerAttemptRecord(bytes.toString('utf8'))) !==
          canonicalJson(record)) fail();
    append(state.inputs, input);
    retained = true;
    await assertIndependentFinalizerPinnedState(state);
    return record;
  } catch {
    fail();
  } finally {
    if (handle) {
      try { await handle.close(); } catch {}
    }
    if (input && !retained) await disposeVerifiedInput(input);
  }
}

async function independentArtifactObservation(dependencies, phase) {
  if (!dependencies.artifactObserver) return;
  try {
    await Reflect.apply(dependencies.artifactObserver, undefined, [phase]);
  } catch {
    fail();
  }
}

async function assertIndependentOutputAbsent(destination) {
  try {
    await lstat(destination);
    fail();
  } catch (error) {
    if (error instanceof LiveEvidenceRunError) throw error;
    if (error?.code !== 'ENOENT') fail();
  }
}

async function writeIndependentFinalizerArtifactSet(
  state,
  artifacts,
  dependencies,
) {
  const names = state.eligible
    ? [
        'manifest.json', 'chain.json', 'http.json', 'journal.json', 'timing.json',
        'operator-review.json', 'independent-verification-assertion.json',
        'candidate-bundle.json', 'COMPLETE',
      ]
    : [
        'manifest.json', 'chain.json', 'http.json', 'journal.json', 'timing.json',
        'operator-review.json', 'candidate-bundle.json',
        'ineligible-test-observation.json', 'INELIGIBLE_TEST_ONLY',
      ];
  exactObject(artifacts, names);
  const destination = join(state.runState.path, state.outputName);
  const stagingName = `.${state.outputName}-partial-${randomBytes(16).toString('hex')}`;
  const staging = join(state.runState.path, stagingName);
  let created = false;
  let renamed = false;
  let stagingState;
  try {
    await assertIndependentOutputAbsent(destination);
    await independentFinalizerBoundary(state, dependencies, 'before-staging-create');
    await independentArtifactObservation(dependencies, 'before-staging-create');
    await mkdir(staging, { mode: PRIVATE_DIRECTORY_MODE });
    created = true;
    state.stagingName = stagingName;
    await chmod(staging, PRIVATE_DIRECTORY_MODE);
    await assertPrivateDirectory(staging);
    stagingState = await capturePrivateDirectoryState(staging, false);
    await independentArtifactObservation(dependencies, 'after-staging-create');
    await assertPrivateDirectoryState(stagingState);
    for (let index = 0; index < names.length; index += 1) {
      const name = names[index];
      let boundaryIndex = 0;
      const boundaryNames = [
        'before-open', 'before-write', 'after-file-fsync', 'after-file-rename',
        'after-file-verify',
      ];
      await atomicPrivateWrite(staging, name, artifacts[name], async () => {
        await assertPrivateDirectoryState(stagingState);
        await independentFinalizerBoundary(
          state,
          dependencies,
          `artifact-${name}-${boundaryNames[boundaryIndex] ?? 'extra-boundary'}`,
        );
        await independentArtifactObservation(
          dependencies,
          `artifact-${name}-${boundaryNames[boundaryIndex] ?? 'extra-boundary'}`,
        );
        await assertPrivateDirectoryState(stagingState);
        boundaryIndex += 1;
      });
    }
    await independentArtifactObservation(dependencies, 'before-staging-fsync');
    await assertPrivateDirectoryState(stagingState);
    await syncDirectory(staging);
    await independentFinalizerBoundary(state, dependencies, 'before-final-source-attestation');
    await attestIndependentFinalizerSourceTree(state, dependencies);
    await assertIndependentFinalizerPinnedState(state);
    await assertIndependentOutputAbsent(destination);
    await independentArtifactObservation(dependencies, 'before-artifact-write');
    await assertIndependentOutputAbsent(destination);
    await assertPrivateDirectoryState(stagingState);
    await rename(staging, destination);
    renamed = true;
    state.stagingName = undefined;
    state.outputPresent = true;
    stagingState.path = destination;
    await assertPrivateDirectoryState(stagingState);
    await independentArtifactObservation(dependencies, 'after-artifact-rename');
    await assertPrivateDirectoryState(stagingState);
    await syncDirectory(state.runState.path);
    await assertPrivateDirectory(destination);
    if (JSON_STRINGIFY((await readdir(destination)).sort()) !==
        JSON_STRINGIFY(names.slice().sort())) fail();
    for (let index = 0; index < names.length; index += 1) {
      await assertExactPrivateFile(join(destination, names[index]), artifacts[names[index]]);
    }
    await independentFinalizerBoundary(state, dependencies, 'after-artifact-verification');
    await assertPrivateDirectoryState(stagingState);
    if (JSON_STRINGIFY((await readdir(destination)).sort()) !==
        JSON_STRINGIFY(names.slice().sort())) fail();
    for (let index = 0; index < names.length; index += 1) {
      await assertExactPrivateFile(join(destination, names[index]), artifacts[names[index]]);
    }
    return destination;
  } catch {
    if (created && stagingState) {
      try { await independentArtifactObservation(dependencies, 'cleanup-attempted'); } catch {}
      try {
        stagingState.path = renamed ? destination : staging;
        await assertPrivateDirectoryState(stagingState);
        await rm(stagingState.path, { recursive: true, force: true });
        await syncDirectory(state.runState.path);
      } catch {}
    }
    fail();
  } finally {
    await disposePrivateDirectoryState(stagingState);
  }
}

function exactIndependentCandidateBundle(bundle) {
  try {
    if (bundle.evidenceVersion !== 1 ||
        bundle.source.repository !== INDEPENDENT_FINALIZER_REPOSITORY ||
        typeof bundle.source.revision !== 'string' || !REVISION.test(bundle.source.revision) ||
        bundle.trust.profileName !== GATE_B_CURRENT_TESTNET_PROFILE_NAME ||
        bundle.trust.remoteChainAuthenticated !== false ||
        bundle.payment.selectedIndex !== 0 || bundle.payment.paymentRequired.accepts.length !== 1 ||
        bundle.payment.intentDigest !== paymentIntentDigest(
          bundle.payment.paymentRequired,
          bundle.payment.paymentRequired.accepts[0],
        )) fail();
    const profile = bundle.payment.paymentRequired.accepts[0].extra.zenonChain;
    if (canonicalJson(profile) !== canonicalJson(GATE_B_CURRENT_TESTNET_CHAIN_PROFILE) ||
        bundle.trust.chainIdentifier !== profile.chainIdentifier ||
        bundle.trust.genesisMomentumHash !== profile.genesisMomentumHash) fail();
    return bundle;
  } catch {
    fail();
  }
}

function createIndependentFinalizerAssertion(
  options,
  bundle,
  candidateBundleDigest,
  fiveFragmentSetDigest,
  endpointConfigDigest,
  operatorReviewDigest,
  verifierSourceRevision,
  route,
  inclusionMomentum,
) {
  const assertion = {
    assertionVersion: 1,
    assertionType: 'independent-public-ws-once-finalization',
    source: { ...bundle.source },
    run: { name: options.runName, attemptId: options.attemptId },
    candidate: {
      evidenceVersion: bundle.evidenceVersion,
      candidateBundleDigest,
      fiveFragmentSetDigest,
    },
    payment: {
      intentDigest: bundle.payment.intentDigest,
      accountBlockDigest: independentAccountBlockDigest(bundle.chain.accountBlock),
      inclusionMomentumDigest: independentInclusionMomentumDigest(inclusionMomentum),
    },
    bindings: { endpointConfigDigest, operatorReviewDigest },
    route: {
      transport: INDEPENDENT_FINALIZER_TRANSPORT,
      relationship: 'different-operator-route',
      routeDigest: independentPinnedRouteDigest(route),
      tlsServerNameAuthenticated: true,
      hostnameDifferent: true,
      addressSetsDisjoint: true,
      nodeIdentityDifferent: true,
    },
    verifier: {
      name: INDEPENDENT_FINALIZER_NAME,
      sourceRevision: verifierSourceRevision,
      verifierVersion: 1,
      finalizerVersion: 1,
      transcriptVersion: 1,
      transcriptLength: INDEPENDENT_FINALIZER_TRANSCRIPT.length,
    },
    confirmations: {
      operatorReviewAccepted: true,
      separateAdministration: true,
      noProxyOrAlias: true,
      readOnlyUse: true,
      exactCandidateBundle: true,
      exactFiveFragmentSet: true,
      exactPaymentIntent: true,
      exactAccountBlock: true,
      exactInclusionMomentum: true,
      pinnedHeightTwoProfile: true,
      nonRegressingFrontier: true,
      laterMomentum: true,
    },
  };
  return parseIndependentPublicWsOnceFinalizerAssertion(
    `${canonicalJson(assertion)}\n`,
  );
}

async function runIndependentPublicWsOnceFinalizer(options, dependencies, eligible) {
  const inputs = [];
  let captureState;
  let journalState;
  let pendingState;
  let runState;
  let workspaceState;
  let transport;
  let transportCloseAttempted = false;
  let transportTimeoutMs = MAX_RPC_TIMEOUT_MS;
  try {
    if (typeof eligible !== 'boolean') fail();
    options = exactIndependentFinalizerOptions(options);
    workspaceState = await capturePrivateDirectoryState(options.workspaceRoot, true);
    const runDirectory = join(workspaceState.path, options.runName);
    runState = await capturePrivateDirectoryState(runDirectory, false);
    const pendingDirectory = join(runDirectory, 'pending-independent-verification');
    pendingState = await capturePrivateDirectoryState(pendingDirectory, false);
    const captureDirectory = join(pendingDirectory, 'capture');
    captureState = await capturePrivateDirectoryState(captureDirectory, false);
    const journalDirectory = join(runDirectory, 'journal');
    journalState = await capturePrivateDirectoryState(journalDirectory, false);
    const outputName = eligible
      ? INDEPENDENT_FINALIZER_OUTPUT_NAME
      : INDEPENDENT_FINALIZER_TEST_OUTPUT_NAME;
    const state = {
      workspaceState,
      runState,
      pendingState,
      captureState,
      journalState,
      inputs,
      eligible,
      outputName,
      outputPresent: false,
      stagingName: undefined,
      baselineReady: false,
      sourceRevision: undefined,
      attemptRecordNames: new Set(),
    };
    const destination = join(runDirectory, outputName);
    await assertIndependentOutputAbsent(destination);
    const retainedNames = new Set([
      'SUBMISSION_ARMED', 'journal', 'pending-independent-verification',
    ]);
    const initialRunEntries = await readdir(runDirectory);
    for (let index = 0; index < initialRunEntries.length; index += 1) {
      const name = initialRunEntries[index];
      if (retainedNames.has(name)) continue;
      const match = INDEPENDENT_FINALIZER_ATTEMPT_RECORD.exec(name);
      if (!match || match[1] === options.attemptId || state.attemptRecordNames.has(name)) fail();
      state.attemptRecordNames.add(name);
    }
    if (initialRunEntries.length !== retainedNames.size + state.attemptRecordNames.size) fail();

    append(inputs, await openVerifiedProtectedInput(
      workspaceState.path,
      options.endpointConfigPath,
      CONFIG_MAX_BYTES,
    ));
    append(inputs, await openVerifiedProtectedInput(
      workspaceState.path,
      options.operatorReviewPath,
      ROLE_INPUT_MAX_BYTES,
    ));
    for (let index = 0; index < INDEPENDENT_FINALIZER_FRAGMENT_NAMES.length; index += 1) {
      append(inputs, await openVerifiedProtectedInput(
        workspaceState.path,
        join(captureDirectory, `${INDEPENDENT_FINALIZER_FRAGMENT_NAMES[index]}.json`),
        INDEPENDENT_FINALIZER_ARTIFACT_MAX_BYTES,
      ));
    }
    append(inputs, await openVerifiedProtectedInput(
      workspaceState.path,
      publicWsOnceConsumedMarker(workspaceState.path),
      ROLE_INPUT_MAX_BYTES,
    ));
    append(inputs, await openVerifiedProtectedInput(
      workspaceState.path,
      join(runDirectory, 'SUBMISSION_ARMED'),
      ROLE_INPUT_MAX_BYTES,
    ));
    append(inputs, await openVerifiedProtectedInput(
      workspaceState.path,
      join(pendingDirectory, 'PENDING_INDEPENDENT_VERIFICATION'),
      ROLE_INPUT_MAX_BYTES,
    ));
    append(inputs, await openVerifiedProtectedInput(
      workspaceState.path,
      join(pendingDirectory, 'metadata.json'),
      CONFIG_MAX_BYTES,
    ));
    append(inputs, await openVerifiedProtectedInput(
      workspaceState.path,
      join(journalDirectory, '.settlement-journal.initialized'),
      1,
      true,
    ));
    append(inputs, await openVerifiedProtectedInput(
      workspaceState.path,
      join(journalDirectory, 'settlement-journal.json'),
      INDEPENDENT_FINALIZER_ARTIFACT_MAX_BYTES,
    ));
    const priorAttemptRecordNames = [...state.attemptRecordNames].sort();
    for (let index = 0; index < priorAttemptRecordNames.length; index += 1) {
      append(inputs, await openVerifiedProtectedInput(
        workspaceState.path,
        join(runDirectory, priorAttemptRecordNames[index]),
        ROLE_INPUT_MAX_BYTES,
      ));
    }
    const identities = new Set();
    for (let index = 0; index < inputs.length; index += 1) {
      const identity = `${inputs[index].generation.dev}:${inputs[index].generation.ino}`;
      if (identities.has(identity)) fail();
      identities.add(identity);
    }
    await independentFinalizerBoundary(state, dependencies, 'before-protected-input-read');
    const endpointBytes = await readVerifiedOpenInput(inputs[0], CONFIG_MAX_BYTES);
    const reviewBytes = await readVerifiedOpenInput(inputs[1], ROLE_INPUT_MAX_BYTES);
    const fragmentTexts = {};
    const parsedFragments = {};
    for (let index = 0; index < INDEPENDENT_FINALIZER_FRAGMENT_NAMES.length; index += 1) {
      const name = INDEPENDENT_FINALIZER_FRAGMENT_NAMES[index];
      const bytes = await readVerifiedOpenInput(
        inputs[index + 2],
        INDEPENDENT_FINALIZER_ARTIFACT_MAX_BYTES,
      );
      const text = bytes.toString('utf8');
      ownData(fragmentTexts, `${name}.json`, text);
      ownData(parsedFragments, name, parseLiveEvidenceFragment(text, name));
    }
    const consumedMarkerBytes = await readVerifiedOpenInput(
      inputs[INDEPENDENT_FINALIZER_RETAINED_INPUT_INDEX.consumedMarker],
      ROLE_INPUT_MAX_BYTES,
    );
    const submissionMarkerBytes = await readVerifiedOpenInput(
      inputs[INDEPENDENT_FINALIZER_RETAINED_INPUT_INDEX.submissionMarker],
      ROLE_INPUT_MAX_BYTES,
    );
    const pendingMarkerBytes = await readVerifiedOpenInput(
      inputs[INDEPENDENT_FINALIZER_RETAINED_INPUT_INDEX.pendingMarker],
      ROLE_INPUT_MAX_BYTES,
    );
    const metadataBytes = await readVerifiedOpenInput(
      inputs[INDEPENDENT_FINALIZER_RETAINED_INPUT_INDEX.metadata],
      CONFIG_MAX_BYTES,
    );
    const journalMarkerBytes = await readVerifiedOpenInput(
      inputs[INDEPENDENT_FINALIZER_RETAINED_INPUT_INDEX.journalMarker],
      1,
    );
    await readVerifiedOpenInput(
      inputs[INDEPENDENT_FINALIZER_RETAINED_INPUT_INDEX.journal],
      INDEPENDENT_FINALIZER_ARTIFACT_MAX_BYTES,
    );
    for (let index = 0; index < priorAttemptRecordNames.length; index += 1) {
      await readVerifiedOpenInput(
        inputs[INDEPENDENT_FINALIZER_RETAINED_INPUT_INDEX.journal + 1 + index],
        ROLE_INPUT_MAX_BYTES,
      );
    }
    if (consumedMarkerBytes.toString('utf8') !== 'PUBLIC_WS_ONCE_CONSUMED\n' ||
        submissionMarkerBytes.toString('utf8') !== 'SUBMISSION_ARMED\n' ||
        pendingMarkerBytes.toString('utf8') !== 'PENDING_INDEPENDENT_VERIFICATION\n' ||
        metadataBytes.toString('utf8') !==
          `${JSON_STRINGIFY(publicWsOncePendingMetadata(
            CURRENT_TESTNET_WSS_ONCE_EXECUTION_MODE,
          ))}\n` || journalMarkerBytes.length !== 0) fail();
    const bundle = exactIndependentCandidateBundle(
      await assembleLiveEvidenceBundle(parsedFragments),
    );
    await verifyLiveEvidenceBundle(bundle);
    const candidateBundleText = await serializeLiveEvidenceBundle(bundle);
    const candidateBundleDigest = independentPublicWsOnceCandidateBundleDigest(
      candidateBundleText,
    );
    const fiveFragmentSetDigest = independentFragmentSetDigest(fragmentTexts);
    const endpointConfig = parseIndependentPublicWsOnceEndpointConfig(
      endpointBytes.toString('utf8'),
    );
    transportTimeoutMs = endpointConfig.rpcTimeoutMs;
    const endpointConfigDigest = independentPublicWsOnceEndpointConfigDigest(endpointConfig);
    const operatorReview = parseIndependentPublicWsOnceOperatorReview(
      reviewBytes.toString('utf8'),
    );
    if (canonicalJson(operatorReview.source) !== canonicalJson(bundle.source) ||
        operatorReview.run.name !== options.runName ||
        operatorReview.run.attemptId !== options.attemptId ||
        operatorReview.bindings.candidateBundleDigest !== candidateBundleDigest ||
        operatorReview.bindings.endpointConfigDigest !== endpointConfigDigest) fail();
    const operatorReviewDigest = independentOperatorReviewDigest(operatorReview);
    const paymentRequired = bundle.payment.paymentRequired;
    const accepted = paymentRequired.accepts[0];
    const retainedPayload = {
      x402Version: paymentRequired.x402Version,
      resource: paymentRequired.resource,
      accepted,
      payload: {
        transaction: bundle.chain.accountBlock,
        intentDigest: bundle.payment.intentDigest,
      },
    };
    const paymentPreflight = await preflightZenonPayment(
      retainedPayload,
      accepted,
      paymentRequired,
    );
    if (paymentPreflight.transactionHash !== bundle.chain.accountBlock.hash ||
        paymentPreflight.intentDigest !== bundle.payment.intentDigest) fail();
    const durableJournal = await new SettlementJournal({
      directory: journalDirectory,
      allowedRoot: runDirectory,
      maxFileBytes: INDEPENDENT_FINALIZER_ARTIFACT_MAX_BYTES,
    }).load();
    if (durableJournal.schemaVersion !== 1 || durableJournal.revision !== 5 ||
        durableJournal.schemaVersion !== bundle.journal.sourceSchemaVersion ||
        durableJournal.revision !== bundle.journal.sourceRevision ||
        !ARRAY_IS_ARRAY(durableJournal.records) || durableJournal.records.length !== 1 ||
        bundle.journal.activeRecordCount !== 1 || bundle.journal.tombstoneCount !== 0 ||
        canonicalJson(durableJournal.records[0]) !== canonicalJson(bundle.journal.record) ||
        durableJournal.records[0].evidenceState !== EVIDENCE_STATES.MOMENTUM_INCLUDED ||
        durableJournal.records[0].deliveryState !== DELIVERY_STATES.DELIVERED) fail();
    for (let index = 0; index < priorAttemptRecordNames.length; index += 1) {
      const input = inputs[INDEPENDENT_FINALIZER_RETAINED_INPUT_INDEX.journal + 1 + index];
      const record = parseIndependentFinalizerAttemptRecord(input.buffer.toString('utf8'));
      const match = INDEPENDENT_FINALIZER_ATTEMPT_RECORD.exec(priorAttemptRecordNames[index]);
      if (!match || record.run.name !== options.runName || record.run.attemptId !== match[1] ||
          canonicalJson(record.source) !== canonicalJson(bundle.source) ||
          record.bindings.candidateBundleDigest !== candidateBundleDigest ||
          record.bindings.fiveFragmentSetDigest !== fiveFragmentSetDigest) fail();
    }
    state.sourceRevision = operatorReview.verifierSourceRevision;
    state.baselineReady = true;
    await independentFinalizerBoundary(state, dependencies, 'after-retained-baseline');
    await independentFinalizerBoundary(state, dependencies, 'before-initial-source-attestation');
    await attestIndependentFinalizerSourceTree(state, dependencies);
    await independentFinalizerBoundary(state, dependencies, 'after-initial-source-attestation');
    await consumeIndependentFinalizerAttempt(state, options, bundle.source, {
      candidateBundleDigest,
      fiveFragmentSetDigest,
      endpointConfigDigest,
      operatorReviewDigest,
    });
    await independentFinalizerBoundary(state, dependencies, 'after-attempt-consumed');
    await independentFinalizerBoundary(state, dependencies, 'before-route-resolution');
    const route = await resolveIndependentFinalizerRoute(
      endpointConfig,
      dependencies.resolveAddresses,
    );
    await independentFinalizerBoundary(state, dependencies, 'after-route-resolution');
    const rawTransport = Reflect.apply(
      dependencies.createRawTransport,
      undefined,
      [endpointConfig, route],
    );
    transport = captureIndependentRawTransport(rawTransport);
    const seenResponseIds = new Set();
    const call = async (requestId, params) => {
      await independentFinalizerBoundary(state, dependencies, `before-rpc-${requestId}`);
      const result = await dispatchIndependentFinalizerRpc(
        transport,
        seenResponseIds,
        requestId,
        INDEPENDENT_FINALIZER_TRANSCRIPT[requestId - 1],
        params,
        endpointConfig.rpcTimeoutMs,
      );
      await independentFinalizerBoundary(state, dependencies, `after-rpc-${requestId}`);
      return result;
    };

    const networkInfo = validateIndependentNetworkInfo(await call(1, []), endpointConfig);
    const syncInfo = validateIndependentSyncInfo(await call(2, []));
    const openingFrontier = validateIndependentMomentum(await call(3, []));
    const heightTwoList = await call(4, [2, 1]);
    exactObject(heightTwoList, ['count', 'list']);
    integer(heightTwoList.count, 1, Number.MAX_SAFE_INTEGER);
    if (!ARRAY_IS_ARRAY(heightTwoList.list) || heightTwoList.list.length !== 1) fail();
    const heightTwo = validateIndependentMomentum(heightTwoList.list[0]);
    await validateIndependentHeightTwo(bundle, openingFrontier, {
      count: heightTwoList.count,
      list: [{
        version: heightTwo.version,
        chainIdentifier: heightTwo.chainIdentifier,
        hash: heightTwo.hash,
        previousHash: heightTwo.previousHash,
        height: heightTwo.height,
      }],
    });
    const rpcAccountBlock = projectIndependentRpcAccountBlock(
      await call(5, [bundle.chain.accountBlock.hash]),
    );
    const inclusionMomentum = validateIndependentMomentum(await call(6, [
      rpcAccountBlock.confirmationDetail.momentumHash,
    ]));
    const closingFrontier = validateIndependentMomentum(await call(7, []));
    if (seenResponseIds.size !== INDEPENDENT_FINALIZER_TRANSCRIPT.length) fail();
    validateIndependentTranscript(
      bundle,
      endpointConfig,
      networkInfo,
      syncInfo,
      openingFrontier,
      heightTwoList.count,
      rpcAccountBlock,
      inclusionMomentum,
      closingFrontier,
    );
    await independentFinalizerBoundary(state, dependencies, 'before-transport-close');
    transportCloseAttempted = true;
    const closePromise = Reflect.apply(transport.close, transport, []);
    if (!IS_PROMISE(closePromise) || IS_PROXY(closePromise) ||
        GET_PROTOTYPE_OF(closePromise) !== PROMISE_PROTOTYPE ||
        GET_OWN_PROPERTY_DESCRIPTOR(closePromise, 'then') !== undefined ||
        await boundedPromise(closePromise, endpointConfig.rpcTimeoutMs) !== true) fail();
    await independentFinalizerBoundary(state, dependencies, 'after-transport-close');
    await recheckIndependentFinalizerBindings(state, options, {
      candidateBundleDigest,
      fiveFragmentSetDigest,
      endpointConfigDigest,
      operatorReviewDigest,
    });

    const reviewText = `${canonicalJson(operatorReview)}\n`;
    const assertionText = eligible
      ? `${canonicalJson(createIndependentFinalizerAssertion(
          options,
          bundle,
          candidateBundleDigest,
          fiveFragmentSetDigest,
          endpointConfigDigest,
          operatorReviewDigest,
          operatorReview.verifierSourceRevision,
          route,
          inclusionMomentum,
        ))}\n`
      : undefined;
    if (reviewText.includes(endpointConfig.rpcUrl) ||
        assertionText?.includes(endpointConfig.rpcUrl) ||
        reviewText.includes(route.hostname) || assertionText?.includes(route.hostname) ||
        reviewText.includes(endpointConfig.originalRoute.nodePublicKey) ||
        assertionText?.includes(endpointConfig.originalRoute.nodePublicKey)) fail();
    const commonArtifacts = {
      'manifest.json': fragmentTexts['manifest.json'],
      'chain.json': fragmentTexts['chain.json'],
      'http.json': fragmentTexts['http.json'],
      'journal.json': fragmentTexts['journal.json'],
      'timing.json': fragmentTexts['timing.json'],
      'operator-review.json': reviewText,
      'candidate-bundle.json': candidateBundleText,
    };
    const artifacts = eligible
      ? {
          ...commonArtifacts,
          'independent-verification-assertion.json': assertionText,
          COMPLETE: 'COMPLETE\n',
        }
      : {
          ...commonArtifacts,
          'ineligible-test-observation.json': `${canonicalJson({
            testOnlyVersion: 1,
            status: 'INELIGIBLE_TEST_ONLY',
            eligibleForIndependentVerification: false,
            candidateBundleDigest,
            endpointConfigDigest,
            routeDigest: independentPinnedRouteDigest(route),
          })}\n`,
          INELIGIBLE_TEST_ONLY: 'INELIGIBLE_TEST_ONLY\n',
        };
    await independentFinalizerBoundary(state, dependencies, 'before-artifact-write');
    await writeIndependentFinalizerArtifactSet(state, artifacts, dependencies);
    return eligible
      ? FREEZE({ status: 'independent-verification-complete' })
      : FREEZE({ status: 'ineligible-test-observation-complete', eligible: false });
  } catch {
    if (transport && !transportCloseAttempted) {
      transportCloseAttempted = true;
      try {
        const closePromise = Reflect.apply(transport.close, transport, []);
        if (IS_PROMISE(closePromise)) await boundedPromise(closePromise, transportTimeoutMs);
      } catch {}
    }
    fail();
  } finally {
    for (let index = 0; index < inputs.length; index += 1) {
      await disposeVerifiedInput(inputs[index]);
    }
    await disposePrivateDirectoryState(captureState);
    await disposePrivateDirectoryState(journalState);
    await disposePrivateDirectoryState(pendingState);
    await disposePrivateDirectoryState(runState);
    await disposePrivateDirectoryState(workspaceState);
  }
}

export async function finalizeIndependentPublicWsOnce(options) {
  if (arguments.length !== 1) fail();
  return runIndependentPublicWsOnceFinalizer(
    options,
    captureIndependentFinalizerInjections(undefined),
    true,
  );
}

export async function exerciseIndependentPublicWsOnceFinalizerTestOnly(options, injected) {
  if (arguments.length !== 2) fail();
  return runIndependentPublicWsOnceFinalizer(
    options,
    captureIndependentFinalizerInjections(injected),
    false,
  );
}

export const LIVE_EVIDENCE_RUN_LIMITS = FREEZE({
  configBytes: CONFIG_MAX_BYTES,
  roleInputBytes: ROLE_INPUT_MAX_BYTES,
  childOutputBytes: CHILD_OUTPUT_MAX_BYTES,
});

export const PUBLIC_WS_ONCE_POLICY = FREEZE({
  executionMode: PUBLIC_WS_ONCE_EXECUTION_MODE,
  transportException: PUBLIC_WS_ONCE_TRANSPORT_EXCEPTION,
  paymentAcknowledgement: PUBLIC_WS_ONCE_PAYMENT_ACKNOWLEDGEMENT,
  publicationAcknowledgement: PUBLIC_WS_ONCE_PUBLICATION_ACKNOWLEDGEMENT,
});

export const CURRENT_TESTNET_WSS_ONCE_POLICY = FREEZE({
  executionMode: CURRENT_TESTNET_WSS_ONCE_EXECUTION_MODE,
  rpcEndpoint: GATE_B_CURRENT_TESTNET_WSS_ENDPOINT,
  paymentAcknowledgement: CURRENT_TESTNET_WSS_ONCE_PAYMENT_ACKNOWLEDGEMENT,
  publicationAcknowledgement: PUBLIC_WS_ONCE_PUBLICATION_ACKNOWLEDGEMENT,
});

export const INDEPENDENT_PUBLIC_WS_ONCE_FINALIZER_POLICY = FREEZE({
  command: INDEPENDENT_FINALIZER_COMMAND,
  transport: INDEPENDENT_FINALIZER_TRANSPORT,
  outputName: INDEPENDENT_FINALIZER_OUTPUT_NAME,
  testOnlyOutputName: INDEPENDENT_FINALIZER_TEST_OUTPUT_NAME,
  reviewAcceptance: INDEPENDENT_FINALIZER_REVIEW_ACCEPTANCE,
  transcript: INDEPENDENT_FINALIZER_TRANSCRIPT,
});
