import {
  env as processEnv,
  execArgv as processExecArgv,
  hrtime as processHrtime,
  versions as processVersions,
} from 'node:process';
import { types as utilTypes } from 'node:util';

import { runServiceCreditMockDemo } from './service-credit-demo.js';
import { runServiceCreditLoopbackDemo } from './service-credit-loopback-demo.js';

const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const HAS_OWN = Object.hasOwn;
const IS_FROZEN = Object.isFrozen;
const IS_PROXY = utilTypes.isProxy;
const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const OBJECT_FREEZE = Object.freeze;
const OBJECT_GET_PROTOTYPE_OF = Object.getPrototypeOf;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_APPLY = Reflect.apply;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const RUN_LISTENER_FREE = runServiceCreditMockDemo;
const RUN_LOOPBACK = runServiceCreditLoopbackDemo;
const PROCESS_ENV = processEnv;
const PROCESS_EXEC_ARGV = processExecArgv;
const PROCESS_HRTIME = processHrtime;
const PROCESS_VERSIONS = processVersions;

let invocationInFlight = false;

const WARMUP_ROUNDS = 5;
const MEASURED_ROUNDS = 30;
const TOTAL_ROUNDS = WARMUP_ROUNDS + MEASURED_ROUNDS;
const MEDIAN_LEFT_INDEX = 14;
const MEDIAN_RIGHT_INDEX = 15;
const P95_INDEX = 28;
const GUARDED_ENVIRONMENT_KEYS = OBJECT_FREEZE([
  'NODE_OPTIONS',
  'NODE_V8_COVERAGE',
  'NODE_DEBUG',
  'NODE_DEBUG_NATIVE',
]);
const LISTENER_FREE_KEYS = OBJECT_FREEZE([
  'demoVersion',
  'mode',
  'mockFundingSettlements',
  'serviceRequestAttempts',
  'uniqueServiceRequests',
  'exactReplays',
  'applicationExecutions',
  'additionalMockSettlements',
  'unitsConsumed',
  'unitsRemaining',
  'networkActivity',
  'timingClaim',
  'benchmark',
]);
const LOOPBACK_KEYS = OBJECT_FREEZE([
  'demoVersion',
  'mode',
  'mockFundingSettlements',
  'serviceRequestAttempts',
  'uniqueServiceRequests',
  'exactReplays',
  'applicationExecutions',
  'additionalMockSettlements',
  'unitsConsumed',
  'unitsRemaining',
  'transportScope',
  'timingClaim',
  'benchmark',
]);
const LISTENER_FREE_EXPECTED = OBJECT_FREEZE({
  demoVersion: 1,
  mode: 'OFFLINE_MOCK_ONLY',
  mockFundingSettlements: 1,
  serviceRequestAttempts: 4,
  uniqueServiceRequests: 3,
  exactReplays: 1,
  applicationExecutions: 3,
  additionalMockSettlements: 0,
  unitsConsumed: 6,
  unitsRemaining: 1,
  networkActivity: 'NONE',
  timingClaim: 'NONE',
  benchmark: false,
});
const LOOPBACK_EXPECTED = OBJECT_FREEZE({
  demoVersion: 1,
  mode: 'SYNTHETIC_LOOPBACK_ONLY',
  mockFundingSettlements: 1,
  serviceRequestAttempts: 4,
  uniqueServiceRequests: 3,
  exactReplays: 1,
  applicationExecutions: 3,
  additionalMockSettlements: 0,
  unitsConsumed: 6,
  unitsRemaining: 1,
  transportScope: 'IPV4_LOOPBACK_ONLY',
  timingClaim: 'NONE',
  benchmark: false,
});

class ServiceCreditLocalBenchmarkError extends Error {
  constructor() {
    super('SERVICE_CREDIT_LOCAL_BENCHMARK_FAILED');
    this.name = 'ServiceCreditLocalBenchmarkError';
    this.code = 'SERVICE_CREDIT_LOCAL_BENCHMARK_FAILED';
    this.stack = 'ServiceCreditLocalBenchmarkError: SERVICE_CREDIT_LOCAL_BENCHMARK_FAILED';
  }
}

function failBenchmark() {
  throw new ServiceCreditLocalBenchmarkError();
}

function expect(condition) {
  if (!condition) failBenchmark();
}

function readDataProperty(value, key) {
  const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
  expect(descriptor !== undefined && HAS_OWN(descriptor, 'value'));
  return descriptor.value;
}

function validateRuntime() {
  expect(PROCESS_VERSIONS !== null && typeof PROCESS_VERSIONS === 'object');
  expect(!IS_PROXY(PROCESS_VERSIONS));
  const nodeVersion = readDataProperty(PROCESS_VERSIONS, 'node');
  expect(typeof nodeVersion === 'string');
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:[-+][0-9A-Za-z.-]+)?$/u.exec(nodeVersion);
  expect(match !== null && match[1] === '24');

  expect(ARRAY_IS_ARRAY(PROCESS_EXEC_ARGV) && !IS_PROXY(PROCESS_EXEC_ARGV));
  expect(PROCESS_EXEC_ARGV.length === 0);
  expect(PROCESS_ENV !== null && typeof PROCESS_ENV === 'object' && !IS_PROXY(PROCESS_ENV));
  for (const key of GUARDED_ENVIRONMENT_KEYS) {
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(PROCESS_ENV, key);
    if (descriptor === undefined) continue;
    expect(HAS_OWN(descriptor, 'value'));
    expect(descriptor.value === '' || descriptor.value === undefined);
  }
  expect(
    PROCESS_HRTIME !== null
    && (typeof PROCESS_HRTIME === 'object' || typeof PROCESS_HRTIME === 'function'),
  );
  expect(!IS_PROXY(PROCESS_HRTIME));
  const clockDescriptor = GET_OWN_PROPERTY_DESCRIPTOR(PROCESS_HRTIME, 'bigint');
  expect(
    clockDescriptor !== undefined
    && HAS_OWN(clockDescriptor, 'value')
    && clockDescriptor.writable === true
    && clockDescriptor.enumerable === true
    && clockDescriptor.configurable === true
    && typeof clockDescriptor.value === 'function'
    && !IS_PROXY(clockDescriptor.value),
  );
  expect(typeof RUN_LISTENER_FREE === 'function');
  expect(typeof RUN_LOOPBACK === 'function');
  return clockDescriptor.value;
}

function validateExactSummary(value, keys, expected) {
  expect(value !== null && typeof value === 'object');
  expect(!ARRAY_IS_ARRAY(value) && !IS_PROXY(value));
  expect(OBJECT_GET_PROTOTYPE_OF(value) === OBJECT_PROTOTYPE);
  expect(IS_FROZEN(value));
  const actualKeys = REFLECT_OWN_KEYS(value);
  expect(actualKeys.length === keys.length);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    expect(actualKeys[index] === key);
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
    expect(
      descriptor !== undefined
      && descriptor.enumerable === true
      && HAS_OWN(descriptor, 'value')
      && descriptor.value === expected[key],
    );
  }
}

function createClockReader(hrtimeBigint) {
  let previous = null;
  return () => {
    const value = REFLECT_APPLY(hrtimeBigint, PROCESS_HRTIME, []);
    expect(typeof value === 'bigint' && value >= 0n);
    if (previous !== null) expect(value >= previous);
    previous = value;
    return value;
  };
}

async function measureInvocation(runner, keys, expected, readClock, samples, measured) {
  const started = readClock();
  const summary = await REFLECT_APPLY(runner, undefined, []);
  const finished = readClock();
  validateExactSummary(summary, keys, expected);
  if (measured) samples.push(finished - started);
}

function compareBigInt(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function toMicroseconds(nanoseconds) {
  expect(typeof nanoseconds === 'bigint' && nanoseconds >= 0n);
  const rounded = (nanoseconds + 500n) / 1_000n;
  expect(rounded <= MAX_SAFE_INTEGER_BIGINT);
  const value = Number(rounded);
  expect(Number.isSafeInteger(value) && value >= 0);
  return value;
}

function medianToMicroseconds(leftNanoseconds, rightNanoseconds) {
  expect(
    typeof leftNanoseconds === 'bigint'
    && typeof rightNanoseconds === 'bigint'
    && leftNanoseconds >= 0n
    && rightNanoseconds >= leftNanoseconds,
  );
  const rounded = (leftNanoseconds + rightNanoseconds + 1_000n) / 2_000n;
  expect(rounded <= MAX_SAFE_INTEGER_BIGINT);
  const value = Number(rounded);
  expect(Number.isSafeInteger(value) && value >= 0);
  return value;
}

function summarize(samples) {
  expect(samples.length === MEASURED_ROUNDS);
  const ordered = samples.slice().sort(compareBigInt);
  const p95Nanoseconds = ordered[P95_INDEX];
  return OBJECT_FREEZE({
    medianMicroseconds: medianToMicroseconds(
      ordered[MEDIAN_LEFT_INDEX],
      ordered[MEDIAN_RIGHT_INDEX],
    ),
    p95Microseconds: toMicroseconds(p95Nanoseconds),
  });
}

async function executeBenchmark(hrtimeBigint) {
  const listenerFreeSamples = [];
  const loopbackSamples = [];
  const readClock = createClockReader(hrtimeBigint);
  for (let round = 0; round < TOTAL_ROUNDS; round += 1) {
    const measured = round >= WARMUP_ROUNDS;
    if (round % 2 === 0) {
      await measureInvocation(
        RUN_LISTENER_FREE,
        LISTENER_FREE_KEYS,
        LISTENER_FREE_EXPECTED,
        readClock,
        listenerFreeSamples,
        measured,
      );
      await measureInvocation(
        RUN_LOOPBACK,
        LOOPBACK_KEYS,
        LOOPBACK_EXPECTED,
        readClock,
        loopbackSamples,
        measured,
      );
    } else {
      await measureInvocation(
        RUN_LOOPBACK,
        LOOPBACK_KEYS,
        LOOPBACK_EXPECTED,
        readClock,
        loopbackSamples,
        measured,
      );
      await measureInvocation(
        RUN_LISTENER_FREE,
        LISTENER_FREE_KEYS,
        LISTENER_FREE_EXPECTED,
        readClock,
        listenerFreeSamples,
        measured,
      );
    }
  }
  return OBJECT_FREEZE({
    benchmarkVersion: 1,
    status: 'SERVICE_CREDIT_LOCAL_BENCHMARK_SUCCESS',
    mode: 'LOCAL_SYNTHETIC_SCENARIO_BENCHMARK',
    nodeMajor: 24,
    clock: 'PROCESS_HRTIME_BIGINT',
    measurementTarget: 'WHOLE_DEMO_INVOCATION',
    warmupsPerLane: WARMUP_ROUNDS,
    measuredSamplesPerLane: MEASURED_ROUNDS,
    concurrency: 1,
    order: 'PAIRED_ALTERNATING_CONTINUOUS',
    durationUnit: 'MICROSECONDS',
    durationRounding: 'HALF_UP_TO_NEAREST_MICROSECOND',
    percentileMethod: 'NEAREST_RANK',
    listenerFree: summarize(listenerFreeSamples),
    loopback: summarize(loopbackSamples),
  });
}

export async function runServiceCreditLocalBenchmark() {
  if (arguments.length !== 0) failBenchmark();
  if (invocationInFlight) failBenchmark();
  invocationInFlight = true;
  try {
    const hrtimeBigint = validateRuntime();
    return await executeBenchmark(hrtimeBigint);
  } catch {
    failBenchmark();
  } finally {
    invocationInFlight = false;
  }
}
