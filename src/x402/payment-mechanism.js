/**
 * Contract implemented by a payment mechanism selected by the x402 core.
 *
 * Phase 1 defines the boundary only. Existing Zenon validation and runtime
 * composition remain in their current modules until a later migration.
 */
export class X402PaymentMechanism {
  get scheme() {
    return notImplemented('X402PaymentMechanism', 'scheme');
  }

  validateRequirement(_requirement) {
    return notImplemented('X402PaymentMechanism', 'validateRequirement');
  }

  validatePaymentRequired(_paymentRequired) {
    return notImplemented('X402PaymentMechanism', 'validatePaymentRequired');
  }

  validatePaymentPayloadEnvelope(_paymentPayload) {
    return notImplemented('X402PaymentMechanism', 'validatePaymentPayloadEnvelope');
  }

  sameRequirements(_left, _right) {
    return notImplemented('X402PaymentMechanism', 'sameRequirements');
  }
}

const REQUIRED_METHODS = Object.freeze([
  'validateRequirement',
  'validatePaymentRequired',
  'validatePaymentPayloadEnvelope',
  'sameRequirements',
]);

/**
 * Validate a structural mechanism implementation without requiring
 * inheritance. This permits future adapters to remain independently owned.
 */
export function assertX402PaymentMechanism(value) {
  assertContractObject(value, 'X402PaymentMechanism');
  if (typeof value.scheme !== 'string' || value.scheme.length === 0) {
    throw new TypeError('X402PaymentMechanism.scheme must be a non-empty string');
  }
  for (const method of REQUIRED_METHODS) {
    if (typeof value[method] !== 'function') {
      throw new TypeError(`X402PaymentMechanism.${method}() must be implemented`);
    }
  }
  return value;
}

function assertContractObject(value, contract) {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    throw new TypeError(`${contract} must be an object`);
  }
}

function notImplemented(contract, member) {
  throw new TypeError(`${contract}.${member} must be implemented`);
}
