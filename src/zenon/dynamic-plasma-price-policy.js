import { types as utilTypes } from 'node:util';

// Formula reference only, not a deployed-runtime receipt:
// go-zenon e58d8e80eabd9fd5630ed62e0707424d96b5303c,
// dp/dp.go and definition/plasma.go.
// p is supplied explicitly. N counts pricing-frontier advances, not time.
// 128 is a local resource bound. Stable runtime/governance context is a premise.
const freeze = Object.freeze;
const ownKeys = Reflect.ownKeys;
const getDescriptor = Object.getOwnPropertyDescriptor;
const getPrototypeOf = Object.getPrototypeOf;
const hasOwn = Object.hasOwn;
const defineProperty = Object.defineProperty;
const sameValue = Object.is;
const isSafeInteger = Number.isSafeInteger;
const isProxy = utilTypes.isProxy;
const apply = Reflect.apply;
const regexpTest = RegExp.prototype.test;
const objectPrototype = Object.prototype;
const TypeErrorConstructor = TypeError;
const toBigInt = BigInt;
const toNumber = Number;
const MAX_SAFE = 9007199254740991n;
const SCALE = 1000n;
const DIFFICULTY = 1500n;
const MINIMUM_PRICE = 1000n;
const HASH = /^[0-9a-f]{64}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const SCOPE = 'DECLARED_UNSIGNED_PRICE_BOUND';
const CONTINUITY = 'HEIGHT_WINDOW_ONLY_NO_ANCESTRY_PROOF';

const COMPAT_FIELDS = freeze([
  'classification', 'reason', 'scope', 'chainProfileGuard',
  'chainAuthentication', 'afterSigningAction', 'quote',
]);
const INSTANT_FIELDS = freeze([
  'frontier', 'rpcObservation', 'selectedFusedPlasma', 'requiredDifficulty',
  'powRequired', 'pricingMode', 'sdk105BasePlasmaUnderpricingDetected',
]);
const FRONTIER_FIELDS = freeze([
  'height', 'hash', 'version', 'nextFusionPrice', 'nextWorkPrice',
]);
const RPC_FIELDS = freeze(['availablePlasma', 'basePlasma', 'requiredDifficulty']);
const POLICY_FIELDS = freeze([
  'policyVersion', 'maxPriceChangePercent', 'maxMomentumAdvances',
  'maxFusedPlasma', 'maxDifficulty',
]);
const CREATE_FIELDS = freeze([
  'compatibility', 'policy', 'subjectDigest', 'runtimeContextDigest',
]);
const SELECT_FIELDS = freeze([
  'quote', 'compatibility', 'policy', 'subjectDigest', 'runtimeContextDigest',
]);
const VALIDATE_FIELDS = freeze([...SELECT_FIELDS, 'selection']);
const BOUND_FIELDS = freeze(['fusionPrice', 'workPrice']);
const SELECTION_FIELDS = freeze(['fusedPlasma', 'difficulty']);
const RECEIPT_FIELDS = freeze([
  'quoteVersion', 'scope', 'chainAuthentication', 'frontierContinuity',
  'afterSigningAction', 'policy', 'sourceCompatibility', 'boundPrices',
  'selected', 'pricingMode', 'subjectDigest', 'runtimeContextDigest',
]);

/**
 * INTERNAL arithmetic shared with the observed-frontier classifier.
 * BigInt primitives and the guard are trusted captured caller values.
 * Preserve guard order: required fusion, expected difficulty, selected fusion.
 */
export function calculateDynamicPlasmaPriceAmounts(
  basePlasmaBig,
  availablePlasmaBig,
  fusionPriceBig,
  workPriceBig,
  scaleBig,
  difficultyPerPlasmaBig,
  requireSafeResult,
) {
  const requiredFusedPlasma = ceilDivide(basePlasmaBig * fusionPriceBig, scaleBig);
  requireSafeResult(requiredFusedPlasma);

  let selectedFusedPlasma;
  let expectedDifficulty;
  let pricingMode;
  if (availablePlasmaBig >= requiredFusedPlasma) {
    selectedFusedPlasma = requiredFusedPlasma;
    expectedDifficulty = 0n;
    pricingMode = 'FUSION_ONLY';
  } else {
    const effectiveFusedBase = (availablePlasmaBig * scaleBig) / fusionPriceBig;
    const remainingBase = basePlasmaBig - effectiveFusedBase;
    const pricedWork = ceilDivide(remainingBase * workPriceBig, scaleBig);
    expectedDifficulty = pricedWork * difficultyPerPlasmaBig;
    selectedFusedPlasma = availablePlasmaBig;
    pricingMode = 'FUSION_AND_POW';
  }
  requireSafeResult(expectedDifficulty);
  requireSafeResult(selectedFusedPlasma);
  return freeze({
    requiredFusedPlasma,
    selectedFusedPlasma,
    expectedDifficulty,
    pricingMode,
  });
}

/**
 * Receipt v1 has exactly RECEIPT_FIELDS. Its nested records contain only
 * primitive strings, booleans and nonnegative safe integers.
 * FUSION_AND_POW with selected.fusedPlasma === 0 represents PoW-only pricing.
 *
 * Receipts are self-checking declared data, not authenticated issuance,
 * custody, signer state, ancestry, work, inclusion or recovery evidence.
 * Digests are opaque declared bindings. JSON copies remain checkable;
 * neither freezing nor MATCH establishes chain authentication.
 */
export function createDynamicPlasmaPricePolicyQuote(input) {
  if (arguments.length !== 1) reject();
  const top = record(input, CREATE_FIELDS);
  return buildQuote(
    snapshotCompatibility(top.compatibility),
    snapshotPolicy(top.policy),
    digest(top.subjectDigest),
    digest(top.runtimeContextDigest),
  );
}

export function selectDynamicPlasmaPricePolicyFields(input) {
  if (arguments.length !== 1) reject();
  return checkSelection(input, SELECT_FIELDS, false);
}

export function validateDynamicPlasmaPricePolicySelection(input) {
  if (arguments.length !== 1) reject();
  return checkSelection(input, VALIDATE_FIELDS, true);
}

function record(value, fields) {
  if (typeof value !== 'object' || value === null || isProxy(value)
      || getPrototypeOf(value) !== objectPrototype) reject();
  const keys = ownKeys(value);
  if (keys.length !== fields.length) reject();
  const result = {};
  for (let index = 0; index < fields.length; index++) {
    const field = fields[index];
    const descriptor = getDescriptor(value, field);
    if (descriptor === undefined || descriptor.enumerable !== true
        || !hasOwn(descriptor, 'value')) reject();
    result[field] = descriptor.value;
  }
  return result;
}

function safeNumber(value) {
  if (!isSafeInteger(value) || value < 0 || sameValue(value, -0)) reject();
  return value;
}

function positiveNumber(value) {
  safeNumber(value);
  if (value === 0) reject();
  return value;
}

function matches(pattern, value) {
  return apply(regexpTest, pattern, [value]);
}

function digest(value) {
  if (typeof value !== 'string' || value.length !== 71
      || !matches(DIGEST, value)) reject();
  return value;
}

function snapshotFrontier(value) {
  const f = record(value, FRONTIER_FIELDS);
  positiveNumber(f.height);
  safeNumber(f.version);
  safeNumber(f.nextFusionPrice);
  safeNumber(f.nextWorkPrice);
  if (typeof f.hash !== 'string' || f.hash.length !== 64
      || !matches(HASH, f.hash) || f.version !== 2
      || f.nextFusionPrice < 1000 || f.nextWorkPrice < 1000) reject();
  return freeze({
    height: f.height,
    hash: f.hash,
    version: f.version,
    nextFusionPrice: f.nextFusionPrice,
    nextWorkPrice: f.nextWorkPrice,
  });
}

function snapshotRpc(value) {
  const r = record(value, RPC_FIELDS);
  safeNumber(r.availablePlasma);
  positiveNumber(r.basePlasma);
  safeNumber(r.requiredDifficulty);
  return freeze({
    availablePlasma: r.availablePlasma,
    basePlasma: r.basePlasma,
    requiredDifficulty: r.requiredDifficulty,
  });
}

function snapshotCompatibility(value) {
  const c = record(value, COMPAT_FIELDS);
  if (c.classification !== 'DP_ACTIVE' || c.reason !== 'NONE'
      || c.scope !== 'OBSERVED_FRONTIER_ONLY' || c.chainProfileGuard !== 'MATCH'
      || c.chainAuthentication !== 'NOT_ESTABLISHED'
      || c.afterSigningAction !== 'NONE') reject();
  const q = record(c.quote, INSTANT_FIELDS);
  const frontier = snapshotFrontier(q.frontier);
  const rpc = snapshotRpc(q.rpcObservation);
  safeNumber(q.selectedFusedPlasma);
  safeNumber(q.requiredDifficulty);
  const amounts = calculateDynamicPlasmaPriceAmounts(
    toBigInt(rpc.basePlasma),
    toBigInt(rpc.availablePlasma),
    toBigInt(frontier.nextFusionPrice),
    toBigInt(frontier.nextWorkPrice),
    SCALE,
    DIFFICULTY,
    safeResult,
  );
  const selected = toNumber(amounts.selectedFusedPlasma);
  const difficulty = toNumber(amounts.expectedDifficulty);
  const underpricing = difficulty === 0 && selected > rpc.basePlasma;
  if (rpc.requiredDifficulty !== difficulty || q.requiredDifficulty !== difficulty
      || q.selectedFusedPlasma !== selected || q.powRequired !== (difficulty !== 0)
      || q.pricingMode !== amounts.pricingMode
      || q.sdk105BasePlasmaUnderpricingDetected !== underpricing) reject();
  return freeze({
    classification: 'DP_ACTIVE',
    reason: 'NONE',
    scope: 'OBSERVED_FRONTIER_ONLY',
    chainProfileGuard: 'MATCH',
    chainAuthentication: 'NOT_ESTABLISHED',
    afterSigningAction: 'NONE',
    quote: freeze({
      frontier,
      rpcObservation: rpc,
      selectedFusedPlasma: selected,
      requiredDifficulty: difficulty,
      powRequired: difficulty !== 0,
      pricingMode: amounts.pricingMode,
      sdk105BasePlasmaUnderpricingDetected: underpricing,
    }),
  });
}

function snapshotPolicy(value) {
  const p = record(value, POLICY_FIELDS);
  if (p.policyVersion !== 1) reject();
  safeNumber(p.maxPriceChangePercent);
  safeNumber(p.maxMomentumAdvances);
  safeNumber(p.maxFusedPlasma);
  safeNumber(p.maxDifficulty);
  if (p.maxPriceChangePercent < 1 || p.maxPriceChangePercent > 100
      || p.maxMomentumAdvances > 128) reject();
  return freeze({
    policyVersion: 1,
    maxPriceChangePercent: p.maxPriceChangePercent,
    maxMomentumAdvances: p.maxMomentumAdvances,
    maxFusedPlasma: p.maxFusedPlasma,
    maxDifficulty: p.maxDifficulty,
  });
}

function boundedPrice(initial, policy, advances = policy.maxMomentumAdvances) {
  let price = initial;
  const multiplier = 100n + toBigInt(policy.maxPriceChangePercent);
  for (let step = 0; step < advances; step++) {
    price = (price * multiplier) / 100n;
    if (price < MINIMUM_PRICE) price = MINIMUM_PRICE;
    safeResult(price);
  }
  return price;
}

function buildQuote(sourceCompatibility, policy, subjectDigest, runtimeContextDigest) {
  const instant = sourceCompatibility.quote;
  const fusionPrice = boundedPrice(toBigInt(instant.frontier.nextFusionPrice), policy);
  const workPrice = boundedPrice(toBigInt(instant.frontier.nextWorkPrice), policy);
  const available = instant.rpcObservation.availablePlasma < policy.maxFusedPlasma
    ? instant.rpcObservation.availablePlasma : policy.maxFusedPlasma;
  const amounts = calculateDynamicPlasmaPriceAmounts(
    toBigInt(instant.rpcObservation.basePlasma),
    toBigInt(available),
    fusionPrice,
    workPrice,
    SCALE,
    DIFFICULTY,
    safeResult,
  );
  if (amounts.expectedDifficulty > toBigInt(policy.maxDifficulty)) reject();
  return freeze({
    quoteVersion: 1,
    scope: SCOPE,
    chainAuthentication: 'NOT_ESTABLISHED',
    frontierContinuity: CONTINUITY,
    afterSigningAction: 'NONE',
    policy,
    sourceCompatibility,
    boundPrices: freeze({
      fusionPrice: toNumber(fusionPrice),
      workPrice: toNumber(workPrice),
    }),
    selected: freeze({
      fusedPlasma: toNumber(amounts.selectedFusedPlasma),
      difficulty: toNumber(amounts.expectedDifficulty),
    }),
    pricingMode: amounts.pricingMode,
    subjectDigest,
    runtimeContextDigest,
  });
}

function snapshotSelection(value) {
  const s = record(value, SELECTION_FIELDS);
  safeNumber(s.fusedPlasma);
  safeNumber(s.difficulty);
  return freeze({ fusedPlasma: s.fusedPlasma, difficulty: s.difficulty });
}

function rebuildReceipt(value) {
  const r = record(value, RECEIPT_FIELDS);
  if (r.quoteVersion !== 1 || r.scope !== SCOPE
      || r.chainAuthentication !== 'NOT_ESTABLISHED'
      || r.frontierContinuity !== CONTINUITY
      || r.afterSigningAction !== 'NONE') reject();
  const source = snapshotCompatibility(r.sourceCompatibility);
  const policy = snapshotPolicy(r.policy);
  const subject = digest(r.subjectDigest);
  const runtime = digest(r.runtimeContextDigest);
  const bounds = record(r.boundPrices, BOUND_FIELDS);
  safeNumber(bounds.fusionPrice);
  safeNumber(bounds.workPrice);
  const selected = snapshotSelection(r.selected);
  const expected = buildQuote(source, policy, subject, runtime);
  if (bounds.fusionPrice !== expected.boundPrices.fusionPrice
      || bounds.workPrice !== expected.boundPrices.workPrice
      || selected.fusedPlasma !== expected.selected.fusedPlasma
      || selected.difficulty !== expected.selected.difficulty
      || r.pricingMode !== expected.pricingMode) reject();
  return expected;
}

function samePolicy(left, right) {
  for (let index = 0; index < POLICY_FIELDS.length; index++) {
    const field = POLICY_FIELDS[index];
    if (left[field] !== right[field]) return false;
  }
  return true;
}

function checkSelection(input, fields, validate) {
  const top = record(input, fields);
  const quote = rebuildReceipt(top.quote);
  const policy = snapshotPolicy(top.policy);
  if (!samePolicy(policy, quote.policy)
      || digest(top.subjectDigest) !== quote.subjectDigest
      || digest(top.runtimeContextDigest) !== quote.runtimeContextDigest) reject();
  const current = snapshotCompatibility(top.compatibility);
  const origin = quote.sourceCompatibility.quote;
  const now = current.quote;
  const age = toBigInt(now.frontier.height) - toBigInt(origin.frontier.height);
  if (now.rpcObservation.basePlasma !== origin.rpcObservation.basePlasma
      || now.rpcObservation.availablePlasma < quote.selected.fusedPlasma
      || age < 0n || age > toBigInt(policy.maxMomentumAdvances)
      || (age === 0n && (now.frontier.hash !== origin.frontier.hash
        || now.frontier.nextFusionPrice !== origin.frontier.nextFusionPrice
        || now.frontier.nextWorkPrice !== origin.frontier.nextWorkPrice))
      || (age > 0n && now.frontier.hash === origin.frontier.hash)
      || now.frontier.nextFusionPrice > quote.boundPrices.fusionPrice
      || now.frontier.nextWorkPrice > quote.boundPrices.workPrice) reject();

  // The quote reserves its full horizon, but a current declared observation
  // must also fit the price-growth ceiling for the advances actually elapsed.
  const observedAdvances = toNumber(age);
  if (toBigInt(now.frontier.nextFusionPrice) > boundedPrice(
    toBigInt(origin.frontier.nextFusionPrice), policy, observedAdvances,
  ) || toBigInt(now.frontier.nextWorkPrice) > boundedPrice(
    toBigInt(origin.frontier.nextWorkPrice), policy, observedAdvances,
  )) reject();

  // Price only the original planned fusion allocation, not the current pool.
  const required = calculateDynamicPlasmaPriceAmounts(
    toBigInt(now.rpcObservation.basePlasma),
    toBigInt(quote.selected.fusedPlasma),
    toBigInt(now.frontier.nextFusionPrice),
    toBigInt(now.frontier.nextWorkPrice),
    SCALE,
    DIFFICULTY,
    safeResult,
  );
  if (toBigInt(quote.selected.difficulty) < required.expectedDifficulty) reject();
  if (validate) {
    const supplied = snapshotSelection(top.selection);
    if (supplied.fusedPlasma !== quote.selected.fusedPlasma
        || supplied.difficulty !== quote.selected.difficulty) reject();
  }
  return freeze({
    fusedPlasma: quote.selected.fusedPlasma,
    difficulty: quote.selected.difficulty,
  });
}

function ceilDivide(value, divisor) {
  return (value + divisor - 1n) / divisor;
}

function safeResult(value) {
  if (value < 0n || value > MAX_SAFE) reject();
}

function reject() {
  const error = new TypeErrorConstructor('Dynamic Plasma price policy input rejected');
  defineProperty(error, 'code', {
    value: 'dynamic_plasma_price_policy_input_rejected',
    enumerable: true,
  });
  defineProperty(error, 'stack', {
    value: 'TypeError: Dynamic Plasma price policy input rejected',
    enumerable: false,
    writable: false,
    configurable: false,
  });
  throw freeze(error);
}
