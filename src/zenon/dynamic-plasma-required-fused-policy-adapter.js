import { types as utilTypes } from 'node:util';
import { validateDynamicPlasmaRequiredFusedQuote } from './dynamic-plasma-required-fused-quote.js';
import { classifyDynamicPlasmaCompatibility } from './dynamic-plasma-compatibility.js';
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
const OBSERVATION = freeze([
  'chainProfileMatch', 'beforeFrontier', 'rpcObservation', 'afterFrontier',
]);
const PROFILE = freeze(['classification']);
const FRONTIER = freeze(['height', 'hash', 'version', 'nextFusionPrice', 'nextWorkPrice']);
const RECEIPT = freeze([
  'requiredFusedPolicyQuoteVersion', 'scope', 'chainAuthentication', 'activation',
  'afterSigningAction', 'authority', 'sourceObservation', 'pricePolicyQuote',
]);

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
 * Captured intrinsics, unchanged dependencies and their native behavior are
 * premises; this is not a hard resource, cancellation or sandbox boundary.
 */
export function createDynamicPlasmaRequiredFusedPolicyQuote(input) {
  try {
    if (arguments.length !== 1) reject();
    const top = context(input, CREATE);
    return buildReceipt(normalizeObservation(top.observation), top);
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
  const top = record(value, fields);
  if (top.requiredFusedPolicyVersion !== 1) reject();
  return top;
}

function normalizeObservation(value) {
  const observation = record(value, OBSERVATION);
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
  return {
    compatibility,
    sourceObservation: freeze({
      chainProfileMatch: freeze({ classification: 'MATCH' }),
      beforeFrontier: checked.frontier,
      rpcObservation: checked.rpcObservation,
      afterFrontier,
    }),
  };
}

function buildReceipt(normalized, top) {
  const pricePolicyQuote = CREATE_POLICY({
    compatibility: normalized.compatibility,
    policy: top.policy,
    subjectDigest: top.subjectDigest,
    runtimeContextDigest: top.runtimeContextDigest,
  });
  return freeze({
    requiredFusedPolicyQuoteVersion: 1,
    scope: 'DECLARED_V2_REQUIRED_FUSED_PRICE_POLICY',
    chainAuthentication: 'NOT_ESTABLISHED',
    activation: 'NOT_ESTABLISHED',
    afterSigningAction: 'NONE',
    authority: 'NONE',
    sourceObservation: normalized.sourceObservation,
    pricePolicyQuote,
  });
}

function checkSelection(top, validate) {
  const current = normalizeObservation(top.observation);
  const supplied = record(top.quote, RECEIPT);
  const origin = normalizeObservation(supplied.sourceObservation);
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
