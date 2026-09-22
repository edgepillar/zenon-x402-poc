import { types as utilTypes } from 'node:util';

import {
  createServiceCreditZenonFundingPostV1Client,
  ZENON_FUNDING_POST_V1_CLIENT_CODES,
  ZenonFundingPostV1ClientError,
} from './service-credit-zenon-funding-post-v1-client.js';
import {
  captureZenonFundingPostV1PayerRecoveryPair,
  ZENON_FUNDING_PAYER_RECOVERY_STATUS,
  ZenonFundingPayerRecoverySqliteStore,
  ZenonFundingPayerRecoverySqliteStoreError,
} from './service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js';
import { preflightZenonPayment } from './zenon-payment.js';

export const ZENON_FUNDING_PAYER_RECOVERY_OWNER_CODES = Object.freeze({
  invalidConfiguration: 'ZENON_FUNDING_PAYER_RECOVERY_OWNER_INVALID_CONFIGURATION',
  invalidInput: 'ZENON_FUNDING_PAYER_RECOVERY_OWNER_INVALID_INPUT',
  notRecovered: 'ZENON_FUNDING_PAYER_RECOVERY_OWNER_NOT_RECOVERED',
  busy: 'ZENON_FUNDING_PAYER_RECOVERY_OWNER_BUSY',
  invalidState: 'ZENON_FUNDING_PAYER_RECOVERY_OWNER_INVALID_STATE',
  conflict: 'ZENON_FUNDING_PAYER_RECOVERY_OWNER_CONFLICT',
  recoveryInvalid: 'ZENON_FUNDING_PAYER_RECOVERY_OWNER_RECOVERY_INVALID',
  storeFailed: 'ZENON_FUNDING_PAYER_RECOVERY_OWNER_STORE_FAILED',
  storeOutcomeUnknown: 'ZENON_FUNDING_PAYER_RECOVERY_OWNER_STORE_OUTCOME_UNKNOWN',
  drainUnresolved: 'ZENON_FUNDING_PAYER_RECOVERY_OWNER_DRAIN_UNRESOLVED',
  quarantined: 'ZENON_FUNDING_PAYER_RECOVERY_OWNER_QUARANTINED',
  closed: 'ZENON_FUNDING_PAYER_RECOVERY_OWNER_CLOSED',
});

const OWNER_KEYS = Object.freeze(['store', 'deadlineMs', 'fetchImpl']);
const RESERVED_STORES = new WeakSet();
const NATIVE_PROMISE = Promise;
const NATIVE_SET_TIMEOUT = setTimeout;
const CLIENT_SUBMIT = 'submitAuthorizedPayment';

export class ZenonFundingPayerRecoveryOwnerError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ZenonFundingPayerRecoveryOwnerError';
    this.code = code;
    this.stack = `ZenonFundingPayerRecoveryOwnerError: ${code}`;
  }
}

function failure(code) {
  return new ZenonFundingPayerRecoveryOwnerError(code);
}

function fail(code) {
  throw failure(code);
}

function statusResult(status) {
  return Object.freeze({ status });
}

function exactDataObject(value, allowedKeys, requiredKeys, code) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || utilTypes.isProxy(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) fail(code);
  const keys = Reflect.ownKeys(value);
  if (
    keys.length < requiredKeys.length
    || keys.length > allowedKeys.length
    || keys.some(key => typeof key !== 'string' || !allowedKeys.includes(key))
  ) fail(code);
  const output = Object.create(null);
  for (const key of allowedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined) {
      if (requiredKeys.includes(key)) fail(code);
      output[key] = undefined;
      continue;
    }
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail(code);
    output[key] = descriptor.value;
  }
  return output;
}

function exactStore(value) {
  return value !== null
    && typeof value === 'object'
    && !utilTypes.isProxy(value)
    && value instanceof ZenonFundingPayerRecoverySqliteStore
    && Object.getPrototypeOf(value) === ZenonFundingPayerRecoverySqliteStore.prototype
    && !Object.hasOwn(value, 'load')
    && !Object.hasOwn(value, 'prepare')
    && !Object.hasOwn(value, 'fenceAttempt')
    && !Object.hasOwn(value, 'finishAttempt')
    && !Object.hasOwn(value, 'recoverAfterRestart')
    && !Object.hasOwn(value, 'close');
}

function clientOptions(resourceUrl, deadlineMs, fetchImpl) {
  return fetchImpl === undefined
    ? { resourceUrl, deadlineMs }
    : { resourceUrl, deadlineMs, fetchImpl };
}

function clientErrorCode(error) {
  return error instanceof ZenonFundingPostV1ClientError ? error.code : null;
}

function storeErrorCode(error) {
  return error instanceof ZenonFundingPayerRecoverySqliteStoreError
    ? error.code
    : null;
}

function mapStoreFailure(error) {
  const code = storeErrorCode(error);
  if (code === 'ZENON_FUNDING_PAYER_RECOVERY_STORE_CONFLICT') {
    return failure(ZENON_FUNDING_PAYER_RECOVERY_OWNER_CODES.conflict);
  }
  if (
    code === 'ZENON_FUNDING_PAYER_RECOVERY_STORE_COMMIT_OUTCOME_UNKNOWN'
    || code === 'ZENON_FUNDING_PAYER_RECOVERY_STORE_ROLLBACK_FAILED'
  ) {
    return failure(ZENON_FUNDING_PAYER_RECOVERY_OWNER_CODES.storeOutcomeUnknown);
  }
  return failure(ZENON_FUNDING_PAYER_RECOVERY_OWNER_CODES.storeFailed);
}

function submissionFromRecord(record) {
  const paymentRequired = record.paymentRequired;
  const challenge = Object.freeze({
    status: 'PAYMENT_REQUIRED',
    resourceUrl: record.resourceUrl,
    paymentRequiredHeader: record.challengeHeader,
    paymentRequired,
  });
  return Object.freeze({
    challenge,
    paymentSignatureHeader: record.paymentHeader,
  });
}

async function preflightRecord(record) {
  const pair = captureZenonFundingPostV1PayerRecoveryPair(
    submissionFromRecord(record),
    record.resourceUrl,
  );
  await preflightZenonPayment(
    pair.paymentPayload,
    pair.requirement,
    pair.paymentRequired,
  );
  return pair;
}

function delayTurn() {
  return new NATIVE_PROMISE(resolve => NATIVE_SET_TIMEOUT(resolve, 1));
}

async function waitForClientDrain(client) {
  while (true) {
    try {
      await Reflect.apply(client[CLIENT_SUBMIT], client, [null]);
      return false;
    } catch (error) {
      const code = clientErrorCode(error);
      if (code === ZENON_FUNDING_POST_V1_CLIENT_CODES.invalidInput) return true;
      if (code !== ZENON_FUNDING_POST_V1_CLIENT_CODES.operationInFlight) return false;
      await delayTurn();
    }
  }
}

/**
 * Creates one default-off owner for a caller-prepared payer recovery store.
 * Passing the store transfers its lifetime custody to this owner. Recovery is
 * explicit and performs no transport. Submission and replay are separate,
 * explicit operations and use only the exact pair already held by the store.
 */
export function createZenonFundingPostV1PayerRecoveryOwner(options) {
  if (arguments.length !== 1) {
    fail(ZENON_FUNDING_PAYER_RECOVERY_OWNER_CODES.invalidConfiguration);
  }
  const configuration = exactDataObject(
    options,
    OWNER_KEYS,
    ['store', 'deadlineMs'],
    ZENON_FUNDING_PAYER_RECOVERY_OWNER_CODES.invalidConfiguration,
  );
  if (
    !exactStore(configuration.store)
    || !Number.isSafeInteger(configuration.deadlineMs)
    || configuration.deadlineMs < 1
    || configuration.deadlineMs > 60_000
    || (
      configuration.fetchImpl !== undefined
      && typeof configuration.fetchImpl !== 'function'
    )
    || RESERVED_STORES.has(configuration.store)
  ) fail(ZENON_FUNDING_PAYER_RECOVERY_OWNER_CODES.invalidConfiguration);

  const store = configuration.store;
  let resourceUrl;
  try { resourceUrl = store.resourceUrl; }
  catch {
    fail(ZENON_FUNDING_PAYER_RECOVERY_OWNER_CODES.invalidConfiguration);
  }
  try {
    createServiceCreditZenonFundingPostV1Client(clientOptions(
      resourceUrl,
      configuration.deadlineMs,
      configuration.fetchImpl,
    ));
  } catch {
    fail(ZENON_FUNDING_PAYER_RECOVERY_OWNER_CODES.invalidConfiguration);
  }
  RESERVED_STORES.add(store);

  let phase = 'NEW';
  let record = null;
  let localOperation = null;
  let activeAttempt = null;
  let closeOperation = null;
  let quarantined = false;

  function ownerFailure() {
    if (quarantined) {
      return failure(ZENON_FUNDING_PAYER_RECOVERY_OWNER_CODES.quarantined);
    }
    if (phase === 'CLOSING' || phase === 'CLOSED') {
      return failure(ZENON_FUNDING_PAYER_RECOVERY_OWNER_CODES.closed);
    }
    if (localOperation !== null || activeAttempt !== null) {
      return failure(ZENON_FUNDING_PAYER_RECOVERY_OWNER_CODES.busy);
    }
    return failure(ZENON_FUNDING_PAYER_RECOVERY_OWNER_CODES.notRecovered);
  }

  function assertAdmitted() {
    if (
      quarantined
      || phase === 'CLOSING'
      || phase === 'CLOSED'
      || localOperation !== null
      || activeAttempt !== null
      || phase !== 'RECOVERED'
    ) throw ownerFailure();
  }

  function callStore(name, args) {
    try {
      return Reflect.apply(ZenonFundingPayerRecoverySqliteStore.prototype[name], store, args);
    } catch (error) {
      throw mapStoreFailure(error);
    }
  }

  function runLocal(operation) {
    const promise = (async () => operation())();
    localOperation = promise;
    promise.then(() => {
      if (localOperation === promise) localOperation = null;
    }, () => {
      if (localOperation === promise) localOperation = null;
    });
    return promise;
  }

  const recover = Object.freeze((...args) => {
    if (args.length !== 0) {
      return NATIVE_PROMISE.reject(failure(
        ZENON_FUNDING_PAYER_RECOVERY_OWNER_CODES.invalidInput,
      ));
    }
    if (quarantined || phase === 'CLOSING' || phase === 'CLOSED') {
      return NATIVE_PROMISE.reject(ownerFailure());
    }
    if (phase === 'RECOVERED' && localOperation === null && activeAttempt === null) {
      return NATIVE_PROMISE.resolve(statusResult(record?.status ?? 'EMPTY'));
    }
    if (phase !== 'NEW' || localOperation !== null || activeAttempt !== null) {
      return NATIVE_PROMISE.reject(ownerFailure());
    }
    phase = 'RECOVERING';
    return runLocal(async () => {
      try {
        const recovered = callStore('recoverAfterRestart', []);
        if (recovered !== null) await preflightRecord(recovered);
        record = recovered;
        if (phase !== 'RECOVERING') throw ownerFailure();
        phase = 'RECOVERED';
        return statusResult(record?.status ?? 'EMPTY');
      } catch (error) {
        quarantined = true;
        if (error instanceof ZenonFundingPayerRecoveryOwnerError) throw error;
        throw failure(ZENON_FUNDING_PAYER_RECOVERY_OWNER_CODES.recoveryInvalid);
      }
    });
  });

  const prepare = Object.freeze((input, ...extra) => {
    if (extra.length !== 0) {
      return NATIVE_PROMISE.reject(failure(
        ZENON_FUNDING_PAYER_RECOVERY_OWNER_CODES.invalidInput,
      ));
    }
    try { assertAdmitted(); }
    catch (error) { return NATIVE_PROMISE.reject(error); }
    return runLocal(async () => {
      let storeReturned = false;
      try {
        const pair = captureZenonFundingPostV1PayerRecoveryPair(input, resourceUrl);
        await preflightZenonPayment(
          pair.paymentPayload,
          pair.requirement,
          pair.paymentRequired,
        );
        const prepared = callStore('prepare', [submissionFromRecord(pair)]);
        storeReturned = true;
        await preflightRecord(prepared);
        record = prepared;
        return statusResult(record.status);
      } catch (error) {
        if (storeReturned) {
          quarantined = true;
          throw failure(
            ZENON_FUNDING_PAYER_RECOVERY_OWNER_CODES.recoveryInvalid,
          );
        }
        if (error instanceof ZenonFundingPayerRecoveryOwnerError) {
          if (
            error.code !== ZENON_FUNDING_PAYER_RECOVERY_OWNER_CODES.conflict
          ) quarantined = true;
          throw error;
        }
        throw failure(ZENON_FUNDING_PAYER_RECOVERY_OWNER_CODES.invalidInput);
      }
    });
  });

  function beginAttempt(expectedStatus) {
    try { assertAdmitted(); }
    catch (error) { return NATIVE_PROMISE.reject(error); }
    if (record === null || record.status !== expectedStatus) {
      return NATIVE_PROMISE.reject(failure(
        ZENON_FUNDING_PAYER_RECOVERY_OWNER_CODES.invalidState,
      ));
    }

    const attempt = {
      publicPromise: null,
      drainPromise: null,
      lifecyclePromise: null,
      drainProven: false,
    };
    activeAttempt = attempt;

    const operation = (async () => {
      try {
        await preflightRecord(record);
      } catch {
        quarantined = true;
        throw failure(ZENON_FUNDING_PAYER_RECOVERY_OWNER_CODES.recoveryInvalid);
      }

      let fenced;
      try {
        fenced = callStore('fenceAttempt', [expectedStatus]);
        record = fenced;
      } catch (error) {
        quarantined = true;
        throw error;
      }

      let client;
      try {
        client = createServiceCreditZenonFundingPostV1Client(clientOptions(
          resourceUrl,
          configuration.deadlineMs,
          configuration.fetchImpl,
        ));
      } catch {
        try {
          record = callStore('finishAttempt', [
            ZENON_FUNDING_PAYER_RECOVERY_STATUS.OUTCOME_UNKNOWN,
          ]);
        } catch {
          quarantined = true;
        }
        throw failure(ZENON_FUNDING_PAYER_RECOVERY_OWNER_CODES.quarantined);
      }

      let clientPromise;
      try {
        clientPromise = Reflect.apply(client[CLIENT_SUBMIT], client, [
          submissionFromRecord(fenced),
        ]);
      } catch {
        clientPromise = NATIVE_PROMISE.reject(new ZenonFundingPostV1ClientError(
          ZENON_FUNDING_POST_V1_CLIENT_CODES.outcomeUnknown,
        ));
      }
      const drainPromise = waitForClientDrain(client);
      attempt.drainPromise = (async () => {
        const drained = await drainPromise;
        attempt.drainProven = drained;
        if (!drained) quarantined = true;
        return drained;
      })();

      let nextStatus;
      try {
        const result = await clientPromise;
        nextStatus = result?.status === 'BOUND'
          ? ZENON_FUNDING_PAYER_RECOVERY_STATUS.BOUND
          : ZENON_FUNDING_PAYER_RECOVERY_STATUS.OUTCOME_UNKNOWN;
      } catch (error) {
        const code = clientErrorCode(error);
        if (
          !fenced.ambiguityLatched
          && code === ZENON_FUNDING_POST_V1_CLIENT_CODES.paymentRejected
        ) {
          nextStatus = ZENON_FUNDING_PAYER_RECOVERY_STATUS.PAYMENT_REJECTED;
        } else if (
          !fenced.ambiguityLatched
          && code === ZENON_FUNDING_POST_V1_CLIENT_CODES.paymentConflict
        ) {
          nextStatus = ZENON_FUNDING_PAYER_RECOVERY_STATUS.PAYMENT_CONFLICT;
        } else {
          nextStatus = ZENON_FUNDING_PAYER_RECOVERY_STATUS.OUTCOME_UNKNOWN;
        }
      }

      try {
        record = callStore('finishAttempt', [nextStatus]);
        if (
          nextStatus !== ZENON_FUNDING_PAYER_RECOVERY_STATUS.OUTCOME_UNKNOWN
          && attempt.drainPromise !== null
        ) {
          let drained = false;
          try { drained = await attempt.drainPromise; } catch {}
          if (!drained) {
            quarantined = true;
            throw failure(
              ZENON_FUNDING_PAYER_RECOVERY_OWNER_CODES.drainUnresolved,
            );
          }
          if (activeAttempt === attempt) activeAttempt = null;
        }
        return statusResult(record.status);
      } catch (error) {
        quarantined = true;
        throw error;
      }
    })();
    attempt.publicPromise = operation;

    const finishLifecycle = async () => {
      try { await operation; } catch {}
      let drained = attempt.drainPromise === null;
      if (attempt.drainPromise !== null) {
        try { drained = await attempt.drainPromise; } catch { drained = false; }
      }
      attempt.drainProven = drained;
      if (activeAttempt === attempt && drained) activeAttempt = null;
      if (activeAttempt === attempt && !drained) quarantined = true;
    };
    attempt.lifecyclePromise = finishLifecycle();
    return operation;
  }

  const submitPrepared = Object.freeze((...args) => {
    if (args.length !== 0) {
      return NATIVE_PROMISE.reject(failure(
        ZENON_FUNDING_PAYER_RECOVERY_OWNER_CODES.invalidInput,
      ));
    }
    return beginAttempt(ZENON_FUNDING_PAYER_RECOVERY_STATUS.PREPARED);
  });

  const replayUnknown = Object.freeze((...args) => {
    if (args.length !== 0) {
      return NATIVE_PROMISE.reject(failure(
        ZENON_FUNDING_PAYER_RECOVERY_OWNER_CODES.invalidInput,
      ));
    }
    return beginAttempt(ZENON_FUNDING_PAYER_RECOVERY_STATUS.OUTCOME_UNKNOWN);
  });

  const close = Object.freeze((...args) => {
    if (args.length !== 0) {
      return NATIVE_PROMISE.reject(failure(
        ZENON_FUNDING_PAYER_RECOVERY_OWNER_CODES.invalidInput,
      ));
    }
    if (closeOperation !== null) return closeOperation;
    phase = 'CLOSING';
    closeOperation = (async () => {
      const pendingLocal = localOperation;
      if (pendingLocal !== null) {
        try { await pendingLocal; } catch {}
      }
      const pendingAttempt = activeAttempt;
      if (pendingAttempt !== null) {
        try { await pendingAttempt.lifecyclePromise; } catch {}
        if (!pendingAttempt.drainProven) {
          quarantined = true;
          throw failure(ZENON_FUNDING_PAYER_RECOVERY_OWNER_CODES.drainUnresolved);
        }
        if (activeAttempt === pendingAttempt) activeAttempt = null;
      }
      try {
        Reflect.apply(
          ZenonFundingPayerRecoverySqliteStore.prototype.close,
          store,
          [],
        );
      } catch {
        quarantined = true;
        throw failure(ZENON_FUNDING_PAYER_RECOVERY_OWNER_CODES.storeFailed);
      }
      phase = 'CLOSED';
      return statusResult('CLOSED');
    })();
    return closeOperation;
  });

  return Object.freeze({
    recover,
    prepare,
    submitPrepared,
    replayUnknown,
    close,
  });
}
