import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';
import { SERVICE_CREDIT_MODEL_VERSION } from './service-credit-model.js';
import { EXPERIMENTAL_LIVE_NETWORK, snapshotActiveUpfrontRequirement } from './x402-wire.js';

const REQUIREMENT = snapshotActiveUpfrontRequirement;
const freeze = Object.freeze, create = Object.create, define = Object.defineProperty;
const descriptor = Object.getOwnPropertyDescriptor, prototype = Object.getPrototypeOf;
const ownKeys = Reflect.ownKeys, apply = Reflect.apply, hasOwn = Object.hasOwn;
const isProxy = utilTypes.isProxy, isSafeInteger = Number.isSafeInteger;
const byteLength = Buffer.byteLength, objectPrototype = Object.prototype, ErrorType = TypeError;
const test = Function.call.bind(RegExp.prototype.test);
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const COMMITMENT = /^sha256:[0-9a-f]{64}$/;
const AMOUNT = /^[1-9][0-9]{0,76}$/;
const OFFER = freeze(['modelVersion', 'providerId', 'serviceId', 'resourceId', 'resourceBinding',
  'offerId', 'offerVersion', 'costPolicyId', 'fundingPolicyId', 'fundingPolicyVersion']);
const SELECTION = freeze(['offerId', 'offerVersion', 'holderId', 'capabilityCommitment']);
const TERMS = freeze(['fundingPolicyId', 'fundingPolicyVersion', 'totalUnits', 'expiresAt', 'requirement']);
const REQUEST = freeze(['scheme', 'network', 'asset', 'amount', 'payTo', 'maxTimeoutSeconds', 'extra']);
const EXTRA = freeze(['paymentFlow', 'poc', 'settlement', 'zenonChain', 'minimumMomentumConfirmations']);
const CHAIN = freeze(['version', 'chainIdentifier', 'genesisMomentumHash']);

/**
 * Default-off PRIVILEGED fixed policy for the existing Zenon funding owner.
 * Exact configuration: {offer:<complete stored model-v1 offer>,
 * selection:<complete offer/holder/capability selection>, terms:<existing
 * five-field funding terms>}. ALL economics, including totalUnits, amount,
 * payee and absolute expiresAt, are required operator inputs: no defaults,
 * relative lifetime, pricing rule, wall-clock read or economic choice.
 *
 * Snapshot bounded descriptor DATA synchronously, reuse the existing active
 * upfront requirement validator, and return one frozen synchronous callable.
 * That callable accepts ONLY {offer,holderId,capabilityCommitment}, matches
 * every original offer field and both selected holder fields, then returns
 * the SAME detached deeply frozen terms. There is no per-call callback or
 * expiry refresh. Configuration never mutates or freezes caller records.
 *
 * This function becomes economic policy authority ONLY when privileged code
 * explicitly supplies it to the existing owner. Never expose its constructor,
 * configuration, raw store or activation capability to an untrusted client.
 * It does not authenticate operator configuration, pay/activate a grant,
 * create a challenge, verify evidence, sign, persist or start a service.
 * Existing owners STILL validate authority/chain/confirmation policy, actual
 * clock/expiry, resource binding, evidence and their commit lifecycle.
 *
 * Rotation/reconstruction is an operator governance boundary: changed terms
 * require a new funding-policy identity/version AND offer version. This
 * stateless module cannot enforce that across independently created policies,
 * prevent rollback, prove approval, or detect mislabeled configuration.
 * All returned requirements are declared DATA, not provider/node READY,
 * canonicality, finality, receipt, spendability or live-pilot evidence.
 *
 * Fixed key/count/string limits apply after upstream materialized-input
 * admission; Reflect.ownKeys cannot prebound an already enormous own-key set.
 * Captured intrinsics and unchanged imported validators remain premises,
 * not an OS memory/lifetime/cancellation or hostile-process sandbox.
 */
export function createFixedZenonFundingPolicy(options) {
  try {
    if (arguments.length !== 1 || new.target !== undefined) reject('configuration_rejected');
    const config = record(options, ['offer', 'selection', 'terms']);
    const fixedOffer = offer(config.offer), selected = selection(config.selection);
    if (selected.offerId !== fixedOffer.offerId || selected.offerVersion !== fixedOffer.offerVersion)
      reject('configuration_rejected');
    const fixedTerms = terms(config.terms, fixedOffer);
    const policy = function deriveFundingTerms(policyInput) {
      try {
        if (arguments.length !== 1 || new.target !== undefined) reject('input_rejected');
        const input = record(policyInput, ['offer', 'holderId', 'capabilityCommitment']);
        const currentOffer = offer(input.offer);
        for (const key of OFFER) if (currentOffer[key] !== fixedOffer[key]) reject('input_rejected');
        if (input.holderId !== selected.holderId || input.capabilityCommitment !== selected.capabilityCommitment)
          reject('input_rejected');
        return fixedTerms;
      } catch { reject('input_rejected'); }
    };
    return freeze(policy);
  } catch { reject('configuration_rejected'); }
}
function offer(value) {
  const captured = record(value, OFFER);
  if (captured.modelVersion !== SERVICE_CREDIT_MODEL_VERSION) reject();
  for (const key of ['providerId', 'serviceId', 'resourceId', 'offerId', 'costPolicyId', 'fundingPolicyId'])
    identifier(captured[key]);
  positive(captured.offerVersion); positive(captured.fundingPolicyVersion); commitment(captured.resourceBinding);
  return captured;
}
function selection(value) {
  const captured = record(value, SELECTION);
  identifier(captured.offerId); positive(captured.offerVersion);
  identifier(captured.holderId); commitment(captured.capabilityCommitment);
  return captured;
}
function terms(value, fixedOffer) {
  const captured = record(value, TERMS);
  if (captured.fundingPolicyId !== fixedOffer.fundingPolicyId
      || captured.fundingPolicyVersion !== fixedOffer.fundingPolicyVersion) reject();
  positive(captured.totalUnits); positive(captured.expiresAt);
  const root = record(captured.requirement, REQUEST), extra = record(root.extra, EXTRA);
  const chain = record(extra.zenonChain, CHAIN);
  for (const key of ['scheme', 'network', 'asset', 'amount', 'payTo']) text(root[key]);
  positive(root.maxTimeoutSeconds); identifier(root.asset); identifier(root.payTo);
  if (!test(AMOUNT, root.amount) || root.network !== EXPERIMENTAL_LIVE_NETWORK
      || extra.paymentFlow !== 'upfront' || extra.poc !== true || extra.settlement !== 'account-block'
      || !isSafeInteger(extra.minimumMomentumConfirmations)
      || extra.minimumMomentumConfirmations < 2 || extra.minimumMomentumConfirmations > 30
      || chain.version !== 1) reject();
  text(chain.chainIdentifier); text(chain.genesisMomentumHash);
  const privateExtra = sealed(EXTRA, extra, { zenonChain: chain });
  const privateRequirement = sealed(REQUEST, root, { extra: privateExtra });
  const checked = REQUIREMENT(privateRequirement);
  // No defaulting, dropped field, coercion or semantic normalization is used.
  for (const key of REQUEST) if (key !== 'extra' && checked[key] !== root[key]) reject();
  for (const key of EXTRA) if (key !== 'zenonChain' && checked.extra[key] !== extra[key]) reject();
  for (const key of CHAIN) if (checked.extra.zenonChain[key] !== chain[key]) reject();
  return sealed(TERMS, captured, { requirement: checked });
}
function record(value, fields) {
  if (value === null || typeof value !== 'object' || isProxy(value)
      || prototype(value) !== objectPrototype || ownKeys(value).length !== fields.length) reject();
  const captured = create(objectPrototype);
  for (const key of fields) {
    const d = descriptor(value, key);
    if (d === undefined || d.enumerable !== true || !hasOwn(d, 'value')) reject();
    put(captured, key, d.value);
  }
  return freeze(captured);
}
function sealed(fields, captured, overrides) {
  const value = create(objectPrototype);
  for (const key of fields) put(value, key, overrides && hasOwn(overrides, key) ? overrides[key] : captured[key]);
  return freeze(value);
}
function identifier(value) {
  if (typeof value !== 'string' || value.length > 128 || !test(ID, value)) reject();
}
function commitment(value) {
  if (typeof value !== 'string' || value.length !== 71 || !test(COMMITMENT, value)) reject();
}
function positive(value) { if (!isSafeInteger(value) || value <= 0) reject(); }
function text(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096
      || apply(byteLength, Buffer, [value, 'utf8']) > 4096) reject();
}
function put(value, key, content) {
  const d = create(null);
  d.value = content; d.enumerable = true; d.writable = false; d.configurable = false;
  define(value, key, d);
}
function reject(kind = 'input_rejected') {
  const code = 'service_credit_zenon_fixed_funding_policy_' + kind;
  const error = new ErrorType(code);
  put(error, 'code', code); put(error, 'stack', 'TypeError: ' + code);
  throw freeze(error);
}
