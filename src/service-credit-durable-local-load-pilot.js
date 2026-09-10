import { types as utilTypes } from 'node:util';

import {
  runDurableServiceCreditLoopbackDemo,
} from './service-credit-durable-loopback-demo.js';

const ARRAY_IS_ARRAY = Array.isArray;
const FUNCTION_PROTOTYPE = Function.prototype;
const GLOBAL_THIS = globalThis;
const NATIVE_ERROR = Error;
const NATIVE_PROMISE = Promise;
const OBJECT_DEFINE_PROPERTY = Object.defineProperty;
const OBJECT_FREEZE = Object.freeze;
const OBJECT_HAS_OWN = Object.hasOwn;
const OBJECT_IS = Object.is;
const OBJECT_IS_FROZEN = Object.isFrozen;
const OBJECT_PROTOTYPE = Object.prototype;
const PROMISE_PROTOTYPE = NATIVE_PROMISE.prototype;
const REFLECT_APPLY = Reflect.apply;
const REFLECT_GET_OWN_PROPERTY_DESCRIPTOR = Reflect.getOwnPropertyDescriptor;
const REFLECT_GET_PROTOTYPE_OF = Reflect.getPrototypeOf;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const IS_PROMISE = utilTypes.isPromise;
const IS_PROXY = utilTypes.isProxy;
const RUN_DURABLE_DEMO = runDurableServiceCreditLoopbackDemo;
const SYMBOL_SPECIES = Symbol.species;

function captureOwnDescriptor(target, key) {
  const descriptor = REFLECT_APPLY(
    REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
    Reflect,
    [target, key],
  );
  if (descriptor === undefined) throw new NATIVE_ERROR('missing intrinsic descriptor');
  return OBJECT_FREEZE(descriptor);
}

const GLOBAL_PROMISE_DESCRIPTOR = captureOwnDescriptor(GLOBAL_THIS, 'Promise');
const PROMISE_PROTOTYPE_DESCRIPTOR = captureOwnDescriptor(NATIVE_PROMISE, 'prototype');
const PROMISE_CONSTRUCTOR_DESCRIPTOR = captureOwnDescriptor(
  PROMISE_PROTOTYPE,
  'constructor',
);
const PROMISE_THEN_DESCRIPTOR = captureOwnDescriptor(PROMISE_PROTOTYPE, 'then');
const PROMISE_SPECIES_DESCRIPTOR = captureOwnDescriptor(NATIVE_PROMISE, SYMBOL_SPECIES);
const PROMISE_CONSTRUCTOR_PARENT = REFLECT_APPLY(
  REFLECT_GET_PROTOTYPE_OF,
  Reflect,
  [NATIVE_PROMISE],
);
const PROMISE_PROTOTYPE_PARENT = REFLECT_APPLY(
  REFLECT_GET_PROTOTYPE_OF,
  Reflect,
  [PROMISE_PROTOTYPE],
);
const PINNED_PROMISE_CONSTRUCTOR_DESCRIPTOR = OBJECT_FREEZE({
  configurable: false,
  enumerable: false,
  writable: false,
  value: NATIVE_PROMISE,
});

const FAILURE_CODE = 'SERVICE_CREDIT_DURABLE_LOCAL_LOAD_PILOT_FAILED';
const LANE_COUNT = 2;

const CHILD_KEYS = OBJECT_FREEZE([
  'demoVersion',
  'mode',
  'mockFundingSettlements',
  'mockActivations',
  'distinctSuccessfulExecutions',
  'applicationCallbacks',
  'unitsConsumed',
  'unitsHeld',
  'unitsAvailable',
  'exactReplayStable',
  'cleanReopenStable',
  'cleanupVerified',
]);

const CHILD_SUMMARY = OBJECT_FREEZE({
  demoVersion: 1,
  mode: 'SYNTHETIC_DURABLE_LOOPBACK_ONLY',
  mockFundingSettlements: 1,
  mockActivations: 1,
  distinctSuccessfulExecutions: 3,
  applicationCallbacks: 3,
  unitsConsumed: 6,
  unitsHeld: 0,
  unitsAvailable: 1,
  exactReplayStable: true,
  cleanReopenStable: true,
  cleanupVerified: true,
});

const RESULT_KEYS = OBJECT_FREEZE([
  'pilotVersion',
  'mode',
  'independentScenarios',
  'concurrentLanes',
  'mockFundingSettlements',
  'mockActivations',
  'distinctSuccessfulExecutions',
  'applicationCallbacks',
  'unitsConsumed',
  'unitsHeld',
  'unitsAvailable',
  'exactReplayStable',
  'cleanReopenStable',
  'cleanupVerified',
  'timingClaim',
  'benchmark',
]);

const RESULT = OBJECT_FREEZE({
  pilotVersion: 1,
  mode: 'SYNTHETIC_DURABLE_LOCAL_LOAD_ONLY',
  independentScenarios: 2,
  concurrentLanes: 2,
  mockFundingSettlements: 2,
  mockActivations: 2,
  distinctSuccessfulExecutions: 6,
  applicationCallbacks: 6,
  unitsConsumed: 12,
  unitsHeld: 0,
  unitsAvailable: 2,
  exactReplayStable: true,
  cleanReopenStable: true,
  cleanupVerified: true,
  timingClaim: 'NONE',
  benchmark: false,
});

let invocationInFlight = false;

class DurableServiceCreditLocalLoadPilotError extends NATIVE_ERROR {
  constructor() {
    super(FAILURE_CODE);
    REFLECT_APPLY(OBJECT_DEFINE_PROPERTY, undefined, [this, 'name', {
      configurable: true,
      enumerable: false,
      writable: false,
      value: 'DurableServiceCreditLocalLoadPilotError',
    }]);
    REFLECT_APPLY(OBJECT_DEFINE_PROPERTY, undefined, [this, 'code', {
      configurable: false,
      enumerable: true,
      writable: false,
      value: FAILURE_CODE,
    }]);
    REFLECT_APPLY(OBJECT_DEFINE_PROPERTY, undefined, [this, 'stack', {
      configurable: true,
      enumerable: false,
      writable: false,
      value: `DurableServiceCreditLocalLoadPilotError: ${FAILURE_CODE}`,
    }]);
  }
}

function failPilot() {
  throw new DurableServiceCreditLocalLoadPilotError();
}

function expect(condition) {
  if (!condition) failPilot();
}

function exactOwnDescriptor(target, key, expected) {
  try {
    const actual = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      Reflect,
      [target, key],
    );
    if (actual === undefined) return false;
    const actualKeys = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [actual]);
    const expectedKeys = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [expected]);
    if (actualKeys.length !== expectedKeys.length) return false;
    for (let index = 0; index < expectedKeys.length; index += 1) {
      const descriptorKey = expectedKeys[index];
      if (
        !REFLECT_APPLY(OBJECT_HAS_OWN, Object, [actual, descriptorKey])
        || !REFLECT_APPLY(
          OBJECT_IS,
          Object,
          [actual[descriptorKey], expected[descriptorKey]],
        )
      ) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function promiseSchedulingIntact() {
  try {
    return (
      PROMISE_CONSTRUCTOR_PARENT === FUNCTION_PROTOTYPE
      && PROMISE_PROTOTYPE_PARENT === OBJECT_PROTOTYPE
      && REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, Reflect, [NATIVE_PROMISE])
        === PROMISE_CONSTRUCTOR_PARENT
      && REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, Reflect, [PROMISE_PROTOTYPE])
        === PROMISE_PROTOTYPE_PARENT
      && exactOwnDescriptor(GLOBAL_THIS, 'Promise', GLOBAL_PROMISE_DESCRIPTOR)
      && exactOwnDescriptor(NATIVE_PROMISE, 'prototype', PROMISE_PROTOTYPE_DESCRIPTOR)
      && exactOwnDescriptor(
        PROMISE_PROTOTYPE,
        'constructor',
        PROMISE_CONSTRUCTOR_DESCRIPTOR,
      )
      && exactOwnDescriptor(PROMISE_PROTOTYPE, 'then', PROMISE_THEN_DESCRIPTOR)
      && exactOwnDescriptor(NATIVE_PROMISE, SYMBOL_SPECIES, PROMISE_SPECIES_DESCRIPTOR)
    );
  } catch {
    return false;
  }
}

function lanePromiseDisposition(value) {
  try {
    if (REFLECT_APPLY(IS_PROXY, undefined, [value])) return 'UNOBSERVABLE';
    if (!REFLECT_APPLY(IS_PROMISE, undefined, [value])) return 'INVALID';
    if (
      REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, Reflect, [value])
        !== PROMISE_PROTOTYPE
      || REFLECT_APPLY(OBJECT_HAS_OWN, Object, [value, 'constructor'])
      || REFLECT_APPLY(OBJECT_HAS_OWN, Object, [value, 'then'])
    ) return 'UNOBSERVABLE';
    REFLECT_APPLY(OBJECT_DEFINE_PROPERTY, undefined, [
      value,
      'constructor',
      PINNED_PROMISE_CONSTRUCTOR_DESCRIPTOR,
    ]);
    if (!exactOwnDescriptor(
      value,
      'constructor',
      PINNED_PROMISE_CONSTRUCTOR_DESCRIPTOR,
    )) return 'UNOBSERVABLE';
    return 'DRAINABLE';
  } catch {
    return 'UNOBSERVABLE';
  }
}

function exactFrozenSummary(value, keys, expected) {
  try {
    expect(
      value !== null
      && typeof value === 'object'
      && !REFLECT_APPLY(ARRAY_IS_ARRAY, undefined, [value])
      && !REFLECT_APPLY(IS_PROXY, undefined, [value])
      && REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, Reflect, [value]) === OBJECT_PROTOTYPE
      && REFLECT_APPLY(OBJECT_IS_FROZEN, Object, [value]),
    );
    const actualKeys = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [value]);
    expect(actualKeys.length === keys.length);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      expect(actualKeys[index] === key);
      const actual = REFLECT_APPLY(REFLECT_GET_OWN_PROPERTY_DESCRIPTOR, Reflect, [value, key]);
      const wanted = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        Reflect,
        [expected, key],
      );
      expect(
        actual !== undefined
        && wanted !== undefined
        && REFLECT_APPLY(OBJECT_IS, Object, [actual.enumerable, true])
        && REFLECT_APPLY(OBJECT_IS, Object, [actual.configurable, false])
        && REFLECT_APPLY(OBJECT_IS, Object, [actual.writable, false])
        && REFLECT_APPLY(OBJECT_HAS_OWN, Object, [actual, 'value'])
        && REFLECT_APPLY(OBJECT_HAS_OWN, Object, [wanted, 'value'])
        && REFLECT_APPLY(OBJECT_IS, Object, [actual.value, wanted.value]),
      );
    }
    return true;
  } catch {
    return false;
  }
}

function nativePromiseCapability() {
  let resolve;
  let reject;
  const promise = new NATIVE_PROMISE((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  REFLECT_APPLY(OBJECT_DEFINE_PROPERTY, undefined, [promise, 'constructor', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: NATIVE_PROMISE,
  }]);
  OBJECT_FREEZE(promise);
  return OBJECT_FREEZE({ promise, resolve, reject });
}

const FAIL_CLOSED_PENDING_PROMISE = nativePromiseCapability().promise;

async function observeAcceptedLane(promise, index, settle) {
  let fulfilled = false;
  let value;
  try {
    value = await promise;
    fulfilled = true;
  } catch {
    value = undefined;
  }
  try {
    settle(index, fulfilled, fulfilled ? value : undefined);
  } catch {
    // An internal observation failure deliberately leaves the pilot pending.
  }
}

function settleEveryStartedLane(promises, count) {
  const capability = nativePromiseCapability();
  const records = [null, null];
  let remaining = count;

  if (remaining === 0) {
    capability.resolve(OBJECT_FREEZE({ records }));
    return capability.promise;
  }

  function settled(index, fulfilled, value) {
    records[index] = OBJECT_FREEZE({ fulfilled, value });
    remaining -= 1;
    if (remaining === 0) {
      capability.resolve(OBJECT_FREEZE({ records }));
    }
  }

  for (let index = 0; index < count; index += 1) {
    observeAcceptedLane(promises[index], index, settled);
  }
  return capability.promise;
}

function safeResult() {
  if (!exactFrozenSummary(RESULT, RESULT_KEYS, RESULT)) failPilot();
  return RESULT;
}

/**
 * Runs exactly two independent synthetic durable loopback scenarios without
 * recording time or adding active-runtime, recovery, or reconciliation power.
 */
export async function runDurableServiceCreditLocalLoadPilot() {
  if (arguments.length !== 0 || invocationInFlight) failPilot();
  if (!promiseSchedulingIntact()) failPilot();
  invocationInFlight = true;

  const promises = [null, null];
  let startedCount = 0;
  let startFailed = false;
  let unobservableStartedWork = false;
  try {
    expect(
      typeof RUN_DURABLE_DEMO === 'function'
      && !REFLECT_APPLY(IS_PROXY, undefined, [RUN_DURABLE_DEMO]),
    );
    for (let lane = 0; lane < LANE_COUNT; lane += 1) {
      let promise;
      try {
        promise = REFLECT_APPLY(RUN_DURABLE_DEMO, undefined, []);
      } catch {
        startFailed = true;
        continue;
      }
      const disposition = lanePromiseDisposition(promise);
      if (disposition === 'UNOBSERVABLE') {
        startFailed = true;
        unobservableStartedWork = true;
        continue;
      }
      if (disposition !== 'DRAINABLE') {
        startFailed = true;
        continue;
      }
      promises[startedCount] = promise;
      startedCount += 1;
    }

    const settlement = settleEveryStartedLane(promises, startedCount);
    if (!promiseSchedulingIntact()) {
      if (startedCount !== 0 || unobservableStartedWork) {
        await FAIL_CLOSED_PENDING_PROMISE;
      }
      failPilot();
    }
    const settled = await settlement;
    if (unobservableStartedWork) await FAIL_CLOSED_PENDING_PROMISE;
    if (
      startFailed
      || startedCount !== LANE_COUNT
      || settled.records.length !== LANE_COUNT
    ) {
      failPilot();
    }
    for (let lane = 0; lane < LANE_COUNT; lane += 1) {
      const record = settled.records[lane];
      if (
        record === null
        || record.fulfilled !== true
        || !exactFrozenSummary(record.value, CHILD_KEYS, CHILD_SUMMARY)
      ) {
        failPilot();
      }
    }
    return safeResult();
  } finally {
    invocationInFlight = false;
  }
}
