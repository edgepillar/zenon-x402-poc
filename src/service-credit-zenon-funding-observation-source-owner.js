import { types as utilTypes } from 'node:util';

import { createZenonFundingObservationProducer } from './service-credit-zenon-funding-observation-producer.js';
import { ZenonFundingObserverSqliteStore } from './service-credit-zenon-funding-observer-sqlite-store.js';

// Default-off, one-shot composition over one injected cooperating read
// transport. This module owns the transport after successful construction but
// borrows the observer store. It performs no endpoint discovery, retry,
// failover, TLS setup, wallet operation, signing or publication.

const APPLY = Reflect.apply;
const KEYS = Reflect.ownKeys;
const DESCRIPTOR = Object.getOwnPropertyDescriptor;
const DEFINE = Object.defineProperty;
const PROTOTYPE = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const FREEZE = Object.freeze;
const IS_FROZEN = Object.isFrozen;
const IS_PROXY = utilTypes.isProxy;
const IS_PROMISE = utilTypes.isPromise;
const SAFE_INTEGER = Number.isSafeInteger;
const PARSE = JSON.parse;
const STRINGIFY = JSON.stringify;
const BYTE_LENGTH = Buffer.byteLength;
const SLICE = String.prototype.slice;
const TEST = RegExp.prototype.test;
const OBJECT_PROTOTYPE = Object.prototype;
const FUNCTION_PROTOTYPE = Function.prototype;
const PROMISE = Promise;
const PROMISE_PROTOTYPE = Promise.prototype;
const PROMISE_THEN = Promise.prototype.then;
const PROMISE_SPECIES = Symbol.species;
const PROMISE_CONSTRUCTOR_DESCRIPTOR = DESCRIPTOR(PROMISE_PROTOTYPE, 'constructor');
const PROMISE_SPECIES_DESCRIPTOR = DESCRIPTOR(PROMISE, PROMISE_SPECIES);
const PROMISE_THEN_DESCRIPTOR = DESCRIPTOR(PROMISE_PROTOTYPE, 'then');
const INITIAL_OBJECT_THEN_DESCRIPTOR = DESCRIPTOR(OBJECT_PROTOTYPE, 'then');
const STORE_PROTOTYPE = ZenonFundingObserverSqliteStore.prototype;
const LOAD = STORE_PROTOTYPE.load;
const HASH = /^[0-9a-f]{64}$/;
const COMMITMENT = /^sha256:[0-9a-f]{64}$/;
const TRANSACTION = /^zenontx:[0-9a-f]{64}$/;
const PREFIX = 'ZENON_FUNDING_OBSERVATION_SOURCE_OWNER_';
const PRODUCER_PREFIX = 'ZENON_FUNDING_OBSERVATION_PRODUCER_';
const PRODUCER_STORE_RECOVERY_REQUIRED = `${PRODUCER_PREFIX}STORE_RECOVERY_REQUIRED`;
const PRODUCER_SOURCE_CONTEXT_CONFLICT = `${PRODUCER_PREFIX}SOURCE_CONTEXT_CONFLICT`;
const MAX_PAGE_ENTRIES = 64;

const INVALID = Symbol('invalid');
const STALE = Symbol('stale');
const NEW = 0;
const OBSERVING = 1;
const CLOSING = 2;
const CLOSED = 3;
const CLOSE_UNCERTAIN = 4;

function put(target, key, value, enumerable = true) {
  const attributes = Object.create(null);
  attributes.value = value;
  attributes.enumerable = enumerable;
  attributes.writable = false;
  attributes.configurable = false;
  DEFINE(target, key, attributes);
}

function record(fields) {
  const result = Object.create(null);
  for (const key of KEYS(fields)) put(result, key, fields[key]);
  return FREEZE(result);
}

function sameDescriptor(actual, expected) {
  if (actual === undefined || expected === undefined) return actual === expected;
  const expectedKeys = KEYS(expected);
  if (KEYS(actual).length !== expectedKeys.length) return false;
  for (const key of expectedKeys) {
    if (!HAS_OWN(actual, key) || actual[key] !== expected[key]) return false;
  }
  return true;
}

function invariant() {
  return INITIAL_OBJECT_THEN_DESCRIPTOR === undefined
    && DESCRIPTOR(OBJECT_PROTOTYPE, 'then') === undefined
    && sameDescriptor(DESCRIPTOR(PROMISE_PROTOTYPE, 'constructor'), PROMISE_CONSTRUCTOR_DESCRIPTOR)
    && sameDescriptor(DESCRIPTOR(PROMISE, PROMISE_SPECIES), PROMISE_SPECIES_DESCRIPTOR)
    && sameDescriptor(DESCRIPTOR(PROMISE_PROTOTYPE, 'then'), PROMISE_THEN_DESCRIPTOR);
}

function fixedError(suffix, typed = false) {
  const code = `${PREFIX}${suffix}`;
  const error = typed ? new TypeError(code) : new Error(code);
  DEFINE(error, 'stack', {
    value: `${typed ? 'TypeError' : 'Error'}: ${code}`,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  put(error, 'code', code);
  return FREEZE(error);
}

function discard() {}

function pending() {
  let resolve;
  let reject;
  const promise = new PROMISE((accept, refuse) => { resolve = accept; reject = refuse; });
  const drain = APPLY(PROMISE_THEN, promise, [discard, discard]);
  if (!nativePromise(promise) || !nativePromise(drain)) throw INVALID;
  return record({ promise: FREEZE(promise), resolve, reject });
}

function rejectedError(error) {
  const capability = pending();
  capability.reject(error);
  return capability.promise;
}

function nativePromise(value) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value) || !IS_PROMISE(value)
      || PROTOTYPE(value) !== PROMISE_PROTOTYPE || Object.getOwnPropertyNames(value).length !== 0
      || !invariant()) return false;
  const ownConstructor = DESCRIPTOR(value, 'constructor');
  return ownConstructor === undefined
    || (HAS_OWN(ownConstructor, 'value') && ownConstructor.value === PROMISE
      && ownConstructor.writable === false && ownConstructor.enumerable === false
      && ownConstructor.configurable === false);
}

function observePromise(value, accepted, rejected) {
  if (!nativePromise(value)) return false;
  let bridge;
  try { bridge = APPLY(PROMISE_THEN, value, [accepted, rejected]); } catch { return false; }
  if (!nativePromise(bridge)) return false;
  try {
    const drain = APPLY(PROMISE_THEN, bridge, [discard, discard]);
    return nativePromise(drain);
  } catch { return false; }
}

function exact(value, fields, frozen = false) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value)
      || PROTOTYPE(value) !== OBJECT_PROTOTYPE || (frozen && !IS_FROZEN(value))
      || KEYS(value).length !== fields.length) throw INVALID;
  const result = Object.create(null);
  for (const field of fields) {
    const item = DESCRIPTOR(value, field);
    if (item === undefined || !HAS_OWN(item, 'value') || item.enumerable !== true) throw INVALID;
    if (frozen && (item.writable !== false || item.configurable !== false)) throw INVALID;
    put(result, field, item.value);
  }
  return FREEZE(result);
}

function data(value, field) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value)) throw INVALID;
  const item = DESCRIPTOR(value, field);
  if (item === undefined || !HAS_OWN(item, 'value') || item.enumerable !== true) throw INVALID;
  return item.value;
}

function optionalData(value, field) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value)) throw INVALID;
  const item = DESCRIPTOR(value, field);
  if (item === undefined) return undefined;
  if (!HAS_OWN(item, 'value') || item.enumerable !== true) throw INVALID;
  return item.value;
}

function integer(value, minimum = 0) {
  if (!SAFE_INTEGER(value) || Object.is(value, -0) || value < minimum) throw INVALID;
  return value;
}

function hash(value) {
  if (typeof value !== 'string' || value.length !== 64 || !APPLY(TEST, HASH, [value])) throw INVALID;
  return value;
}

function momentumIdentity(value) {
  if (PROTOTYPE(value) !== OBJECT_PROTOTYPE) throw INVALID;
  return FREEZE({ height: integer(data(value, 'height'), 1), hash: hash(data(value, 'hash')) });
}

function parseResultText(text, budget) {
  if (typeof text !== 'string' || text.length > budget.maximumBytes) throw INVALID;
  const bytes = APPLY(BYTE_LENGTH, undefined, [text, 'utf8']);
  if (bytes > budget.maximumBytes || budget.usedBytes + bytes > budget.maximumBytes) throw INVALID;
  budget.usedBytes += bytes;
  let value;
  try { value = APPLY(PARSE, undefined, [text]); } catch { throw INVALID; }
  return FREEZE({ text, value });
}

function pageShape(value, span) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value)
      || PROTOTYPE(value) !== OBJECT_PROTOTYPE) throw INVALID;
  integer(data(value, 'count'));
  const list = data(value, 'list');
  if (!Array.isArray(list) || PROTOTYPE(list) !== Array.prototype || list.length !== span) throw INVALID;
}

function confirmation(value, expectedBlockHash) {
  if (value === null) return null;
  if (PROTOTYPE(value) !== OBJECT_PROTOTYPE) throw INVALID;
  if (hash(data(value, 'hash')) !== expectedBlockHash) throw INVALID;
  const raw = optionalData(value, 'confirmationDetail');
  if (raw === undefined || raw === null) return null;
  if (PROTOTYPE(raw) !== OBJECT_PROTOTYPE) throw INVALID;
  integer(data(raw, 'numConfirmations'));
  integer(data(raw, 'momentumTimestamp'));
  return FREEZE({
    height: integer(data(raw, 'momentumHeight'), 1),
    hash: hash(data(raw, 'momentumHash')),
  });
}

function snapshotRecord(store, expectedRevision = null) {
  let loaded;
  try { loaded = APPLY(LOAD, store, []); } catch { throw INVALID; }
  const state = data(loaded, 'state');
  const revision = integer(data(state, 'revision'));
  if (expectedRevision !== null && revision !== expectedRevision) throw STALE;
  const checkpointValue = data(state, 'checkpoint');
  const checkpoint = FREEZE({
    height: integer(data(checkpointValue, 'height'), 1),
    hash: hash(data(checkpointValue, 'hash')),
  });
  const targetValue = data(state, 'target');
  const transactionId = data(targetValue, 'transactionId');
  if (typeof transactionId !== 'string' || transactionId.length !== 72
      || !APPLY(TEST, TRANSACTION, [transactionId])) throw INVALID;
  const catchUp = data(state, 'catchUp');
  const maximumPageEntries = integer(data(catchUp, 'maximumPageEntries'), 1);
  const maximumBackfillSpan = integer(data(catchUp, 'maximumBackfillSpan'), 1);
  if (maximumPageEntries > MAX_PAGE_ENTRIES) throw INVALID;
  return FREEZE({
    revision,
    checkpoint,
    transactionHash: APPLY(SLICE, transactionId, [8]),
    maximumPageEntries,
    maximumBackfillSpan,
  });
}

function producerFailure(error) {
  if (error === null || (typeof error !== 'object' && typeof error !== 'function')
      || IS_PROXY(error)) return 'recovery';
  let code;
  try {
    const descriptor = DESCRIPTOR(error, 'code');
    if (descriptor === undefined || !HAS_OWN(descriptor, 'value')) return 'recovery';
    code = descriptor.value;
  } catch {
    return 'recovery';
  }
  if (code === PRODUCER_SOURCE_CONTEXT_CONFLICT) return 'conflict';
  if (code === PRODUCER_STORE_RECOVERY_REQUIRED) return 'recovery';
  return 'recovery';
}

/**
 * Creates one inert, one-shot owner around an injected cooperating JSON-RPC
 * result transport and the existing funding observation producer. The exact
 * configuration is { fundingObserverStore, authorityRecord, sourceBinding,
 * limits, readTransportOwner }. All configuration and owner records are deeply
 * frozen. The transport owner contract is exactly
 * { transport: { callRead }, close, sourcePolicyCommitment }; callRead accepts one frozen
 * { method, params } and returns a prehandled native Promise for JSON result
 * text. close returns a prehandled native Promise and resolves only after its
 * admitted call and physical resources are quiescent. This module cannot
 * independently prove that an arbitrary injected implementation honors that
 * cooperating contract.
 *
 * observe({ expectedRevision }) admits one transcript. It never retries or
 * reconnects. Raw Momentum, list and AccountBlock result text is embedded
 * unchanged in the producer bundle. The borrowed store is never closed.
 * A producer result is released only after the owned transport close resolves
 * cleanly. This is not TLS, endpoint, node, chain, canonicality, finality,
 * settlement, credit or authorization evidence.
 */
export function createZenonFundingObservationSourceOwner(options) {
  let configuration;
  let producer;
  let callRead;
  let closeTransport;
  let initial;
  try {
    if (!invariant() || arguments.length !== 1) throw INVALID;
    configuration = exact(options, [
      'fundingObserverStore', 'authorityRecord', 'sourceBinding', 'limits', 'readTransportOwner',
    ], true);
    if (!IS_FROZEN(configuration.sourceBinding)) throw INVALID;
    for (const field of ['authorityGeneration', 'chainProfile', 'bootstrapCheckpoint']) {
      if (!IS_FROZEN(data(configuration.sourceBinding, field))) throw INVALID;
    }
    const bindingCommitment = data(configuration.sourceBinding, 'sourcePolicyCommitment');
    if (typeof bindingCommitment !== 'string'
        || !APPLY(TEST, COMMITMENT, [bindingCommitment])) throw INVALID;
    const owner = exact(
      configuration.readTransportOwner,
      ['transport', 'close', 'sourcePolicyCommitment'],
      true,
    );
    if (owner.sourcePolicyCommitment !== bindingCommitment) throw INVALID;
    const transport = exact(owner.transport, ['callRead'], true);
    callRead = transport.callRead;
    closeTransport = owner.close;
    for (const capability of [callRead, closeTransport]) {
      if (typeof capability !== 'function' || IS_PROXY(capability)
          || PROTOTYPE(capability) !== FUNCTION_PROTOTYPE || !IS_FROZEN(capability)) throw INVALID;
    }
    producer = createZenonFundingObservationProducer(FREEZE({
      fundingObserverStore: configuration.fundingObserverStore,
      authorityRecord: configuration.authorityRecord,
      sourceBinding: configuration.sourceBinding,
      limits: configuration.limits,
    }));
    initial = snapshotRecord(configuration.fundingObserverStore);
    if (initial.maximumPageEntries > MAX_PAGE_ENTRIES) throw INVALID;
  } catch {
    throw fixedError('INVALID_CONFIGURATION', true);
  }

  const errors = FREEZE({
    invalidInput: fixedError('INVALID_INPUT', true),
    busy: fixedError('BUSY'),
    closed: fixedError('CLOSED'),
    unavailable: fixedError('SOURCE_UNAVAILABLE'),
    closeUncertain: fixedError('CLOSE_UNCERTAIN'),
    stale: fixedError('STALE_REVISION'),
    recovery: fixedError('STORE_RECOVERY_REQUIRED'),
    conflict: fixedError('SOURCE_CONTEXT_CONFLICT'),
    invalidClose: fixedError('INVALID_CONFIGURATION', true),
  });
  const invalidObserve = rejectedError(errors.invalidInput);
  const busyObserve = rejectedError(errors.busy);
  const closedObserve = rejectedError(errors.closed);
  const invalidClose = rejectedError(errors.invalidClose);
  const observationCapability = pending();
  const closeCapability = pending();
  const store = configuration.fundingObserverStore;
  const sourceBinding = configuration.sourceBinding;
  const maximumReplyBytes = configuration.limits.maximumReplyBytes;
  let state = NEW;
  let explicitClose = false;
  let attemptDone = true;
  let closeRequested = false;
  let closeSettled = false;
  let closeClean = false;
  let observationStarted = false;
  let observationFailure = null;
  let candidate = null;
  let finishing = false;

  function finish() {
    if (finishing || !closeSettled) return;
    // A clean explicit close is the cooperating transport owner's proof that
    // its admitted call and physical resources are quiescent. It is therefore
    // safe to release close and refuse observation even if a buggy injected
    // transport leaves its already-drained read Promise unresolved. A later
    // settlement cannot re-enter producer admission. The owner cannot
    // independently verify that an arbitrary fake told the truth.
    if (closeClean && explicitClose) {
      finishing = true;
      state = CLOSED;
      closeCapability.resolve(undefined);
      if (observationStarted) observationCapability.reject(errors.closed);
      candidate = null;
      return;
    }
    if (!attemptDone && closeClean) return;
    finishing = true;
    if (!closeClean || !invariant()) {
      state = CLOSE_UNCERTAIN;
      closeCapability.reject(errors.closeUncertain);
      if (observationStarted) observationCapability.reject(errors.closeUncertain);
      candidate = null;
      return;
    }
    let result = null;
    if (observationStarted && !explicitClose && observationFailure === null && candidate !== null) {
      let producerInvoked = false;
      try {
        snapshotRecord(store, candidate.expectedRevision);
        producerInvoked = true;
        result = APPLY(producer.apply, undefined, [FREEZE({
          expectedRevision: candidate.expectedRevision,
          sourceBinding,
          reply: candidate.reply,
        })]);
      } catch (error) {
        if (error === STALE) observationFailure = 'stale';
        else observationFailure = producerInvoked ? producerFailure(error) : 'recovery';
      }
    }
    state = CLOSED;
    closeCapability.resolve(undefined);
    if (!observationStarted) return;
    if (explicitClose) observationCapability.reject(errors.closed);
    else if (observationFailure === 'input') observationCapability.reject(errors.invalidInput);
    else if (observationFailure === 'stale') observationCapability.reject(errors.stale);
    else if (observationFailure === 'recovery') observationCapability.reject(errors.recovery);
    else if (observationFailure === 'conflict') observationCapability.reject(errors.conflict);
    else if (observationFailure !== null || result === null) observationCapability.reject(errors.unavailable);
    else observationCapability.resolve(result);
    candidate = null;
  }

  function settleClose(clean) {
    if (closeSettled) return;
    closeSettled = true;
    closeClean = clean && invariant();
    finish();
  }

  function requestClose() {
    if (closeRequested) return;
    closeRequested = true;
    let result;
    try { result = APPLY(closeTransport, undefined, []); }
    catch { settleClose(false); return; }
    if (!observePromise(result, () => settleClose(true), () => settleClose(false))) settleClose(false);
  }

  function startClosing() {
    if (state !== CLOSED && state !== CLOSE_UNCERTAIN) state = CLOSING;
    requestClose();
    finish();
  }

  function read(method, params) {
    const outward = pending();
    if (state !== OBSERVING || !invariant()) {
      outward.reject(INVALID);
      return outward.promise;
    }
    const request = FREEZE({ method, params: FREEZE(params) });
    let result;
    try { result = APPLY(callRead, undefined, [request]); }
    catch { outward.reject(INVALID); return outward.promise; }
    const accepted = value => {
      if (state === OBSERVING && invariant() && typeof value === 'string') outward.resolve(value);
      else outward.reject(INVALID);
    };
    if (!observePromise(result, accepted, () => outward.reject(INVALID))) outward.reject(INVALID);
    return outward.promise;
  }

  async function collect(snapshot) {
    const budget = { maximumBytes: maximumReplyBytes, usedBytes: 0 };
    const opening = parseResultText(await read('ledger.getFrontierMomentum', []), budget);
    const openingIdentity = momentumIdentity(opening.value);
    if (state !== OBSERVING) throw INVALID;

    if (openingIdentity.height < snapshot.checkpoint.height) {
      const closing = parseResultText(await read('ledger.getFrontierMomentum', []), budget);
      if (closing.text !== opening.text) throw INVALID;
      const reply = `{"checkpoint":null,"frontier":${opening.text},"momentums":{"count":${openingIdentity.height},"list":[]},"accountBlock":null,"inclusionMomentum":null}`;
      if (APPLY(BYTE_LENGTH, undefined, [reply, 'utf8']) > maximumReplyBytes) throw INVALID;
      return FREEZE({ expectedRevision: snapshot.revision, reply });
    }

    const checkpointResult = parseResultText(
      await read('ledger.getMomentumByHash', [snapshot.checkpoint.hash]), budget,
    );
    const checkpointIdentity = momentumIdentity(checkpointResult.value);
    if (checkpointIdentity.height !== snapshot.checkpoint.height
        || checkpointIdentity.hash !== snapshot.checkpoint.hash) throw INVALID;

    const span = Math.min(
      openingIdentity.height - snapshot.checkpoint.height,
      snapshot.maximumPageEntries,
      snapshot.maximumBackfillSpan,
    );
    let pageText;
    if (span === 0) pageText = APPLY(STRINGIFY, undefined, [{ count: openingIdentity.height, list: [] }]);
    else {
      const page = parseResultText(
        await read('ledger.getMomentumsByHeight', [snapshot.checkpoint.height + 1, span]), budget,
      );
      pageShape(page.value, span);
      pageText = page.text;
    }

    const block = parseResultText(
      await read('ledger.getAccountBlockByHash', [snapshot.transactionHash]), budget,
    );
    let inclusionText = 'null';
    if (block.value !== null) {
      // Never let an endpoint-selected replacement block choose a dependent
      // inclusion query. Full tuple admission remains the producer's job after
      // clean close, but this source boundary first binds the returned block to
      // the one committed target and bounds every confirmation field it uses.
      const confirmed = confirmation(block.value, snapshot.transactionHash);
      if (confirmed !== null) {
        const inclusion = parseResultText(
          await read('ledger.getMomentumByHash', [confirmed.hash]), budget,
        );
        const identity = momentumIdentity(inclusion.value);
        if (identity.height !== confirmed.height || identity.hash !== confirmed.hash) throw INVALID;
        inclusionText = inclusion.text;
      }
    }

    const closing = parseResultText(await read('ledger.getFrontierMomentum', []), budget);
    if (closing.text !== opening.text) throw INVALID;
    const reply = `{"checkpoint":${checkpointResult.text},"frontier":${opening.text},"momentums":${pageText},"accountBlock":${block.text},"inclusionMomentum":${inclusionText}}`;
    if (APPLY(BYTE_LENGTH, undefined, [reply, 'utf8']) > maximumReplyBytes) throw INVALID;
    return FREEZE({ expectedRevision: snapshot.revision, reply });
  }

  function collected(value) {
    if (state === OBSERVING && invariant()) candidate = value;
    else observationFailure = explicitClose ? 'closed' : 'unavailable';
    attemptDone = true;
    startClosing();
  }

  function collectionRejected() {
    observationFailure = explicitClose ? 'closed' : 'unavailable';
    attemptDone = true;
    startClosing();
  }

  const observe = FREEZE(function observe(input) {
    if (arguments.length !== 1) return invalidObserve;
    if (state === OBSERVING) return busyObserve;
    if (state !== NEW) return closedObserve;
    observationStarted = true;
    attemptDone = false;
    state = OBSERVING;
    let expectedRevision;
    let snapshot;
    try {
      const request = exact(input, ['expectedRevision']);
      expectedRevision = integer(request.expectedRevision);
    } catch {
      observationFailure = 'input';
      attemptDone = true;
      startClosing();
      return observationCapability.promise;
    }
    try { snapshot = snapshotRecord(store, expectedRevision); }
    catch (error) {
      observationFailure = error === STALE ? 'stale' : 'recovery';
      attemptDone = true;
      startClosing();
      return observationCapability.promise;
    }
    let operation;
    try { operation = collect(snapshot); }
    catch {
      observationFailure = 'unavailable';
      attemptDone = true;
      startClosing();
      return observationCapability.promise;
    }
    if (!observePromise(operation, collected, collectionRejected)) {
      observationFailure = 'unavailable';
      attemptDone = true;
      startClosing();
    }
    return observationCapability.promise;
  });

  const close = FREEZE(function close() {
    if (arguments.length !== 0) return invalidClose;
    if (state === CLOSED || state === CLOSE_UNCERTAIN) return closeCapability.promise;
    explicitClose = true;
    if (state === NEW) attemptDone = true;
    startClosing();
    return closeCapability.promise;
  });

  return FREEZE({ observe, close });
}
