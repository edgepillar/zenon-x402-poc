import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(TEST_DIRECTORY, '..');
const CORE_PATH = join(ROOT, 'src', 'service-credit-local-benchmark.js');
const CLI_PATH = join(ROOT, 'src', 'service-credit-local-benchmark-cli.js');
const CORE_URL = pathToFileURL(CORE_PATH).href;
const CLI_URL = pathToFileURL(CLI_PATH).href;
const LISTENER_FREE_URL = pathToFileURL(
  join(ROOT, 'src', 'service-credit-demo.js'),
).href;
const LOOPBACK_URL = pathToFileURL(
  join(ROOT, 'src', 'service-credit-loopback-demo.js'),
).href;
const FAILURE_OUTPUT = 'SERVICE_CREDIT_LOCAL_BENCHMARK_FAILED\n';
const LISTENER_FREE_SUMMARY = Object.freeze({
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
const LOOPBACK_SUMMARY = Object.freeze({
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
const EXPECTED_RESULT = Object.freeze({
  benchmarkVersion: 1,
  status: 'SERVICE_CREDIT_LOCAL_BENCHMARK_SUCCESS',
  mode: 'LOCAL_SYNTHETIC_SCENARIO_BENCHMARK',
  nodeMajor: 24,
  clock: 'PROCESS_HRTIME_BIGINT',
  measurementTarget: 'WHOLE_DEMO_INVOCATION',
  warmupsPerLane: 5,
  measuredSamplesPerLane: 30,
  concurrency: 1,
  order: 'PAIRED_ALTERNATING_CONTINUOUS',
  durationUnit: 'MICROSECONDS',
  durationRounding: 'HALF_UP_TO_NEAREST_MICROSECOND',
  percentileMethod: 'NEAREST_RANK',
  listenerFree: Object.freeze({
    medianMicroseconds: 16,
    p95Microseconds: 29,
  }),
  loopback: Object.freeze({
    medianMicroseconds: 31,
    p95Microseconds: 58,
  }),
});
const SUCCESS_OUTPUT = `${JSON.stringify(EXPECTED_RESULT)}\n`;
const MODULE_EDGE_PARSER = [
  "import { readFileSync } from 'node:fs';",
  "import { SourceTextModule } from 'node:vm';",
  "const parsed = new SourceTextModule(readFileSync(0, 'utf8'));",
  'process.stdout.write(JSON.stringify(',
  'parsed.moduleRequests.map(request => request.specifier)',
  '));',
].join('');
const DYNAMIC_IMPORT_GUARD = /\bimport(?:(?:\s+)|(?:\/\*[\s\S]*?\*\/)|(?:\/\/[^\r\n\u2028\u2029]*(?:\r\n?|\n|\u2028|\u2029|$)))*\(/u;

function assertFixedFailure(error) {
  assert.equal(error?.name, 'ServiceCreditLocalBenchmarkError');
  assert.equal(error?.code, 'SERVICE_CREDIT_LOCAL_BENCHMARK_FAILED');
  assert.equal(error?.message, 'SERVICE_CREDIT_LOCAL_BENCHMARK_FAILED');
  assert.equal(
    error?.stack,
    'ServiceCreditLocalBenchmarkError: SERVICE_CREDIT_LOCAL_BENCHMARK_FAILED',
  );
  assert.equal(Object.hasOwn(error, 'cause'), false);
  return true;
}

function moduleMockChild(source, options = {}) {
  return spawnSync(process.execPath, [
    '--no-warnings',
    '--experimental-test-module-mocks',
    '--input-type=module',
    '--eval',
    source,
  ], {
    cwd: ROOT,
    encoding: options.encoding ?? 'utf8',
    env: options.env ?? process.env,
    stdio: options.stdio,
  });
}

function assertChildPass(result, marker) {
  assert.equal(result.status, 0);
  assert.equal(result.signal, null);
  assert.equal(result.stdout, marker);
  assert.equal(result.stderr, '');
}

function staticImportSpecifiers(source) {
  const parsed = spawnSync(process.execPath, [
    '--no-warnings',
    '--experimental-vm-modules',
    '--input-type=module',
    '--eval',
    MODULE_EDGE_PARSER,
  ], {
    encoding: 'utf8',
    input: source,
  });
  assert.equal(parsed.status, 0);
  assert.doesNotMatch(source, DYNAMIC_IMPORT_GUARD);
  return JSON.parse(parsed.stdout);
}

function runtimeMockSource({
  listenerFreeBody = 'return listenerFreeSummary;',
  loopbackBody = 'return loopbackSummary;',
  clockBody = 'return clockValues[clockIndex++];',
  clockValues = ['0'],
  nodeVersion = '24.1.0',
  execArgv = [],
  env = {},
  query = 'mocked',
  runtimeSetup = '',
  tail = '',
} = {}) {
  return `
    import { mock } from 'node:test';
    import assert from 'node:assert/strict';
    const listenerFreeSummary = Object.freeze(${JSON.stringify(LISTENER_FREE_SUMMARY)});
    const loopbackSummary = Object.freeze(${JSON.stringify(LOOPBACK_SUMMARY)});
    const clockValues = ${JSON.stringify(clockValues)}.map(value => BigInt(value));
    let clockIndex = 0;
    let listenerFreeCalls = 0;
    let loopbackCalls = 0;
    let active = 0;
    let maximumActive = 0;
    const callOrder = [];
    ${runtimeSetup}
    function hrtime() { throw new Error('unused clock surface'); }
    Object.defineProperty(hrtime, 'bigint', {
      value: () => { ${clockBody} },
      writable: true,
      enumerable: true,
      configurable: true,
    });
    mock.module('node:process', {
      namedExports: {
        env: ${JSON.stringify(env)},
        execArgv: ${JSON.stringify(execArgv)},
        hrtime,
        versions: { node: ${JSON.stringify(nodeVersion)} },
      },
    });
    mock.module(${JSON.stringify(LISTENER_FREE_URL)}, {
      namedExports: {
        runServiceCreditMockDemo: async () => {
          listenerFreeCalls += 1;
          callOrder.push('listenerFree');
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          try { await Promise.resolve(); ${listenerFreeBody} }
          finally { active -= 1; }
        },
      },
    });
    mock.module(${JSON.stringify(LOOPBACK_URL)}, {
      namedExports: {
        runServiceCreditLoopbackDemo: async () => {
          loopbackCalls += 1;
          callOrder.push('loopback');
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          try { await Promise.resolve(); ${loopbackBody} }
          finally { active -= 1; }
        },
      },
    });
    const benchmarkModule = await import(${JSON.stringify(CORE_URL)} + '?${query}');
    ${tail}
  `;
}

function clockValuesForMeasuredDurations(listenerMeasured, loopbackMeasured) {
  let listenerIndex = 0;
  let loopbackIndex = 0;
  const durations = [];
  const order = [];
  for (let round = 0; round < 35; round += 1) {
    const lanes = round % 2 === 0
      ? ['listenerFree', 'loopback']
      : ['loopback', 'listenerFree'];
    for (const lane of lanes) {
      order.push(lane);
      if (round < 5) durations.push(0n);
      else if (lane === 'listenerFree') durations.push(listenerMeasured[listenerIndex++]);
      else durations.push(loopbackMeasured[loopbackIndex++]);
    }
  }
  const clockValues = [];
  let cursor = 0n;
  for (const duration of durations) {
    clockValues.push(String(cursor), String(cursor + duration));
    cursor += duration + 1n;
  }
  return { clockValues, order };
}

function scheduleDurations() {
  return clockValuesForMeasuredDurations(
    Array.from({ length: 30 }, (_, index) => BigInt(index + 1) * 1_000n),
    Array.from({ length: 30 }, (_, index) => BigInt(index + 1) * 2_000n),
  );
}

test('module exports only the zero-arity runner and wrong arity has no runtime effect', async () => {
  const module = await import(`${CORE_URL}?public-contract`);
  assert.deepEqual(Object.keys(module), ['runServiceCreditLocalBenchmark']);
  assert.equal(module.runServiceCreditLocalBenchmark.length, 0);
  await assert.rejects(
    () => module.runServiceCreditLocalBenchmark(undefined),
    assertFixedFailure,
  );
});

test('import is inert and does not inspect the runtime, invoke runners, or add resources', () => {
  const source = `
    import { mock } from 'node:test';
    let inspected = 0;
    let runnerCalls = 0;
    const versions = Object.create(null, {
      node: { enumerable: true, get() { inspected += 1; return '24.1.0'; } },
    });
    function hrtime() { throw new Error('unused'); }
    Object.defineProperty(hrtime, 'bigint', {
      get() { inspected += 1; return () => 0n; },
      enumerable: true,
      configurable: true,
    });
    mock.module('node:process', { namedExports: { env: {}, execArgv: [], hrtime, versions } });
    mock.module(${JSON.stringify(LISTENER_FREE_URL)}, { namedExports: { runServiceCreditMockDemo: async () => { runnerCalls += 1; } } });
    mock.module(${JSON.stringify(LOOPBACK_URL)}, { namedExports: { runServiceCreditLoopbackDemo: async () => { runnerCalls += 1; } } });
    const resources = process.getActiveResourcesInfo().sort().join('|');
    const listeners = process.eventNames().map(name => [String(name), process.listenerCount(name)]);
    const module = await import(${JSON.stringify(CORE_URL)} + '?inert');
    const resourcesAfter = process.getActiveResourcesInfo().sort().join('|');
    const listenersAfter = process.eventNames().map(name => [String(name), process.listenerCount(name)]);
    let fixed = false;
    try { await module.runServiceCreditLocalBenchmark(undefined); }
    catch (error) { fixed = error?.code === 'SERVICE_CREDIT_LOCAL_BENCHMARK_FAILED'; }
    if (!fixed || inspected !== 0 || runnerCalls !== 0 || resourcesAfter !== resources
      || JSON.stringify(listenersAfter) !== JSON.stringify(listeners)) process.exit(1);
    process.stdout.write('IMPORT_AND_ARITY_INERT=PASS\\n');
  `;
  assertChildPass(moduleMockChild(source), 'IMPORT_AND_ARITY_INERT=PASS\n');
});

test('clock acquisition is deferred and rejects hostile descriptors without effects', () => {
  const cases = [
    {
      name: 'missing',
      setup: 'const hrtime = function hrtime() {};',
    },
    {
      name: 'accessor',
      setup: `
        const hrtime = function hrtime() {};
        Object.defineProperty(hrtime, 'bigint', {
          get() { descriptorEffects += 1; return () => { clockCalls += 1; return 0n; }; },
          enumerable: true,
          configurable: true,
        });
      `,
    },
    {
      name: 'nonfunction',
      setup: `
        const hrtime = function hrtime() {};
        Object.defineProperty(hrtime, 'bigint', {
          value: 0n,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      `,
    },
    {
      name: 'noncanonical-descriptor',
      setup: `
        const hrtime = function hrtime() {};
        Object.defineProperty(hrtime, 'bigint', {
          value: () => { clockCalls += 1; return 0n; },
        });
      `,
    },
    {
      name: 'callable-proxy-value',
      setup: `
        const proxiedClock = new Proxy(
          () => { clockCalls += 1; return 0n; },
          {
            apply() {
              descriptorEffects += 1;
              throw new Error('private apply trap');
            },
          },
        );
        const hrtime = function hrtime() {};
        Object.defineProperty(hrtime, 'bigint', {
          value: proxiedClock,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      `,
    },
    {
      name: 'proxy',
      setup: `
        const hrtime = new Proxy(function hrtime() {}, {
          getOwnPropertyDescriptor() {
            descriptorEffects += 1;
            throw new Error('private proxy trap');
          },
        });
      `,
    },
    {
      name: 'primitive',
      setup: 'const hrtime = 1;',
    },
  ];
  for (const current of cases) {
    const source = `
      import { mock } from 'node:test';
      let descriptorEffects = 0;
      let clockCalls = 0;
      let runnerCalls = 0;
      ${current.setup}
      mock.module('node:process', {
        namedExports: { env: {}, execArgv: [], hrtime, versions: { node: '24.1.0' } },
      });
      mock.module(${JSON.stringify(LISTENER_FREE_URL)}, {
        namedExports: { runServiceCreditMockDemo: async () => { runnerCalls += 1; } },
      });
      mock.module(${JSON.stringify(LOOPBACK_URL)}, {
        namedExports: { runServiceCreditLoopbackDemo: async () => { runnerCalls += 1; } },
      });
      const module = await import(${JSON.stringify(CORE_URL)} + '?clock-descriptor-${current.name}');
      let wrongArityFixed = false;
      try { await module.runServiceCreditLocalBenchmark(undefined); }
      catch (error) {
        wrongArityFixed = error?.code === 'SERVICE_CREDIT_LOCAL_BENCHMARK_FAILED'
          && !Object.hasOwn(error, 'cause');
      }
      if (!wrongArityFixed || descriptorEffects !== 0 || clockCalls !== 0 || runnerCalls !== 0) {
        process.exit(1);
      }
      let fixed = false;
      try { await module.runServiceCreditLocalBenchmark(); }
      catch (error) {
        fixed = error?.code === 'SERVICE_CREDIT_LOCAL_BENCHMARK_FAILED'
          && !Object.hasOwn(error, 'cause');
      }
      if (!fixed || descriptorEffects !== 0 || clockCalls !== 0 || runnerCalls !== 0) process.exit(1);
      process.stdout.write('CLOCK_DESCRIPTOR_GUARD=PASS\\n');
    `;
    assertChildPass(moduleMockChild(source), 'CLOCK_DESCRIPTOR_GUARD=PASS\n');
  }
});

test('paired schedule, full-invocation timing, statistics, ordering, and result are exact', () => {
  const { clockValues, order } = scheduleDurations();
  const source = runtimeMockSource({
    clockValues,
    env: {
      NODE_OPTIONS: '',
      NODE_V8_COVERAGE: '',
      NODE_DEBUG: '',
      NODE_DEBUG_NATIVE: '',
    },
    query: 'schedule',
    tail: `
      const resourcesBeforeRun = process.getActiveResourcesInfo().sort().join('|');
      const listenersBeforeRun = process.eventNames().map(name => [String(name), process.listenerCount(name)]);
      const result = await benchmarkModule.runServiceCreditLocalBenchmark();
      const resourcesAfterRun = process.getActiveResourcesInfo().sort().join('|');
      const listenersAfterRun = process.eventNames().map(name => [String(name), process.listenerCount(name)]);
      assert.deepEqual(result, ${JSON.stringify(EXPECTED_RESULT)});
      assert.deepEqual(Reflect.ownKeys(result), ${JSON.stringify(Reflect.ownKeys(EXPECTED_RESULT))});
      assert.deepEqual(Reflect.ownKeys(result.listenerFree), ['medianMicroseconds', 'p95Microseconds']);
      assert.deepEqual(Reflect.ownKeys(result.loopback), ['medianMicroseconds', 'p95Microseconds']);
      assert.equal(Object.isFrozen(result), true);
      assert.equal(Object.isFrozen(result.listenerFree), true);
      assert.equal(Object.isFrozen(result.loopback), true);
      assert.equal(listenerFreeCalls, 35);
      assert.equal(loopbackCalls, 35);
      assert.equal(clockIndex, 140);
      assert.equal(maximumActive, 1);
      assert.deepEqual(callOrder, ${JSON.stringify(order)});
      assert.equal(callOrder.slice(10).filter((lane, index) => index % 2 === 0 && lane === 'listenerFree').length, 15);
      assert.equal(callOrder.slice(10).filter((lane, index) => index % 2 === 0 && lane === 'loopback').length, 15);
      assert.equal(resourcesAfterRun, resourcesBeforeRun);
      assert.deepEqual(listenersAfterRun, listenersBeforeRun);
      process.stdout.write('SCHEDULE_AND_STATISTICS=PASS\\n');
    `,
  });
  assertChildPass(moduleMockChild(source), 'SCHEDULE_AND_STATISTICS=PASS\n');
});

test('zero-duration samples are accepted and round to zero', () => {
  const source = runtimeMockSource({
    clockValues: Array(140).fill('0'),
    query: 'zero-duration',
    tail: `
      const result = await benchmarkModule.runServiceCreditLocalBenchmark();
      assert.deepEqual(result.listenerFree, { medianMicroseconds: 0, p95Microseconds: 0 });
      assert.deepEqual(result.loopback, { medianMicroseconds: 0, p95Microseconds: 0 });
      process.stdout.write('ZERO_DURATION=PASS\\n');
    `,
  });
  assertChildPass(moduleMockChild(source), 'ZERO_DURATION=PASS\n');
});

test('even-sample median rounds the exact rational value once at microsecond precision', () => {
  const cases = [
    {
      name: 'below-half-microsecond',
      samples: [...Array(14).fill(0n), 499n, 500n, ...Array(14).fill(500n)],
      expectedMedian: 0,
    },
    {
      name: 'at-half-microsecond',
      samples: [...Array(14).fill(0n), 500n, 500n, ...Array(14).fill(500n)],
      expectedMedian: 1,
    },
  ];
  for (const current of cases) {
    const { clockValues } = clockValuesForMeasuredDurations(
      current.samples,
      Array(30).fill(0n),
    );
    const source = runtimeMockSource({
      clockValues,
      query: `median-${current.name}`,
      tail: `
        const result = await benchmarkModule.runServiceCreditLocalBenchmark();
        assert.equal(result.listenerFree.medianMicroseconds, ${current.expectedMedian});
        assert.equal(result.loopback.medianMicroseconds, 0);
        process.stdout.write('EXACT_MEDIAN_ROUNDING=PASS\\n');
      `,
    });
    assertChildPass(moduleMockChild(source), 'EXACT_MEDIAN_ROUNDING=PASS\n');
  }
});

test('runtime gate rejects unsupported or malformed Node versions before effects', () => {
  const source = `
    import { mock } from 'node:test';
    const versions = { node: '24.1.0' };
    let clockCalls = 0;
    let runnerCalls = 0;
    function hrtime() { throw new Error('unused'); }
    Object.defineProperty(hrtime, 'bigint', {
      value: () => { clockCalls += 1; return 0n; },
      writable: true,
      enumerable: true,
      configurable: true,
    });
    mock.module('node:process', { namedExports: { env: {}, execArgv: [], hrtime, versions } });
    mock.module(${JSON.stringify(LISTENER_FREE_URL)}, { namedExports: { runServiceCreditMockDemo: async () => { runnerCalls += 1; } } });
    mock.module(${JSON.stringify(LOOPBACK_URL)}, { namedExports: { runServiceCreditLoopbackDemo: async () => { runnerCalls += 1; } } });
    for (const [index, value] of ['23.9.0', '25.0.0', '24.bad', 'not-a-version'].entries()) {
      versions.node = value;
      const module = await import(${JSON.stringify(CORE_URL)} + '?runtime-version-' + index);
      try { await module.runServiceCreditLocalBenchmark(); process.exit(1); }
      catch (error) {
        if (error?.name !== 'ServiceCreditLocalBenchmarkError'
          || error?.code !== 'SERVICE_CREDIT_LOCAL_BENCHMARK_FAILED'
          || Object.hasOwn(error, 'cause')) process.exit(1);
      }
    }
    if (clockCalls !== 0 || runnerCalls !== 0) process.exit(1);
    process.stdout.write('RUNTIME_VERSION_GATE=PASS\\n');
  `;
  assertChildPass(moduleMockChild(source), 'RUNTIME_VERSION_GATE=PASS\n');
});

test('runtime gate rejects exec arguments and each guarded environment value before effects', () => {
  const source = `
    import { mock } from 'node:test';
    const execArgv = [];
    const env = {};
    let clockCalls = 0;
    let runnerCalls = 0;
    function hrtime() { throw new Error('unused'); }
    Object.defineProperty(hrtime, 'bigint', {
      value: () => { clockCalls += 1; return 0n; },
      writable: true,
      enumerable: true,
      configurable: true,
    });
    mock.module('node:process', { namedExports: { env, execArgv, hrtime, versions: { node: '24.1.0' } } });
    mock.module(${JSON.stringify(LISTENER_FREE_URL)}, { namedExports: { runServiceCreditMockDemo: async () => { runnerCalls += 1; } } });
    mock.module(${JSON.stringify(LOOPBACK_URL)}, { namedExports: { runServiceCreditLoopbackDemo: async () => { runnerCalls += 1; } } });
    execArgv.push('--synthetic-flag');
    let module = await import(${JSON.stringify(CORE_URL)} + '?exec-argv');
    try { await module.runServiceCreditLocalBenchmark(); process.exit(1); }
    catch (error) { if (error?.code !== 'SERVICE_CREDIT_LOCAL_BENCHMARK_FAILED') process.exit(1); }
    execArgv.length = 0;
    const names = ['NODE_OPTIONS', 'NODE_V8_COVERAGE', 'NODE_DEBUG', 'NODE_DEBUG_NATIVE'];
    for (const [index, name] of names.entries()) {
      env[name] = 'redacted-test-value';
      module = await import(${JSON.stringify(CORE_URL)} + '?env-' + index);
      try { await module.runServiceCreditLocalBenchmark(); process.exit(1); }
      catch (error) {
        if (error?.code !== 'SERVICE_CREDIT_LOCAL_BENCHMARK_FAILED'
          || error.message.includes(env[name]) || error.stack.includes(env[name])) process.exit(1);
      }
      delete env[name];
    }
    env.NODE_OPTIONS = '';
    if (clockCalls !== 0 || runnerCalls !== 0) process.exit(1);
    process.stdout.write('RUNTIME_EFFECT_GATES=PASS\\n');
  `;
  assertChildPass(moduleMockChild(source), 'RUNTIME_EFFECT_GATES=PASS\n');
});

test('every malformed demo summary fails descriptor-safely before continuation', () => {
  const source = `
    import { mock } from 'node:test';
    const validListener = Object.freeze(${JSON.stringify(LISTENER_FREE_SUMMARY)});
    const validLoopback = Object.freeze(${JSON.stringify(LOOPBACK_SUMMARY)});
    let current = null;
    let getterCalls = 0;
    let proxyCalls = 0;
    let listenerCalls = 0;
    let loopbackCalls = 0;
    function hrtime() { throw new Error('unused'); }
    Object.defineProperty(hrtime, 'bigint', {
      value: () => 0n,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    mock.module('node:process', { namedExports: { env: {}, execArgv: [], hrtime, versions: { node: '24.1.0' } } });
    mock.module(${JSON.stringify(LISTENER_FREE_URL)}, { namedExports: { runServiceCreditMockDemo: async () => { listenerCalls += 1; return current; } } });
    mock.module(${JSON.stringify(LOOPBACK_URL)}, { namedExports: { runServiceCreditLoopbackDemo: async () => { loopbackCalls += 1; return validLoopback; } } });
    const missing = { ...validListener }; delete missing.demoVersion; Object.freeze(missing);
    const extra = Object.freeze({ ...validListener, extra: true });
    const reordered = Object.freeze(Object.fromEntries([...Object.entries(validListener)].reverse()));
    const accessor = { ...validListener };
    Object.defineProperty(accessor, 'demoVersion', { enumerable: true, get() { getterCalls += 1; return 1; } });
    Object.freeze(accessor);
    const proxy = new Proxy(validListener, {
      ownKeys() { proxyCalls += 1; throw new Error('proxy trap'); },
      getOwnPropertyDescriptor() { proxyCalls += 1; throw new Error('proxy trap'); },
      getPrototypeOf() { proxyCalls += 1; throw new Error('proxy trap'); },
      isExtensible() { proxyCalls += 1; throw new Error('proxy trap'); },
    });
    const unfrozen = { ...validListener };
    const altered = Object.freeze({ ...validListener, unitsRemaining: 2 });
    const cases = [missing, extra, reordered, accessor, proxy, unfrozen, altered];
    for (const [index, value] of cases.entries()) {
      current = value;
      const module = await import(${JSON.stringify(CORE_URL)} + '?shape-' + index);
      try { await module.runServiceCreditLocalBenchmark(); process.exit(1); }
      catch (error) {
        if (error?.code !== 'SERVICE_CREDIT_LOCAL_BENCHMARK_FAILED'
          || Object.hasOwn(error, 'cause')) process.exit(1);
      }
    }
    if (listenerCalls !== cases.length || loopbackCalls !== 0 || getterCalls !== 0 || proxyCalls !== 0) process.exit(1);
    process.stdout.write('SUMMARY_SHAPES=PASS\\n');
  `;
  assertChildPass(moduleMockChild(source), 'SUMMARY_SHAPES=PASS\n');
});

test('the distinct loopback summary contract rejects altered transport metadata', () => {
  const source = runtimeMockSource({
    loopbackBody: "return Object.freeze({ ...loopbackSummary, transportScope: 'ALTERED' });",
    clockValues: Array(4).fill('0'),
    query: 'loopback-shape',
    tail: `
      try { await benchmarkModule.runServiceCreditLocalBenchmark(); process.exit(1); }
      catch (error) {
        if (error?.code !== 'SERVICE_CREDIT_LOCAL_BENCHMARK_FAILED'
          || Object.hasOwn(error, 'cause')) process.exit(1);
      }
      if (listenerFreeCalls !== 1 || loopbackCalls !== 1 || clockIndex !== 4) process.exit(1);
      process.stdout.write('LOOPBACK_SUMMARY_SHAPE=PASS\\n');
    `,
  });
  assertChildPass(moduleMockChild(source), 'LOOPBACK_SUMMARY_SHAPE=PASS\n');
});

test('non-BigInt, negative, backward, and throwing clocks fail without retry', () => {
  const cases = [
    { name: 'non-bigint', body: 'return 0;', listenerCalls: 0 },
    { name: 'negative', body: 'return -1n;', listenerCalls: 0 },
    { name: 'backward', body: 'return clockIndex++ === 0 ? 1n : 0n;', listenerCalls: 1 },
    { name: 'throwing', body: "throw new Error('private clock failure');", listenerCalls: 0 },
  ];
  for (const current of cases) {
    const source = runtimeMockSource({
      clockBody: current.body,
      query: `clock-${current.name}`,
      tail: `
        try { await benchmarkModule.runServiceCreditLocalBenchmark(); process.exit(1); }
        catch (error) {
          if (error?.code !== 'SERVICE_CREDIT_LOCAL_BENCHMARK_FAILED'
            || Object.hasOwn(error, 'cause')) process.exit(1);
        }
        if (listenerFreeCalls !== ${current.listenerCalls} || loopbackCalls !== 0) process.exit(1);
        process.stdout.write('CLOCK_FAILURE=PASS\\n');
      `,
    });
    assertChildPass(moduleMockChild(source), 'CLOCK_FAILURE=PASS\n');
  }
});

test('unsafe final microsecond conversion fails after exact sequential collection', () => {
  const unsafeDuration = (BigInt(Number.MAX_SAFE_INTEGER) + 1n) * 1_000n;
  const values = [];
  let cursor = 0n;
  for (let call = 0; call < 70; call += 1) {
    const duration = call >= 10 ? unsafeDuration : 0n;
    values.push(String(cursor), String(cursor + duration));
    cursor += duration;
  }
  const source = runtimeMockSource({
    clockValues: values,
    query: 'unsafe-final',
    tail: `
      try { await benchmarkModule.runServiceCreditLocalBenchmark(); process.exit(1); }
      catch (error) { if (error?.code !== 'SERVICE_CREDIT_LOCAL_BENCHMARK_FAILED') process.exit(1); }
      if (listenerFreeCalls !== 35 || loopbackCalls !== 35 || clockIndex !== 140) process.exit(1);
      process.stdout.write('UNSAFE_FINAL_CONVERSION=PASS\\n');
    `,
  });
  assertChildPass(moduleMockChild(source), 'UNSAFE_FINAL_CONVERSION=PASS\n');
});

test('runner failures in warmup and measured rounds abort first with no retry or partial result', () => {
  const warmup = runtimeMockSource({
    listenerFreeBody: "throw new Error('private runner failure');",
    query: 'warmup-failure',
    tail: `
      try { await benchmarkModule.runServiceCreditLocalBenchmark(); process.exit(1); }
      catch (error) { if (error?.code !== 'SERVICE_CREDIT_LOCAL_BENCHMARK_FAILED') process.exit(1); }
      if (listenerFreeCalls !== 1 || loopbackCalls !== 0 || clockIndex !== 1) process.exit(1);
      process.stdout.write('WARMUP_ABORT=PASS\\n');
    `,
  });
  assertChildPass(moduleMockChild(warmup), 'WARMUP_ABORT=PASS\n');

  const measured = runtimeMockSource({
    listenerFreeBody: "if (listenerFreeCalls === 6) throw new Error('private measured failure'); return listenerFreeSummary;",
    clockValues: Array(140).fill('0'),
    query: 'measured-failure',
    tail: `
      try { await benchmarkModule.runServiceCreditLocalBenchmark(); process.exit(1); }
      catch (error) { if (error?.code !== 'SERVICE_CREDIT_LOCAL_BENCHMARK_FAILED') process.exit(1); }
      if (listenerFreeCalls !== 6 || loopbackCalls !== 6 || clockIndex !== 23 || maximumActive !== 1) process.exit(1);
      process.stdout.write('MEASURED_ABORT=PASS\\n');
    `,
  });
  assertChildPass(moduleMockChild(measured), 'MEASURED_ABORT=PASS\n');
});

test('concurrent invocation fails before additional effects and the module is reusable after success', () => {
  const source = runtimeMockSource({
    clockValues: Array.from({ length: 280 }, (_, index) => String(index)),
    runtimeSetup: `
      let releaseFirst;
      const firstGate = new Promise(resolveGate => { releaseFirst = resolveGate; });
      let signalFirstEntered;
      const firstEntered = new Promise(resolveEntered => { signalFirstEntered = resolveEntered; });
    `,
    listenerFreeBody: `
      if (listenerFreeCalls === 1) {
        signalFirstEntered();
        await firstGate;
      }
      return listenerFreeSummary;
    `,
    query: 'concurrent-latch',
    tail: `
      const first = benchmarkModule.runServiceCreditLocalBenchmark();
      await firstEntered;
      assert.equal(listenerFreeCalls, 1);
      assert.equal(loopbackCalls, 0);
      assert.equal(clockIndex, 1);
      await assert.rejects(
        () => benchmarkModule.runServiceCreditLocalBenchmark(),
        error => error?.code === 'SERVICE_CREDIT_LOCAL_BENCHMARK_FAILED'
          && !Object.hasOwn(error, 'cause'),
      );
      assert.equal(listenerFreeCalls, 1);
      assert.equal(loopbackCalls, 0);
      assert.equal(clockIndex, 1);
      releaseFirst();
      await first;
      await benchmarkModule.runServiceCreditLocalBenchmark();
      assert.equal(listenerFreeCalls, 70);
      assert.equal(loopbackCalls, 70);
      assert.equal(clockIndex, 280);
      process.stdout.write('CONCURRENT_LATCH_AND_REUSE=PASS\\n');
    `,
  });
  assertChildPass(moduleMockChild(source), 'CONCURRENT_LATCH_AND_REUSE=PASS\n');
});

test('reentrant invocation fails before additional clock or runner effects', () => {
  const source = runtimeMockSource({
    clockValues: Array.from({ length: 140 }, (_, index) => String(index)),
    listenerFreeBody: `
      if (listenerFreeCalls === 1) {
        const clockBefore = clockIndex;
        const listenerBefore = listenerFreeCalls;
        const loopbackBefore = loopbackCalls;
        let fixed = false;
        try { await benchmarkModule.runServiceCreditLocalBenchmark(); }
        catch (error) {
          fixed = error?.code === 'SERVICE_CREDIT_LOCAL_BENCHMARK_FAILED'
            && !Object.hasOwn(error, 'cause');
        }
        if (!fixed || clockIndex !== clockBefore || listenerFreeCalls !== listenerBefore
          || loopbackCalls !== loopbackBefore) throw new Error('private reentrant assertion');
      }
      return listenerFreeSummary;
    `,
    query: 'reentrant-latch',
    tail: `
      await benchmarkModule.runServiceCreditLocalBenchmark();
      assert.equal(listenerFreeCalls, 35);
      assert.equal(loopbackCalls, 35);
      assert.equal(clockIndex, 140);
      process.stdout.write('REENTRANT_LATCH=PASS\\n');
    `,
  });
  assertChildPass(moduleMockChild(source), 'REENTRANT_LATCH=PASS\n');
});

test('the module-local latch is released after a failed invocation', () => {
  const source = runtimeMockSource({
    clockValues: Array.from({ length: 141 }, (_, index) => String(index)),
    runtimeSetup: 'let failNext = true;',
    listenerFreeBody: `
      if (failNext) {
        failNext = false;
        throw new Error('private first failure');
      }
      return listenerFreeSummary;
    `,
    query: 'failure-latch-release',
    tail: `
      await assert.rejects(
        () => benchmarkModule.runServiceCreditLocalBenchmark(),
        error => error?.code === 'SERVICE_CREDIT_LOCAL_BENCHMARK_FAILED'
          && !Object.hasOwn(error, 'cause'),
      );
      assert.equal(listenerFreeCalls, 1);
      assert.equal(loopbackCalls, 0);
      assert.equal(clockIndex, 1);
      await benchmarkModule.runServiceCreditLocalBenchmark();
      assert.equal(listenerFreeCalls, 36);
      assert.equal(loopbackCalls, 35);
      assert.equal(clockIndex, 141);
      process.stdout.write('FAILED_LATCH_RELEASE=PASS\\n');
    `,
  });
  assertChildPass(moduleMockChild(source), 'FAILED_LATCH_RELEASE=PASS\n');
});

test('CLI emits one exact compact JSON line and is deterministic across fake runs', () => {
  const source = `
    import { mock } from 'node:test';
    const result = Object.freeze(${JSON.stringify(EXPECTED_RESULT)});
    Object.freeze(result.listenerFree);
    Object.freeze(result.loopback);
    mock.module(${JSON.stringify(CORE_URL)}, { namedExports: { runServiceCreditLocalBenchmark: async () => result } });
    process.argv = [process.execPath, ${JSON.stringify(CLI_PATH)}];
    await import(${JSON.stringify(CLI_URL)} + '?cli-success');
    await new Promise(resolveImmediate => setImmediate(resolveImmediate));
  `;
  const first = moduleMockChild(source);
  const second = moduleMockChild(source.replace('cli-success', 'cli-success-second'));
  assertChildPass(first, SUCCESS_OUTPUT);
  assertChildPass(second, SUCCESS_OUTPUT);
  assert.equal(first.stdout, second.stdout);
  assert.equal(first.stdout.split('\n').length, 2);
});

test('CLI rejects arguments before running and maps runner or serialization failure', () => {
  const cases = [
    {
      name: 'argument',
      setup: '',
      argv: `process.argv = [process.execPath, ${JSON.stringify(CLI_PATH)}, 'unexpected'];`,
      runner: 'async () => { runnerCalls += 1; return result; }',
      expectedCalls: 0,
    },
    {
      name: 'runner',
      setup: '',
      argv: `process.argv = [process.execPath, ${JSON.stringify(CLI_PATH)}];`,
      runner: "async () => { runnerCalls += 1; throw new Error('private'); }",
      expectedCalls: 1,
    },
    {
      name: 'serialization',
      setup: "JSON.stringify = () => { throw new Error('private'); };",
      argv: `process.argv = [process.execPath, ${JSON.stringify(CLI_PATH)}];`,
      runner: 'async () => { runnerCalls += 1; return result; }',
      expectedCalls: 1,
    },
  ];
  for (const current of cases) {
    const source = `
      import { mock } from 'node:test';
      let runnerCalls = 0;
      const result = ${JSON.stringify(EXPECTED_RESULT)};
      mock.module(${JSON.stringify(CORE_URL)}, { namedExports: { runServiceCreditLocalBenchmark: ${current.runner} } });
      ${current.setup}
      ${current.argv}
      await import(${JSON.stringify(CLI_URL)} + '?cli-${current.name}');
      await new Promise(resolveImmediate => setImmediate(resolveImmediate));
      if (runnerCalls !== ${current.expectedCalls}) process.exit(2);
    `;
    const result = moduleMockChild(source);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, FAILURE_OUTPUT);
  }
});

test('CLI handles closed, throwing, and short stdout without raw diagnostics or retry', async () => {
  const closed = await new Promise((resolveResult, rejectResult) => {
    const source = `
      import { mock } from 'node:test';
      mock.module(${JSON.stringify(CORE_URL)}, { namedExports: { runServiceCreditLocalBenchmark: async () => (${JSON.stringify(EXPECTED_RESULT)}) } });
      process.argv = [process.execPath, ${JSON.stringify(CLI_PATH)}];
      await import(${JSON.stringify(CLI_URL)} + '?closed-stdout');
      await new Promise(resolveImmediate => setImmediate(resolveImmediate));
    `;
    const child = spawn(process.execPath, [
      '--no-warnings',
      '--experimental-test-module-mocks',
      '--input-type=module',
      '--eval',
      source,
    ], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    child.once('error', rejectResult);
    child.once('close', (code, signal) => resolveResult({ code, signal, stderr }));
    child.stdout.destroy();
  });
  assert.deepEqual(closed, { code: 1, signal: null, stderr: FAILURE_OUTPUT });

  for (const mode of ['throwing', 'short']) {
    const source = `
      import { mock } from 'node:test';
      import { writeSync as originalWriteSync } from 'node:fs';
      let stdoutCalls = 0;
      const writeSync = (descriptor, bytes, offset, length) => {
        if (descriptor !== 1) return originalWriteSync(descriptor, bytes, offset, length);
        stdoutCalls += 1;
        if (${JSON.stringify(mode)} === 'throwing') throw new Error('private');
        const accepted = Math.max(0, length - 1);
        originalWriteSync(descriptor, bytes, offset, accepted);
        return accepted;
      };
      mock.module('node:fs', { namedExports: { writeSync } });
      mock.module(${JSON.stringify(CORE_URL)}, { namedExports: { runServiceCreditLocalBenchmark: async () => (${JSON.stringify(EXPECTED_RESULT)}) } });
      process.argv = [process.execPath, ${JSON.stringify(CLI_PATH)}];
      await import(${JSON.stringify(CLI_URL)} + '?stdout-${mode}');
      await new Promise(resolveImmediate => setImmediate(resolveImmediate));
      if (stdoutCalls !== 1) process.exit(2);
    `;
    const result = moduleMockChild(source);
    assert.equal(result.status, 1);
    assert.equal(result.stderr, FAILURE_OUTPUT);
    if (mode === 'throwing') assert.equal(result.stdout, '');
    else {
      assert.notEqual(result.stdout, '');
      assert.notEqual(result.stdout, SUCCESS_OUTPUT);
      assert.equal(SUCCESS_OUTPUT.startsWith(result.stdout), true);
    }
  }
});

test('a short stderr write emits at most one allowlisted failure prefix', () => {
  const source = `
    import { mock } from 'node:test';
    import { writeSync as originalWriteSync } from 'node:fs';
    let stderrCalls = 0;
    const writeSync = (descriptor, bytes, offset, length) => {
      if (descriptor !== 2) return originalWriteSync(descriptor, bytes, offset, length);
      stderrCalls += 1;
      const accepted = Math.max(0, length - 1);
      originalWriteSync(descriptor, bytes, offset, accepted);
      return accepted;
    };
    mock.module('node:fs', { namedExports: { writeSync } });
    mock.module(${JSON.stringify(CORE_URL)}, {
      namedExports: { runServiceCreditLocalBenchmark: async () => (${JSON.stringify(EXPECTED_RESULT)}) },
    });
    process.argv = [process.execPath, ${JSON.stringify(CLI_PATH)}, 'unexpected'];
    await import(${JSON.stringify(CLI_URL)} + '?short-stderr');
    await new Promise(resolveImmediate => setImmediate(resolveImmediate));
    if (stderrCalls !== 1) process.exit(2);
  `;
  const result = moduleMockChild(source);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.notEqual(result.stderr, '');
  assert.notEqual(result.stderr, FAILURE_OUTPUT);
  assert.equal(FAILURE_OUTPUT.startsWith(result.stderr), true);
});

test('unavailable stderr leaves nonzero status as the only failure signal', () => {
  const source = `
    import { mock } from 'node:test';
    import { closeSync } from 'node:fs';
    mock.module(${JSON.stringify(CORE_URL)}, { namedExports: { runServiceCreditLocalBenchmark: async () => (${JSON.stringify(EXPECTED_RESULT)}) } });
    closeSync(2);
    process.argv = [process.execPath, ${JSON.stringify(CLI_PATH)}, 'unexpected'];
    await import(${JSON.stringify(CLI_URL)} + '?closed-stderr');
    await new Promise(resolveImmediate => setImmediate(resolveImmediate));
  `;
  const result = moduleMockChild(source, { stdio: ['ignore', 'pipe', 'ignore'] });
  assert.equal(result.status, 1);
  assert.equal(result.stdout.toString(), '');
});

test('source imports are fixed, package script is opt-in, and active paths remain isolated', () => {
  const coreSource = readFileSync(CORE_PATH, 'utf8');
  const cliSource = readFileSync(CLI_PATH, 'utf8');
  assert.deepEqual(staticImportSpecifiers(coreSource).sort(), [
    './service-credit-demo.js',
    './service-credit-loopback-demo.js',
    'node:process',
    'node:util',
  ]);
  assert.deepEqual(staticImportSpecifiers(cliSource).sort(), [
    './service-credit-local-benchmark.js',
    'node:fs',
  ]);
  assert.doesNotMatch(coreSource, /\b(?:fetch|WebSocket|worker_threads|child_process|wallet|rpc)\b/i);
  assert.doesNotMatch(coreSource, /Promise\.(?:all|race)|setTimeout|setInterval|console\.|process\.(?:stdout|stderr)/);
  const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(
    packageJson.scripts['benchmark:service-credit-local'],
    'node src/service-credit-local-benchmark-cli.js',
  );
  for (const relativePath of [
    'src/demo.js',
    'src/service-credit-demo.js',
    'src/service-credit-loopback-demo.js',
    'src/service-credit-loopback-server.js',
    'src/server-cli.js',
    'src/buyer.js',
    'src/buyer-cli.js',
    'src/resource-server.js',
  ]) {
    assert.equal(
      readFileSync(join(ROOT, relativePath), 'utf8').includes('service-credit-local-benchmark'),
      false,
    );
  }
});

test('package manifest preserves dependencies and the benchmark remains explicitly opt-in', () => {
  const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.deepEqual(
    Object.entries(packageJson.scripts)
      .filter(([, command]) => command.includes('service-credit-local-benchmark')),
    [['benchmark:service-credit-local', 'node src/service-credit-local-benchmark-cli.js']],
  );
  assert.deepEqual(Object.keys(packageJson.dependencies).sort(), [
    '@noble/ed25519',
    '@noble/hashes',
    'znn-typescript-sdk',
  ]);
  assert.deepEqual(Object.keys(packageJson.devDependencies), ['@x402/core']);
});

test('documentation states the descriptive benchmark boundary and exact rollback', () => {
  for (const relativePath of ['README.md', 'SECURITY.md', 'docs/IMPLEMENTATION_PLAN.md']) {
    const document = readFileSync(join(ROOT, relativePath), 'utf8');
    for (const required of [
      'npm run --silent benchmark:service-credit-local',
      '35',
      '5',
      '30',
      'whole demo invocation',
      'host',
      'filesystem',
      'runtime',
      'descriptive',
      'not isolated loopback overhead',
      'no retry',
      'no threshold',
      'does not persist',
      'does not upload',
      'authenticated transport',
      'not a production',
      'one loaded benchmark module instance',
      'cross-worker',
      'only variable timing measurements',
      'empty live `execArgv`',
      'operator-controlled fresh process',
      'cannot attest',
      'partial prefix',
      'every nonzero run',
      'cleanup failure',
      'loopback-close uncertainty',
    ]) {
      assert.equal(document.toLowerCase().includes(required.toLowerCase()), true);
    }
  }
  const plan = readFileSync(join(ROOT, 'docs', 'IMPLEMENTATION_PLAN.md'), 'utf8');
  for (const path of [
    'src/service-credit-local-benchmark.js',
    'src/service-credit-local-benchmark-cli.js',
    'test/service-credit-local-benchmark.test.js',
    'package.json',
    'README.md',
    'SECURITY.md',
    'docs/IMPLEMENTATION_PLAN.md',
  ]) assert.equal(plan.includes(path), true);
});

test('CLI uses one fixed synchronous descriptor write surface without diagnostics', () => {
  const source = readFileSync(CLI_PATH, 'utf8');
  assert.match(source, /writeSync/);
  assert.equal((source.match(/JSON\.stringify/g) ?? []).length, 1);
  assert.doesNotMatch(source, /console\.|process\.(?:stdout|stderr)\.write/);
  assert.doesNotMatch(source, /error\.(?:message|stack)|JSON\.stringify\(error/);
});

test('the focused suite never invokes either real benchmark lane', () => {
  const source = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  for (const name of ['runServiceCreditMockDemo', 'runServiceCreditLoopbackDemo']) {
    assert.doesNotMatch(source, new RegExp(`${name}\\s*\\(`, 'u'));
  }
  assert.equal(source.includes('npm run --silent benchmark:service-credit-local'), true);
});
