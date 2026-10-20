import { types as utilTypes } from 'node:util';
import { PlasmaStrategy } from './plasma-strategy.js';
import { snapshotZenonUserSendPolicyBinding } from './transaction-planner.js';
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
  validateDynamicPlasmaRequiredFusedPolicySelection,
} from './dynamic-plasma-required-fused-policy-adapter.js';

const CLASSIFY = classifyDynamicPlasmaCompatibility;
const CREATE_QUOTE = createDynamicPlasmaPricePolicyQuote;
const SELECT_FIELDS = selectDynamicPlasmaPricePolicyFields;
const CREATE_FOUR_FIELD = createDynamicPlasmaRequiredFusedPolicyQuote;
const SELECT_FOUR_FIELD = selectDynamicPlasmaRequiredFusedPolicyFields;
const VALIDATE_FOUR_FIELD = validateDynamicPlasmaRequiredFusedPolicySelection;
const SNAPSHOT_USER_SEND = snapshotZenonUserSendPolicyBinding;
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
const USER_SEND_CONTEXT_FIELDS = freeze([
  'phase', 'subject', 'paymentRequired', 'accepted', 'payerAddress',
  'compiledSporkIds', 'observation', 'policy', 'runtimeContextDigest',
]);
const USER_SEND_RECEIPT_FIELDS = freeze([
  'userSendPolicyQuoteVersion', 'scope', 'subjectDigest', 'intentDigest',
  'authority', 'afterSigningAction', 'sourceQuote',
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

  /**
   * Explicit declared UserSend pricing stage. Derive the subject binding from
   * actual supplied fields and the selected x402 intent rather than accepting
   * an opaque subjectDigest. These methods do not prepare/sign/publish a block.
   * The populated subject is not proof of account state, token validity, SDK
   * preparation, hash/nonce/work, signer state or payer/provider authority.
   */
  async quoteUserSend(context) {
    try {
      if (arguments.length !== 1) reject();
      const value = userSendContext(context);
      const sourceQuote = CREATE_FOUR_FIELD(value.adapterInput);
      requireSubjectAcknowledgement(value.binding, sourceQuote);
      return freeze({
        userSendPolicyQuoteVersion: 1, scope: 'DECLARED_USER_SEND_INTENT_PRICE_POLICY',
        subjectDigest: value.binding.subjectDigest, intentDigest: value.binding.intentDigest,
        authority: 'NONE', afterSigningAction: 'NONE', sourceQuote,
      });
    } catch { reject(); }
  }

  async applyUserSend(context, quote) {
    try {
      if (arguments.length !== 2) reject();
      const value = userSendContext(context);
      const sourceQuote = userSendQuote(quote, value.binding);
      requireSubjectAcknowledgement(value.binding, sourceQuote);
      return SELECT_FOUR_FIELD({ ...value.adapterInput, quote: sourceQuote });
    } catch { reject(); }
  }

  async validateUserSend(context, quote, selection) {
    try {
      if (arguments.length !== 3) reject();
      const value = userSendContext(context);
      const sourceQuote = userSendQuote(quote, value.binding);
      requireSubjectAcknowledgement(value.binding, sourceQuote);
      return VALIDATE_FOUR_FIELD({ ...value.adapterInput, quote: sourceQuote, selection });
    } catch { reject(); }
  }
}

function userSendContext(value) {
  const top = userSendRecord(value, USER_SEND_CONTEXT_FIELDS);
  if (top.phase !== 'UNSIGNED') reject();
  requireDigest(top.runtimeContextDigest);
  const binding = SNAPSHOT_USER_SEND({
    bindingVersion: 1, subject: top.subject,
    paymentRequired: top.paymentRequired, accepted: top.accepted,
    payerAddress: top.payerAddress, compiledSporkIds: top.compiledSporkIds,
  });
  return {
    binding,
    adapterInput: {
      requiredFusedPolicyVersion: 1, quoteRequestContextVersion: 1,
      subjectDigest: binding.subjectDigest, runtimeContextDigest: top.runtimeContextDigest,
      expectedQuoteRequestContext: binding.expectedQuoteRequestContext,
      observation: top.observation, policy: top.policy,
    },
  };
}

function userSendQuote(value, binding) {
  const quote = userSendRecord(value, USER_SEND_RECEIPT_FIELDS);
  if (quote.userSendPolicyQuoteVersion !== 1 || quote.scope !== 'DECLARED_USER_SEND_INTENT_PRICE_POLICY'
      || quote.subjectDigest !== binding.subjectDigest || quote.intentDigest !== binding.intentDigest
      || quote.authority !== 'NONE' || quote.afterSigningAction !== 'NONE') reject();
  return quote.sourceQuote;
}

function requireSubjectAcknowledgement(binding, quote) {
  // Descriptor reads remain guarded even when the outer receipt is hostile.
  const source = userSendData(quote, 'sourceObservation');
  const frontier = userSendData(source, 'beforeFrontier');
  const ack = binding.subject.momentumAcknowledged;
  if (userSendData(frontier, 'height') !== ack.height
      || userSendData(frontier, 'hash') !== ack.hash) reject();
}

function userSendData(value, field) {
  if (typeof value !== 'object' || value === null || isProxy(value)
      || getPrototypeOf(value) !== objectPrototype) reject();
  const d = getDescriptor(value, field);
  if (d === undefined || d.enumerable !== true || !hasOwn(d, 'value')) reject();
  return d.value;
}

function userSendRecord(value, fields) {
  if (typeof value !== 'object' || value === null || isProxy(value)
      || getPrototypeOf(value) !== objectPrototype || ownKeys(value).length !== fields.length) reject();
  const result = create(null);
  for (const field of fields) result[field] = userSendData(value, field);
  return result;
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
