import crypto from 'node:crypto';

export const GRANT_LIFECYCLE = Object.freeze({
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED',
});

export const REQUEST_STATE = Object.freeze({
  RESERVED: 'RESERVED',
  EXECUTING: 'EXECUTING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED_RELEASED: 'FAILED_RELEASED',
  OUTCOME_UNKNOWN: 'OUTCOME_UNKNOWN',
});

export const SERVICE_CREDIT_MODEL_VERSION = 1;
export const SERVICE_CREDIT_STATE_SCHEMA_VERSION = 2;
export const SERVICE_CREDIT_ACTIVATION_VERSION = 1;
export const SERVICE_CREDIT_ZENON_ACTIVATION_RECORD_VERSION = 2;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const METHOD = /^[A-Z][A-Z0-9_-]{0,15}$/;
const CONTENT_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}$/;
const SHA256_COMMITMENT = /^sha256:[0-9a-f]{64}$/;
const CANONICAL_POSITIVE_DECIMAL = /^[1-9][0-9]*$/;
const MOCK_TRANSACTION_REFERENCE = /^mocktx:[0-9a-f]{64}$/;
const ZENON_TRANSACTION_REFERENCE = /^zenontx:[0-9a-f]{64}$/;
const LOWERCASE_HASH = /^[0-9a-f]{64}$/;
const MOCK_CHAIN_IDENTIFIER = Number.MAX_SAFE_INTEGER.toString();
const MOCK_GENESIS_MOMENTUM_HASH = '0'.repeat(64);
const EXPERIMENTAL_LIVE_NETWORK = 'zenon:testnet';
const ZENON_CONFIRMATION_POLICY_ID = 'zenon.authenticated-momentum-inclusion';
const ACTIVATION_DOMAIN = 'zenon-x402-service-credit-activation-v1';
const GRANT_DOMAIN = 'zenon-x402-service-credit-grant-v1';
const MAX_HYDRATED_OFFERS = 10_000;
const MAX_HYDRATED_GRANTS = 10_000;
const MAX_HYDRATED_REQUESTS = 100_000;

export class ServiceCreditModelError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ServiceCreditModelError';
    this.code = code;
  }
}

function fail(code) {
  throw new ServiceCreditModelError(code);
}

function failState() {
  fail('INVALID_STATE');
}

function captureObjectShape(value, requiredKeys, optionalKeys = []) {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      fail('INVALID_INPUT');
    }
    const prototype = Reflect.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) fail('INVALID_INPUT');

    const allowed = new Set([...requiredKeys, ...optionalKeys]);
    const keys = Reflect.ownKeys(value);
    if (keys.some(key => typeof key !== 'string' || !allowed.has(key))) {
      fail('INVALID_INPUT');
    }
    const keySet = new Set(keys);
    if (requiredKeys.some(key => !keySet.has(key))) fail('INVALID_INPUT');

    const captured = Object.create(null);
    for (const key of keys) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
        fail('INVALID_INPUT');
      }
      Object.defineProperty(captured, key, {
        value: descriptor.value,
        enumerable: true,
        writable: false,
        configurable: false,
      });
    }
    return Object.freeze(captured);
  } catch {
    fail('INVALID_INPUT');
  }
}

function captureStateArray(value, maximumLength) {
  try {
    if (!Array.isArray(value) || Reflect.getPrototypeOf(value) !== Array.prototype) failState();
    const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, 'length');
    if (
      !lengthDescriptor
      || lengthDescriptor.enumerable
      || !Object.hasOwn(lengthDescriptor, 'value')
      || !Number.isSafeInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 0
      || lengthDescriptor.value > maximumLength
    ) {
      failState();
    }
    const length = lengthDescriptor.value;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== length + 1 || keys[length] !== 'length') failState();
    const captured = [];
    for (let index = 0; index < length; index += 1) {
      if (keys[index] !== String(index)) failState();
      const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) failState();
      captured.push(descriptor.value);
    }
    return captured;
  } catch {
    failState();
  }
}

function assertIdentifier(value) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value) || value.includes('://')) {
    fail('INVALID_INPUT');
  }
}

function assertMethod(value) {
  if (typeof value !== 'string' || !METHOD.test(value)) fail('INVALID_INPUT');
}

function assertContentType(value) {
  if (typeof value !== 'string' || !CONTENT_TYPE.test(value)) fail('INVALID_INPUT');
}

function assertCommitment(value) {
  if (typeof value !== 'string' || !SHA256_COMMITMENT.test(value)) fail('INVALID_INPUT');
}

function assertPositiveSafeInteger(value) {
  if (!Number.isSafeInteger(value) || value <= 0) fail('INVALID_INPUT');
}

function isSdkSafeChainIdentifier(value) {
  return (
    typeof value === 'string'
    && CANONICAL_POSITIVE_DECIMAL.test(value)
    && (
      value.length < MOCK_CHAIN_IDENTIFIER.length
      || (value.length === MOCK_CHAIN_IDENTIFIER.length && value <= MOCK_CHAIN_IDENTIFIER)
    )
  );
}

function cloneJson(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cloneJson);
  return Object.fromEntries(Object.keys(value).map(key => [key, cloneJson(value[key])]));
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function snapshot(value) {
  return deepFreeze(cloneJson(value));
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function sha256Commitment(value) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function sameJson(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function offerKey(offerId, offerVersion) {
  return canonicalJson([offerId, offerVersion]);
}

function normalizeOffer(input) {
  const value = captureObjectShape(input, [
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
  if (value.modelVersion !== SERVICE_CREDIT_MODEL_VERSION) fail('INVALID_INPUT');
  assertIdentifier(value.providerId);
  assertIdentifier(value.serviceId);
  assertIdentifier(value.resourceId);
  assertCommitment(value.resourceBinding);
  assertIdentifier(value.offerId);
  assertPositiveSafeInteger(value.offerVersion);
  assertIdentifier(value.costPolicyId);
  assertIdentifier(value.fundingPolicyId);
  assertPositiveSafeInteger(value.fundingPolicyVersion);

  return deepFreeze({
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    providerId: value.providerId,
    serviceId: value.serviceId,
    resourceId: value.resourceId,
    resourceBinding: value.resourceBinding,
    offerId: value.offerId,
    offerVersion: value.offerVersion,
    costPolicyId: value.costPolicyId,
    fundingPolicyId: value.fundingPolicyId,
    fundingPolicyVersion: value.fundingPolicyVersion,
  });
}

function normalizeActivation(input) {
  const value = captureObjectShape(input, [
    'activationVersion',
    'authorityProfileId',
    'authorityProfileVersion',
    'verifierVersion',
    'authorityRecordDigest',
    'fundingPolicyId',
    'fundingPolicyVersion',
    'sourceSettlementId',
    'transactionId',
    'providerId',
    'serviceId',
    'resourceId',
    'resourceBinding',
    'offerId',
    'offerVersion',
    'holderId',
    'capabilityCommitment',
    'totalUnits',
    'expiresAt',
    'scheme',
    'paymentFlow',
    'network',
    'chainProfile',
    'asset',
    'amount',
    'payee',
    'payer',
    'paymentResourceDigest',
    'paymentRequirementDigest',
    'paymentIntentDigest',
    'grantFundingCommitment',
    'evidenceState',
    'confirmationPolicy',
  ], ['evidenceVersion', 'inclusionAuthorizationDigest']);
  for (const identifier of [
    value.authorityProfileId,
    value.fundingPolicyId,
    value.sourceSettlementId,
    value.providerId,
    value.serviceId,
    value.resourceId,
    value.offerId,
    value.holderId,
    value.asset,
    value.payee,
    value.payer,
  ]) {
    assertIdentifier(identifier);
  }
  if (value.holderId !== value.payer) fail('INVALID_INPUT');
  assertPositiveSafeInteger(value.authorityProfileVersion);
  assertPositiveSafeInteger(value.verifierVersion);
  assertCommitment(value.authorityRecordDigest);
  assertPositiveSafeInteger(value.fundingPolicyVersion);
  assertCommitment(value.resourceBinding);
  assertPositiveSafeInteger(value.offerVersion);
  assertCommitment(value.capabilityCommitment);
  assertPositiveSafeInteger(value.totalUnits);
  if (!Number.isSafeInteger(value.expiresAt) || value.expiresAt <= 0) fail('INVALID_INPUT');
  if (
    value.scheme !== 'exact'
    || value.paymentFlow !== 'upfront'
    || typeof value.amount !== 'string'
    || !CANONICAL_POSITIVE_DECIMAL.test(value.amount)
    || value.amount.length > 77
  ) {
    fail('INVALID_INPUT');
  }
  const chainProfile = captureObjectShape(value.chainProfile, [
    'version',
    'chainIdentifier',
    'genesisMomentumHash',
  ]);
  if (chainProfile.version !== 1) {
    fail('INVALID_INPUT');
  }
  const mockActivation = (
    value.activationVersion === SERVICE_CREDIT_ACTIVATION_VERSION
    && value.network === 'zenon:mock'
  );
  const authenticatedZenonActivation = (
    value.activationVersion === SERVICE_CREDIT_ZENON_ACTIVATION_RECORD_VERSION
    && value.network === EXPERIMENTAL_LIVE_NETWORK
  );
  if (
    (!mockActivation && !authenticatedZenonActivation)
    || (mockActivation && !MOCK_TRANSACTION_REFERENCE.test(value.transactionId))
    || (authenticatedZenonActivation && !ZENON_TRANSACTION_REFERENCE.test(value.transactionId))
    || (mockActivation && (
      chainProfile.chainIdentifier !== MOCK_CHAIN_IDENTIFIER
      || chainProfile.genesisMomentumHash !== MOCK_GENESIS_MOMENTUM_HASH
    ))
    || (authenticatedZenonActivation && (
      !isSdkSafeChainIdentifier(chainProfile.chainIdentifier)
      || !LOWERCASE_HASH.test(chainProfile.genesisMomentumHash)
      || chainProfile.genesisMomentumHash === MOCK_GENESIS_MOMENTUM_HASH
    ))
  ) {
    fail('INVALID_INPUT');
  }
  for (const digest of [
    value.paymentResourceDigest,
    value.paymentRequirementDigest,
    value.paymentIntentDigest,
    value.grantFundingCommitment,
  ]) {
    assertCommitment(digest);
  }
  if (value.evidenceState !== 'MOMENTUM_INCLUDED') fail('INVALID_INPUT');
  const confirmationPolicy = captureObjectShape(value.confirmationPolicy, [
    'policyId',
    'policyVersion',
    'minimumConfirmations',
  ]);
  if (
    (mockActivation && (
      confirmationPolicy.policyId !== 'mock.momentum-included'
      || confirmationPolicy.policyVersion !== 1
      || confirmationPolicy.minimumConfirmations !== 1
      || Object.hasOwn(value, 'evidenceVersion')
      || Object.hasOwn(value, 'inclusionAuthorizationDigest')
    ))
    || (authenticatedZenonActivation && (
      value.evidenceVersion !== 1
      || confirmationPolicy.policyId !== ZENON_CONFIRMATION_POLICY_ID
      || confirmationPolicy.policyVersion !== 1
      || !Number.isSafeInteger(confirmationPolicy.minimumConfirmations)
      || confirmationPolicy.minimumConfirmations < 2
      || confirmationPolicy.minimumConfirmations > 30
      || value.inclusionAuthorizationDigest === undefined
    ))
  ) {
    fail('INVALID_INPUT');
  }
  if (authenticatedZenonActivation) assertCommitment(value.inclusionAuthorizationDigest);

  return deepFreeze({
    activationVersion: value.activationVersion,
    authorityProfileId: value.authorityProfileId,
    authorityProfileVersion: value.authorityProfileVersion,
    verifierVersion: value.verifierVersion,
    authorityRecordDigest: value.authorityRecordDigest,
    fundingPolicyId: value.fundingPolicyId,
    fundingPolicyVersion: value.fundingPolicyVersion,
    sourceSettlementId: value.sourceSettlementId,
    transactionId: value.transactionId,
    providerId: value.providerId,
    serviceId: value.serviceId,
    resourceId: value.resourceId,
    resourceBinding: value.resourceBinding,
    offerId: value.offerId,
    offerVersion: value.offerVersion,
    holderId: value.holderId,
    capabilityCommitment: value.capabilityCommitment,
    totalUnits: value.totalUnits,
    expiresAt: value.expiresAt,
    scheme: value.scheme,
    paymentFlow: value.paymentFlow,
    network: value.network,
    chainProfile: {
      version: chainProfile.version,
      chainIdentifier: chainProfile.chainIdentifier,
      genesisMomentumHash: chainProfile.genesisMomentumHash,
    },
    asset: value.asset,
    amount: value.amount,
    payee: value.payee,
    payer: value.payer,
    paymentResourceDigest: value.paymentResourceDigest,
    paymentRequirementDigest: value.paymentRequirementDigest,
    paymentIntentDigest: value.paymentIntentDigest,
    grantFundingCommitment: value.grantFundingCommitment,
    ...(authenticatedZenonActivation
      ? {
        evidenceVersion: value.evidenceVersion,
        inclusionAuthorizationDigest: value.inclusionAuthorizationDigest,
      }
      : {}),
    evidenceState: value.evidenceState,
    confirmationPolicy: {
      policyId: confirmationPolicy.policyId,
      policyVersion: confirmationPolicy.policyVersion,
      minimumConfirmations: confirmationPolicy.minimumConfirmations,
    },
  });
}

function activationIdFor(normalized) {
  return `activation_${sha256Commitment({
    domain: ACTIVATION_DOMAIN,
    record: normalized,
  }).slice('sha256:'.length)}`;
}

function grantDescriptionFor(activationId, activation) {
  return deepFreeze({
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    activationId,
    providerId: activation.providerId,
    serviceId: activation.serviceId,
    resourceId: activation.resourceId,
    offerId: activation.offerId,
    offerVersion: activation.offerVersion,
    holderId: activation.holderId,
    capabilityCommitment: activation.capabilityCommitment,
    totalUnits: activation.totalUnits,
    expiresAt: activation.expiresAt,
  });
}

function grantIdFor(description) {
  return `grant_${sha256Commitment({
    domain: GRANT_DOMAIN,
    grant: description,
  }).slice('sha256:'.length)}`;
}

function normalizeRequest(input) {
  const value = captureObjectShape(input, [
    'modelVersion',
    'grantId',
    'requestId',
    'method',
    'routeId',
    'canonicalBodyDigest',
    'selectedContentType',
    'maxCostUnits',
  ]);
  if (value.modelVersion !== SERVICE_CREDIT_MODEL_VERSION) fail('INVALID_INPUT');
  assertIdentifier(value.grantId);
  assertIdentifier(value.requestId);
  assertMethod(value.method);
  assertIdentifier(value.routeId);
  assertCommitment(value.canonicalBodyDigest);
  assertContentType(value.selectedContentType);
  assertPositiveSafeInteger(value.maxCostUnits);

  return deepFreeze({
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    grantId: value.grantId,
    requestId: value.requestId,
    method: value.method,
    routeId: value.routeId,
    canonicalBodyDigest: value.canonicalBodyDigest,
    selectedContentType: value.selectedContentType,
    maxCostUnits: value.maxCostUnits,
  });
}

function normalizeReference(input) {
  const value = captureObjectShape(input, ['grantId', 'requestId']);
  assertIdentifier(value.grantId);
  assertIdentifier(value.requestId);
  return { grantId: value.grantId, requestId: value.requestId };
}

function normalizeCachedResult(input) {
  const value = captureObjectShape(input, ['statusCode', 'contentType', 'resultCode']);
  if (!Number.isSafeInteger(value.statusCode) || value.statusCode < 100 || value.statusCode > 599) {
    fail('INVALID_INPUT');
  }
  assertContentType(value.contentType);
  assertIdentifier(value.resultCode);
  return deepFreeze({
    statusCode: value.statusCode,
    contentType: value.contentType,
    resultCode: value.resultCode,
  });
}

function exportedGrant(record) {
  return {
    grantId: record.grantId,
    modelVersion: record.modelVersion,
    activationId: record.activationId,
    activation: record.activation,
    sourceSettlementId: record.sourceSettlementId,
    transactionId: record.transactionId,
    providerId: record.providerId,
    serviceId: record.serviceId,
    resourceId: record.resourceId,
    offerId: record.offerId,
    offerVersion: record.offerVersion,
    holderId: record.holderId,
    capabilityCommitment: record.capabilityCommitment,
    totalUnits: record.totalUnits,
    expiresAt: record.expiresAt,
    paymentIntent: record.paymentIntent,
    lifecycle: record.lifecycle,
    availableUnits: record.availableUnits,
    heldUnits: record.heldUnits,
    consumedUnits: record.consumedUnits,
  };
}

function exportedRequest(record) {
  return {
    modelVersion: record.modelVersion,
    grantId: record.grantId,
    requestId: record.requestId,
    requestDigest: record.requestDigest,
    offerId: record.offerId,
    offerVersion: record.offerVersion,
    method: record.method,
    routeId: record.routeId,
    canonicalBodyDigest: record.canonicalBodyDigest,
    selectedContentType: record.selectedContentType,
    maxCostUnits: record.maxCostUnits,
    costUnits: record.costUnits,
    state: record.state,
    cachedResult: record.cachedResult,
  };
}

function normalizeExportedGrant(input) {
  const value = captureObjectShape(input, [
    'grantId',
    'modelVersion',
    'activationId',
    'activation',
    'sourceSettlementId',
    'transactionId',
    'providerId',
    'serviceId',
    'resourceId',
    'offerId',
    'offerVersion',
    'holderId',
    'capabilityCommitment',
    'totalUnits',
    'expiresAt',
    'paymentIntent',
    'lifecycle',
    'availableUnits',
    'heldUnits',
    'consumedUnits',
  ]);
  assertIdentifier(value.grantId);
  assertIdentifier(value.activationId);
  if (value.modelVersion !== SERVICE_CREDIT_MODEL_VERSION) failState();
  const activationValue = captureObjectShape(value.activation, ['activationId'], [
    'activationVersion',
    'authorityProfileId',
    'authorityProfileVersion',
    'verifierVersion',
    'authorityRecordDigest',
    'fundingPolicyId',
    'fundingPolicyVersion',
    'sourceSettlementId',
    'transactionId',
    'providerId',
    'serviceId',
    'resourceId',
    'resourceBinding',
    'offerId',
    'offerVersion',
    'holderId',
    'capabilityCommitment',
    'totalUnits',
    'expiresAt',
    'scheme',
    'paymentFlow',
    'network',
    'chainProfile',
    'asset',
    'amount',
    'payee',
    'payer',
    'paymentResourceDigest',
    'paymentRequirementDigest',
    'paymentIntentDigest',
    'grantFundingCommitment',
    'evidenceVersion',
    'inclusionAuthorizationDigest',
    'evidenceState',
    'confirmationPolicy',
  ]);
  const { activationId, ...activationInput } = activationValue;
  const activation = normalizeActivation(activationInput);
  const expectedActivationId = activationIdFor(activation);
  if (activationId !== expectedActivationId || value.activationId !== expectedActivationId) {
    failState();
  }
  const description = grantDescriptionFor(expectedActivationId, activation);
  const expectedGrantId = grantIdFor(description);
  if (value.grantId !== expectedGrantId) failState();
  if (
    value.sourceSettlementId !== activation.sourceSettlementId
    || value.transactionId !== activation.transactionId
    || value.providerId !== activation.providerId
    || value.serviceId !== activation.serviceId
    || value.resourceId !== activation.resourceId
    || value.offerId !== activation.offerId
    || value.offerVersion !== activation.offerVersion
    || value.holderId !== activation.holderId
    || value.capabilityCommitment !== activation.capabilityCommitment
    || value.totalUnits !== activation.totalUnits
    || value.expiresAt !== activation.expiresAt
    || !sameJson(value.paymentIntent, {
      intentId: activation.paymentIntentDigest,
      requirementId: activation.paymentRequirementDigest,
    })
  ) {
    failState();
  }
  if (!Object.values(GRANT_LIFECYCLE).includes(value.lifecycle)) failState();
  for (const counter of [value.availableUnits, value.heldUnits, value.consumedUnits]) {
    if (!Number.isSafeInteger(counter) || counter < 0) failState();
  }
  if (
    activation.totalUnits
    !== value.availableUnits + value.heldUnits + value.consumedUnits
  ) {
    failState();
  }
  return {
    grantId: value.grantId,
    description: canonicalJson(description),
    ...description,
    activation: deepFreeze({ activationId, ...activation }),
    sourceSettlementId: activation.sourceSettlementId,
    transactionId: activation.transactionId,
    paymentIntent: deepFreeze({
      intentId: activation.paymentIntentDigest,
      requirementId: activation.paymentRequirementDigest,
    }),
    lifecycle: value.lifecycle,
    availableUnits: value.availableUnits,
    heldUnits: value.heldUnits,
    consumedUnits: value.consumedUnits,
  };
}

function normalizeExportedRequest(input) {
  const value = captureObjectShape(input, [
    'modelVersion',
    'grantId',
    'requestId',
    'requestDigest',
    'offerId',
    'offerVersion',
    'method',
    'routeId',
    'canonicalBodyDigest',
    'selectedContentType',
    'maxCostUnits',
    'costUnits',
    'state',
    'cachedResult',
  ]);
  const normalized = normalizeRequest({
    modelVersion: value.modelVersion,
    grantId: value.grantId,
    requestId: value.requestId,
    method: value.method,
    routeId: value.routeId,
    canonicalBodyDigest: value.canonicalBodyDigest,
    selectedContentType: value.selectedContentType,
    maxCostUnits: value.maxCostUnits,
  });
  assertIdentifier(value.offerId);
  assertPositiveSafeInteger(value.offerVersion);
  assertCommitment(value.requestDigest);
  assertPositiveSafeInteger(value.costUnits);
  if (!Object.values(REQUEST_STATE).includes(value.state)) failState();

  let cachedResult = null;
  if (value.state === REQUEST_STATE.SUCCEEDED) {
    if (value.cachedResult === null) failState();
    cachedResult = normalizeCachedResult(value.cachedResult);
    assertCachedResultRepresentation(cachedResult, normalized.selectedContentType);
  } else if (value.cachedResult !== null) {
    failState();
  }

  return {
    ...normalized,
    requestDigest: value.requestDigest,
    offerId: value.offerId,
    offerVersion: value.offerVersion,
    costUnits: value.costUnits,
    state: value.state,
    cachedResult,
  };
}

function assertCachedResultRepresentation(cachedResult, selectedContentType) {
  if (cachedResult.contentType !== selectedContentType) fail('INVALID_INPUT');
}

function sameRequestIdentity(record, normalized) {
  return (
    record.modelVersion === normalized.modelVersion
    && record.grantId === normalized.grantId
    && record.requestId === normalized.requestId
    && record.method === normalized.method
    && record.routeId === normalized.routeId
    && record.canonicalBodyDigest === normalized.canonicalBodyDigest
    && record.selectedContentType === normalized.selectedContentType
    && record.maxCostUnits === normalized.maxCostUnits
  );
}

/**
 * Synchronous, in-memory reference state machine for service credits.
 *
 * Invariants:
 * - offer versions, activation records, and grant descriptions never change;
 * - one authority/settlement identity, transaction, activation, capability
 *   commitment, and resulting grant can bind only one activation;
 * - totalUnits always equals availableUnits + heldUnits + consumedUnits;
 * - only the first RESERVED -> EXECUTING transition on an ACTIVE grant authorizes execution;
 * - the first server-derived request cost is pinned for every later retry;
 * - the pinned cost never exceeds the holder-authorized request ceiling;
 * - post-execution ambiguity keeps units held until explicit reconciliation; and
 * - public methods return detached, deeply frozen JSON-safe snapshots.
 *
 * activateGrantFromTrustedRecord is a privileged composition operation and the
 * strict low-level persistence transition for a complete activation record. A
 * raw model handle therefore carries grant-minting/admin authority; the method
 * name does not make that authority cryptographically inaccessible. It must
 * never be exposed to a client or HTTP handler. This method does not verify
 * payment evidence; the inactive mock activation adapter calls it only after
 * exact mock verification. The separate default-inactive Zenon evidence
 * consumer calls it only after one constructor-fixed trusted verifier returns
 * a complete record and every local cross-binding has been revalidated.
 * Other integration layers remain responsible for authentication, capability
 * proof, request-body canonicalization, and safe classification or redaction of
 * values placed in allowed identifier fields.
 * reconcileRequest is a privileged server-internal operation: the integration
 * boundary must permit it only after authoritative external evidence identifies
 * the outcome, and must never expose it directly to a capability holder or an
 * unauthenticated client because FAILED_RELEASED restores spendable units. This
 * model cannot authenticate that actor or evidence.
 * The trusted deriveCost callback and funding-policy implementation are server
 * code, not hashed or authenticated semantics. Their immutable identifiers and
 * versions are bound to the offer and activation. Semantic changes must use new
 * policy identifiers or versions and a new offer version; reuse of an old policy
 * identity for changed code cannot be detected by this model.
 * This model enforces a fixed-format capability commitment and strict schema
 * allowlists, but it does not heuristically detect secrets or sensitive values.
 *
 * This class supplies neither durable nor distributed atomicity. Its synchronous
 * mutations are atomic only with respect to calls on one JavaScript instance.
 */
export class InMemoryServiceCreditModel {
  #deriveCost;
  #now;
  #operationActive = false;
  #callbackActive = false;
  #callbackReentryAttempted = false;
  #offers = new Map();
  #activations = new Map();
  #grants = new Map();
  #activationByAuthoritySettlement = new Map();
  #activationByTransaction = new Map();
  #grantByCapability = new Map();
  #requests = new Map();

  constructor(options) {
    const value = captureObjectShape(options, ['deriveCost'], ['now']);
    if (typeof value.deriveCost !== 'function') fail('INVALID_INPUT');
    const hasNow = Object.hasOwn(value, 'now');
    if (hasNow && typeof value.now !== 'function') fail('INVALID_INPUT');
    this.#deriveCost = value.deriveCost;
    this.#now = hasNow ? value.now : Date.now;
  }

  /**
   * Returns the complete canonical state without consulting time or pricing.
   * Activation records are nested in their one resulting grant so the physical
   * state envelope remains unchanged. Deterministic ordering is part of schema v2.
   */
  exportState() {
    return this.#runPublicOperation(() => {
      const offers = [...this.#offers.values()]
        .map(value => ({ ...value }))
        .sort((left, right) => (
          compareText(left.offerId, right.offerId)
          || left.offerVersion - right.offerVersion
        ));
      const grants = [...this.#grants.values()]
        .map(exportedGrant)
        .sort((left, right) => compareText(left.grantId, right.grantId));
      const requests = [];
      for (const records of this.#requests.values()) {
        for (const record of records.values()) requests.push(exportedRequest(record));
      }
      requests.sort((left, right) => (
        compareText(left.grantId, right.grantId)
        || compareText(left.requestId, right.requestId)
      ));
      return snapshot({
        schemaVersion: SERVICE_CREDIT_STATE_SCHEMA_VERSION,
        modelVersion: SERVICE_CREDIT_MODEL_VERSION,
        offers,
        grants,
        requests,
      });
    });
  }

  /**
   * Hydrates only an exact, self-consistent schema-v2 snapshot. Validation does
   * not invoke the supplied clock or pricing callbacks and never repairs state.
   */
  static fromState(options, state) {
    const model = new InMemoryServiceCreditModel(options);
    try {
      const root = captureObjectShape(state, [
        'schemaVersion',
        'modelVersion',
        'offers',
        'grants',
        'requests',
      ]);
      if (
        root.schemaVersion !== SERVICE_CREDIT_STATE_SCHEMA_VERSION
        || root.modelVersion !== SERVICE_CREDIT_MODEL_VERSION
      ) {
        failState();
      }

      const offers = captureStateArray(root.offers, MAX_HYDRATED_OFFERS);
      const grants = captureStateArray(root.grants, MAX_HYDRATED_GRANTS);
      const requests = captureStateArray(root.requests, MAX_HYDRATED_REQUESTS);

      let priorOffer = null;
      for (const input of offers) {
        const normalized = normalizeOffer(input);
        const key = offerKey(normalized.offerId, normalized.offerVersion);
        if (
          priorOffer !== null
          && (
            compareText(priorOffer.offerId, normalized.offerId) > 0
            || (
              priorOffer.offerId === normalized.offerId
              && priorOffer.offerVersion >= normalized.offerVersion
            )
          )
        ) {
          failState();
        }
        priorOffer = normalized;
        if (model.#offers.has(key)) failState();
        model.#offers.set(key, normalized);
      }

      const authoritySettlements = new Set();
      const transactions = new Set();
      const activations = new Set();
      const capabilities = new Set();
      let priorGrantId = null;
      for (const input of grants) {
        const record = normalizeExportedGrant(input);
        if (priorGrantId !== null && compareText(priorGrantId, record.grantId) >= 0) {
          failState();
        }
        priorGrantId = record.grantId;
        const offer = model.#offers.get(offerKey(record.offerId, record.offerVersion));
        if (
          !offer
          || offer.providerId !== record.providerId
          || offer.serviceId !== record.serviceId
          || offer.resourceId !== record.resourceId
          || offer.resourceBinding !== record.activation.resourceBinding
          || offer.fundingPolicyId !== record.activation.fundingPolicyId
          || offer.fundingPolicyVersion !== record.activation.fundingPolicyVersion
        ) {
          failState();
        }
        const authoritySettlement = canonicalJson([
          record.activation.authorityProfileId,
          record.activation.authorityProfileVersion,
          record.sourceSettlementId,
        ]);
        if (
          authoritySettlements.has(authoritySettlement)
          || transactions.has(record.transactionId)
          || activations.has(record.activationId)
          || capabilities.has(record.capabilityCommitment)
          || model.#grants.has(record.grantId)
        ) {
          failState();
        }
        authoritySettlements.add(authoritySettlement);
        transactions.add(record.transactionId);
        activations.add(record.activationId);
        capabilities.add(record.capabilityCommitment);
        model.#activations.set(record.activationId, record.activation);
        model.#grants.set(record.grantId, record);
        model.#activationByAuthoritySettlement.set(authoritySettlement, record.activationId);
        model.#activationByTransaction.set(record.transactionId, record.activationId);
        model.#grantByCapability.set(record.capabilityCommitment, record.grantId);
        model.#requests.set(record.grantId, new Map());
      }

      const heldByGrant = new Map();
      const consumedByGrant = new Map();
      let priorRequest = null;
      for (const input of requests) {
        const record = normalizeExportedRequest(input);
        if (
          priorRequest !== null
          && (
            compareText(priorRequest.grantId, record.grantId) > 0
            || (
              priorRequest.grantId === record.grantId
              && compareText(priorRequest.requestId, record.requestId) >= 0
            )
          )
        ) {
          failState();
        }
        priorRequest = record;
        const grant = model.#grants.get(record.grantId);
        if (
          !grant
          || record.offerId !== grant.offerId
          || record.offerVersion !== grant.offerVersion
          || record.costUnits > record.maxCostUnits
          || record.costUnits > grant.totalUnits
        ) {
          failState();
        }
        const expectedDigest = sha256Commitment({
          modelVersion: record.modelVersion,
          grantId: record.grantId,
          offerId: grant.offerId,
          offerVersion: grant.offerVersion,
          method: record.method,
          routeId: record.routeId,
          canonicalBodyDigest: record.canonicalBodyDigest,
          selectedContentType: record.selectedContentType,
          maxCostUnits: record.maxCostUnits,
          costUnits: record.costUnits,
        });
        if (record.requestDigest !== expectedDigest) failState();
        const grantRequests = model.#requests.get(record.grantId);
        if (grantRequests.has(record.requestId)) failState();
        grantRequests.set(record.requestId, record);

        if ([
          REQUEST_STATE.RESERVED,
          REQUEST_STATE.EXECUTING,
          REQUEST_STATE.OUTCOME_UNKNOWN,
        ].includes(record.state)) {
          const nextHeld = (heldByGrant.get(record.grantId) ?? 0) + record.costUnits;
          if (!Number.isSafeInteger(nextHeld)) failState();
          heldByGrant.set(record.grantId, nextHeld);
        } else if (record.state === REQUEST_STATE.SUCCEEDED) {
          const nextConsumed = (consumedByGrant.get(record.grantId) ?? 0) + record.costUnits;
          if (!Number.isSafeInteger(nextConsumed)) failState();
          consumedByGrant.set(record.grantId, nextConsumed);
        }
      }

      for (const grant of model.#grants.values()) {
        const heldUnits = heldByGrant.get(grant.grantId) ?? 0;
        const consumedUnits = consumedByGrant.get(grant.grantId) ?? 0;
        const availableUnits = grant.totalUnits - heldUnits - consumedUnits;
        if (
          !Number.isSafeInteger(availableUnits)
          || availableUnits < 0
          || grant.heldUnits !== heldUnits
          || grant.consumedUnits !== consumedUnits
          || grant.availableUnits !== availableUnits
        ) {
          failState();
        }
      }
      return model;
    } catch {
      failState();
    }
  }

  registerOffer(input) {
    return this.#runPublicOperation(() => {
      const normalized = normalizeOffer(input);
      const key = offerKey(normalized.offerId, normalized.offerVersion);
      const existing = this.#offers.get(key);
      if (existing) {
        if (!sameJson(existing, normalized)) fail('OFFER_VERSION_CONFLICT');
        return snapshot(existing);
      }

      this.#offers.set(key, normalized);
      return snapshot(normalized);
    });
  }

  getOffer(input) {
    return this.#runPublicOperation(() => {
      const value = captureObjectShape(input, ['offerId', 'offerVersion']);
      assertIdentifier(value.offerId);
      assertPositiveSafeInteger(value.offerVersion);
      const existing = this.#offers.get(offerKey(value.offerId, value.offerVersion));
      return existing ? snapshot(existing) : null;
    });
  }

  activateGrantFromTrustedRecord(input) {
    return this.#runPublicOperation(() => {
      const normalized = normalizeActivation(input);
      const activationId = activationIdFor(normalized);
      const grantDescription = grantDescriptionFor(activationId, normalized);
      const description = canonicalJson(grantDescription);
      const grantId = grantIdFor(grantDescription);
      const authoritySettlement = canonicalJson([
        normalized.authorityProfileId,
        normalized.authorityProfileVersion,
        normalized.sourceSettlementId,
      ]);
      const existingActivation = this.#activations.get(activationId);
      const byAuthoritySettlement = this.#activationByAuthoritySettlement.get(authoritySettlement);
      const byTransaction = this.#activationByTransaction.get(normalized.transactionId);
      const byCapability = this.#grantByCapability.get(normalized.capabilityCommitment);
      const existingGrant = this.#grants.get(grantId);
      if (
        existingActivation
        || byAuthoritySettlement
        || byTransaction
        || byCapability
        || existingGrant
      ) {
        if (
          existingActivation
          && sameJson(existingActivation, { activationId, ...normalized })
          && byAuthoritySettlement === activationId
          && byTransaction === activationId
          && byCapability === grantId
          && existingGrant?.description === description
          && existingGrant.activationId === activationId
        ) {
          return this.#grantSnapshot(existingGrant);
        }
        fail('GRANT_IDENTITY_CONFLICT');
      }

      const offer = this.#offers.get(offerKey(normalized.offerId, normalized.offerVersion));
      if (!offer) fail('OFFER_NOT_FOUND');
      if (
        offer.providerId !== normalized.providerId
        || offer.serviceId !== normalized.serviceId
        || offer.resourceId !== normalized.resourceId
        || offer.resourceBinding !== normalized.resourceBinding
        || offer.fundingPolicyId !== normalized.fundingPolicyId
        || offer.fundingPolicyVersion !== normalized.fundingPolicyVersion
      ) {
        fail('OFFER_SCOPE_MISMATCH');
      }
      const now = this.#readNow();
      if (normalized.expiresAt <= now) fail('INVALID_INPUT');

      const activation = deepFreeze({ activationId, ...normalized });
      const record = {
        grantId,
        description,
        ...grantDescription,
        activation,
        sourceSettlementId: normalized.sourceSettlementId,
        transactionId: normalized.transactionId,
        paymentIntent: deepFreeze({
          intentId: normalized.paymentIntentDigest,
          requirementId: normalized.paymentRequirementDigest,
        }),
        lifecycle: GRANT_LIFECYCLE.ACTIVE,
        availableUnits: normalized.totalUnits,
        heldUnits: 0,
        consumedUnits: 0,
      };
      this.#assertCounters(record);
      this.#activations.set(activationId, activation);
      this.#grants.set(grantId, record);
      this.#activationByAuthoritySettlement.set(authoritySettlement, activationId);
      this.#activationByTransaction.set(normalized.transactionId, activationId);
      this.#grantByCapability.set(normalized.capabilityCommitment, grantId);
      this.#requests.set(grantId, new Map());
      return this.#grantSnapshot(record);
    });
  }

  getActivation(activationId) {
    return this.#runPublicOperation(() => {
      assertIdentifier(activationId);
      const record = this.#activations.get(activationId);
      return record ? snapshot(record) : null;
    });
  }

  getGrant(grantId) {
    return this.#runPublicOperation(() => {
      assertIdentifier(grantId);
      const record = this.#grants.get(grantId);
      if (!record) return null;
      this.#refreshGrant(record);
      return this.#grantSnapshot(record);
    });
  }

  revokeGrant(input) {
    return this.#runPublicOperation(() => {
      const value = captureObjectShape(input, ['grantId']);
      assertIdentifier(value.grantId);
      const record = this.#requireGrant(value.grantId);
      this.#refreshGrant(record);
      if (record.lifecycle === GRANT_LIFECYCLE.REVOKED) return this.#grantSnapshot(record);
      if (record.lifecycle !== GRANT_LIFECYCLE.ACTIVE) fail('INVALID_GRANT_TRANSITION');
      record.lifecycle = GRANT_LIFECYCLE.REVOKED;
      return this.#grantSnapshot(record);
    });
  }

  reserveRequest(input) {
    return this.#runPublicOperation(() => {
      const normalized = normalizeRequest(input);
      const grant = this.#requireGrant(normalized.grantId);
      const requests = this.#requests.get(grant.grantId);
      const existing = requests.get(normalized.requestId);

      if (existing) {
        if (!sameRequestIdentity(existing, normalized)) fail('REQUEST_ID_CONFLICT');
        return snapshot({
          replayed: true,
          executionAuthorized: false,
          request: this.#requestValue(existing),
        });
      }

      const admission = this.#requestAdmissionState();
      if (admission.hasUnresolvedExecution) fail('UNRESOLVED_EXECUTION');
      if (admission.requestCount >= MAX_HYDRATED_REQUESTS) {
        fail('REQUEST_CAPACITY_EXCEEDED');
      }

      this.#refreshGrant(grant);
      if (grant.lifecycle !== GRANT_LIFECYCLE.ACTIVE) fail('GRANT_NOT_ACTIVE');

      const offer = this.#offers.get(offerKey(grant.offerId, grant.offerVersion));
      if (!offer) fail('INVARIANT_VIOLATION');
      const costUnits = this.#serverCost(offer, grant, normalized);
      const requestDigest = sha256Commitment({
        modelVersion: normalized.modelVersion,
        grantId: grant.grantId,
        offerId: grant.offerId,
        offerVersion: grant.offerVersion,
        method: normalized.method,
        routeId: normalized.routeId,
        canonicalBodyDigest: normalized.canonicalBodyDigest,
        selectedContentType: normalized.selectedContentType,
        maxCostUnits: normalized.maxCostUnits,
        costUnits,
      });

      if (costUnits > normalized.maxCostUnits) fail('COST_NOT_AUTHORIZED');
      if (costUnits > grant.availableUnits) fail('INSUFFICIENT_UNITS');
      const record = {
        ...normalized,
        offerId: grant.offerId,
        offerVersion: grant.offerVersion,
        requestDigest,
        costUnits,
        state: REQUEST_STATE.RESERVED,
        cachedResult: null,
      };
      this.#refreshGrant(grant);
      if (grant.lifecycle !== GRANT_LIFECYCLE.ACTIVE) fail('GRANT_NOT_ACTIVE');
      grant.availableUnits -= costUnits;
      grant.heldUnits += costUnits;
      this.#assertCounters(grant);
      requests.set(normalized.requestId, record);

      return snapshot({
        replayed: false,
        executionAuthorized: false,
        request: this.#requestValue(record),
      });
    });
  }

  getRequest(input) {
    return this.#runPublicOperation(() => {
      const reference = normalizeReference(input);
      const grant = this.#grants.get(reference.grantId);
      if (!grant) return null;
      const record = this.#requests.get(reference.grantId)?.get(reference.requestId);
      return record ? snapshot(this.#requestValue(record)) : null;
    });
  }

  beginExecution(input) {
    return this.#runPublicOperation(() => {
      const { grant, request } = this.#requireRequest(input);
      if (request.state !== REQUEST_STATE.RESERVED) {
        return snapshot({ executionAuthorized: false, request: this.#requestValue(request) });
      }
      if (this.#requestAdmissionState().hasUnresolvedExecution) {
        fail('UNRESOLVED_EXECUTION');
      }
      this.#refreshGrant(grant);
      if (grant.lifecycle !== GRANT_LIFECYCLE.ACTIVE) fail('GRANT_NOT_ACTIVE');
      request.state = REQUEST_STATE.EXECUTING;
      return snapshot({ executionAuthorized: true, request: this.#requestValue(request) });
    });
  }

  releaseBeforeExecution(input) {
    return this.#runPublicOperation(() => {
      const { grant, request } = this.#requireRequest(input);
      if (request.state === REQUEST_STATE.FAILED_RELEASED) {
        return snapshot({ transitioned: false, request: this.#requestValue(request) });
      }
      if (request.state !== REQUEST_STATE.RESERVED) fail('INVALID_REQUEST_TRANSITION');

      grant.heldUnits -= request.costUnits;
      grant.availableUnits += request.costUnits;
      request.state = REQUEST_STATE.FAILED_RELEASED;
      this.#assertCounters(grant);
      return snapshot({ transitioned: true, request: this.#requestValue(request) });
    });
  }

  completeExecution(input) {
    return this.#runPublicOperation(() => {
      const value = captureObjectShape(input, ['grantId', 'requestId', 'cachedResult']);
      assertIdentifier(value.grantId);
      assertIdentifier(value.requestId);
      const cachedResult = normalizeCachedResult(value.cachedResult);
      const { grant, request } = this.#requireRequest({
        grantId: value.grantId,
        requestId: value.requestId,
      });
      assertCachedResultRepresentation(cachedResult, request.selectedContentType);

      if (request.state === REQUEST_STATE.SUCCEEDED) {
        if (!sameJson(request.cachedResult, cachedResult)) fail('RESULT_CONFLICT');
        return snapshot({ transitioned: false, request: this.#requestValue(request) });
      }
      if (request.state !== REQUEST_STATE.EXECUTING) fail('INVALID_REQUEST_TRANSITION');

      grant.heldUnits -= request.costUnits;
      grant.consumedUnits += request.costUnits;
      request.state = REQUEST_STATE.SUCCEEDED;
      request.cachedResult = cachedResult;
      this.#assertCounters(grant);
      return snapshot({ transitioned: true, request: this.#requestValue(request) });
    });
  }

  markOutcomeUnknown(input) {
    return this.#runPublicOperation(() => {
      const { request } = this.#requireRequest(input);
      if (request.state === REQUEST_STATE.OUTCOME_UNKNOWN) {
        return snapshot({ transitioned: false, request: this.#requestValue(request) });
      }
      if (request.state !== REQUEST_STATE.EXECUTING) fail('INVALID_REQUEST_TRANSITION');
      request.state = REQUEST_STATE.OUTCOME_UNKNOWN;
      return snapshot({ transitioned: true, request: this.#requestValue(request) });
    });
  }

  /**
   * Reconciles an ambiguous execution only as a privileged server-internal action.
   * The integration boundary must first obtain authoritative external evidence of
   * the outcome and must never expose this method directly to a capability holder
   * or unauthenticated client because FAILED_RELEASED restores spendable units.
   * This in-memory model cannot authenticate the actor or evidence; the boundary
   * must enforce both authority and evidence policy.
   */
  reconcileRequest(input) {
    return this.#runPublicOperation(() => {
      const value = captureObjectShape(
        input,
        ['grantId', 'requestId', 'outcome'],
        ['cachedResult'],
      );
      assertIdentifier(value.grantId);
      assertIdentifier(value.requestId);
      if (![REQUEST_STATE.SUCCEEDED, REQUEST_STATE.FAILED_RELEASED].includes(value.outcome)) {
        fail('INVALID_INPUT');
      }

      let cachedResult = null;
      if (value.outcome === REQUEST_STATE.SUCCEEDED) {
        if (!Object.hasOwn(value, 'cachedResult')) fail('INVALID_INPUT');
        cachedResult = normalizeCachedResult(value.cachedResult);
      } else if (Object.hasOwn(value, 'cachedResult')) {
        fail('INVALID_INPUT');
      }

      const { grant, request } = this.#requireRequest({
        grantId: value.grantId,
        requestId: value.requestId,
      });
      if (cachedResult) {
        assertCachedResultRepresentation(cachedResult, request.selectedContentType);
      }

      if (request.state === value.outcome) {
        if (
          value.outcome === REQUEST_STATE.SUCCEEDED
          && !sameJson(request.cachedResult, cachedResult)
        ) {
          fail('RECONCILIATION_CONFLICT');
        }
        return snapshot({ transitioned: false, request: this.#requestValue(request) });
      }
      if (request.state !== REQUEST_STATE.OUTCOME_UNKNOWN) fail('RECONCILIATION_CONFLICT');

      grant.heldUnits -= request.costUnits;
      if (value.outcome === REQUEST_STATE.SUCCEEDED) {
        grant.consumedUnits += request.costUnits;
        request.cachedResult = cachedResult;
      } else {
        grant.availableUnits += request.costUnits;
      }
      request.state = value.outcome;
      this.#assertCounters(grant);
      return snapshot({ transitioned: true, request: this.#requestValue(request) });
    });
  }

  #readNow() {
    const value = this.#invokeCallback(this.#now, [], 'INVALID_CLOCK');
    if (!Number.isSafeInteger(value) || value < 0) fail('INVALID_CLOCK');
    return value;
  }

  #runPublicOperation(operation) {
    if (this.#operationActive) {
      if (this.#callbackActive) this.#callbackReentryAttempted = true;
      fail('REENTRANT_OPERATION');
    }
    this.#operationActive = true;
    try {
      return operation();
    } finally {
      this.#operationActive = false;
    }
  }

  #invokeCallback(callback, args, invalidCode) {
    if (this.#callbackActive) fail('INVARIANT_VIOLATION');
    this.#callbackActive = true;
    this.#callbackReentryAttempted = false;

    let value;
    let callbackFailed = false;
    try {
      value = Reflect.apply(callback, undefined, args);
    } catch {
      callbackFailed = true;
    }

    const reentryAttempted = this.#callbackReentryAttempted;
    this.#callbackActive = false;
    this.#callbackReentryAttempted = false;
    if (callbackFailed || reentryAttempted) fail(invalidCode);
    return value;
  }

  #refreshGrant(record) {
    if (
      record.lifecycle === GRANT_LIFECYCLE.ACTIVE
      && this.#readNow() >= record.expiresAt
    ) {
      record.lifecycle = GRANT_LIFECYCLE.EXPIRED;
    }
  }

  #requireGrant(grantId) {
    const record = this.#grants.get(grantId);
    if (!record) fail('GRANT_NOT_FOUND');
    return record;
  }

  #requireRequest(input) {
    const reference = normalizeReference(input);
    const grant = this.#requireGrant(reference.grantId);
    const request = this.#requests.get(reference.grantId)?.get(reference.requestId);
    if (!request) fail('REQUEST_NOT_FOUND');
    return { grant, request };
  }

  #requestAdmissionState() {
    let requestCount = 0;
    let hasUnresolvedExecution = false;
    for (const requests of this.#requests.values()) {
      for (const request of requests.values()) {
        requestCount += 1;
        if (requestCount > MAX_HYDRATED_REQUESTS) fail('INVARIANT_VIOLATION');
        if (
          request.state === REQUEST_STATE.EXECUTING
          || request.state === REQUEST_STATE.OUTCOME_UNKNOWN
        ) {
          hasUnresolvedExecution = true;
        }
      }
    }
    return { requestCount, hasUnresolvedExecution };
  }

  #serverCost(offer, grant, request) {
    const context = snapshot({
      modelVersion: SERVICE_CREDIT_MODEL_VERSION,
      offer: {
        providerId: offer.providerId,
        serviceId: offer.serviceId,
        offerId: offer.offerId,
        offerVersion: offer.offerVersion,
        costPolicyId: offer.costPolicyId,
      },
      grant: {
        grantId: grant.grantId,
        offerId: grant.offerId,
        offerVersion: grant.offerVersion,
      },
      request: {
        modelVersion: request.modelVersion,
        grantId: request.grantId,
        requestId: request.requestId,
        method: request.method,
        routeId: request.routeId,
        canonicalBodyDigest: request.canonicalBodyDigest,
        selectedContentType: request.selectedContentType,
      },
    });

    const costUnits = this.#invokeCallback(this.#deriveCost, [context], 'INVALID_COST');
    if (!Number.isSafeInteger(costUnits) || costUnits <= 0) fail('INVALID_COST');
    return costUnits;
  }

  #assertCounters(record) {
    const counters = [
      record.totalUnits,
      record.availableUnits,
      record.heldUnits,
      record.consumedUnits,
    ];
    if (counters.some(value => !Number.isSafeInteger(value) || value < 0)) {
      fail('INVARIANT_VIOLATION');
    }
    if (
      record.totalUnits
      !== record.availableUnits + record.heldUnits + record.consumedUnits
    ) {
      fail('INVARIANT_VIOLATION');
    }
  }

  #grantSnapshot(record) {
    return snapshot({
      grantId: record.grantId,
      modelVersion: record.modelVersion,
      activationId: record.activationId,
      activation: record.activation,
      sourceSettlementId: record.sourceSettlementId,
      transactionId: record.transactionId,
      providerId: record.providerId,
      serviceId: record.serviceId,
      resourceId: record.resourceId,
      offerId: record.offerId,
      offerVersion: record.offerVersion,
      holderId: record.holderId,
      capabilityCommitment: record.capabilityCommitment,
      totalUnits: record.totalUnits,
      expiresAt: record.expiresAt,
      paymentIntent: record.paymentIntent,
      lifecycle: record.lifecycle,
      availableUnits: record.availableUnits,
      heldUnits: record.heldUnits,
      consumedUnits: record.consumedUnits,
      exhausted: record.availableUnits === 0,
    });
  }

  #requestValue(record) {
    return {
      modelVersion: record.modelVersion,
      grantId: record.grantId,
      requestId: record.requestId,
      requestDigest: record.requestDigest,
      offerId: record.offerId,
      offerVersion: record.offerVersion,
      method: record.method,
      routeId: record.routeId,
      canonicalBodyDigest: record.canonicalBodyDigest,
      selectedContentType: record.selectedContentType,
      maxCostUnits: record.maxCostUnits,
      costUnits: record.costUnits,
      state: record.state,
      cachedResult: record.cachedResult,
    };
  }
}
