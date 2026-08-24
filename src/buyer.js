import {
  decodeB64Json,
  encodeB64Json,
  EXPERIMENTAL_LIVE_NETWORK,
  HEADERS,
  sameResource,
  sameRequirements,
  snapshotPaymentCapabilities,
  validateActiveUpfrontRequirement,
  validatePaymentPayloadEnvelope,
  validatePaymentRequired,
  validatePaymentRequiredForOfferSelection,
  validateRequirement,
} from './x402-wire.js';

const MAX_X402_HEADER_BYTES = 8 * 1024;
const HASH_HEX = /^[0-9a-f]{64}$/;
const DEFINITIVE_SETTLEMENT_FAILURE = 'payment_settlement_failed';
const SETTLEMENT_FIELDS = Object.freeze(['success', 'network', 'transaction', 'payer', 'state']);
const OPTIONAL_SETTLEMENT_FIELDS = Object.freeze(['errorReason', 'retrySamePayment']);
const LEGACY_FLOW_OPTION = 'allowLegacyMissingPaymentFlowForCharacterization';
const RECOVERY_STATES = new Set([
  'VALIDATED',
  'SUBMISSION_ACKNOWLEDGED',
  'SUBMISSION_OUTCOME_UNKNOWN',
  'MOMENTUM_INCLUDED',
  'DELIVERY_PENDING',
]);

export class PaymentSubmissionOutcomeUnknownError extends Error {
  constructor({ paymentRequired, paymentPayload, httpStatus } = {}) {
    super('payment_submission_outcome_unknown');
    this.name = 'PaymentSubmissionOutcomeUnknownError';
    this.code = 'payment_submission_outcome_unknown';
    this.retrySamePayment = true;
    this.action = 'reuse_and_reconcile_same_payment';
    Object.defineProperties(this, {
      paymentRequired: {
        value: structuredClone(paymentRequired),
        enumerable: false,
        writable: false,
        configurable: false,
      },
      paymentPayload: {
        value: structuredClone(paymentPayload),
        enumerable: false,
        writable: false,
        configurable: false,
      },
    });
    if (Number.isInteger(httpStatus)) this.httpStatus = httpStatus;
  }
}

export async function paidFetch(url, paymentClient, fetchImpl = fetch, options = {}) {
  const allowLegacyMissingPaymentFlow = validatePaidFetchOptions(options);
  const paymentCapabilities = snapshotPaymentClientCapabilities(paymentClient);
  const first = await fetchImpl(url);
  if (first.status !== 402) {
    return { response: first, paymentRequired: null, paymentPayload: null, settlement: null };
  }

  const requiredHeader = first.headers.get(HEADERS.PAYMENT_REQUIRED);
  if (!requiredHeader) throw new Error('402 response did not contain PAYMENT-REQUIRED');
  const paymentRequired = decodeB64Json(requiredHeader, { maxDecodedBytes: MAX_X402_HEADER_BYTES });
  validatePaymentRequiredForOfferSelection(paymentRequired);
  if (paymentRequired.accepts.length === 1) validatePaymentRequired(paymentRequired);
  const responseUrl = first.url || String(url);
  const advertisedResource = new URL(paymentRequired.resource.url);
  if (advertisedResource.username || advertisedResource.password) throw new Error('payment resource URL must not contain credentials');
  if (advertisedResource.href !== new URL(responseUrl).href) {
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
  const encodedPayment = encodeB64Json(paymentPayload);
  if (Buffer.byteLength(encodedPayment, 'utf8') > MAX_X402_HEADER_BYTES) {
    throw new Error('payment payload exceeds the supported header size');
  }
  // Bind settlement validation and recovery to the exact bytes submitted while
  // preserving the characterized payment object returned by the client.
  const submittedPaymentPayload = decodeB64Json(encodedPayment, { maxDecodedBytes: MAX_X402_HEADER_BYTES });
  validateBuyerPaymentPayload(submittedPaymentPayload, paymentRequired, accepted);

  let second;
  try {
    second = await fetchImpl(responseUrl, {
      redirect: 'manual',
      headers: {
        [HEADERS.PAYMENT_SIGNATURE]: encodedPayment,
      },
    });
  } catch {
    throw outcomeUnknown({ paymentRequired, paymentPayload: submittedPaymentPayload });
  }
  if (second.status >= 300 && second.status < 400) {
    throw outcomeUnknown({ paymentRequired, paymentPayload: submittedPaymentPayload, httpStatus: second.status });
  }
  const settlementHeader = second.headers.get(HEADERS.PAYMENT_RESPONSE);
  if (!settlementHeader) {
    throw outcomeUnknown({ paymentRequired, paymentPayload: submittedPaymentPayload, httpStatus: second.status });
  }
  let settlement;
  try {
    settlement = decodeB64Json(settlementHeader, { maxDecodedBytes: MAX_X402_HEADER_BYTES });
    validateSettlementResponse(settlement, submittedPaymentPayload, second.status);
  } catch {
    throw outcomeUnknown({ paymentRequired, paymentPayload: submittedPaymentPayload, httpStatus: second.status });
  }
  return { response: second, paymentRequired, paymentPayload, settlement };
}

function snapshotPaymentClientCapabilities(paymentClient) {
  if ((typeof paymentClient !== 'object' && typeof paymentClient !== 'function') || paymentClient === null) {
    throw new Error('payment client must be an object');
  }
  const descriptor = Object.getOwnPropertyDescriptor(paymentClient, 'paymentCapabilities');
  if (!descriptor) return null;
  if (!Object.hasOwn(descriptor, 'value') || descriptor.enumerable ||
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
      !Object.hasOwn(requirement.extra, 'paymentFlow')) {
    validateRequirement(requirement);
    return;
  }
  validateActiveUpfrontRequirement(requirement);
}

function makeSelectedPaymentRequiredView(paymentRequired, accepted) {
  let resource;
  let selected;
  try {
    resource = structuredClone(paymentRequired.resource);
    selected = structuredClone(accepted);
  } catch {
    throw new Error('payment requirements could not be detached');
  }
  return {
    paymentRequired: {
      x402Version: paymentRequired.x402Version,
      ...(Object.hasOwn(paymentRequired, 'error') ? { error: paymentRequired.error } : {}),
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
  if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'boolean') {
    throw new Error(`${LEGACY_FLOW_OPTION} must be a boolean`);
  }
  return descriptor.value;
}

function outcomeUnknown(details) {
  return new PaymentSubmissionOutcomeUnknownError(details);
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
  if (!isPlainObject(settlement)) throw new Error('invalid settlement response');
  const allowed = new Set([...SETTLEMENT_FIELDS, ...OPTIONAL_SETTLEMENT_FIELDS]);
  const keys = Object.keys(settlement);
  if (keys.some(key => !allowed.has(key)) || SETTLEMENT_FIELDS.some(key => !Object.hasOwn(settlement, key))) {
    throw new Error('invalid settlement response');
  }
  if (typeof settlement.success !== 'boolean' || typeof settlement.network !== 'string' ||
      typeof settlement.transaction !== 'string' || !HASH_HEX.test(settlement.transaction) ||
      typeof settlement.payer !== 'string' || !settlement.payer || settlement.payer.length > 128 ||
      typeof settlement.state !== 'string' || !settlement.state || settlement.state.length > 64) {
    throw new Error('invalid settlement response');
  }
  if (Object.hasOwn(settlement, 'errorReason') &&
      (typeof settlement.errorReason !== 'string' || !settlement.errorReason || settlement.errorReason.length > 128)) {
    throw new Error('invalid settlement response');
  }
  if (Object.hasOwn(settlement, 'retrySamePayment') && settlement.retrySamePayment !== true) {
    throw new Error('invalid settlement response');
  }

  const transaction = paymentPayload.payload.transaction;
  if (settlement.network !== paymentPayload.accepted.network || settlement.transaction !== transaction.hash ||
      settlement.payer !== transaction.address) {
    throw new Error('settlement response does not match the submitted payment');
  }
  if (settlement.success) {
    if (settlement.state !== 'MOMENTUM_INCLUDED' || httpStatus < 200 || httpStatus >= 300 ||
        Object.hasOwn(settlement, 'errorReason') || Object.hasOwn(settlement, 'retrySamePayment')) {
      throw new Error('invalid successful settlement response');
    }
    return;
  }
  if (httpStatus === 402) {
    if (settlement.state !== 'VALIDATED' ||
        settlement.errorReason !== DEFINITIVE_SETTLEMENT_FAILURE ||
        Object.hasOwn(settlement, 'retrySamePayment')) {
      throw new Error('invalid definitive settlement failure response');
    }
    return;
  }
  if (httpStatus !== 409 || settlement.retrySamePayment !== true ||
      typeof settlement.errorReason !== 'string' || !RECOVERY_STATES.has(settlement.state)) {
    throw new Error('invalid recovery settlement response');
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
