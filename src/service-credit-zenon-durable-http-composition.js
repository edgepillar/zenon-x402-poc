import { types as utilTypes } from 'node:util';

import {
  createDurableServiceCreditHttpSession,
} from './service-credit-durable-http-session.js';
import {
  createServiceCreditExecutionContract,
} from './service-credit-execution-contract.js';
import {
  ServiceCreditSqliteStore,
} from './service-credit-sqlite-store.js';
import {
  createZenonFundingComposition,
} from './service-credit-zenon-funding-composition.js';
import {
  ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS,
  ZenonFundingObserverSqliteStore,
} from './service-credit-zenon-funding-observer-sqlite-store.js';

const NATIVE_PROMISE = Promise;
const PROMISE_PROTOTYPE = NATIVE_PROMISE.prototype;
const PROMISE_THEN = PROMISE_PROTOTYPE.then;
const ARRAY_IS_ARRAY = Array.isArray;
const ARRAY_PROTOTYPE = Array.prototype;
const ARRAY_JOIN = ARRAY_PROTOTYPE.join;
const ARRAY_MAP = ARRAY_PROTOTYPE.map;
const ARRAY_SORT = ARRAY_PROTOTYPE.sort;
const NATIVE_BUFFER = Buffer;
const BUFFER_BYTE_LENGTH = NATIVE_BUFFER.byteLength;
const BUFFER_FROM = NATIVE_BUFFER.from;
const JSON_PARSE = JSON.parse;
const JSON_STRINGIFY = JSON.stringify;
const NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;
const OBJECT_CREATE = Object.create;
const OBJECT_DEFINE_PROPERTY = Object.defineProperty;
const OBJECT_FREEZE = Object.freeze;
const OBJECT_HAS_OWN = Object.hasOwn;
const OBJECT_IS = Object.is;
const OBJECT_IS_FROZEN = Object.isFrozen;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_APPLY = Reflect.apply;
const REFLECT_GET_OWN_PROPERTY_DESCRIPTOR = Reflect.getOwnPropertyDescriptor;
const REFLECT_GET_PROTOTYPE_OF = Reflect.getPrototypeOf;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const IS_PROXY = utilTypes.isProxy;
const NATIVE_WEAK_SET = WeakSet;
const WEAK_SET_ADD = WeakSet.prototype.add;
const WEAK_SET_HAS = WeakSet.prototype.has;

const SERVICE_STORE_PROTOTYPE = ServiceCreditSqliteStore.prototype;
const SERVICE_GET_OFFER = SERVICE_STORE_PROTOTYPE.getOffer;
const SERVICE_ACTIVATE_GRANT = SERVICE_STORE_PROTOTYPE.activateGrantFromTrustedRecord;
const SERVICE_DURABLE_SNAPSHOT = SERVICE_STORE_PROTOTYPE.getDurableExecutionSnapshot;
const SERVICE_INITIALIZE_DURABLE = SERVICE_STORE_PROTOTYPE.initializeDurableExecution;
const SERVICE_CLOSE = SERVICE_STORE_PROTOTYPE.close;
const OBSERVER_STORE_PROTOTYPE = ZenonFundingObserverSqliteStore.prototype;
const OBSERVER_LOAD = OBSERVER_STORE_PROTOTYPE.load;
const OBSERVER_PROJECT = OBSERVER_STORE_PROTOTYPE.projectCommittedFundingEvidence;
const OBSERVER_MATCH = OBSERVER_STORE_PROTOTYPE.matchReadyFundingEvidence;
const OBSERVER_CLOSE = OBSERVER_STORE_PROTOTYPE.close;
const CREATE_FUNDING_COMPOSITION = createZenonFundingComposition;
const CREATE_DURABLE_SESSION = createDurableServiceCreditHttpSession;
const CREATE_EXECUTION_CONTRACT = createServiceCreditExecutionContract;

const MAX_DEPTH = 24;
const MAX_ARRAY_LENGTH = 4_096;
const MAX_NODES = 8_192;
const MAX_MEMBERS = 8_192;
const MAX_STRING_CODE_UNITS = 256 * 1024;
const MAX_KEY_CODE_UNITS = 8 * 1024;
const MAX_CANONICAL_CODE_UNITS = 512 * 1024;
const CALLBACK_OWN_KEYS = OBJECT_FREEZE([
  'length',
  'name',
  'arguments',
  'caller',
  'prototype',
]);

const PHASE = OBJECT_FREEZE({
  NEW: 'NEW',
  STARTING: 'STARTING',
  ACTIVE: 'ACTIVE',
  CLOSING: 'CLOSING',
  CLOSED: 'CLOSED',
  PRE_ACTIVATION_UNAVAILABLE: 'PRE_ACTIVATION_UNAVAILABLE',
  RECOVERY_REQUIRED: 'RECOVERY_REQUIRED',
  ACTIVATED_UNAVAILABLE: 'ACTIVATED_UNAVAILABLE',
});

const CODE = OBJECT_FREEZE({
  invalidConfiguration: 'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_INVALID_CONFIGURATION',
  invalidInput: 'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_INVALID_INPUT',
  busy: 'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_BUSY',
  conflict: 'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_CONFLICT',
  notReady: 'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_NOT_READY',
  preActivationUnavailable:
    'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_PRE_ACTIVATION_UNAVAILABLE',
  recoveryRequired: 'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_RECOVERY_REQUIRED',
  activatedUnavailable: 'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_ACTIVATED_UNAVAILABLE',
  closed: 'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_CLOSED',
  closeFailed: 'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_CLOSE_FAILED',
});

const PRIVATE_HEADERS = OBJECT_FREEZE({
  'Cache-Control': 'private, no-store, max-age=0',
  'Content-Type': 'application/json',
  Vary: 'Authorization',
  'X-Content-Type-Options': 'nosniff',
});
const UNAVAILABLE_BODY = '{"error":"service_unavailable"}';
const UNAVAILABLE_LENGTH = REFLECT_APPLY(
  BUFFER_BYTE_LENGTH,
  NATIVE_BUFFER,
  [UNAVAILABLE_BODY, 'utf8'],
);
const ACTIVE_RESULT = OBJECT_FREEZE({ status: 'ACTIVE' });

export class ZenonDurableHttpCompositionError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ZenonDurableHttpCompositionError';
    this.code = code;
    this.stack = `ZenonDurableHttpCompositionError: ${code}`;
  }
}

function failure(code) {
  return OBJECT_FREEZE(new ZenonDurableHttpCompositionError(code));
}

function fail(code) {
  throw failure(code);
}

function errorCode(error) {
  try {
    const descriptor = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      Reflect,
      [error, 'code'],
    );
    return descriptor?.enumerable === true && OBJECT_HAS_OWN(descriptor, 'value')
      && typeof descriptor.value === 'string'
      ? descriptor.value
      : null;
  } catch {
    return null;
  }
}

function hasExpectedKey(keys, expected) {
  for (let index = 0; index < keys.length; index += 1) {
    if (keys[index] === expected) return true;
  }
  return false;
}

function exactDataObject(value, expectedKeys, code) {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || REFLECT_APPLY(IS_PROXY, undefined, [value])
      || REFLECT_APPLY(ARRAY_IS_ARRAY, undefined, [value])
      || REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, Reflect, [value]) !== OBJECT_PROTOTYPE
    ) {
      fail(code);
    }
    const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [value]);
    if (keys.length !== expectedKeys.length) fail(code);
    const captured = REFLECT_APPLY(OBJECT_CREATE, Object, [null]);
    for (let index = 0; index < expectedKeys.length; index += 1) {
      const key = expectedKeys[index];
      if (!hasExpectedKey(keys, key)) fail(code);
      const descriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        Reflect,
        [value, key],
      );
      if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) fail(code);
      captured[key] = descriptor.value;
    }
    return captured;
  } catch (error) {
    if (error instanceof ZenonDurableHttpCompositionError) throw error;
    fail(code);
  }
}

function safeCallable(value) {
  try {
    if (typeof value !== 'function' || REFLECT_APPLY(IS_PROXY, undefined, [value])) return false;
    const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [value]);
    for (let index = 0; index < keys.length; index += 1) {
      if (!hasExpectedKey(CALLBACK_OWN_KEYS, keys[index])) return false;
      const descriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        Reflect,
        [value, keys[index]],
      );
      if (!descriptor || !OBJECT_HAS_OWN(descriptor, 'value')) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function exactPrototypeMethod(prototype, name, expected) {
  const descriptor = REFLECT_APPLY(
    REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
    Reflect,
    [prototype, name],
  );
  return descriptor?.value === expected
    && descriptor.enumerable === false
    && descriptor.get === undefined
    && descriptor.set === undefined;
}

function exactStore(value, prototype, methods) {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || REFLECT_APPLY(IS_PROXY, undefined, [value])
      || REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, Reflect, [value]) !== prototype
      || REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [value]).length !== 0
      || REFLECT_APPLY(REFLECT_GET_OWN_PROPERTY_DESCRIPTOR, Reflect, [prototype, 'then'])
        !== undefined
      || REFLECT_APPLY(REFLECT_GET_OWN_PROPERTY_DESCRIPTOR, Reflect, [OBJECT_PROTOTYPE, 'then'])
        !== undefined
    ) return false;
    for (let index = 0; index < methods.length; index += 1) {
      const [name, expected] = methods[index];
      if (
        REFLECT_APPLY(REFLECT_GET_OWN_PROPERTY_DESCRIPTOR, Reflect, [value, name])
          !== undefined
        || !exactPrototypeMethod(prototype, name, expected)
      ) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function assertStores(serviceStore, observerStore, code = CODE.invalidConfiguration) {
  if (
    !exactStore(serviceStore, SERVICE_STORE_PROTOTYPE, [
      ['getOffer', SERVICE_GET_OFFER],
      ['activateGrantFromTrustedRecord', SERVICE_ACTIVATE_GRANT],
      ['getDurableExecutionSnapshot', SERVICE_DURABLE_SNAPSHOT],
      ['initializeDurableExecution', SERVICE_INITIALIZE_DURABLE],
      ['close', SERVICE_CLOSE],
    ])
    || !exactStore(observerStore, OBSERVER_STORE_PROTOTYPE, [
      ['load', OBSERVER_LOAD],
      ['projectCommittedFundingEvidence', OBSERVER_PROJECT],
      ['matchReadyFundingEvidence', OBSERVER_MATCH],
      ['close', OBSERVER_CLOSE],
    ])
  ) fail(code);
}

function copyJson(value, budget, depth = 0) {
  if (depth > MAX_DEPTH) fail(CODE.invalidInput);
  budget.nodes += 1;
  if (budget.nodes > MAX_NODES) fail(CODE.invalidInput);
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.length > MAX_STRING_CODE_UNITS) fail(CODE.invalidInput);
    budget.stringCodeUnits += value.length;
    if (budget.stringCodeUnits > MAX_STRING_CODE_UNITS) fail(CODE.invalidInput);
    return value;
  }
  if (typeof value === 'number') {
    if (!REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [value])) fail(CODE.invalidInput);
    return REFLECT_APPLY(OBJECT_IS, Object, [value, -0]) ? 0 : value;
  }
  if (
    typeof value !== 'object'
    || REFLECT_APPLY(IS_PROXY, undefined, [value])
    || REFLECT_APPLY(WEAK_SET_HAS, budget.seen, [value])
  ) fail(CODE.invalidInput);
  REFLECT_APPLY(WEAK_SET_ADD, budget.seen, [value]);
  const prototype = REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, Reflect, [value]);
  if (REFLECT_APPLY(ARRAY_IS_ARRAY, undefined, [value])) {
    const lengthDescriptor = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      Reflect,
      [value, 'length'],
    );
    if (
      prototype !== ARRAY_PROTOTYPE
      || !lengthDescriptor
      || lengthDescriptor.enumerable
      || !OBJECT_HAS_OWN(lengthDescriptor, 'value')
      || !REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [lengthDescriptor.value])
      || lengthDescriptor.value < 0
      || lengthDescriptor.value > MAX_ARRAY_LENGTH
    ) fail(CODE.invalidInput);
    const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [value]);
    if (keys.length !== lengthDescriptor.value + 1 || keys[keys.length - 1] !== 'length') {
      fail(CODE.invalidInput);
    }
    budget.members += lengthDescriptor.value;
    if (budget.members > MAX_MEMBERS) fail(CODE.invalidInput);
    const copy = [];
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const key = `${index}`;
      if (keys[index] !== key) fail(CODE.invalidInput);
      const descriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        Reflect,
        [value, key],
      );
      if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) {
        fail(CODE.invalidInput);
      }
      copy[index] = copyJson(descriptor.value, budget, depth + 1);
    }
    return copy;
  }
  if (prototype !== OBJECT_PROTOTYPE) fail(CODE.invalidInput);
  const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [value]);
  budget.members += keys.length;
  if (budget.members > MAX_MEMBERS) fail(CODE.invalidInput);
  const copy = {};
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (typeof key !== 'string' || key.length > MAX_KEY_CODE_UNITS) fail(CODE.invalidInput);
    budget.keyCodeUnits += key.length;
    if (budget.keyCodeUnits > MAX_KEY_CODE_UNITS) fail(CODE.invalidInput);
    const descriptor = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      Reflect,
      [value, key],
    );
    if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) fail(CODE.invalidInput);
    REFLECT_APPLY(OBJECT_DEFINE_PROPERTY, Object, [copy, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: copyJson(descriptor.value, budget, depth + 1),
    }]);
  }
  return copy;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    return REFLECT_APPLY(JSON_STRINGIFY, JSON, [value]);
  }
  if (REFLECT_APPLY(ARRAY_IS_ARRAY, undefined, [value])) {
    const parts = REFLECT_APPLY(ARRAY_MAP, value, [canonicalJson]);
    return `[${REFLECT_APPLY(ARRAY_JOIN, parts, [','])}]`;
  }
  const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [value]);
  REFLECT_APPLY(ARRAY_SORT, keys, []);
  const parts = REFLECT_APPLY(ARRAY_MAP, keys, [
    key => `${REFLECT_APPLY(JSON_STRINGIFY, JSON, [key])}:${canonicalJson(value[key])}`,
  ]);
  return `{${REFLECT_APPLY(ARRAY_JOIN, parts, [','])}}`;
}

function snapshotJson(value) {
  const copy = copyJson(value, {
    seen: new NATIVE_WEAK_SET(),
    nodes: 0,
    members: 0,
    keyCodeUnits: 0,
    stringCodeUnits: 0,
  });
  const canonical = canonicalJson(copy);
  if (canonical.length > MAX_CANONICAL_CODE_UNITS) fail(CODE.invalidInput);
  return REFLECT_APPLY(JSON_PARSE, JSON, [canonical]);
}

function nativePromiseCapability() {
  let resolve;
  let reject;
  const promise = new NATIVE_PROMISE((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return OBJECT_FREEZE({ promise, resolve, reject });
}

function nativeRejected(error) {
  const capability = nativePromiseCapability();
  capability.reject(error);
  return capability.promise;
}

function nativeResolved(value) {
  const capability = nativePromiseCapability();
  capability.resolve(value);
  return capability.promise;
}

function isNativePromise(value) {
  try {
    return value !== null
      && typeof value === 'object'
      && !REFLECT_APPLY(IS_PROXY, undefined, [value])
      && REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, Reflect, [value]) === PROMISE_PROTOTYPE;
  } catch {
    return false;
  }
}

function captureDurableExecution(value) {
  const input = exactDataObject(
    value,
    ['ledgerId', 'policy', 'capacity', 'selectedDurationMs'],
    CODE.invalidConfiguration,
  );
  const policy = exactDataObject(
    input.policy,
    ['policyId', 'policyVersion', 'maxDurationMs'],
    CODE.invalidConfiguration,
  );
  let normalized;
  try {
    normalized = REFLECT_APPLY(CREATE_EXECUTION_CONTRACT, undefined, [{
      ledgerId: input.ledgerId,
      policy: {
        policyId: policy.policyId,
        policyVersion: policy.policyVersion,
        maxDurationMs: policy.maxDurationMs,
      },
      capacity: input.capacity,
    }]);
  } catch {
    fail(CODE.invalidConfiguration);
  }
  if (
    !NUMBER_IS_SAFE_INTEGER(input.selectedDurationMs)
    || input.selectedDurationMs < 1
    || input.selectedDurationMs > normalized.policy.maxDurationMs
  ) fail(CODE.invalidConfiguration);
  return OBJECT_FREEZE({
    ledgerId: normalized.ledgerId,
    policy: OBJECT_FREEZE({
      policyId: normalized.policy.policyId,
      policyVersion: normalized.policy.policyVersion,
      maxDurationMs: normalized.policy.maxDurationMs,
    }),
    capacity: normalized.capacity,
    selectedDurationMs: input.selectedDurationMs,
  });
}

function captureDeadlineRuntime(value) {
  const runtime = exactDataObject(
    value,
    ['monotonicNowNs', 'schedule', 'cancel'],
    CODE.invalidConfiguration,
  );
  if (
    !safeCallable(runtime.monotonicNowNs)
    || !safeCallable(runtime.schedule)
    || !safeCallable(runtime.cancel)
  ) fail(CODE.invalidConfiguration);
  return OBJECT_FREEZE({
    monotonicNowNs: runtime.monotonicNowNs,
    schedule: runtime.schedule,
    cancel: runtime.cancel,
  });
}

function assertReadyObserver(value) {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || value.outbox === null
      || typeof value.outbox !== 'object'
      || value.outbox.status
        !== ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.READY
      || value.state === null
      || typeof value.state !== 'object'
      || value.state.quarantine !== null
    ) fail(CODE.notReady);
  } catch (error) {
    if (error instanceof ZenonDurableHttpCompositionError) throw error;
    fail(CODE.notReady);
  }
}

function samePolicy(left, right) {
  return left !== null
    && typeof left === 'object'
    && left.policyId === right.policyId
    && left.policyVersion === right.policyVersion
    && left.maxDurationMs === right.maxDurationMs;
}

function validSettledExecutionState(value, configuration) {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || value.ledgerId !== configuration.ledgerId
      || value.capacity !== configuration.capacity
      || !samePolicy(value.policy, configuration.policy)
      || value.generation === null
      || typeof value.generation !== 'object'
      || value.generation.state !== 'OPEN'
      || value.generation.seal !== null
      || !ARRAY_IS_ARRAY(value.executions)
    ) return false;
    for (let index = 0; index < value.executions.length; index += 1) {
      if (value.executions[index]?.terminalClassification === 'NONE') return false;
    }
    return true;
  } catch {
    return false;
  }
}

function durableSnapshot(store, code) {
  let snapshot;
  try {
    snapshot = REFLECT_APPLY(SERVICE_DURABLE_SNAPSHOT, store, []);
  } catch {
    fail(code);
  }
  if (
    snapshot === null
    || typeof snapshot !== 'object'
    || !NUMBER_IS_SAFE_INTEGER(snapshot.revision)
    || snapshot.revision < 0
    || !OBJECT_HAS_OWN(snapshot, 'executionState')
  ) fail(code);
  return snapshot;
}

function isCommitAmbiguity(code) {
  return code === 'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_OUTCOME_UNKNOWN'
    || code === 'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_LATCHED'
    || code === 'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_OUTCOME_UNKNOWN'
    || code === 'SERVICE_CREDIT_STORE_COMMIT_FAILED';
}

function mapPreActivationFailure(error) {
  const code = errorCode(error);
  if (code === CODE.recoveryRequired || isCommitAmbiguity(code)) {
    return CODE.recoveryRequired;
  }
  if (
    code === 'SERVICE_CREDIT_STORE_CAPACITY_EXCEEDED'
    || code === 'SERVICE_CREDIT_STORE_EXECUTION_CONFLICT'
    || code === 'SERVICE_CREDIT_STORE_INVALID_EXECUTION_INPUT'
    || code === CODE.invalidConfiguration
  ) return CODE.invalidConfiguration;
  if (
    code === CODE.notReady
    || code === 'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_NOT_READY'
    || code === 'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_NOT_READY'
    || code === 'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_REJECTED'
  ) return CODE.notReady;
  if (code === CODE.preActivationUnavailable) return code;
  return CODE.preActivationUnavailable;
}

function terminalPhase(code) {
  if (code === CODE.recoveryRequired) return PHASE.RECOVERY_REQUIRED;
  if (code === CODE.activatedUnavailable) return PHASE.ACTIVATED_UNAVAILABLE;
  return PHASE.PRE_ACTIVATION_UNAVAILABLE;
}

function sendUnavailable(response) {
  try {
    if (response.destroyed || response.writableEnded) return;
    const bytes = REFLECT_APPLY(BUFFER_FROM, NATIVE_BUFFER, [UNAVAILABLE_BODY, 'utf8']);
    response.statusCode = 503;
    response.setHeader('Cache-Control', PRIVATE_HEADERS['Cache-Control']);
    response.setHeader('Content-Type', PRIVATE_HEADERS['Content-Type']);
    response.setHeader('Vary', PRIVATE_HEADERS.Vary);
    response.setHeader('X-Content-Type-Options', PRIVATE_HEADERS['X-Content-Type-Options']);
    response.setHeader('Content-Length', UNAVAILABLE_LENGTH);
    response.end(bytes);
  } catch {
    try { response.destroy(); } catch {}
  }
}

/**
 * Owns one explicit, listener-free startup and shutdown lifecycle around the
 * provider-attested funding composition and durable HTTP session. Construction
 * performs bounded committed-state reads only. It neither creates a listener
 * nor performs source, wallet, signing, payment, or network work.
 */
export function createZenonDurableHttpComposition(options) {
  if (arguments.length !== 1) fail(CODE.invalidConfiguration);
  const configuration = exactDataObject(options, [
    'serviceCreditStore',
    'fundingObserverStore',
    'authorityRecord',
    'deriveFundingTerms',
    'now',
    'durableExecution',
    'execute',
    'deadlineRuntime',
  ], CODE.invalidConfiguration);
  if (
    typeof configuration.authorityRecord !== 'string'
    || configuration.authorityRecord.length === 0
    || configuration.authorityRecord.length > MAX_STRING_CODE_UNITS
    || !safeCallable(configuration.deriveFundingTerms)
    || !safeCallable(configuration.now)
    || !safeCallable(configuration.execute)
  ) fail(CODE.invalidConfiguration);

  assertStores(configuration.serviceCreditStore, configuration.fundingObserverStore);
  const durableExecution = captureDurableExecution(configuration.durableExecution);
  const deadlineRuntime = captureDeadlineRuntime(configuration.deadlineRuntime);
  const serviceStore = configuration.serviceCreditStore;
  const observerStore = configuration.fundingObserverStore;

  let initialObserver;
  let initialDurable;
  let fundingComposition;
  try {
    initialObserver = REFLECT_APPLY(OBSERVER_LOAD, observerStore, []);
    assertReadyObserver(initialObserver);
    if (REFLECT_APPLY(OBSERVER_PROJECT, observerStore, []) === null) fail(CODE.notReady);
    initialDurable = durableSnapshot(serviceStore, CODE.invalidConfiguration);
    if (
      initialDurable.executionState !== null
      && !validSettledExecutionState(initialDurable.executionState, durableExecution)
    ) fail(CODE.invalidConfiguration);
    fundingComposition = REFLECT_APPLY(CREATE_FUNDING_COMPOSITION, undefined, [{
      serviceCreditStore: serviceStore,
      fundingObserverStore: observerStore,
      authorityRecord: configuration.authorityRecord,
      deriveFundingTerms: configuration.deriveFundingTerms,
      now: configuration.now,
    }]);
    assertReadyObserver(REFLECT_APPLY(OBSERVER_LOAD, observerStore, []));
    if (REFLECT_APPLY(OBSERVER_PROJECT, observerStore, []) === null) fail(CODE.notReady);
  } catch (error) {
    if (error instanceof ZenonDurableHttpCompositionError) throw error;
    fail(CODE.invalidConfiguration);
  }

  const execute = configuration.execute;
  const state = {
    phase: PHASE.NEW,
    startFingerprint: null,
    startPromise: null,
    startupPending: false,
    activationCompleted: false,
    terminalCode: null,
    session: null,
    closePromise: null,
    closeCapability: null,
    callbackActive: false,
  };

  function assertBoundStores(code = CODE.activatedUnavailable) {
    assertStores(serviceStore, observerStore, code);
  }

  const guardedExecute = OBJECT_FREEZE(function zenonDurableExecute(identity) {
    if (state.phase !== PHASE.ACTIVE && state.phase !== PHASE.CLOSING) {
      throw failure(CODE.activatedUnavailable);
    }
    state.callbackActive = true;
    try {
      return REFLECT_APPLY(execute, undefined, [identity]);
    } finally {
      state.callbackActive = false;
    }
  });

  function initializeOrValidateDurableExecution() {
    assertBoundStores(CODE.preActivationUnavailable);
    let snapshot = durableSnapshot(serviceStore, CODE.preActivationUnavailable);
    if (snapshot.executionState === null) {
      let initialized;
      try {
        initialized = REFLECT_APPLY(SERVICE_INITIALIZE_DURABLE, serviceStore, [{
          expectedRevision: snapshot.revision,
          ledgerId: durableExecution.ledgerId,
          policy: durableExecution.policy,
          capacity: durableExecution.capacity,
        }]);
      } catch (error) {
        throw failure(mapPreActivationFailure(error));
      }
      if (
        initialized === null
        || typeof initialized !== 'object'
        || (
          initialized.disposition !== 'APPLIED'
          && initialized.disposition !== 'UNCHANGED'
          && initialized.disposition !== 'STALE'
        )
      ) fail(CODE.preActivationUnavailable);
      snapshot = durableSnapshot(serviceStore, CODE.preActivationUnavailable);
    }
    if (!validSettledExecutionState(snapshot.executionState, durableExecution)) {
      fail(CODE.invalidConfiguration);
    }
  }

  function buildSession() {
    assertBoundStores();
    let session;
    try {
      session = REFLECT_APPLY(CREATE_DURABLE_SESSION, undefined, [{
        store: serviceStore,
        execute: guardedExecute,
        deadlineRuntime,
        selectedDurationMs: durableExecution.selectedDurationMs,
      }]);
    } catch {
      fail(CODE.activatedUnavailable);
    }
    if (
      session === null
      || typeof session !== 'object'
      || !REFLECT_APPLY(OBJECT_IS_FROZEN, Object, [session])
      || REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [session]).length !== 2
      || !safeCallable(session.handle)
      || !safeCallable(session.close)
    ) fail(CODE.activatedUnavailable);
    state.session = session;
  }

  function settleStartupFailure(code) {
    state.startupPending = false;
    state.terminalCode = code;
    if (state.phase !== PHASE.CLOSING) {
      state.phase = terminalPhase(code);
    }
  }

  function start(input) {
    let captured;
    try {
      const top = exactDataObject(input, ['intent', 'paymentRequired'], CODE.invalidInput);
      captured = snapshotJson({ intent: top.intent, paymentRequired: top.paymentRequired });
    } catch (error) {
      if (error instanceof ZenonDurableHttpCompositionError) throw error;
      fail(CODE.invalidInput);
    }
    const fingerprint = canonicalJson(captured);
    if (state.startPromise !== null) {
      if (fingerprint !== state.startFingerprint) fail(CODE.conflict);
      if (state.phase === PHASE.STARTING || state.phase === PHASE.ACTIVE) {
        return state.startPromise;
      }
    }
    if (state.phase === PHASE.CLOSING || state.phase === PHASE.CLOSED) {
      return nativeRejected(failure(CODE.closed));
    }
    if (state.phase === PHASE.RECOVERY_REQUIRED) {
      return nativeRejected(failure(CODE.recoveryRequired));
    }
    if (state.phase === PHASE.ACTIVATED_UNAVAILABLE) {
      return nativeRejected(failure(CODE.activatedUnavailable));
    }
    if (state.phase === PHASE.PRE_ACTIVATION_UNAVAILABLE) {
      return nativeRejected(failure(state.terminalCode ?? CODE.preActivationUnavailable));
    }
    if (state.phase !== PHASE.NEW) return nativeRejected(failure(CODE.busy));

    const capability = nativePromiseCapability();
    state.phase = PHASE.STARTING;
    state.startFingerprint = fingerprint;
    state.startPromise = capability.promise;
    state.startupPending = true;
    let activationPromise;
    try {
      assertBoundStores(CODE.preActivationUnavailable);
      const fresh = REFLECT_APPLY(OBSERVER_LOAD, observerStore, []);
      assertReadyObserver(fresh);
      initializeOrValidateDurableExecution();
      activationPromise = fundingComposition.activateCommittedFunding(captured);
      if (!isNativePromise(activationPromise)) fail(CODE.preActivationUnavailable);
    } catch (error) {
      const code = mapPreActivationFailure(error);
      settleStartupFailure(code);
      capability.reject(failure(code));
      if (state.closeCapability !== null) finishClose();
      return capability.promise;
    }

    REFLECT_APPLY(PROMISE_THEN, activationPromise, [
      () => {
        state.activationCompleted = true;
        try {
          buildSession();
          state.startupPending = false;
          if (state.phase === PHASE.CLOSING) {
            capability.reject(failure(CODE.closed));
            finishClose();
            return;
          }
          state.phase = PHASE.ACTIVE;
          capability.resolve(ACTIVE_RESULT);
        } catch (error) {
          const code = errorCode(error) === CODE.recoveryRequired
            ? CODE.recoveryRequired
            : CODE.activatedUnavailable;
          settleStartupFailure(code);
          capability.reject(failure(code));
          if (state.closeCapability !== null) finishClose();
        }
      },
      error => {
        const code = mapPreActivationFailure(error);
        settleStartupFailure(code);
        capability.reject(failure(code));
        if (state.closeCapability !== null) finishClose();
      },
    ]);
    return capability.promise;
  }

  const handle = OBJECT_FREEZE(function zenonDurableHttpHandle(request, response, ...extra) {
    if (extra.length !== 0 || state.phase !== PHASE.ACTIVE || state.session === null) {
      sendUnavailable(response);
      return nativeResolved(undefined);
    }
    try {
      const result = REFLECT_APPLY(state.session.handle, undefined, [request, response]);
      return isNativePromise(result) ? result : nativeResolved(undefined);
    } catch {
      sendUnavailable(response);
      return nativeResolved(undefined);
    }
  });

  function closeStores() {
    try {
      assertBoundStores(CODE.closeFailed);
      REFLECT_APPLY(OBSERVER_CLOSE, observerStore, []);
      REFLECT_APPLY(SERVICE_CLOSE, serviceStore, []);
      const capability = state.closeCapability;
      state.closeCapability = null;
      if (
        state.terminalCode === CODE.recoveryRequired
        || state.terminalCode === CODE.activatedUnavailable
      ) {
        state.phase = terminalPhase(state.terminalCode);
        capability.reject(failure(state.terminalCode));
      } else {
        state.phase = PHASE.CLOSED;
        capability.resolve(undefined);
      }
    } catch {
      if (state.terminalCode === null) {
        state.terminalCode = state.activationCompleted
          ? CODE.activatedUnavailable
          : CODE.preActivationUnavailable;
      }
      state.phase = terminalPhase(state.terminalCode);
      const capability = state.closeCapability;
      state.closeCapability = null;
      state.closePromise = null;
      capability.reject(failure(CODE.closeFailed));
    }
  }

  function finishClose() {
    if (state.closeCapability === null || state.startupPending) return;
    if (state.session === null) {
      closeStores();
      return;
    }
    let sessionClose;
    try {
      sessionClose = REFLECT_APPLY(state.session.close, undefined, []);
      if (!isNativePromise(sessionClose)) fail(CODE.closeFailed);
    } catch {
      const capability = state.closeCapability;
      state.closeCapability = null;
      state.closePromise = null;
      state.phase = PHASE.ACTIVATED_UNAVAILABLE;
      capability.reject(failure(CODE.closeFailed));
      return;
    }
    REFLECT_APPLY(PROMISE_THEN, sessionClose, [
      () => closeStores(),
      () => {
        const capability = state.closeCapability;
        state.closeCapability = null;
        state.closePromise = null;
        if (state.terminalCode === null) {
          state.terminalCode = state.activationCompleted
            ? CODE.activatedUnavailable
            : CODE.preActivationUnavailable;
        }
        state.phase = terminalPhase(state.terminalCode);
        capability.reject(failure(CODE.closeFailed));
      },
    ]);
  }

  function close(...args) {
    if (args.length !== 0) return nativeRejected(failure(CODE.invalidInput));
    if (state.callbackActive) {
      state.phase = PHASE.CLOSING;
      return nativeRejected(failure(CODE.closeFailed));
    }
    if (state.phase === PHASE.CLOSED) return state.closePromise ?? nativeResolved(undefined);
    if (state.closePromise !== null) return state.closePromise;
    if (
      state.phase === PHASE.RECOVERY_REQUIRED
      || state.phase === PHASE.ACTIVATED_UNAVAILABLE
    ) {
      state.terminalCode = state.phase === PHASE.RECOVERY_REQUIRED
        ? CODE.recoveryRequired
        : CODE.activatedUnavailable;
    }
    const capability = nativePromiseCapability();
    state.closeCapability = capability;
    state.closePromise = capability.promise;
    state.phase = PHASE.CLOSING;
    finishClose();
    return capability.promise;
  }

  return OBJECT_FREEZE({ start: OBJECT_FREEZE(start), handle, close: OBJECT_FREEZE(close) });
}
