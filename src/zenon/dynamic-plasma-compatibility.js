import { types as utilTypes } from 'node:util';

const PRICE_SCALE = 1000;
const DIFFICULTY_PER_PLASMA = 1500;
const DYNAMIC_PLASMA_MOMENTUM_VERSION = 2;
const MINIMUM_RESOURCE_PRICE = 1000;
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const HASH = /^[0-9a-f]{64}$/;

const TOP_LEVEL_FIELDS = Object.freeze([
  'chainProfileMatch',
  'beforeFrontier',
  'rpcObservation',
  'afterFrontier',
]);
const PROFILE_MATCH_FIELDS = Object.freeze(['classification']);
const FRONTIER_FIELDS = Object.freeze([
  'height',
  'hash',
  'version',
  'nextFusionPrice',
  'nextWorkPrice',
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
const sameValue = Object.is;
const freeze = Object.freeze;
const isSafeInteger = Number.isSafeInteger;
const isProxy = utilTypes.isProxy;
const toBigInt = BigInt;
const toNumber = Number;
const testRegExp = Function.call.bind(RegExp.prototype.test);

export const DYNAMIC_PLASMA_COMPATIBILITY = freeze({
  momentumVersion: DYNAMIC_PLASMA_MOMENTUM_VERSION,
  minimumResourcePrice: MINIMUM_RESOURCE_PRICE,
  priceScale: PRICE_SCALE,
  difficultyPerPlasma: DIFFICULTY_PER_PLASMA,
  scope: 'OBSERVED_FRONTIER_ONLY',
});

export function classifyDynamicPlasmaCompatibility(input) {
  const top = exactDataObject(input, TOP_LEVEL_FIELDS);
  const chainProfileMatch = snapshotProfileMatch(top.chainProfileMatch);
  const beforeFrontier = snapshotNullableFrontier(top.beforeFrontier);
  const rpcObservation = snapshotNullableRpcObservation(top.rpcObservation);
  const afterFrontier = snapshotNullableFrontier(top.afterFrontier);

  if (chainProfileMatch.classification === 'MISMATCH') {
    return classification('MISBOUND_OR_INCOHERENT', 'CHAIN_PROFILE_MISMATCH', 'MISMATCH');
  }
  if (chainProfileMatch.classification === 'UNAVAILABLE' || beforeFrontier === null ||
      rpcObservation === null || afterFrontier === null) {
    return classification('UNAVAILABLE', 'DATA_UNAVAILABLE', chainProfileMatch.classification);
  }
  if (!sameFrontier(beforeFrontier, afterFrontier)) {
    return classification('MISBOUND_OR_INCOHERENT', 'FRONTIER_MISMATCH', 'MATCH');
  }

  if (beforeFrontier.version === 1) {
    if (beforeFrontier.nextFusionPrice !== 0 || beforeFrontier.nextWorkPrice !== 0) {
      return classification('MISBOUND_OR_INCOHERENT', 'FRONTIER_PRICE_INCOHERENT', 'MATCH');
    }
    return classification('PRE_DP', 'PRE_DYNAMIC_PLASMA', 'MATCH');
  }

  if (beforeFrontier.version !== DYNAMIC_PLASMA_MOMENTUM_VERSION) {
    return classification('MISBOUND_OR_INCOHERENT', 'UNSUPPORTED_FRONTIER', 'MATCH');
  }
  if (beforeFrontier.nextFusionPrice < MINIMUM_RESOURCE_PRICE ||
      beforeFrontier.nextWorkPrice < MINIMUM_RESOURCE_PRICE) {
    return classification('MISBOUND_OR_INCOHERENT', 'FRONTIER_PRICE_INCOHERENT', 'MATCH');
  }

  const quote = checkedQuote(beforeFrontier, rpcObservation);
  if (quote === null) {
    return classification('MISBOUND_OR_INCOHERENT', 'RPC_QUOTE_INCOHERENT', 'MATCH');
  }
  return classification('DP_ACTIVE', 'NONE', 'MATCH', quote);
}

function checkedQuote(frontier, rpcObservation) {
  const scale = toBigInt(PRICE_SCALE);
  const basePlasma = toBigInt(rpcObservation.basePlasma);
  const availablePlasma = toBigInt(rpcObservation.availablePlasma);
  const fusionPrice = toBigInt(frontier.nextFusionPrice);
  const workPrice = toBigInt(frontier.nextWorkPrice);
  const requiredFusedPlasma = ceilDivide(basePlasma * fusionPrice, scale);
  requireSafeResult(requiredFusedPlasma);

  let selectedFusedPlasma;
  let expectedDifficulty;
  let pricingMode;
  if (availablePlasma >= requiredFusedPlasma) {
    selectedFusedPlasma = requiredFusedPlasma;
    expectedDifficulty = 0n;
    pricingMode = 'FUSION_ONLY';
  } else {
    const effectiveFusedBase = (availablePlasma * scale) / fusionPrice;
    const remainingBase = basePlasma - effectiveFusedBase;
    const pricedWork = ceilDivide(remainingBase * workPrice, scale);
    expectedDifficulty = pricedWork * toBigInt(DIFFICULTY_PER_PLASMA);
    selectedFusedPlasma = availablePlasma;
    pricingMode = 'FUSION_AND_POW';
  }
  requireSafeResult(expectedDifficulty);
  requireSafeResult(selectedFusedPlasma);

  const requiredDifficulty = toNumber(expectedDifficulty);
  if (requiredDifficulty !== rpcObservation.requiredDifficulty) return null;
  const selected = toNumber(selectedFusedPlasma);

  return freeze({
    frontier: freeze({ ...frontier }),
    rpcObservation: freeze({ ...rpcObservation }),
    selectedFusedPlasma: selected,
    requiredDifficulty,
    powRequired: requiredDifficulty !== 0,
    pricingMode,
    sdk105BasePlasmaUnderpricingDetected:
      requiredDifficulty === 0 && selected > rpcObservation.basePlasma,
  });
}

function snapshotProfileMatch(value) {
  const result = exactDataObject(value, PROFILE_MATCH_FIELDS);
  if (result.classification !== 'MATCH' && result.classification !== 'MISMATCH' &&
      result.classification !== 'UNAVAILABLE') reject();
  return freeze({ classification: result.classification });
}

function snapshotNullableFrontier(value) {
  if (value === null) return null;
  const result = exactDataObject(value, FRONTIER_FIELDS);
  positiveSafeInteger(result.height);
  if (typeof result.hash !== 'string' || !testRegExp(HASH, result.hash)) reject();
  nonnegativeSafeInteger(result.version);
  nonnegativeSafeInteger(result.nextFusionPrice);
  nonnegativeSafeInteger(result.nextWorkPrice);
  return freeze({
    height: result.height,
    hash: result.hash,
    version: result.version,
    nextFusionPrice: result.nextFusionPrice,
    nextWorkPrice: result.nextWorkPrice,
  });
}

function snapshotNullableRpcObservation(value) {
  if (value === null) return null;
  const result = exactDataObject(value, RPC_OBSERVATION_FIELDS);
  nonnegativeSafeInteger(result.availablePlasma);
  positiveSafeInteger(result.basePlasma);
  nonnegativeSafeInteger(result.requiredDifficulty);
  return freeze({
    availablePlasma: result.availablePlasma,
    basePlasma: result.basePlasma,
    requiredDifficulty: result.requiredDifficulty,
  });
}

function exactDataObject(value, expectedFields) {
  if (typeof value !== 'object' || value === null || isProxy(value) ||
      getPrototypeOf(value) !== Object.prototype) reject();
  const keys = ownKeys(value);
  if (keys.length !== expectedFields.length) reject();
  const result = {};
  for (let index = 0; index < expectedFields.length; index += 1) {
    const field = expectedFields[index];
    const descriptor = getOwnPropertyDescriptor(value, field);
    if (descriptor === undefined || descriptor.enumerable !== true ||
        !hasOwn(descriptor, 'value')) reject();
    result[field] = descriptor.value;
  }
  return result;
}

function sameFrontier(left, right) {
  return left.height === right.height && left.hash === right.hash &&
    left.version === right.version && left.nextFusionPrice === right.nextFusionPrice &&
    left.nextWorkPrice === right.nextWorkPrice;
}

function classification(kind, reason, chainProfileGuard, quote = null) {
  return freeze({
    classification: kind,
    reason,
    scope: 'OBSERVED_FRONTIER_ONLY',
    chainProfileGuard,
    chainAuthentication: 'NOT_ESTABLISHED',
    afterSigningAction: 'NONE',
    quote,
  });
}

function ceilDivide(value, divisor) {
  return (value + divisor - 1n) / divisor;
}

function nonnegativeSafeInteger(value) {
  if (!isSafeInteger(value) || value < 0 || sameValue(value, -0)) reject();
}

function positiveSafeInteger(value) {
  nonnegativeSafeInteger(value);
  if (value === 0) reject();
}

function requireSafeResult(value) {
  if (value < 0n || value > MAX_SAFE_BIGINT) reject();
}

function reject() {
  const error = new TypeError('Dynamic Plasma compatibility input rejected');
  defineProperty(error, 'code', {
    value: 'dynamic_plasma_compatibility_input_rejected',
    enumerable: true,
  });
  throw error;
}
