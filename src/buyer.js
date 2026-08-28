import {
  decodeB64Json,
  encodeB64Json,
  EXPERIMENTAL_LIVE_NETWORK,
  HEADERS,
  MAX_X402_HEADER_ENCODED_BYTES,
  sameResource,
  sameRequirements,
  snapshotPaymentCapabilities,
  validateActiveUpfrontRequirement,
  validatePaymentPayloadEnvelope,
  validatePaymentRequired,
  validatePaymentRequiredForOfferSelection,
  validateRequirement,
} from './x402-wire.js';

const CREATE_OBJECT = Object.create;
const DEFINE_PROPERTY = Object.defineProperty;
const FREEZE_OBJECT = Object.freeze;
const HAS_OWN = Object.hasOwn;
const REFLECT_APPLY = Reflect.apply;
const STRUCTURED_CLONE = structuredClone;
const MAP_GET = Map.prototype.get;
const MAP_SET = Map.prototype.set;
const HASH_HEX = /^[0-9a-f]{64}$/;
const DEFINITIVE_SETTLEMENT_FAILURE = 'payment_settlement_failed';
const SETTLEMENT_FIELDS = Object.freeze(['success', 'network', 'transaction', 'payer', 'state']);
const OPTIONAL_SETTLEMENT_FIELDS = Object.freeze(['errorReason', 'retrySamePayment']);
const LEGACY_FLOW_OPTION = 'allowLegacyMissingPaymentFlowForCharacterization';
const RECOVERY_HANDLE_STATES = new Map();
const RECOVERY_STATES = new Set([
  'VALIDATED',
  'SUBMISSION_ACKNOWLEDGED',
  'SUBMISSION_OUTCOME_UNKNOWN',
  'MOMENTUM_INCLUDED',
  'DELIVERY_PENDING',
]);

function defineHiddenImmutable(owner, name, value) {
  const descriptor = CREATE_OBJECT(null);
  descriptor.value = value;
  descriptor.enumerable = false;
  descriptor.writable = false;
  descriptor.configurable = false;
  DEFINE_PROPERTY(owner, name, descriptor);
  return owner;
}

function shieldPaidFetchOutcome(outcome) {
  return defineHiddenImmutable(outcome, 'then', undefined);
}

function attachRecoveryHandle(owner, recoveryHandle) {
  return defineHiddenImmutable(owner, 'recoveryHandle', recoveryHandle);
}

function isUsableFinalHttpStatus(value) {
  return Number.isInteger(value) && value >= 200 && value <= 599;
}

function observePostSubmissionResponse(response) {
  if ((typeof response !== 'object' && typeof response !== 'function') || response === null) {
    return { kind: 'invalid' };
  }

  let httpStatus;
  try {
    httpStatus = response.status;
  } catch {
    return { kind: 'invalid' };
  }
  if (!isUsableFinalHttpStatus(httpStatus)) return { kind: 'invalid' };
  if (httpStatus >= 300 && httpStatus < 400) return { kind: 'redirect', httpStatus };

  try {
    const headers = response.headers;
    if ((typeof headers !== 'object' && typeof headers !== 'function') || headers === null) {
      return { kind: 'invalid', httpStatus };
    }
    const get = headers.get;
    if (typeof get !== 'function') return { kind: 'invalid', httpStatus };
    const settlementHeader = REFLECT_APPLY(get, headers, [HEADERS.PAYMENT_RESPONSE]);
    if (typeof settlementHeader !== 'string' && settlementHeader !== null) {
      return { kind: 'invalid', httpStatus };
    }
    return { kind: 'observed', httpStatus, settlementHeader };
  } catch {
    return { kind: 'invalid', httpStatus };
  }
}

export class PaymentSubmissionOutcomeUnknownError extends Error {
  constructor({ paymentRequired, paymentPayload, httpStatus } = {}) {
    super('payment_submission_outcome_unknown');
    this.name = 'PaymentSubmissionOutcomeUnknownError';
    this.code = 'payment_submission_outcome_unknown';
    this.retrySamePayment = true;
    this.action = 'reuse_and_reconcile_same_payment';
    Object.defineProperties(this, {
      paymentRequired: {
        value: STRUCTURED_CLONE(paymentRequired),
        enumerable: false,
        writable: false,
        configurable: false,
      },
      paymentPayload: {
        value: STRUCTURED_CLONE(paymentPayload),
        enumerable: false,
        writable: false,
        configurable: false,
      },
    });
    if (isUsableFinalHttpStatus(httpStatus)) this.httpStatus = httpStatus;
  }
}

export async function paidFetch(url, paymentClient, fetchImpl = fetch, options = {}) {
  const allowLegacyMissingPaymentFlow = validatePaidFetchOptions(options);
  const paymentCapabilities = snapshotPaymentClientCapabilities(paymentClient);
  const first = await fetchImpl(url);
  if (first.status !== 402) {
    return shieldPaidFetchOutcome({
      response: first,
      paymentRequired: null,
      paymentPayload: null,
      settlement: null,
    });
  }

  const requiredHeader = first.headers.get(HEADERS.PAYMENT_REQUIRED);
  if (!requiredHeader) throw new Error('402 response did not contain PAYMENT-REQUIRED');
  const paymentRequired = decodeB64Json(requiredHeader, {
    maxDecodedBytes: MAX_X402_HEADER_ENCODED_BYTES,
    maxEncodedBytes: MAX_X402_HEADER_ENCODED_BYTES,
  });
  validatePaymentRequiredForOfferSelection(paymentRequired);
  if (paymentRequired.accepts.length === 1) validatePaymentRequired(paymentRequired);
  const observedResponseUrl = first.url;
  const responseTarget = String(observedResponseUrl || url);
  const advertisedResource = new URL(paymentRequired.resource.url);
  if (advertisedResource.username || advertisedResource.password) throw new Error('payment resource URL must not contain credentials');
  if (advertisedResource.href !== new URL(responseTarget).href) {
    throw new Error('payment resource does not match the requested URL');
  }
  const accepted = selectPaymentRequirement(
    paymentRequired,
    paymentCapabilities,
    allowLegacyMissingPaymentFlow,
  );
  if (accepted.network === EXPERIMENTAL_LIVE_NETWORK && advertisedResource.protocol !== 'https:') {
    throw new Error('live payment resource must use HTTPS');
  }
  const selectedView = makeSelectedPaymentRequiredView(paymentRequired, accepted);
  const paymentPayload = await paymentClient.createPaymentPayload(
    selectedView.paymentRequired,
    selectedView.accepted,
  );
  validateBuyerPaymentPayload(paymentPayload, paymentRequired, accepted);
  const encodedPayment = encodeB64Json(paymentPayload, {
    maxEncodedBytes: MAX_X402_HEADER_ENCODED_BYTES,
  });
  // Bind settlement validation and recovery to the exact bytes submitted while
  // preserving the characterized payment object returned by the client.
  const submittedPaymentPayload = decodeB64Json(encodedPayment, {
    maxDecodedBytes: MAX_X402_HEADER_ENCODED_BYTES,
    maxEncodedBytes: MAX_X402_HEADER_ENCODED_BYTES,
  });
  validateBuyerPaymentPayload(submittedPaymentPayload, paymentRequired, accepted);

  const recoveryHandle = encodedPayment;
  const recoveryState = createRecoveryState({
    target: responseTarget,
    encodedPayment,
    paymentRequired,
    accepted,
  });
  return submitBoundPayment({
    fetchImpl,
    paymentPayload,
    paymentRequired,
    recoveryHandle,
    recoveryState,
    validationPaymentPayload: submittedPaymentPayload,
  });
}

export async function reconcilePayment(recoveryHandle, fetchImpl = fetch) {
  const recoveryState = recoveryStateForHandle(recoveryHandle);
  const paymentPayload = decodeB64Json(recoveryHandle, {
    maxDecodedBytes: MAX_X402_HEADER_ENCODED_BYTES,
    maxEncodedBytes: MAX_X402_HEADER_ENCODED_BYTES,
  });
  validateBuyerPaymentPayload(
    paymentPayload,
    recoveryState.paymentRequired,
    recoveryState.accepted,
  );
  const paymentRequired = STRUCTURED_CLONE(recoveryState.paymentRequired);
  return submitBoundPayment({
    fetchImpl,
    paymentPayload,
    paymentRequired,
    recoveryHandle,
    recoveryState,
    validationPaymentPayload: paymentPayload,
  });
}

function snapshotPaymentClientCapabilities(paymentClient) {
  if ((typeof paymentClient !== 'object' && typeof paymentClient !== 'function') || paymentClient === null) {
    throw new Error('payment client must be an object');
  }
  const descriptor = Object.getOwnPropertyDescriptor(paymentClient, 'paymentCapabilities');
  if (!descriptor) return null;
  if (!HAS_OWN(descriptor, 'value') || descriptor.enumerable ||
      descriptor.writable || descriptor.configurable) {
    throw new Error('paymentCapabilities must be an immutable non-enumerable own data property');
  }
  return snapshotPaymentCapabilities(descriptor.value);
}

function selectPaymentRequirement(paymentRequired, paymentCapabilities, allowLegacyMissingPaymentFlow) {
  if (paymentRequired.accepts.length === 1) {
    const accepted = paymentRequired.accepts[0];
    validateSelectedRequirement(accepted, allowLegacyMissingPaymentFlow);
    if (paymentCapabilities && !capabilitiesSupportUpfront(paymentCapabilities, paymentRequired, accepted)) {
      throw new Error('no supported upfront paymentFlow option');
    }
    return accepted;
  }
  if (!paymentCapabilities) {
    throw new Error('ambiguous payment requirements require payment client capabilities');
  }

  if (paymentCapabilities.x402Version !== paymentRequired.x402Version) {
    throw new Error('no supported upfront paymentFlow option');
  }
  for (const candidate of paymentRequired.accepts) {
    const route = paymentCapabilities.routes.find(capability =>
      capability.scheme === candidate.scheme &&
      capability.network === candidate.network &&
      capability.paymentFlows.includes('upfront'));
    if (!route) continue;
    if (!isPlainObject(candidate.extra) || candidate.extra.paymentFlow !== 'upfront') continue;
    validateActiveUpfrontRequirement(candidate);
    return candidate;
  }
  throw new Error('no supported upfront paymentFlow option');
}

function capabilitiesSupportUpfront(paymentCapabilities, paymentRequired, requirement) {
  return paymentCapabilities.x402Version === paymentRequired.x402Version &&
    paymentCapabilities.routes.some(capability =>
      capability.scheme === requirement.scheme &&
      capability.network === requirement.network &&
      capability.paymentFlows.includes('upfront'));
}

function validateSelectedRequirement(requirement, allowLegacyMissingPaymentFlow) {
  if (allowLegacyMissingPaymentFlow && isPlainObject(requirement.extra) &&
      !HAS_OWN(requirement.extra, 'paymentFlow')) {
    validateRequirement(requirement);
    return;
  }
  validateActiveUpfrontRequirement(requirement);
}

function makeSelectedPaymentRequiredView(paymentRequired, accepted) {
  let resource;
  let selected;
  try {
    resource = STRUCTURED_CLONE(paymentRequired.resource);
    selected = STRUCTURED_CLONE(accepted);
  } catch {
    throw new Error('payment requirements could not be detached');
  }
  return {
    paymentRequired: {
      x402Version: paymentRequired.x402Version,
      ...(HAS_OWN(paymentRequired, 'error') ? { error: paymentRequired.error } : {}),
      resource,
      accepts: [selected],
    },
    accepted: selected,
  };
}

function validatePaidFetchOptions(options) {
  if (!isPlainObject(options)) throw new Error('paidFetch options must be a plain object');
  const keys = Reflect.ownKeys(options);
  if (keys.some(key => key !== LEGACY_FLOW_OPTION)) {
    throw new Error('paidFetch options contain an unexpected field');
  }
  if (keys.length === 0) return false;
  const descriptor = Object.getOwnPropertyDescriptor(options, LEGACY_FLOW_OPTION);
  if (!descriptor || !HAS_OWN(descriptor, 'value') || typeof descriptor.value !== 'boolean') {
    throw new Error(`${LEGACY_FLOW_OPTION} must be a boolean`);
  }
  return descriptor.value;
}

function createRecoveryState({ target, encodedPayment, paymentRequired, accepted }) {
  return FREEZE_OBJECT({
    target,
    encodedPayment,
    paymentRequired: STRUCTURED_CLONE(paymentRequired),
    accepted: STRUCTURED_CLONE(accepted),
  });
}

function recoveryStateForHandle(recoveryHandle) {
  if (typeof recoveryHandle !== 'string' || recoveryHandle.length === 0 ||
      recoveryHandle.length > MAX_X402_HEADER_ENCODED_BYTES) {
    throw new Error('invalid payment recovery handle');
  }
  const recoveryState = REFLECT_APPLY(MAP_GET, RECOVERY_HANDLE_STATES, [recoveryHandle]);
  if (!recoveryState) throw new Error('invalid payment recovery handle');
  return recoveryState;
}

function exposeRecoveryHandle(owner, recoveryHandle, recoveryState) {
  const existingState = REFLECT_APPLY(MAP_GET, RECOVERY_HANDLE_STATES, [recoveryHandle]);
  attachRecoveryHandle(owner, recoveryHandle);
  if (existingState === undefined) {
    REFLECT_APPLY(MAP_SET, RECOVERY_HANDLE_STATES, [recoveryHandle, recoveryState]);
  }
  return owner;
}

async function submitBoundPayment({
  fetchImpl,
  paymentPayload,
  paymentRequired,
  recoveryHandle,
  recoveryState,
  validationPaymentPayload,
}) {
  const { target } = recoveryState;
  let response;
  try {
    response = await fetchImpl(target, {
      redirect: 'manual',
      headers: {
        [HEADERS.PAYMENT_SIGNATURE]: recoveryHandle,
      },
    });
  } catch {
    throw outcomeUnknown({
      paymentRequired: recoveryState.paymentRequired,
      paymentPayload: validationPaymentPayload,
    }, recoveryHandle, recoveryState);
  }
  const observation = observePostSubmissionResponse(response);
  if (observation.kind !== 'observed') {
    throw outcomeUnknown({
      paymentRequired: recoveryState.paymentRequired,
      paymentPayload: validationPaymentPayload,
      httpStatus: observation.httpStatus,
    }, recoveryHandle, recoveryState);
  }
  const { httpStatus, settlementHeader } = observation;
  if (!settlementHeader) {
    throw outcomeUnknown({
      paymentRequired: recoveryState.paymentRequired,
      paymentPayload: validationPaymentPayload,
      httpStatus,
    }, recoveryHandle, recoveryState);
  }
  let settlement;
  try {
    settlement = decodeB64Json(settlementHeader, {
      maxDecodedBytes: MAX_X402_HEADER_ENCODED_BYTES,
      maxEncodedBytes: MAX_X402_HEADER_ENCODED_BYTES,
    });
    validateSettlementResponse(settlement, validationPaymentPayload, httpStatus);
  } catch {
    throw outcomeUnknown({
      paymentRequired: recoveryState.paymentRequired,
      paymentPayload: validationPaymentPayload,
      httpStatus,
    }, recoveryHandle, recoveryState);
  }
  const outcome = shieldPaidFetchOutcome({ response, paymentRequired, paymentPayload, settlement });
  if (HAS_OWN(settlement, 'retrySamePayment') && settlement.retrySamePayment === true) {
    exposeRecoveryHandle(outcome, recoveryHandle, recoveryState);
  }
  return outcome;
}

function outcomeUnknown(details, recoveryHandle, recoveryState) {
  return exposeRecoveryHandle(
    new PaymentSubmissionOutcomeUnknownError(details),
    recoveryHandle,
    recoveryState,
  );
}

function validateBuyerPaymentPayload(paymentPayload, paymentRequired, accepted) {
  validatePaymentPayloadEnvelope(paymentPayload);
  if (paymentPayload.x402Version !== paymentRequired.x402Version ||
      !sameRequirements(paymentPayload.accepted, accepted) ||
      !sameResource(paymentPayload.resource, paymentRequired.resource)) {
    throw new Error('payment client returned a mismatched payload');
  }
  const transaction = paymentPayload.payload.transaction;
  if (typeof transaction.hash !== 'string' || !HASH_HEX.test(transaction.hash) ||
      typeof transaction.address !== 'string' || !transaction.address || transaction.address.length > 128) {
    throw new Error('payment client returned an invalid transaction identity');
  }
}

function validateSettlementResponse(settlement, paymentPayload, httpStatus) {
  if (!isUsableFinalHttpStatus(httpStatus)) throw new Error('invalid settlement response');
  if (!isPlainObject(settlement)) throw new Error('invalid settlement response');
  const allowed = new Set([...SETTLEMENT_FIELDS, ...OPTIONAL_SETTLEMENT_FIELDS]);
  const keys = Object.keys(settlement);
  if (keys.some(key => !allowed.has(key)) || SETTLEMENT_FIELDS.some(key => !HAS_OWN(settlement, key))) {
    throw new Error('invalid settlement response');
  }
  if (typeof settlement.success !== 'boolean' || typeof settlement.network !== 'string' ||
      typeof settlement.transaction !== 'string' || !HASH_HEX.test(settlement.transaction) ||
      typeof settlement.payer !== 'string' || !settlement.payer || settlement.payer.length > 128 ||
      typeof settlement.state !== 'string' || !settlement.state || settlement.state.length > 64) {
    throw new Error('invalid settlement response');
  }
  if (HAS_OWN(settlement, 'errorReason') &&
      (typeof settlement.errorReason !== 'string' || !settlement.errorReason || settlement.errorReason.length > 128)) {
    throw new Error('invalid settlement response');
  }
  if (HAS_OWN(settlement, 'retrySamePayment') && settlement.retrySamePayment !== true) {
    throw new Error('invalid settlement response');
  }

  const transaction = paymentPayload.payload.transaction;
  if (settlement.network !== paymentPayload.accepted.network || settlement.transaction !== transaction.hash ||
      settlement.payer !== transaction.address) {
    throw new Error('settlement response does not match the submitted payment');
  }
  if (settlement.success) {
    if (settlement.state !== 'MOMENTUM_INCLUDED' || httpStatus < 200 || httpStatus >= 300 ||
        HAS_OWN(settlement, 'errorReason') || HAS_OWN(settlement, 'retrySamePayment')) {
      throw new Error('invalid successful settlement response');
    }
    return;
  }
  if (httpStatus === 402) {
    if (settlement.state !== 'VALIDATED' || !HAS_OWN(settlement, 'errorReason') ||
        settlement.errorReason !== DEFINITIVE_SETTLEMENT_FAILURE ||
        HAS_OWN(settlement, 'retrySamePayment')) {
      throw new Error('invalid definitive settlement failure response');
    }
    return;
  }
  if (httpStatus !== 409 || !HAS_OWN(settlement, 'retrySamePayment') ||
      settlement.retrySamePayment !== true || !HAS_OWN(settlement, 'errorReason') ||
      typeof settlement.errorReason !== 'string' || !RECOVERY_STATES.has(settlement.state)) {
    throw new Error('invalid recovery settlement response');
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
