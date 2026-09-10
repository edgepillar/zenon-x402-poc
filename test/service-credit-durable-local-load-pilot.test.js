import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Server } from 'node:http';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(TEST_DIRECTORY, '..');
const CORE_PATH = join(ROOT, 'src', 'service-credit-durable-local-load-pilot.js');
const CLI_PATH = join(ROOT, 'src', 'service-credit-durable-local-load-pilot-cli.js');
const CORE_URL = pathToFileURL(CORE_PATH).href;
const CLI_URL = pathToFileURL(CLI_PATH).href;
const DURABLE_DEMO_URL = pathToFileURL(
  join(ROOT, 'src', 'service-credit-durable-loopback-demo.js'),
).href;
const SUCCESS_OUTPUT = 'SERVICE_CREDIT_DURABLE_LOCAL_LOAD_PILOT_SUCCESS\n';
const FAILURE_OUTPUT = 'SERVICE_CREDIT_DURABLE_LOCAL_LOAD_PILOT_FAILED\n';

const CHILD_SUMMARY = Object.freeze({
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

const EXPECTED_RESULT = Object.freeze({
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

const MODULE_EDGE_PARSER = [
  "import { readFileSync } from 'node:fs';",
  "import { SourceTextModule } from 'node:vm';",
  "const parsed = new SourceTextModule(readFileSync(0, 'utf8'));",
  'process.stdout.write(JSON.stringify(',
  'parsed.moduleRequests.map(request => request.specifier)',
  '));',
].join('');
const DYNAMIC_IMPORT_GUARD = /\bimport(?:(?:\s+)|(?:\/\*[\s\S]*?\*\/)|(?:\/\/[^\r\n\u2028\u2029]*(?:\r\n?|\n|\u2028|\u2029|$)))*\(/u;

function privateTempParent(prefix = 'service-credit-durable-load-pilot-test-') {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  chmodSync(parent, 0o700);
  return parent;
}

async function withTempParent(operation) {
  const parent = privateTempParent();
  const descriptor = Object.getOwnPropertyDescriptor(process.env, 'TMPDIR');
  process.env.TMPDIR = parent;
  try {
    return await operation(parent);
  } finally {
    if (descriptor) Object.defineProperty(process.env, 'TMPDIR', descriptor);
    else delete process.env.TMPDIR;
    rmSync(parent, { recursive: true, force: true });
  }
}

function assertFixedFailure(error) {
  assert.equal(error?.name, 'DurableServiceCreditLocalLoadPilotError');
  assert.equal(error?.code, 'SERVICE_CREDIT_DURABLE_LOCAL_LOAD_PILOT_FAILED');
  assert.equal(error?.message, 'SERVICE_CREDIT_DURABLE_LOCAL_LOAD_PILOT_FAILED');
  assert.equal(
    error?.stack,
    'DurableServiceCreditLocalLoadPilotError: SERVICE_CREDIT_DURABLE_LOCAL_LOAD_PILOT_FAILED',
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
    encoding: 'utf8',
    env: options.env ?? process.env,
    stdio: options.stdio,
    timeout: options.timeout ?? 20_000,
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

test('pilot module exposes only the zero-argument runner', async () => {
  const module = await import(`${CORE_URL}?public-contract`);
  assert.deepEqual(Object.keys(module), ['runDurableServiceCreditLocalLoadPilot']);
  assert.equal(module.runDurableServiceCreditLocalLoadPilot.length, 0);
  await assert.rejects(
    () => module.runDurableServiceCreditLocalLoadPilot(undefined),
    assertFixedFailure,
  );
});

test('package exposes the explicit non-default pilot command', () => {
  const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(
    packageJson.scripts['pilot:service-credit-durable-local-load'],
    'node src/service-credit-durable-local-load-pilot-cli.js',
  );
});

test('documentation keeps the local-load pilot bounded and rollback-exact', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const security = readFileSync(join(ROOT, 'SECURITY.md'), 'utf8');
  const plan = readFileSync(join(ROOT, 'docs', 'IMPLEMENTATION_PLAN.md'), 'utf8');

  assert.match(readme, /#### Synthetic durable local-load pilot/);
  assert.match(security, /### Synthetic durable local-load pilot boundary/);
  assert.match(plan, /### Synthetic durable local-load pilot/);

  for (const document of [readme, security, plan]) {
    assert.match(document, /two independent (?:durable )?ledgers/i);
    assert.match(document, /same-process/);
    assert.match(document, /never-settling/);
    assert.match(document, /no timing|records no timing/i);
    assert.match(document, /not a benchmark/i);
    assert.match(document, /authenticated transport/i);
    assert.match(document, /exactly eight paths/i);
    assert.match(
      document,
      /every accepted native lane Promise receives an exact immutable own constructor pin and then a module-intrinsic `await` observer/i,
    );
    assert.match(
      document,
      /before the post-launch integrity decision and any permanent quarantine/i,
    );
  }

  for (const name of [
    'service-credit-durable-local-load-pilot.js',
    'service-credit-durable-local-load-pilot-cli.js',
    'service-credit-durable-local-load-pilot.test.js',
  ]) {
    assert.equal(readme.includes(name), true);
  }

  assert.match(readme, /two mock funding settlements/);
  assert.match(readme, /six application callbacks/);
  assert.match(readme, /12 units consumed, zero held, and two available/);
  assert.match(security, /pre-import module replacement/);
  assert.match(security, /does not delete or retain filesystem state itself/);
  assert.match(plan, /no shared-ledger capacity experiment/);
  assert.match(plan, /broader measured load and capacity work remains future/);
});

test('both fixed lanes start before either lane is released', () => {
  const source = `
    import { mock } from 'node:test';
    import assert from 'node:assert/strict';
    const summary = Object.freeze(${JSON.stringify(CHILD_SUMMARY)});
    let calls = 0;
    let release;
    const barrier = new Promise(resolve => { release = resolve; });
    mock.module(${JSON.stringify(DURABLE_DEMO_URL)}, {
      namedExports: {
        runDurableServiceCreditLoopbackDemo: async () => {
          calls += 1;
          await barrier;
          return summary;
        },
      },
    });
    const pilot = await import(${JSON.stringify(CORE_URL)} + '?barrier');
    const operation = pilot.runDurableServiceCreditLocalLoadPilot();
    await Promise.resolve();
    assert.equal(calls, 2);
    release();
    await operation;
    process.stdout.write('TWO_LANES_STARTED=PASS\\n');
  `;
  const result = moduleMockChild(source);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'TWO_LANES_STARTED=PASS\n');
  assert.equal(result.stderr, '');
});

test('core import and wrong arity are inert before child-runner effects', () => {
  const source = `
    import { mock } from 'node:test';
    let calls = 0;
    mock.module(${JSON.stringify(DURABLE_DEMO_URL)}, {
      namedExports: {
        runDurableServiceCreditLoopbackDemo: async () => {
          calls += 1;
          return Object.freeze(${JSON.stringify(CHILD_SUMMARY)});
        },
      },
    });
    const resourcesBefore = process.getActiveResourcesInfo().sort().join('|');
    const listenersBefore = process.eventNames().map(name => [String(name), process.listenerCount(name)]);
    const module = await import(${JSON.stringify(CORE_URL)} + '?inert');
    const resourcesAfter = process.getActiveResourcesInfo().sort().join('|');
    const listenersAfter = process.eventNames().map(name => [String(name), process.listenerCount(name)]);
    let fixed = false;
    try { await module.runDurableServiceCreditLocalLoadPilot(undefined); }
    catch (error) {
      fixed = error?.code === 'SERVICE_CREDIT_DURABLE_LOCAL_LOAD_PILOT_FAILED'
        && error?.stack === 'DurableServiceCreditLocalLoadPilotError: SERVICE_CREDIT_DURABLE_LOCAL_LOAD_PILOT_FAILED'
        && !Object.hasOwn(error, 'cause');
    }
    if (!fixed || calls !== 0 || resourcesAfter !== resourcesBefore
      || JSON.stringify(listenersAfter) !== JSON.stringify(listenersBefore)) process.exit(1);
    process.stdout.write('IMPORT_INERT=PASS\\n');
  `;
  assertChildPass(moduleMockChild(source), 'IMPORT_INERT=PASS\n');
});

test('one rejected lane waits for the delayed sibling and never retries', () => {
  const source = `
    import { mock } from 'node:test';
    import assert from 'node:assert/strict';
    const summary = Object.freeze(${JSON.stringify(CHILD_SUMMARY)});
    let calls = 0;
    let release;
    const barrier = new Promise(resolve => { release = resolve; });
    mock.module(${JSON.stringify(DURABLE_DEMO_URL)}, {
      namedExports: {
        runDurableServiceCreditLoopbackDemo: async () => {
          calls += 1;
          if (calls === 1) throw new Error('private child detail');
          await barrier;
          return summary;
        },
      },
    });
    const pilot = await import(${JSON.stringify(CORE_URL)} + '?drain-rejection');
    let settled = false;
    const operation = pilot.runDurableServiceCreditLocalLoadPilot();
    operation.then(() => { settled = true; }, () => { settled = true; });
    await new Promise(resolveImmediate => setImmediate(resolveImmediate));
    assert.equal(calls, 2);
    assert.equal(settled, false);
    release();
    await assert.rejects(operation, error => (
      error?.code === 'SERVICE_CREDIT_DURABLE_LOCAL_LOAD_PILOT_FAILED'
      && error?.stack === 'DurableServiceCreditLocalLoadPilotError: SERVICE_CREDIT_DURABLE_LOCAL_LOAD_PILOT_FAILED'
      && !Object.hasOwn(error, 'cause')
    ));
    assert.equal(calls, 2);
    process.stdout.write('DRAIN_ALL=PASS\\n');
  `;
  assertChildPass(moduleMockChild(source), 'DRAIN_ALL=PASS\n');
});

test('a synchronous first-lane fault still attempts and drains the second lane', () => {
  const source = `
    import { mock } from 'node:test';
    import assert from 'node:assert/strict';
    const summary = Object.freeze(${JSON.stringify(CHILD_SUMMARY)});
    let calls = 0;
    let release;
    const delayed = new Promise(resolve => { release = () => resolve(summary); });
    mock.module(${JSON.stringify(DURABLE_DEMO_URL)}, {
      namedExports: {
        runDurableServiceCreditLoopbackDemo() {
          calls += 1;
          if (calls === 1) throw new Error('private first-lane detail');
          if (calls === 2) return delayed;
          return Promise.resolve(summary);
        },
      },
    });
    const pilot = await import(${JSON.stringify(CORE_URL)} + '?sync-first-lane-fault');
    let settled = false;
    const operation = pilot.runDurableServiceCreditLocalLoadPilot();
    operation.then(() => { settled = true; }, () => { settled = true; });
    await new Promise(resolveImmediate => setImmediate(resolveImmediate));
    assert.equal(calls, 2);
    assert.equal(settled, false);
    await assert.rejects(
      () => pilot.runDurableServiceCreditLocalLoadPilot(),
      error => error?.code === 'SERVICE_CREDIT_DURABLE_LOCAL_LOAD_PILOT_FAILED',
    );
    assert.equal(calls, 2);
    release();
    await assert.rejects(operation, error => (
      error?.code === 'SERVICE_CREDIT_DURABLE_LOCAL_LOAD_PILOT_FAILED'
      && error?.stack === 'DurableServiceCreditLocalLoadPilotError: SERVICE_CREDIT_DURABLE_LOCAL_LOAD_PILOT_FAILED'
      && !Object.hasOwn(error, 'cause')
    ));
    await pilot.runDurableServiceCreditLocalLoadPilot();
    assert.equal(calls, 4);
    process.stdout.write('SYNC_FIRST_LANE_DRAIN=PASS\\n');
  `;
  assertChildPass(moduleMockChild(source), 'SYNC_FIRST_LANE_DRAIN=PASS\n');
});

test('two synchronous launch faults still make exactly two attempts without retry', () => {
  const source = `
    import { mock } from 'node:test';
    import assert from 'node:assert/strict';
    const summary = Object.freeze(${JSON.stringify(CHILD_SUMMARY)});
    let calls = 0;
    mock.module(${JSON.stringify(DURABLE_DEMO_URL)}, {
      namedExports: {
        runDurableServiceCreditLoopbackDemo() {
          calls += 1;
          if (calls <= 2) throw new Error('private launch detail');
          return Promise.resolve(summary);
        },
      },
    });
    const pilot = await import(${JSON.stringify(CORE_URL)} + '?two-sync-faults');
    await assert.rejects(
      () => pilot.runDurableServiceCreditLocalLoadPilot(),
      error => error?.code === 'SERVICE_CREDIT_DURABLE_LOCAL_LOAD_PILOT_FAILED',
    );
    assert.equal(calls, 2);
    await pilot.runDurableServiceCreditLocalLoadPilot();
    assert.equal(calls, 4);
    process.stdout.write('TWO_SYNC_ATTEMPTS=PASS\\n');
  `;
  assertChildPass(moduleMockChild(source), 'TWO_SYNC_ATTEMPTS=PASS\n');
});

test('a retained never-settling second lane holds the latch after a first-lane fault', () => {
  const source = `
    import { mock } from 'node:test';
    let calls = 0;
    mock.module(${JSON.stringify(DURABLE_DEMO_URL)}, {
      namedExports: {
        runDurableServiceCreditLoopbackDemo() {
          calls += 1;
          if (calls === 1) throw new Error('private first-lane detail');
          return new Promise(() => {});
        },
      },
    });
    const pilot = await import(${JSON.stringify(CORE_URL)} + '?sync-then-never');
    let settled = false;
    const operation = pilot.runDurableServiceCreditLocalLoadPilot();
    operation.then(() => { settled = true; }, () => { settled = true; });
    await new Promise(resolveImmediate => setImmediate(resolveImmediate));
    let overlapFailed = false;
    try { await pilot.runDurableServiceCreditLocalLoadPilot(); }
    catch (error) { overlapFailed = error?.code === 'SERVICE_CREDIT_DURABLE_LOCAL_LOAD_PILOT_FAILED'; }
    if (calls !== 2 || settled || !overlapFailed) process.exit(1);
    process.stdout.write('SYNC_THEN_NEVER=PASS\\n');
  `;
  assertChildPass(moduleMockChild(source), 'SYNC_THEN_NEVER=PASS\n');
});

test('a hostile non-Promise thenable is never assimilated and cannot skip the other lane', () => {
  const source = `
    import { mock } from 'node:test';
    import assert from 'node:assert/strict';
    const summary = Object.freeze(${JSON.stringify(CHILD_SUMMARY)});
    let calls = 0;
    let thenReads = 0;
    let release;
    const delayed = new Promise(resolve => { release = () => resolve(summary); });
    const hostile = {};
    Object.defineProperty(hostile, 'then', {
      get() { thenReads += 1; throw new Error('private then detail'); },
    });
    mock.module(${JSON.stringify(DURABLE_DEMO_URL)}, {
      namedExports: {
        runDurableServiceCreditLoopbackDemo() {
          calls += 1;
          return calls === 1 ? hostile : delayed;
        },
      },
    });
    const pilot = await import(${JSON.stringify(CORE_URL)} + '?hostile-thenable');
    let settled = false;
    const operation = pilot.runDurableServiceCreditLocalLoadPilot();
    operation.then(() => { settled = true; }, () => { settled = true; });
    await new Promise(resolveImmediate => setImmediate(resolveImmediate));
    assert.equal(calls, 2);
    assert.equal(thenReads, 0);
    assert.equal(settled, false);
    release();
    await assert.rejects(
      operation,
      error => error?.code === 'SERVICE_CREDIT_DURABLE_LOCAL_LOAD_PILOT_FAILED',
    );
    assert.equal(calls, 2);
    assert.equal(thenReads, 0);
    process.stdout.write('HOSTILE_THENABLE=PASS\\n');
  `;
  assertChildPass(moduleMockChild(source), 'HOSTILE_THENABLE=PASS\n');
});

test('a synchronous second-lane fault still drains the already-started lane', () => {
  const source = `
    import { mock } from 'node:test';
    import assert from 'node:assert/strict';
    const summary = Object.freeze(${JSON.stringify(CHILD_SUMMARY)});
    let calls = 0;
    let release;
    const first = new Promise(resolve => { release = () => resolve(summary); });
    mock.module(${JSON.stringify(DURABLE_DEMO_URL)}, {
      namedExports: {
        runDurableServiceCreditLoopbackDemo() {
          calls += 1;
          if (calls === 1) return first;
          throw new Error('private start detail');
        },
      },
    });
    const pilot = await import(${JSON.stringify(CORE_URL)} + '?sync-start-fault');
    let settled = false;
    const operation = pilot.runDurableServiceCreditLocalLoadPilot();
    operation.then(() => { settled = true; }, () => { settled = true; });
    await new Promise(resolveImmediate => setImmediate(resolveImmediate));
    assert.equal(calls, 2);
    assert.equal(settled, false);
    release();
    await assert.rejects(operation, error => (
      error?.code === 'SERVICE_CREDIT_DURABLE_LOCAL_LOAD_PILOT_FAILED'
      && !Object.hasOwn(error, 'cause')
    ));
    assert.equal(calls, 2);
    process.stdout.write('PARTIAL_START_DRAIN=PASS\\n');
  `;
  assertChildPass(moduleMockChild(source), 'PARTIAL_START_DRAIN=PASS\n');
});

test('the module-local latch rejects overlap and reopens only after complete drain', () => {
  const source = `
    import { mock } from 'node:test';
    import assert from 'node:assert/strict';
    const summary = Object.freeze(${JSON.stringify(CHILD_SUMMARY)});
    let calls = 0;
    let release;
    const barrier = new Promise(resolve => { release = resolve; });
    mock.module(${JSON.stringify(DURABLE_DEMO_URL)}, {
      namedExports: {
        runDurableServiceCreditLoopbackDemo: async () => {
          calls += 1;
          if (calls <= 2) await barrier;
          return summary;
        },
      },
    });
    const pilot = await import(${JSON.stringify(CORE_URL)} + '?latch');
    const first = pilot.runDurableServiceCreditLocalLoadPilot();
    await Promise.resolve();
    assert.equal(calls, 2);
    await assert.rejects(
      () => pilot.runDurableServiceCreditLocalLoadPilot(),
      error => error?.code === 'SERVICE_CREDIT_DURABLE_LOCAL_LOAD_PILOT_FAILED',
    );
    assert.equal(calls, 2);
    release();
    await first;
    await pilot.runDurableServiceCreditLocalLoadPilot();
    assert.equal(calls, 4);
    process.stdout.write('LATCH=PASS\\n');
  `;
  assertChildPass(moduleMockChild(source), 'LATCH=PASS\n');
});

test('a never-settling lane reports no completion and retains the latch', () => {
  const source = `
    import { mock } from 'node:test';
    let calls = 0;
    mock.module(${JSON.stringify(DURABLE_DEMO_URL)}, {
      namedExports: {
        runDurableServiceCreditLoopbackDemo: async () => {
          calls += 1;
          return new Promise(() => {});
        },
      },
    });
    const pilot = await import(${JSON.stringify(CORE_URL)} + '?never-settling');
    let settled = false;
    const operation = pilot.runDurableServiceCreditLocalLoadPilot();
    operation.then(() => { settled = true; }, () => { settled = true; });
    await new Promise(resolveImmediate => setImmediate(resolveImmediate));
    let overlapFailed = false;
    try { await pilot.runDurableServiceCreditLocalLoadPilot(); }
    catch (error) { overlapFailed = error?.code === 'SERVICE_CREDIT_DURABLE_LOCAL_LOAD_PILOT_FAILED'; }
    if (calls !== 2 || settled || !overlapFailed) process.exit(1);
    process.stdout.write('NEVER_SETTLING=PASS\\n');
  `;
  assertChildPass(moduleMockChild(source), 'NEVER_SETTLING=PASS\n');
});

test('malformed and hostile child summaries cannot forge aggregate success', () => {
  const cases = [
    {
      name: 'wrong-value',
      setup: `candidate = Object.freeze({ ...valid, applicationCallbacks: 4 });`,
    },
    {
      name: 'negative-zero',
      setup: `candidate = Object.freeze({ ...valid, unitsHeld: -0 });`,
    },
    {
      name: 'accessor',
      setup: `
        candidate = { ...valid };
        Object.defineProperty(candidate, 'applicationCallbacks', {
          enumerable: true,
          configurable: true,
          get() { effects += 1; return 3; },
        });
        Object.freeze(candidate);
      `,
    },
    {
      name: 'trap-throwing-proxy',
      setup: `
        candidate = new Proxy(Object.freeze({ ...valid }), {
          ownKeys() { effects += 1; throw new Error('private trap'); },
        });
      `,
    },
    {
      name: 'unfrozen',
      setup: `candidate = { ...valid };`,
    },
  ];
  for (const current of cases) {
    const source = `
      import { mock } from 'node:test';
      const valid = ${JSON.stringify(CHILD_SUMMARY)};
      let candidate;
      let effects = 0;
      let calls = 0;
      ${current.setup}
      mock.module(${JSON.stringify(DURABLE_DEMO_URL)}, {
        namedExports: {
          runDurableServiceCreditLoopbackDemo: async () => {
            calls += 1;
            return candidate;
          },
        },
      });
      const pilot = await import(${JSON.stringify(CORE_URL)} + '?hostile-${current.name}');
      let fixed = false;
      try { await pilot.runDurableServiceCreditLocalLoadPilot(); }
      catch (error) {
        fixed = error?.code === 'SERVICE_CREDIT_DURABLE_LOCAL_LOAD_PILOT_FAILED'
          && error?.stack === 'DurableServiceCreditLocalLoadPilotError: SERVICE_CREDIT_DURABLE_LOCAL_LOAD_PILOT_FAILED'
          && !Object.hasOwn(error, 'cause');
      }
      if (!fixed || calls !== 2 || effects !== 0) process.exit(1);
      process.stdout.write('HOSTILE_SUMMARY=PASS\\n');
    `;
    assertChildPass(moduleMockChild(source), 'HOSTILE_SUMMARY=PASS\n');
  }
});

test('post-import Promise species mutation rejects before either lane starts', () => {
  const source = `
    import { mock } from 'node:test';
    import assert from 'node:assert/strict';
    const summary = Object.freeze(${JSON.stringify(CHILD_SUMMARY)});
    let calls = 0;
    mock.module(${JSON.stringify(DURABLE_DEMO_URL)}, {
      namedExports: {
        runDurableServiceCreditLoopbackDemo: async () => {
          calls += 1;
          return summary;
        },
      },
    });
    const pilot = await import(${JSON.stringify(CORE_URL)} + '?species-preflight');
    const originalSpecies = Object.getOwnPropertyDescriptor(Promise, Symbol.species);
    let operation;
    try {
      Object.defineProperty(Promise, Symbol.species, {
        configurable: true,
        get() { throw new Error('private species detail'); },
      });
      operation = pilot.runDurableServiceCreditLocalLoadPilot();
    } finally {
      Object.defineProperty(Promise, Symbol.species, originalSpecies);
    }
    await assert.rejects(operation, error => (
      error?.code === 'SERVICE_CREDIT_DURABLE_LOCAL_LOAD_PILOT_FAILED'
      && !Object.hasOwn(error, 'cause')
    ));
    assert.equal(calls, 0);
    await pilot.runDurableServiceCreditLocalLoadPilot();
    assert.equal(calls, 2);
    process.stdout.write('SPECIES_PREFLIGHT=PASS\\n');
  `;
  assertChildPass(moduleMockChild(source), 'SPECIES_PREFLIGHT=PASS\n');
});

test('temporary scheduling mutation during both calls cannot skip real outcomes', () => {
  const source = `
    import { mock } from 'node:test';
    import assert from 'node:assert/strict';
    const summary = Object.freeze(${JSON.stringify(CHILD_SUMMARY)});
    const originalSpecies = Object.getOwnPropertyDescriptor(Promise, Symbol.species);
    const originalConstructor = Object.getOwnPropertyDescriptor(Promise.prototype, 'constructor');
    let calls = 0;
    let releaseFirst;
    let releaseSecond;
    const first = new Promise(resolve => { releaseFirst = () => resolve(summary); });
    const second = new Promise(resolve => { releaseSecond = () => resolve(summary); });
    mock.module(${JSON.stringify(DURABLE_DEMO_URL)}, {
      namedExports: {
        runDurableServiceCreditLoopbackDemo() {
          calls += 1;
          if (calls === 1) {
            Object.defineProperty(Promise, Symbol.species, {
              configurable: true,
              get() { throw new Error('private species detail'); },
            });
            return first;
          }
          Object.defineProperty(Promise, Symbol.species, originalSpecies);
          Object.defineProperty(Promise.prototype, 'constructor', {
            configurable: true,
            enumerable: false,
            writable: true,
            value: null,
          });
          Object.defineProperty(Promise.prototype, 'constructor', originalConstructor);
          return second;
        },
      },
    });
    const pilot = await import(${JSON.stringify(CORE_URL)} + '?temporary-scheduling-mutation');
    let settled = false;
    const operation = pilot.runDurableServiceCreditLocalLoadPilot();
    operation.then(() => { settled = true; }, () => { settled = true; });
    await new Promise(resolveImmediate => setImmediate(resolveImmediate));
    assert.equal(calls, 2);
    assert.equal(settled, false);
    await assert.rejects(
      () => pilot.runDurableServiceCreditLocalLoadPilot(),
      error => error?.code === 'SERVICE_CREDIT_DURABLE_LOCAL_LOAD_PILOT_FAILED',
    );
    releaseFirst();
    await new Promise(resolveImmediate => setImmediate(resolveImmediate));
    assert.equal(settled, false);
    releaseSecond();
    const result = await operation;
    assert.equal(result.applicationCallbacks, 6);
    assert.equal(calls, 2);
    process.stdout.write('TEMPORARY_SCHEDULING_MUTATION=PASS\\n');
  `;
  assertChildPass(moduleMockChild(source), 'TEMPORARY_SCHEDULING_MUTATION=PASS\n');
});

test('persistent runner-induced scheduling mutation observes rejecting lanes before quarantine', () => {
  const source = `
    import { mock } from 'node:test';
    const originalConstructor = Object.getOwnPropertyDescriptor(Promise.prototype, 'constructor');
    let calls = 0;
    let constructorReads = 0;
    let rejectFirst;
    let rejectSecond;
    let unhandled = 0;
    const first = new Promise((resolve, reject) => {
      rejectFirst = () => reject(new Error('private first-lane detail'));
    });
    const second = new Promise((resolve, reject) => {
      rejectSecond = () => reject(new Error('private second-lane detail'));
    });
    const onUnhandled = () => { unhandled += 1; };
    process.on('unhandledRejection', onUnhandled);
    mock.module(${JSON.stringify(DURABLE_DEMO_URL)}, {
      namedExports: {
        runDurableServiceCreditLoopbackDemo() {
          calls += 1;
          if (calls === 1) {
            Object.defineProperty(Promise.prototype, 'constructor', {
              configurable: true,
              enumerable: false,
              get() {
                constructorReads += 1;
                throw new Error('private inherited-constructor detail');
              },
            });
            return first;
          }
          return second;
        },
      },
    });
    const pilot = await import(${JSON.stringify(CORE_URL)} + '?persistent-scheduling-mutation');
    let settled = false;
    let operation;
    try {
      operation = pilot.runDurableServiceCreditLocalLoadPilot();
    } finally {
      Object.defineProperty(Promise.prototype, 'constructor', originalConstructor);
    }
    operation.then(() => { settled = true; }, () => { settled = true; });
    if (calls !== 2) process.exit(1);
    rejectFirst();
    rejectSecond();
    await new Promise(resolveImmediate => setImmediate(resolveImmediate));
    await new Promise(resolveImmediate => setImmediate(resolveImmediate));
    let overlapFailed = false;
    try { await pilot.runDurableServiceCreditLocalLoadPilot(); }
    catch (error) { overlapFailed = error?.code === 'SERVICE_CREDIT_DURABLE_LOCAL_LOAD_PILOT_FAILED'; }
    process.removeListener('unhandledRejection', onUnhandled);
    if (
      calls !== 2
      || constructorReads !== 0
      || settled
      || !overlapFailed
      || unhandled !== 0
    ) process.exit(1);
    process.stdout.write('PERSISTENT_SCHEDULING_MUTATION=PASS\\n');
  `;
  assertChildPass(moduleMockChild(source), 'PERSISTENT_SCHEDULING_MUTATION=PASS\n');
});

test('unsafe native Promise shapes remain unobserved and hold pilot admission', () => {
  const cases = [
    {
      name: 'subclass',
      setup: `
        class ChildPromise extends Promise {}
        unsafe = new ChildPromise(resolve => { releaseUnsafe = () => resolve(summary); });
      `,
    },
    {
      name: 'cross-realm',
      importLine: `import { runInNewContext } from 'node:vm';`,
      setup: `unsafe = runInNewContext('Promise.resolve()');`,
    },
    {
      name: 'own-constructor',
      setup: `
        unsafe = new Promise(resolve => { releaseUnsafe = () => resolve(summary); });
        Object.defineProperty(unsafe, 'constructor', { value: Promise });
      `,
    },
    {
      name: 'nonextensible',
      setup: `
        unsafe = new Promise(resolve => { releaseUnsafe = () => resolve(summary); });
        Object.preventExtensions(unsafe);
      `,
    },
    {
      name: 'own-then-accessor',
      setup: `
        unsafe = new Promise(resolve => { releaseUnsafe = () => resolve(summary); });
        Object.defineProperty(unsafe, 'then', {
          get() { hooks += 1; throw new Error('private then detail'); },
        });
      `,
    },
    {
      name: 'proxy',
      setup: `
        const target = new Promise(resolve => { releaseUnsafe = () => resolve(summary); });
        unsafe = new Proxy(target, {
          get() { hooks += 1; throw new Error('private proxy detail'); },
        });
      `,
    },
  ];
  for (const current of cases) {
    const source = `
      import { mock } from 'node:test';
      ${current.importLine ?? ''}
      const summary = Object.freeze(${JSON.stringify(CHILD_SUMMARY)});
      let calls = 0;
      let hooks = 0;
      let releaseSafe;
      let releaseUnsafe = () => {};
      let unsafe;
      ${current.setup}
      const safe = new Promise(resolve => { releaseSafe = () => resolve(summary); });
      mock.module(${JSON.stringify(DURABLE_DEMO_URL)}, {
        namedExports: {
          runDurableServiceCreditLoopbackDemo() {
            calls += 1;
            return calls === 1 ? unsafe : safe;
          },
        },
      });
      const pilot = await import(${JSON.stringify(CORE_URL)} + '?unsafe-${current.name}');
      let settled = false;
      const operation = pilot.runDurableServiceCreditLocalLoadPilot();
      operation.then(() => { settled = true; }, () => { settled = true; });
      releaseUnsafe();
      releaseSafe();
      await new Promise(resolveImmediate => setImmediate(resolveImmediate));
      let overlapFailed = false;
      try { await pilot.runDurableServiceCreditLocalLoadPilot(); }
      catch (error) { overlapFailed = error?.code === 'SERVICE_CREDIT_DURABLE_LOCAL_LOAD_PILOT_FAILED'; }
      if (calls !== 2 || hooks !== 0 || settled || !overlapFailed) process.exit(1);
      process.stdout.write('UNSAFE_PROMISE_SHAPE=PASS\\n');
    `;
    assertChildPass(moduleMockChild(source), 'UNSAFE_PROMISE_SHAPE=PASS\n');
  }
});

test('captured dispatch resists exercised post-import intrinsic replacement', () => {
  const source = `
    import { mock } from 'node:test';
    import { types as utilTypes } from 'node:util';
    const summary = Object.freeze(${JSON.stringify(CHILD_SUMMARY)});
    let calls = 0;
    mock.module(${JSON.stringify(DURABLE_DEMO_URL)}, {
      namedExports: {
        runDurableServiceCreditLoopbackDemo: async () => {
          calls += 1;
          return summary;
        },
      },
    });
    const pilot = await import(${JSON.stringify(CORE_URL)} + '?intrinsics');
    const originals = {
      arrayIsArray: Array.isArray,
      objectFreeze: Object.freeze,
      objectHasOwn: Object.hasOwn,
      objectIs: Object.is,
      objectIsFrozen: Object.isFrozen,
      reflectApply: Reflect.apply,
      reflectDescriptor: Reflect.getOwnPropertyDescriptor,
      reflectPrototype: Reflect.getPrototypeOf,
      reflectOwnKeys: Reflect.ownKeys,
      isPromise: utilTypes.isPromise,
      isProxy: utilTypes.isProxy,
      zero: Object.getOwnPropertyDescriptor(Object.prototype, '0'),
    };
    let hooks = 0;
    try {
      Array.isArray = () => { hooks += 1; return false; };
      Object.freeze = value => { hooks += 1; return value; };
      Object.hasOwn = () => { hooks += 1; return true; };
      Object.is = () => { hooks += 1; return true; };
      Object.isFrozen = () => { hooks += 1; return true; };
      Reflect.apply = () => { hooks += 1; throw new Error('private apply hook'); };
      Reflect.getOwnPropertyDescriptor = () => { hooks += 1; throw new Error('private descriptor hook'); };
      Reflect.getPrototypeOf = () => { hooks += 1; return null; };
      Reflect.ownKeys = () => { hooks += 1; return []; };
      utilTypes.isPromise = () => { hooks += 1; return false; };
      utilTypes.isProxy = () => { hooks += 1; return true; };
      Object.defineProperty(Object.prototype, '0', {
        configurable: true,
        set() { hooks += 1; },
      });
      const result = await pilot.runDurableServiceCreditLocalLoadPilot();
      if (result !== result || result.pilotVersion !== 1 || result.applicationCallbacks !== 6) {
        process.exit(1);
      }
    } finally {
      Array.isArray = originals.arrayIsArray;
      Object.freeze = originals.objectFreeze;
      Object.hasOwn = originals.objectHasOwn;
      Object.is = originals.objectIs;
      Object.isFrozen = originals.objectIsFrozen;
      Reflect.apply = originals.reflectApply;
      Reflect.getOwnPropertyDescriptor = originals.reflectDescriptor;
      Reflect.getPrototypeOf = originals.reflectPrototype;
      Reflect.ownKeys = originals.reflectOwnKeys;
      utilTypes.isPromise = originals.isPromise;
      utilTypes.isProxy = originals.isProxy;
      if (originals.zero) Object.defineProperty(Object.prototype, '0', originals.zero);
      else delete Object.prototype[0];
    }
    if (calls !== 2 || hooks !== 0) process.exit(1);
    process.stdout.write('CAPTURED_INTRINSICS=PASS\\n');
  `;
  assertChildPass(moduleMockChild(source), 'CAPTURED_INTRINSICS=PASS\n');
});

test('real two-lane pilot returns the fixed aggregate and cleans every owned artifact', {
  timeout: 30_000,
}, async () => {
  await withTempParent(async parent => {
    const module = await import(`${CORE_URL}?real-two-lane`);
    const serversBefore = process._getActiveHandles().filter(value => value instanceof Server).length;
    const result = await module.runDurableServiceCreditLocalLoadPilot();
    let serversAfter = process._getActiveHandles().filter(value => value instanceof Server).length;
    for (let turn = 0; turn < 100 && serversAfter !== serversBefore; turn += 1) {
      await new Promise(resolveImmediate => setImmediate(resolveImmediate));
      serversAfter = process._getActiveHandles().filter(value => value instanceof Server).length;
    }
    assert.deepEqual(result, EXPECTED_RESULT);
    assert.equal(Object.isFrozen(result), true);
    assert.deepEqual(Reflect.ownKeys(result), Reflect.ownKeys(EXPECTED_RESULT));
    assert.equal(Object.values(result).every(value => Object(value) !== value), true);
    assert.equal(serversAfter, serversBefore);
    assert.deepEqual(readdirSync(parent), []);
  });
});

test('CLI emits fixed lines, accepts no arguments, and cleans real pilot state', {
  timeout: 30_000,
}, () => {
  const successParent = privateTempParent('service-credit-durable-load-pilot-cli-success-');
  const failureParent = privateTempParent('service-credit-durable-load-pilot-cli-failure-');
  try {
    const success = spawnSync(process.execPath, [CLI_PATH], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: successParent },
      timeout: 25_000,
    });
    assert.equal(success.status, 0);
    assert.equal(success.stdout, SUCCESS_OUTPUT);
    assert.equal(success.stderr, '');
    assert.deepEqual(readdirSync(successParent), []);

    const failure = spawnSync(process.execPath, [CLI_PATH, 'unexpected'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: failureParent },
      timeout: 5_000,
    });
    assert.notEqual(failure.status, 0);
    assert.equal(failure.stdout, '');
    assert.equal(failure.stderr, FAILURE_OUTPUT);
    assert.deepEqual(readdirSync(failureParent), []);
  } finally {
    rmSync(successParent, { recursive: true, force: true });
    rmSync(failureParent, { recursive: true, force: true });
  }
});

test('CLI short and closed descriptor behavior remains fixed and fail-closed', () => {
  for (const mode of ['short-stdout', 'short-stderr', 'closed-stderr']) {
    const source = `
      import { mock } from 'node:test';
      import * as originalFs from 'node:fs';
      const mode = ${JSON.stringify(mode)};
      mock.module(${JSON.stringify(CORE_URL)}, {
        namedExports: {
          runDurableServiceCreditLocalLoadPilot: async () => (${JSON.stringify(EXPECTED_RESULT)}),
        },
      });
      if (mode === 'short-stdout' || mode === 'short-stderr') {
        const writeSync = (descriptor, buffer, offset, length, ...rest) => {
          const target = mode === 'short-stdout' ? 1 : 2;
          if (descriptor === target) return Math.max(0, length - 1);
          return originalFs.writeSync(descriptor, buffer, offset, length, ...rest);
        };
        mock.module('node:fs', { namedExports: { writeSync } });
      } else {
        originalFs.closeSync(2);
      }
      process.argv = mode === 'short-stdout'
        ? [process.execPath, ${JSON.stringify(CLI_PATH)}]
        : [process.execPath, ${JSON.stringify(CLI_PATH)}, 'unexpected'];
      await import(${JSON.stringify(CLI_URL)} + '?descriptor-' + mode);
      await new Promise(resolveImmediate => setImmediate(resolveImmediate));
      if (process.exitCode !== 1) process.exit(2);
    `;
    const result = moduleMockChild(source, {
      stdio: mode === 'closed-stderr' ? ['ignore', 'pipe', 'ignore'] : undefined,
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout.toString(), '');
    if (mode === 'short-stdout') assert.equal(result.stderr, FAILURE_OUTPUT);
    if (mode === 'short-stderr') {
      assert.notEqual(result.stderr, FAILURE_OUTPUT);
      assert.equal(FAILURE_OUTPUT.startsWith(result.stderr), true);
    }
  }
});

test('CLI intrinsically reports failures after post-import Promise poisoning', () => {
  for (const mode of ['constructor', 'species']) {
    const source = `
      import { readFileSync } from 'node:fs';
      import { types as utilTypes } from 'node:util';
      import { createContext, runInContext } from 'node:vm';
      const mode = ${JSON.stringify(mode)};
      const output = { stdout: '', stderr: '' };
      let poisonReads = 0;
      const cliProcess = { argv: ['node', 'cli'], exitCode: undefined };
      let ContextError;
      let ContextObject;
      let ContextPromise;
      let ContextSymbol;
      const context = createContext({
        Buffer,
        process: cliProcess,
        __testUtilTypes: utilTypes,
        __testWriteSync(descriptor, bytes, offset, length) {
          const chunk = Buffer.from(bytes).subarray(offset, offset + length).toString('utf8');
          if (descriptor === 1) output.stdout += chunk;
          else if (descriptor === 2) output.stderr += chunk;
          else throw new Error('unexpected descriptor');
          return length;
        },
        __testRunPilot() {
          if (mode === 'constructor') {
            ContextObject.defineProperty(ContextPromise.prototype, 'constructor', {
              configurable: true,
              enumerable: false,
              get() {
                poisonReads += 1;
                throw new ContextError('private inherited-constructor detail');
              },
            });
          } else {
            ContextObject.defineProperty(ContextPromise, ContextSymbol.species, {
              configurable: true,
              get() {
                poisonReads += 1;
                throw new ContextError('private species detail');
              },
            });
          }
          return ContextPromise.reject(
            new ContextError('private imported-runner rejection detail'),
          );
        },
      });
      ContextError = runInContext('Error', context);
      ContextObject = runInContext('Object', context);
      ContextPromise = runInContext('Promise', context);
      ContextSymbol = runInContext('Symbol', context);
      const target = mode === 'constructor' ? ContextPromise.prototype : ContextPromise;
      const key = mode === 'constructor' ? 'constructor' : ContextSymbol.species;
      const originalDescriptor = ContextObject.getOwnPropertyDescriptor(target, key);
      const fsImport = ${JSON.stringify("import { writeSync as fsWriteSync } from 'node:fs';\n")};
      const utilImport = ${JSON.stringify("import { types as utilTypes } from 'node:util';\n")};
      const coreImport = ${JSON.stringify("import {\n  runDurableServiceCreditLocalLoadPilot,\n} from './service-credit-durable-local-load-pilot.js';\n")};
      const rawSource = readFileSync(${JSON.stringify(CLI_PATH)}, 'utf8');
      if (
        rawSource.split(fsImport).length !== 2
        || rawSource.split(utilImport).length !== 2
        || rawSource.split(coreImport).length !== 2
      ) process.exit(1);
      const cliSource = rawSource
        .replace(fsImport, 'const fsWriteSync = globalThis.__testWriteSync;\\n')
        .replace(utilImport, 'const utilTypes = globalThis.__testUtilTypes;\\n')
        .replace(
          coreImport,
          'const runDurableServiceCreditLocalLoadPilot = globalThis.__testRunPilot;\\n',
        );
      let unhandled = 0;
      const onUnhandled = () => { unhandled += 1; };
      process.on('unhandledRejection', onUnhandled);
      let evaluationRejected = false;
      try {
        runInContext(cliSource, context, { filename: 'cli-under-test.js' });
      } catch {
        evaluationRejected = true;
      } finally {
        ContextObject.defineProperty(target, key, originalDescriptor);
      }
      await new Promise(resolveImmediate => setImmediate(resolveImmediate));
      await new Promise(resolveImmediate => setImmediate(resolveImmediate));
      process.removeListener('unhandledRejection', onUnhandled);
      if (
        evaluationRejected
        || cliProcess.exitCode !== 1
        || output.stdout !== ''
        || output.stderr !== ${JSON.stringify(FAILURE_OUTPUT)}
        || poisonReads !== 0
        || unhandled !== 0
      ) process.exit(1);
      process.stdout.write('CLI_INTRINSIC_AWAIT=PASS\\n');
    `;
    const result = spawnSync(process.execPath, [
      '--no-warnings',
      '--input-type=module',
      '--eval',
      source,
    ], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 20_000,
    });
    assertChildPass(result, 'CLI_INTRINSIC_AWAIT=PASS\n');
  }
});

test('source, package, dependencies, and active import closure remain exact', () => {
  const coreSource = readFileSync(CORE_PATH, 'utf8');
  const cliSource = readFileSync(CLI_PATH, 'utf8');
  assert.deepEqual(staticImportSpecifiers(coreSource).sort(), [
    './service-credit-durable-loopback-demo.js',
    'node:util',
  ]);
  assert.deepEqual(staticImportSpecifiers(cliSource).sort(), [
    './service-credit-durable-local-load-pilot.js',
    'node:fs',
    'node:util',
  ]);
  assert.doesNotMatch(
    coreSource,
    /\b(?:fetch|WebSocket|worker_threads|child_process|wallet|rpc|setTimeout|setInterval)\b/i,
  );
  assert.doesNotMatch(coreSource, /console\.|process\.(?:stdout|stderr)|Promise\.race/);
  assert.match(coreSource, /const LANE_COUNT = 2;/);
  assert.match(coreSource, /settleEveryStartedLane/);
  assert.doesNotMatch(cliSource, /\.then\s*\(|\.catch\s*\(|\.finally\s*\(/);
  assert.doesNotMatch(
    cliSource,
    /Promise\.prototype\.(?:then|catch|finally)|PROMISE_(?:THEN|CATCH|FINALLY)/,
  );
  assert.doesNotMatch(cliSource, /async function main\(\)/);
  assert.match(cliSource, /async function report\(\)/);
  const mainCallIndex = cliSource.indexOf('const completion = main();');
  const pinIndex = cliSource.indexOf('pinPilotPromise(completion)');
  const awaitIndex = cliSource.indexOf('await completion;');
  assert.equal(mainCallIndex >= 0, true);
  assert.equal(mainCallIndex < pinIndex, true);
  assert.equal(pinIndex < awaitIndex, true);

  const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(
    packageJson.scripts['pilot:service-credit-durable-local-load'],
    'node src/service-credit-durable-local-load-pilot-cli.js',
  );
  assert.deepEqual(Object.keys(packageJson.dependencies).sort(), [
    '@noble/ed25519',
    '@noble/hashes',
    'znn-typescript-sdk',
  ]);
  assert.deepEqual(Object.keys(packageJson.devDependencies), ['@x402/core']);

  for (const relativePath of [
    'src/demo.js',
    'src/server-cli.js',
    'src/buyer.js',
    'src/buyer-cli.js',
    'src/resource-server.js',
    'src/service-credit-http.js',
    'src/service-credit-composition.js',
    'src/service-credit-loopback-server.js',
    'src/service-credit-durable-loopback-demo.js',
  ]) {
    assert.equal(
      readFileSync(join(ROOT, relativePath), 'utf8').includes(
        'service-credit-durable-local-load-pilot',
      ),
      false,
    );
  }
});
