import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';

const freeze = Object.freeze;
const ownKeys = Reflect.ownKeys;
const getDescriptor = Object.getOwnPropertyDescriptor;
const getPrototypeOf = Object.getPrototypeOf;
const hasOwn = Object.hasOwn;
const defineProperty = Object.defineProperty;
const sameValue = Object.is;
const apply = Reflect.apply;
const isProxy = utilTypes.isProxy;
const isPromise = utilTypes.isPromise;
const isSafeInteger = Number.isSafeInteger;
const objectPrototype = Object.prototype;
const NativePromise = Promise;
const promisePrototype = NativePromise.prototype;
const promiseThen = promisePrototype.then;
const TypeErrorConstructor = TypeError;
const parse = JSON.parse;
const stringify = JSON.stringify;
const byteLength = Buffer.byteLength;
const regexpTest = RegExp.prototype.test;
const HASH = /^[0-9a-f]{64}$/;
const REASON = /^[a-z][a-z0-9_]{0,127}$/;
const BINDING_FIELDS = freeze([
  'payloadJson', 'requirementsJson', 'challengeJson', 'paymentHash', 'network',
]);
const CONFIG_FIELDS = freeze([
  'original', 'settleFirst', 'reconcilePending', 'maxPendingReconciliations',
]);
const PACKET_FIELDS = freeze(['disposition', 'publicationStatus', 'responseJson']);
const SUCCESS_FIELDS = freeze(['success', 'payer', 'transaction', 'network']);
const FAILURE_FIELDS = freeze([
  'success', 'transaction', 'network', 'errorReason', 'errorMessage',
]);

/**
 * Per-instance, memory-only first-settlement authority.
 *
 * Configuration and both callback roles are trusted embedding decisions.
 * reconcilePending must be independently reviewed as read-only. This library
 * cannot detect a wrapper that submits, signs or invokes another callback.
 * It never defaults the observer to settleFirst.
 *
 * Each callback receives one fresh frozen BINDING_FIELDS record.
 * Original strings are opaque declared serializations, not authenticated wire
 * or signed-block custody. They are never reconstructed by this owner.
 *
 * Callback packet: exactly {disposition, publicationStatus, responseJson}.
 * Disposition: PENDING, SUCCEEDED, FAILED or UNKNOWN.
 * Publication: NOT_ESTABLISHED, UNKNOWN or ACKNOWLEDGED, always declared.
 * responseJson is canonical JSON in SUCCESS_FIELDS or FAILURE_FIELDS order.
 * PENDING uses settlement_pending. FAILED cannot use pending/unknown reasons.
 * Success may retain NOT_ESTABLISHED; Boolean success never implies an ACK.
 *
 * attempt(binding) returns a native Promise of the validated response STRING.
 * It never resolves with an untrusted callback object. UNKNOWN and FAILED are
 * terminal; only PENDING permits an explicit, budgeted observer invocation.
 * Construction is not restoration, durable recovery or a global replay guard.
 */
export function createSelectedSettlementContextOwner(configuration) {
  if (arguments.length !== 1) reject();
  const config = record(configuration, CONFIG_FIELDS);
  const original = snapshotBinding(config.original);
  const first = callable(config.settleFirst);
  const observer = config.reconcilePending === null
    ? null : callable(config.reconcilePending);
  if (observer === first) reject();
  const budget = config.maxPendingReconciliations;
  if (!isSafeInteger(budget) || budget < 0 || budget > 16
      || sameValue(budget, -0)) reject();

  let state = 'NEW';
  let inFlight = false;
  let firstAuthorityConsumed = false;
  let firstAttempts = 0;
  let pendingReconciliations = 0;
  let publicationStatus = 'NOT_ESTABLISHED';
  let lastDeclaredStatus = 'NOT_ESTABLISHED';
  let hasDeclaredPublication = false;
  let acknowledgementDeclared = false;
  let uncertaintyRetained = false;
  let firstUncertainty = 'NONE';

  function retainUncertainty(reason) {
    uncertaintyRetained = true;
    if (firstUncertainty === 'NONE') firstUncertainty = reason;
  }

  function attempt(...args) {
    let supplied;
    try {
      if (args.length !== 1) reject();
      supplied = snapshotBinding(args[0]);
      for (let index = 0; index < BINDING_FIELDS.length; index++) {
        const field = BINDING_FIELDS[index];
        if (supplied[field] !== original[field]) reject();
      }
      if (inFlight || (state !== 'NEW' && state !== 'PENDING')) reject();
      if (state === 'PENDING'
          && (observer === null || pendingReconciliations >= budget)) reject();
    } catch {
      return rejected(failure());
    }

    const capability = promiseCapability();
    const observing = state === 'PENDING';
    inFlight = true;
    if (observing) {
      pendingReconciliations++;
      state = 'RECONCILING';
    } else {
      firstAuthorityConsumed = true;
      firstAttempts++;
      state = 'FIRST_IN_FLIGHT';
    }
    let finished = false;

    function uncertain() {
      if (finished) return;
      finished = true;
      publicationStatus = 'UNKNOWN';
      retainUncertainty('CALLBACK_OR_RESULT_UNKNOWN');
      state = 'UNKNOWN';
      inFlight = false;
      capability.reject(failure());
    }

    function complete(value) {
      if (finished) return;
      let packet;
      try {
        packet = snapshotPacket(value, original);
      } catch {
        uncertain();
        return;
      }
      finished = true;
      hasDeclaredPublication = true;
      lastDeclaredStatus = packet.publicationStatus;
      publicationStatus = packet.publicationStatus;
      if (publicationStatus === 'ACKNOWLEDGED') acknowledgementDeclared = true;
      if (publicationStatus === 'UNKNOWN') {
        retainUncertainty('DECLARED_PUBLICATION_UNKNOWN');
      }
      if (packet.disposition === 'UNKNOWN') retainUncertainty('DECLARED_UNKNOWN');
      state = packet.disposition;
      inFlight = false;
      capability.resolve(packet.responseJson);
    }

    try {
      const callback = observing ? observer : first;
      const value = apply(callback, undefined, [freshBinding(original)]);
      if (isProxy(value)) {
        uncertain();
      } else if (isPromise(value)) {
        // No .then lookup. Reject constructor overrides and foreign/subclass
        // prototypes before native then can consult their species machinery.
        if (getPrototypeOf(value) !== promisePrototype
            || getDescriptor(value, 'constructor') !== undefined) {
          uncertain();
        } else {
          apply(promiseThen, value, [complete, uncertain]);
        }
      } else {
        complete(value);
      }
    } catch {
      uncertain();
    }
    return capability.promise;
  }

  function getSnapshot(...args) {
    if (args.length !== 0) reject();
    return freeze({
      state,
      inFlight,
      firstAuthorityConsumed,
      firstAttempts,
      pendingReconciliations,
      totalAttempts: firstAttempts + pendingReconciliations,
      maxPendingReconciliations: budget,
      observerConfigured: observer !== null,
      publication: freeze({
        status: publicationStatus,
        lastDeclaredStatus,
        hasDeclaredPublication,
        acknowledgementDeclared,
        uncertaintyRetained,
        firstUncertainty,
      }),
      bindings: freeze({
        retained: true,
        scope: 'DECLARED_SERIALIZED_CONTEXT_ONLY',
        payloadCharacters: original.payloadJson.length,
        requirementsCharacters: original.requirementsJson.length,
        challengeCharacters: original.challengeJson.length,
        custody: 'NOT_ESTABLISHED',
      }),
      persistence: 'MEMORY_ONLY',
      recoveryAuthority: 'NONE',
      qualification: 'DECLARED_CALLBACK_DATA_ONLY',
    });
  }

  return freeze({ attempt: freeze(attempt), getSnapshot: freeze(getSnapshot) });
}

function record(value, fields) {
  if (typeof value !== 'object' || value === null || isProxy(value)
      || getPrototypeOf(value) !== objectPrototype) reject();
  const keys = ownKeys(value);
  if (keys.length !== fields.length) reject();
  const result = {};
  for (let index = 0; index < fields.length; index++) {
    const field = fields[index];
    const descriptor = getDescriptor(value, field);
    if (descriptor === undefined || descriptor.enumerable !== true
        || !hasOwn(descriptor, 'value')) reject();
    result[field] = descriptor.value;
  }
  return result;
}

function callable(value) {
  if (typeof value !== 'function' || isProxy(value)) reject();
  return value;
}

function boundedString(value, limit, allowEmpty = false) {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)
      || value.length > limit
      || apply(byteLength, Buffer, [value, 'utf8']) > limit) reject();
}

function test(pattern, value) {
  return apply(regexpTest, pattern, [value]);
}

function snapshotBinding(value) {
  const b = record(value, BINDING_FIELDS);
  boundedString(b.payloadJson, 131072);
  boundedString(b.requirementsJson, 131072);
  boundedString(b.challengeJson, 131072);
  boundedString(b.paymentHash, 64);
  boundedString(b.network, 256);
  if (b.paymentHash.length !== 64 || !test(HASH, b.paymentHash)) reject();
  return freshBinding(b);
}

function freshBinding(b) {
  return freeze({
    payloadJson: b.payloadJson,
    requirementsJson: b.requirementsJson,
    challengeJson: b.challengeJson,
    paymentHash: b.paymentHash,
    network: b.network,
  });
}

function snapshotPacket(value, original) {
  const p = record(value, PACKET_FIELDS);
  const disposition = p.disposition;
  const publication = p.publicationStatus;
  if (disposition !== 'PENDING' && disposition !== 'SUCCEEDED'
      && disposition !== 'FAILED' && disposition !== 'UNKNOWN') reject();
  if (publication !== 'NOT_ESTABLISHED' && publication !== 'UNKNOWN'
      && publication !== 'ACKNOWLEDGED') reject();
  if ((disposition === 'SUCCEEDED' || disposition === 'FAILED')
      && publication === 'UNKNOWN') reject();
  boundedString(p.responseJson, 16384);
  const decoded = parse(p.responseJson);
  let response;
  if (disposition === 'SUCCEEDED') {
    const r = record(decoded, SUCCESS_FIELDS);
    boundedString(r.payer, 512);
    if (r.success !== true || r.transaction !== original.paymentHash
        || r.network !== original.network) reject();
    response = {
      success: true, payer: r.payer,
      transaction: r.transaction, network: r.network,
    };
  } else {
    const r = record(decoded, FAILURE_FIELDS);
    boundedString(r.transaction, 64, true);
    boundedString(r.network, 256);
    boundedString(r.errorReason, 128);
    if (r.success !== false || r.network !== original.network
        || (r.transaction !== '' && r.transaction !== original.paymentHash)
        || !test(REASON, r.errorReason) || r.errorMessage !== r.errorReason) reject();
    if (disposition === 'PENDING') {
      if (r.transaction !== original.paymentHash
          || r.errorReason !== 'settlement_pending') reject();
    } else if (r.errorReason === 'settlement_pending') {
      reject();
    }
    if (disposition === 'FAILED'
        && (r.errorReason === 'settlement_outcome_unknown'
          || r.errorReason === 'payment_reconciliation_terminal')) reject();
    response = {
      success: false, transaction: r.transaction, network: r.network,
      errorReason: r.errorReason, errorMessage: r.errorMessage,
    };
  }
  if (stringify(response) !== p.responseJson) reject();
  return freeze({
    disposition,
    publicationStatus: publication,
    responseJson: p.responseJson,
  });
}

function promiseCapability() {
  let resolve, rejectPromise;
  const promise = new NativePromise((yes, no) => {
    resolve = yes;
    rejectPromise = no;
  });
  return freeze({ promise, resolve, reject: rejectPromise });
}

function rejected(error) {
  const capability = promiseCapability();
  capability.reject(error);
  return capability.promise;
}

function failure() {
  const error = new TypeErrorConstructor('Selected settlement context operation rejected');
  defineProperty(error, 'code', {
    value: 'selected_settlement_context_rejected',
    enumerable: true,
  });
  defineProperty(error, 'stack', {
    value: 'TypeError: Selected settlement context operation rejected',
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return freeze(error);
}

function reject() {
  throw failure();
}

// Append only. No existing constant or owner implementation is changed.
export function normalizeSelectedSettlementCallbackResult(value, originalBinding) {
  if (arguments.length !== 2) reject();
  const binding = snapshotBinding(originalBinding);
  if (typeof value !== 'object' || value === null || isProxy(value)
      || getPrototypeOf(value) !== objectPrototype) reject();
  const keys = ownKeys(value);
  if (keys.length > 32) reject();
  const fields = [
    'success', 'payer', 'transaction', 'network', 'errorReason',
    'state', 'disposition', 'publicationStatus',
  ];
  const result = {};
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    if (typeof key !== 'string') reject();
    const descriptor = getDescriptor(value, key);
    if (descriptor === undefined || descriptor.enumerable !== true
        || !hasOwn(descriptor, 'value')) reject();
    for (let field = 0; field < fields.length; field++) {
      if (key === fields[field]) result[key] = descriptor.value;
    }
  }
  if (!hasOwn(result, 'success')
      || (result.success !== true && result.success !== false)) reject();

  const state = result.state;
  if (state !== undefined) {
    boundedString(state, 128);
    if (state !== 'PENDING' && state !== 'SETTLEMENT_PENDING'
        && state !== 'SUBMISSION_OUTCOME_UNKNOWN'
        && state !== 'SUBMISSION_ACKNOWLEDGED') reject();
  }
  const reason = result.errorReason;
  if (reason !== undefined) {
    boundedString(reason, 128);
    if (!test(REASON, reason)) reject();
  }
  const pendingReason = reason === 'settlement_pending';
  const unknownReason = reason === 'settlement_outcome_unknown'
    || reason === 'payment_reconciliation_terminal';
  if (result.success && (pendingReason || unknownReason)) reject();

  let requiredDisposition = state === 'SUBMISSION_OUTCOME_UNKNOWN' ? 'UNKNOWN'
    : state === 'PENDING' || state === 'SETTLEMENT_PENDING' ? 'PENDING'
      : undefined;
  if (pendingReason) {
    if (requiredDisposition !== undefined && requiredDisposition !== 'PENDING') reject();
    requiredDisposition = 'PENDING';
  }
  if (unknownReason) {
    if (requiredDisposition !== undefined && requiredDisposition !== 'UNKNOWN') reject();
    requiredDisposition = 'UNKNOWN';
  }

  let publicationStatus = result.publicationStatus;
  if (publicationStatus !== undefined && publicationStatus !== 'NOT_ESTABLISHED'
      && publicationStatus !== 'UNKNOWN' && publicationStatus !== 'ACKNOWLEDGED') reject();
  const requiredPublication = state === 'SUBMISSION_OUTCOME_UNKNOWN' ? 'UNKNOWN'
    : state === 'SUBMISSION_ACKNOWLEDGED' ? 'ACKNOWLEDGED' : undefined;
  if (requiredPublication !== undefined && publicationStatus !== undefined
      && publicationStatus !== requiredPublication) reject();
  if (publicationStatus === undefined) {
    publicationStatus = requiredPublication !== undefined ? requiredPublication
      : unknownReason ? 'UNKNOWN' : 'NOT_ESTABLISHED';
  }

  let disposition = result.disposition;
  if (disposition !== undefined && disposition !== 'PENDING'
      && disposition !== 'SUCCEEDED' && disposition !== 'FAILED'
      && disposition !== 'UNKNOWN') reject();
  if (requiredDisposition !== undefined && disposition !== undefined
      && disposition !== requiredDisposition) reject();
  if (disposition === undefined) {
    disposition = requiredDisposition !== undefined ? requiredDisposition
      : result.success ? 'SUCCEEDED'
        : publicationStatus === 'UNKNOWN' ? 'UNKNOWN' : 'FAILED';
  }
  if (result.success !== (disposition === 'SUCCEEDED')) reject();

  if ((disposition === 'SUCCEEDED' || disposition === 'PENDING')
      && result.network === undefined) reject();
  const transaction = result.transaction === undefined ? '' : result.transaction;
  const network = result.network === undefined ? binding.network : result.network;
  boundedString(transaction, 64, true);
  boundedString(network, 256);
  let response;
  if (result.success) {
    boundedString(result.payer, 512);
    response = {
      success: true, payer: result.payer, transaction, network,
    };
  } else {
    const errorReason = disposition === 'PENDING' ? 'settlement_pending'
      : reason !== undefined ? reason
        : disposition === 'UNKNOWN' ? 'settlement_outcome_unknown' : 'settlement_failed';
    response = {
      success: false, transaction, network,
      errorReason, errorMessage: errorReason,
    };
  }
  // Only constructed primitive fields are serialized. Reuse the owner's full
  // packet/binding consistency checks, including foreign hash/network refusal.
  return snapshotPacket({
    disposition, publicationStatus, responseJson: stringify(response),
  }, binding);
}
