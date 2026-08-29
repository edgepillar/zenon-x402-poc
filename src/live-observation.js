import { performance } from 'node:perf_hooks';
import { types as utilTypes } from 'node:util';

const ARRAY_IS_ARRAY = Array.isArray;
const ARRAY_PROTOTYPE = Array.prototype;
const DATE = Date;
const DATE_PARSE = Date.parse;
const DEFINE_PROPERTY = Object.defineProperty;
const FREEZE = Object.freeze;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_OWN_PROPERTY_DESCRIPTORS = Object.getOwnPropertyDescriptors;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const NUMBER_IS_FINITE = Number.isFinite;
const NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;
const OBJECT_IS = Object.is;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_APPLY = Reflect.apply;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const STATE = new WeakMap();
const EVENT_STATE = new WeakMap();
const MAX_OBSERVATIONS = 64;
let FINALIZE_IN_PROGRESS = false;
let RECORDING_STATE;

const PHASES = FREEZE({
  runner: FREEZE([
    'challenge_request_started',
    'challenge_402_received',
    'paid_response_received',
  ]),
  buyer: FREEZE([
    'buyer_owner_wait_started',
    'buyer_owner_acquired',
    'buyer_readiness_started',
    'buyer_readiness_finished',
    'prepare_block_started',
    'prepare_block_finished',
    'buyer_owner_released',
  ]),
  facilitator: FREEZE([
    'facilitator_owner_wait_started',
    'facilitator_owner_acquired',
    'facilitator_readiness_started',
    'facilitator_readiness_finished',
    'publication_started',
    'publication_acknowledged',
    'inclusion_wait_started',
    'momentum_inclusion_observed',
    'facilitator_owner_released',
    'delivery_started',
    'delivery_finished',
  ]),
});

const CLOCK_DOMAINS = FREEZE({
  runner: 'runner-monotonic-v1',
  buyer: 'buyer-monotonic-v1',
  facilitator: 'facilitator-monotonic-v1',
});

const ROLES = FREEZE(['runner', 'buyer', 'facilitator']);

const CROSS_ROLE_ORDERS = FREEZE([
  FREEZE(['runner:challenge_402_received', 'buyer:buyer_owner_wait_started']),
  FREEZE(['buyer:buyer_owner_released', 'facilitator:facilitator_owner_wait_started']),
  FREEZE(['facilitator:facilitator_owner_released', 'facilitator:delivery_started']),
  FREEZE(['facilitator:delivery_finished', 'runner:paid_response_received']),
]);

function observationError() {
  const error = new Error('live_observation_invalid');
  error.name = 'LiveObservationError';
  error.code = 'live_observation_invalid';
  error.stack = 'LiveObservationError: live_observation_invalid';
  return error;
}

function fail() {
  throw observationError();
}

function ownData(target, key, value) {
  DEFINE_PROPERTY(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

function append(array, value) {
  ownData(array, String(array.length), value);
}

function phaseIndex(role, phase) {
  if (typeof role !== 'string' || typeof phase !== 'string' || !HAS_OWN(PHASES, role)) return -1;
  for (let index = 0; index < PHASES[role].length; index += 1) {
    if (PHASES[role][index] === phase) return index;
  }
  return -1;
}

function canonicalUtc(value) {
  if (typeof value !== 'string' || value.length !== 24 ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const numeric = DATE_PARSE(value);
  return NUMBER_IS_FINITE(numeric) && new DATE(numeric).toISOString() === value;
}

function defaultUtcNow() {
  return new DATE().toISOString();
}

function defaultMonotonicNow() {
  return Math.floor(performance.now());
}

function exactOptions(options) {
  if (options === undefined) return { utcNow: defaultUtcNow, monotonicNow: defaultMonotonicNow };
  if (!options || typeof options !== 'object' || IS_PROXY(options) || ARRAY_IS_ARRAY(options) ||
      GET_PROTOTYPE_OF(options) !== OBJECT_PROTOTYPE) fail();
  let descriptors;
  let keys;
  try {
    descriptors = GET_OWN_PROPERTY_DESCRIPTORS(options);
    keys = REFLECT_OWN_KEYS(options);
  } catch {
    fail();
  }
  if (keys.length !== 2 || !HAS_OWN(descriptors, 'utcNow') ||
      !HAS_OWN(descriptors, 'monotonicNow')) fail();
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = descriptors[key];
    if ((key !== 'utcNow' && key !== 'monotonicNow') || typeof key !== 'string' ||
        !descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true ||
        typeof descriptor.value !== 'function') fail();
  }
  return {
    utcNow: descriptors.utcNow.value,
    monotonicNow: descriptors.monotonicNow.value,
  };
}

export function createLiveEvidenceObserver(options) {
  const clocks = exactOptions(options);
  const observer = FREEZE({});
  STATE.set(observer, {
    utcNow: clocks.utcNow,
    monotonicNow: clocks.monotonicNow,
    nextSequence: 0,
    eligible: true,
    inProgress: false,
  });
  return observer;
}

export function assertLiveEvidenceObserver(observer) {
  if ((typeof observer !== 'object' && typeof observer !== 'function') ||
      observer === null || IS_PROXY(observer) || !STATE.has(observer)) fail();
  return observer;
}

export function recordLiveEvidencePhase(observer, role, phase) {
  // Validate primitive selectors before consulting the observer or clocks.
  if (typeof role !== 'string' || typeof phase !== 'string') fail();
  assertLiveEvidenceObserver(observer);
  const state = STATE.get(observer);
  if (!state.eligible) fail();
  if (RECORDING_STATE !== undefined) {
    RECORDING_STATE.eligible = false;
    state.eligible = false;
    fail();
  }
  if (state.inProgress) {
    state.eligible = false;
    fail();
  }
  if (phaseIndex(role, phase) < 0) {
    state.eligible = false;
    fail();
  }
  if (state.nextSequence >= MAX_OBSERVATIONS) {
    state.eligible = false;
    return null;
  }
  let utc;
  let monotonicMs;
  state.inProgress = true;
  RECORDING_STATE = state;
  try {
    utc = REFLECT_APPLY(state.utcNow, undefined, []);
    if (!state.eligible) return null;
    monotonicMs = REFLECT_APPLY(state.monotonicNow, undefined, []);
    if (!state.eligible) return null;
  } catch {
    state.eligible = false;
    return null;
  } finally {
    RECORDING_STATE = undefined;
    state.inProgress = false;
  }
  // Type checks happen without coercion; returned thenables are rejected but
  // never awaited, so observation cannot delay settlement.
  if (!canonicalUtc(utc) || !NUMBER_IS_SAFE_INTEGER(monotonicMs) || monotonicMs < 0 ||
      OBJECT_IS(monotonicMs, -0)) {
    state.eligible = false;
    return null;
  }
  const event = FREEZE({
    sequence: state.nextSequence,
    phase,
    role,
    clockDomain: CLOCK_DOMAINS[role],
    utc,
    monotonicMs,
  });
  EVENT_STATE.set(event, state);
  state.nextSequence += 1;
  return event;
}

function captureObservations(observations) {
  if (IS_PROXY(observations) || !ARRAY_IS_ARRAY(observations) ||
      GET_PROTOTYPE_OF(observations) !== ARRAY_PROTOTYPE) fail();
  let lengthDescriptor;
  let keys;
  try {
    lengthDescriptor = GET_OWN_PROPERTY_DESCRIPTOR(observations, 'length');
    keys = REFLECT_OWN_KEYS(observations);
  } catch {
    fail();
  }
  if (!lengthDescriptor || !HAS_OWN(lengthDescriptor, 'value') ||
      !NUMBER_IS_SAFE_INTEGER(lengthDescriptor.value) || lengthDescriptor.value > MAX_OBSERVATIONS ||
      keys.length !== lengthDescriptor.value + 1) fail();
  const output = [];
  const states = [];
  for (let index = 0; index < lengthDescriptor.value; index += 1) {
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(observations, String(index));
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) fail();
    const event = descriptor.value;
    if (!event || typeof event !== 'object' || IS_PROXY(event) || ARRAY_IS_ARRAY(event) ||
        GET_PROTOTYPE_OF(event) !== OBJECT_PROTOTYPE) fail();
    const sourceState = EVENT_STATE.get(event);
    if (sourceState !== undefined) {
      if (sourceState.inProgress) {
        sourceState.eligible = false;
        fail();
      }
      if (!sourceState.eligible) fail();
      let known = false;
      for (let stateIndex = 0; stateIndex < states.length; stateIndex += 1) {
        if (states[stateIndex] === sourceState) known = true;
      }
      if (!known) append(states, sourceState);
    }
    let descriptors;
    let eventKeys;
    try {
      descriptors = GET_OWN_PROPERTY_DESCRIPTORS(event);
      eventKeys = REFLECT_OWN_KEYS(event);
    } catch {
      fail();
    }
    const expected = ['sequence', 'phase', 'role', 'clockDomain', 'utc', 'monotonicMs'];
    if (eventKeys.length !== expected.length) fail();
    const copy = {};
    for (let fieldIndex = 0; fieldIndex < expected.length; fieldIndex += 1) {
      const key = expected[fieldIndex];
      const field = descriptors[key];
      if (!field || !HAS_OWN(field, 'value') || field.enumerable !== true) fail();
      ownData(copy, key, field.value);
    }
    append(output, copy);
  }
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (typeof key !== 'string' || (key !== 'length' && !/^(?:0|[1-9]\d*)$/.test(key))) fail();
  }
  return { output, states };
}

export function finalizeLiveEvidenceTimeline(observations) {
  if (RECORDING_STATE !== undefined) {
    RECORDING_STATE.eligible = false;
    fail();
  }
  if (FINALIZE_IN_PROGRESS) fail();
  FINALIZE_IN_PROGRESS = true;
  let states = [];
  let succeeded = false;
  try {
    const capture = captureObservations(observations);
    const captured = capture.output;
    states = capture.states;
    for (let index = 0; index < states.length; index += 1) {
      if (!states[index].eligible || states[index].inProgress) fail();
      states[index].inProgress = true;
    }
    let expectedCount = 0;
    for (let index = 0; index < ROLES.length; index += 1) expectedCount += PHASES[ROLES[index]].length;
    if (captured.length !== expectedCount) fail();
    const byPair = {};
    const rolePosition = { runner: -1, buyer: -1, facilitator: -1 };
    const roleMonotonic = { runner: -1, buyer: -1, facilitator: -1 };
    let priorUtc = -1;
    const finalized = [];
    for (let index = 0; index < captured.length; index += 1) {
      const event = captured[index];
      if (!NUMBER_IS_SAFE_INTEGER(event.sequence) || OBJECT_IS(event.sequence, -0) ||
          event.sequence !== index ||
          event.sequence < 0 || event.sequence >= expectedCount ||
          typeof event.role !== 'string' || typeof event.phase !== 'string' ||
          phaseIndex(event.role, event.phase) < 0 ||
          event.clockDomain !== CLOCK_DOMAINS[event.role] || !canonicalUtc(event.utc) ||
          !NUMBER_IS_SAFE_INTEGER(event.monotonicMs) || event.monotonicMs < 0 ||
          OBJECT_IS(event.monotonicMs, -0)) fail();
      const pair = `${event.role}:${event.phase}`;
      if (HAS_OWN(byPair, pair)) fail();
      const currentPhaseIndex = phaseIndex(event.role, event.phase);
      const utc = DATE_PARSE(event.utc);
      if (currentPhaseIndex <= rolePosition[event.role] ||
          event.monotonicMs < roleMonotonic[event.role] || utc < priorUtc) fail();
      rolePosition[event.role] = currentPhaseIndex;
      roleMonotonic[event.role] = event.monotonicMs;
      priorUtc = utc;
      const finalEvent = FREEZE({
        sequence: event.sequence,
        phase: event.phase,
        role: event.role,
        clockDomain: event.clockDomain,
        utc: event.utc,
        monotonicMs: event.monotonicMs,
      });
      ownData(byPair, pair, finalEvent);
      append(finalized, finalEvent);
    }
    for (let roleIndex = 0; roleIndex < ROLES.length; roleIndex += 1) {
      const role = ROLES[roleIndex];
      for (let requiredIndex = 0; requiredIndex < PHASES[role].length; requiredIndex += 1) {
        if (!HAS_OWN(byPair, `${role}:${PHASES[role][requiredIndex]}`)) fail();
      }
    }
    for (let index = 0; index < CROSS_ROLE_ORDERS.length; index += 1) {
      const before = byPair[CROSS_ROLE_ORDERS[index][0]];
      const after = byPair[CROSS_ROLE_ORDERS[index][1]];
      if (!before || !after || before.sequence >= after.sequence) fail();
    }
    succeeded = true;
    return FREEZE(finalized);
  } finally {
    for (let index = 0; index < states.length; index += 1) {
      states[index].inProgress = false;
      if (!succeeded) states[index].eligible = false;
    }
    FINALIZE_IN_PROGRESS = false;
  }
}
