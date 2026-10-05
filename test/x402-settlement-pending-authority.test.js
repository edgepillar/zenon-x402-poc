import {
  createCharacterizationBoundary
} from './official-x402-context-differential.test.js';

/*
 * Inert on import. No node:test registration or automatic dispatch.
 *
 * Entry point:
 *   characterizeX402SettlementPending(catalog, host?)
 *
 * Per version:
 * - Nine individually counted actual-method scenario slots.
 * - One explicitly predicted/unexecuted existing-bridge gap slot.
 *
 * Four synthetic bad-implementation controls run once each, without
 * an SDK version label. This module returns at most 24 records.
 *
 * Missing original SDK bindings: NOT_RUN.
 * Unadmitted or inconsistent bindings: NOT_ADMITTED.
 * Missing original method: NOT_RUN / SDK_ENTRY_ABSENT.
 *
 * No fallback helper is manufactured for 2.23.0.
 *
 * Synthetic facilitator callbacks are observation instruments.
 * Their replies and modeled historical observations are not original
 * Zenon receipts, actual chain validation or publication evidence.
 *
 * No preparation, signing, publication, service delivery, budget release
 * or grant activation capability exists in this module.
 *
 * The same per-scenario counter object survives every catch path.
 * sdkCalls counts dispatch attempts immediately before apply/construct.
 * settleCalls counts the first two callback entries, including entries
 * subsequently rejected by a guard.
 *
 * A third callback entry is rejected before settlement work. Its first
 * occurrence is latched in rejectedSettleEntries and changes the counter
 * status to LOWER_BOUND. It cannot appear as exact complete accounting.
 *
 * No failed scenario is retried.
 * The unchanged one-shot bridge is not imported, reproduced or repaired.
 */

const F = Object.freeze;
const CREATE = Object.create;
const DEFINE = Object.defineProperties;
const NATIVE_ERROR = Error;

const PENDING_IDS = F([
  'PENDING_RESULT',
  'PENDING_TYPED_ERROR',
  'PENDING_TWICE',
  'PENDING_WITHOUT_TRANSACTION',
  'FIRST_CALL_SUCCESS',
  'NONPENDING_FAILED_RESULT',
  'GENERIC_THROWN_ERROR',
  'UNKNOWN_IS_NOT_ACKNOWLEDGED',
  'TRUTHY_INVALID_TRANSACTION'
]);

const CONTROL_IDS = F([
  'CONTROL_MUTATION',
  'CONTROL_REPLACEMENT',
  'CONTROL_TRANSACTION_DRIFT',
  'CONTROL_PENDING_AUTHORIZATION'
]);

const STOP = F(CREATE(null));
let pendingEntryConsumed = false;

function R(values) {
  const result = CREATE(null);
  for (const key of Object.keys(values)) result[key] = values[key];
  return F(result);
}

function emptyReport(reason) {
  return R({
    scope: 'INERT_X402_CHARACTERIZATION_ONLY',
    lane: 'PENDING',
    status: reason === 'ENTRY_ALREADY_CONSUMED' ? 'NOT_RUN' : 'NOT_ADMITTED',
    reason,
    records: F([]),
    integration: 'UNQUALIFIED'
  });
}

function pendingReply(transaction) {
  return R({
    success: false,
    errorReason: 'settlement_pending',
    transaction,
    network: 'synthetic:zenon'
  });
}

function includedReply(transaction) {
  return R({
    success: true,
    transaction,
    network: 'synthetic:zenon'
  });
}

function unrelatedFailure(transaction) {
  return R({
    success: false,
    errorReason: 'synthetic_nonpending_failure',
    transaction,
    network: 'synthetic:zenon'
  });
}

function genericPendingLookingError(transaction) {
  /*
   * A genuine generic Error with pending-looking fields, but not the
   * original SDK SettleError. It remains private to the SDK invocation.
   * Neither the object, its message nor its stack enters any report.
   */
  const error = new NATIVE_ERROR('synthetic nonqualifying error');

  DEFINE(error, {
    errorReason: {
      value: 'settlement_pending',
      enumerable: true
    },
    transaction: {
      value: transaction,
      enumerable: true
    }
  });

  return F(error);
}

function isPending(boundary, response, expectedTransaction) {
  try {
    return (
      boundary.data(response, 'success') === false &&
      boundary.data(response, 'errorReason') === 'settlement_pending' &&
      boundary.data(response, 'transaction') === expectedTransaction &&
      boundary.data(response, 'network') === 'synthetic:zenon'
    );
  } catch {
    return false;
  }
}

function isSuccess(boundary, response, transaction) {
  try {
    return (
      boundary.data(response, 'success') === true &&
      boundary.data(response, 'transaction') === transaction &&
      boundary.data(response, 'network') === 'synthetic:zenon'
    );
  } catch {
    return false;
  }
}

function isUnrelatedFailure(boundary, response, transaction) {
  try {
    return (
      boundary.data(response, 'success') === false &&
      boundary.data(response, 'errorReason') === 'synthetic_nonpending_failure' &&
      boundary.data(response, 'transaction') === transaction &&
      boundary.data(response, 'network') === 'synthetic:zenon'
    );
  } catch {
    return false;
  }
}

function expectedSettleCalls(id) {
  return (
    id === 'PENDING_WITHOUT_TRANSACTION' ||
    id === 'FIRST_CALL_SUCCESS' ||
    id === 'NONPENDING_FAILED_RESULT' ||
    id === 'GENERIC_THROWN_ERROR'
  ) ? 1 : 2;
}

async function actualPendingProbe(boundary, slot, version, id, count) {
  if (
    slot.pending === null ||
    (id === 'PENDING_TYPED_ERROR' && slot.SettleError === null)
  ) {
    return boundary.result(
      id, 'SCENARIO', version,
      'NOT_RUN', 'SDK_ENTRY_ABSENT',
      'NOT_RUN', 'NOT_RUN',
      count
    );
  }

  const owned = boundary.fixture();
  const beginsUnknown =
    id === 'UNKNOWN_IS_NOT_ACKNOWLEDGED' ||
    id === 'TRUTHY_INVALID_TRANSACTION';

  /*
   * This immutable record is explicitly modeled historical state.
   * A precomputable identity or returned transaction field cannot change
   * it. It is not an actual journal or acknowledged broadcast receipt.
   */
  const observation = R({
    kind: beginsUnknown
      ? 'SUBMISSION_OUTCOME_UNKNOWN'
      : 'SUBMISSION_ACKNOWLEDGED',
    transaction: owned.transaction
  });

  const originalObservation = observation;
  const replies = [];
  let firstFailure = null;

  function fail(reason) {
    if (firstFailure === null) firstFailure = reason;
    throw STOP;
  }

  function retainReply(response) {
    replies.push(response);

    /*
     * This is a synthetic strict equality/type assertion only.
     * It neither validates a real chain identity nor authorizes work.
     */
    if (!boundary.transactionMatches(response, owned)) {
      count.modeledStrictIdentityRejections += 1;
    }

    return response;
  }

  function settle(payment, requirement) {
    if (count.settleCalls >= 2) {
      count.rejectedSettleEntries = 1;
      count.counterStatus = 'LOWER_BOUND';
      fail('SETTLE_LIMIT');
    }

    count.settleCalls += 1;

    if (firstFailure !== null) throw STOP;

    const faults = boundary.reuseFaults(
      owned,
      payment,
      requirement,
      count
    );

    if (
      faults.length !== 0 ||
      !owned.matchesOwnedFixture(
        owned.originalChallenge,
        requirement,
        payment
      )
    ) {
      fail('BOUND_INPUT_CHANGED');
    }

    if (
      observation !== originalObservation ||
      observation.transaction !== owned.transaction
    ) {
      fail('OBSERVATION_CHANGED');
    }

    if (count.settleCalls === 1) {
      if (id === 'FIRST_CALL_SUCCESS') {
        return retainReply(includedReply(owned.transaction));
      }

      if (id === 'NONPENDING_FAILED_RESULT') {
        return retainReply(unrelatedFailure(owned.transaction));
      }

      if (id === 'GENERIC_THROWN_ERROR') {
        throw genericPendingLookingError(owned.transaction);
      }

      const transaction = id === 'PENDING_WITHOUT_TRANSACTION'
        ? ''
        : id === 'TRUTHY_INVALID_TRANSACTION'
          ? true
          : owned.transaction;

      const response = retainReply(pendingReply(transaction));

      if (id === 'PENDING_TYPED_ERROR') {
        /*
         * This is the exact admitted version-specific constructor.
         * Dispatch is counted inside construct before invocation.
         */
        throw boundary.construct(slot.SettleError, [500, response], count);
      }

      return response;
    }

    if (expectedSettleCalls(id) === 1) {
      fail('UNEXPECTED_RETRY');
    }

    if (id === 'TRUTHY_INVALID_TRANSACTION') {
      /*
       * Keep the malformed truthy evidence visible to the original SDK
       * method so its broad dispatch can be observed. The separate
       * synthetic strict check rejects both replies. No reply becomes
       * an original transaction baseline or service authority.
       */
      return retainReply(pendingReply(true));
    }

    const remainsPending =
      id === 'PENDING_TWICE' ||
      id === 'UNKNOWN_IS_NOT_ACKNOWLEDGED';

    return retainReply(
      remainsPending
        ? pendingReply(owned.transaction)
        : includedReply(owned.transaction)
    );
  }

  const facilitatorClient = R({ settle: F(settle) });

  /*
   * Direct invocation of the original compiled method, with explicitly
   * synthetic callbacks. This is not a public resource-server lifecycle
   * or unchanged-bridge integration.
   */
  const observed = await boundary.invoke(
    slot.pending,
    undefined,
    [facilitatorClient, owned.payment, owned.requirement],
    count
  );

  let actualMatch =
    firstFailure === null &&
    count.counterStatus === 'EXACT' &&
    count.settleCalls === expectedSettleCalls(id) &&
    count.rejectedSettleEntries === 0 &&
    boundary.reuseFaults(
      owned,
      owned.payment,
      owned.requirement,
      count
    ).length === 0;

  if (id === 'GENERIC_THROWN_ERROR') {
    actualMatch =
      actualMatch &&
      observed.kind === 'THREW' &&
      replies.length === 0;
  } else {
    const expectedReply = replies[replies.length - 1];

    actualMatch =
      actualMatch &&
      observed.kind === 'RETURNED' &&
      expectedReply !== undefined &&
      observed.value === expectedReply &&
      boundary.text(observed.value) === boundary.text(expectedReply);

    if (actualMatch) {
      if (id === 'PENDING_WITHOUT_TRANSACTION') {
        actualMatch = isPending(boundary, observed.value, '');
      } else if (id === 'TRUTHY_INVALID_TRANSACTION') {
        actualMatch =
          isPending(boundary, observed.value, true) &&
          count.modeledStrictIdentityRejections === 2 &&
          !boundary.transactionMatches(observed.value, owned);
      } else if (
        id === 'PENDING_TWICE' ||
        id === 'UNKNOWN_IS_NOT_ACKNOWLEDGED'
      ) {
        actualMatch = isPending(
          boundary,
          observed.value,
          owned.transaction
        );
      } else if (id === 'NONPENDING_FAILED_RESULT') {
        actualMatch = isUnrelatedFailure(
          boundary,
          observed.value,
          owned.transaction
        );
      } else {
        actualMatch = isSuccess(
          boundary,
          observed.value,
          owned.transaction
        );
      }
    }
  }

  const expectedIdentityRejections =
    id === 'TRUTHY_INVALID_TRANSACTION'
      ? 2
      : id === 'PENDING_WITHOUT_TRANSACTION' ? 1 : 0;

  const modeledMatch =
    observation === originalObservation &&
    observation.transaction === owned.transaction &&
    observation.kind === (
      beginsUnknown
        ? 'SUBMISSION_OUTCOME_UNKNOWN'
        : 'SUBMISSION_ACKNOWLEDGED'
    ) &&
    count.modeledStrictIdentityRejections === expectedIdentityRejections &&
    count.modeledReplacementCreates === 0 &&
    count.modeledSigns === 0 &&
    count.modeledPublishes === 0 &&
    count.modeledServiceCalls === 0;

  return boundary.result(
    id, 'SCENARIO', version,
    actualMatch ? 'OBSERVED_MATCH' : 'OBSERVED_DIFFERENCE',
    actualMatch ? 'MATCH' : (
      firstFailure !== null
        ? 'INVARIANT_VIOLATION'
        : observed.kind === 'THREW' ? 'CALL_REJECTED' : 'DIFFERENCE'
    ),
    modeledMatch ? 'CHECK_MATCH' : 'CHECK_FAILED',
    modeledMatch ? 'MATCH' : 'INVARIANT_VIOLATION',
    count
  );
}

function syntheticControl(boundary, id, count) {
  const owned = boundary.fixture();
  let detected = false;

  if (id === 'CONTROL_MUTATION') {
    const paymentReference = owned.payment;
    const requirementReference = owned.requirement;

    owned.payment.payload.memo = 'synthetic changed memo';
    owned.requirement.amount = '2';

    const faults = boundary.reuseFaults(
      owned,
      owned.payment,
      owned.requirement,
      count
    );

    detected =
      owned.payment === paymentReference &&
      owned.requirement === requirementReference &&
      !faults.includes('REFERENCE_CHANGED') &&
      faults.includes('REPRESENTATION_CHANGED') &&
      boundary.text(owned.payment) !== owned.paymentText &&
      boundary.text(owned.requirement) !== owned.requirementText;
  } else if (id === 'CONTROL_REPLACEMENT') {
    const replacementPayment = boundary.clone(owned.payment);
    const replacementRequirement = boundary.clone(owned.requirement);

    /*
     * These are modeled forbidden-work counters only.
     * No create/sign/publish capability exists.
     */
    count.modeledReplacementCreates = 1;
    count.modeledSigns = 1;
    count.modeledPublishes = 1;

    const faults = boundary.reuseFaults(
      owned,
      replacementPayment,
      replacementRequirement,
      count
    );

    detected =
      faults.includes('REFERENCE_CHANGED') &&
      faults.includes('REPLACEMENT_WORK');
  } else if (id === 'CONTROL_TRANSACTION_DRIFT') {
    const response = includedReply('synthetic-transaction-B');

    detected =
      boundary.reuseFaults(
        owned,
        owned.payment,
        owned.requirement,
        count
      ).length === 0 &&
      !boundary.transactionMatches(response, owned);
  } else if (id === 'CONTROL_PENDING_AUTHORIZATION') {
    const response = pendingReply(owned.transaction);
    count.modeledServiceCalls = 1;

    detected =
      isPending(boundary, response, owned.transaction) &&
      boundary.transactionMatches(response, owned) &&
      count.modeledServiceCalls !== 0;
  }

  return boundary.result(
    id, 'SCENARIO', 'SYNTHETIC',
    'NOT_RUN', 'SYNTHETIC_ONLY',
    detected ? 'CONTROL_DETECTED' : 'CONTROL_MISSED',
    detected ? 'CONTROL_DETECTED' : 'CONTROL_MISSED',
    count
  );
}

export async function characterizeX402SettlementPending(catalog, host = null) {
  if (pendingEntryConsumed) {
    return emptyReport('ENTRY_ALREADY_CONSUMED');
  }
  pendingEntryConsumed = true;

  let boundary;

  try {
    if (arguments.length < 1 || arguments.length > 2) throw STOP;
    boundary = createCharacterizationBoundary(catalog, host);
  } catch {
    return emptyReport('INPUT_INVALID');
  }

  const records = [];

  for (const version of boundary.versions) {
    const slot = boundary.slot(version);

    for (const id of PENDING_IDS) {
      /*
       * Allocate once, outside the probe and its catch.
       * Every subsequent report retains this exact counter record.
       */
      const count = boundary.counters();

      if (slot.status !== 'AVAILABLE') {
        records.push(boundary.result(
          id, 'SCENARIO', version,
          slot.status, slot.reason,
          'NOT_RUN', 'NOT_RUN',
          count
        ));
        continue;
      }

      try {
        records.push(await actualPendingProbe(
          boundary,
          slot,
          version,
          id,
          count
        ));
      } catch {
        records.push(boundary.result(
          id, 'SCENARIO', version,
          'OBSERVED_DIFFERENCE', 'CALL_RESULT_INVALID',
          'CHECK_FAILED', 'INVARIANT_VIOLATION',
          count
        ));
      }
    }

    /*
     * No bridge imitation or rejection-as-conformance shortcut.
     */
    records.push(boundary.result(
      'CONSUMED_CONTEXT_GAP', 'SCENARIO', version,
      'NOT_RUN', 'PREDICTED_UNEXECUTED',
      'NOT_RUN', 'PREDICTED_UNEXECUTED',
      boundary.counters()
    ));
  }

  for (const id of CONTROL_IDS) {
    const count = boundary.counters();

    try {
      records.push(syntheticControl(boundary, id, count));
    } catch {
      records.push(boundary.result(
        id, 'SCENARIO', 'SYNTHETIC',
        'NOT_RUN', 'SYNTHETIC_ONLY',
        'CONTROL_MISSED', 'CONTROL_MISSED',
        count
      ));
    }
  }

  return boundary.summary('PENDING', records);
}
