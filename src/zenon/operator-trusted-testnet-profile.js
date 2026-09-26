import { types as utilTypes } from 'node:util';

const APPLY = Reflect.apply;
const ARRAY_IS_ARRAY = Array.isArray;
const ARRAY_PROTOTYPE = Array.prototype;
const ARRAY_SORT = Array.prototype.sort;
const BUFFER_IS_BUFFER = Buffer.isBuffer;
const BUFFER_TO_STRING = Buffer.prototype.toString;
const CREATE_OBJECT = Object.create;
const DEFINE_PROPERTY = Object.defineProperty;
const FREEZE = Object.freeze;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROMISE = utilTypes.isPromise;
const IS_PROXY = utilTypes.isProxy;
const NUMBER_CONSTRUCTOR = Number;
const NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;
const OBJECT_IS = Object.is;
const OBJECT_KEYS = Object.keys;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const REGEXP_EXEC = RegExp.prototype.exec;
const WEAK_SET_CONSTRUCTOR = WeakSet;
const WEAK_SET_ADD = WeakSet.prototype.add;
const WEAK_SET_HAS = WeakSet.prototype.has;
const WEAK_MAP_CONSTRUCTOR = WeakMap;
const WEAK_MAP_GET = WeakMap.prototype.get;
const WEAK_MAP_SET = WeakMap.prototype.set;
const PROMISE_CONSTRUCTOR = Promise;
const PROMISE_PROTOTYPE = Promise.prototype;
const PROMISE_THEN = Promise.prototype.then;
const PROMISE_SPECIES = Symbol.species;
const PROMISE_SPECIES_GETTER =
  GET_OWN_PROPERTY_DESCRIPTOR(PROMISE_CONSTRUCTOR, PROMISE_SPECIES)?.get;

const LOWERCASE_HASH = /^[0-9a-f]{64}$/;

export const OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME =
  'historical-testnet-wiki-height-2-2021-12-17-v1';

export const OPERATOR_TRUST_ACKNOWLEDGEMENT =
  'I_UNDERSTAND_THIS_ANCHOR_DOES_NOT_AUTHENTICATE_THE_CONNECTED_NODE';

export const TESTNET_LIVE_ACKNOWLEDGEMENT = 'I_UNDERSTAND_TESTNET_ONLY';

export const GATE_B_CURRENT_TESTNET_PROFILE_NAME =
  'gate-b-current-testnet-live-height-2-operator-trusted-v1';

export const GATE_B_CURRENT_TESTNET_OPERATOR_TRUST_ACKNOWLEDGEMENT =
  'I_UNDERSTAND_THIS_CURRENT_TESTNET_ANCHOR_IS_OPERATOR_TRUSTED_AND_INDEPENDENTLY_UNVERIFIED';

export const GATE_B_CURRENT_TESTNET_WARNING =
  'Warning: this current Gate-B testnet anchor was observed through operator-trusted plaintext RPC and is not independently authenticated.';

export const GATE_B_CURRENT_TESTNET_CHAIN_PROFILE = FREEZE({
  version: 1,
  chainIdentifier: '73404',
  genesisMomentumHash: '54f039f21649ec1c5fa453a55afb35361149f56a736821c1d8f36fce52f10590',
});

export const GATE_B_CURRENT_TESTNET_SDK_NETWORK_ID = '3';

export const GATE_B_CURRENT_TESTNET_PROVENANCE = FREEZE({
  source: 'operator-trusted-live-plaintext-rpc-observation',
  sourceDate: '2026-09-01',
  observationHeight: 2,
  observationHash: 'c688b5f3ad898938b3b65c369fb29d84c327abef9337780d7c3d8491d4dd772b',
  derivation: 'height-2 previousHash',
  sameSourceReproduced: true,
  publicGenesisDerivationCompleted: false,
  independentlyVerified: false,
});

export const GATE_B_CURRENT_TESTNET_NON_CLAIMS = FREEZE({
  authoritativeCurrentNetworkRelease: false,
  signedTrustArtifact: false,
  authenticatedRpcEndpoint: false,
  canonicalRemoteChainIdentity: false,
  verifiedFrontierLineage: false,
  publicGenesisIndependentlyVerified: false,
  reproducibleNodeBinary: false,
  productionReadiness: false,
});

export const OPERATOR_TRUSTED_PUBLIC_TESTNET_WARNING =
  'Warning: this historical public-testnet anchor is operator trusted; remote chain identity is not authenticated.';

export const OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE = FREEZE({
  version: 1,
  chainIdentifier: '3',
  genesisMomentumHash: '761f482683e6d0ed1f92af1140418b989b89c474d3491a2f4651bce99954bed6',
});

export const OPERATOR_TRUSTED_PUBLIC_TESTNET_PROVENANCE = FREEZE({
  repository: 'zenon-network/znn-wiki',
  revision: 'cad4cde3aea2e962a1713958323699c3298790ae',
  path: 'api.md',
  sourceDate: '2021-12-17',
  observationHeight: 2,
  observationHash: '5efd0e49736f2a1ff7eeef3e3e73fbbb087471ff1097d2e41041942adccdec93',
  derivation: 'height-2 previousHash',
});

export const OPERATOR_TRUSTED_PUBLIC_TESTNET_NON_CLAIMS = FREEZE({
  authoritativeCurrentNetworkRelease: false,
  signedTrustArtifact: false,
  authenticatedRpcEndpoint: false,
  canonicalRemoteChainIdentity: false,
  verifiedFrontierLineage: false,
  productionReadiness: false,
});

export const PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_PROFILE_NAME =
  'public-testnet-dynamic-plasma-epoch-2026-09-23t12-35-56-816z-v1';

export const PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_EVENT_ID =
  '2026-09-23T12:35:56.816Z';

export const PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_WSS_ENDPOINT =
  'wss://rpc.testnet.zenon.info/';

export const PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_HTTPS_JSON_RPC_ENDPOINT =
  'https://rpc.testnet.zenon.info/';

export const PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_SDK_NETWORK_ID = '3';

export const PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT =
  'I_UNDERSTAND_THIS_DYNAMIC_PLASMA_TESTNET_EPOCH_IS_OPERATOR_TRUSTED_AND_NOT_CANONICAL_OR_FINAL';

export const PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_WSS_ACKNOWLEDGEMENT =
  'I_UNDERSTAND_THIS_EPOCH_PROFILE_REQUIRES_THE_EXACT_PINNED_WSS_ENDPOINT_WITH_NO_PLAINTEXT_FALLBACK';

export const PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_WARNING =
  'Warning: this Dynamic Plasma public-testnet epoch profile is operator trusted; TLS does not authenticate canonical chain identity or finality.';

export const PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_CHAIN_PROFILE = FREEZE({
  version: 1,
  chainIdentifier: '73404',
  genesisMomentumHash: 'ec4e98634ecba550dead817daa8ddca99247708e584c8178bf5ab5c71c9b6204',
});

export const PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_PROVENANCE = FREEZE({
  nodePlanUrl: 'https://testnet.zenon.info/node-plan.json',
  genesisUrl: 'https://testnet.zenon.info/genesis.json',
  endpointAdvertisementUrl: 'https://testnet.zenon.info/llms.txt',
  nodePlanSchemaVersion: 1,
  nodePlanEventId: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_EVENT_ID,
  nodePlanPublishedAt: '2026-09-23T12:35:56.816Z',
  nodePlanFinalizedAt: '2026-09-23T12:35:51.778Z',
  nodePlanGenesisStartAt: '2026-09-23T12:40:00.000Z',
  nodePlanApplyAt: '2026-09-23T12:35:24.000Z',
  nodePlanWipeData: true,
  nodePlanGoZenonRepository: 'https://github.com/zenon-network/go-zenon.git',
  nodePlanGoZenonRef: 'dev',
  nodePlanGoZenonCommit: '32b96d9241a53966c31c310bd637e57562300255',
  nodePlanDeploymentRepository: 'https://github.com/hypercore-one/deployment.git',
  nodePlanDeploymentRef: 'main',
  nodePlanDeploymentCommit: '0cf7877212412fe7a714ed964bd6e55fc28c7887',
  genesisTimestampSec: 1790167200,
  dynamicPlasmaActivated: true,
  dynamicPlasmaEnforcementHeight: 10,
  rpcObservationEndpoint: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_HTTPS_JSON_RPC_ENDPOINT,
  wssEndpoint: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_WSS_ENDPOINT,
  observationHeight: 2,
  observationHash: '98b75ee5d45744bcfb6c55e3c514060fabad50a25d27a411d3d060f7f6806c94',
  derivation: 'height-1 hash with height-2 previousHash linkage',
  genesisMomentumHashBasis:
    'locally recomputed from published genesis using pinned go-zenon source; matched bounded TLS height-1 read',
  planStableAcrossBoundedReads: true,
  heightTwoPreviousHashMatchedHeightOne: true,
});

export const PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_NON_CLAIMS = FREEZE({
  authoritativeCurrentNetworkRelease: false,
  signedTrustArtifact: false,
  authenticatedRpcChainIdentity: false,
  canonicalRemoteChainIdentity: false,
  consensusFinality: false,
  binaryAttestation: false,
  verifiedFrontierLineage: false,
  productionReadiness: false,
});

export const HISTORICAL_PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME =
  'public-testnet-dynamic-plasma-reset-epoch-2026-09-24t11-14-13-445z-v1';

export const HISTORICAL_PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID =
  '2026-09-24T11:14:13.445Z';

export const HISTORICAL_PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_CHAIN_PROFILE =
  FREEZE({
    version: 1,
    chainIdentifier: '73404',
    genesisMomentumHash:
      'd0585e9dc3890b47941719a40e39b2e71172f468a41e206f31541344cb9f4683',
  });

export const HISTORICAL_PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROVENANCE =
  FREEZE({
    nodePlanUrl: 'https://testnet.zenon.info/node-plan.json',
    genesisUrl: 'https://testnet.zenon.info/genesis.json',
    endpointAdvertisementUrl: 'https://testnet.zenon.info/llms.txt',
    nodePlanSchemaVersion: 1,
    nodePlanEventId:
      HISTORICAL_PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
    nodePlanPublishedAt: '2026-09-24T11:14:13.445Z',
    nodePlanFinalizedAt: '2026-09-24T11:14:09.756Z',
    nodePlanGenesisStartAt: '2026-09-24T11:15:00.000Z',
    nodePlanApplyAt: '2026-09-24T11:13:23.000Z',
    nodePlanWipeData: true,
    nodePlanGoZenonRepository:
      'https://github.com/zenon-network/go-zenon.git',
    nodePlanGoZenonRef: 'dev',
    nodePlanGoZenonCommit: '32b96d9241a53966c31c310bd637e57562300255',
    nodePlanDeploymentRepository:
      'https://github.com/hypercore-one/deployment.git',
    nodePlanDeploymentRef: 'main',
    nodePlanDeploymentCommit: '0cf7877212412fe7a714ed964bd6e55fc28c7887',
    genesisTimestampSec: 1790248500,
    dynamicPlasmaActivated: true,
    dynamicPlasmaEnforcementHeight: 10,
    evidenceWssEndpoint: 'wss://rpc.testnet.zenon.info',
    observationHeight: 2,
    observationHash:
      '25b012e4771551a55ce64971fad3907d5950bcb6b4719340db87fbeb7f6e9e27',
    heightTwoVersion: 1,
    derivation: 'height-1 hash with height-2 previousHash linkage',
    genesisMomentumHashBasis:
      'independently recomputed from published genesis using the exact node-plan-pinned go-zenon source and an official checksum-verified temporary Go toolchain; matched a bounded TLS WSS height-1 read',
    genesisMomentumHashRecomputedFromPinnedSource: true,
    temporaryGoToolchainChecksumVerified: true,
    planStableAcrossBoundedReads: true,
    publicInputsStableBeforeEdit: true,
    advertisedWssEndpointMatched: true,
    heightTwoPreviousHashMatchedHeightOne: true,
    previousEpochProfileMismatch: true,
    postEnforcementFrontierObserved: true,
    frontierAtOrAboveEnforcementHeight: true,
    postEnforcementFrontierVersion: 2,
    nextFusionPricePositive: true,
    nextWorkPricePositive: true,
  });

export const HISTORICAL_PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_NON_CLAIMS =
  FREEZE({
    authoritativeCurrentNetworkRelease: false,
    signedTrustArtifact: false,
    authenticatedRpcChainIdentity: false,
    canonicalRemoteChainIdentity: false,
    consensusFinality: false,
    binaryAttestation: false,
    verifiedFrontierLineage: false,
    liveActivationAuthorized: false,
    productionReadiness: false,
  });

export const PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME =
  'public-testnet-dynamic-plasma-reset-epoch-2026-09-24t19-26-19-155z-v1';

export const PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID =
  '2026-09-24T19:26:19.155Z';

export const PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT =
  'wss://rpc.testnet.zenon.info';

export const PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_SDK_NETWORK_ID = '3';

export const PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT =
  'I_UNDERSTAND_THIS_DYNAMIC_PLASMA_RESET_TESTNET_EPOCH_IS_OPERATOR_TRUSTED_AND_NOT_CANONICAL_OR_FINAL';

export const PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ACKNOWLEDGEMENT =
  'I_UNDERSTAND_THIS_RESET_EPOCH_PROFILE_PINS_THE_EXACT_ADVERTISED_WSS_EVIDENCE_ENDPOINT_WITH_NO_FALLBACK';

export const PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WARNING =
  'Warning: this offline Dynamic Plasma reset-epoch profile is operator trusted; TLS does not authenticate canonical chain identity or finality.';

export const PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_CHAIN_PROFILE = FREEZE({
  version: 1,
  chainIdentifier: '73404',
  genesisMomentumHash: '6ea609aedc6d9547c0d9e29bc1ee2542ccb8bb5c8ab7c744180dcb2785f8ad91',
});

export const PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROVENANCE = FREEZE({
  nodePlanUrl: 'https://testnet.zenon.info/node-plan.json',
  genesisUrl: 'https://testnet.zenon.info/genesis.json',
  endpointAdvertisementUrl: 'https://testnet.zenon.info/llms.txt',
  nodePlanSchemaVersion: 1,
  nodePlanEventId: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
  nodePlanPublishedAt: '2026-09-24T19:26:19.155Z',
  nodePlanFinalizedAt: '2026-09-24T19:26:13.047Z',
  nodePlanGenesisStartAt: '2026-09-24T19:27:00.000Z',
  nodePlanApplyAt: '2026-09-24T19:25:51.000Z',
  nodePlanWipeData: true,
  nodePlanGoZenonRepository: 'https://github.com/zenon-network/go-zenon.git',
  nodePlanGoZenonRef: 'dev',
  nodePlanGoZenonCommit: '3a4131e63881058b6ce2ee81d3a41d0033fafc99',
  nodePlanDeploymentRepository: 'https://github.com/hypercore-one/deployment.git',
  nodePlanDeploymentRef: 'main',
  nodePlanDeploymentCommit: '0cf7877212412fe7a714ed964bd6e55fc28c7887',
  genesisTimestampSec: 1790278020,
  dynamicPlasmaActivated: true,
  dynamicPlasmaEnforcementHeight: 10,
  evidenceWssEndpoint: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
  observationHeight: 2,
  observationHash: '9508041a766014ac86978a5bb6dc3f07fa7fca8ddb74257437d72edd5f4c800e',
  heightTwoVersion: 1,
  derivation: 'height-1 hash with height-2 previousHash linkage',
  genesisMomentumHashBasis:
    'independently recomputed from published genesis using the exact node-plan-pinned go-zenon source and an official checksum-verified temporary Go toolchain; matched a bounded TLS WSS height-1 read',
  genesisMomentumChangesHash: '4d9b99bf1641ddf7c8c3890ad49ad2e0f031439dff8bb455c0a53680248a01dd',
  genesisMomentumHashRecomputedFromPinnedSource: true,
  genesisMomentumChangesHashMatchedObservedChain: true,
  fullHeightOneHashMatchedObservedChain: true,
  temporaryGoToolchainChecksumVerified: true,
  planStableAcrossBoundedReads: true,
  publicInputsStableBeforeEdit: true,
  advertisedWssEndpointMatched: true,
  heightTwoPreviousHashMatchedHeightOne: true,
  previousEpochProfileMismatch: true,
  postEnforcementFrontierObserved: true,
  frontierAtOrAboveEnforcementHeight: true,
  postEnforcementFrontierVersion: 2,
  nextFusionPricePositive: true,
  nextWorkPricePositive: true,
});

export const PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_NON_CLAIMS = FREEZE({
  authoritativeCurrentNetworkRelease: false,
  signedTrustArtifact: false,
  authenticatedRpcChainIdentity: false,
  canonicalRemoteChainIdentity: false,
  consensusFinality: false,
  binaryAttestation: false,
  verifiedFrontierLineage: false,
  liveActivationAuthorized: false,
  productionReadiness: false,
});

function fail(code) {
  throw new Error(code);
}

const PROFILE_KEYS = FREEZE(['chainIdentifier', 'genesisMomentumHash', 'version']);
const FRONTIER_PLAIN_KEYS = FREEZE(['chainIdentifier', 'hash', 'height']);
const MOMENTUM_PLAIN_KEYS = FREEZE([
  'chainIdentifier', 'hash', 'height', 'previousHash', 'version',
]);
const MOMENTUM_SDK_KEYS = FREEZE([
  'chainIdentifier', 'changesHash', 'content', 'data', 'hash', 'height',
  'previousHash', 'producer', 'publicKey', 'signature', 'timestamp', 'version',
]);
const MOMENTUM_LIST_KEYS = FREEZE(['count', 'list']);
const HASH_KEYS = FREEZE(['core']);
const SINGLE_ITEM_ARRAY_KEYS = FREEZE(['0', 'length']);
const DYNAMIC_PLASMA_EPOCH_SELECTION_KEYS = FREEZE([
  'eventId', 'liveAcknowledgement', 'operatorTrustAcknowledgement',
  'profileName', 'rpcEndpoint', 'wssAcknowledgement',
]);
const DYNAMIC_PLASMA_RESET_EPOCH_SELECTION_KEYS = FREEZE([
  'eventId', 'evidenceWssEndpoint', 'liveAcknowledgement',
  'operatorTrustAcknowledgement', 'profileName', 'wssAcknowledgement',
]);
const DYNAMIC_PLASMA_RESET_EPOCH_EXECUTION_SELECTION_KEYS = FREEZE([
  'eventId', 'liveAcknowledgement', 'operatorTrustAcknowledgement',
  'profileName', 'rpcEndpoint', 'wssAcknowledgement',
]);

function apply(fn, receiver, args) {
  return APPLY(fn, receiver, args);
}

function isProxy(value) {
  return apply(IS_PROXY, undefined, [value]);
}

function arrayIsArray(value) {
  return apply(ARRAY_IS_ARRAY, undefined, [value]);
}

function numberIsSafeInteger(value) {
  return apply(NUMBER_IS_SAFE_INTEGER, undefined, [value]);
}

function toNumber(value) {
  return apply(NUMBER_CONSTRUCTOR, undefined, [value]);
}

function regexTest(expression, value) {
  return apply(REGEXP_EXEC, expression, [value]) !== null;
}

function weakSetAdd(set, value) {
  apply(WEAK_SET_ADD, set, [value]);
}

function weakSetHas(set, value) {
  return apply(WEAK_SET_HAS, set, [value]);
}

function defineOwnData(target, key, value) {
  const descriptor = apply(CREATE_OBJECT, undefined, [null]);
  descriptor.value = value;
  descriptor.enumerable = true;
  descriptor.configurable = true;
  descriptor.writable = true;
  apply(DEFINE_PROPERTY, undefined, [target, key, descriptor]);
}

function shieldAsyncReturn(value) {
  const descriptor = apply(CREATE_OBJECT, undefined, [null]);
  descriptor.value = undefined;
  descriptor.enumerable = false;
  descriptor.configurable = false;
  descriptor.writable = false;
  apply(DEFINE_PROPERTY, undefined, [value, 'then', descriptor]);
  return value;
}

function shieldInternalPromise(value) {
  const descriptor = apply(CREATE_OBJECT, undefined, [null]);
  descriptor.value = PROMISE_THEN;
  descriptor.enumerable = false;
  descriptor.configurable = false;
  descriptor.writable = false;
  apply(DEFINE_PROPERTY, undefined, [value, 'then', descriptor]);
  return value;
}

function promiseSettlement(fulfilled, value) {
  const settlement = apply(CREATE_OBJECT, undefined, [null]);
  defineOwnData(settlement, 'fulfilled', fulfilled);
  defineOwnData(settlement, 'value', value);
  return apply(FREEZE, undefined, [settlement]);
}

function fulfilledPromiseSettlement(value) {
  return promiseSettlement(true, value);
}

function rejectedPromiseSettlement(value) {
  return promiseSettlement(false, value);
}

function assertNativePromise(value) {
  if (value === null || typeof value !== 'object' || isProxy(value) ||
      !apply(IS_PROMISE, undefined, [value])) {
    fail('operator_trusted_profile_evidence_invalid');
  }
  let prototype;
  let keys;
  let constructorDescriptor;
  let speciesDescriptor;
  try {
    prototype = apply(GET_PROTOTYPE_OF, undefined, [value]);
    keys = apply(REFLECT_OWN_KEYS, undefined, [value]);
    constructorDescriptor = apply(
      GET_OWN_PROPERTY_DESCRIPTOR,
      undefined,
      [PROMISE_PROTOTYPE, 'constructor'],
    );
    speciesDescriptor = apply(
      GET_OWN_PROPERTY_DESCRIPTOR,
      undefined,
      [PROMISE_CONSTRUCTOR, PROMISE_SPECIES],
    );
  } catch {
    fail('operator_trusted_profile_evidence_invalid');
  }
  for (let index = 0; index < keys.length; index += 1) {
    if (typeof keys[index] === 'string') {
      fail('operator_trusted_profile_evidence_invalid');
    }
  }
  if (prototype !== PROMISE_PROTOTYPE ||
      !constructorDescriptor ||
      !apply(HAS_OWN, undefined, [constructorDescriptor, 'value']) ||
      constructorDescriptor.value !== PROMISE_CONSTRUCTOR ||
      !speciesDescriptor ||
      apply(HAS_OWN, undefined, [speciesDescriptor, 'value']) ||
      speciesDescriptor.get !== PROMISE_SPECIES_GETTER ||
      speciesDescriptor.set !== undefined) {
    fail('operator_trusted_profile_evidence_invalid');
  }
}

function rawObservationIsNativePromise(value) {
  if (value !== null && (typeof value === 'object' || typeof value === 'function') &&
      isProxy(value)) fail('operator_trusted_profile_evidence_invalid');
  if (!apply(IS_PROMISE, undefined, [value])) return false;
  assertNativePromise(value);
  return true;
}

function settleNativePromise(value) {
  assertNativePromise(value);
  let bridge;
  try {
    bridge = apply(PROMISE_THEN, value, [
      fulfilledPromiseSettlement,
      rejectedPromiseSettlement,
    ]);
  } catch {
    fail('operator_trusted_profile_evidence_invalid');
  }
  assertNativePromise(bridge);
  return shieldInternalPromise(bridge);
}

function safeInteger(value, minimum = 0) {
  return numberIsSafeInteger(value) && !OBJECT_IS(value, -0) && value >= minimum;
}

function reflectedStringKeys(value) {
  let keys;
  try {
    keys = apply(REFLECT_OWN_KEYS, undefined, [value]);
  } catch {
    fail('operator_trusted_profile_evidence_invalid');
  }
  for (let index = 0; index < keys.length; index += 1) {
    if (typeof keys[index] !== 'string') fail('operator_trusted_profile_evidence_invalid');
  }
  apply(ARRAY_SORT, keys, []);
  return keys;
}

function sameKeys(left, right) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function ownDataDescriptor(value, key) {
  let descriptor;
  try {
    descriptor = apply(GET_OWN_PROPERTY_DESCRIPTOR, undefined, [value, key]);
  } catch {
    fail('operator_trusted_profile_evidence_invalid');
  }
  if (!descriptor || !apply(HAS_OWN, undefined, [descriptor, 'value'])) {
    fail('operator_trusted_profile_evidence_invalid');
  }
  return descriptor;
}

function cloneChainProfile(specification = HISTORICAL_SPECIFICATION) {
  return {
    version: specification.chainProfile.version,
    chainIdentifier: specification.chainProfile.chainIdentifier,
    genesisMomentumHash: specification.chainProfile.genesisMomentumHash,
  };
}

function readOwnDataProperty(value, key) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    fail('operator_trusted_profile_evidence_invalid');
  }
  if (isProxy(value)) fail('operator_trusted_profile_evidence_invalid');
  return ownDataDescriptor(value, key).value;
}

function snapshotKnownObject(value, alternatives) {
  if (value === null || typeof value !== 'object' || isProxy(value)) {
    fail('operator_trusted_profile_evidence_invalid');
  }
  const valueIsArray = arrayIsArray(value);
  let prototype;
  try {
    prototype = apply(GET_PROTOTYPE_OF, undefined, [value]);
  } catch {
    fail('operator_trusted_profile_evidence_invalid');
  }
  const keys = reflectedStringKeys(value);
  let selected = null;
  for (let index = 0; index < alternatives.length; index += 1) {
    const candidate = alternatives[index];
    const prototypeMatches =
      (candidate.prototype === 'plain' && prototype === OBJECT_PROTOTYPE) ||
      (candidate.prototype === 'sdk' && prototype !== null &&
        prototype !== OBJECT_PROTOTYPE && !valueIsArray) ||
      (candidate.prototype === 'array' && prototype === ARRAY_PROTOTYPE && valueIsArray);
    if (prototypeMatches && sameKeys(keys, candidate.keys)) {
      selected = alternatives[index];
      break;
    }
  }
  if (!selected) fail('operator_trusted_profile_evidence_invalid');
  const snapshot = apply(CREATE_OBJECT, undefined, [null]);
  for (let index = 0; index < keys.length; index += 1) {
    defineOwnData(snapshot, keys[index], ownDataDescriptor(value, keys[index]).value);
  }
  return snapshot;
}

function canonicalHash(value) {
  if (typeof value === 'string') {
    if (!regexTest(LOWERCASE_HASH, value)) fail('operator_trusted_profile_evidence_invalid');
    return value;
  }
  const snapshot = snapshotKnownObject(value, [{ keys: HASH_KEYS, prototype: 'sdk' }]);
  if (!apply(BUFFER_IS_BUFFER, undefined, [snapshot.core])) {
    fail('operator_trusted_profile_evidence_invalid');
  }
  const encoded = apply(BUFFER_TO_STRING, snapshot.core, ['hex']);
  if (typeof encoded !== 'string' || !regexTest(LOWERCASE_HASH, encoded)) {
    fail('operator_trusted_profile_evidence_invalid');
  }
  return encoded;
}

function snapshotPinnedProfile(value, specification = HISTORICAL_SPECIFICATION) {
  const snapshot = snapshotKnownObject(value, [{ keys: PROFILE_KEYS, prototype: 'plain' }]);
  if (snapshot.version !== specification.chainProfile.version ||
      snapshot.chainIdentifier !== specification.chainProfile.chainIdentifier ||
      snapshot.genesisMomentumHash !== specification.chainProfile.genesisMomentumHash) {
    fail('operator_trusted_profile_mismatch');
  }
  return snapshot;
}

function snapshotFrontier(value) {
  const snapshot = snapshotKnownObject(value, [
    { keys: FRONTIER_PLAIN_KEYS, prototype: 'plain' },
    { keys: MOMENTUM_SDK_KEYS, prototype: 'sdk' },
  ]);
  if (!safeInteger(snapshot.chainIdentifier, 1) || !safeInteger(snapshot.height, 2)) {
    fail('operator_trusted_profile_evidence_invalid');
  }
  return {
    chainIdentifier: snapshot.chainIdentifier,
    hash: canonicalHash(snapshot.hash),
    height: snapshot.height,
  };
}

function snapshotHeightTwo(value) {
  const snapshot = snapshotKnownObject(value, [
    { keys: MOMENTUM_PLAIN_KEYS, prototype: 'plain' },
    { keys: MOMENTUM_SDK_KEYS, prototype: 'sdk' },
  ]);
  if (!safeInteger(snapshot.version, 0) || !safeInteger(snapshot.chainIdentifier, 1) ||
      !safeInteger(snapshot.height, 0)) fail('operator_trusted_profile_evidence_invalid');
  return {
    version: snapshot.version,
    chainIdentifier: snapshot.chainIdentifier,
    hash: canonicalHash(snapshot.hash),
    previousHash: canonicalHash(snapshot.previousHash),
    height: snapshot.height,
  };
}

function snapshotMomentumList(value) {
  const snapshot = snapshotKnownObject(value, [
    { keys: MOMENTUM_LIST_KEYS, prototype: 'plain' },
    { keys: MOMENTUM_LIST_KEYS, prototype: 'sdk' },
  ]);
  if (!safeInteger(snapshot.count, 0) || snapshot.list === null ||
      typeof snapshot.list !== 'object' || isProxy(snapshot.list) ||
      !arrayIsArray(snapshot.list)) fail('operator_trusted_profile_evidence_invalid');
  const list = snapshotKnownObject(snapshot.list, [
    { keys: SINGLE_ITEM_ARRAY_KEYS, prototype: 'array' },
  ]);
  if (list.length !== 1) fail('operator_trusted_profile_evidence_invalid');
  return {
    count: snapshot.count,
    heightTwo: snapshotHeightTwo(list[0]),
  };
}

function readDataMethod(value, key) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function') ||
      isProxy(value)) fail('operator_trusted_profile_evidence_invalid');
  let descriptor;
  try {
    descriptor = apply(GET_OWN_PROPERTY_DESCRIPTOR, undefined, [value, key]);
  } catch {
    fail('operator_trusted_profile_evidence_invalid');
  }
  if (descriptor === undefined) {
    let prototype;
    try {
      prototype = apply(GET_PROTOTYPE_OF, undefined, [value]);
    } catch {
      fail('operator_trusted_profile_evidence_invalid');
    }
    if (prototype === null || isProxy(prototype)) fail('operator_trusted_profile_evidence_invalid');
    descriptor = ownDataDescriptor(prototype, key);
  } else if (!apply(HAS_OWN, undefined, [descriptor, 'value'])) {
    fail('operator_trusted_profile_evidence_invalid');
  }
  if (typeof descriptor.value !== 'function') fail('operator_trusted_profile_evidence_unavailable');
  if (isProxy(descriptor.value)) fail('operator_trusted_profile_evidence_invalid');
  return descriptor.value;
}

function sameProfile(left, right) {
  return left.version === right.version &&
    left.chainIdentifier === right.chainIdentifier &&
    left.genesisMomentumHash === right.genesisMomentumHash;
}

function sameFrontier(left, right) {
  return left.chainIdentifier === right.chainIdentifier &&
    left.height === right.height && left.hash === right.hash;
}

const HISTORICAL_SPECIFICATION = FREEZE({
  profileName: OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME,
  chainProfile: OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE,
  provenance: OPERATOR_TRUSTED_PUBLIC_TESTNET_PROVENANCE,
  observationHash: OPERATOR_TRUSTED_PUBLIC_TESTNET_PROVENANCE.observationHash,
  operatorTrustAcknowledgement: OPERATOR_TRUST_ACKNOWLEDGEMENT,
  trustMode: 'operator-trusted-historical-observation',
  warning: OPERATOR_TRUSTED_PUBLIC_TESTNET_WARNING,
});

const GATE_B_CURRENT_SPECIFICATION = FREEZE({
  profileName: GATE_B_CURRENT_TESTNET_PROFILE_NAME,
  chainProfile: GATE_B_CURRENT_TESTNET_CHAIN_PROFILE,
  provenance: GATE_B_CURRENT_TESTNET_PROVENANCE,
  observationHash: GATE_B_CURRENT_TESTNET_PROVENANCE.observationHash,
  operatorTrustAcknowledgement: GATE_B_CURRENT_TESTNET_OPERATOR_TRUST_ACKNOWLEDGEMENT,
  trustMode: 'operator-trusted-current-testnet-live-height-2',
  warning: GATE_B_CURRENT_TESTNET_WARNING,
});

const DYNAMIC_PLASMA_EPOCH_SPECIFICATION = FREEZE({
  profileName: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_PROFILE_NAME,
  chainProfile: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_CHAIN_PROFILE,
  provenance: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_PROVENANCE,
  observationHash: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_PROVENANCE.observationHash,
  operatorTrustAcknowledgement:
    PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
  trustMode: 'operator-trusted-public-testnet-dynamic-plasma-epoch',
  warning: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_WARNING,
});

const DYNAMIC_PLASMA_RESET_EPOCH_SPECIFICATION = FREEZE({
  profileName: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
  chainProfile: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_CHAIN_PROFILE,
  provenance: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROVENANCE,
  observationHash:
    PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROVENANCE.observationHash,
  operatorTrustAcknowledgement:
    PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
  trustMode: 'operator-trusted-public-testnet-dynamic-plasma-reset-epoch',
  warning: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WARNING,
});

const DYNAMIC_PLASMA_RESET_EPOCH_EXECUTION_SPECIFICATION = FREEZE({
  profileName: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
  chainProfile: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_CHAIN_PROFILE,
  provenance: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROVENANCE,
  observationHash:
    PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROVENANCE.observationHash,
  operatorTrustAcknowledgement:
    PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
  trustMode:
    'operator-trusted-public-testnet-dynamic-plasma-reset-epoch-execution',
  warning: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WARNING,
});

async function checkPinnedHeightTwo(specification, context) {
  let expectedChainProfile;
  let zenon;
  let frontierMomentum;
  try {
    expectedChainProfile = readOwnDataProperty(context, 'expectedChainProfile');
    zenon = readOwnDataProperty(context, 'zenon');
    frontierMomentum = readOwnDataProperty(context, 'frontierMomentum');
  } catch {
    fail('operator_trusted_profile_evidence_invalid');
  }
  const expectedBefore = snapshotPinnedProfile(expectedChainProfile, specification);
  const frontierBefore = snapshotFrontier(frontierMomentum);
  if (frontierBefore.chainIdentifier !==
      toNumber(specification.chainProfile.chainIdentifier)) {
    fail('operator_trusted_profile_evidence_mismatch');
  }

  let ledger;
  let getMomentumsByHeight;
  try {
    ledger = readOwnDataProperty(zenon, 'ledger');
    getMomentumsByHeight = readDataMethod(ledger, 'getMomentumsByHeight');
  } catch {
    fail('operator_trusted_profile_evidence_invalid');
  }

  let rawObservation;
  try {
    rawObservation = apply(getMomentumsByHeight, ledger, [2, 1]);
  } catch {
    fail('operator_trusted_profile_evidence_unavailable');
  }
  let observation = rawObservation;
  if (rawObservationIsNativePromise(rawObservation)) {
    const settlement = await settleNativePromise(rawObservation);
    if (settlement.fulfilled !== true) {
      fail('operator_trusted_profile_evidence_unavailable');
    }
    observation = settlement.value;
  }

  const expectedAfter = snapshotPinnedProfile(
    readOwnDataProperty(context, 'expectedChainProfile'),
    specification,
  );
  if (readOwnDataProperty(context, 'frontierMomentum') !== frontierMomentum ||
      !sameProfile(expectedBefore, expectedAfter)) fail('operator_trusted_profile_evidence_invalid');
  const frontierAfter = snapshotFrontier(frontierMomentum);
  if (!sameFrontier(frontierBefore, frontierAfter)) {
    fail('operator_trusted_profile_evidence_invalid');
  }
  const normalized = snapshotMomentumList(observation);
  if (normalized.count < frontierBefore.height || normalized.heightTwo.version !== 1 ||
      normalized.heightTwo.height !==
        specification.provenance.observationHeight ||
      normalized.heightTwo.chainIdentifier !==
        toNumber(specification.chainProfile.chainIdentifier) ||
      normalized.heightTwo.hash !== specification.observationHash ||
      normalized.heightTwo.previousHash !==
        specification.chainProfile.genesisMomentumHash) {
    fail('operator_trusted_profile_evidence_mismatch');
  }

  const evidence = FREEZE(shieldAsyncReturn({
    trustMode: specification.trustMode,
    remoteChainAuthenticated: false,
    chainProfile: FREEZE(cloneChainProfile(specification)),
    observationHeight: specification.provenance.observationHeight,
  }));
  weakSetAdd(OPERATOR_TRUST_EVIDENCE, evidence);
  return evidence;
}

const OPERATOR_TRUST_POLICIES = new WEAK_SET_CONSTRUCTOR();
const OPERATOR_TRUST_EVIDENCE = new WEAK_SET_CONSTRUCTOR();
const GATE_B_CURRENT_POLICIES = new WEAK_SET_CONSTRUCTOR();
const DYNAMIC_PLASMA_EPOCH_POLICIES = new WEAK_SET_CONSTRUCTOR();
const DYNAMIC_PLASMA_RESET_EPOCH_POLICIES = new WEAK_SET_CONSTRUCTOR();
const DYNAMIC_PLASMA_RESET_EPOCH_EXECUTION_POLICIES =
  new WEAK_SET_CONSTRUCTOR();
const POLICY_SPECIFICATIONS = new WEAK_MAP_CONSTRUCTOR();
const POLICY = FREEZE({
  profileName: OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME,
  trustMode: 'operator-trusted-historical-observation',
  remoteChainAuthenticated: false,
  warning: OPERATOR_TRUSTED_PUBLIC_TESTNET_WARNING,
  chainProfile: () => cloneChainProfile(HISTORICAL_SPECIFICATION),
  observeChainTrust: context => checkPinnedHeightTwo(HISTORICAL_SPECIFICATION, context),
});
const GATE_B_CURRENT_POLICY = FREEZE({
  profileName: GATE_B_CURRENT_TESTNET_PROFILE_NAME,
  trustMode: GATE_B_CURRENT_SPECIFICATION.trustMode,
  remoteChainAuthenticated: false,
  warning: GATE_B_CURRENT_TESTNET_WARNING,
  chainProfile: () => cloneChainProfile(GATE_B_CURRENT_SPECIFICATION),
  observeChainTrust: context => checkPinnedHeightTwo(GATE_B_CURRENT_SPECIFICATION, context),
});
const DYNAMIC_PLASMA_EPOCH_POLICY = FREEZE({
  profileName: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_PROFILE_NAME,
  epochEventId: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_EVENT_ID,
  rpcEndpoint: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_WSS_ENDPOINT,
  trustMode: DYNAMIC_PLASMA_EPOCH_SPECIFICATION.trustMode,
  remoteChainAuthenticated: false,
  warning: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_WARNING,
  chainProfile: () => FREEZE(cloneChainProfile(DYNAMIC_PLASMA_EPOCH_SPECIFICATION)),
  observeChainTrust:
    context => checkPinnedHeightTwo(DYNAMIC_PLASMA_EPOCH_SPECIFICATION, context),
});
const DYNAMIC_PLASMA_RESET_EPOCH_POLICY = FREEZE({
  profileName: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
  epochEventId: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
  evidenceWssEndpoint: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
  offlineOnly: true,
  trustMode: DYNAMIC_PLASMA_RESET_EPOCH_SPECIFICATION.trustMode,
  remoteChainAuthenticated: false,
  warning: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WARNING,
  chainProfile:
    () => FREEZE(cloneChainProfile(DYNAMIC_PLASMA_RESET_EPOCH_SPECIFICATION)),
});
const DYNAMIC_PLASMA_RESET_EPOCH_EXECUTION_POLICY = FREEZE({
  profileName: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
  epochEventId: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
  rpcEndpoint: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
  trustMode: DYNAMIC_PLASMA_RESET_EPOCH_EXECUTION_SPECIFICATION.trustMode,
  remoteChainAuthenticated: false,
  warning: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WARNING,
  chainProfile: () => FREEZE(cloneChainProfile(
    DYNAMIC_PLASMA_RESET_EPOCH_EXECUTION_SPECIFICATION,
  )),
  observeChainTrust: context => checkPinnedHeightTwo(
    DYNAMIC_PLASMA_RESET_EPOCH_EXECUTION_SPECIFICATION,
    context,
  ),
});
weakSetAdd(OPERATOR_TRUST_POLICIES, POLICY);
weakSetAdd(OPERATOR_TRUST_POLICIES, GATE_B_CURRENT_POLICY);
weakSetAdd(OPERATOR_TRUST_POLICIES, DYNAMIC_PLASMA_EPOCH_POLICY);
weakSetAdd(
  OPERATOR_TRUST_POLICIES,
  DYNAMIC_PLASMA_RESET_EPOCH_EXECUTION_POLICY,
);
weakSetAdd(GATE_B_CURRENT_POLICIES, GATE_B_CURRENT_POLICY);
weakSetAdd(DYNAMIC_PLASMA_EPOCH_POLICIES, DYNAMIC_PLASMA_EPOCH_POLICY);
weakSetAdd(
  DYNAMIC_PLASMA_RESET_EPOCH_POLICIES,
  DYNAMIC_PLASMA_RESET_EPOCH_POLICY,
);
weakSetAdd(
  DYNAMIC_PLASMA_RESET_EPOCH_EXECUTION_POLICIES,
  DYNAMIC_PLASMA_RESET_EPOCH_EXECUTION_POLICY,
);
apply(WEAK_MAP_SET, POLICY_SPECIFICATIONS, [POLICY, HISTORICAL_SPECIFICATION]);
apply(WEAK_MAP_SET, POLICY_SPECIFICATIONS, [GATE_B_CURRENT_POLICY, GATE_B_CURRENT_SPECIFICATION]);
apply(WEAK_MAP_SET, POLICY_SPECIFICATIONS, [
  DYNAMIC_PLASMA_EPOCH_POLICY,
  DYNAMIC_PLASMA_EPOCH_SPECIFICATION,
]);
apply(WEAK_MAP_SET, POLICY_SPECIFICATIONS, [
  DYNAMIC_PLASMA_RESET_EPOCH_EXECUTION_POLICY,
  DYNAMIC_PLASMA_RESET_EPOCH_EXECUTION_SPECIFICATION,
]);

export function isOperatorTrustedTestnetPolicy(value) {
  return (typeof value === 'object' || typeof value === 'function') && value !== null &&
    !isProxy(value) && weakSetHas(OPERATOR_TRUST_POLICIES, value);
}

export function isOperatorTrustedTestnetEvidence(value) {
  return (typeof value === 'object' || typeof value === 'function') && value !== null &&
    !isProxy(value) && weakSetHas(OPERATOR_TRUST_EVIDENCE, value);
}

export function isGateBCurrentTestnetPolicy(value) {
  return (typeof value === 'object' || typeof value === 'function') && value !== null &&
    !isProxy(value) && weakSetHas(GATE_B_CURRENT_POLICIES, value);
}

export function isPublicTestnetDynamicPlasmaEpochPolicy(value) {
  return (typeof value === 'object' || typeof value === 'function') && value !== null &&
    !isProxy(value) && weakSetHas(DYNAMIC_PLASMA_EPOCH_POLICIES, value);
}

export function isPublicTestnetDynamicPlasmaResetEpochPolicy(value) {
  return (typeof value === 'object' || typeof value === 'function') && value !== null &&
    !isProxy(value) && weakSetHas(DYNAMIC_PLASMA_RESET_EPOCH_POLICIES, value);
}

export function isPublicTestnetDynamicPlasmaResetEpochExecutionPolicy(value) {
  return (typeof value === 'object' || typeof value === 'function') && value !== null &&
    !isProxy(value) &&
    weakSetHas(DYNAMIC_PLASMA_RESET_EPOCH_EXECUTION_POLICIES, value);
}

export async function observeOperatorTrustedTestnetPolicy(policy, context) {
  if (!isOperatorTrustedTestnetPolicy(policy)) {
    fail('operator_trusted_chain_policy_invalid');
  }
  const specification = apply(WEAK_MAP_GET, POLICY_SPECIFICATIONS, [policy]);
  if (!specification) fail('operator_trusted_chain_policy_invalid');
  const evidence = await checkPinnedHeightTwo(specification, context);
  return evidence;
}

export function selectOperatorTrustedTestnetPolicy(
  profileName,
  operatorTrustAcknowledgement,
  liveAcknowledgement,
) {
  if (typeof profileName !== 'string' ||
      profileName !== OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME) {
    fail('operator_trusted_testnet_profile_selection_invalid');
  }
  if (typeof operatorTrustAcknowledgement !== 'string' ||
      operatorTrustAcknowledgement !== OPERATOR_TRUST_ACKNOWLEDGEMENT) {
    fail('operator_trusted_testnet_acknowledgement_invalid');
  }
  if (typeof liveAcknowledgement !== 'string' ||
      liveAcknowledgement !== TESTNET_LIVE_ACKNOWLEDGEMENT) {
    fail('testnet_live_acknowledgement_invalid');
  }
  return POLICY;
}


export function selectGateBCurrentTestnetPolicy(
  profileName,
  operatorTrustAcknowledgement,
  liveAcknowledgement,
) {
  if (typeof profileName !== 'string' ||
      profileName !== GATE_B_CURRENT_TESTNET_PROFILE_NAME) {
    fail('gate_b_current_testnet_profile_selection_invalid');
  }
  if (typeof operatorTrustAcknowledgement !== 'string' ||
      operatorTrustAcknowledgement !==
        GATE_B_CURRENT_TESTNET_OPERATOR_TRUST_ACKNOWLEDGEMENT) {
    fail('gate_b_current_testnet_acknowledgement_invalid');
  }
  if (typeof liveAcknowledgement !== 'string' ||
      liveAcknowledgement !== TESTNET_LIVE_ACKNOWLEDGEMENT) {
    fail('testnet_live_acknowledgement_invalid');
  }
  return GATE_B_CURRENT_POLICY;
}

export function selectPublicTestnetDynamicPlasmaEpochPolicy(selection) {
  let snapshot;
  try {
    snapshot = snapshotKnownObject(selection, [{
      keys: DYNAMIC_PLASMA_EPOCH_SELECTION_KEYS,
      prototype: 'plain',
    }]);
  } catch {
    fail('public_testnet_dynamic_plasma_epoch_selection_invalid');
  }
  if (snapshot.profileName !== PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_PROFILE_NAME ||
      snapshot.eventId !== PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_EVENT_ID ||
      snapshot.rpcEndpoint !== PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_WSS_ENDPOINT ||
      snapshot.operatorTrustAcknowledgement !==
        PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT ||
      snapshot.liveAcknowledgement !== TESTNET_LIVE_ACKNOWLEDGEMENT ||
      snapshot.wssAcknowledgement !==
        PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_WSS_ACKNOWLEDGEMENT) {
    fail('public_testnet_dynamic_plasma_epoch_selection_invalid');
  }
  return DYNAMIC_PLASMA_EPOCH_POLICY;
}

export function selectPublicTestnetDynamicPlasmaResetEpochPolicy(selection) {
  let snapshot;
  try {
    snapshot = snapshotKnownObject(selection, [{
      keys: DYNAMIC_PLASMA_RESET_EPOCH_SELECTION_KEYS,
      prototype: 'plain',
    }]);
  } catch {
    fail('public_testnet_dynamic_plasma_reset_epoch_selection_invalid');
  }
  if (snapshot.profileName !==
        PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME ||
      snapshot.eventId !== PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID ||
      snapshot.evidenceWssEndpoint !==
        PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT ||
      snapshot.operatorTrustAcknowledgement !==
        PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT ||
      snapshot.liveAcknowledgement !== TESTNET_LIVE_ACKNOWLEDGEMENT ||
      snapshot.wssAcknowledgement !==
        PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ACKNOWLEDGEMENT) {
    fail('public_testnet_dynamic_plasma_reset_epoch_selection_invalid');
  }
  return DYNAMIC_PLASMA_RESET_EPOCH_POLICY;
}

export function selectPublicTestnetDynamicPlasmaResetEpochExecutionPolicy(
  selection,
) {
  let snapshot;
  try {
    snapshot = snapshotKnownObject(selection, [{
      keys: DYNAMIC_PLASMA_RESET_EPOCH_EXECUTION_SELECTION_KEYS,
      prototype: 'plain',
    }]);
  } catch {
    fail('public_testnet_dynamic_plasma_reset_epoch_execution_selection_invalid');
  }
  if (snapshot.profileName !==
        PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME ||
      snapshot.eventId !== PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID ||
      snapshot.rpcEndpoint !==
        PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT ||
      snapshot.operatorTrustAcknowledgement !==
        PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT ||
      snapshot.liveAcknowledgement !== TESTNET_LIVE_ACKNOWLEDGEMENT ||
      snapshot.wssAcknowledgement !==
        PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ACKNOWLEDGEMENT) {
    fail('public_testnet_dynamic_plasma_reset_epoch_execution_selection_invalid');
  }
  return DYNAMIC_PLASMA_RESET_EPOCH_EXECUTION_POLICY;
}
