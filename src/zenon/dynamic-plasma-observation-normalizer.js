import { TextEncoder, types as utilTypes } from 'node:util';
import { createHash } from 'node:crypto';
import { classifyDynamicPlasmaCompatibility } from './dynamic-plasma-compatibility.js';
import { validateDynamicPlasmaRequiredFusedQuote } from './dynamic-plasma-required-fused-quote.js';
import { snapshotDynamicPlasmaQuoteRequest } from './dynamic-plasma-json-rpc-read-transport.js';

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
const FOUR_FIELD_TOP_LEVEL_FIELDS = Object.freeze([
  ...TOP_LEVEL_FIELDS, 'requiredFusedObservationVersion',
]);
const REQUEST_BOUND_TOP_LEVEL_FIELDS = Object.freeze([
  ...FOUR_FIELD_TOP_LEVEL_FIELDS, 'quoteRequestContextVersion', 'quoteRequestContext',
]);
const REQUEST_CONTEXT_INPUT_FIELDS = Object.freeze([
  'requestContextVersion', 'expectedChainProfile', 'compiledSporkIds', 'quoteRequest',
]);
const REQUEST_CONTEXT_FIELDS = Object.freeze(['requestContextVersion', 'quoteRequest', 'digest']);
const REQUEST_CONTEXT_DOMAIN = 'zenon-x402-dp-quote-request-context/v1';
const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/;
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
const FOUR_FIELD_RPC_OBSERVATION_FIELDS = Object.freeze([
  ...RPC_OBSERVATION_FIELDS, 'requiredFusedPlasma',
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
const hashRequest = createHash;
const stringify = JSON.stringify;

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

export const DYNAMIC_PLASMA_REQUIRED_FUSED_OBSERVATION_CONTRACT = freeze({
  ...DYNAMIC_PLASMA_OBSERVATION_CONTRACT,
  schemaVersion: 2,
  requiredFusedObservationVersion: 1,
  requiredRpcFields: FOUR_FIELD_RPC_OBSERVATION_FIELDS,
  preDpValidation: 'TOTAL_EQUALS_BASE_ONLY_NOT_LEGACY_POW_VALIDATION',
});

export const DYNAMIC_PLASMA_REQUEST_BOUND_OBSERVATION_CONTRACT = freeze({
  ...DYNAMIC_PLASMA_REQUIRED_FUSED_OBSERVATION_CONTRACT,
  schemaVersion: 3,
  quoteRequestContextVersion: 1,
  requestContextVersion: 1,
  requestContextDomain: REQUEST_CONTEXT_DOMAIN,
  quoteRequestCommitment: 'RETAINED_DETACHED_DATA_NOT_AUTHENTICATED_OR_DURABLE',
});

/**
 * Capture the exact closed RPC quote-request grammar plus declared profile
 * and compiled spork IDs. This hash is not a full block/intent digest, proof
 * of RPC origin, signer state, issuance or authority. No I/O is performed.
 */
export function snapshotDynamicPlasmaQuoteRequestContext(input) {
  if (arguments.length !== 1) reject();
  const top = exactDataObject(input, REQUEST_CONTEXT_INPUT_FIELDS);
  if (top.requestContextVersion !== 1) reject();
  const profile = snapshotExpectedProfile(top.expectedChainProfile);
  const compiled = snapshotCompiledSporks(top.compiledSporkIds);
  let request;
  try { request = snapshotDynamicPlasmaQuoteRequest(top.quoteRequest); }
  catch { reject(); }
  const preimage = stringify([
    REQUEST_CONTEXT_DOMAIN, profile.version, profile.chainIdentifier,
    profile.genesisMomentumHash, compiled.dynamicPlasmaId, compiled.libp2pId,
    request.canonicalParams,
  ]);
  return freeze({
    requestContextVersion: 1,
    quoteRequest: request.quoteRequest,
    digest: 'sha256:' + hashRequest('sha256').update(preimage, 'utf8').digest('hex'),
  });
}

/**
 * Untagged input/output remains the three-field schema-v1 contract. An own
 * enumerable DATA requiredFusedObservationVersion: 1 selects schema v2 and
 * retains all four RPC fields. Both endpoint totals must agree. For active
 * V2 observations, validate the fused-only TOTAL and difficulty using the
 * existing quote validator BEFORE projecting three fields to the classifier.
 * For PRE_DP, upstream b5f93c20 sets TOTAL=base; this check does not validate
 * legacy PoW arithmetic. Neither mode persists a quote-request commitment or
 * authenticates RPC origin, runtime p, signer state, ancestry or execution.
 * Additional own DATA quoteRequestContextVersion: 1 selects schema v3 with
 * the existing four-field selector still 1. A retained request context is
 * rebuilt against the declared profile/IDs. Optional expectedDigest must match
 * that rebuilt context. Without it, the result explicitly says SELF_CONSISTENT
 * only; neither mode authenticates that expected value or grants authority.
 */
export function normalizeDynamicPlasmaObservation(input, expectedDigest = undefined) {
  if (typeof input !== 'object' || input === null || isProxy(input) ||
      getPrototypeOf(input) !== Object.prototype) reject();
  const fourField = getOwnPropertyDescriptor(input, 'requiredFusedObservationVersion') !== undefined;
  const requestBound = getOwnPropertyDescriptor(input, 'quoteRequestContextVersion') !== undefined;
  const observationVersion = requestBound ? 2 : fourField ? 1 : 0;
  const top = exactDataObject(input, observationVersion === 2 ? REQUEST_BOUND_TOP_LEVEL_FIELDS
    : fourField ? FOUR_FIELD_TOP_LEVEL_FIELDS : TOP_LEVEL_FIELDS);
  if (fourField && top.requiredFusedObservationVersion !== 1) reject();
  if (requestBound && (top.requiredFusedObservationVersion !== 1 || top.quoteRequestContextVersion !== 1)) reject();
  if (arguments.length > 2 || (arguments.length > 1 && observationVersion !== 2)) reject();
  if (expectedDigest !== undefined && (typeof expectedDigest !== 'string'
      || expectedDigest.length !== 71 || !testRegExp(SHA256_DIGEST, expectedDigest))) reject();
  const expectedProfile = snapshotExpectedProfile(top.expectedChainProfile);
  const compiledSporks = snapshotCompiledSporks(top.compiledSporkIds);
  let requestContext = null;
  let requestBinding = 'NOT_ESTABLISHED';
  if (observationVersion === 2) {
    const supplied = exactDataObject(top.quoteRequestContext, REQUEST_CONTEXT_FIELDS);
    if (supplied.requestContextVersion !== 1) reject();
    requestContext = snapshotDynamicPlasmaQuoteRequestContext({
      requestContextVersion: 1,
      expectedChainProfile: expectedProfile, compiledSporkIds: compiledSporks,
      quoteRequest: supplied.quoteRequest,
    });
    if (supplied.digest !== requestContext.digest ||
        (expectedDigest !== undefined && expectedDigest !== requestContext.digest)) {
      return evidenceFailure('MISBOUND_OR_INCOHERENT', 'QUOTE_REQUEST_CONTEXT_MISMATCH', 2);
    }
    requestBinding = expectedDigest === undefined ? 'SELF_CONSISTENT_DECLARED_REQUEST_ONLY'
      : 'MATCHES_DECLARED_EXPECTED_REQUEST_CONTEXT';
  }
  const endpoints = snapshotEndpointArray(top.endpointObservations, fourField);

  if (endpoints[0] === null || endpoints[1] === null) {
    return evidenceFailure('UNAVAILABLE', 'ENDPOINT_DATA_UNAVAILABLE', observationVersion);
  }

  for (const endpoint of endpoints) {
    if (!equalFrontier(endpoint.beforeFrontier, endpoint.afterFrontier)) {
      return evidenceFailure('MISBOUND_OR_INCOHERENT', 'FRONTIER_BINDING_MISMATCH', observationVersion);
    }
    if (endpoint.sporks.list === null ||
        endpoint.sporks.count !== endpoint.sporks.list.length) {
      return evidenceFailure('UNAVAILABLE', 'SPORK_SNAPSHOT_INCOMPLETE', observationVersion);
    }
  }

  if (!equalEndpoint(endpoints[0], endpoints[1], fourField)) {
    return evidenceFailure('MISBOUND_OR_INCOHERENT', 'ENDPOINT_OBSERVATION_MISMATCH', observationVersion);
  }

  const observation = endpoints[0];
  if (!profileMatches(expectedProfile, observation)) {
    return evidenceFailure('MISBOUND_OR_INCOHERENT', 'PROFILE_GENESIS_MISMATCH', observationVersion);
  }

  const dynamicSpork = boundDynamicSpork(observation.sporks.list, compiledSporks);
  if (dynamicSpork === null) {
    return evidenceFailure('MISBOUND_OR_INCOHERENT', 'SPORK_BINDING_MISMATCH', observationVersion);
  }

  if (!coherentPlasmaVariables(observation.plasmaVariables)) {
    return evidenceFailure('MISBOUND_OR_INCOHERENT', 'PLASMA_VARIABLES_INCOHERENT', observationVersion);
  }

  if (!coherentFrontierState(observation.beforeFrontier, dynamicSpork)) {
    return evidenceFailure('MISBOUND_OR_INCOHERENT', 'FRONTIER_SPORK_STATE_INCOHERENT', observationVersion);
  }

  if (fourField) {
    if (observation.beforeFrontier.version === 2) {
      try {
        validateDynamicPlasmaRequiredFusedQuote({
          requiredFusedQuoteVersion: 1,
          frontier: compatibilityFrontier(observation.beforeFrontier),
          rpcObservation: observation.rpcObservation,
        });
      } catch (error) {
        if (!knownRequiredFusedInputError(error)) throw error;
        return evidenceFailure('MISBOUND_OR_INCOHERENT', 'RPC_QUOTE_INCOHERENT', observationVersion);
      }
    } else if (observation.rpcObservation.requiredFusedPlasma !== observation.rpcObservation.basePlasma) {
      return evidenceFailure('MISBOUND_OR_INCOHERENT', 'RPC_QUOTE_INCOHERENT', observationVersion);
    }
  }

  let compatibility;
  try {
    compatibility = classifyDynamicPlasmaCompatibility({
      chainProfileMatch: { classification: 'MATCH' },
      beforeFrontier: compatibilityFrontier(observation.beforeFrontier),
      rpcObservation: fourField ? {
        availablePlasma: observation.rpcObservation.availablePlasma,
        basePlasma: observation.rpcObservation.basePlasma,
        requiredDifficulty: observation.rpcObservation.requiredDifficulty,
      } : observation.rpcObservation,
      afterFrontier: compatibilityFrontier(observation.afterFrontier),
    });
  } catch (error) {
    if (knownCompatibilityInputError(error)) reject();
    throw error;
  }
  const normalizedObservation = {
    expectedChainProfile: expectedProfile,
    compiledSporkIds: compiledSporks,
    beforeFrontier: observation.beforeFrontier,
    profileEvidence: observation.profileEvidence,
    sporks: observation.sporks,
    plasmaVariables: observation.plasmaVariables,
    rpcObservation: observation.rpcObservation,
    afterFrontier: observation.afterFrontier,
  };
  if (requestContext !== null) {
    defineProperty(normalizedObservation, 'quoteRequestContext', { value: requestContext, enumerable: true });
  }
  freeze(normalizedObservation);

  return versionedResult({
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
  }, observationVersion, requestBinding);
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

function snapshotEndpointArray(value, fourField) {
  const values = exactPlainArray(value, ENDPOINT_COUNT);
  return freeze(values.map(endpoint => endpoint === null ? null : snapshotEndpoint(endpoint, fourField)));
}

function snapshotEndpoint(value, fourField) {
  const fields = exactDataObject(value, ENDPOINT_FIELDS);
  return freeze({
    beforeFrontier: snapshotFrontier(fields.beforeFrontier),
    profileEvidence: snapshotProfileEvidence(fields.profileEvidence),
    sporks: snapshotSporks(fields.sporks),
    plasmaVariables: snapshotPlasmaVariables(fields.plasmaVariables),
    rpcObservation: snapshotRpcObservation(fields.rpcObservation, fourField),
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

function snapshotRpcObservation(value, fourField) {
  const fields = exactDataObject(value, fourField ? FOUR_FIELD_RPC_OBSERVATION_FIELDS : RPC_OBSERVATION_FIELDS);
  nonnegativeSafeInteger(fields.availablePlasma);
  positiveSafeInteger(fields.basePlasma);
  nonnegativeSafeInteger(fields.requiredDifficulty);
  const result = {
    availablePlasma: fields.availablePlasma,
    basePlasma: fields.basePlasma,
    requiredDifficulty: fields.requiredDifficulty,
  };
  if (fourField) {
    nonnegativeSafeInteger(fields.requiredFusedPlasma);
    defineProperty(result, 'requiredFusedPlasma', { value: fields.requiredFusedPlasma, enumerable: true });
  }
  return freeze(result);
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

function equalEndpoint(left, right, fourField) {
  return equalFrontier(left.beforeFrontier, right.beforeFrontier) &&
    equalProfileEvidence(left.profileEvidence, right.profileEvidence) &&
    equalSporks(left.sporks, right.sporks) &&
    equalPlasmaVariables(left.plasmaVariables, right.plasmaVariables) &&
    equalRpcObservation(left.rpcObservation, right.rpcObservation, fourField) &&
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

function equalRpcObservation(left, right, fourField) {
  return left.availablePlasma === right.availablePlasma &&
    left.basePlasma === right.basePlasma &&
    left.requiredDifficulty === right.requiredDifficulty &&
    (!fourField || left.requiredFusedPlasma === right.requiredFusedPlasma);
}

function evidenceFailure(classification, reason, observationVersion) {
  return versionedResult({
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
  }, observationVersion);
}

function versionedResult(result, observationVersion, requestBinding = 'NOT_ESTABLISHED') {
  if (observationVersion === 2) {
    return freeze({ ...result, schemaVersion: 3, requiredFusedObservationVersion: 1, quoteRequestContextVersion: 1,
      requestContextBinding: requestBinding });
  }
  return observationVersion === 1 ? freeze({ ...result, schemaVersion: 2, requiredFusedObservationVersion: 1 }) : freeze(result);
}

function knownRequiredFusedInputError(error) {
  if (typeof error !== 'object' || error === null || isProxy(error) ||
      getPrototypeOf(error) !== typeErrorPrototype) return false;
  const code = getOwnPropertyDescriptor(error, 'code');
  const message = getOwnPropertyDescriptor(error, 'message');
  return code !== undefined && hasOwn(code, 'value') &&
    typeof code.value === 'string' && testRegExp(
      /^dynamic_plasma_required_fused_quote_(invalid_data|unsupported_contract_version|unsupported_frontier_version|invalid_frontier|unsafe_integer|arithmetic_bound|inconsistent_total|inconsistent_difficulty)$/,
      code.value,
    ) && message !== undefined && hasOwn(message, 'value') && message.value === code.value;
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
