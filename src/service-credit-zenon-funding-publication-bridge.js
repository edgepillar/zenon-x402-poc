import { types as utilTypes } from 'node:util';

import { canonicalJson, paymentIntentDigest } from './canonical.js';
import {
  deriveZenonFundingIntakeSelectionKey,
  snapshotZenonFundingIntakeJson,
  ZenonFundingIntakeSqliteStore,
} from './service-credit-zenon-funding-intake-sqlite-store.js';
import {
  EVIDENCE_STATES,
} from './settlement-journal.js';
import {
  ExactZenonFacilitator,
  preflightZenonPayment,
} from './zenon-payment.js';

const PHASE = Object.freeze({
  NEW: 'NEW',
  RECOVERING: 'RECOVERING',
  RECOVERED: 'RECOVERED',
  SETTLING: 'SETTLING',
  CLOSING: 'CLOSING',
  CLOSED: 'CLOSED',
  QUARANTINED: 'QUARANTINED',
});
const CONFIGURATION_KEYS = Object.freeze(['store', 'facilitator', 'selection']);
const SELECTION_KEYS = Object.freeze([
  'offerId', 'offerVersion', 'holderId', 'capabilityCommitment',
]);
const ROW_KEYS = Object.freeze(['issue', 'binding', 'status']);
const PUBLICATION_KEYS = Object.freeze([
  'version', 'paymentPayload', 'acceptedRequirement', 'paymentRequired',
]);
const RECOVERED = Object.freeze({ status: 'RECOVERED' });
const STORE_LOAD_BY_SELECTION_KEY =
  ZenonFundingIntakeSqliteStore.prototype.loadBySelectionKey;
const FACILITATOR_SETTLE = ExactZenonFacilitator.prototype.settle;

export class ZenonFundingPublicationBridgeError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ZenonFundingPublicationBridgeError';
    this.code = code;
    this.stack = `ZenonFundingPublicationBridgeError: ${code}`;
  }
}

function failure(code) {
  return new ZenonFundingPublicationBridgeError(code);
}

function fail(code) {
  throw failure(code);
}

function exactDataObject(value, keys) {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || Array.isArray(value)
      || utilTypes.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype
    ) return null;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== keys.length) return null;
    const copy = Object.create(null);
    for (const key of ownKeys) {
      if (typeof key !== 'string' || !keys.includes(key)) return null;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) return null;
      copy[key] = descriptor.value;
    }
    return copy;
  } catch {
    return null;
  }
}

function ownData(value, key) {
  try {
    const descriptor = value === null || (typeof value !== 'object' && typeof value !== 'function')
      ? null
      : Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value')
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}

function freezeJson(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeJson(child);
    Object.freeze(value);
  }
  return value;
}

function captureSelection(raw) {
  let captured;
  try { captured = snapshotZenonFundingIntakeJson(raw); } catch { return null; }
  const value = exactDataObject(captured, SELECTION_KEYS);
  if (
    value === null
    || typeof value.offerId !== 'string'
    || value.offerId.length === 0
    || value.offerId.length > 128
    || !Number.isSafeInteger(value.offerVersion)
    || value.offerVersion <= 0
    || typeof value.holderId !== 'string'
    || value.holderId.length === 0
    || value.holderId.length > 128
    || typeof value.capabilityCommitment !== 'string'
    || !/^sha256:[0-9a-f]{64}$/.test(value.capabilityCommitment)
  ) return null;
  return freezeJson({
    offerId: value.offerId,
    offerVersion: value.offerVersion,
    holderId: value.holderId,
    capabilityCommitment: value.capabilityCommitment,
  });
}

function exactSame(left, right) {
  try { return canonicalJson(left) === canonicalJson(right); } catch { return false; }
}

function assertCheckedBinding(row, selected, selectedKey, checked, retained) {
  const { issue, binding } = row;
  const payment = retained.paymentPayload;
  const accepted = retained.acceptedRequirement;
  const required = retained.paymentRequired;
  if (
    !exactSame(issue.selection, selected)
    || issue.selectionKey !== selectedKey
    || issue.selection.holderId !== checked.payer
    || !exactSame(required, issue.challenge.paymentRequired)
    || !exactSame(accepted, required.accepts[0])
    || !exactSame(payment.accepted, accepted)
    || !exactSame(payment.resource, required.resource)
    || payment.payload.intentDigest !== paymentIntentDigest(required, accepted)
    || binding.transactionHash !== checked.transactionHash
    || binding.authorizationKey !== checked.authorizationKey
    || binding.payer !== checked.payer
    || !exactSame(binding.observerInitialState?.chainProfile, checked.chainProfile)
    || !exactSame(accepted.extra?.zenonChain, checked.chainProfile)
    || !exactSame(checked.requirements, accepted)
    || !exactSame(checked.resourceIdentity, required.resource)
    || !exactSame(checked.signedAccountBlock, payment.payload.transaction)
  ) fail('ZENON_FUNDING_PUBLICATION_BRIDGE_RETAINED_PAYMENT_INVALID');
}

async function validateRetainedRow(store, selected, selectedKey) {
  let row;
  try {
    row = Reflect.apply(STORE_LOAD_BY_SELECTION_KEY, store, [selectedKey]);
  } catch {
    fail('ZENON_FUNDING_PUBLICATION_BRIDGE_RECOVERY_FAILED');
  }
  const capturedRow = exactDataObject(row, ROW_KEYS);
  if (capturedRow === null || capturedRow.status !== 'BOUND' || capturedRow.binding === null) {
    fail('ZENON_FUNDING_PUBLICATION_BRIDGE_BOUND_NOT_FOUND');
  }
  if (!exactSame(capturedRow.issue?.selection, selected)
    || capturedRow.issue?.selectionKey !== selectedKey) {
    fail('ZENON_FUNDING_PUBLICATION_BRIDGE_BOUND_NOT_FOUND');
  }
  if (!Object.hasOwn(capturedRow.binding, 'publication')) {
    fail('ZENON_FUNDING_PUBLICATION_BRIDGE_LEGACY_BOUND_UNPUBLISHABLE');
  }
  const publication = exactDataObject(capturedRow.binding.publication, PUBLICATION_KEYS);
  if (publication === null || publication.version !== 1) {
    fail('ZENON_FUNDING_PUBLICATION_BRIDGE_RETAINED_PAYMENT_INVALID');
  }
  let retained;
  try {
    retained = freezeJson(snapshotZenonFundingIntakeJson({
      paymentPayload: publication.paymentPayload,
      acceptedRequirement: publication.acceptedRequirement,
      paymentRequired: publication.paymentRequired,
    }));
  } catch {
    fail('ZENON_FUNDING_PUBLICATION_BRIDGE_RETAINED_PAYMENT_INVALID');
  }
  let checked;
  try {
    checked = await preflightZenonPayment(
      retained.paymentPayload,
      retained.acceptedRequirement,
      retained.paymentRequired,
    );
  } catch {
    fail('ZENON_FUNDING_PUBLICATION_BRIDGE_RETAINED_PAYMENT_INVALID');
  }
  assertCheckedBinding(capturedRow, selected, selectedKey, checked, retained);
  return Object.freeze({ retained, checked });
}

function projectFacilitatorResult(value, checked, accepted) {
  const success = ownData(value, 'success');
  const evidenceState = ownData(value, 'state');
  const transaction = ownData(value, 'transaction');
  const payer = ownData(value, 'payer');
  const network = ownData(value, 'network');
  const authorizationKey = ownData(value, 'authorizationKey');
  if (
    typeof success !== 'boolean'
    || !Object.values(EVIDENCE_STATES).includes(evidenceState)
    || transaction !== checked.transactionHash
    || payer !== checked.payer
    || network !== accepted.network
    || (authorizationKey !== undefined && authorizationKey !== checked.authorizationKey)
    || (success && evidenceState !== EVIDENCE_STATES.MOMENTUM_INCLUDED)
  ) fail('ZENON_FUNDING_PUBLICATION_BRIDGE_FACILITATOR_RESULT_INVALID');
  if (success) {
    return Object.freeze({ status: 'INCLUDED', evidenceState });
  }
  if (
    evidenceState === EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED
    || evidenceState === EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN
    || evidenceState === EVIDENCE_STATES.MOMENTUM_INCLUDED
  ) {
    return Object.freeze({ status: 'RECONCILIATION_REQUIRED', evidenceState });
  }
  return Object.freeze({ status: 'FAILED', evidenceState });
}

/**
 * Default-off owner for explicitly forwarding one retained BOUND payment into
 * the existing exact facilitator. It owns no listener, publisher, observer,
 * delivery, credit, store, journal, or facilitator lifetime.
 */
export function createZenonFundingPublicationBridge(options) {
  if (arguments.length !== 1) fail('ZENON_FUNDING_PUBLICATION_BRIDGE_INVALID_CONFIGURATION');
  const configuration = exactDataObject(options, CONFIGURATION_KEYS);
  const selected = configuration === null ? null : captureSelection(configuration.selection);
  if (
    configuration === null
    || selected === null
    || utilTypes.isProxy(configuration.store)
    || !(configuration.store instanceof ZenonFundingIntakeSqliteStore)
    || Object.getPrototypeOf(configuration.store) !== ZenonFundingIntakeSqliteStore.prototype
    || Object.hasOwn(configuration.store, 'loadBySelectionKey')
    || utilTypes.isProxy(configuration.facilitator)
    || !(configuration.facilitator instanceof ExactZenonFacilitator)
    || Object.getPrototypeOf(configuration.facilitator) !== ExactZenonFacilitator.prototype
    || Object.hasOwn(configuration.facilitator, 'settle')
  ) fail('ZENON_FUNDING_PUBLICATION_BRIDGE_INVALID_CONFIGURATION');

  const store = configuration.store;
  const facilitator = configuration.facilitator;
  let selectedKey;
  try {
    selectedKey = deriveZenonFundingIntakeSelectionKey({
      ledgerDomain: store.ledgerDomain,
      selection: selected,
    });
  } catch {
    fail('ZENON_FUNDING_PUBLICATION_BRIDGE_INVALID_CONFIGURATION');
  }

  let phase = PHASE.NEW;
  let recoveryOperation = null;
  let settlementOperation = null;
  let closeOperation = null;

  function phaseFailure() {
    if (phase === PHASE.QUARANTINED) {
      return failure('ZENON_FUNDING_PUBLICATION_BRIDGE_QUARANTINED');
    }
    if (phase === PHASE.CLOSING || phase === PHASE.CLOSED) {
      return failure('ZENON_FUNDING_PUBLICATION_BRIDGE_CLOSED');
    }
    return failure('ZENON_FUNDING_PUBLICATION_BRIDGE_NOT_RECOVERED');
  }

  const recover = Object.freeze((...args) => {
    if (args.length !== 0) {
      return Promise.reject(failure('ZENON_FUNDING_PUBLICATION_BRIDGE_INVALID_INPUT'));
    }
    if (phase === PHASE.RECOVERED || phase === PHASE.SETTLING) {
      return Promise.resolve(RECOVERED);
    }
    if (phase === PHASE.RECOVERING) return recoveryOperation;
    if (phase !== PHASE.NEW) return Promise.reject(phaseFailure());
    phase = PHASE.RECOVERING;
    recoveryOperation = (async () => {
      try {
        await validateRetainedRow(store, selected, selectedKey);
        if (phase === PHASE.CLOSING || phase === PHASE.CLOSED) throw phaseFailure();
        phase = PHASE.RECOVERED;
        return RECOVERED;
      } catch (error) {
        if (error instanceof ZenonFundingPublicationBridgeError
          && error.code === 'ZENON_FUNDING_PUBLICATION_BRIDGE_BOUND_NOT_FOUND') {
          if (phase === PHASE.RECOVERING) phase = PHASE.NEW;
          throw error;
        }
        if (phase !== PHASE.CLOSING && phase !== PHASE.CLOSED) phase = PHASE.QUARANTINED;
        if (error instanceof ZenonFundingPublicationBridgeError) throw error;
        fail('ZENON_FUNDING_PUBLICATION_BRIDGE_RECOVERY_FAILED');
      } finally {
        recoveryOperation = null;
      }
    })();
    return recoveryOperation;
  });

  const settleBound = Object.freeze((...args) => {
    if (args.length !== 0) {
      return Promise.reject(failure('ZENON_FUNDING_PUBLICATION_BRIDGE_INVALID_INPUT'));
    }
    if (phase === PHASE.SETTLING) return settlementOperation;
    if (phase !== PHASE.RECOVERED) return Promise.reject(phaseFailure());
    phase = PHASE.SETTLING;
    settlementOperation = (async () => {
      try {
        const current = await validateRetainedRow(store, selected, selectedKey);
        if (phase !== PHASE.SETTLING) throw phaseFailure();
        const result = await Reflect.apply(FACILITATOR_SETTLE, facilitator, [
          current.retained.paymentPayload,
          current.retained.acceptedRequirement,
          current.retained.paymentRequired,
        ]);
        return projectFacilitatorResult(
          result,
          current.checked,
          current.retained.acceptedRequirement,
        );
      } catch (error) {
        if (phase !== PHASE.CLOSING && phase !== PHASE.CLOSED) phase = PHASE.QUARANTINED;
        if (error instanceof ZenonFundingPublicationBridgeError) throw error;
        fail('ZENON_FUNDING_PUBLICATION_BRIDGE_FACILITATOR_FAILED');
      } finally {
        settlementOperation = null;
        if (phase === PHASE.SETTLING) phase = PHASE.RECOVERED;
      }
    })();
    return settlementOperation;
  });

  const close = Object.freeze((...args) => {
    if (args.length !== 0) {
      return Promise.reject(failure('ZENON_FUNDING_PUBLICATION_BRIDGE_INVALID_INPUT'));
    }
    if (closeOperation !== null) return closeOperation;
    const pending = settlementOperation ?? recoveryOperation;
    phase = PHASE.CLOSING;
    closeOperation = (async () => {
      try { await pending; } catch {}
      phase = PHASE.CLOSED;
    })();
    return closeOperation;
  });

  return Object.freeze({ recover, settleBound, close });
}
