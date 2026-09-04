/**
 * Persistence boundary for settlement evidence and resource delivery state.
 * Phase 1 does not connect this contract to the existing SettlementJournal.
 *
 * Implementations are expected to return detached JSON-safe data, preserve
 * immutable authorization identity, make identical writes idempotent, reject
 * identity conflicts, enforce monotonic evidence/delivery transitions, and
 * resolve mutating operations only after their atomic durable write succeeds.
 */
export class SettlementRepository {
  async load() {
    return notImplemented('SettlementRepository', 'load()');
  }

  async putValidated(_input) {
    return notImplemented('SettlementRepository', 'putValidated()');
  }

  async get(_authorizationKey, _transactionHash) {
    return notImplemented('SettlementRepository', 'get()');
  }

  async findByTransactionHash(_transactionHash) {
    return notImplemented('SettlementRepository', 'findByTransactionHash()');
  }

  async updateEvidence(_authorizationKey, _transactionHash, _evidenceState, _momentumEvidence) {
    return notImplemented('SettlementRepository', 'updateEvidence()');
  }

  async markDeliveryPending(_authorizationKey, _transactionHash, _acceptedRequirement) {
    return notImplemented('SettlementRepository', 'markDeliveryPending()');
  }

  async markDelivered(_authorizationKey, _transactionHash, _cachedResponse) {
    return notImplemented('SettlementRepository', 'markDelivered()');
  }

  async list() {
    return notImplemented('SettlementRepository', 'list()');
  }
}

const REQUIRED_METHODS = Object.freeze([
  'load',
  'putValidated',
  'get',
  'findByTransactionHash',
  'updateEvidence',
  'markDeliveryPending',
  'markDelivered',
  'list',
]);

export function assertSettlementRepository(value) {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    throw new TypeError('SettlementRepository must be an object');
  }
  for (const method of REQUIRED_METHODS) {
    if (typeof value[method] !== 'function') {
      throw new TypeError(`SettlementRepository.${method}() must be implemented`);
    }
  }
  return value;
}

function notImplemented(contract, method) {
  throw new TypeError(`${contract}.${method} must be implemented`);
}
