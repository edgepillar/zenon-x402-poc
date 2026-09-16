import { types as utilTypes } from 'node:util';

import {
  createServiceCreditBoundedHttpsIngressOwner,
} from './service-credit-bounded-https-ingress-owner.js';
import {
  createServiceCreditBoundedNodeHttpsServerFactory,
} from './service-credit-bounded-node-https-server-factory.js';
import {
  createServiceCreditExternalHolderGrantDescriptorHandoffHttpIngress,
} from './service-credit-external-holder-grant-descriptor-handoff-http-ingress.js';
import {
  createZenonDurableHttpComposition,
} from './service-credit-zenon-durable-http-composition.js';
import {
  createServiceCreditZenonDurableHttpsRouter,
} from './service-credit-zenon-durable-https-router.js';
import {
  createZenonFundingComposition,
} from './service-credit-zenon-funding-composition.js';

const NATIVE_ARRAY = Array;
const ARRAY_IS_ARRAY = NATIVE_ARRAY.isArray;
const NATIVE_NUMBER = Number;
const NUMBER_IS_SAFE_INTEGER = NATIVE_NUMBER.isSafeInteger;
const NUMBER_MAX_SAFE_INTEGER = NATIVE_NUMBER.MAX_SAFE_INTEGER;
const NATIVE_OBJECT = Object;
const OBJECT_CREATE = NATIVE_OBJECT.create;
const OBJECT_DEFINE_PROPERTY = NATIVE_OBJECT.defineProperty;
const OBJECT_FREEZE = NATIVE_OBJECT.freeze;
const OBJECT_HAS_OWN = NATIVE_OBJECT.hasOwn;
const OBJECT_IS_EXTENSIBLE = NATIVE_OBJECT.isExtensible;
const OBJECT_IS_FROZEN = NATIVE_OBJECT.isFrozen;
const OBJECT_PROTOTYPE = NATIVE_OBJECT.prototype;
const NATIVE_PROMISE = Promise;
const PROMISE_PROTOTYPE = NATIVE_PROMISE.prototype;
const NATIVE_REFLECT = Reflect;
const REFLECT_APPLY = NATIVE_REFLECT.apply;
const REFLECT_DEFINE_PROPERTY = NATIVE_REFLECT.defineProperty;
const REFLECT_DELETE_PROPERTY = NATIVE_REFLECT.deleteProperty;
const REFLECT_GET_OWN_PROPERTY_DESCRIPTOR = NATIVE_REFLECT.getOwnPropertyDescriptor;
const REFLECT_GET_PROTOTYPE_OF = NATIVE_REFLECT.getPrototypeOf;
const REFLECT_OWN_KEYS = NATIVE_REFLECT.ownKeys;
const PROMISE_THEN_DESCRIPTOR = OBJECT_FREEZE(REFLECT_APPLY(
  REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
  NATIVE_REFLECT,
  [PROMISE_PROTOTYPE, 'then'],
));
const PROMISE_THEN = PROMISE_THEN_DESCRIPTOR.value;
const PROMISE_PROTOTYPE_CONSTRUCTOR_DESCRIPTOR = OBJECT_FREEZE(REFLECT_APPLY(
  REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
  NATIVE_REFLECT,
  [PROMISE_PROTOTYPE, 'constructor'],
));
const NATIVE_SYMBOL = Symbol;
const PROMISE_SPECIES = NATIVE_SYMBOL.species;
const PROMISE_SPECIES_DESCRIPTOR = OBJECT_FREEZE(REFLECT_APPLY(
  REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
  NATIVE_REFLECT,
  [NATIVE_PROMISE, PROMISE_SPECIES],
));
const NATIVE_TYPE_ERROR = TypeError;
const NATIVE_REGEXP = RegExp;
const REGEXP_EXEC = NATIVE_REGEXP.prototype.exec;
const IS_PROMISE = utilTypes.isPromise;
const IS_PROXY = utilTypes.isProxy;

const CREATE_BOUNDED_HTTPS_INGRESS = createServiceCreditBoundedHttpsIngressOwner;
const CREATE_BOUNDED_NODE_HTTPS_FACTORY = createServiceCreditBoundedNodeHttpsServerFactory;
const CREATE_EXTERNAL_HOLDER_HANDOFF_INGRESS =
  createServiceCreditExternalHolderGrantDescriptorHandoffHttpIngress;
const CREATE_DURABLE_HTTP_COMPOSITION = createZenonDurableHttpComposition;
const CREATE_DURABLE_HTTPS_ROUTER = createServiceCreditZenonDurableHttpsRouter;
const CREATE_FUNDING_COMPOSITION = createZenonFundingComposition;

const CONFIGURATION_KEYS = OBJECT_FREEZE([
  'transport',
  'routes',
  'funding',
  'durable',
  'handoff',
]);
const TRANSPORT_KEYS = OBJECT_FREEZE([
  'origin',
  'bind',
  'tlsMaterial',
  'generation',
  'limits',
  'deadlineRuntime',
]);
const ROUTE_KEYS = OBJECT_FREEZE([
  'serviceCredit',
  'handoffChallenge',
  'handoffRedemption',
]);
const FUNDING_KEYS = OBJECT_FREEZE([
  'serviceCreditStore',
  'fundingObserverStore',
  'authorityRecord',
  'deriveFundingTerms',
  'now',
  'selection',
  'resourceUrl',
]);
const DURABLE_KEYS = OBJECT_FREEZE([
  'execution',
  'execute',
  'deadlineRuntime',
]);
const HANDOFF_KEYS = OBJECT_FREEZE([
  'challengeLifetimeMs',
  'now',
  'deadlineRuntime',
  'bodyDeadlineMs',
  'responseDeadlineMs',
  'closeGraceMs',
  'metricsCounterLimit',
]);
const BIND_KEYS = OBJECT_FREEZE(['host', 'port', 'exclusive']);
const TLS_MATERIAL_KEYS = OBJECT_FREEZE(['key', 'cert']);
const GENERATION_KEYS = OBJECT_FREEZE(['generationId', 'generationVersion']);
const LIMIT_KEYS = OBJECT_FREEZE([
  'maxHeaderBytes',
  'maxHeaderCount',
  'maxConcurrentSockets',
  'maxConnectionStarts',
  'maxConcurrentRequests',
  'maxRequestStarts',
  'tlsHandshakeDeadlineMs',
  'headerDeadlineMs',
  'requestResponseDeadlineMs',
  'idleSocketDeadlineMs',
  'startDeadlineMs',
  'closeGraceMs',
  'metricsCounterLimit',
]);
const DEADLINE_KEYS = OBJECT_FREEZE(['schedule', 'cancel']);
const DURABLE_DEADLINE_KEYS = OBJECT_FREEZE(['monotonicNowNs', 'schedule', 'cancel']);
const SELECTION_KEYS = OBJECT_FREEZE([
  'offerId',
  'offerVersion',
  'holderId',
  'capabilityCommitment',
]);
const EXECUTION_KEYS = OBJECT_FREEZE([
  'ledgerId',
  'policy',
  'capacity',
  'selectedDurationMs',
]);
const EXECUTION_POLICY_KEYS = OBJECT_FREEZE([
  'policyId',
  'policyVersion',
  'maxDurationMs',
]);
const ACTIVATION_KEYS = OBJECT_FREEZE(['intent', 'paymentRequired']);
const FUNDING_OWNER_KEYS = OBJECT_FREEZE([
  'createFundingResource',
  'activateCommittedFunding',
]);
const DURABLE_OWNER_KEYS = OBJECT_FREEZE([
  'start',
  'handle',
  'getActiveGrantDescriptor',
  'getActiveGrantDescriptorForSelection',
  'close',
]);
const HANDOFF_OWNER_KEYS = OBJECT_FREEZE(['handle', 'close', 'snapshotMetrics']);
const ROUTER_KEYS = OBJECT_FREEZE(['handle', 'close']);
const INGRESS_KEYS = OBJECT_FREEZE(['start', 'close', 'snapshotMetrics']);
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const COMMITMENT = /^sha256:[0-9a-f]{64}$/;
const MAX_LOCAL_DEADLINE_MS = 60_000;

const PHASE = OBJECT_FREEZE({
  UNAVAILABLE: 'UNAVAILABLE',
  STARTING: 'STARTING',
  CHALLENGE: 'CHALLENGE',
  ACTIVATING: 'ACTIVATING',
  ACTIVE: 'ACTIVE',
  CLOSING: 'CLOSING',
  CLOSED: 'CLOSED',
  START_UNAVAILABLE: 'START_UNAVAILABLE',
  PRE_ACTIVATION_UNAVAILABLE: 'PRE_ACTIVATION_UNAVAILABLE',
  RECOVERY_REQUIRED: 'RECOVERY_REQUIRED',
  ACTIVATED_UNAVAILABLE: 'ACTIVATED_UNAVAILABLE',
  TRANSPORT_UNCERTAIN: 'TRANSPORT_UNCERTAIN',
});

const ROUTING_PHASE = OBJECT_FREEZE({
  UNAVAILABLE: 'UNAVAILABLE',
  CHALLENGE: 'CHALLENGE',
  ACTIVE: 'ACTIVE',
});

const CODE = OBJECT_FREEZE({
  invalidConfiguration:
    'SERVICE_CREDIT_ZENON_HTTPS_OPERATOR_PILOT_INVALID_CONFIGURATION',
  invalidInput:
    'SERVICE_CREDIT_ZENON_HTTPS_OPERATOR_PILOT_INVALID_INPUT',
  closed:
    'SERVICE_CREDIT_ZENON_HTTPS_OPERATOR_PILOT_CLOSED',
  startUnavailable:
    'SERVICE_CREDIT_ZENON_HTTPS_OPERATOR_PILOT_START_UNAVAILABLE',
  activationConflict:
    'SERVICE_CREDIT_ZENON_HTTPS_OPERATOR_PILOT_ACTIVATION_CONFLICT',
  preActivationUnavailable:
    'SERVICE_CREDIT_ZENON_HTTPS_OPERATOR_PILOT_PRE_ACTIVATION_UNAVAILABLE',
  recoveryRequired:
    'SERVICE_CREDIT_ZENON_HTTPS_OPERATOR_PILOT_RECOVERY_REQUIRED',
  activatedUnavailable:
    'SERVICE_CREDIT_ZENON_HTTPS_OPERATOR_PILOT_ACTIVATED_UNAVAILABLE',
  closeUncertain:
    'SERVICE_CREDIT_ZENON_HTTPS_OPERATOR_PILOT_CLOSE_UNCERTAIN',
});

const CODE_PHASE = OBJECT_FREEZE({
  [CODE.startUnavailable]: PHASE.START_UNAVAILABLE,
  [CODE.preActivationUnavailable]: PHASE.PRE_ACTIVATION_UNAVAILABLE,
  [CODE.recoveryRequired]: PHASE.RECOVERY_REQUIRED,
  [CODE.activatedUnavailable]: PHASE.ACTIVATED_UNAVAILABLE,
  [CODE.closeUncertain]: PHASE.TRANSPORT_UNCERTAIN,
});

const CODE_PRIORITY = OBJECT_FREEZE({
  [CODE.startUnavailable]: 1,
  [CODE.closeUncertain]: 1,
  [CODE.preActivationUnavailable]: 2,
  [CODE.activatedUnavailable]: 3,
  [CODE.recoveryRequired]: 4,
});

const START_RESULT = OBJECT_FREEZE({ status: 'CHALLENGE' });
const ACTIVE_RESULT = OBJECT_FREEZE({ status: 'ACTIVE' });
const CLOSED_RESULT = OBJECT_FREEZE({ status: 'CLOSED' });

const PROMISE_OBSERVATION = OBJECT_FREEZE({
  OBSERVED: 'OBSERVED',
  NOT_PROMISE: 'NOT_PROMISE',
  UNOBSERVABLE: 'UNOBSERVABLE',
});

function failure(code) {
  const error = new NATIVE_TYPE_ERROR(code);
  OBJECT_DEFINE_PROPERTY(error, 'code', {
    value: code,
    enumerable: true,
    writable: false,
    configurable: false,
  });
  OBJECT_DEFINE_PROPERTY(error, 'stack', {
    value: `TypeError: ${code}`,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return OBJECT_FREEZE(error);
}

function allowedKey(expected, key) {
  if (typeof key !== 'string') return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (expected[index] === key) return true;
  }
  return false;
}

function exactDataObject(value, expected, requireFrozen = false) {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || REFLECT_APPLY(IS_PROXY, undefined, [value])
      || REFLECT_APPLY(ARRAY_IS_ARRAY, NATIVE_ARRAY, [value])
      || REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, NATIVE_REFLECT, [value])
        !== OBJECT_PROTOTYPE
      || (requireFrozen
        && !REFLECT_APPLY(OBJECT_IS_FROZEN, NATIVE_OBJECT, [value]))
    ) return null;
    const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, NATIVE_REFLECT, [value]);
    if (keys.length !== expected.length) return null;
    const captured = REFLECT_APPLY(OBJECT_CREATE, NATIVE_OBJECT, [null]);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (!allowedKey(expected, key)) return null;
      const descriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        NATIVE_REFLECT,
        [value, key],
      );
      if (
        descriptor === undefined
        || descriptor.enumerable !== true
        || !OBJECT_HAS_OWN(descriptor, 'value')
      ) return null;
      captured[key] = descriptor.value;
    }
    for (let index = 0; index < expected.length; index += 1) {
      if (!OBJECT_HAS_OWN(captured, expected[index])) return null;
    }
    return captured;
  } catch {
    return null;
  }
}

function safeFrozenCallable(value) {
  try {
    return typeof value === 'function'
      && !REFLECT_APPLY(IS_PROXY, undefined, [value])
      && REFLECT_APPLY(OBJECT_IS_FROZEN, NATIVE_OBJECT, [value]);
  } catch {
    return false;
  }
}

function regexpMatches(expression, value) {
  return typeof value === 'string'
    && REFLECT_APPLY(REGEXP_EXEC, expression, [value]) !== null;
}

function captureFrozenCallableRecord(value, keys) {
  const captured = exactDataObject(value, keys, true);
  if (captured === null) return null;
  for (let index = 0; index < keys.length; index += 1) {
    if (!safeFrozenCallable(captured[keys[index]])) return null;
  }
  return captured;
}

function samePropertyDescriptor(left, right) {
  if (left === undefined || right === undefined) return left === right;
  if (
    left.configurable !== right.configurable
    || left.enumerable !== right.enumerable
  ) return false;
  const leftIsData = OBJECT_HAS_OWN(left, 'value');
  if (leftIsData !== OBJECT_HAS_OWN(right, 'value')) return false;
  if (leftIsData) {
    return left.writable === right.writable && left.value === right.value;
  }
  return left.get === right.get && left.set === right.set;
}

function capturedNativePromiseRouteIsCurrent() {
  try {
    const constructorDescriptor = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      NATIVE_REFLECT,
      [PROMISE_PROTOTYPE, 'constructor'],
    );
    const speciesDescriptor = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      NATIVE_REFLECT,
      [NATIVE_PROMISE, PROMISE_SPECIES],
    );
    return OBJECT_HAS_OWN(PROMISE_THEN_DESCRIPTOR, 'value')
      && typeof PROMISE_THEN === 'function'
      && !REFLECT_APPLY(IS_PROXY, undefined, [PROMISE_THEN])
      && OBJECT_HAS_OWN(PROMISE_PROTOTYPE_CONSTRUCTOR_DESCRIPTOR, 'value')
      && PROMISE_PROTOTYPE_CONSTRUCTOR_DESCRIPTOR.value === NATIVE_PROMISE
      && !OBJECT_HAS_OWN(PROMISE_SPECIES_DESCRIPTOR, 'value')
      && typeof PROMISE_SPECIES_DESCRIPTOR.get === 'function'
      && !REFLECT_APPLY(IS_PROXY, undefined, [PROMISE_SPECIES_DESCRIPTOR.get])
      && PROMISE_SPECIES_DESCRIPTOR.set === undefined
      && samePropertyDescriptor(
        constructorDescriptor,
        PROMISE_PROTOTYPE_CONSTRUCTOR_DESCRIPTOR,
      )
      && samePropertyDescriptor(speciesDescriptor, PROMISE_SPECIES_DESCRIPTOR);
  } catch {
    return false;
  }
}

function exactNativePromise(value) {
  try {
    return value !== null
      && typeof value === 'object'
      && !REFLECT_APPLY(IS_PROXY, undefined, [value])
      && REFLECT_APPLY(IS_PROMISE, undefined, [value]) === true
      && REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, NATIVE_REFLECT, [value])
        === PROMISE_PROTOTYPE;
  } catch {
    return false;
  }
}

function restorePromiseConstructorDescriptor(promise, originalDescriptor) {
  try {
    if (originalDescriptor === undefined) {
      if (!REFLECT_APPLY(
        REFLECT_DELETE_PROPERTY,
        NATIVE_REFLECT,
        [promise, 'constructor'],
      )) return false;
    } else if (!REFLECT_APPLY(
      REFLECT_DEFINE_PROPERTY,
      NATIVE_REFLECT,
      [promise, 'constructor', originalDescriptor],
    )) return false;
    const restoredDescriptor = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      NATIVE_REFLECT,
      [promise, 'constructor'],
    );
    return samePropertyDescriptor(restoredDescriptor, originalDescriptor);
  } catch {
    return false;
  }
}

function observeNativePromise(promise, fulfilled, rejected) {
  if (!exactNativePromise(promise)) return PROMISE_OBSERVATION.NOT_PROMISE;
  let constructorDescriptor;
  try {
    constructorDescriptor = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      NATIVE_REFLECT,
      [promise, 'constructor'],
    );
  } catch {
    return PROMISE_OBSERVATION.UNOBSERVABLE;
  }

  let direct = false;
  if (constructorDescriptor === undefined) {
    direct = capturedNativePromiseRouteIsCurrent();
  } else if (
    OBJECT_HAS_OWN(constructorDescriptor, 'value')
    && constructorDescriptor.value === undefined
  ) {
    direct = true;
  } else if (
    OBJECT_HAS_OWN(constructorDescriptor, 'value')
    && constructorDescriptor.value === NATIVE_PROMISE
  ) {
    direct = capturedNativePromiseRouteIsCurrent();
  } else {
    return PROMISE_OBSERVATION.UNOBSERVABLE;
  }

  let enabled = false;
  const onFulfilled = value => {
    if (!enabled) return;
    try { REFLECT_APPLY(fulfilled, undefined, [value]); } catch {}
  };
  const onRejected = reason => {
    if (!enabled) return;
    try { REFLECT_APPLY(rejected, undefined, [reason]); } catch {}
  };
  if (direct) {
    try {
      REFLECT_APPLY(PROMISE_THEN, promise, [onFulfilled, onRejected]);
    } catch {
      return PROMISE_OBSERVATION.UNOBSERVABLE;
    }
    enabled = true;
    return PROMISE_OBSERVATION.OBSERVED;
  }
  if (
    constructorDescriptor !== undefined
    || !REFLECT_APPLY(OBJECT_IS_EXTENSIBLE, NATIVE_OBJECT, [promise])
  ) return PROMISE_OBSERVATION.UNOBSERVABLE;

  const temporaryDescriptor = {
    configurable: true,
    enumerable: false,
    writable: false,
    value: undefined,
  };
  let installed = false;
  try {
    installed = REFLECT_APPLY(
      REFLECT_DEFINE_PROPERTY,
      NATIVE_REFLECT,
      [promise, 'constructor', temporaryDescriptor],
    );
    if (!installed) return PROMISE_OBSERVATION.UNOBSERVABLE;
    const current = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      NATIVE_REFLECT,
      [promise, 'constructor'],
    );
    if (!samePropertyDescriptor(current, temporaryDescriptor)) {
      restorePromiseConstructorDescriptor(promise, constructorDescriptor);
      return PROMISE_OBSERVATION.UNOBSERVABLE;
    }
  } catch {
    if (installed) restorePromiseConstructorDescriptor(promise, constructorDescriptor);
    return PROMISE_OBSERVATION.UNOBSERVABLE;
  }
  let attached = false;
  try {
    REFLECT_APPLY(PROMISE_THEN, promise, [onFulfilled, onRejected]);
    attached = true;
  } catch {}
  const restored = restorePromiseConstructorDescriptor(promise, constructorDescriptor);
  if (!attached || !restored) return PROMISE_OBSERVATION.UNOBSERVABLE;
  enabled = true;
  return PROMISE_OBSERVATION.OBSERVED;
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

function nativeResolved(value) {
  const capability = nativePromiseCapability();
  capability.resolve(value);
  return capability.promise;
}

function nativeRejected(error) {
  const capability = nativePromiseCapability();
  capability.reject(error);
  return capability.promise;
}

function ownErrorCode(value) {
  try {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
      return null;
    }
    const descriptor = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      NATIVE_REFLECT,
      [value, 'code'],
    );
    return descriptor?.enumerable === true
      && OBJECT_HAS_OWN(descriptor, 'value')
      && typeof descriptor.value === 'string'
      ? descriptor.value
      : null;
  } catch {
    return null;
  }
}

function increment(value) {
  return value < NUMBER_MAX_SAFE_INTEGER ? value + 1 : value;
}

function captureConfiguration(value) {
  const top = exactDataObject(value, CONFIGURATION_KEYS, true);
  const transport = top === null
    ? null
    : exactDataObject(top.transport, TRANSPORT_KEYS, true);
  const routes = top === null ? null : exactDataObject(top.routes, ROUTE_KEYS, true);
  const funding = top === null
    ? null
    : exactDataObject(top.funding, FUNDING_KEYS, true);
  const durable = top === null
    ? null
    : exactDataObject(top.durable, DURABLE_KEYS, true);
  const handoff = top === null
    ? null
    : exactDataObject(top.handoff, HANDOFF_KEYS, true);
  if (
    top === null
    || transport === null
    || routes === null
    || funding === null
    || durable === null
    || handoff === null
  ) return null;

  const bind = exactDataObject(transport.bind, BIND_KEYS, true);
  const tlsMaterial = exactDataObject(transport.tlsMaterial, TLS_MATERIAL_KEYS, true);
  const generation = exactDataObject(transport.generation, GENERATION_KEYS, true);
  const limits = exactDataObject(transport.limits, LIMIT_KEYS, true);
  const transportDeadline = exactDataObject(
    transport.deadlineRuntime,
    DEADLINE_KEYS,
    true,
  );
  const selection = exactDataObject(funding.selection, SELECTION_KEYS, true);
  const execution = exactDataObject(durable.execution, EXECUTION_KEYS, true);
  const executionPolicy = execution === null
    ? null
    : exactDataObject(execution.policy, EXECUTION_POLICY_KEYS, true);
  const durableDeadline = exactDataObject(
    durable.deadlineRuntime,
    DURABLE_DEADLINE_KEYS,
    true,
  );
  const handoffDeadline = exactDataObject(
    handoff.deadlineRuntime,
    DEADLINE_KEYS,
    true,
  );
  if (
    bind === null
    || tlsMaterial === null
    || generation === null
    || limits === null
    || transportDeadline === null
    || selection === null
    || execution === null
    || executionPolicy === null
    || durableDeadline === null
    || handoffDeadline === null
    || typeof transport.origin !== 'string'
    || typeof routes.serviceCredit !== 'string'
    || typeof routes.handoffChallenge !== 'string'
    || typeof routes.handoffRedemption !== 'string'
    || typeof funding.authorityRecord !== 'string'
    || typeof funding.resourceUrl !== 'string'
    || funding.resourceUrl !== `${transport.origin}${routes.serviceCredit}`
    || !safeFrozenCallable(funding.deriveFundingTerms)
    || !safeFrozenCallable(funding.now)
    || !safeFrozenCallable(durable.execute)
    || !safeFrozenCallable(transportDeadline.schedule)
    || !safeFrozenCallable(transportDeadline.cancel)
    || !safeFrozenCallable(durableDeadline.monotonicNowNs)
    || !safeFrozenCallable(durableDeadline.schedule)
    || !safeFrozenCallable(durableDeadline.cancel)
    || !safeFrozenCallable(handoff.now)
    || !safeFrozenCallable(handoffDeadline.schedule)
    || !safeFrozenCallable(handoffDeadline.cancel)
    || !regexpMatches(IDENTIFIER, selection.offerId)
    || !NUMBER_IS_SAFE_INTEGER(selection.offerVersion)
    || selection.offerVersion < 1
    || !regexpMatches(IDENTIFIER, selection.holderId)
    || !regexpMatches(COMMITMENT, selection.capabilityCommitment)
    || !NUMBER_IS_SAFE_INTEGER(handoff.challengeLifetimeMs)
    || handoff.challengeLifetimeMs < 1
    || handoff.challengeLifetimeMs > MAX_LOCAL_DEADLINE_MS
    || !NUMBER_IS_SAFE_INTEGER(handoff.bodyDeadlineMs)
    || handoff.bodyDeadlineMs < 1
    || handoff.bodyDeadlineMs > MAX_LOCAL_DEADLINE_MS
    || !NUMBER_IS_SAFE_INTEGER(handoff.responseDeadlineMs)
    || handoff.responseDeadlineMs < 1
    || handoff.responseDeadlineMs > MAX_LOCAL_DEADLINE_MS
    || !NUMBER_IS_SAFE_INTEGER(handoff.closeGraceMs)
    || handoff.closeGraceMs < 1
    || handoff.closeGraceMs > MAX_LOCAL_DEADLINE_MS
    || !NUMBER_IS_SAFE_INTEGER(handoff.metricsCounterLimit)
    || handoff.metricsCounterLimit < 1
  ) return null;

  return OBJECT_FREEZE({
    transport: OBJECT_FREEZE({
      origin: transport.origin,
      bind: top.transport.bind,
      tlsMaterial: top.transport.tlsMaterial,
      generation: top.transport.generation,
      limits: top.transport.limits,
      deadlineRuntime: top.transport.deadlineRuntime,
    }),
    routes: OBJECT_FREEZE({
      serviceCredit: routes.serviceCredit,
      handoffChallenge: routes.handoffChallenge,
      handoffRedemption: routes.handoffRedemption,
    }),
    funding: OBJECT_FREEZE({
      serviceCreditStore: funding.serviceCreditStore,
      fundingObserverStore: funding.fundingObserverStore,
      authorityRecord: funding.authorityRecord,
      deriveFundingTerms: funding.deriveFundingTerms,
      now: funding.now,
      selection: top.funding.selection,
      resourceUrl: funding.resourceUrl,
    }),
    durable: OBJECT_FREEZE({
      execution: top.durable.execution,
      execute: durable.execute,
      deadlineRuntime: top.durable.deadlineRuntime,
    }),
    handoff: OBJECT_FREEZE({
      challengeLifetimeMs: handoff.challengeLifetimeMs,
      now: handoff.now,
      deadlineRuntime: top.handoff.deadlineRuntime,
      bodyDeadlineMs: handoff.bodyDeadlineMs,
      responseDeadlineMs: handoff.responseDeadlineMs,
      closeGraceMs: handoff.closeGraceMs,
      metricsCounterLimit: handoff.metricsCounterLimit,
    }),
  });
}

function mappedDurableFailure(error, ownsDurableCustody) {
  const code = ownErrorCode(error);
  if (
    code === 'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_RECOVERY_REQUIRED'
    || code === 'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_OUTCOME_UNKNOWN'
    || code === 'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_LATCHED'
    || code === 'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_OUTCOME_UNKNOWN'
    || code === 'SERVICE_CREDIT_STORE_COMMIT_FAILED'
  ) return CODE.recoveryRequired;
  if (code === 'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_CONFLICT') {
    return CODE.activationConflict;
  }
  if (
    code === 'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_ACTIVATED_UNAVAILABLE'
    || code === 'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_CLOSE_FAILED'
  ) return CODE.activatedUnavailable;
  if (
    code === 'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_NOT_READY'
    || code === 'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_PRE_ACTIVATION_UNAVAILABLE'
    || code === 'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_INVALID_CONFIGURATION'
    || code === 'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_INVALID_INPUT'
  ) return ownsDurableCustody
    ? CODE.preActivationUnavailable
    : CODE.preActivationUnavailable;
  return ownsDurableCustody
    ? CODE.activatedUnavailable
    : CODE.preActivationUnavailable;
}

/**
 * Creates one default-off, single-use application lifecycle over the reviewed
 * bounded Node HTTPS factory, ingress owner, durable router, committed funding
 * composition, durable owner, and selection-bound holder handoff. Construction
 * performs only bounded validation, state reads, and private in-memory capture.
 */
export function createServiceCreditZenonHttpsOperatorPilot(options) {
  if (arguments.length !== 1) throw failure(CODE.invalidConfiguration);
  let configuration = captureConfiguration(options);
  if (configuration === null) throw failure(CODE.invalidConfiguration);

  let fundingOwner;
  try {
    fundingOwner = REFLECT_APPLY(CREATE_FUNDING_COMPOSITION, undefined, [{
      serviceCreditStore: configuration.funding.serviceCreditStore,
      fundingObserverStore: configuration.funding.fundingObserverStore,
      authorityRecord: configuration.funding.authorityRecord,
      deriveFundingTerms: configuration.funding.deriveFundingTerms,
      now: configuration.funding.now,
    }]);
  } catch {
    throw failure(CODE.invalidConfiguration);
  }
  const capturedFundingOwner = exactDataObject(
    fundingOwner,
    FUNDING_OWNER_KEYS,
    true,
  );
  if (
    capturedFundingOwner === null
    || typeof capturedFundingOwner.createFundingResource !== 'function'
    || REFLECT_APPLY(IS_PROXY, undefined, [capturedFundingOwner.createFundingResource])
  ) throw failure(CODE.invalidConfiguration);
  let createFundingResource = capturedFundingOwner.createFundingResource;
  fundingOwner = null;

  let phase = PHASE.UNAVAILABLE;
  let terminalCode = null;
  let terminalPriority = 0;
  let shutdownStarted = false;
  let transportClosed = false;
  let durableCustody = false;
  let activationCallActive = false;
  let activationReentered = false;
  let activationSettled = false;
  let durableOwner = null;
  let durableStart = null;
  let durableHandle = null;
  let durableDescriptorForSelection = null;
  let durableClose = null;
  let durableStartPromise = null;
  let handoffController = null;
  let handoffHandle = null;
  let handoffClose = null;
  let ingressStart = null;
  let ingressClose = null;
  let ingressSnapshotMetrics = null;
  let startCapability = null;
  let startPromise = null;
  let startSettled = false;
  let activationCapability = null;
  let activationPromise = null;
  let closeCapability = null;
  let closePromise = null;
  let closeSettled = false;
  let durableCloseStarted = false;
  let startAttempts = 0;
  let activationAttempts = 0;
  let closeAttempts = 0;
  let handoffAdmissions = 0;
  let descriptorReads = 0;
  const ingressMetrics = {
    connectionStarts: 0,
    requestsAdmitted: 0,
    requestsRejected: 0,
    handlerFailures: 0,
    trackedSockets: 0,
    trackedRequests: 0,
    trackedHandlers: 0,
    ownedTimers: 0,
    closeClean: 0,
    closeUncertain: 0,
  };

  function routingPhase() {
    if (phase === PHASE.CHALLENGE) return ROUTING_PHASE.CHALLENGE;
    if (phase === PHASE.ACTIVE) return ROUTING_PHASE.ACTIVE;
    return ROUTING_PHASE.UNAVAILABLE;
  }

  const getRoutingPhase = OBJECT_FREEZE(function getOperatorPilotRoutingPhase() {
    return routingPhase();
  });

  const fundingLifecycle = OBJECT_FREEZE({
    createFundingResource: OBJECT_FREEZE(function createOperatorPilotFundingResource(resource) {
      if (createFundingResource === null) throw failure(CODE.closed);
      return REFLECT_APPLY(createFundingResource, undefined, [resource]);
    }),
  });

  const durableLifecycle = OBJECT_FREEZE({
    handle: OBJECT_FREEZE(function handleOperatorPilotDurableRequest(request, response) {
      if (phase !== PHASE.ACTIVE || durableHandle === null) {
        return nativeRejected(failure(CODE.activatedUnavailable));
      }
      try {
        return REFLECT_APPLY(durableHandle, undefined, [request, response]);
      } catch {
        return nativeRejected(failure(CODE.activatedUnavailable));
      }
    }),
  });

  const handoffLifecycle = OBJECT_FREEZE({
    handle: OBJECT_FREEZE(function handleOperatorPilotHandoff(
      request,
      response,
      transportContext,
    ) {
      if (phase !== PHASE.ACTIVE || handoffHandle === null) {
        return nativeRejected(failure(CODE.activatedUnavailable));
      }
      try {
        return REFLECT_APPLY(handoffHandle, undefined, [
          request,
          response,
          transportContext,
        ]);
      } catch {
        return nativeRejected(failure(CODE.activatedUnavailable));
      }
    }),
    close: OBJECT_FREEZE(function closeOperatorPilotHandoff() {
      const operation = handoffClose;
      handoffController = null;
      handoffHandle = null;
      handoffClose = null;
      if (operation === null) return nativeResolved(undefined);
      try {
        return REFLECT_APPLY(operation, undefined, []);
      } catch {
        return nativeRejected(failure(CODE.closeUncertain));
      }
    }),
  });

  let router;
  let nativeFactory;
  let ingress;
  try {
    router = REFLECT_APPLY(CREATE_DURABLE_HTTPS_ROUTER, undefined, [OBJECT_FREEZE({
      requestTargets: OBJECT_FREEZE({
        serviceCredit: configuration.routes.serviceCredit,
        handoffChallenge: configuration.routes.handoffChallenge,
        handoffRedemption: configuration.routes.handoffRedemption,
      }),
      getPhase: getRoutingPhase,
      fundingComposition: fundingLifecycle,
      fundingResource: OBJECT_FREEZE({
        selection: configuration.funding.selection,
        resourceUrl: configuration.funding.resourceUrl,
      }),
      durableComposition: durableLifecycle,
      handoffController: handoffLifecycle,
    })]);
    const capturedRouter = captureFrozenCallableRecord(router, ROUTER_KEYS);
    if (capturedRouter === null) throw failure(CODE.invalidConfiguration);
    router = OBJECT_FREEZE({
      handle: capturedRouter.handle,
      close: capturedRouter.close,
    });

    nativeFactory = REFLECT_APPLY(CREATE_BOUNDED_NODE_HTTPS_FACTORY, undefined, [
      OBJECT_FREEZE({
        bind: configuration.transport.bind,
        tlsMaterial: configuration.transport.tlsMaterial,
      }),
    ]);
    if (!safeFrozenCallable(nativeFactory)) throw failure(CODE.invalidConfiguration);

    ingress = REFLECT_APPLY(CREATE_BOUNDED_HTTPS_INGRESS, undefined, [{
      origin: configuration.transport.origin,
      requestTargets: OBJECT_FREEZE([
        configuration.routes.handoffChallenge,
        configuration.routes.handoffRedemption,
        configuration.routes.serviceCredit,
      ]),
      generation: configuration.transport.generation,
      limits: configuration.transport.limits,
      downstream: router,
      deadlineRuntime: configuration.transport.deadlineRuntime,
      httpsServerFactory: nativeFactory,
    }]);
  } catch {
    throw failure(CODE.invalidConfiguration);
  }
  const capturedIngress = captureFrozenCallableRecord(ingress, INGRESS_KEYS);
  if (capturedIngress === null) throw failure(CODE.invalidConfiguration);
  ingressStart = capturedIngress.start;
  ingressClose = capturedIngress.close;
  ingressSnapshotMetrics = capturedIngress.snapshotMetrics;
  ingress = null;
  nativeFactory = null;
  router = null;

  let fixed = configuration;
  configuration = null;
  options = null;

  function setTerminal(code) {
    if (phase === PHASE.CLOSED) return;
    const priority = CODE_PRIORITY[code] ?? 0;
    if (priority < terminalPriority) return;
    if (priority === terminalPriority && terminalCode !== null) return;
    terminalCode = code;
    terminalPriority = priority;
    phase = CODE_PHASE[code] ?? PHASE.TRANSPORT_UNCERTAIN;
  }

  function rejectStart(code) {
    if (startSettled || startCapability === null) return;
    startSettled = true;
    startCapability.reject(failure(code));
    startCapability = null;
  }

  function rejectActivation(code) {
    if (activationSettled || activationCapability === null) return;
    activationSettled = true;
    activationCapability.reject(failure(code));
    activationCapability = null;
  }

  function resolveActivation() {
    if (activationSettled || activationCapability === null) return;
    activationSettled = true;
    activationCapability.resolve(ACTIVE_RESULT);
    activationCapability = null;
  }

  function refreshIngressMetrics() {
    if (ingressSnapshotMetrics === null) return;
    let observed;
    try {
      observed = REFLECT_APPLY(ingressSnapshotMetrics, undefined, []);
    } catch {
      return;
    }
    const mappings = [
      ['connectionStarts', 'connectionStarts'],
      ['requestsAdmitted', 'requestsAdmitted'],
      ['requestsRejected', 'requestsRejected'],
      ['handlerFailures', 'handlerFailures'],
      ['trackedSockets', 'trackedSockets'],
      ['trackedRequests', 'trackedRequests'],
      ['trackedHandlers', 'trackedHandlers'],
      ['ownedTimers', 'ownedTimers'],
      ['closeClean', 'closeClean'],
      ['closeUncertain', 'closeUncertain'],
    ];
    for (let index = 0; index < mappings.length; index += 1) {
      const [sourceName, targetName] = mappings[index];
      let descriptor;
      try {
        descriptor = REFLECT_APPLY(
          REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
          NATIVE_REFLECT,
          [observed, sourceName],
        );
      } catch {
        return;
      }
      if (
        descriptor === undefined
        || !OBJECT_HAS_OWN(descriptor, 'value')
        || !NUMBER_IS_SAFE_INTEGER(descriptor.value)
        || descriptor.value < 0
      ) return;
      ingressMetrics[targetName] = descriptor.value;
    }
  }

  function settleClose() {
    if (closeSettled || closeCapability === null) return;
    closeSettled = true;
    const capability = closeCapability;
    closeCapability = null;
    refreshIngressMetrics();
    if (terminalCode !== null) {
      capability.reject(failure(terminalCode));
      return;
    }
    phase = PHASE.CLOSED;
    createFundingResource = null;
    durableOwner = null;
    durableStart = null;
    durableHandle = null;
    durableDescriptorForSelection = null;
    durableClose = null;
    durableStartPromise = null;
    handoffController = null;
    handoffHandle = null;
    handoffClose = null;
    ingressStart = null;
    ingressClose = null;
    ingressSnapshotMetrics = null;
    fixed = null;
    capability.resolve(CLOSED_RESULT);
  }

  function onDurableCloseFailure(error) {
    setTerminal(mappedDurableFailure(error, true));
    settleClose();
  }

  function closeDurableAfterTransport() {
    if (!transportClosed || closeSettled) return;
    if (!durableCustody || durableClose === null) {
      settleClose();
      return;
    }
    if (durableCloseStarted) return;
    durableCloseStarted = true;
    let returned;
    try {
      returned = REFLECT_APPLY(durableClose, undefined, []);
    } catch (error) {
      onDurableCloseFailure(error);
      return;
    }
    const observation = observeNativePromise(
      returned,
      () => settleClose(),
      onDurableCloseFailure,
    );
    if (observation !== PROMISE_OBSERVATION.OBSERVED) {
      setTerminal(CODE.activatedUnavailable);
      settleClose();
    }
  }

  function onTransportCloseFailure() {
    setTerminal(CODE.closeUncertain);
    settleClose();
  }

  function beginShutdown(code = null) {
    if (code !== null) setTerminal(code);
    if (shutdownStarted) return closePromise;
    shutdownStarted = true;
    if (terminalCode === null) phase = PHASE.CLOSING;
    closeCapability = nativePromiseCapability();
    closePromise = closeCapability.promise;

    let returned;
    try {
      returned = REFLECT_APPLY(ingressClose, undefined, []);
    } catch {
      onTransportCloseFailure();
      return closePromise;
    }
    const observation = observeNativePromise(
      returned,
      () => {
        transportClosed = true;
        closeDurableAfterTransport();
      },
      onTransportCloseFailure,
    );
    if (observation !== PROMISE_OBSERVATION.OBSERVED) onTransportCloseFailure();
    return closePromise;
  }

  function failStart(code) {
    if (shutdownStarted) {
      rejectStart(terminalCode ?? CODE.closed);
      return;
    }
    setTerminal(code);
    rejectStart(code);
    beginShutdown(code);
  }

  const start = OBJECT_FREEZE(function startServiceCreditZenonHttpsOperatorPilot(
    ...args
  ) {
    if (args.length !== 0) return nativeRejected(failure(CODE.invalidInput));
    if (startPromise !== null) return startPromise;
    if (shutdownStarted || terminalCode !== null) {
      return nativeRejected(failure(terminalCode ?? CODE.closed));
    }
    startAttempts = increment(startAttempts);
    startCapability = nativePromiseCapability();
    startPromise = startCapability.promise;
    phase = PHASE.STARTING;
    let returned;
    try {
      returned = REFLECT_APPLY(ingressStart, undefined, []);
    } catch {
      failStart(CODE.startUnavailable);
      return startPromise;
    }
    const observation = observeNativePromise(
      returned,
      () => {
        if (startSettled) return;
        if (shutdownStarted || phase !== PHASE.STARTING) {
          rejectStart(terminalCode ?? CODE.closed);
          return;
        }
        startSettled = true;
        phase = PHASE.CHALLENGE;
        const capability = startCapability;
        startCapability = null;
        capability.resolve(START_RESULT);
      },
      () => failStart(CODE.startUnavailable),
    );
    if (observation !== PROMISE_OBSERVATION.OBSERVED) {
      failStart(CODE.startUnavailable);
    }
    return startPromise;
  });

  function captureDurableOwner(value) {
    return captureFrozenCallableRecord(value, DURABLE_OWNER_KEYS);
  }

  function captureHandoffOwner(value) {
    return captureFrozenCallableRecord(value, HANDOFF_OWNER_KEYS);
  }

  function publishActive(owner) {
    let nextController = null;
    const descriptorOwner = durableDescriptorForSelection;
    try {
      if (descriptorOwner === null) throw failure(CODE.activatedUnavailable);
      REFLECT_APPLY(descriptorOwner, undefined, [fixed.funding.selection]);
    } catch {
      setTerminal(CODE.activatedUnavailable);
      rejectActivation(CODE.activatedUnavailable);
      beginShutdown(CODE.activatedUnavailable);
      return;
    }
    const getActiveGrantDescriptorForSelection = OBJECT_FREEZE(
      function getOperatorPilotGrantDescriptor(requestedSelection) {
        if (
          phase !== PHASE.ACTIVE
          || durableOwner !== owner
          || descriptorOwner === null
        ) throw failure(CODE.activatedUnavailable);
        descriptorReads = increment(descriptorReads);
        return REFLECT_APPLY(descriptorOwner, undefined, [requestedSelection]);
      },
    );
    const admitRequest = OBJECT_FREEZE(function admitOperatorPilotHandoffRequest() {
      handoffAdmissions = increment(handoffAdmissions);
      return phase === PHASE.ACTIVE
        && durableOwner === owner
        && handoffController === nextController;
    });
    try {
      nextController = REFLECT_APPLY(
        CREATE_EXTERNAL_HOLDER_HANDOFF_INGRESS,
        undefined,
        [{
          origin: fixed.transport.origin,
          selection: fixed.funding.selection,
          challengeLifetimeMs: fixed.handoff.challengeLifetimeMs,
          now: fixed.handoff.now,
          getActiveGrantDescriptorForSelection,
          challengeRequestTarget: fixed.routes.handoffChallenge,
          redemptionRequestTarget: fixed.routes.handoffRedemption,
          admitRequest,
          deadlineRuntime: fixed.handoff.deadlineRuntime,
          bodyDeadlineMs: fixed.handoff.bodyDeadlineMs,
          responseDeadlineMs: fixed.handoff.responseDeadlineMs,
          closeGraceMs: fixed.handoff.closeGraceMs,
          metricsCounterLimit: fixed.handoff.metricsCounterLimit,
        }],
      );
    } catch {
      nextController = null;
    }
    const captured = nextController === null ? null : captureHandoffOwner(nextController);
    if (
      captured === null
      || shutdownStarted
      || phase !== PHASE.ACTIVATING
      || durableOwner !== owner
    ) {
      if (captured !== null) {
        try {
          const returned = REFLECT_APPLY(captured.close, undefined, []);
          observeNativePromise(returned, () => {}, () => {});
        } catch {}
      }
      setTerminal(CODE.activatedUnavailable);
      rejectActivation(CODE.activatedUnavailable);
      beginShutdown(CODE.activatedUnavailable);
      return;
    }
    handoffController = nextController;
    handoffHandle = captured.handle;
    handoffClose = captured.close;
    phase = PHASE.ACTIVE;
    resolveActivation();
  }

  function onDurableStartFailure(error) {
    activationCallActive = false;
    const code = mappedDurableFailure(error, durableCustody);
    setTerminal(code);
    rejectActivation(code);
    beginShutdown(code);
  }

  function onDurableStartSuccess() {
    activationCallActive = false;
    if (activationReentered || shutdownStarted || phase !== PHASE.ACTIVATING) {
      setTerminal(CODE.activatedUnavailable);
      rejectActivation(CODE.activatedUnavailable);
      beginShutdown(CODE.activatedUnavailable);
      return;
    }
    publishActive(durableOwner);
  }

  function repeatActivation(input) {
    if (activationCallActive || durableStart === null || durableStartPromise === null) {
      activationReentered = true;
      setTerminal(CODE.activatedUnavailable);
      beginShutdown(CODE.activatedUnavailable);
      return nativeRejected(failure(CODE.activatedUnavailable));
    }
    let returned;
    try {
      returned = REFLECT_APPLY(durableStart, undefined, [input]);
    } catch (error) {
      const code = ownErrorCode(error)
        === 'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_CONFLICT'
        ? CODE.activationConflict
        : mappedDurableFailure(error, true);
      return nativeRejected(failure(code));
    }
    if (returned === durableStartPromise) return activationPromise;
    setTerminal(CODE.activatedUnavailable);
    beginShutdown(CODE.activatedUnavailable);
    return nativeRejected(failure(CODE.activatedUnavailable));
  }

  const activateCommittedReady = OBJECT_FREEZE(
    function activateServiceCreditZenonHttpsOperatorPilot(input, ...extra) {
      if (extra.length !== 0 || exactDataObject(input, ACTIVATION_KEYS) === null) {
        return nativeRejected(failure(CODE.invalidInput));
      }
      if (phase === PHASE.CLOSED) return nativeRejected(failure(CODE.closed));
      if (shutdownStarted || terminalCode !== null) {
        return nativeRejected(failure(terminalCode ?? CODE.closed));
      }
      if (activationPromise !== null) return repeatActivation(input);
      if (phase !== PHASE.CHALLENGE) return nativeRejected(failure(CODE.closed));

      activationAttempts = increment(activationAttempts);
      activationCapability = nativePromiseCapability();
      activationPromise = activationCapability.promise;
      activationCallActive = true;
      phase = PHASE.ACTIVATING;

      let candidate;
      try {
        candidate = REFLECT_APPLY(CREATE_DURABLE_HTTP_COMPOSITION, undefined, [{
          serviceCreditStore: fixed.funding.serviceCreditStore,
          fundingObserverStore: fixed.funding.fundingObserverStore,
          authorityRecord: fixed.funding.authorityRecord,
          deriveFundingTerms: fixed.funding.deriveFundingTerms,
          now: fixed.funding.now,
          durableExecution: fixed.durable.execution,
          execute: fixed.durable.execute,
          deadlineRuntime: fixed.durable.deadlineRuntime,
        }]);
      } catch (error) {
        activationCallActive = false;
        const code = mappedDurableFailure(error, false);
        setTerminal(code);
        rejectActivation(code);
        beginShutdown(code);
        return activationPromise;
      }
      const captured = captureDurableOwner(candidate);
      if (captured === null) {
        activationCallActive = false;
        setTerminal(CODE.preActivationUnavailable);
        rejectActivation(CODE.preActivationUnavailable);
        beginShutdown(CODE.preActivationUnavailable);
        return activationPromise;
      }
      durableOwner = candidate;
      durableStart = captured.start;
      durableHandle = captured.handle;
      durableDescriptorForSelection = captured.getActiveGrantDescriptorForSelection;
      durableClose = captured.close;
      durableCustody = true;
      candidate = null;

      let returned;
      try {
        returned = REFLECT_APPLY(durableStart, undefined, [input]);
      } catch (error) {
        onDurableStartFailure(error);
        return activationPromise;
      }
      durableStartPromise = returned;
      activationCallActive = false;
      const observation = observeNativePromise(
        returned,
        onDurableStartSuccess,
        onDurableStartFailure,
      );
      if (observation !== PROMISE_OBSERVATION.OBSERVED) {
        setTerminal(CODE.activatedUnavailable);
        rejectActivation(CODE.activatedUnavailable);
        beginShutdown(CODE.activatedUnavailable);
      }
      return activationPromise;
    },
  );

  const close = OBJECT_FREEZE(function closeServiceCreditZenonHttpsOperatorPilot(
    ...args
  ) {
    if (args.length !== 0) return nativeRejected(failure(CODE.invalidInput));
    if (closePromise !== null) return closePromise;
    closeAttempts = increment(closeAttempts);
    if (activationCallActive || phase === PHASE.ACTIVATING) {
      setTerminal(CODE.activatedUnavailable);
      rejectActivation(CODE.activatedUnavailable);
    }
    return beginShutdown();
  });

  const snapshot = OBJECT_FREEZE(function snapshotServiceCreditZenonHttpsOperatorPilot(
    ...args
  ) {
    if (args.length !== 0) throw failure(CODE.invalidInput);
    refreshIngressMetrics();
    return OBJECT_FREEZE({
      phase,
      startAttempts,
      activationAttempts,
      closeAttempts,
      handoffAdmissions,
      descriptorReads,
      connectionStarts: ingressMetrics.connectionStarts,
      requestsAdmitted: ingressMetrics.requestsAdmitted,
      requestsRejected: ingressMetrics.requestsRejected,
      handlerFailures: ingressMetrics.handlerFailures,
      trackedSockets: ingressMetrics.trackedSockets,
      trackedRequests: ingressMetrics.trackedRequests,
      trackedHandlers: ingressMetrics.trackedHandlers,
      ownedTimers: ingressMetrics.ownedTimers,
      transportCloseClean: ingressMetrics.closeClean,
      transportCloseUncertain: ingressMetrics.closeUncertain,
    });
  });

  return OBJECT_FREEZE({ start, activateCommittedReady, close, snapshot });
}
