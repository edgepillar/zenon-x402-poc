import { types as utilTypes } from 'node:util';
import { PlasmaStrategy } from './plasma-strategy.js';
import {
  classifyDynamicPlasmaCompatibility,
} from './dynamic-plasma-compatibility.js';
import {
  createDynamicPlasmaPricePolicyQuote,
  selectDynamicPlasmaPricePolicyFields,
} from './dynamic-plasma-price-policy.js';
import {
  createDynamicPlasmaRequiredFusedPolicyQuote,
  selectDynamicPlasmaRequiredFusedPolicyFields,
} from './dynamic-plasma-required-fused-policy-adapter.js';

const CLASSIFY = classifyDynamicPlasmaCompatibility;
const CREATE_QUOTE = createDynamicPlasmaPricePolicyQuote;
const SELECT_FIELDS = selectDynamicPlasmaPricePolicyFields;
const CREATE_FOUR_FIELD = createDynamicPlasmaRequiredFusedPolicyQuote;
const SELECT_FOUR_FIELD = selectDynamicPlasmaRequiredFusedPolicyFields;
const ownKeys = Reflect.ownKeys;
const getDescriptor = Object.getOwnPropertyDescriptor;
const getPrototypeOf = Object.getPrototypeOf;
const hasOwn = Object.hasOwn;
const defineProperty = Object.defineProperty;
const freeze = Object.freeze;
const create = Object.create;
const isProxy = utilTypes.isProxy;
const apply = Reflect.apply;
const regexpTest = RegExp.prototype.test;
const objectPrototype = Object.prototype;
const TypeErrorConstructor = TypeError;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const CONTEXT_FIELDS = freeze([
  'phase', 'subjectDigest', 'runtimeContextDigest', 'observation', 'policy',
]);
const FOUR_FIELD_CONTEXT_FIELDS = freeze([
  ...CONTEXT_FIELDS, 'requiredFusedPolicyVersion',
]);
const REQUEST_BOUND_CONTEXT_FIELDS = freeze([
  ...FOUR_FIELD_CONTEXT_FIELDS, 'quoteRequestContextVersion', 'expectedQuoteRequestContext',
]);

/**
 * Opt-in declared-data policy only; active runtime selection is unchanged.
 * UNSIGNED is supplied metadata, not signer-state or consumed-authority proof.
 * apply() returns only unsigned Plasma fields, never a block or prepared bytes.
 * An own enumerable DATA requiredFusedPolicyVersion: 1 explicitly selects the
 * four-field adapter; absent means the unchanged three-field policy contract.
 * Tagged and untagged contexts/receipts cannot be mixed or silently downgraded.
 * Additional quoteRequestContextVersion: 1 forwards the raw schema3 collector
 * observation plus an independent declared expectedQuoteRequestContext to the
 * same adapter for quote/apply. That adapter rechecks the expectation before
 * policy use; equality does not establish RPC origin or a full block intent.
 * This connects the existing SPI only, not an active buyer or SDK preparer.
 */
export class BoundedDynamicPlasmaStrategy extends PlasmaStrategy {
  async quote(context) {
    if (arguments.length !== 1) reject();
    const value = snapshotContext(context);
    if (value.requiredFusedPolicyVersion === 1) {
      return CREATE_FOUR_FIELD(adapterContext(value));
    }
    const compatibility = CLASSIFY(value.observation);
    return CREATE_QUOTE({
      compatibility,
      policy: value.policy,
      subjectDigest: value.subjectDigest,
      runtimeContextDigest: value.runtimeContextDigest,
    });
  }

  async apply(context, quote) {
    if (arguments.length !== 2) reject();
    const value = snapshotContext(context);
    if (value.requiredFusedPolicyVersion === 1) {
      return SELECT_FOUR_FIELD({ ...adapterContext(value), quote });
    }
    const compatibility = CLASSIFY(value.observation);
    return SELECT_FIELDS({
      quote,
      compatibility,
      policy: value.policy,
      subjectDigest: value.subjectDigest,
      runtimeContextDigest: value.runtimeContextDigest,
    });
  }
}

function adapterContext(value) {
  const input = {
    requiredFusedPolicyVersion: 1,
    observation: value.observation,
    policy: value.policy,
    subjectDigest: value.subjectDigest,
    runtimeContextDigest: value.runtimeContextDigest,
  };
  if (value.quoteRequestContextVersion === 1) {
    input.quoteRequestContextVersion = 1;
    input.expectedQuoteRequestContext = value.expectedQuoteRequestContext;
  }
  return input;
}

function snapshotContext(value) {
  if (typeof value !== 'object' || value === null || isProxy(value)
      || getPrototypeOf(value) !== objectPrototype) reject();
  const tagged = getDescriptor(value, 'requiredFusedPolicyVersion') !== undefined;
  const requestBound = getDescriptor(value, 'quoteRequestContextVersion') !== undefined;
  const fields = requestBound ? REQUEST_BOUND_CONTEXT_FIELDS
    : tagged ? FOUR_FIELD_CONTEXT_FIELDS : CONTEXT_FIELDS;
  const keys = ownKeys(value);
  if (keys.length !== fields.length) reject();
  const result = create(null);
  for (let index = 0; index < fields.length; index++) {
    const field = fields[index];
    const descriptor = getDescriptor(value, field);
    if (descriptor === undefined || descriptor.enumerable !== true
        || !hasOwn(descriptor, 'value')) reject();
    result[field] = descriptor.value;
  }
  if (tagged && result.requiredFusedPolicyVersion !== 1) reject();
  if (requestBound && (result.requiredFusedPolicyVersion !== 1
      || result.quoteRequestContextVersion !== 1)) reject();
  if (result.phase !== 'UNSIGNED') reject();
  requireDigest(result.subjectDigest);
  requireDigest(result.runtimeContextDigest);
  return result;
}

function requireDigest(value) {
  if (typeof value !== 'string' || value.length !== 71
      || !apply(regexpTest, DIGEST, [value])) reject();
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
