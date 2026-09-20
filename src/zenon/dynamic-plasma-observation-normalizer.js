import { TextEncoder, types as utilTypes } from 'node:util';
import { classifyDynamicPlasmaCompatibility } from './dynamic-plasma-compatibility.js';

const SCHEMA_VERSION = 1;
const ENDPOINT_COUNT = 2;
const SCOPE = 'DETACHED_DUAL_ENDPOINT_OBSERVATION';
const DYNAMIC_PLASMA_NAME = 'dynamic-plasma';
const LIBP2P_NAME = 'libp2p';
const MINIMUM_MAX_BASE_PLASMA = 210000;
const MAXIMUM_MAX_BASE_PLASMA = 210000000000000;
const MINIMUM_TARGET = 1;
const MINIMUM_RATIO_COMPONENT = 1;
const MAXIMUM_RATIO_COMPONENT = 100;
const MINIMUM_SPORK_NAME_BYTES = 5;
const MAXIMUM_SPORK_NAME_BYTES = 40;
const MAXIMUM_SPORK_SNAPSHOT_ENTRIES = 1024;
const MAXIMUM_RPC_SPORK_COUNT = 4294967295;
const MAXIMUM_CHAIN_IDENTIFIER_DIGITS = 20;
const MAXIMUM_UINT64 = 18446744073709551615n;
const COMPATIBILITY_INPUT_ERROR_MESSAGE = 'Dynamic Plasma compatibility input rejected';
const COMPATIBILITY_INPUT_ERROR_CODE = 'dynamic_plasma_compatibility_input_rejected';
const OBSERVATION_INPUT_ERROR_MESSAGE = 'Dynamic Plasma observation input rejected';
const OBSERVATION_INPUT_ERROR_CODE = 'dynamic_plasma_observation_input_rejected';
const HASH = /^[0-9a-f]{64}$/;
const CANONICAL_POSITIVE_DECIMAL = /^[1-9][0-9]*$/;

const TOP_LEVEL_FIELDS = Object.freeze([
  'expectedChainProfile',
  'compiledSporkIds',
  'endpointObservations',
]);
const EXPECTED_PROFILE_FIELDS = Object.freeze([
  'version',
  'chainIdentifier',
  'genesisMomentumHash',
]);
const COMPILED_SPORK_FIELDS = Object.freeze([
  'dynamicPlasmaId',
  'libp2pId',
]);
const ENDPOINT_FIELDS = Object.freeze([
  'beforeFrontier',
  'profileEvidence',
  'sporks',
  'plasmaVariables',
  'rpcObservation',
  'afterFrontier',
]);
const FRONTIER_FIELDS = Object.freeze([
  'chainIdentifier',
  'height',
  'hash',
  'version',
  'nextFusionPrice',
  'nextWorkPrice',
]);
const PROFILE_EVIDENCE_FIELDS = Object.freeze(['heightTwo']);
const HEIGHT_TWO_FIELDS = Object.freeze([
  'chainIdentifier',
  'height',
  'hash',
  'previousHash',
  'version',
]);
const SPORKS_FIELDS = Object.freeze(['count', 'list']);
const SPORK_FIELDS = Object.freeze([
  'id',
  'name',
  'activated',
  'enforcementHeight',
]);
const PLASMA_VARIABLE_FIELDS = Object.freeze([
  'MaxBasePlasmaInMomentum',
  'FusedPlasmaTarget',
  'PowPlasmaTarget',
  'MaxPriceChangePercent',
  'PriceChangeDenominator',
]);
const RPC_OBSERVATION_FIELDS = Object.freeze([
  'availablePlasma',
  'basePlasma',
  'requiredDifficulty',
]);

const ownKeys = Reflect.ownKeys;
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const getPrototypeOf = Object.getPrototypeOf;
const hasOwn = Object.hasOwn;
const defineProperty = Object.defineProperty;
const freeze = Object.freeze;
const sameValue = Object.is;
const isProxy = utilTypes.isProxy;
const isSafeInteger = Number.isSafeInteger;
const toBigInt = BigInt;
const testRegExp = Function.call.bind(RegExp.prototype.test);
const TypeErrorConstructor = TypeError;
const typeErrorPrototype = TypeErrorConstructor.prototype;
const utf8Encoder = new TextEncoder();

export const DYNAMIC_PLASMA_OBSERVATION_CONTRACT = freeze({
  schemaVersion: SCHEMA_VERSION,
  endpointCount: ENDPOINT_COUNT,
  scope: SCOPE,
  canonicalNames: freeze({
    dynamicPlasma: DYNAMIC_PLASMA_NAME,
    libp2p: LIBP2P_NAME,
  }),
  consensusBounds: freeze({
    minimumMaxBasePlasmaInMomentum: MINIMUM_MAX_BASE_PLASMA,
    maximumMaxBasePlasmaInMomentum: MAXIMUM_MAX_BASE_PLASMA,
    minimumTarget: MINIMUM_TARGET,
    minimumRatioComponent: MINIMUM_RATIO_COMPONENT,
    maximumRatioComponent: MAXIMUM_RATIO_COMPONENT,
  }),
  observationBounds: freeze({
    minimumSporkNameBytes: MINIMUM_SPORK_NAME_BYTES,
    maximumSporkNameBytes: MAXIMUM_SPORK_NAME_BYTES,
    maximumSporkSnapshotEntries: MAXIMUM_SPORK_SNAPSHOT_ENTRIES,
    maximumRpcSporkCount: MAXIMUM_RPC_SPORK_COUNT,
    maximumChainIdentifierDigits: MAXIMUM_CHAIN_IDENTIFIER_DIGITS,
  }),
});

export function normalizeDynamicPlasmaObservation(input) {
  const top = exactDataObject(input, TOP_LEVEL_FIELDS);
  const expectedProfile = snapshotExpectedProfile(top.expectedChainProfile);
  const compiledSporks = snapshotCompiledSporks(top.compiledSporkIds);
  const endpoints = snapshotEndpointArray(top.endpointObservations);

  if (endpoints[0] === null || endpoints[1] === null) {
    return evidenceFailure('UNAVAILABLE', 'ENDPOINT_DATA_UNAVAILABLE');
  }

  for (const endpoint of endpoints) {
    if (!equalFrontier(endpoint.beforeFrontier, endpoint.afterFrontier)) {
      return evidenceFailure('MISBOUND_OR_INCOHERENT', 'FRONTIER_BINDING_MISMATCH');
    }
    if (endpoint.sporks.list === null ||
        endpoint.sporks.count !== endpoint.sporks.list.length) {
      return evidenceFailure('UNAVAILABLE', 'SPORK_SNAPSHOT_INCOMPLETE');
    }
  }

  if (!equalEndpoint(endpoints[0], endpoints[1])) {
    return evidenceFailure('MISBOUND_OR_INCOHERENT', 'ENDPOINT_OBSERVATION_MISMATCH');
  }

  const observation = endpoints[0];
  if (!profileMatches(expectedProfile, observation)) {
    return evidenceFailure('MISBOUND_OR_INCOHERENT', 'PROFILE_GENESIS_MISMATCH');
  }

  const dynamicSpork = boundDynamicSpork(observation.sporks.list, compiledSporks);
  if (dynamicSpork === null) {
    return evidenceFailure('MISBOUND_OR_INCOHERENT', 'SPORK_BINDING_MISMATCH');
  }

  if (!coherentPlasmaVariables(observation.plasmaVariables)) {
    return evidenceFailure('MISBOUND_OR_INCOHERENT', 'PLASMA_VARIABLES_INCOHERENT');
  }

  if (!coherentFrontierState(observation.beforeFrontier, dynamicSpork)) {
    return evidenceFailure('MISBOUND_OR_INCOHERENT', 'FRONTIER_SPORK_STATE_INCOHERENT');
  }

  let compatibility;
  try {
    compatibility = classifyDynamicPlasmaCompatibility({
      chainProfileMatch: { classification: 'MATCH' },
      beforeFrontier: compatibilityFrontier(observation.beforeFrontier),
      rpcObservation: observation.rpcObservation,
      afterFrontier: compatibilityFrontier(observation.afterFrontier),
    });
  } catch (error) {
    if (knownCompatibilityInputError(error)) reject();
    throw error;
  }
  const normalizedObservation = freeze({
    expectedChainProfile: expectedProfile,
    compiledSporkIds: compiledSporks,
    beforeFrontier: observation.beforeFrontier,
    profileEvidence: observation.profileEvidence,
    sporks: observation.sporks,
    plasmaVariables: observation.plasmaVariables,
    rpcObservation: observation.rpcObservation,
    afterFrontier: observation.afterFrontier,
  });

  return freeze({
    schemaVersion: SCHEMA_VERSION,
    classification: compatibility.classification,
    reason: compatibility.reason,
    scope: SCOPE,
    chainAuthentication: 'NOT_ESTABLISHED',
    canonicality: 'NOT_ESTABLISHED',
    finality: 'NOT_ESTABLISHED',
    afterSigningAction: 'NONE',
    observation: normalizedObservation,
    compatibility,
  });
}

function snapshotExpectedProfile(value) {
  const fields = exactDataObject(value, EXPECTED_PROFILE_FIELDS);
  if (fields.version !== SCHEMA_VERSION ||
      !isUint64Decimal(fields.chainIdentifier) ||
      typeof fields.genesisMomentumHash !== 'string' ||
      !testRegExp(HASH, fields.genesisMomentumHash)) reject();
  return freeze({
    version: fields.version,
    chainIdentifier: fields.chainIdentifier,
    genesisMomentumHash: fields.genesisMomentumHash,
  });
}

function snapshotCompiledSporks(value) {
  const fields = exactDataObject(value, COMPILED_SPORK_FIELDS);
  hash(fields.dynamicPlasmaId);
  hash(fields.libp2pId);
  if (fields.dynamicPlasmaId === fields.libp2pId) reject();
  return freeze({
    dynamicPlasmaId: fields.dynamicPlasmaId,
    libp2pId: fields.libp2pId,
  });
}

function snapshotEndpointArray(value) {
  const values = exactPlainArray(value, ENDPOINT_COUNT);
  return freeze(values.map(endpoint => endpoint === null ? null : snapshotEndpoint(endpoint)));
}

function snapshotEndpoint(value) {
  const fields = exactDataObject(value, ENDPOINT_FIELDS);
  return freeze({
    beforeFrontier: snapshotFrontier(fields.beforeFrontier),
    profileEvidence: snapshotProfileEvidence(fields.profileEvidence),
    sporks: snapshotSporks(fields.sporks),
    plasmaVariables: snapshotPlasmaVariables(fields.plasmaVariables),
    rpcObservation: snapshotRpcObservation(fields.rpcObservation),
    afterFrontier: snapshotFrontier(fields.afterFrontier),
  });
}

function snapshotFrontier(value) {
  const fields = exactDataObject(value, FRONTIER_FIELDS);
  if (!isUint64Decimal(fields.chainIdentifier)) reject();
  positiveSafeInteger(fields.height);
  hash(fields.hash);
  nonnegativeSafeInteger(fields.version);
  nonnegativeSafeInteger(fields.nextFusionPrice);
  nonnegativeSafeInteger(fields.nextWorkPrice);
  return freeze({
    chainIdentifier: fields.chainIdentifier,
    height: fields.height,
    hash: fields.hash,
    version: fields.version,
    nextFusionPrice: fields.nextFusionPrice,
    nextWorkPrice: fields.nextWorkPrice,
  });
}

function snapshotProfileEvidence(value) {
  const fields = exactDataObject(value, PROFILE_EVIDENCE_FIELDS);
  const heightTwo = exactDataObject(fields.heightTwo, HEIGHT_TWO_FIELDS);
  if (!isUint64Decimal(heightTwo.chainIdentifier)) reject();
  if (heightTwo.height !== 2 || heightTwo.version !== 1) reject();
  hash(heightTwo.hash);
  hash(heightTwo.previousHash);
  return freeze({
    heightTwo: freeze({
      chainIdentifier: heightTwo.chainIdentifier,
      height: heightTwo.height,
      hash: heightTwo.hash,
      previousHash: heightTwo.previousHash,
      version: heightTwo.version,
    }),
  });
}

function snapshotSporks(value) {
  const fields = exactDataObject(value, SPORKS_FIELDS);
  nonnegativeSafeInteger(fields.count);
  if (fields.count > MAXIMUM_RPC_SPORK_COUNT) reject();
  const listLength = plainArrayLength(fields.list);
  if (fields.count > MAXIMUM_SPORK_SNAPSHOT_ENTRIES ||
      listLength > MAXIMUM_SPORK_SNAPSHOT_ENTRIES) {
    return freeze({ count: fields.count, list: null });
  }
  const list = exactPlainArray(fields.list, null, listLength).map(snapshotSpork);
  list.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  return freeze({ count: fields.count, list: freeze(list) });
}

function snapshotSpork(value) {
  const fields = exactDataObject(value, SPORK_FIELDS);
  hash(fields.id);
  if (typeof fields.name !== 'string' || typeof fields.activated !== 'boolean') reject();
  if (fields.name.length < 2 || fields.name.length > MAXIMUM_SPORK_NAME_BYTES) reject();
  const nameBytes = utf8Encoder.encode(fields.name).length;
  if (nameBytes < MINIMUM_SPORK_NAME_BYTES || nameBytes > MAXIMUM_SPORK_NAME_BYTES) reject();
  nonnegativeSafeInteger(fields.enforcementHeight);
  return freeze({
    id: fields.id,
    name: fields.name,
    activated: fields.activated,
    enforcementHeight: fields.enforcementHeight,
  });
}

function snapshotPlasmaVariables(value) {
  const fields = exactDataObject(value, PLASMA_VARIABLE_FIELDS);
  for (const field of PLASMA_VARIABLE_FIELDS) safeInteger(fields[field]);
  return freeze({
    MaxBasePlasmaInMomentum: fields.MaxBasePlasmaInMomentum,
    FusedPlasmaTarget: fields.FusedPlasmaTarget,
    PowPlasmaTarget: fields.PowPlasmaTarget,
    MaxPriceChangePercent: fields.MaxPriceChangePercent,
    PriceChangeDenominator: fields.PriceChangeDenominator,
  });
}

function snapshotRpcObservation(value) {
  const fields = exactDataObject(value, RPC_OBSERVATION_FIELDS);
  nonnegativeSafeInteger(fields.availablePlasma);
  positiveSafeInteger(fields.basePlasma);
  nonnegativeSafeInteger(fields.requiredDifficulty);
  return freeze({
    availablePlasma: fields.availablePlasma,
    basePlasma: fields.basePlasma,
    requiredDifficulty: fields.requiredDifficulty,
  });
}

function exactDataObject(value, expectedFields) {
  if (typeof value !== 'object' || value === null || isProxy(value) ||
      getPrototypeOf(value) !== Object.prototype) reject();
  const keys = ownKeys(value);
  if (keys.length !== expectedFields.length) reject();
  const result = {};
  for (const field of expectedFields) {
    const descriptor = getOwnPropertyDescriptor(value, field);
    if (descriptor === undefined || descriptor.enumerable !== true ||
        !hasOwn(descriptor, 'value')) reject();
    result[field] = descriptor.value;
  }
  return result;
}

function plainArrayLength(value, exactLength = null) {
  if (typeof value !== 'object' || value === null || isProxy(value) ||
      getPrototypeOf(value) !== Array.prototype) reject();
  const lengthDescriptor = getOwnPropertyDescriptor(value, 'length');
  if (lengthDescriptor === undefined || lengthDescriptor.enumerable !== false ||
      !hasOwn(lengthDescriptor, 'value')) reject();
  const length = lengthDescriptor.value;
  if (!isSafeInteger(length) || length < 0 ||
      (exactLength !== null && length !== exactLength)) reject();
  return length;
}

function exactPlainArray(value, exactLength = null, knownLength = null) {
  const length = knownLength === null ? plainArrayLength(value, exactLength) : knownLength;
  const keys = ownKeys(value);
  if (keys.length !== length + 1) reject();
  const result = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || descriptor.enumerable !== true ||
        !hasOwn(descriptor, 'value')) reject();
    result.push(descriptor.value);
  }
  return result;
}

function profileMatches(expected, observation) {
  return observation.beforeFrontier.chainIdentifier === expected.chainIdentifier &&
    observation.profileEvidence.heightTwo.chainIdentifier === expected.chainIdentifier &&
    observation.profileEvidence.heightTwo.previousHash === expected.genesisMomentumHash;
}

function boundDynamicSpork(list, compiled) {
  const ids = new Set();
  let dynamicById = null;
  let libp2pById = null;
  let dynamicNameCount = 0;
  let libp2pNameCount = 0;
  for (const entry of list) {
    if (ids.has(entry.id)) return null;
    ids.add(entry.id);
    if (entry.id === compiled.dynamicPlasmaId) dynamicById = entry;
    if (entry.id === compiled.libp2pId) libp2pById = entry;
    if (entry.name === DYNAMIC_PLASMA_NAME) dynamicNameCount += 1;
    if (entry.name === LIBP2P_NAME) libp2pNameCount += 1;
  }
  if (dynamicById === null || libp2pById === null ||
      dynamicById.name !== DYNAMIC_PLASMA_NAME || libp2pById.name !== LIBP2P_NAME ||
      dynamicNameCount !== 1 || libp2pNameCount !== 1) return null;
  return dynamicById;
}

function coherentPlasmaVariables(value) {
  if (value.MaxBasePlasmaInMomentum < MINIMUM_MAX_BASE_PLASMA ||
      value.MaxBasePlasmaInMomentum > MAXIMUM_MAX_BASE_PLASMA ||
      value.FusedPlasmaTarget < MINIMUM_TARGET || value.PowPlasmaTarget < MINIMUM_TARGET ||
      value.MaxPriceChangePercent < MINIMUM_RATIO_COMPONENT ||
      value.MaxPriceChangePercent > MAXIMUM_RATIO_COMPONENT ||
      value.PriceChangeDenominator < MINIMUM_RATIO_COMPONENT ||
      value.PriceChangeDenominator > MAXIMUM_RATIO_COMPONENT) return false;
  return toBigInt(value.FusedPlasmaTarget) + toBigInt(value.PowPlasmaTarget) <=
    toBigInt(value.MaxBasePlasmaInMomentum);
}

function coherentFrontierState(frontier, dynamicSpork) {
  const activeAfterBoundary = dynamicSpork.activated &&
    frontier.height >= 3 && frontier.height > dynamicSpork.enforcementHeight;
  if (activeAfterBoundary) return frontier.version === 2;
  return frontier.version === 1 && frontier.nextFusionPrice === 0 &&
    frontier.nextWorkPrice === 0;
}

function compatibilityFrontier(frontier) {
  return {
    height: frontier.height,
    hash: frontier.hash,
    version: frontier.version,
    nextFusionPrice: frontier.nextFusionPrice,
    nextWorkPrice: frontier.nextWorkPrice,
  };
}

function equalEndpoint(left, right) {
  return equalFrontier(left.beforeFrontier, right.beforeFrontier) &&
    equalProfileEvidence(left.profileEvidence, right.profileEvidence) &&
    equalSporks(left.sporks, right.sporks) &&
    equalPlasmaVariables(left.plasmaVariables, right.plasmaVariables) &&
    equalRpcObservation(left.rpcObservation, right.rpcObservation) &&
    equalFrontier(left.afterFrontier, right.afterFrontier);
}

function equalFrontier(left, right) {
  return left.chainIdentifier === right.chainIdentifier && left.height === right.height &&
    left.hash === right.hash && left.version === right.version &&
    left.nextFusionPrice === right.nextFusionPrice &&
    left.nextWorkPrice === right.nextWorkPrice;
}

function equalProfileEvidence(left, right) {
  const a = left.heightTwo;
  const b = right.heightTwo;
  return a.chainIdentifier === b.chainIdentifier && a.height === b.height &&
    a.hash === b.hash && a.previousHash === b.previousHash && a.version === b.version;
}

function equalSporks(left, right) {
  if (left.count !== right.count || left.list.length !== right.list.length) return false;
  for (let index = 0; index < left.list.length; index += 1) {
    const a = left.list[index];
    const b = right.list[index];
    if (a.id !== b.id || a.name !== b.name || a.activated !== b.activated ||
        a.enforcementHeight !== b.enforcementHeight) return false;
  }
  return true;
}

function equalPlasmaVariables(left, right) {
  return left.MaxBasePlasmaInMomentum === right.MaxBasePlasmaInMomentum &&
    left.FusedPlasmaTarget === right.FusedPlasmaTarget &&
    left.PowPlasmaTarget === right.PowPlasmaTarget &&
    left.MaxPriceChangePercent === right.MaxPriceChangePercent &&
    left.PriceChangeDenominator === right.PriceChangeDenominator;
}

function equalRpcObservation(left, right) {
  return left.availablePlasma === right.availablePlasma &&
    left.basePlasma === right.basePlasma &&
    left.requiredDifficulty === right.requiredDifficulty;
}

function evidenceFailure(classification, reason) {
  return freeze({
    schemaVersion: SCHEMA_VERSION,
    classification,
    reason,
    scope: SCOPE,
    chainAuthentication: 'NOT_ESTABLISHED',
    canonicality: 'NOT_ESTABLISHED',
    finality: 'NOT_ESTABLISHED',
    afterSigningAction: 'NONE',
    observation: null,
    compatibility: null,
  });
}

function knownCompatibilityInputError(error) {
  if (typeof error !== 'object' || error === null || isProxy(error)) return false;
  if (getPrototypeOf(error) !== typeErrorPrototype) return false;
  const messageDescriptor = getOwnPropertyDescriptor(error, 'message');
  const codeDescriptor = getOwnPropertyDescriptor(error, 'code');
  return messageDescriptor !== undefined && hasOwn(messageDescriptor, 'value') &&
    messageDescriptor.value === COMPATIBILITY_INPUT_ERROR_MESSAGE &&
    messageDescriptor.writable === true && messageDescriptor.enumerable === false &&
    messageDescriptor.configurable === true &&
    codeDescriptor !== undefined && hasOwn(codeDescriptor, 'value') &&
    codeDescriptor.value === COMPATIBILITY_INPUT_ERROR_CODE &&
    codeDescriptor.writable === false && codeDescriptor.enumerable === true &&
    codeDescriptor.configurable === false;
}

function isUint64Decimal(value) {
  if (typeof value !== 'string' || value.length === 0 ||
      value.length > MAXIMUM_CHAIN_IDENTIFIER_DIGITS ||
      !testRegExp(CANONICAL_POSITIVE_DECIMAL, value)) return false;
  return toBigInt(value) <= MAXIMUM_UINT64;
}

function hash(value) {
  if (typeof value !== 'string' || !testRegExp(HASH, value)) reject();
}

function safeInteger(value) {
  if (!isSafeInteger(value) || sameValue(value, -0)) reject();
}

function nonnegativeSafeInteger(value) {
  safeInteger(value);
  if (value < 0) reject();
}

function positiveSafeInteger(value) {
  nonnegativeSafeInteger(value);
  if (value === 0) reject();
}

function reject() {
  const error = new TypeErrorConstructor(OBSERVATION_INPUT_ERROR_MESSAGE);
  defineProperty(error, 'code', {
    value: OBSERVATION_INPUT_ERROR_CODE,
    enumerable: true,
  });
  throw error;
}
