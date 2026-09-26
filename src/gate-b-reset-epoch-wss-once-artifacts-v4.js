import { createHash } from 'node:crypto';
import { types as utilTypes } from 'node:util';

import { canonicalJson } from './canonical.js';
import { classifyDynamicPlasmaCompatibility } from './zenon/dynamic-plasma-compatibility.js';
import {
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_CHAIN_PROFILE,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROVENANCE,
  selectPublicTestnetDynamicPlasmaResetEpochExecutionPolicy,
} from './zenon/operator-trusted-testnet-profile.js';

const ERROR_CODE = 'gate_b_reset_epoch_wss_once_artifact_v4_invalid';
const DIGEST_DOMAIN = 'zenon-x402-gate-b-reset-epoch-wss-once-config-v4';
const MAXIMUM_CONFIGURATION_BYTES = 64 * 1024;
const LOWERCASE_DIGEST = /^[0-9a-f]{64}$/;
const LOWERCASE_HASH = /^[0-9a-f]{64}$/;
const CANONICAL_AMOUNT = /^[1-9][0-9]{0,39}$/;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const WORKSPACE_GENERATION = /^[a-z0-9][a-z0-9-]{7,63}$/;
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

const POLICY_FIELDS = Object.freeze([
  'eventId',
  'liveAcknowledgement',
  'operatorTrustAcknowledgement',
  'profileName',
  'rpcEndpoint',
  'wssAcknowledgement',
]);
const CHAIN_PROFILE_FIELDS = Object.freeze([
  'chainIdentifier', 'genesisMomentumHash', 'version',
]);
const FRONTIER_FIELDS = Object.freeze([
  'chainIdentifier', 'hash', 'height', 'nextFusionPrice',
  'nextWorkPrice', 'version',
]);
const RPC_OBSERVATION_FIELDS = Object.freeze([
  'availablePlasma', 'basePlasma', 'requiredDifficulty',
]);
const QUOTE_FIELDS = Object.freeze([
  'powRequired', 'pricingMode', 'requiredDifficulty', 'selectedFusedPlasma',
]);
const DYNAMIC_PLASMA_FIELDS = Object.freeze([
  'enforcementHeight', 'frontier', 'quote', 'rpcObservation',
]);
const EXECUTION_BINDING_FIELDS = Object.freeze([
  'chainProfile', 'dynamicPlasma', 'policySelection',
]);
const WORKSPACE_FIELDS = Object.freeze(['generation', 'workspaceFamily']);
const PAYMENT_REQUEST_FIELDS = Object.freeze([
  'amount', 'asset', 'payTo', 'requestId', 'resource',
]);
const PRICING_OBSERVATION_FIELDS = Object.freeze([
  'afterFrontier', 'beforeFrontier', 'chainProfile', 'rpcObservation',
]);
const CONFIGURATION_INPUT_FIELDS = Object.freeze([
  'paymentRequest', 'policySelection', 'pricingObservation',
  'schemaVersion', 'workspace',
]);
const CONFIGURATION_FIELDS = Object.freeze([
  'artifactFamily', 'configurationVersion', 'executionBinding',
  'liveRunAuthorized', 'mode', 'paymentRequest', 'policySelection',
  'publicationAuthorized', 'status', 'workspace',
]);
const REVIEW_FIELDS = Object.freeze([
  'artifactFamily', 'configurationDigest', 'executionBinding',
  'reviewVersion', 'status', 'workspace',
]);
const AUTHORIZATION_FIELDS = Object.freeze([
  'artifactFamily', 'authorizationVersion', 'configurationDigest',
  'executionBinding', 'liveRunAuthorized', 'offlineFakeExecutionAuthorized',
  'publicationAuthorized', 'reviewVersion', 'status', 'workspace',
]);

export const GATE_B_RESET_EPOCH_WSS_ONCE_ARTIFACT_FAMILY_V4 =
  'gate-b-reset-epoch-wss-once-offline-v4';
export const GATE_B_RESET_EPOCH_WSS_ONCE_WORKSPACE_FAMILY_V4 =
  'gate-b-reset-epoch-wss-once-workspace-v4';
export const GATE_B_RESET_EPOCH_WSS_ONCE_MODE_V4 =
  'INJECTED_OFFLINE_FAKES_ONLY';
export const GATE_B_RESET_EPOCH_WSS_ONCE_STATUS_V4 = Object.freeze({
  AUTHORIZED:
    'OFFLINE_FAKE_EXECUTION_AUTHORIZED_LIVE_RUN_AND_PUBLICATION_NOT_AUTHORIZED',
  CONFIGURED: 'CONFIGURED_INJECTED_OFFLINE_FAKES_ONLY',
  REVIEWED: 'REVIEW_VALID_INJECTED_OFFLINE_FAKES_ONLY',
});

export class GateBResetEpochWssOnceArtifactV4Error extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBResetEpochWssOnceArtifactV4Error';
    this.code = ERROR_CODE;
    this.stack = undefined;
  }
}

function fail() {
  throw new GateBResetEpochWssOnceArtifactV4Error();
}

function exactPlainObject(value, fields) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value) ||
      ARRAY_IS_ARRAY(value) || GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const keys = REFLECT_OWN_KEYS(value);
  if (keys.length !== fields.length) fail();
  const snapshot = Object.create(null);
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, field);
    if (!descriptor || !HAS_OWN(descriptor, 'value') ||
        descriptor.enumerable !== true) fail();
    snapshot[field] = descriptor.value;
  }
  for (let index = 0; index < keys.length; index += 1) {
    if (typeof keys[index] !== 'string' || !fields.includes(keys[index])) fail();
  }
  return snapshot;
}

function boundedString(value, maximumBytes) {
  if (typeof value !== 'string' || value.length < 1 ||
      Buffer.byteLength(value, 'utf8') > maximumBytes ||
      /[\u0000-\u001f\u007f]/u.test(value)) fail();
  return value;
}

function nonnegativeSafeInteger(value) {
  if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) fail();
  return value;
}

function positiveSafeInteger(value) {
  nonnegativeSafeInteger(value);
  if (value === 0) fail();
  return value;
}

function exactPolicySelection(value) {
  const selection = exactPlainObject(value, POLICY_FIELDS);
  for (let index = 0; index < POLICY_FIELDS.length; index += 1) {
    if (typeof selection[POLICY_FIELDS[index]] !== 'string') fail();
  }
  const candidate = {
    eventId: selection.eventId,
    liveAcknowledgement: selection.liveAcknowledgement,
    operatorTrustAcknowledgement: selection.operatorTrustAcknowledgement,
    profileName: selection.profileName,
    rpcEndpoint: selection.rpcEndpoint,
    wssAcknowledgement: selection.wssAcknowledgement,
  };
  try {
    selectPublicTestnetDynamicPlasmaResetEpochExecutionPolicy(candidate);
  } catch {
    fail();
  }
  return Object.freeze(candidate);
}

function exactChainProfile(value) {
  const profile = exactPlainObject(value, CHAIN_PROFILE_FIELDS);
  if (profile.version !== PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_CHAIN_PROFILE.version ||
      profile.chainIdentifier !==
        PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_CHAIN_PROFILE.chainIdentifier ||
      profile.genesisMomentumHash !==
        PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_CHAIN_PROFILE.genesisMomentumHash) fail();
  return Object.freeze({
    chainIdentifier: profile.chainIdentifier,
    genesisMomentumHash: profile.genesisMomentumHash,
    version: profile.version,
  });
}

function exactFrontier(value, chainIdentifier) {
  const frontier = exactPlainObject(value, FRONTIER_FIELDS);
  if (frontier.chainIdentifier !== chainIdentifier ||
      typeof frontier.hash !== 'string' || !LOWERCASE_HASH.test(frontier.hash)) fail();
  positiveSafeInteger(frontier.height);
  nonnegativeSafeInteger(frontier.nextFusionPrice);
  nonnegativeSafeInteger(frontier.nextWorkPrice);
  nonnegativeSafeInteger(frontier.version);
  return Object.freeze({
    chainIdentifier: frontier.chainIdentifier,
    hash: frontier.hash,
    height: frontier.height,
    nextFusionPrice: frontier.nextFusionPrice,
    nextWorkPrice: frontier.nextWorkPrice,
    version: frontier.version,
  });
}

function exactRpcObservation(value) {
  const observation = exactPlainObject(value, RPC_OBSERVATION_FIELDS);
  nonnegativeSafeInteger(observation.availablePlasma);
  positiveSafeInteger(observation.basePlasma);
  nonnegativeSafeInteger(observation.requiredDifficulty);
  return Object.freeze({
    availablePlasma: observation.availablePlasma,
    basePlasma: observation.basePlasma,
    requiredDifficulty: observation.requiredDifficulty,
  });
}

function classifierFrontier(frontier) {
  return {
    height: frontier.height,
    hash: frontier.hash,
    version: frontier.version,
    nextFusionPrice: frontier.nextFusionPrice,
    nextWorkPrice: frontier.nextWorkPrice,
  };
}

function exactDerivedQuote(value) {
  const quote = exactPlainObject(value, QUOTE_FIELDS);
  if (typeof quote.powRequired !== 'boolean' ||
      (quote.pricingMode !== 'FUSION_ONLY' &&
       quote.pricingMode !== 'FUSION_AND_POW')) fail();
  nonnegativeSafeInteger(quote.requiredDifficulty);
  nonnegativeSafeInteger(quote.selectedFusedPlasma);
  if (quote.powRequired !== (quote.requiredDifficulty !== 0)) fail();
  return Object.freeze({
    powRequired: quote.powRequired,
    pricingMode: quote.pricingMode,
    requiredDifficulty: quote.requiredDifficulty,
    selectedFusedPlasma: quote.selectedFusedPlasma,
  });
}

function deriveDynamicPlasma(frontier, rpcObservation) {
  const enforcementHeight =
    PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROVENANCE
      .dynamicPlasmaEnforcementHeight;
  if (!Number.isSafeInteger(enforcementHeight) || enforcementHeight < 1 ||
      frontier.height <= enforcementHeight || frontier.version !== 2 ||
      frontier.nextFusionPrice <= 0 || frontier.nextWorkPrice <= 0) fail();
  let compatibility;
  try {
    compatibility = classifyDynamicPlasmaCompatibility({
      chainProfileMatch: { classification: 'MATCH' },
      beforeFrontier: classifierFrontier(frontier),
      rpcObservation,
      afterFrontier: classifierFrontier(frontier),
    });
  } catch {
    fail();
  }
  if (compatibility.classification !== 'DP_ACTIVE' ||
      compatibility.quote === null ||
      compatibility.quote.sdk105BasePlasmaUnderpricingDetected === true) fail();
  const quote = exactDerivedQuote({
    powRequired: compatibility.quote.powRequired,
    pricingMode: compatibility.quote.pricingMode,
    requiredDifficulty: compatibility.quote.requiredDifficulty,
    selectedFusedPlasma: compatibility.quote.selectedFusedPlasma,
  });
  return Object.freeze({
    enforcementHeight,
    frontier,
    quote,
    rpcObservation,
  });
}

function pricingBindingFromInput(value) {
  const observation = exactPlainObject(value, PRICING_OBSERVATION_FIELDS);
  const chainProfile = exactChainProfile(observation.chainProfile);
  const before = exactFrontier(observation.beforeFrontier, chainProfile.chainIdentifier);
  const after = exactFrontier(observation.afterFrontier, chainProfile.chainIdentifier);
  if (canonicalJson(before) !== canonicalJson(after)) fail();
  return Object.freeze({
    chainProfile,
    dynamicPlasma: deriveDynamicPlasma(
      before,
      exactRpcObservation(observation.rpcObservation),
    ),
  });
}

function exactDynamicPlasma(value, chainProfile) {
  const dynamicPlasma = exactPlainObject(value, DYNAMIC_PLASMA_FIELDS);
  const frontier = exactFrontier(
    dynamicPlasma.frontier,
    chainProfile.chainIdentifier,
  );
  const rpcObservation = exactRpcObservation(dynamicPlasma.rpcObservation);
  const derived = deriveDynamicPlasma(frontier, rpcObservation);
  const quote = exactDerivedQuote(dynamicPlasma.quote);
  if (dynamicPlasma.enforcementHeight !== derived.enforcementHeight ||
      canonicalJson(quote) !== canonicalJson(derived.quote)) fail();
  return derived;
}

function exactExecutionBinding(value) {
  const binding = exactPlainObject(value, EXECUTION_BINDING_FIELDS);
  const policySelection = exactPolicySelection(binding.policySelection);
  const chainProfile = exactChainProfile(binding.chainProfile);
  const dynamicPlasma = exactDynamicPlasma(binding.dynamicPlasma, chainProfile);
  return Object.freeze({ chainProfile, dynamicPlasma, policySelection });
}

function exactWorkspace(value) {
  const workspace = exactPlainObject(value, WORKSPACE_FIELDS);
  if (workspace.workspaceFamily !==
      GATE_B_RESET_EPOCH_WSS_ONCE_WORKSPACE_FAMILY_V4 ||
      typeof workspace.generation !== 'string' ||
      !WORKSPACE_GENERATION.test(workspace.generation)) fail();
  return Object.freeze({
    generation: workspace.generation,
    workspaceFamily: GATE_B_RESET_EPOCH_WSS_ONCE_WORKSPACE_FAMILY_V4,
  });
}

function exactPaymentRequest(value) {
  const request = exactPlainObject(value, PAYMENT_REQUEST_FIELDS);
  if (typeof request.amount !== 'string' || !CANONICAL_AMOUNT.test(request.amount) ||
      typeof request.requestId !== 'string' || !REQUEST_ID.test(request.requestId)) fail();
  return Object.freeze({
    amount: request.amount,
    asset: boundedString(request.asset, 256),
    payTo: boundedString(request.payTo, 256),
    requestId: request.requestId,
    resource: boundedString(request.resource, 2048),
  });
}

function freezeConfiguration(value) {
  const configuration = exactPlainObject(value, CONFIGURATION_FIELDS);
  if (configuration.artifactFamily !==
        GATE_B_RESET_EPOCH_WSS_ONCE_ARTIFACT_FAMILY_V4 ||
      configuration.configurationVersion !== 4 ||
      configuration.liveRunAuthorized !== false ||
      configuration.mode !== GATE_B_RESET_EPOCH_WSS_ONCE_MODE_V4 ||
      configuration.publicationAuthorized !== false ||
      configuration.status !== GATE_B_RESET_EPOCH_WSS_ONCE_STATUS_V4.CONFIGURED) fail();
  const policySelection = exactPolicySelection(configuration.policySelection);
  const executionBinding = exactExecutionBinding(configuration.executionBinding);
  if (canonicalJson(policySelection) !==
      canonicalJson(executionBinding.policySelection)) fail();
  return Object.freeze({
    artifactFamily: GATE_B_RESET_EPOCH_WSS_ONCE_ARTIFACT_FAMILY_V4,
    configurationVersion: 4,
    executionBinding,
    liveRunAuthorized: false,
    mode: GATE_B_RESET_EPOCH_WSS_ONCE_MODE_V4,
    paymentRequest: exactPaymentRequest(configuration.paymentRequest),
    policySelection,
    publicationAuthorized: false,
    status: GATE_B_RESET_EPOCH_WSS_ONCE_STATUS_V4.CONFIGURED,
    workspace: exactWorkspace(configuration.workspace),
  });
}

function configurationDigest(configuration) {
  return createHash('sha256')
    .update(`${DIGEST_DOMAIN}\n${canonicalJson(configuration)}`, 'utf8')
    .digest('hex');
}

function freezeReview(value) {
  const review = exactPlainObject(value, REVIEW_FIELDS);
  if (review.artifactFamily !== GATE_B_RESET_EPOCH_WSS_ONCE_ARTIFACT_FAMILY_V4 ||
      review.reviewVersion !== 4 ||
      review.status !== GATE_B_RESET_EPOCH_WSS_ONCE_STATUS_V4.REVIEWED ||
      typeof review.configurationDigest !== 'string' ||
      !LOWERCASE_DIGEST.test(review.configurationDigest)) fail();
  return Object.freeze({
    artifactFamily: GATE_B_RESET_EPOCH_WSS_ONCE_ARTIFACT_FAMILY_V4,
    configurationDigest: review.configurationDigest,
    executionBinding: exactExecutionBinding(review.executionBinding),
    reviewVersion: 4,
    status: GATE_B_RESET_EPOCH_WSS_ONCE_STATUS_V4.REVIEWED,
    workspace: exactWorkspace(review.workspace),
  });
}

function freezeAuthorization(value) {
  const authorization = exactPlainObject(value, AUTHORIZATION_FIELDS);
  if (authorization.artifactFamily !==
        GATE_B_RESET_EPOCH_WSS_ONCE_ARTIFACT_FAMILY_V4 ||
      authorization.authorizationVersion !== 4 ||
      authorization.reviewVersion !== 4 ||
      authorization.liveRunAuthorized !== false ||
      authorization.offlineFakeExecutionAuthorized !== true ||
      authorization.publicationAuthorized !== false ||
      authorization.status !== GATE_B_RESET_EPOCH_WSS_ONCE_STATUS_V4.AUTHORIZED ||
      typeof authorization.configurationDigest !== 'string' ||
      !LOWERCASE_DIGEST.test(authorization.configurationDigest)) fail();
  return Object.freeze({
    artifactFamily: GATE_B_RESET_EPOCH_WSS_ONCE_ARTIFACT_FAMILY_V4,
    authorizationVersion: 4,
    configurationDigest: authorization.configurationDigest,
    executionBinding: exactExecutionBinding(authorization.executionBinding),
    liveRunAuthorized: false,
    offlineFakeExecutionAuthorized: true,
    publicationAuthorized: false,
    reviewVersion: 4,
    status: GATE_B_RESET_EPOCH_WSS_ONCE_STATUS_V4.AUTHORIZED,
    workspace: exactWorkspace(authorization.workspace),
  });
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function parseConfigurationBytes(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 3 ||
      bytes.length > MAXIMUM_CONFIGURATION_BYTES ||
      bytes[bytes.length - 1] !== 0x0a) fail();
  const body = bytes.subarray(0, bytes.length - 1);
  if (body.includes(0x0a) || body.includes(0x0d)) fail();
  const text = UTF8_DECODER.decode(body);
  if (Buffer.byteLength(text, 'utf8') !== body.length) fail();
  const configuration = freezeConfiguration(JSON.parse(text));
  if (canonicalJson(configuration) !== text) fail();
  return configuration;
}

export function createGateBResetEpochWssOnceConfigurationV4(input) {
  try {
    const snapshot = exactPlainObject(input, CONFIGURATION_INPUT_FIELDS);
    if (snapshot.schemaVersion !== 4) fail();
    const policySelection = exactPolicySelection(snapshot.policySelection);
    const pricingBinding = pricingBindingFromInput(snapshot.pricingObservation);
    const { chainProfile, dynamicPlasma } = pricingBinding;
    return freezeConfiguration({
      artifactFamily: GATE_B_RESET_EPOCH_WSS_ONCE_ARTIFACT_FAMILY_V4,
      configurationVersion: 4,
      executionBinding: { chainProfile, dynamicPlasma, policySelection },
      liveRunAuthorized: false,
      mode: GATE_B_RESET_EPOCH_WSS_ONCE_MODE_V4,
      paymentRequest: snapshot.paymentRequest,
      policySelection,
      publicationAuthorized: false,
      status: GATE_B_RESET_EPOCH_WSS_ONCE_STATUS_V4.CONFIGURED,
      workspace: snapshot.workspace,
    });
  } catch {
    fail();
  }
}

export function serializeGateBResetEpochWssOnceConfigurationV4(value) {
  try {
    const configuration = freezeConfiguration(value);
    const bytes = Buffer.from(`${canonicalJson(configuration)}\n`, 'utf8');
    if (bytes.length < 3 || bytes.length > MAXIMUM_CONFIGURATION_BYTES) fail();
    return bytes;
  } catch {
    fail();
  }
}

export function parseGateBResetEpochWssOnceConfigurationV4(bytes) {
  try {
    return parseConfigurationBytes(bytes);
  } catch {
    fail();
  }
}

export function reviewGateBResetEpochWssOnceConfigurationV4(bytes) {
  try {
    const configuration = parseConfigurationBytes(bytes);
    return freezeReview({
      artifactFamily: GATE_B_RESET_EPOCH_WSS_ONCE_ARTIFACT_FAMILY_V4,
      configurationDigest: configurationDigest(configuration),
      executionBinding: configuration.executionBinding,
      reviewVersion: 4,
      status: GATE_B_RESET_EPOCH_WSS_ONCE_STATUS_V4.REVIEWED,
      workspace: configuration.workspace,
    });
  } catch {
    fail();
  }
}

export function createGateBResetEpochWssOnceAuthorizationV4(
  configurationBytes,
  review,
) {
  try {
    const configuration = parseConfigurationBytes(configurationBytes);
    const checkedReview = freezeReview(review);
    if (checkedReview.configurationDigest !== configurationDigest(configuration) ||
        !same(checkedReview.executionBinding, configuration.executionBinding) ||
        !same(checkedReview.workspace, configuration.workspace)) fail();
    return freezeAuthorization({
      artifactFamily: GATE_B_RESET_EPOCH_WSS_ONCE_ARTIFACT_FAMILY_V4,
      authorizationVersion: 4,
      configurationDigest: checkedReview.configurationDigest,
      executionBinding: configuration.executionBinding,
      liveRunAuthorized: false,
      offlineFakeExecutionAuthorized: true,
      publicationAuthorized: false,
      reviewVersion: 4,
      status: GATE_B_RESET_EPOCH_WSS_ONCE_STATUS_V4.AUTHORIZED,
      workspace: configuration.workspace,
    });
  } catch {
    fail();
  }
}

export function bindGateBResetEpochWssOnceArtifactsV4(
  configurationBytes,
  review,
  authorization,
) {
  try {
    const configuration = parseConfigurationBytes(configurationBytes);
    const checkedReview = freezeReview(review);
    const checkedAuthorization = freezeAuthorization(authorization);
    const digest = configurationDigest(configuration);
    if (checkedReview.configurationDigest !== digest ||
        checkedAuthorization.configurationDigest !== digest ||
        !same(configuration.executionBinding, checkedReview.executionBinding) ||
        !same(configuration.executionBinding, checkedAuthorization.executionBinding) ||
        !same(configuration.workspace, checkedReview.workspace) ||
        !same(configuration.workspace, checkedAuthorization.workspace)) fail();
    return Object.freeze({
      authorization: checkedAuthorization,
      configuration,
      configurationDigest: digest,
      executionBinding: configuration.executionBinding,
      paymentRequest: configuration.paymentRequest,
      review: checkedReview,
      workspace: configuration.workspace,
    });
  } catch {
    fail();
  }
}

export function assertGateBResetEpochWssOnceExecutionBindingV4(value) {
  try {
    return exactExecutionBinding(value);
  } catch {
    fail();
  }
}
