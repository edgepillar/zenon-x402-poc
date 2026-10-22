import { spawnSync } from 'node:child_process';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { types as utilTypes } from 'node:util';

import { canonicalJson } from './canonical.js';
import {
  frameGateBOperatorCoordinatorBootstrap,
  frameGateBOperatorCoordinatorReview,
  frameGateBOperatorReviewResult,
  GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES,
  parseGateBOperatorCoordinatorBootstrapFrame,
  parseGateBOperatorCoordinatorReviewFrame,
  parseGateBOperatorReviewResultFrame,
} from './gate-b-operator-coordinator-schema.js';
import {
  GATE_B_PUBLIC_WS_INPUT_LEAVES,
  parseGateBQuickTunnelHostnameSource,
} from './gate-b-public-ws-inputs-schema.js';
import { openGateBPublicWsPrivateWorkspace } from
  './gate-b-public-ws-private-workspace.js';
import {
  claimGateBQuickTunnelHostnameSourceHandoff,
  isGateBQuickTunnelLaunchFailure,
  launchGateBQuickTunnelInInheritedProcessGroup,
  readGateBQuickTunnelHostnameSourceHandoffDiagnosticStage,
  readGateBQuickTunnelHostnameSourceHandoffProvenance,
  readGateBQuickTunnelLaunchFailureStage,
  stopGateBQuickTunnel,
  waitGateBQuickTunnelClosed,
} from './gate-b-quick-tunnel-launcher.js';
import {
  GATE_B_QUICK_TUNNEL_FAILURE_STAGES,
  GATE_B_QUICK_TUNNEL_OPERATIONS,
} from './gate-b-quick-tunnel-schema.js';
import { parseGateBResetEpochPolicyPreflight } from
  './gate-b-reset-epoch-policy-preflight.js';
import {
  GATE_B_RESET_EPOCH_OFFLINE_PREFLIGHT,
  GATE_B_RESET_EPOCH_OFFLINE_PROVENANCE,
  assertCanonicalZenonUserAddress,
  gateBResetEpochOfflineConfigDigest,
  gateBResetEpochOfflinePaymentIntentDigest,
  parseGateBResetEpochOfflinePreflightReceipt,
  parseGateBResetEpochOfflineRoleInput,
  parseGateBResetEpochOfflineRunConfig,
  parseGateBResetEpochOfflineWalletBytes,
} from './gate-b-reset-epoch-offline-preflight.js';
import { attestPublicWsOnceSourceTree } from './public-ws-source-attestation.js';
import {
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_CHAIN_PROFILE,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
} from './zenon/operator-trusted-testnet-profile.js';

const ERROR_CODE = 'gate_b_reset_epoch_exact_six_native_adapter_invalid';
const MODE = 'reset-epoch-exact-six-native-v1';
const ENTROPY_BYTES = 32;
const MAX_DOCUMENT_BYTES = 64 * 1024;
const MAX_MNEMONIC_BYTES = 4096;
const MAX_ADDRESS_BYTES = 256;
const REVISION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const GIT_EXECUTABLE = '/usr/bin/git';
const RESET_LIVE_APPROVAL_LEAF = 'reset-live-approval.json';
const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));
const ARRAY_IS_ARRAY = Array.isArray;
const ARRAY_INCLUDES = Array.prototype.includes;
const ARRAY_INDEX_OF = Array.prototype.indexOf;
const ARRAY_SORT = Array.prototype.sort;
const BUFFER_BYTE_LENGTH = Buffer.byteLength;
const BUFFER_FILL = Buffer.prototype.fill;
const BUFFER_FROM = Buffer.from;
const BUFFER_IS_BUFFER = Buffer.isBuffer;
const DEFINE_PROPERTY = Object.defineProperty;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROMISE = utilTypes.isPromise;
const IS_PROXY = utilTypes.isProxy;
const IS_FROZEN = Object.isFrozen;
const NATIVE_PROMISE = Promise;
const OBJECT_CREATE = Object.create;
const OBJECT_FREEZE = Object.freeze;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_APPLY = Reflect.apply;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const REGEXP_TEST = RegExp.prototype.test;
const WEAK_MAP_GET = WeakMap.prototype.get;
const WEAK_MAP_SET = WeakMap.prototype.set;
const CAPABILITY_STATES = new WeakMap();
const FAILURE_STAGES = new WeakMap();
const NATIVE_PROMISE_CONSTRUCTOR_DESCRIPTOR = OBJECT_FREEZE({
  configurable: false,
  enumerable: false,
  value: NATIVE_PROMISE,
  writable: false,
});
const CAPTURED_DEFAULT_DEPENDENCY_SELECTION = OBJECT_FREEZE({
  mode: 'captured-default-dependencies',
});
const INJECTED_TEST_ONLY_DEPENDENCY_SELECTION = OBJECT_FREEZE({
  mode: 'injected-test-only-dependencies',
});
const CAPTURED_DEFAULT_DEPENDENCIES = OBJECT_FREEZE({
  attestSourceTree: attestPublicWsOnceSourceTree,
  captureSourceRevision: async () => captureCurrentSourceRevision(),
  entropySource: randomBytes,
  platform: process.platform,
  privateWorkspaceInjections: undefined,
  quickTunnelInjections: undefined,
  sdkLoader: () => import('znn-typescript-sdk'),
});
const CAPTURED_QUICK_TUNNEL_DEPENDENCY_MODE = 'captured-default-dependencies';
const INJECTED_QUICK_TUNNEL_DEPENDENCY_MODE = 'injected-test-only-dependencies';
const INHERITED_PROCESS_GROUP_MODE =
  'inherited-process-group-outer-ownership-unproven';
const STATUSES = OBJECT_FREEZE({
  REVIEW_REQUIRED: 'GATE_B_CONTROLLER_REVIEW_REQUIRED_RUN_NOT_AUTHORIZED',
  OFFLINE_RECEIPT_VALID:
    'GATE_B_CONTROLLER_OFFLINE_PREFLIGHT_RECEIPT_VALID_RUN_NOT_AUTHORIZED',
  CLOSED: 'GATE_B_CONTROLLER_CLOSED_RUN_NOT_EXECUTED',
  QUARANTINED: 'GATE_B_CONTROLLER_FAILED_WORKSPACE_QUARANTINED',
});
const FIVE_LEAVES = OBJECT_FREEZE([
  GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.facilitatorRpc,
]);
const REMAINING_PRE_REVIEW_LEAVES = OBJECT_FREEZE([
  GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.facilitatorRpc,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig,
]);
const DIAGNOSTIC_STAGE_SEQUENCE = OBJECT_FREEZE([
  GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.UNKNOWN,
  GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.HOSTNAME_SOURCE_WRITTEN,
  GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.QUICK_TUNNEL_ACTIVE_CONFIRMED,
  GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.HOSTNAME_HANDOFF_VERIFIED,
  GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.HOSTNAME_SOURCE_VERIFIED,
  GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.WALLET_MATERIAL_DERIVED,
  GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.WALLET_LEAF_RESERVED,
  GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.PRE_REVIEW_OUTPUTS_RESERVED,
  GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.PRE_REVIEW_OUTPUTS_COMMITTED,
  GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.OFFLINE_RECEIPT_RESERVED,
  GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.OFFLINE_RECEIPT_COMMITTED,
]);
const SIX_LEAVES = OBJECT_FREEZE([
  ...FIVE_LEAVES,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.resetEpochOfflinePreflightReceipt,
]);

export class GateBResetEpochExactSixNativeAdapterError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBResetEpochExactSixNativeAdapterError';
    this.code = ERROR_CODE;
    this.stack = `GateBResetEpochExactSixNativeAdapterError: ${ERROR_CODE}`;
  }
}

function exactDiagnosticStage(value) {
  return REFLECT_APPLY(ARRAY_INCLUDES, DIAGNOSTIC_STAGE_SEQUENCE, [value])
    ? value
    : GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.UNKNOWN;
}

function error(stage = GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.UNKNOWN) {
  const output = new GateBResetEpochExactSixNativeAdapterError();
  const exact = exactDiagnosticStage(stage);
  if (exact !== GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.UNKNOWN) {
    REFLECT_APPLY(WEAK_MAP_SET, FAILURE_STAGES, [output, exact]);
  }
  return output;
}

function fail() {
  throw error();
}

function advanceDiagnosticStage(state, next) {
  const currentIndex = REFLECT_APPLY(
    ARRAY_INDEX_OF,
    DIAGNOSTIC_STAGE_SEQUENCE,
    [state.diagnosticStage],
  );
  const nextIndex = REFLECT_APPLY(ARRAY_INDEX_OF, DIAGNOSTIC_STAGE_SEQUENCE, [next]);
  if (currentIndex < 0 || nextIndex <= currentIndex) fail();
  state.diagnosticStage = next;
  return next;
}

export function readGateBResetEpochExactSixNativeFailureStage(candidate) {
  if (!candidate || (typeof candidate !== 'object' && typeof candidate !== 'function')) {
    return GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.UNKNOWN;
  }
  return exactDiagnosticStage(
    REFLECT_APPLY(WEAK_MAP_GET, FAILURE_STAGES, [candidate]),
  );
}

function pinNativePromiseConstructor(promise) {
  REFLECT_APPLY(DEFINE_PROPERTY, Object, [
    promise,
    'constructor',
    NATIVE_PROMISE_CONSTRUCTOR_DESCRIPTOR,
  ]);
  return promise;
}

function createNativePromise(executor) {
  return pinNativePromiseConstructor(new NATIVE_PROMISE(executor));
}

function rejectNativePromise() {
  return createNativePromise((resolve, reject) => reject(error()));
}

function exactNativePromise(value) {
  if (!IS_PROMISE(value) || IS_PROXY(value) ||
      GET_PROTOTYPE_OF(value) !== NATIVE_PROMISE.prototype ||
      GET_OWN_PROPERTY_DESCRIPTOR(value, 'then') !== undefined) fail();
  return pinNativePromiseConstructor(value);
}

function callAsync(fn, receiver, args) {
  if (typeof fn !== 'function') fail();
  return exactNativePromise(REFLECT_APPLY(fn, receiver, args));
}

function dataProperty(value, name) {
  if (!value || (typeof value !== 'object' && typeof value !== 'function') ||
      IS_PROXY(value)) return undefined;
  let current = value;
  while (current !== null) {
    if (IS_PROXY(current)) return undefined;
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(current, name);
    if (descriptor) return HAS_OWN(descriptor, 'value') ? descriptor.value : undefined;
    current = GET_PROTOTYPE_OF(current);
  }
  return undefined;
}

function exactPartialOptions(value, allowed) {
  if (!value || typeof value !== 'object' || IS_PROXY(value) || ARRAY_IS_ARRAY(value) ||
      GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const output = OBJECT_CREATE(null);
  const keys = REFLECT_OWN_KEYS(value);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = typeof key === 'string'
      ? GET_OWN_PROPERTY_DESCRIPTOR(value, key)
      : undefined;
    if (!REFLECT_APPLY(ARRAY_INCLUDES, allowed, [key]) || !descriptor ||
        !HAS_OWN(descriptor, 'value') ||
        descriptor.enumerable !== true) fail();
    output[key] = descriptor.value;
  }
  return output;
}

function exactSafeString(value, maximumBytes) {
  if (typeof value !== 'string' || value.length < 1 ||
      REFLECT_APPLY(BUFFER_BYTE_LENGTH, Buffer, [value, 'utf8']) > maximumBytes ||
      REFLECT_APPLY(REGEXP_TEST, /[\u0000-\u001f\u007f]/u, [value])) fail();
  return value;
}

function wipeBuffer(value) {
  if (!BUFFER_IS_BUFFER(value) && !(value instanceof Uint8Array)) return;
  try { REFLECT_APPLY(BUFFER_FILL, value, [0]); } catch {}
}

function wipeBuffers(values) {
  for (let index = 0; index < values.length; index += 1) wipeBuffer(values[index]);
}

function clearSecrets(wallet, keyPairs) {
  for (let index = 0; index < keyPairs.length; index += 1) {
    const keyPair = keyPairs[index];
    try {
      const clear = dataProperty(keyPair, 'clear');
      if (typeof clear === 'function') REFLECT_APPLY(clear, keyPair, []);
    } catch {}
    try { wipeBuffer(dataProperty(keyPair, 'privateKey')); } catch {}
    try { wipeBuffer(dataProperty(keyPair, 'publicKey')); } catch {}
  }
  if (!wallet || typeof wallet !== 'object' || IS_PROXY(wallet)) return;
  for (const field of ['mnemonic', 'entropy', 'seed']) {
    try {
      const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(wallet, field);
      if (descriptor && HAS_OWN(descriptor, 'value') && descriptor.writable === true) {
        wallet[field] = '';
      }
    } catch {}
  }
}

function captureCurrentSourceRevision() {
  let stdout;
  try {
    const result = REFLECT_APPLY(spawnSync, undefined, [
      GIT_EXECUTABLE,
      [
        '--no-pager', '--no-optional-locks', '-c', 'color.ui=false',
        '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false',
        '-C', REPOSITORY_ROOT, 'rev-parse', '--verify', 'HEAD^{commit}',
      ],
      {
        encoding: null,
        env: {
          GIT_ATTR_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_NO_LAZY_FETCH: '1',
          GIT_NO_REPLACE_OBJECTS: '1',
          GIT_OPTIONAL_LOCKS: '0',
          GIT_PAGER: 'cat',
          GIT_PROTOCOL_FROM_USER: '0',
          GIT_TERMINAL_PROMPT: '0',
          LANG: 'C',
          LC_ALL: 'C',
        },
        input: undefined,
        killSignal: 'SIGKILL',
        maxBuffer: 4096,
        shell: false,
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 5000,
        windowsHide: true,
      },
    ]);
    stdout = result?.stdout;
    if (!result || result.error !== undefined || result.status !== 0 ||
        result.signal !== null || !BUFFER_IS_BUFFER(stdout) ||
        (stdout.length !== 41 && stdout.length !== 65) ||
        stdout[stdout.length - 1] !== 0x0a) fail();
    const revision = stdout.subarray(0, stdout.length - 1).toString('ascii');
    if (!REFLECT_APPLY(REGEXP_TEST, REVISION, [revision])) fail();
    return revision;
  } catch {
    fail();
  } finally {
    wipeBuffer(stdout);
  }
}

function captureDependencies(injected, selection) {
  if (selection === CAPTURED_DEFAULT_DEPENDENCY_SELECTION) {
    if (injected !== undefined || CAPTURED_DEFAULT_DEPENDENCIES.platform !== 'darwin') fail();
    return CAPTURED_DEFAULT_DEPENDENCIES;
  }
  if (selection !== INJECTED_TEST_ONLY_DEPENDENCY_SELECTION) fail();
  const supplied = injected === undefined ? {} : exactPartialOptions(injected, [
    'attestSourceTree', 'captureSourceRevision', 'entropySource', 'platform',
    'privateWorkspaceInjections', 'quickTunnelInjections', 'sdkLoader',
  ]);
  const dependencies = {
    ...CAPTURED_DEFAULT_DEPENDENCIES,
    ...supplied,
  };
  if (dependencies.platform !== 'darwin') fail();
  for (const field of [
    'attestSourceTree', 'captureSourceRevision', 'entropySource', 'sdkLoader',
  ]) if (typeof dependencies[field] !== 'function') fail();
  return OBJECT_FREEZE(dependencies);
}

function snapshotBootstrap(value) {
  let frame;
  try {
    frame = frameGateBOperatorCoordinatorBootstrap(value);
    const bootstrap = parseGateBOperatorCoordinatorBootstrapFrame(frame);
    if (bootstrap.schemaVersion !== 5 || bootstrap.mode !== MODE) fail();
    return bootstrap;
  } catch {
    fail();
  } finally {
    wipeBuffer(frame);
  }
}

function snapshotReview(value) {
  let frame;
  try {
    frame = frameGateBOperatorCoordinatorReview(value);
    const review = parseGateBOperatorCoordinatorReviewFrame(frame);
    if (review.schemaVersion !== 5) fail();
    return review;
  } catch {
    fail();
  } finally {
    wipeBuffer(frame);
  }
}

function snapshotOperatorTrustedCrossCheck(value) {
  let frame;
  try {
    frame = frameGateBOperatorReviewResult(value);
    const crossCheck = parseGateBOperatorReviewResultFrame(frame);
    if (crossCheck.resultVersion !== 5 ||
        crossCheck.type !==
          GATE_B_RESET_EPOCH_OFFLINE_PREFLIGHT.crossCheckClassification ||
        crossCheck.independentReview !==
          GATE_B_RESET_EPOCH_OFFLINE_PREFLIGHT.independentReview) fail();
    return crossCheck;
  } catch {
    fail();
  } finally {
    wipeBuffer(frame);
  }
}

function exactWorkspace(value) {
  if (!value || typeof value !== 'object' || IS_PROXY(value) ||
      !REFLECT_APPLY(IS_FROZEN, Object, [value])) fail();
  for (const method of [
    'assertAbsent', 'reserveOutputs', 'openInputs', 'assertDistinct', 'verify',
    'read', 'write', 'syncDirectories', 'close',
  ]) if (typeof dataProperty(value, method) !== 'function') fail();
  return value;
}

function exactRecords(value, expectedLength) {
  if (!ARRAY_IS_ARRAY(value) || IS_PROXY(value) ||
      GET_PROTOTYPE_OF(value) !== Array.prototype || value.length !== expectedLength ||
      REFLECT_OWN_KEYS(value).length !== expectedLength + 1 ||
      !REFLECT_APPLY(IS_FROZEN, Object, [value])) fail();
  return value;
}

function canonicalLine(value) {
  const bytes = BUFFER_FROM(`${canonicalJson(value)}\n`, 'utf8');
  if (bytes.length < 2 || bytes.length > MAX_DOCUMENT_BYTES) {
    wipeBuffer(bytes);
    fail();
  }
  return bytes;
}

function exactNames(value) {
  if (!ARRAY_IS_ARRAY(value) || IS_PROXY(value) ||
      GET_PROTOTYPE_OF(value) !== Array.prototype) fail();
  const names = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, String(index));
    if (!descriptor || !HAS_OWN(descriptor, 'value') ||
        typeof descriptor.value !== 'string') fail();
    names.push(descriptor.value);
  }
  return REFLECT_APPLY(ARRAY_SORT, names, []);
}

async function assertExactLeaves(root, expected) {
  const names = exactNames(await callAsync(readdir, undefined, [root]));
  const expectedNames = REFLECT_APPLY(ARRAY_SORT, [...expected], []);
  if (canonicalJson(names) !== canonicalJson(expectedNames)) fail();
}

async function captureAndAttestRevision(dependencies, expected) {
  const revision = await callAsync(dependencies.captureSourceRevision, undefined, []);
  if (typeof revision !== 'string' ||
      !REFLECT_APPLY(REGEXP_TEST, REVISION, [revision]) ||
      (expected !== undefined && revision !== expected)) fail();
  const attested = await callAsync(dependencies.attestSourceTree, undefined, [revision]);
  if (attested !== true) fail();
  return revision;
}

function exactQuickTunnelProvenance(handoff, expected) {
  let provenance;
  try {
    provenance = readGateBQuickTunnelHostnameSourceHandoffProvenance(handoff);
  } catch (reason) {
    if (isGateBQuickTunnelLaunchFailure(reason)) throw reason;
    fail();
  }
  if (!provenance || IS_PROXY(provenance) || GET_PROTOTYPE_OF(provenance) !== null ||
      !REFLECT_APPLY(IS_FROZEN, Object, [provenance]) ||
      (expected !== undefined && provenance !== expected)) fail();
  const fields = REFLECT_OWN_KEYS(provenance);
  if (fields.length !== 2 || fields[0] !== 'dependencySelection' ||
      fields[1] !== 'processGroupSelection') fail();
  const dependencySelection = provenance.dependencySelection;
  const processGroupSelection = provenance.processGroupSelection;
  if (!dependencySelection || IS_PROXY(dependencySelection) ||
      !REFLECT_APPLY(IS_FROZEN, Object, [dependencySelection]) ||
      (dependencySelection.mode !== CAPTURED_QUICK_TUNNEL_DEPENDENCY_MODE &&
        dependencySelection.mode !== INJECTED_QUICK_TUNNEL_DEPENDENCY_MODE) ||
      !processGroupSelection || IS_PROXY(processGroupSelection) ||
      !REFLECT_APPLY(IS_FROZEN, Object, [processGroupSelection]) ||
      processGroupSelection.mode !== INHERITED_PROCESS_GROUP_MODE ||
      processGroupSelection.authoritativeGroup !== false) fail();
  return provenance;
}

async function currentHandoff(state) {
  const provenance = exactQuickTunnelProvenance(
    state.handoff,
    state.quickTunnelProvenance,
  );
  const ready = await callAsync(dataProperty(state.handoff, 'assertCurrent'), state.handoff, []);
  if (ready !== true) fail();
  if (exactQuickTunnelProvenance(state.handoff, provenance) !== provenance) fail();
  return true;
}

function sdkSurface(sdk) {
  if (!sdk || typeof sdk !== 'object' || IS_PROXY(sdk)) fail();
  const KeyStore = dataProperty(sdk, 'KeyStore');
  const fromEntropy = dataProperty(KeyStore, 'fromEntropy');
  const fromMnemonic = dataProperty(KeyStore, 'fromMnemonic');
  const Address = dataProperty(sdk, 'Address');
  const parseAddress = dataProperty(Address, 'parse');
  const asset = dataProperty(sdk, 'ZNN_ZTS');
  const assetToString = dataProperty(asset, 'toString');
  if ((typeof KeyStore !== 'object' && typeof KeyStore !== 'function') ||
      typeof fromEntropy !== 'function' || typeof fromMnemonic !== 'function' ||
      (typeof Address !== 'object' && typeof Address !== 'function') ||
      typeof parseAddress !== 'function' || !asset ||
      typeof assetToString !== 'function') fail();
  const assetText = exactSafeString(REFLECT_APPLY(assetToString, asset, []), 128);
  return OBJECT_FREEZE({
    Address,
    KeyStore,
    asset: assetText,
    fromEntropy,
    fromMnemonic,
    parseAddress,
  });
}

function addressFromKeyPair(keyPair) {
  if (!keyPair || typeof keyPair !== 'object' || IS_PROXY(keyPair)) fail();
  const getAddress = dataProperty(keyPair, 'getAddress');
  if (typeof getAddress !== 'function') fail();
  const addressObject = REFLECT_APPLY(getAddress, keyPair, []);
  const toString = dataProperty(addressObject, 'toString');
  if (typeof toString !== 'function') fail();
  return exactSafeString(REFLECT_APPLY(toString, addressObject, []), MAX_ADDRESS_BYTES);
}

function canonicalAddressFromText(surface, value) {
  assertCanonicalZenonUserAddress(value);
  let parsed;
  try {
    parsed = REFLECT_APPLY(surface.parseAddress, surface.Address, [value]);
  } catch {
    fail();
  }
  const toString = dataProperty(parsed, 'toString');
  if (typeof toString !== 'function' ||
      REFLECT_APPLY(toString, parsed, []) !== value) fail();
  return value;
}

function createWalletMaterial(surface, dependencies) {
  let entropy;
  let entropyText;
  let wallet;
  const keyPairs = [];
  let walletBytes;
  try {
    entropy = REFLECT_APPLY(dependencies.entropySource, undefined, [ENTROPY_BYTES]);
    if (!BUFFER_IS_BUFFER(entropy) || IS_PROXY(entropy) ||
        GET_PROTOTYPE_OF(entropy) !== Buffer.prototype ||
        entropy.length !== ENTROPY_BYTES ||
        (typeof SharedArrayBuffer === 'function' &&
          entropy.buffer instanceof SharedArrayBuffer)) fail();
    entropyText = entropy.toString('hex');
    wallet = REFLECT_APPLY(surface.fromEntropy, surface.KeyStore, [entropyText]);
    if (!wallet || typeof wallet !== 'object' || IS_PROXY(wallet)) fail();
    const mnemonic = exactSafeString(dataProperty(wallet, 'mnemonic'), MAX_MNEMONIC_BYTES);
    const getKeyPair = dataProperty(wallet, 'getKeyPair');
    if (typeof getKeyPair !== 'function') fail();
    keyPairs.push(REFLECT_APPLY(getKeyPair, wallet, [0]));
    const payer = canonicalAddressFromText(surface, addressFromKeyPair(keyPairs[0]));
    walletBytes = canonicalLine({ accountIndex: 0, mnemonic, secretVersion: 1 });
    return {
      payer,
      takeWalletBytes() {
        const bytes = walletBytes;
        walletBytes = undefined;
        return bytes;
      },
    };
  } catch {
    fail();
  } finally {
    wipeBuffer(entropy);
    entropyText = undefined;
    clearSecrets(wallet, keyPairs);
  }
}

function digestWalletBytes(bytes) {
  if (!BUFFER_IS_BUFFER(bytes) || bytes.length < 1) fail();
  const hash = createHash('sha256');
  hash.update(bytes);
  return hash.digest();
}

function derivePayerFromWalletBytes(surface, bytes) {
  let wallet;
  const keyPairs = [];
  try {
    const secret = parseGateBResetEpochOfflineWalletBytes(bytes);
    wallet = REFLECT_APPLY(surface.fromMnemonic, surface.KeyStore, [secret.mnemonic]);
    if (!wallet || typeof wallet !== 'object' || IS_PROXY(wallet)) fail();
    const getKeyPair = dataProperty(wallet, 'getKeyPair');
    if (typeof getKeyPair !== 'function') fail();
    keyPairs.push(REFLECT_APPLY(getKeyPair, wallet, [0]));
    return canonicalAddressFromText(surface, addressFromKeyPair(keyPairs[0]));
  } catch {
    fail();
  } finally {
    clearSecrets(wallet, keyPairs);
  }
}

function buildPreparedDocuments(
  bootstrap,
  policyDescriptor,
  hostnameSource,
  revision,
  payer,
  payee,
  asset,
) {
  const config = {
    runnerVersion: 4,
    executionMode: GATE_B_RESET_EPOCH_OFFLINE_PREFLIGHT.executionMode,
    eventId: policyDescriptor.policySelection.eventId,
    rpcEndpoint: policyDescriptor.policySelection.rpcEndpoint,
    sourceRevision: revision,
    profileName: policyDescriptor.policySelection.profileName,
    payer,
    acknowledgements: {
      live: policyDescriptor.policySelection.liveAcknowledgement,
      operatorTrust: policyDescriptor.policySelection.operatorTrustAcknowledgement,
      wss: policyDescriptor.policySelection.wssAcknowledgement,
    },
    expectedPaymentRequired: {
      x402Version: 2,
      resource: {
        url: `https://${hostnameSource.hostname}/paid`,
        description: 'Zenon x402 PoC protected resource',
        mimeType: 'application/json',
      },
      accepts: [{
        scheme: 'exact',
        network: 'zenon:testnet',
        asset,
        amount: GATE_B_RESET_EPOCH_OFFLINE_PREFLIGHT.maximumAmount,
        payTo: payee,
        maxTimeoutSeconds: GATE_B_RESET_EPOCH_OFFLINE_PREFLIGHT.maximumTimeoutSeconds,
        extra: {
          paymentFlow: 'upfront',
          poc: true,
          settlement: 'account-block',
          zenonChain: { ...PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_CHAIN_PROFILE },
        },
      }],
    },
    quickTunnel: hostnameSource.quickTunnel,
    runtime: {
      listenPort: 41000,
      rpcTimeoutMs: 30000,
      maxRecoveryAttempts: 0,
      recoveryDelayMs: 0,
      maxRecoveryElapsedMs: 1,
    },
  };
  const configBytes = canonicalLine(config);
  const rpcBytes = canonicalLine({
    rpcEndpoint: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
    secretVersion: 4,
  });
  try {
    const parsedConfig = parseGateBResetEpochOfflineRunConfig(configBytes.toString('utf8'));
    parseGateBResetEpochOfflineRoleInput(rpcBytes.toString('utf8'), 'buyer-rpc');
    parseGateBResetEpochOfflineRoleInput(rpcBytes.toString('utf8'), 'facilitator-rpc');
    if (parsedConfig.eventId !== PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID ||
        parsedConfig.profileName !==
          PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME ||
        parsedConfig.payer !== payer ||
        parsedConfig.expectedPaymentRequired.accepts[0].payTo !== payee ||
        bootstrap.runName.length < 1) fail();
    return {
      config: parsedConfig,
      configBytes,
      configDigest: gateBResetEpochOfflineConfigDigest(parsedConfig),
      paymentIntentDigest: gateBResetEpochOfflinePaymentIntentDigest(parsedConfig),
      rpcBytes,
    };
  } catch {
    wipeBuffer(configBytes);
    wipeBuffer(rpcBytes);
    fail();
  }
}

function receiptProvenanceClassification(state) {
  return state.testOnly
    ? GATE_B_RESET_EPOCH_OFFLINE_PROVENANCE.injectedTestOnly
    : GATE_B_RESET_EPOCH_OFFLINE_PROVENANCE.capturedDefault;
}

function offlineReceiptDocument(state) {
  const receipt = {
    artifactValidation: GATE_B_RESET_EPOCH_OFFLINE_PREFLIGHT.artifactValidation,
    configDigest: state.configDigest,
    crossCheckClassification:
      GATE_B_RESET_EPOCH_OFFLINE_PREFLIGHT.crossCheckClassification,
    evidenceClassification: GATE_B_RESET_EPOCH_OFFLINE_PREFLIGHT.evidenceClassification,
    futureLiveConsumerEligible: false,
    independentReview: GATE_B_RESET_EPOCH_OFFLINE_PREFLIGHT.independentReview,
    livePaymentDecision: GATE_B_RESET_EPOCH_OFFLINE_PREFLIGHT.livePaymentDecision,
    payee: state.payee,
    payer: state.payer,
    paymentIntentDigest: state.paymentIntentDigest,
    provenanceClassification: receiptProvenanceClassification(state),
    receiptType: GATE_B_RESET_EPOCH_OFFLINE_PREFLIGHT.receiptType,
    receiptVersion: 1,
    runAuthorization: 'RUN_NOT_AUTHORIZED',
    runName: state.bootstrap.runName,
    sourceRevision: state.sourceRevision,
  };
  const bytes = canonicalLine(receipt);
  try {
    const parsed = parseGateBResetEpochOfflinePreflightReceipt(bytes.toString('utf8'));
    if (parsed.configDigest !== state.configDigest ||
        parsed.paymentIntentDigest !== state.paymentIntentDigest ||
        parsed.sourceRevision !== state.sourceRevision ||
        parsed.payer !== state.payer || parsed.payee !== state.payee ||
        parsed.runAuthorization !== 'RUN_NOT_AUTHORIZED' ||
        parsed.futureLiveConsumerEligible !== false) fail();
    return bytes;
  } catch {
    wipeBuffer(bytes);
    fail();
  }
}

async function verifyRetainedRecords(state, expectedLeaves) {
  if (state.records.length !== state.recordSizes.length ||
      state.records.length !== expectedLeaves.length) fail();
  if (REFLECT_APPLY(dataProperty(state.workspace, 'assertDistinct'), state.workspace,
    [state.records]) !== true) fail();
  await assertExactLeaves(state.bootstrap.workspaceRoot, expectedLeaves);
  for (let index = 0; index < state.records.length; index += 1) {
    const verified = await callAsync(
      dataProperty(state.workspace, 'verify'),
      state.workspace,
      [state.records[index], state.recordSizes[index]],
    );
    if (verified !== true) fail();
  }
  await assertExactLeaves(state.bootstrap.workspaceRoot, expectedLeaves);
}

async function verifyRetainedWallet(state) {
  let walletBytes;
  let observedDigest;
  try {
    walletBytes = await callAsync(
      dataProperty(state.workspace, 'read'),
      state.workspace,
      [state.records[0]],
    );
    if (!BUFFER_IS_BUFFER(walletBytes) || walletBytes.length !== state.recordSizes[0]) fail();
    observedDigest = digestWalletBytes(walletBytes);
    if (!BUFFER_IS_BUFFER(state.walletDigest) || state.walletDigest.length !== 32 ||
        observedDigest.length !== state.walletDigest.length ||
        !REFLECT_APPLY(timingSafeEqual, undefined, [observedDigest, state.walletDigest])) fail();
    const payer = derivePayerFromWalletBytes(state.sdkSurface, walletBytes);
    if (payer !== state.payer) fail();
    if (await callAsync(dataProperty(state.workspace, 'verify'), state.workspace,
      [state.records[0], walletBytes.length]) !== true) fail();
    return true;
  } catch {
    fail();
  } finally {
    wipeBuffer(observedDigest);
    wipeBuffer(walletBytes);
  }
}

function verifyReviewAndCrossCheckBindings(state, review, operatorTrustedCrossCheck) {
  if (review.reviewedConfigDigest !== state.configDigest ||
      review.reviewedPaymentIntentDigest !== state.paymentIntentDigest ||
      review.reviewedPayer !== state.payer || review.reviewedPayee !== state.payee ||
      operatorTrustedCrossCheck.configDigest !== state.configDigest ||
      operatorTrustedCrossCheck.paymentIntentDigest !== state.paymentIntentDigest ||
      operatorTrustedCrossCheck.payer !== state.payer ||
      operatorTrustedCrossCheck.payee !== state.payee ||
      operatorTrustedCrossCheck.sourceRevision !== state.sourceRevision ||
      operatorTrustedCrossCheck.hostname !== state.hostname) fail();
  return true;
}

function createClosedDeferred() {
  let resolve;
  const promise = createNativePromise(accept => { resolve = accept; });
  return OBJECT_FREEZE({ promise, resolve });
}

async function closeStateSettlement(state) {
  let clean = state.quarantined !== true;
  let stopWork;
  let waitWork;
  if (state.lease !== undefined) {
    try {
      state.stopCalls += 1;
      stopWork = callAsync(stopGateBQuickTunnel, undefined, [state.lease]);
    } catch {
      clean = false;
    }
    try {
      state.waitCalls += 1;
      waitWork = callAsync(waitGateBQuickTunnelClosed, undefined, [state.lease]);
    } catch {
      clean = false;
    }
  }
  if (stopWork) {
    try { if (await stopWork !== true) clean = false; } catch { clean = false; }
  }
  if (waitWork) {
    try { if (await waitWork !== true) clean = false; } catch { clean = false; }
  }
  if (state.workspace !== undefined) {
    try {
      if (await callAsync(dataProperty(state.workspace, 'close'), state.workspace, []) !== true) {
        clean = false;
      }
    } catch {
      clean = false;
    }
    state.workspace = undefined;
  }
  wipeBuffer(state.walletDigest);
  state.walletDigest = undefined;
  state.sdkSurface = undefined;
  if (state.stopCalls > 1 || state.waitCalls > 1) clean = false;
  const status = clean ? STATUSES.CLOSED : STATUSES.QUARANTINED;
  state.status = status;
  state.phase = status;
  state.closed.resolve(status);
  return status;
}

function beginClose(state, quarantine = false) {
  if (quarantine) state.quarantined = true;
  if (state.closeWork) return state.closed.promise;
  state.closing = true;
  state.closeWork = pinNativePromiseConstructor(closeStateSettlement(state));
  return state.closed.promise;
}

function ensureActive(state, phase) {
  if (state.phase !== phase || state.closing || state.quarantined) fail();
}

function stateFor(capability) {
  const state = REFLECT_APPLY(WEAK_MAP_GET, CAPABILITY_STATES, [capability]);
  if (!state || state.capability !== capability) fail();
  return state;
}

function createCapability(state) {
  const capability = OBJECT_FREEZE(OBJECT_CREATE(null));
  state.capability = capability;
  REFLECT_APPLY(WEAK_MAP_SET, CAPABILITY_STATES, [capability, state]);
  return capability;
}

async function prepareSettlement(bootstrapInput, injected, dependencySelection) {
  const secretBuffers = [];
  let state;
  let walletMaterial;
  try {
    const bootstrap = snapshotBootstrap(bootstrapInput);
    const policyDescriptor = parseGateBResetEpochPolicyPreflight(
      bootstrap.policyPreflight,
    );
    const dependencies = captureDependencies(injected, dependencySelection);
    const closed = createClosedDeferred();
    state = {
      bootstrap,
      capability: undefined,
      closeWork: undefined,
      closed,
      closing: false,
      config: undefined,
      configDigest: undefined,
      dependencies,
      dependencySelection,
      diagnosticEvidenceValid: true,
      diagnosticStage: GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.UNKNOWN,
      futureLiveConsumerEligible: false,
      handoff: undefined,
      hostname: undefined,
      lease: undefined,
      payee: undefined,
      payer: undefined,
      paymentIntentDigest: undefined,
      phase: 'PREPARING',
      policyDescriptor,
      quarantined: false,
      residuePossible: false,
      quickTunnelProvenance: undefined,
      recordSizes: [],
      records: [],
      sdkSurface: undefined,
      sourceRevision: undefined,
      status: undefined,
      stopCalls: 0,
      testOnly: dependencySelection === INJECTED_TEST_ONLY_DEPENDENCY_SELECTION,
      waitCalls: 0,
      walletDigest: undefined,
      workspace: undefined,
    };

    state.sourceRevision = await captureAndAttestRevision(dependencies);
    ensureActive(state, 'PREPARING');
    state.workspace = exactWorkspace(await (dependencies.privateWorkspaceInjections === undefined
      ? callAsync(openGateBPublicWsPrivateWorkspace, undefined, [bootstrap.workspaceRoot])
      : callAsync(openGateBPublicWsPrivateWorkspace, undefined, [
        bootstrap.workspaceRoot,
        dependencies.privateWorkspaceInjections,
      ])));
    await assertExactLeaves(bootstrap.workspaceRoot, []);
    await callAsync(dataProperty(state.workspace, 'assertAbsent'), state.workspace, [
      [...SIX_LEAVES, RESET_LIVE_APPROVAL_LEAF],
    ]);
    await assertExactLeaves(bootstrap.workspaceRoot, []);
    ensureActive(state, 'PREPARING');

    const sdk = await callAsync(dependencies.sdkLoader, undefined, []);
    const surface = sdkSurface(sdk);
    state.sdkSurface = surface;
    state.payee = canonicalAddressFromText(surface, bootstrap.payeeAddress);
    ensureActive(state, 'PREPARING');
    const tunnelBootstrap = {
      cloudflaredExecutable: bootstrap.quickTunnel.cloudflaredExecutable,
      operation: GATE_B_QUICK_TUNNEL_OPERATIONS.START,
      schemaVersion: 1,
      sourcePin: bootstrap.quickTunnel.sourcePin,
      telemetryAcknowledgement: bootstrap.quickTunnel.telemetryAcknowledgement,
      telemetryMode: bootstrap.quickTunnel.telemetryMode,
      workspaceRoot: bootstrap.workspaceRoot,
    };
    state.residuePossible = true;
    try {
      state.lease = await (dependencies.quickTunnelInjections === undefined
        ? callAsync(launchGateBQuickTunnelInInheritedProcessGroup, undefined, [tunnelBootstrap])
        : callAsync(launchGateBQuickTunnelInInheritedProcessGroup, undefined, [
          tunnelBootstrap,
          dependencies.quickTunnelInjections,
        ]));
    } catch (reason) {
      if (readGateBQuickTunnelLaunchFailureStage(reason) ===
          GATE_B_QUICK_TUNNEL_FAILURE_STAGES.HOSTNAME_SOURCE_WRITTEN) {
        advanceDiagnosticStage(
          state,
          GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.HOSTNAME_SOURCE_WRITTEN,
        );
      }
      throw reason;
    }
    advanceDiagnosticStage(
      state,
      GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.QUICK_TUNNEL_ACTIVE_CONFIRMED,
    );
    ensureActive(state, 'PREPARING');
    state.handoff = claimGateBQuickTunnelHostnameSourceHandoff(
      state.lease,
      bootstrap.workspaceRoot,
    );
    state.quickTunnelProvenance = exactQuickTunnelProvenance(state.handoff);
    if (readGateBQuickTunnelHostnameSourceHandoffDiagnosticStage(state.handoff) !==
        GATE_B_QUICK_TUNNEL_FAILURE_STAGES.HOSTNAME_SOURCE_WRITTEN) {
      state.diagnosticEvidenceValid = false;
      fail();
    }
    if (state.quickTunnelProvenance.dependencySelection.mode ===
        INJECTED_QUICK_TUNNEL_DEPENDENCY_MODE) state.testOnly = true;
    if (dependencySelection === CAPTURED_DEFAULT_DEPENDENCY_SELECTION &&
        state.quickTunnelProvenance.dependencySelection.mode !==
          CAPTURED_QUICK_TUNNEL_DEPENDENCY_MODE) fail();
    await currentHandoff(state);
    ensureActive(state, 'PREPARING');
    advanceDiagnosticStage(
      state,
      GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.HOSTNAME_HANDOFF_VERIFIED,
    );
    await assertExactLeaves(bootstrap.workspaceRoot, [
      GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
    ]);

    const hostnameRecords = exactRecords(await callAsync(
      dataProperty(state.workspace, 'openInputs'),
      state.workspace,
      [[GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource]],
    ), 1);
    const hostnameRecord = hostnameRecords[0];
    if (await callAsync(dataProperty(state.workspace, 'verify'), state.workspace,
      [hostnameRecord]) !== true) fail();
    const hostnameBytes = await callAsync(
      dataProperty(state.workspace, 'read'),
      state.workspace,
      [hostnameRecord],
    );
    secretBuffers.push(hostnameBytes);
    const hostnameSource = parseGateBQuickTunnelHostnameSource(hostnameBytes);
    state.hostname = hostnameSource.hostname;
    if (await callAsync(dataProperty(state.workspace, 'verify'), state.workspace,
      [hostnameRecord, hostnameBytes.length]) !== true) fail();
    advanceDiagnosticStage(
      state,
      GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.HOSTNAME_SOURCE_VERIFIED,
    );

    walletMaterial = createWalletMaterial(surface, dependencies);
    const walletBytes = walletMaterial.takeWalletBytes();
    secretBuffers.push(walletBytes);
    state.payer = walletMaterial.payer;
    if (state.payer === state.payee) fail();
    state.walletDigest = digestWalletBytes(walletBytes);
    advanceDiagnosticStage(
      state,
      GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.WALLET_MATERIAL_DERIVED,
    );
    const documents = buildPreparedDocuments(
      bootstrap,
      policyDescriptor,
      hostnameSource,
      state.sourceRevision,
      walletMaterial.payer,
      state.payee,
      surface.asset,
    );
    secretBuffers.push(documents.configBytes, documents.rpcBytes);
    state.config = documents.config;
    state.configDigest = documents.configDigest;
    state.paymentIntentDigest = documents.paymentIntentDigest;
    walletMaterial = undefined;

    const walletRecords = exactRecords(await callAsync(
      dataProperty(state.workspace, 'reserveOutputs'),
      state.workspace,
      [[GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet]],
    ), 1);
    advanceDiagnosticStage(
      state,
      GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.WALLET_LEAF_RESERVED,
    );
    const remainingRecords = exactRecords(await callAsync(
      dataProperty(state.workspace, 'reserveOutputs'),
      state.workspace,
      [REMAINING_PRE_REVIEW_LEAVES],
    ), REMAINING_PRE_REVIEW_LEAVES.length);
    const outputRecords = [walletRecords[0], ...remainingRecords];
    advanceDiagnosticStage(
      state,
      GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.PRE_REVIEW_OUTPUTS_RESERVED,
    );
    state.records = [
      outputRecords[0],
      hostnameRecord,
      outputRecords[3],
      outputRecords[1],
      outputRecords[2],
    ];
    const writes = [
      [outputRecords[0], walletBytes],
      [outputRecords[1], documents.rpcBytes],
      [outputRecords[2], documents.rpcBytes],
      [outputRecords[3], documents.configBytes],
    ];
    for (let index = 0; index < writes.length; index += 1) {
      if (await callAsync(dataProperty(state.workspace, 'write'), state.workspace,
        writes[index]) !== true) fail();
      if (await callAsync(dataProperty(state.workspace, 'verify'), state.workspace,
        [writes[index][0], writes[index][1].length]) !== true) fail();
    }
    if (await callAsync(dataProperty(state.workspace, 'syncDirectories'),
      state.workspace, []) !== true) fail();
    state.recordSizes = [
      walletBytes.length,
      hostnameBytes.length,
      documents.configBytes.length,
      documents.rpcBytes.length,
      documents.rpcBytes.length,
    ];
    await verifyRetainedRecords(state, FIVE_LEAVES);
    await currentHandoff(state);
    ensureActive(state, 'PREPARING');
    advanceDiagnosticStage(
      state,
      GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.PRE_REVIEW_OUTPUTS_COMMITTED,
    );
    state.phase = 'REVIEW_REQUIRED';
    state.status = STATUSES.REVIEW_REQUIRED;
    wipeBuffers(secretBuffers);
    secretBuffers.length = 0;
    return createCapability(state);
  } catch (reason) {
    if (state && isGateBQuickTunnelLaunchFailure(reason) &&
        readGateBQuickTunnelLaunchFailureStage(reason) ===
          GATE_B_QUICK_TUNNEL_FAILURE_STAGES.UNKNOWN) {
      state.diagnosticEvidenceValid = false;
    }
    const diagnosticStage = state?.diagnosticEvidenceValid === true
      ? exactDiagnosticStage(state.diagnosticStage)
      : GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.UNKNOWN;
    if (state) {
      state.quarantined = state.residuePossible;
      try { await beginClose(state, state.quarantined); } catch {}
    }
    throw error(diagnosticStage);
  } finally {
    wipeBuffers(secretBuffers);
  }
}

async function validateOfflineCrossCheckSettlement(
  state,
  reviewInput,
  operatorTrustedCrossCheckInput,
) {
  let receiptBytes;
  try {
    const review = snapshotReview(reviewInput);
    const operatorTrustedCrossCheck = snapshotOperatorTrustedCrossCheck(
      operatorTrustedCrossCheckInput,
    );
    ensureActive(state, 'REVIEWING');
    await captureAndAttestRevision(state.dependencies, state.sourceRevision);
    ensureActive(state, 'REVIEWING');
    await verifyRetainedRecords(state, FIVE_LEAVES);
    await verifyRetainedWallet(state);
    await currentHandoff(state);
    ensureActive(state, 'REVIEWING');
    verifyReviewAndCrossCheckBindings(state, review, operatorTrustedCrossCheck);
    await callAsync(dataProperty(state.workspace, 'assertAbsent'), state.workspace, [[
      RESET_LIVE_APPROVAL_LEAF,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.resetEpochOfflinePreflightReceipt,
    ]]);
    ensureActive(state, 'REVIEWING');

    receiptBytes = offlineReceiptDocument(state);
    const receiptRecords = exactRecords(await callAsync(
      dataProperty(state.workspace, 'reserveOutputs'),
      state.workspace,
      [[GATE_B_PUBLIC_WS_INPUT_LEAVES.resetEpochOfflinePreflightReceipt]],
    ), 1);
    const receiptRecord = receiptRecords[0];
    advanceDiagnosticStage(
      state,
      GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.OFFLINE_RECEIPT_RESERVED,
    );
    if (REFLECT_APPLY(dataProperty(state.workspace, 'assertDistinct'), state.workspace,
      [[...state.records, receiptRecord]]) !== true) fail();
    if (await callAsync(dataProperty(state.workspace, 'write'), state.workspace,
      [receiptRecord, receiptBytes]) !== true) fail();
    if (await callAsync(dataProperty(state.workspace, 'verify'), state.workspace,
      [receiptRecord, receiptBytes.length]) !== true) fail();
    if (await callAsync(dataProperty(state.workspace, 'syncDirectories'),
      state.workspace, []) !== true) fail();
    state.records = [...state.records, receiptRecord];
    state.recordSizes = [...state.recordSizes, receiptBytes.length];
    await verifyRetainedRecords(state, SIX_LEAVES);
    ensureActive(state, 'REVIEWING');
    await callAsync(dataProperty(state.workspace, 'assertAbsent'), state.workspace, [[
      RESET_LIVE_APPROVAL_LEAF,
    ]]);
    await captureAndAttestRevision(state.dependencies, state.sourceRevision);
    ensureActive(state, 'REVIEWING');
    await currentHandoff(state);
    ensureActive(state, 'REVIEWING');
    advanceDiagnosticStage(
      state,
      GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.OFFLINE_RECEIPT_COMMITTED,
    );
    state.phase = 'OFFLINE_RECEIPT_VALID';
    state.status = STATUSES.OFFLINE_RECEIPT_VALID;
    return STATUSES.OFFLINE_RECEIPT_VALID;
  } catch (reason) {
    if (isGateBQuickTunnelLaunchFailure(reason) &&
        readGateBQuickTunnelLaunchFailureStage(reason) ===
          GATE_B_QUICK_TUNNEL_FAILURE_STAGES.UNKNOWN) {
      state.diagnosticEvidenceValid = false;
    }
    const diagnosticStage = state.diagnosticEvidenceValid === true
      ? exactDiagnosticStage(state.diagnosticStage)
      : GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.UNKNOWN;
    state.quarantined = true;
    try { await beginClose(state, true); } catch {}
    throw error(diagnosticStage);
  } finally {
    wipeBuffer(receiptBytes);
  }
}

export function prepareGateBResetEpochExactSixNativeForReview(
  bootstrap,
  injected,
) {
  const dependencySelection = arguments.length < 2
    ? CAPTURED_DEFAULT_DEPENDENCY_SELECTION
    : INJECTED_TEST_ONLY_DEPENDENCY_SELECTION;
  return pinNativePromiseConstructor(prepareSettlement(
    bootstrap,
    injected,
    dependencySelection,
  ));
}

export function validateGateBResetEpochExactSixNativeOfflineCrossCheck(
  capability,
  review,
  operatorTrustedCrossCheck,
) {
  let state;
  try {
    if (arguments.length !== 3) fail();
    state = stateFor(capability);
    if (state.phase !== 'REVIEW_REQUIRED' || state.closing || state.quarantined) {
      if (!state.closing) beginClose(state, true);
      return rejectNativePromise();
    }
    state.phase = 'REVIEWING';
    return pinNativePromiseConstructor(validateOfflineCrossCheckSettlement(
      state,
      review,
      operatorTrustedCrossCheck,
    ));
  } catch {
    if (state && !state.closing) beginClose(state, true);
    return rejectNativePromise();
  }
}

export function getGateBResetEpochExactSixNativeStatus(capability) {
  try {
    if (arguments.length !== 1) fail();
    const state = stateFor(capability);
    if (state.status !== STATUSES.REVIEW_REQUIRED &&
        state.status !== STATUSES.OFFLINE_RECEIPT_VALID &&
        state.status !== STATUSES.CLOSED &&
        state.status !== STATUSES.QUARANTINED) fail();
    return state.status;
  } catch {
    fail();
  }
}

export function stopGateBResetEpochExactSixNative(capability) {
  try {
    if (arguments.length !== 1) fail();
    const state = stateFor(capability);
    const unsafeTransition = state.phase === 'REVIEWING' || state.phase === 'PREPARING';
    return beginClose(state, unsafeTransition);
  } catch {
    return rejectNativePromise();
  }
}

export function waitGateBResetEpochExactSixNativeClosed(capability) {
  try {
    if (arguments.length !== 1) fail();
    return stateFor(capability).closed.promise;
  } catch {
    return rejectNativePromise();
  }
}
