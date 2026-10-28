import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { canonicalJson } from '../canonical.js';
import { decodeB64Json, encodeB64Json, validateActiveUpfrontRequirement, validatePaymentRequiredForOfferSelection } from '../x402-wire.js';
import { captureSdk105ApiCreditSelection } from './sdk105-api-credit-selection.js';
import { captureZenonDynamicPlasmaFundingPostPreparationInput } from './dynamic-plasma-funding-post-preparation-input.js';

const F = Object.freeze, DESC = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn;
const SELECTED = new WeakMap(), PROFILES = new WeakMap();
const OPERATIONS = ['prepareOriginalFunding', 'commitOriginalFunding', 'submitOriginalFunding', 'handoffToService', 'submitOriginal'];
function fail() { const e = new TypeError('SDK105_API_CREDIT_PRODUCT_PROFILE'); Object.defineProperty(e, 'stack', { value: e.message }); throw F(e); }
function fields(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== names.length) fail();
  const out = {};
  for (const name of names) { const d = DESC(value, name); if (!d?.enumerable || !OWN(d, 'value')) fail(); out[name] = d.value; }
  return out;
}
function snapshot(value, depth = 0, budget = { nodes: 256, bytes: 4096 }) {
  if (--budget.nodes < 0 || depth > 8) fail();
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') { if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail(); return value; }
  if (typeof value === 'string') { budget.bytes -= Buffer.byteLength(value); if (budget.bytes < 0) fail(); return value; }
  if (typeof value !== 'object' || types.isProxy(value)) fail();
  const array = Array.isArray(value), proto = Object.getPrototypeOf(value), names = Reflect.ownKeys(value);
  if (proto !== (array ? Array.prototype : Object.prototype) || names.length > 64) fail();
  if (array) {
    const d = DESC(value, 'length'); if (!d || !Number.isSafeInteger(d.value) || d.value > 16 || names.length !== d.value + 1) fail();
    const out = [];
    for (let i = 0; i < d.value; i++) { const item = DESC(value, String(i)); if (!item?.enumerable || !OWN(item, 'value')) fail(); out.push(snapshot(item.value, depth + 1, budget)); }
    return F(out);
  }
  const out = {};
  for (const name of names) {
    const d = DESC(value, name); if (typeof name !== 'string' || !d?.enumerable || !OWN(d, 'value')) fail();
    budget.bytes -= Buffer.byteLength(name); if (budget.bytes < 0) fail();
    Object.defineProperty(out, name, { value: snapshot(d.value, depth + 1, budget), enumerable: true });
  }
  return F(out);
}
/** One declared provider origin, funding offer, network, asset and recipient.
 * The only operational inputs remain an exclusive EXISTING key and day reader.
 * No caller-supplied challenge callback, module, key loader or default exists.
 * Schema/equality checks neither authenticate that provider nor authorize work. */
export function captureSdk105ApiCreditProductSelection(configuration) {
  if (arguments.length !== 1) fail();
  const c = fields(configuration, ['productProfileVersion', 'paymentRequiredHeader', 'configuration', 'spendingFile', 'spending']);
  if (c.productProfileVersion !== 1) fail();
  const header = c.paymentRequiredHeader;
  const decoded = decodeB64Json(header, { maxEncodedBytes: 5464, maxDecodedBytes: 4096 });
  const challenge = snapshot(decoded); validatePaymentRequiredForOfferSelection(challenge);
  if (challenge.accepts.length !== 1 || encodeB64Json(decoded, { maxEncodedBytes: 5464 }) !== header) fail();
  const requirement = challenge.accepts[0]; validateActiveUpfrontRequirement(requirement);
  const challengeText = canonicalJson(challenge);
  const fixedChallenge = F(function validateFixedProductChallenge(value) {
    if (arguments.length !== 1) fail();
    const detached = snapshot(value); validatePaymentRequiredForOfferSelection(detached);
    if (canonicalJson(detached) !== challengeText) fail();
  });
  const base = fields(c.configuration, ['storeOptions', 'fundingOptions', 'serviceOptions']);
  const service = fields(base.serviceOptions, ['assetInfo', 'contextLimit', 'transportOptions', 'deadlineMs']);
  let selected = null;
  try {
    selected = captureSdk105ApiCreditSelection({ configuration: { ...base, serviceOptions: {
      official: { validateChallenge: fixedChallenge, assetInfo: service.assetInfo, contextLimit: service.contextLimit },
      transportOptions: service.transportOptions, deadlineMs: service.deadlineMs } }, spendingFile: c.spendingFile, spending: c.spending });
    const policy = selected.spending.policy, store = selected.configuration.storeOptions;
    if (challenge.resource.url !== store.resourceUrl || policy.network !== requirement.network || policy.asset !== requirement.asset
        || policy.recipients.length !== 1 || policy.recipients[0] !== requirement.payTo || BigInt(requirement.amount) > BigInt(policy.maxPayment)
        || store.custodyPolicy.maxRequests < 100 || selected.configuration.serviceOptions.transportOptions.maxRequestStarts < 101) fail();
    const profile = F({ productProfileVersion: 1, fundingResourceUrl: store.resourceUrl,
      serviceResourceUrl: store.custodyPolicy.serviceResourceUrl, network: requirement.network, asset: requirement.asset,
      recipient: requirement.payTo, amount: requirement.amount, providerAuthentication: 'NOT_ESTABLISHED', nativeAcceptance: 'NOT_ESTABLISHED' });
    PROFILES.set(profile, F({ header, challengeText }));
    const state = { selected, profile, consumed: false, released: false };
    const release = F(function release() { if (arguments.length !== 0) fail(); if (!state.released) { state.released = true; selected.release(); } });
    const out = F({ configuration: selected.configuration, spendingFile: selected.spendingFile, spending: selected.spending, profile, release });
    SELECTED.set(out, state); return out;
  } catch { if (selected !== null) selected.release(); fail(); }
}
export function consumeSdk105ApiCreditProductSelection(selection) {
  if (arguments.length !== 1 || selection === null || typeof selection !== 'object' || types.isProxy(selection)) fail();
  const state = SELECTED.get(selection); if (!state || state.consumed || state.released) fail();
  state.consumed = true; return F({ selection: state.selected, profile: state.profile });
}
/** Gate the ACTUAL application's preparation before its spending reservation
 * and signer/read work. The child still owns all ambiguity, original-only
 * transitions, method results and close. No new journal or retry state exists. */
export function bindSdk105ApiCreditProductLifecycle(application, profile) {
  if (arguments.length !== 2 || profile === null || typeof profile !== 'object' || types.isProxy(profile)) fail();
  const fixed = PROFILES.get(profile); if (!fixed) fail();
  const child = fields(application, [...OPERATIONS, 'inspect', 'close']);
  if (!Object.isFrozen(application)) fail();
  for (const name of [...OPERATIONS, 'inspect', 'close']) if (typeof child[name] !== 'function' || types.isProxy(child[name]) || !Object.isFrozen(child[name])) fail();
  const out = {};
  for (const name of OPERATIONS) out[name] = F(function operation(input) {
    if (arguments.length !== 1) return Promise.reject(new TypeError('SDK105_API_CREDIT_PRODUCT_INPUT'));
    try {
      if (name === 'prepareOriginalFunding') {
        const selected = captureZenonDynamicPlasmaFundingPostPreparationInput(input, profile.fundingResourceUrl);
        if (selected.challenge.paymentRequiredHeader !== fixed.header || canonicalJson(selected.challenge.paymentRequired) !== fixed.challengeText) fail();
        return Reflect.apply(child[name], application, [selected]);
      }
      if (name === 'handoffToService') {
        if (input === null || typeof input !== 'object' || types.isProxy(input) || Object.getPrototypeOf(input) !== Object.prototype) fail();
        const d = DESC(input, 'paymentRequiredHeader'); if (!d?.enumerable || !OWN(d, 'value') || d.value !== fixed.header) fail();
      }
      return Reflect.apply(child[name], application, [input]);
    } catch { return Promise.reject(new TypeError('SDK105_API_CREDIT_PRODUCT_INPUT')); }
  });
  out.inspect = F(function inspect() { if (arguments.length !== 0) fail(); return Reflect.apply(child.inspect, application, []); });
  out.close = F(function close() { if (arguments.length !== 0) return Promise.reject(new TypeError('SDK105_API_CREDIT_PRODUCT_INPUT')); return Reflect.apply(child.close, application, []); });
  return F(out);
}
