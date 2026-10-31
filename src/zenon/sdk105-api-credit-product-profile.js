import { captureApiCreditPurchaseExpectation } from '../api-credit-purchase-expectation.js';
import { Buffer } from 'node:buffer';
import { createApiCreditRecordedServiceResultApplication } from '../api-credit-recorded-service-result.js';
import { types } from 'node:util';
import { canonicalJson } from '../canonical.js';
import { decodeB64Json, encodeB64Json, validateActiveUpfrontRequirement, validatePaymentRequiredForOfferSelection } from '../x402-wire.js';
import { captureSdk105ApiCreditSelection, captureSdk105NonDpApiCreditSelection } from './sdk105-api-credit-selection.js';
import { captureNativeFundingServiceOperationalConfiguration, captureNativeNonDpFundingServiceOperationalConfiguration } from './native-funding-service-configuration.js';
import { captureOriginalFundingSpendingFileProfile } from '../original-funding-spending-file-profile.js';
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
function fixedChallengePolicy(header) {
  const decoded = decodeB64Json(header, { maxEncodedBytes: 5464, maxDecodedBytes: 4096 });
  const challenge = snapshot(decoded); validatePaymentRequiredForOfferSelection(challenge);
  if (challenge.accepts.length !== 1 || encodeB64Json(decoded, { maxEncodedBytes: 5464 }) !== header) fail();
  const requirement = challenge.accepts[0]; validateActiveUpfrontRequirement(requirement);
  const challengeText = canonicalJson(challenge);
  const validateChallenge = F(function validateFixedProductChallenge(value) {
    if (arguments.length !== 1) fail();
    const detached = snapshot(value); validatePaymentRequiredForOfferSelection(detached);
    if (canonicalJson(detached) !== challengeText) fail();
  });
  return F({ challenge, requirement, challengeText, validateChallenge });
}
/** Complete keyless operational admission for the fixed operator bootstrap.
 * No placeholder key/day capability is used and no key method is entered.
 * These detached DATA and public CA bytes do not create a native selection. */
export function captureSdk105ApiCreditProductOperatorData(configuration) {
  if (arguments.length !== 1) fail();
  return captureProductOperatorData(configuration, false);
}
export function captureSdk105NonDpApiCreditProductOperatorData(configuration) {
  if (arguments.length !== 1) fail();
  return captureProductOperatorData(configuration, true);
}
function captureProductOperatorData(configuration, nonDp) {
  const c = fields(configuration, ['productProfileVersion', 'paymentRequiredHeader', 'purchaseExpectationJson', 'configuration', 'spendingFile', 'spending']);
  if (c.productProfileVersion !== 2) fail();
  const fixed = fixedChallengePolicy(c.paymentRequiredHeader), base = fields(c.configuration, ['storeOptions', 'fundingOptions', 'serviceOptions']);
  const f = fields(base.fundingOptions, nonDp
    ? ['readSessionOptions', 'expectedPublicKey', 'expectedAddress', 'deadlineMs', 'fundingTransportOptions']
    : ['readSessionOptions', 'materialOptions', 'materialWaitMs', 'expectedAddress', 'deadlineMs', 'fundingTransportOptions']);
  const { expectedAddress, ...fundingOptions } = f;
  const service = fields(base.serviceOptions, ['assetInfo', 'contextLimit', 'transportOptions', 'deadlineMs']);
  const admitted = (nonDp ? captureNativeNonDpFundingServiceOperationalConfiguration : captureNativeFundingServiceOperationalConfiguration)({ storeOptions: base.storeOptions, fundingOptions,
    serviceOptions: { official: { validateChallenge: fixed.validateChallenge, assetInfo: service.assetInfo, contextLimit: service.contextLimit },
      transportOptions: service.transportOptions, deadlineMs: service.deadlineMs } });
  const file = captureOriginalFundingSpendingFileProfile(c.spendingFile), policy = file.storageProfile.policy;
  const spending = fields(c.spending, ['paymentId']);
  if (typeof spending.paymentId !== 'string' || /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/.exec(spending.paymentId)?.[0] !== spending.paymentId
      || expectedAddress !== policy.accountId || admitted.serviceOptions.official.assetInfo.asset !== policy.asset) fail();
  const store = admitted.storeOptions, root = store.allowedRoot, requirement = fixed.requirement;
  if (file.allowedRoot === root || file.allowedRoot.startsWith(root + '/') || root.startsWith(file.allowedRoot + '/')
      || file.storageProfile.databasePath === store.databasePath || fixed.challenge.resource.url !== store.resourceUrl
      || policy.network !== requirement.network || policy.asset !== requirement.asset || policy.recipients.length !== 1
      || policy.recipients[0] !== requirement.payTo || BigInt(requirement.amount) > BigInt(policy.maxPayment)
      || store.custodyPolicy.maxRequests < 100 || admitted.serviceOptions.transportOptions.maxRequestStarts < 100) fail();
  // Funding POST has its separate one-start transport. An exact recorded
  // service replay reads the same V6 history and allocates no new wire request.
  // The minimum service wire/custody budget therefore covers 100 distinct calls.
  const purchase = captureApiCreditPurchaseExpectation(c.purchaseExpectationJson, c.paymentRequiredHeader, store.resourceUrl);
  if (purchase.holderId !== expectedAddress || admitted.serviceOptions.transportOptions.ca.toString('base64').length > 8192) fail();
  const profile = F({ productProfileVersion: 2, purchase, fundingResourceUrl: store.resourceUrl,
    serviceResourceUrl: store.custodyPolicy.serviceResourceUrl, network: requirement.network, asset: requirement.asset,
    recipient: requirement.payTo, amount: requirement.amount, providerAuthentication: 'NOT_ESTABLISHED', nativeAcceptance: 'NOT_ESTABLISHED' });
  PROFILES.set(profile, F({ header: c.paymentRequiredHeader, challengeText: fixed.challengeText, nonDp }));
  return F({ configuration: admitted, walletIdentity: F({ expectedAddress, expectedPublicKey: nonDp ? admitted.fundingOptions.expectedPublicKey : admitted.fundingOptions.materialOptions.publicKey }),
    spendingFile: file, spending: F(spending), purchaseExpectationJson: c.purchaseExpectationJson, profile });
}
/** One fixed product selection with an exclusive EXISTING key and day reader.
 * The same keyless admission is used before operator credential acquisition. */
export function captureSdk105ApiCreditProductSelection(configuration) {
  if (arguments.length !== 1) fail();
  return captureProductSelection(configuration, false);
}
export function captureSdk105NonDpApiCreditProductSelection(configuration) {
  if (arguments.length !== 1) fail();
  return captureProductSelection(configuration, true);
}
function captureProductSelection(configuration, nonDp) {
  const c = fields(configuration, ['productProfileVersion', 'paymentRequiredHeader', 'purchaseExpectationJson', 'configuration', 'spendingFile', 'spending']);
  const base = fields(c.configuration, ['storeOptions', 'fundingOptions', 'serviceOptions']);
  const f = fields(base.fundingOptions, nonDp
    ? ['readSessionOptions', 'expectedPublicKey', 'keyPair', 'expectedAddress', 'deadlineMs', 'fundingTransportOptions']
    : ['readSessionOptions', 'materialOptions', 'materialWaitMs', 'keyPair', 'expectedAddress', 'deadlineMs', 'fundingTransportOptions']);
  const { keyPair, ...fundingOptions } = f, spending = fields(c.spending, ['paymentId', 'readDay']);
  const admitted = captureProductOperatorData({ ...c, configuration: { ...base, fundingOptions }, spending: { paymentId: spending.paymentId } }, nonDp);
  let selected = null;
  try {
    selected = (nonDp ? captureSdk105NonDpApiCreditSelection : captureSdk105ApiCreditSelection)({ configuration: { ...admitted.configuration,
      fundingOptions: { ...admitted.configuration.fundingOptions, keyPair, expectedAddress: admitted.walletIdentity.expectedAddress } },
      spendingFile: { storageProfile: admitted.spendingFile.storageProfile, allowedRoot: admitted.spendingFile.allowedRoot, filePolicy: admitted.spendingFile.filePolicy }, spending });
    const state = { selected, profile: admitted.profile, consumed: false, released: false, nonDp };
    const release = F(function release() { if (arguments.length !== 0) fail(); if (!state.released) { state.released = true; selected.release(); } });
    const out = F({ configuration: selected.configuration, spendingFile: selected.spendingFile, spending: selected.spending, profile: admitted.profile, release });
    SELECTED.set(out, state); return out;
  } catch { if (selected !== null) selected.release(); fail(); }
}
/** Internal native launcher preflight; this lookup never consumes or refunds
 * the one-use selection which the actual application must later consume. */
export function assertSdk105ApiCreditProductSelection(selection) {
  if (arguments.length !== 1 || selection === null || typeof selection !== 'object' || types.isProxy(selection)) fail();
  return assertProductSelection(selection, false);
}
export function assertSdk105NonDpApiCreditProductSelection(selection) {
  if (arguments.length !== 1 || selection === null || typeof selection !== 'object' || types.isProxy(selection)) fail();
  return assertProductSelection(selection, true);
}
function assertProductSelection(selection, nonDp) {
  const state = SELECTED.get(selection); if (!state || state.nonDp !== nonDp || state.consumed || state.released) fail(); return selection;
}
export function consumeSdk105ApiCreditProductSelection(selection) {
  if (arguments.length !== 1 || selection === null || typeof selection !== 'object' || types.isProxy(selection)) fail();
  return consumeProductSelection(selection, false);
}
export function consumeSdk105NonDpApiCreditProductSelection(selection) {
  if (arguments.length !== 1 || selection === null || typeof selection !== 'object' || types.isProxy(selection)) fail();
  return consumeProductSelection(selection, true);
}
function consumeProductSelection(selection, nonDp) {
  const state = SELECTED.get(selection); if (!state || state.nonDp !== nonDp || state.consumed || state.released) fail();
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

/** The native product supplies only its same already-owned V6 history reader.
 * The legacy product binding remains a void callback component selection. */
export function bindSdk105ApiCreditProductLifecycleWithRecordedResults(application, profile, readState) {
  if (arguments.length !== 3 || profile === null || typeof profile !== 'object' || types.isProxy(profile)
      || !PROFILES.has(profile)) fail();
  return createApiCreditRecordedServiceResultApplication({ application: bindSdk105ApiCreditProductLifecycle(application, profile),
    readState, fundingResourceUrl: profile.fundingResourceUrl, serviceResourceUrl: profile.serviceResourceUrl, network: profile.network });
}
