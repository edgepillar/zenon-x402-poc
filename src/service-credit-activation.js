import { createHash } from 'node:crypto';
import { types as utilTypes } from 'node:util';

import { paymentIntentDigest, sha256Hex } from './canonical.js';
import {
  SERVICE_CREDIT_ACTIVATION_VERSION,
  SERVICE_CREDIT_MODEL_VERSION,
} from './service-credit-model.js';
import {
  MOCK_NETWORK,
  MOCK_ZENON_CHAIN_PROFILE,
  sameRequirements,
  snapshotActiveUpfrontRequirement,
  validatePaymentPayloadEnvelope,
  validatePaymentRequired,
} from './x402-wire.js';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256_COMMITMENT = /^sha256:[0-9a-f]{64}$/;
const LOWERCASE_HASH = /^[0-9a-f]{64}$/;
const FUNDING_TAG = 'x402-service-credit-funding-v1';
const MAX_INPUT_BYTES = 64 * 1024;
const MAX_DEPTH = 16;
const MAX_ARRAY_LENGTH = 32;
const RESOURCE_BINDING_DOMAIN = 'zenon-x402-service-credit-resource-binding-v1';
const FUNDING_COMMITMENT_DOMAIN = 'zenon-x402-service-credit-grant-funding-v1';
const REQUIREMENT_DIGEST_DOMAIN = 'zenon-x402-service-credit-payment-requirement-v1';
const RESOURCE_DIGEST_DOMAIN = 'zenon-x402-service-credit-payment-resource-v1';
const AUTHORITY_SETTLEMENT_DOMAIN = 'zenon-x402-service-credit-source-settlement-v1';
const MOCK_TRANSACTION_FIELDS = Object.freeze([
  'blockType',
  'chainIdentifier',
  'address',
  'toAddress',
  'amount',
  'tokenStandard',
  'data',
  'nonce',
  'publicKey',
  'signature',
  'hash',
]);

export class ServiceCreditActivationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ServiceCreditActivationError';
    this.code = code;
    this.stack = `ServiceCreditActivationError: ${code}`;
  }
}

function activationFailure(code) {
  return new ServiceCreditActivationError(code);
}

function failConfiguration() {
  throw activationFailure('SERVICE_CREDIT_ACTIVATION_INVALID_CONFIGURATION');
}

function failInput() {
  throw activationFailure('SERVICE_CREDIT_ACTIVATION_INVALID_INPUT');
}

function failRejected() {
  throw activationFailure('SERVICE_CREDIT_ACTIVATION_REJECTED');
}

function exactDataObject(value, keys, failure = failInput) {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || Array.isArray(value)
      || utilTypes.isProxy(value)
      || Reflect.getPrototypeOf(value) !== Object.prototype
    ) {
      failure();
    }
    const observed = Reflect.ownKeys(value);
    if (
      observed.length !== keys.length
      || observed.some(key => typeof key !== 'string' || !keys.includes(key))
    ) {
      failure();
    }
    const result = Object.create(null);
    for (const key of keys) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) failure();
      result[key] = descriptor.value;
    }
    return result;
  } catch (error) {
    if (error instanceof ServiceCreditActivationError) throw error;
    failure();
  }
}

function assertIdentifier(value) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value) || value.includes('://')) failInput();
}

function assertPositiveInteger(value) {
  if (!Number.isSafeInteger(value) || value <= 0) failInput();
}

function assertCommitment(value) {
  if (typeof value !== 'string' || !SHA256_COMMITMENT.test(value)) failInput();
}

function copyJson(value, depth = 0) {
  if (depth > MAX_DEPTH) failInput();
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) failInput();
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== 'object' || utilTypes.isProxy(value)) failInput();
  const prototype = Reflect.getPrototypeOf(value);
  const keys = Reflect.ownKeys(value);
  if (Array.isArray(value)) {
    const length = Reflect.getOwnPropertyDescriptor(value, 'length');
    if (
      prototype !== Array.prototype
      || !length
      || length.enumerable
      || !Object.hasOwn(length, 'value')
      || !Number.isSafeInteger(length.value)
      || length.value < 0
      || length.value > MAX_ARRAY_LENGTH
      || keys.length !== length.value + 1
      || keys.at(-1) !== 'length'
    ) {
      failInput();
    }
    const copy = [];
    for (let index = 0; index < length.value; index += 1) {
      if (keys[index] !== String(index)) failInput();
      const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) failInput();
      copy.push(copyJson(descriptor.value, depth + 1));
    }
    return copy;
  }
  if (prototype !== Object.prototype) failInput();
  const copy = {};
  for (const key of keys) {
    if (typeof key !== 'string') failInput();
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') failInput();
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) failInput();
    copy[key] = copyJson(descriptor.value, depth + 1);
  }
  return copy;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function snapshotJson(value) {
  const copy = copyJson(value);
  if (Buffer.byteLength(canonicalJson(copy), 'utf8') > MAX_INPUT_BYTES) failInput();
  return deepFreeze(copy);
}

function commitment(domain, value) {
  return `sha256:${createHash('sha256')
    .update(Buffer.from(`${domain}\0`, 'ascii'))
    .update(Buffer.from(canonicalJson(value), 'utf8'))
    .digest('hex')}`;
}

function normalizeAuthority(input) {
  const value = exactDataObject(input, [
    'profileId',
    'profileVersion',
    'verifierVersion',
    'recordDigest',
  ], failConfiguration);
  try {
    assertIdentifier(value.profileId);
    assertPositiveInteger(value.profileVersion);
    assertPositiveInteger(value.verifierVersion);
    assertCommitment(value.recordDigest);
  } catch {
    failConfiguration();
  }
  return deepFreeze({
    profileId: value.profileId,
    profileVersion: value.profileVersion,
    verifierVersion: value.verifierVersion,
    recordDigest: value.recordDigest,
  });
}

function normalizeIntent(input) {
  const value = exactDataObject(input, [
    'modelVersion',
    'activationVersion',
    'providerId',
    'serviceId',
    'resourceId',
    'offerId',
    'offerVersion',
    'holderId',
    'capabilityCommitment',
    'totalUnits',
    'expiresAt',
  ]);
  if (
    value.modelVersion !== SERVICE_CREDIT_MODEL_VERSION
    || value.activationVersion !== SERVICE_CREDIT_ACTIVATION_VERSION
  ) {
    failInput();
  }
  for (const identifier of [
    value.providerId,
    value.serviceId,
    value.resourceId,
    value.offerId,
    value.holderId,
  ]) {
    assertIdentifier(identifier);
  }
  assertPositiveInteger(value.offerVersion);
  assertCommitment(value.capabilityCommitment);
  assertPositiveInteger(value.totalUnits);
  assertPositiveInteger(value.expiresAt);
  return deepFreeze({
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    activationVersion: SERVICE_CREDIT_ACTIVATION_VERSION,
    providerId: value.providerId,
    serviceId: value.serviceId,
    resourceId: value.resourceId,
    offerId: value.offerId,
    offerVersion: value.offerVersion,
    holderId: value.holderId,
    capabilityCommitment: value.capabilityCommitment,
    totalUnits: value.totalUnits,
    expiresAt: value.expiresAt,
  });
}

function normalizeOffer(value, intent) {
  const offer = exactDataObject(value, [
    'modelVersion',
    'providerId',
    'serviceId',
    'resourceId',
    'resourceBinding',
    'offerId',
    'offerVersion',
    'costPolicyId',
    'fundingPolicyId',
    'fundingPolicyVersion',
  ]);
  if (
    offer.modelVersion !== SERVICE_CREDIT_MODEL_VERSION
    || offer.providerId !== intent.providerId
    || offer.serviceId !== intent.serviceId
    || offer.resourceId !== intent.resourceId
    || offer.offerId !== intent.offerId
    || offer.offerVersion !== intent.offerVersion
  ) {
    failRejected();
  }
  assertCommitment(offer.resourceBinding);
  assertIdentifier(offer.costPolicyId);
  assertIdentifier(offer.fundingPolicyId);
  assertPositiveInteger(offer.fundingPolicyVersion);
  return deepFreeze({ ...offer });
}

function snapshotRequirement(input) {
  try {
    const requirement = snapshotJson(input);
    const normalized = snapshotActiveUpfrontRequirement(requirement);
    if (
      normalized.scheme !== 'exact'
      || normalized.network !== MOCK_NETWORK
      || normalized.extra.paymentFlow !== 'upfront'
      || normalized.extra.poc !== true
      || normalized.extra.settlement !== 'account-block'
      || Object.hasOwn(normalized.extra, 'minimumMomentumConfirmations')
      || canonicalJson(normalized.extra.zenonChain) !== canonicalJson(MOCK_ZENON_CHAIN_PROFILE)
    ) {
      failRejected();
    }
    return snapshotJson(normalized);
  } catch (error) {
    if (error instanceof ServiceCreditActivationError) throw error;
    failRejected();
  }
}

function resourceBinding(resourceId, resourceUrl) {
  if (typeof resourceUrl !== 'string' || resourceUrl.length === 0 || resourceUrl.length > 4096) {
    failInput();
  }
  let parsed;
  try {
    parsed = new URL(resourceUrl);
  } catch {
    failInput();
  }
  if (
    (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
    || parsed.username
    || parsed.password
    || parsed.href !== resourceUrl
  ) {
    failInput();
  }
  return commitment(RESOURCE_BINDING_DOMAIN, { resourceId, resourceUrl });
}

function fundingCommitment(authority, offer, intent, requirement) {
  return commitment(FUNDING_COMMITMENT_DOMAIN, {
    modelVersion: intent.modelVersion,
    activationVersion: SERVICE_CREDIT_ACTIVATION_VERSION,
    authorityProfileId: authority.profileId,
    authorityProfileVersion: authority.profileVersion,
    verifierVersion: authority.verifierVersion,
    authorityRecordDigest: authority.recordDigest,
    fundingPolicyId: offer.fundingPolicyId,
    fundingPolicyVersion: offer.fundingPolicyVersion,
    costPolicyId: offer.costPolicyId,
    providerId: intent.providerId,
    serviceId: intent.serviceId,
    resourceId: intent.resourceId,
    resourceBinding: offer.resourceBinding,
    offerId: intent.offerId,
    offerVersion: intent.offerVersion,
    holderId: intent.holderId,
    capabilityCommitment: intent.capabilityCommitment,
    totalUnits: intent.totalUnits,
    expiresAt: intent.expiresAt,
    scheme: requirement.scheme,
    paymentFlow: requirement.extra.paymentFlow,
    settlement: requirement.extra.settlement,
    poc: requirement.extra.poc,
    maxTimeoutSeconds: requirement.maxTimeoutSeconds,
    network: requirement.network,
    chainProfile: requirement.extra.zenonChain,
    asset: requirement.asset,
    amount: requirement.amount,
    payee: requirement.payTo,
  });
}

function fundingResource(resourceUrl, funding) {
  const hex = funding.slice('sha256:'.length);
  return deepFreeze({
    url: resourceUrl,
    tags: [FUNDING_TAG, hex.slice(0, 32), hex.slice(32)],
  });
}

function assertFundingResource(resource, resourceId, expectedBinding, expectedFunding) {
  const value = exactDataObject(resource, ['url', 'tags']);
  if (
    resourceBinding(resourceId, value.url) !== expectedBinding
    || !Array.isArray(value.tags)
    || utilTypes.isProxy(value.tags)
    || Reflect.getPrototypeOf(value.tags) !== Array.prototype
    || value.tags.length !== 3
    || value.tags[0] !== FUNDING_TAG
    || value.tags[1] !== expectedFunding.slice(7, 39)
    || value.tags[2] !== expectedFunding.slice(39)
  ) {
    failRejected();
  }
}

function inspectTransaction(paymentPayload) {
  const payload = exactDataObject(paymentPayload.payload, ['transaction', 'intentDigest']);
  const transaction = exactDataObject(payload.transaction, MOCK_TRANSACTION_FIELDS);
  if (
    transaction.blockType !== 2
    || !Number.isSafeInteger(transaction.chainIdentifier)
    || transaction.chainIdentifier !== Number(MOCK_ZENON_CHAIN_PROFILE.chainIdentifier)
    || typeof transaction.address !== 'string'
    || !IDENTIFIER.test(transaction.address)
    || typeof transaction.toAddress !== 'string'
    || !IDENTIFIER.test(transaction.toAddress)
    || typeof transaction.amount !== 'string'
    || typeof transaction.tokenStandard !== 'string'
    || !LOWERCASE_HASH.test(transaction.data ?? '')
    || !LOWERCASE_HASH.test(transaction.hash ?? '')
    || typeof transaction.nonce !== 'string'
    || transaction.nonce.length !== 16
    || typeof transaction.publicKey !== 'string'
    || transaction.publicKey.length > 256
    || typeof transaction.signature !== 'string'
    || transaction.signature.length > 256
  ) {
    failRejected();
  }
  return { intentDigest: payload.intentDigest, transaction };
}

function captureEvidence(input) {
  try {
    if (
      input === null
      || typeof input !== 'object'
      || Array.isArray(input)
      || utilTypes.isProxy(input)
      || Reflect.getPrototypeOf(input) !== Object.prototype
    ) {
      failRejected();
    }
    const expected = [
      'success', 'network', 'transaction', 'payer', 'state', 'authorizationKey', 'deliveryState',
    ];
    const keys = Reflect.ownKeys(input);
    const enumerableKeys = [];
    for (const key of keys) {
      if (typeof key !== 'string') failRejected();
      const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) failRejected();
      if (key === 'then') {
        if (descriptor.enumerable || descriptor.value !== undefined) failRejected();
      } else {
        if (!descriptor.enumerable) failRejected();
        enumerableKeys.push(key);
      }
    }
    if (
      enumerableKeys.length !== expected.length
      || enumerableKeys.some(key => !expected.includes(key))
    ) {
      failRejected();
    }
    return Object.fromEntries(expected.map(key => [key, Reflect.getOwnPropertyDescriptor(input, key).value]));
  } catch (error) {
    if (error instanceof ServiceCreditActivationError) throw error;
    failRejected();
  }
}

function errorCode(error) {
  try {
    const descriptor = Reflect.getOwnPropertyDescriptor(error, 'code');
    return descriptor && Object.hasOwn(descriptor, 'value') && typeof descriptor.value === 'string'
      ? descriptor.value
      : null;
  } catch {
    return null;
  }
}

/**
 * Inactive mock-only boundary from one exact payer-signed funding settlement to
 * one durable service-credit activation. It accepts no per-request authority,
 * attestation flag, callback, signing material, or live-network evidence.
 */
export class MockServiceCreditActivation {
  #store;
  #getOffer;
  #activateGrantFromTrustedRecord;
  #verifySettlement;
  #authority;
  #now;

  constructor(options) {
    const value = exactDataObject(options, [
      'store',
      'verifySettlement',
      'authorityProfile',
      'now',
    ], failConfiguration);
    if (value.store === null || typeof value.store !== 'object') {
      failConfiguration();
    }
    let getOffer;
    let activateGrantFromTrustedRecord;
    try {
      getOffer = value.store.getOffer;
      activateGrantFromTrustedRecord = value.store.activateGrantFromTrustedRecord;
    } catch {
      failConfiguration();
    }
    if (
      typeof getOffer !== 'function'
      || typeof activateGrantFromTrustedRecord !== 'function'
      || typeof value.verifySettlement !== 'function'
      || typeof value.now !== 'function'
    ) {
      failConfiguration();
    }
    this.#store = value.store;
    this.#getOffer = getOffer;
    this.#activateGrantFromTrustedRecord = activateGrantFromTrustedRecord;
    this.#verifySettlement = value.verifySettlement;
    this.#authority = normalizeAuthority(value.authorityProfile);
    this.#now = value.now;
  }

  createFundingResource(input) {
    const value = exactDataObject(input, ['intent', 'requirement', 'resourceUrl']);
    const intent = normalizeIntent(value.intent);
    const requirement = snapshotRequirement(value.requirement);
    let offer;
    try {
      offer = Reflect.apply(this.#getOffer, this.#store, [{
        offerId: intent.offerId,
        offerVersion: intent.offerVersion,
      }]);
    } catch {
      failRejected();
    }
    if (offer === null) failRejected();
    const normalizedOffer = normalizeOffer(offer, intent);
    if (resourceBinding(intent.resourceId, value.resourceUrl) !== normalizedOffer.resourceBinding) {
      failRejected();
    }
    const funding = fundingCommitment(this.#authority, normalizedOffer, intent, requirement);
    return deepFreeze({
      fundingCommitment: funding,
      resource: fundingResource(value.resourceUrl, funding),
    });
  }

  async activate(input) {
    const value = exactDataObject(input, ['intent', 'paymentRequired', 'paymentPayload']);
    const intent = normalizeIntent(value.intent);
    exactDataObject(value.paymentRequired, ['x402Version', 'resource', 'accepts']);
    exactDataObject(value.paymentPayload, ['x402Version', 'resource', 'accepted', 'payload']);
    const paymentRequired = snapshotJson(value.paymentRequired);
    const paymentPayload = snapshotJson(value.paymentPayload);
    try {
      validatePaymentRequired(paymentRequired);
      validatePaymentPayloadEnvelope(paymentPayload);
    } catch {
      failRejected();
    }
    if (
      paymentRequired.accepts.length !== 1
      || paymentPayload.x402Version !== paymentRequired.x402Version
      || !sameRequirements(paymentPayload.accepted, paymentRequired.accepts[0])
      || canonicalJson(paymentPayload.resource) !== canonicalJson(paymentRequired.resource)
    ) {
      failRejected();
    }

    const requirement = snapshotRequirement(paymentRequired.accepts[0]);
    let offer;
    try {
      offer = Reflect.apply(this.#getOffer, this.#store, [{
        offerId: intent.offerId,
        offerVersion: intent.offerVersion,
      }]);
    } catch {
      failRejected();
    }
    if (offer === null) failRejected();
    const normalizedOffer = normalizeOffer(offer, intent);
    const expectedFunding = fundingCommitment(
      this.#authority,
      normalizedOffer,
      intent,
      requirement,
    );
    assertFundingResource(
      paymentRequired.resource,
      intent.resourceId,
      normalizedOffer.resourceBinding,
      expectedFunding,
    );
    const inspected = inspectTransaction(paymentPayload);
    const expectedIntentDigest = paymentIntentDigest(paymentRequired, requirement);
    if (
      inspected.intentDigest !== expectedIntentDigest
      || inspected.transaction.data !== expectedIntentDigest
      || inspected.transaction.toAddress !== requirement.payTo
      || inspected.transaction.amount !== requirement.amount
      || inspected.transaction.tokenStandard !== requirement.asset
      || inspected.transaction.address !== intent.holderId
    ) {
      failRejected();
    }

    let beforeVerification;
    try {
      beforeVerification = Reflect.apply(this.#now, undefined, []);
    } catch {
      throw activationFailure('SERVICE_CREDIT_ACTIVATION_CLOCK_FAILED');
    }
    if (!Number.isSafeInteger(beforeVerification) || beforeVerification < 0) {
      throw activationFailure('SERVICE_CREDIT_ACTIVATION_CLOCK_FAILED');
    }
    if (intent.expiresAt <= beforeVerification) failRejected();

    let verificationPromise;
    try {
      verificationPromise = Reflect.apply(this.#verifySettlement, undefined, [
        paymentPayload,
        requirement,
        paymentRequired,
      ]);
    } catch {
      failRejected();
    }
    if (!utilTypes.isPromise(verificationPromise)) failRejected();
    let evidenceInput;
    try {
      evidenceInput = await verificationPromise;
    } catch {
      failRejected();
    }
    const evidence = captureEvidence(evidenceInput);
    const expectedAuthorizationKey = sha256Hex({
      domain: 'zenon-x402-authorization-v1',
      chainProfile: requirement.extra.zenonChain,
      intentDigest: expectedIntentDigest,
      resourceDigest: sha256Hex(paymentRequired.resource),
      transactionHash: inspected.transaction.hash,
    });
    if (
      evidence.success !== true
      || evidence.network !== MOCK_NETWORK
      || evidence.transaction !== inspected.transaction.hash
      || evidence.payer !== inspected.transaction.address
      || evidence.payer !== intent.holderId
      || evidence.state !== 'MOMENTUM_INCLUDED'
      || evidence.authorizationKey !== expectedAuthorizationKey
      || evidence.deliveryState !== 'NONE'
    ) {
      failRejected();
    }

    let afterVerification;
    try {
      afterVerification = Reflect.apply(this.#now, undefined, []);
    } catch {
      throw activationFailure('SERVICE_CREDIT_ACTIVATION_SETTLED_NOT_GRANTED');
    }
    if (
      !Number.isSafeInteger(afterVerification)
      || afterVerification < 0
      || intent.expiresAt <= afterVerification
    ) {
      throw activationFailure('SERVICE_CREDIT_ACTIVATION_SETTLED_NOT_GRANTED');
    }

    const paymentResourceDigest = commitment(RESOURCE_DIGEST_DOMAIN, paymentRequired.resource);
    const paymentRequirementDigest = commitment(REQUIREMENT_DIGEST_DOMAIN, requirement);
    const sourceSettlementId = `settlement_${commitment(AUTHORITY_SETTLEMENT_DOMAIN, {
      authorityProfileId: this.#authority.profileId,
      authorityProfileVersion: this.#authority.profileVersion,
      authorityRecordDigest: this.#authority.recordDigest,
      authorizationKey: expectedAuthorizationKey,
    }).slice('sha256:'.length)}`;
    const activation = {
      activationVersion: SERVICE_CREDIT_ACTIVATION_VERSION,
      authorityProfileId: this.#authority.profileId,
      authorityProfileVersion: this.#authority.profileVersion,
      verifierVersion: this.#authority.verifierVersion,
      authorityRecordDigest: this.#authority.recordDigest,
      fundingPolicyId: normalizedOffer.fundingPolicyId,
      fundingPolicyVersion: normalizedOffer.fundingPolicyVersion,
      sourceSettlementId,
      transactionId: `mocktx:${inspected.transaction.hash}`,
      providerId: intent.providerId,
      serviceId: intent.serviceId,
      resourceId: intent.resourceId,
      resourceBinding: normalizedOffer.resourceBinding,
      offerId: intent.offerId,
      offerVersion: intent.offerVersion,
      holderId: intent.holderId,
      capabilityCommitment: intent.capabilityCommitment,
      totalUnits: intent.totalUnits,
      expiresAt: intent.expiresAt,
      scheme: requirement.scheme,
      paymentFlow: requirement.extra.paymentFlow,
      network: requirement.network,
      chainProfile: requirement.extra.zenonChain,
      asset: requirement.asset,
      amount: requirement.amount,
      payee: requirement.payTo,
      payer: evidence.payer,
      paymentResourceDigest,
      paymentRequirementDigest,
      paymentIntentDigest: `sha256:${expectedIntentDigest}`,
      grantFundingCommitment: expectedFunding,
      evidenceState: evidence.state,
      confirmationPolicy: {
        policyId: 'mock.momentum-included',
        policyVersion: 1,
        minimumConfirmations: 1,
      },
    };

    let grant;
    try {
      grant = Reflect.apply(this.#activateGrantFromTrustedRecord, this.#store, [activation]);
    } catch (error) {
      const code = errorCode(error);
      if (code === 'SERVICE_CREDIT_STORE_COMMIT_FAILED') {
        throw activationFailure('SERVICE_CREDIT_ACTIVATION_OUTCOME_UNKNOWN');
      }
      if (
        code === 'GRANT_IDENTITY_CONFLICT'
        || code === 'OFFER_VERSION_CONFLICT'
        || code === 'OFFER_SCOPE_MISMATCH'
      ) {
        throw activationFailure('SERVICE_CREDIT_ACTIVATION_CONFLICT');
      }
      if (code === 'INVALID_INPUT' || code === 'OFFER_NOT_FOUND') {
        throw activationFailure('SERVICE_CREDIT_ACTIVATION_SETTLED_NOT_GRANTED');
      }
      throw activationFailure('SERVICE_CREDIT_ACTIVATION_SETTLED_NOT_GRANTED');
    }
    return deepFreeze({ activation: grant.activation, grant });
  }
}

export function createMockServiceCreditActivation(options) {
  return new MockServiceCreditActivation(options);
}

export function deriveServiceCreditResourceBinding(input) {
  const value = exactDataObject(input, ['resourceId', 'resourceUrl']);
  assertIdentifier(value.resourceId);
  return resourceBinding(value.resourceId, value.resourceUrl);
}

export { SERVICE_CREDIT_ACTIVATION_VERSION };
