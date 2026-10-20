import { types as utilTypes } from 'node:util';
import { validateDynamicPlasmaRequiredFusedQuote } from './dynamic-plasma-required-fused-quote.js';
import { classifyDynamicPlasmaCompatibility } from './dynamic-plasma-compatibility.js';
import {
  normalizeDynamicPlasmaObservation,
  snapshotDynamicPlasmaQuoteRequestContext,
} from './dynamic-plasma-observation-normalizer.js';
import {
  createDynamicPlasmaPricePolicyQuote,
  selectDynamicPlasmaPricePolicyFields,
  validateDynamicPlasmaPricePolicySelection,
} from './dynamic-plasma-price-policy.js';

const VALIDATE_QUOTE = validateDynamicPlasmaRequiredFusedQuote;
const CLASSIFY = classifyDynamicPlasmaCompatibility;
const CREATE_POLICY = createDynamicPlasmaPricePolicyQuote;
const SELECT_POLICY = selectDynamicPlasmaPricePolicyFields;
const VALIDATE_POLICY = validateDynamicPlasmaPricePolicySelection;
const NORMALIZE_OBSERVATION = normalizeDynamicPlasmaObservation;
const SNAPSHOT_REQUEST_CONTEXT = snapshotDynamicPlasmaQuoteRequestContext;
const freeze = Object.freeze;
const create = Object.create;
const ownKeys = Reflect.ownKeys;
const descriptor = Object.getOwnPropertyDescriptor;
const prototype = Object.getPrototypeOf;
const hasOwn = Object.hasOwn;
const define = Object.defineProperty;
const same = Object.is;
const isProxy = utilTypes.isProxy;
const objectPrototype = Object.prototype;
const ErrorType = TypeError;
const CREATE = freeze([
  'requiredFusedPolicyVersion', 'observation', 'policy',
  'subjectDigest', 'runtimeContextDigest',
]);
const SELECT = freeze([...CREATE, 'quote']);
const VALIDATE = freeze([...SELECT, 'selection']);
const REQUEST_BOUND_FIELDS = freeze(['quoteRequestContextVersion', 'expectedQuoteRequestContext']);
const POLICY_FIELDS = freeze([
  'policyVersion', 'maxPriceChangePercent', 'maxMomentumAdvances',
  'maxFusedPlasma', 'maxDifficulty',
]);
const OBSERVATION = freeze([
  'chainProfileMatch', 'beforeFrontier', 'rpcObservation', 'afterFrontier',
]);
const PROFILE = freeze(['classification']);
const FRONTIER = freeze(['height', 'hash', 'version', 'nextFusionPrice', 'nextWorkPrice']);
const REQUEST_BOUND_OBSERVATION = freeze([...OBSERVATION, 'quoteRequestContext']);
const RECEIPT = freeze([
  'requiredFusedPolicyQuoteVersion', 'scope', 'chainAuthentication', 'activation',
  'afterSigningAction', 'authority', 'sourceObservation', 'pricePolicyQuote',
]);
const REQUEST_BOUND_RECEIPT = freeze([...RECEIPT, 'requestContextBinding']);

/**
 * Opt-in shared planner/validator adapter for declared four-field V2 quotes.
 * Inputs use requiredFusedPolicyVersion: 1; select adds quote and validate
 * adds quote/selection. Observation has exactly OBSERVATION fields, with all
 * FOUR RPC fields required by validateDynamicPlasmaRequiredFusedQuote.
 *
 * Validate the fused-only TOTAL before explicitly projecting three fields
 * into the unchanged compatibility and bounded-price policy. The receipt
 * retains all four original fields; select/validate also check all four
 * current fields and return only the original fusedPlasma/difficulty pair.
 * Never attach the fused-only total alongside the recommended PoW amount.
 *
 * The shared policy requires positive height/base and DP_ACTIVE/MATCH. The
 * quote-only contract's encoded zero struct is not unsigned-block admission.
 * A receipt is self-checking DATA, not authenticated issuance: a caller can
 * construct another coherent receipt. It does not prove RPC origin, unsigned
 * signer state, subject ownership, ancestry, runtime p/governance, activation,
 * preparation, work, inclusion or recovery. Expiry grants no replacement or
 * retry authority. No active buyer, SDK, signer or default is wired here.
 *
 * Additional quoteRequestContextVersion: 1 and expectedQuoteRequestContext
 * explicitly select the request-bound consumer. observation then uses the
 * collector's exact raw schema3 grammar, not the older four-field projection.
 * Recompute the independent declared expectation with the existing snapshot
 * function, then normalize both endpoints against its digest before policy
 * creation or current selection/validation. A version2 receipt retains the
 * detached request context and cannot be mixed with older receipts. Matching
 * remains declared-DATA equality, not authenticated RPC, full block intent,
 * signer state, issuance or authority. Policy p must equal the normalized
 * declared plasma-variable value on every call; real runtime/governance p
 * and its stability still require independent qualification.
 * Captured intrinsics, unchanged dependencies and their native behavior are
 * premises; this is not a hard resource, cancellation or sandbox boundary.
 */
export function createDynamicPlasmaRequiredFusedPolicyQuote(input) {
  try {
    if (arguments.length !== 1) reject();
    const top = context(input, CREATE);
    return buildReceipt(normalizeCurrentObservation(top.observation, top), top);
  } catch { reject(); }
}

export function selectDynamicPlasmaRequiredFusedPolicyFields(input) {
  try {
    if (arguments.length !== 1) reject();
    return checkSelection(context(input, SELECT), false);
  } catch { reject(); }
}

export function validateDynamicPlasmaRequiredFusedPolicySelection(input) {
  try {
    if (arguments.length !== 1) reject();
    return checkSelection(context(input, VALIDATE), true);
  } catch { reject(); }
}

function context(value, fields) {
  if (typeof value !== 'object' || value === null || isProxy(value)
      || prototype(value) !== objectPrototype) reject();
  const requestBound = descriptor(value, 'quoteRequestContextVersion') !== undefined;
  const top = record(value, requestBound ? [...fields, ...REQUEST_BOUND_FIELDS] : fields);
  if (top.requiredFusedPolicyVersion !== 1) reject();
  if (requestBound) {
    if (top.quoteRequestContextVersion !== 1) reject();
    top.expectedQuoteRequestContext = SNAPSHOT_REQUEST_CONTEXT(top.expectedQuoteRequestContext);
  }
  return top;
}

function normalizeCurrentObservation(value, top) {
  if (top.quoteRequestContextVersion !== 1) return normalizeObservation(value);
  const expected = top.expectedQuoteRequestContext;
  const normalized = NORMALIZE_OBSERVATION(value, expected.digest);
  if (normalized.schemaVersion !== 3 || normalized.classification !== 'DP_ACTIVE'
      || normalized.requestContextBinding !== 'MATCHES_DECLARED_EXPECTED_REQUEST_CONTEXT'
      || normalized.observation === null) reject();
  const current = normalized.observation;
  if (record(top.policy, POLICY_FIELDS).maxPriceChangePercent
      !== current.plasmaVariables.MaxPriceChangePercent) reject();
  return normalizeObservation({
    chainProfileMatch: { classification: 'MATCH' },
    beforeFrontier: projectFrontier(current.beforeFrontier),
    rpcObservation: current.rpcObservation,
    afterFrontier: projectFrontier(current.afterFrontier),
    quoteRequestContext: current.quoteRequestContext,
  }, expected);
}

function projectFrontier(frontier) {
  return {
    height: frontier.height, hash: frontier.hash, version: frontier.version,
    nextFusionPrice: frontier.nextFusionPrice, nextWorkPrice: frontier.nextWorkPrice,
  };
}

function normalizeObservation(value, expectedRequestContext = null) {
  const observation = record(value, expectedRequestContext === null
    ? OBSERVATION : REQUEST_BOUND_OBSERVATION);
  if (expectedRequestContext !== null) {
    compareData(observation.quoteRequestContext, expectedRequestContext, 0, { remaining: 32 });
  }
  const profile = record(observation.chainProfileMatch, PROFILE);
  if (profile.classification !== 'MATCH') reject();
  const checked = VALIDATE_QUOTE({
    requiredFusedQuoteVersion: 1,
    frontier: observation.beforeFrontier,
    rpcObservation: observation.rpcObservation,
  });
  const after = record(observation.afterFrontier, FRONTIER);
  const afterFrontier = freeze({
    height: after.height, hash: after.hash, version: after.version,
    nextFusionPrice: after.nextFusionPrice, nextWorkPrice: after.nextWorkPrice,
  });
  const rpc = checked.rpcObservation;
  // This projection is deliberate and occurs ONLY after four-field validation.
  const compatibility = CLASSIFY({
    chainProfileMatch: { classification: 'MATCH' },
    beforeFrontier: checked.frontier,
    rpcObservation: {
      availablePlasma: rpc.availablePlasma,
      basePlasma: rpc.basePlasma,
      requiredDifficulty: rpc.requiredDifficulty,
    },
    afterFrontier,
  });
  if (compatibility.classification !== 'DP_ACTIVE'
      || compatibility.chainProfileGuard !== 'MATCH'
      || compatibility.quote === null) reject();
  const sourceObservation = {
    chainProfileMatch: freeze({ classification: 'MATCH' }),
    beforeFrontier: checked.frontier,
    rpcObservation: checked.rpcObservation,
    afterFrontier,
  };
  if (expectedRequestContext !== null) sourceObservation.quoteRequestContext = expectedRequestContext;
  return { compatibility, sourceObservation: freeze(sourceObservation) };
}

function buildReceipt(normalized, top) {
  const pricePolicyQuote = CREATE_POLICY({
    compatibility: normalized.compatibility,
    policy: top.policy,
    subjectDigest: top.subjectDigest,
    runtimeContextDigest: top.runtimeContextDigest,
  });
  const requestBound = top.quoteRequestContextVersion === 1;
  const receipt = {
    requiredFusedPolicyQuoteVersion: requestBound ? 2 : 1,
    scope: requestBound ? 'DECLARED_V2_REQUEST_BOUND_REQUIRED_FUSED_PRICE_POLICY'
      : 'DECLARED_V2_REQUIRED_FUSED_PRICE_POLICY',
    chainAuthentication: 'NOT_ESTABLISHED',
    activation: 'NOT_ESTABLISHED',
    afterSigningAction: 'NONE',
    authority: 'NONE',
    sourceObservation: normalized.sourceObservation,
    pricePolicyQuote,
  };
  if (requestBound) receipt.requestContextBinding = 'MATCHES_DECLARED_EXPECTED_REQUEST_CONTEXT';
  return freeze(receipt);
}

function checkSelection(top, validate) {
  const requestBound = top.quoteRequestContextVersion === 1;
  const current = normalizeCurrentObservation(top.observation, top);
  const supplied = record(top.quote, requestBound ? REQUEST_BOUND_RECEIPT : RECEIPT);
  const origin = normalizeObservation(supplied.sourceObservation,
    requestBound ? top.expectedQuoteRequestContext : null);
  const expected = buildReceipt(origin, top);
  // Rebuild with the CURRENT supplied policy and digests. A changed binding,
  // inconsistent four-field origin, or tampered nested policy receipt refuses.
  compareData(top.quote, expected, 0, { remaining: 256 });
  const request = {
    quote: expected.pricePolicyQuote,
    compatibility: current.compatibility,
    policy: top.policy,
    subjectDigest: top.subjectDigest,
    runtimeContextDigest: top.runtimeContextDigest,
  };
  if (validate) {
    return VALIDATE_POLICY({ ...request, selection: top.selection });
  }
  return SELECT_POLICY(request);
}

function compareData(value, expected, depth, budget) {
  if (depth > 8 || --budget.remaining < 0) reject();
  if (typeof expected !== 'object' || expected === null) {
    if (!same(value, expected)) reject();
    return;
  }
  const fields = ownKeys(expected);
  const copy = record(value, fields);
  for (let index = 0; index < fields.length; index++) {
    const field = fields[index];
    compareData(copy[field], expected[field], depth + 1, budget);
  }
}

function record(value, fields) {
  if (typeof value !== 'object' || value === null || isProxy(value)
      || prototype(value) !== objectPrototype) reject();
  if (ownKeys(value).length !== fields.length) reject();
  const copy = create(null);
  for (let index = 0; index < fields.length; index++) {
    const field = fields[index], d = descriptor(value, field);
    if (d === undefined || d.enumerable !== true || !hasOwn(d, 'value')) reject();
    copy[field] = d.value;
  }
  return copy;
}

function reject() {
  const code = 'dynamic_plasma_required_fused_policy_input_rejected';
  const error = new ErrorType(code);
  define(error, 'code', { value: code, enumerable: true });
  define(error, 'stack', { value: 'TypeError: ' + code, enumerable: false });
  throw freeze(error);
}
