import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { Server } from 'node:http';
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  runDurableServiceCreditLoopbackDemo,
} from '../src/service-credit-durable-loopback-demo.js';

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(TEST_DIRECTORY, '..');
const CORE_PATH = join(ROOT, 'src', 'service-credit-durable-loopback-demo.js');
const CLI_PATH = join(ROOT, 'src', 'service-credit-durable-loopback-demo-cli.js');
const CORE_URL = pathToFileURL(CORE_PATH).href;
const LOOPBACK_URL = pathToFileURL(join(ROOT, 'src', 'service-credit-loopback-server.js')).href;
const STORE_URL = pathToFileURL(join(ROOT, 'src', 'service-credit-sqlite-store.js')).href;
const MOCK_PAYMENT_URL = pathToFileURL(join(ROOT, 'src', 'mock-payment.js')).href;
const CLIENT_URL = pathToFileURL(join(ROOT, 'src', 'service-credit-client.js')).href;
const SESSION_URL = pathToFileURL(join(ROOT, 'src', 'service-credit-durable-http-session.js')).href;
const EXPECTED_SUMMARY = Object.freeze({
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
const SUCCESS_OUTPUT = 'SERVICE_CREDIT_DURABLE_LOOPBACK_DEMO_SUCCESS\n';
const FAILURE_OUTPUT = 'SERVICE_CREDIT_DURABLE_LOOPBACK_DEMO_FAILED\n';
const MODULE_EDGE_PARSER = [
  "import { readFileSync } from 'node:fs';",
  "import { SourceTextModule } from 'node:vm';",
  "const parsed = new SourceTextModule(readFileSync(0, 'utf8'));",
  'process.stdout.write(JSON.stringify(',
  'parsed.moduleRequests.map(request => request.specifier)',
  '));',
].join('');
const DYNAMIC_IMPORT_GUARD = /\bimport(?:(?:\s+)|(?:\/\*[\s\S]*?\*\/)|(?:\/\/[^\r\n\u2028\u2029]*(?:\r\n?|\n|\u2028|\u2029|$)))*\(/u;

function privateTempParent(prefix = 'service-credit-durable-loopback-demo-test-') {
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
  assert.equal(error?.name, 'DurableServiceCreditLoopbackDemoError');
  assert.equal(error?.code, 'SERVICE_CREDIT_DURABLE_LOOPBACK_DEMO_FAILED');
  assert.equal(error?.message, 'SERVICE_CREDIT_DURABLE_LOOPBACK_DEMO_FAILED');
  assert.equal(
    error?.stack,
    'DurableServiceCreditLoopbackDemoError: SERVICE_CREDIT_DURABLE_LOOPBACK_DEMO_FAILED',
  );
  assert.equal(Object.hasOwn(error, 'cause'), false);
  return true;
}

function directCli(args = [], options = {}) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
  });
}

function moduleMockChild(source, parent) {
  return spawnSync(process.execPath, [
    '--no-warnings',
    '--experimental-test-module-mocks',
    '--input-type=module',
    '--eval',
    source,
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, TMPDIR: parent },
  });
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

function importClosure(entry) {
  const visited = new Set();
  const external = new Set();
  const pending = [entry];
  while (pending.length > 0) {
    const current = pending.pop();
    if (visited.has(current)) continue;
    visited.add(current);
    for (const specifier of staticImportSpecifiers(readFileSync(current, 'utf8'))) {
      if (!specifier.startsWith('.')) {
        external.add(specifier);
        continue;
      }
      const target = resolve(dirname(current), specifier);
      const fromSourceRoot = relative(join(ROOT, 'src'), target);
      assert.equal(
        fromSourceRoot !== ''
          && fromSourceRoot !== '..'
          && !fromSourceRoot.startsWith('../')
          && !isAbsolute(fromSourceRoot),
        true,
      );
      pending.push(target);
    }
  }
  return { external, visited };
}

test('durable loopback demo returns the exact frozen aggregate and cleans owned state', async () => {
  await withTempParent(async parent => {
    const summary = await runDurableServiceCreditLoopbackDemo();
    assert.deepEqual(summary, EXPECTED_SUMMARY);
    assert.equal(Object.isFrozen(summary), true);
    assert.deepEqual(Reflect.ownKeys(summary), Reflect.ownKeys(EXPECTED_SUMMARY));
    assert.equal(Object.values(summary).every(value => Object(value) !== value), true);
    assert.deepEqual(readdirSync(parent), []);
  });
});

test('durable loopback demo rejects arguments before creating state', async () => {
  await withTempParent(async parent => {
    await assert.rejects(() => runDurableServiceCreditLoopbackDemo(undefined), error => {
      assert.equal(error?.code, 'SERVICE_CREDIT_DURABLE_LOOPBACK_DEMO_FAILED');
      assert.equal(error?.message, 'SERVICE_CREDIT_DURABLE_LOOPBACK_DEMO_FAILED');
      assert.equal(Object.hasOwn(error, 'cause'), false);
      return true;
    });
    assert.deepEqual(readdirSync(parent), []);
  });
});

test('durable loopback CLI emits one fixed success line and accepts no arguments', () => {
  const successParent = privateTempParent('service-credit-durable-loopback-cli-success-');
  const failureParent = privateTempParent('service-credit-durable-loopback-cli-failure-');
  try {
    const success = spawnSync(process.execPath, [CLI_PATH], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: successParent },
    });
    assert.equal(success.status, 0);
    assert.equal(success.stdout, SUCCESS_OUTPUT);
    assert.equal(success.stderr, '');
    assert.deepEqual(readdirSync(successParent), []);

    const failure = spawnSync(process.execPath, [CLI_PATH, 'unexpected'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: failureParent },
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

test('package exposes only the explicit non-default durable loopback command', () => {
  const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(
    packageJson.scripts['demo:service-credit-durable-loopback'],
    'node src/service-credit-durable-loopback-demo-cli.js',
  );
  assert.equal(packageJson.scripts.test, 'node --test');
});

test('core import is inert and creates no listener, timer, process listener, or file', () => {
  const parent = privateTempParent('service-credit-durable-loopback-import-');
  try {
    const source = `
      import { Server } from 'node:http';
      import { readdirSync } from 'node:fs';
      const beforeServers = process._getActiveHandles().filter(value => value instanceof Server).length;
      const beforeListeners = new Map(process.eventNames().map(name => [name, process.listenerCount(name)]));
      await import(${JSON.stringify(`${CORE_URL}?inert-import`)});
      await new Promise(resolveImmediate => setImmediate(resolveImmediate));
      const afterServers = process._getActiveHandles().filter(value => value instanceof Server).length;
      const listenersSame = [...beforeListeners].every(([name, count]) => process.listenerCount(name) === count)
        && process.eventNames().every(name => beforeListeners.has(name));
      if (beforeServers !== afterServers || !listenersSame || readdirSync(process.env.TMPDIR).length !== 0) {
        process.exit(1);
      }
      process.stdout.write('IMPORT_INERT=PASS\\n');
    `;
    const result = moduleMockChild(source, parent);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, 'IMPORT_INERT=PASS\n');
    assert.equal(result.stderr, '');
    assert.deepEqual(readdirSync(parent), []);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('two direct CLI runs have byte-identical fixed success output', () => {
  const firstParent = privateTempParent('service-credit-durable-loopback-cli-a-');
  const secondParent = privateTempParent('service-credit-durable-loopback-cli-b-');
  try {
    const first = directCli([], { env: { TMPDIR: firstParent } });
    const second = directCli([], { env: { TMPDIR: secondParent } });
    for (const result of [first, second]) {
      assert.equal(result.status, 0);
      assert.equal(result.stdout, SUCCESS_OUTPUT);
      assert.equal(result.stderr, '');
    }
    assert.equal(first.stdout, second.stdout);
    assert.deepEqual(readdirSync(firstParent), []);
    assert.deepEqual(readdirSync(secondParent), []);
  } finally {
    rmSync(firstParent, { recursive: true, force: true });
    rmSync(secondParent, { recursive: true, force: true });
  }
});

test('closed output descriptors never expose diagnostics or create state', async t => {
  await t.test('closed stdout', async () => {
    const parent = privateTempParent('service-credit-durable-loopback-closed-stdout-');
    try {
      const result = await new Promise((resolveResult, rejectResult) => {
        const child = spawn(process.execPath, [CLI_PATH], {
          cwd: ROOT,
          env: { ...process.env, TMPDIR: parent },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stderr = '';
        child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
        child.once('error', rejectResult);
        child.once('close', (code, signal) => resolveResult({ code, signal, stderr }));
        child.stdout.destroy();
      });
      assert.deepEqual(result, { code: 1, signal: null, stderr: FAILURE_OUTPUT });
      assert.deepEqual(readdirSync(parent), []);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  await t.test('closed stderr and both closed', () => {
    for (const descriptors of [[2], [1, 2]]) {
      const parent = privateTempParent('service-credit-durable-loopback-closed-failure-');
      try {
        const source = `
          import { closeSync } from 'node:fs';
          for (const descriptor of ${JSON.stringify(descriptors)}) closeSync(descriptor);
          process.argv = [process.execPath, ${JSON.stringify(CLI_PATH)}, 'unexpected'];
          await import(${JSON.stringify(`${pathToFileURL(CLI_PATH).href}?closed-${descriptors.join('-')}`)});
          await new Promise(resolveImmediate => setImmediate(resolveImmediate));
        `;
        const result = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
          cwd: ROOT,
          encoding: 'utf8',
          env: { ...process.env, TMPDIR: parent },
          stdio: ['ignore', descriptors.includes(1) ? 'ignore' : 'pipe', descriptors.includes(2) ? 'ignore' : 'pipe'],
        });
        assert.equal(result.status, 1);
        assert.deepEqual(readdirSync(parent), []);
      } finally {
        rmSync(parent, { recursive: true, force: true });
      }
    }
  });
});

test('global external-network hooks are never consulted', async t => {
  const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  const webSocketDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
  let calls = 0;
  const forbidden = () => {
    calls += 1;
    throw new Error('forbidden external network primitive');
  };
  t.after(() => {
    if (fetchDescriptor) Object.defineProperty(globalThis, 'fetch', fetchDescriptor);
    else delete globalThis.fetch;
    if (webSocketDescriptor) Object.defineProperty(globalThis, 'WebSocket', webSocketDescriptor);
    else delete globalThis.WebSocket;
  });
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    enumerable: false,
    writable: true,
    value: forbidden,
  });
  Object.defineProperty(globalThis, 'WebSocket', {
    configurable: true,
    enumerable: false,
    writable: true,
    value: forbidden,
  });
  await withTempParent(async () => {
    assert.deepEqual(await runDurableServiceCreditLoopbackDemo(), EXPECTED_SUMMARY);
  });
  assert.equal(calls, 0);
});

test('retained final ledger independently proves activation, replay, reopen, and durable accounting', () => {
  const parent = privateTempParent('service-credit-durable-loopback-ledger-');
  try {
    const source = `
      import { mock } from 'node:test';
      import * as originalCrypto from 'node:crypto';
      import * as originalFs from 'node:fs';
      import { dirname } from 'node:path';
      import { DatabaseSync } from 'node:sqlite';

      let retainedDatabase = null;
      let settlementCalls = 0;
      let callbackCalls = 0;
      const authorizationAttempts = [];
      const fsNames = [
        'chmodSync', 'closeSync', 'constants', 'fchmodSync', 'fstatSync',
        'fsyncSync', 'lstatSync', 'mkdtempSync', 'openSync', 'readFileSync',
        'readdirSync', 'realpathSync', 'rmdirSync', 'unlinkSync',
      ];
      const fsExports = Object.fromEntries(fsNames.map(key => [key, originalFs[key]]));
      fsExports.unlinkSync = path => {
        if (typeof path === 'string' && path.endsWith('/ledger.sqlite')) {
          retainedDatabase = path;
          throw new Error('synthetic cleanup stop');
        }
        return Reflect.apply(originalFs.unlinkSync, originalFs, [path]);
      };
      mock.module('node:fs', { namedExports: fsExports });

      const originalPayment = await import(${JSON.stringify(MOCK_PAYMENT_URL)});
      const originalSettle = originalPayment.MockExactZenonFacilitator.prototype.settle;
      mock.method(originalPayment.MockExactZenonFacilitator.prototype, 'settle', function instrumentedSettle(...args) {
        settlementCalls += 1;
        return Reflect.apply(originalSettle, this, args);
      });

      const originalSession = await import(${JSON.stringify(`${SESSION_URL}?durable-demo-instrumentation`)});
      const createInstrumentedSession = options => {
        const application = options.execute;
        const inner = originalSession.createDurableServiceCreditHttpSession({
          ...options,
          execute: context => {
            callbackCalls += 1;
            return Reflect.apply(application, undefined, [context]);
          },
        });
        const handle = async (request, response) => {
          const rawHeaders = request?.rawHeaders;
          let authorization = null;
          if (Array.isArray(rawHeaders)) {
            for (let index = 0; index < rawHeaders.length; index += 2) {
              if (String(rawHeaders[index]).toLowerCase() === 'authorization') {
                authorization = rawHeaders[index + 1];
              }
            }
          }
          authorizationAttempts.push(authorization);
          return Reflect.apply(inner.handle, undefined, [request, response]);
        };
        return Object.freeze({ handle: Object.freeze(handle), close: inner.close });
      };
      mock.module(${JSON.stringify(SESSION_URL)}, {
        namedExports: { createDurableServiceCreditHttpSession: createInstrumentedSession },
      });

      const { runDurableServiceCreditLoopbackDemo } = await import(${JSON.stringify(`${CORE_URL}?retained-ledger`)});
      let fixedFailure = false;
      try { await runDurableServiceCreditLoopbackDemo(); } catch (error) {
        fixedFailure = error?.code === 'SERVICE_CREDIT_DURABLE_LOOPBACK_DEMO_FAILED';
      }
      let passed = fixedFailure && retainedDatabase !== null;
      try {
        const bytes = originalFs.readFileSync(retainedDatabase);
        const database = new DatabaseSync(retainedDatabase, { readOnly: true });
        const row = database.prepare(
          'SELECT envelope FROM service_credit_ledger WHERE singleton = 1'
        ).get();
        database.close();
        const envelope = JSON.parse(row.envelope);
        const canonical = value => {
          if (value === null || typeof value !== 'object') return JSON.stringify(value);
          if (Array.isArray(value)) return \`[\${value.map(canonical).join(',')}]\`;
          const keys = Object.keys(value).sort();
          return \`{\${keys.map(key => \`\${JSON.stringify(key)}:\${canonical(value[key])}\`).join(',')}}\`;
        };
        const expectedChecksum = \`sha256:\${originalCrypto.createHash('sha256')
          .update('zenon-x402:service-credit-sqlite-physical-v2')
          .update(String.fromCharCode(0))
          .update(canonical({
            executionState: envelope.executionState,
            ledgerState: envelope.ledgerState,
            physicalVersion: envelope.physicalVersion,
            revision: envelope.revision,
          }))
          .digest('hex')}\`;
        const state = envelope.ledgerState;
        const grant = state?.grants?.[0];
        const executions = envelope.executionState?.executions;
        const frequencies = new Map();
        for (const value of authorizationAttempts) {
          if (typeof value !== 'string') continue;
          frequencies.set(value, (frequencies.get(value) ?? 0) + 1);
          if (bytes.includes(Buffer.from(value, 'utf8'))) passed = false;
        }
        const counts = [...frequencies.values()].sort((left, right) => left - right);
        passed = passed
          && envelope.physicalVersion === 2
          && envelope.revision === 12
          && row.envelope === canonical(envelope)
          && envelope.checksum === expectedChecksum
          && state?.offers?.length === 1
          && state?.grants?.length === 1
          && state?.requests?.length === 3
          && grant?.lifecycle === 'ACTIVE'
          && grant.totalUnits === 7
          && grant.consumedUnits === 6
          && grant.heldUnits === 0
          && grant.availableUnits === 1
          && state.requests.every(request => request.state === 'SUCCEEDED' && request.costUnits === 2)
          && envelope.executionState?.generation?.state === 'OPEN'
          && envelope.executionState?.generation?.seal === null
          && executions?.length === 3
          && executions.every(execution => execution.terminalClassification === 'SUCCEEDED'
            && execution.fencePhase === 'MAY_HAVE_STARTED'
            && typeof execution.resultCommitment === 'string'
            && !Object.hasOwn(execution, 'cachedResult'))
          && settlementCalls === 1
          && callbackCalls === 3
          && authorizationAttempts.length === 6
          && frequencies.size === 3
          && JSON.stringify(counts) === JSON.stringify([1, 2, 3])
          && !JSON.stringify(envelope).includes('ServiceCredit ');
      } catch {
        passed = false;
      }
      if (retainedDatabase !== null) {
        originalFs.rmSync(dirname(retainedDatabase), { recursive: true, force: true });
      }
      if (originalFs.readdirSync(process.env.TMPDIR).length !== 0) passed = false;
      if (!passed) process.exit(1);
      originalFs.writeSync(1, 'DURABLE_LEDGER=PASS\\n');
    `;
    const result = moduleMockChild(source, parent);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, 'DURABLE_LEDGER=PASS\n');
    assert.equal(result.stderr, '');
    assert.deepEqual(readdirSync(parent), []);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('a proxy route descriptor is rejected before traps or request effects', () => {
  const parent = privateTempParent('service-credit-durable-loopback-proxy-route-');
  try {
    const source = `
      import { mock } from 'node:test';
      import * as originalFs from 'node:fs';
      let securityTrapCalls = 0;
      let closeCalls = 0;
      const target = Object.freeze({
        origin: 'http://127.0.0.1:1',
        path: '/service-credit/v1/execute',
      });
      const route = new Proxy(target, {
        get(targetValue, key, receiver) {
          if (key !== 'then') securityTrapCalls += 1;
          return Reflect.get(targetValue, key, receiver);
        },
        getOwnPropertyDescriptor(targetValue, key) {
          securityTrapCalls += 1;
          return Reflect.getOwnPropertyDescriptor(targetValue, key);
        },
        getPrototypeOf(targetValue) {
          securityTrapCalls += 1;
          return Reflect.getPrototypeOf(targetValue);
        },
        ownKeys(targetValue) {
          securityTrapCalls += 1;
          return Reflect.ownKeys(targetValue);
        },
      });
      mock.module(${JSON.stringify(LOOPBACK_URL)}, {
        namedExports: {
          createServiceCreditLoopbackServer: () => Object.freeze({
            start: Object.freeze(async () => route),
            close: Object.freeze(async () => { closeCalls += 1; }),
          }),
        },
      });
      const { runDurableServiceCreditLoopbackDemo } = await import(${JSON.stringify(`${CORE_URL}?proxy-route`)});
      let fixed = false;
      try { await runDurableServiceCreditLoopbackDemo(); } catch (error) {
        fixed = error?.code === 'SERVICE_CREDIT_DURABLE_LOOPBACK_DEMO_FAILED';
      }
      const entries = originalFs.readdirSync(process.env.TMPDIR);
      const retained = entries.length === 1
        && originalFs.readdirSync(process.env.TMPDIR + '/' + entries[0]).includes('ledger.sqlite');
      if (!fixed || securityTrapCalls !== 0 || closeCalls !== 1 || !retained) process.exit(1);
      originalFs.rmSync(process.env.TMPDIR + '/' + entries[0], { recursive: true, force: true });
      originalFs.writeSync(1, 'PROXY_ROUTE_REJECTED=PASS\\n');
    `;
    const result = moduleMockChild(source, parent);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, 'PROXY_ROUTE_REJECTED=PASS\n');
    assert.equal(result.stderr, '');
    assert.deepEqual(readdirSync(parent), []);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('phase-one close uncertainty blocks reopen and preserves the ledger', async t => {
  for (const mode of ['transport', 'session', 'store']) {
    await t.test(mode, () => {
      const parent = privateTempParent(`service-credit-durable-loopback-close-${mode}-`);
      try {
        const source = `
          import { mock } from 'node:test';
          import * as originalFs from 'node:fs';
          const fsNames = [
            'chmodSync', 'closeSync', 'constants', 'fchmodSync', 'fstatSync',
            'fsyncSync', 'lstatSync', 'mkdtempSync', 'openSync', 'readFileSync',
            'readdirSync', 'realpathSync', 'rmdirSync', 'unlinkSync',
          ];
          let unlinkCalls = 0;
          const fsExports = Object.fromEntries(fsNames.map(key => [key, originalFs[key]]));
          fsExports.unlinkSync = (...args) => {
            unlinkCalls += 1;
            return Reflect.apply(originalFs.unlinkSync, originalFs, args);
          };
          mock.module('node:fs', { namedExports: fsExports });

          const originalLoopback = await import(${JSON.stringify(`${LOOPBACK_URL}?close-original-${mode}`)});
          const originalSession = await import(${JSON.stringify(`${SESSION_URL}?close-original-${mode}`)});
          const { ServiceCreditSqliteStore } = await import(${JSON.stringify(STORE_URL)});
          const originalStoreClose = ServiceCreditSqliteStore.prototype.close;
          let storeCloseCalls = 0;
          mock.method(ServiceCreditSqliteStore.prototype, 'close', function observedStoreClose(...args) {
            storeCloseCalls += 1;
            const result = Reflect.apply(originalStoreClose, this, args);
            if (${JSON.stringify(mode)} === 'store' && storeCloseCalls === 1) {
              throw new Error('synthetic store close uncertainty');
            }
            return result;
          });

          let loopbackFactories = 0;
          let loopbackCloseCalls = 0;
          mock.module(${JSON.stringify(LOOPBACK_URL)}, {
            namedExports: {
              createServiceCreditLoopbackServer: options => {
                loopbackFactories += 1;
                const ordinal = loopbackFactories;
                const inner = originalLoopback.createServiceCreditLoopbackServer(options);
                return Object.freeze({
                  start: inner.start,
                  close: Object.freeze(async () => {
                    await inner.close();
                    loopbackCloseCalls += 1;
                    if (${JSON.stringify(mode)} === 'transport' && ordinal === 1) {
                      throw new Error('synthetic transport close uncertainty');
                    }
                  }),
                });
              },
            },
          });

          let sessionFactories = 0;
          let sessionCloseCalls = 0;
          mock.module(${JSON.stringify(SESSION_URL)}, {
            namedExports: {
              createDurableServiceCreditHttpSession: options => {
                sessionFactories += 1;
                const ordinal = sessionFactories;
                const inner = originalSession.createDurableServiceCreditHttpSession(options);
                return Object.freeze({
                  handle: inner.handle,
                  close: Object.freeze(async () => {
                    await inner.close();
                    sessionCloseCalls += 1;
                    if (${JSON.stringify(mode)} === 'session' && ordinal === 1) {
                      throw new Error('synthetic session close uncertainty');
                    }
                  }),
                });
              },
            },
          });

          const { runDurableServiceCreditLoopbackDemo } = await import(${JSON.stringify(`${CORE_URL}?close-${mode}`)});
          let fixed = false;
          try { await runDurableServiceCreditLoopbackDemo(); } catch (error) {
            fixed = error?.code === 'SERVICE_CREDIT_DURABLE_LOOPBACK_DEMO_FAILED';
          }
          const entries = originalFs.readdirSync(process.env.TMPDIR);
          const retained = entries.length === 1
            && originalFs.readdirSync(process.env.TMPDIR + '/' + entries[0]).includes('ledger.sqlite');
          const expectedSessionCloses = ${JSON.stringify(mode)} === 'transport' ? 0 : 1;
          const expectedStoreCloses = ${JSON.stringify(mode)} === 'store' ? 1 : 0;
          const passed = fixed
            && loopbackFactories === 1
            && sessionFactories === 1
            && loopbackCloseCalls === 1
            && sessionCloseCalls === expectedSessionCloses
            && storeCloseCalls === expectedStoreCloses
            && unlinkCalls === 0
            && retained;
          if (entries.length === 1) {
            originalFs.rmSync(process.env.TMPDIR + '/' + entries[0], { recursive: true, force: true });
          }
          if (!passed || originalFs.readdirSync(process.env.TMPDIR).length !== 0) process.exit(1);
          originalFs.writeSync(1, 'CLOSE_UNCERTAINTY=PASS\\n');
        `;
        const result = moduleMockChild(source, parent);
        assert.equal(result.status, 0);
        assert.equal(result.stdout, 'CLOSE_UNCERTAINTY=PASS\n');
        assert.equal(result.stderr, '');
        assert.deepEqual(readdirSync(parent), []);
      } finally {
        rmSync(parent, { recursive: true, force: true });
      }
    });
  }
});

test('a reopen failure is attempted once after clean phase-one closure and preserves state', () => {
  const parent = privateTempParent('service-credit-durable-loopback-reopen-failure-');
  try {
    const source = `
      import { mock } from 'node:test';
      import * as originalFs from 'node:fs';
      const { ServiceCreditSqliteStore } = await import(${JSON.stringify(STORE_URL)});
      const originalClose = ServiceCreditSqliteStore.prototype.close;
      let closeCalls = 0;
      let reopenCalls = 0;
      mock.method(ServiceCreditSqliteStore.prototype, 'close', function countedClose(...args) {
        closeCalls += 1;
        return Reflect.apply(originalClose, this, args);
      });
      mock.method(ServiceCreditSqliteStore, 'openExisting', () => {
        reopenCalls += 1;
        throw new Error('synthetic reopen failure');
      });
      const { runDurableServiceCreditLoopbackDemo } = await import(${JSON.stringify(`${CORE_URL}?reopen-failure`)});
      let fixed = false;
      try { await runDurableServiceCreditLoopbackDemo(); } catch (error) {
        fixed = error?.code === 'SERVICE_CREDIT_DURABLE_LOOPBACK_DEMO_FAILED';
      }
      const entries = originalFs.readdirSync(process.env.TMPDIR);
      const retained = entries.length === 1
        && originalFs.readdirSync(process.env.TMPDIR + '/' + entries[0]).includes('ledger.sqlite');
      const passed = fixed && reopenCalls === 1 && closeCalls === 1 && retained;
      if (entries.length === 1) {
        originalFs.rmSync(process.env.TMPDIR + '/' + entries[0], { recursive: true, force: true });
      }
      if (!passed || originalFs.readdirSync(process.env.TMPDIR).length !== 0) process.exit(1);
      originalFs.writeSync(1, 'REOPEN_FAILURE=PASS\\n');
    `;
    const result = moduleMockChild(source, parent);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, 'REOPEN_FAILURE=PASS\n');
    assert.equal(result.stderr, '');
    assert.deepEqual(readdirSync(parent), []);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('phase-two session construction failure closes the reopened borrowed store and preserves state', () => {
  const parent = privateTempParent('service-credit-durable-loopback-phase-two-session-');
  try {
    const source = `
      import { mock } from 'node:test';
      import * as originalFs from 'node:fs';
      const originalSession = await import(${JSON.stringify(`${SESSION_URL}?phase-two-session-original`)});
      const originalLoopback = await import(${JSON.stringify(`${LOOPBACK_URL}?phase-two-session-original`)});
      const { ServiceCreditSqliteStore } = await import(${JSON.stringify(STORE_URL)});
      const originalClose = ServiceCreditSqliteStore.prototype.close;
      let storeCloseCalls = 0;
      let sessionFactories = 0;
      let loopbackFactories = 0;
      mock.method(ServiceCreditSqliteStore.prototype, 'close', function countedClose(...args) {
        storeCloseCalls += 1;
        return Reflect.apply(originalClose, this, args);
      });
      mock.module(${JSON.stringify(SESSION_URL)}, {
        namedExports: {
          createDurableServiceCreditHttpSession: options => {
            sessionFactories += 1;
            if (sessionFactories === 2) throw new Error('synthetic phase-two session failure');
            return originalSession.createDurableServiceCreditHttpSession(options);
          },
        },
      });
      mock.module(${JSON.stringify(LOOPBACK_URL)}, {
        namedExports: {
          createServiceCreditLoopbackServer: options => {
            loopbackFactories += 1;
            return originalLoopback.createServiceCreditLoopbackServer(options);
          },
        },
      });
      const { runDurableServiceCreditLoopbackDemo } = await import(${JSON.stringify(`${CORE_URL}?phase-two-session-failure`)});
      let fixed = false;
      try { await runDurableServiceCreditLoopbackDemo(); } catch (error) {
        fixed = error?.code === 'SERVICE_CREDIT_DURABLE_LOOPBACK_DEMO_FAILED';
      }
      const entries = originalFs.readdirSync(process.env.TMPDIR);
      const retained = entries.length === 1
        && originalFs.readdirSync(process.env.TMPDIR + '/' + entries[0]).includes('ledger.sqlite');
      const passed = fixed
        && sessionFactories === 2
        && loopbackFactories === 1
        && storeCloseCalls === 2
        && retained;
      if (entries.length === 1) {
        originalFs.rmSync(process.env.TMPDIR + '/' + entries[0], { recursive: true, force: true });
      }
      if (!passed || originalFs.readdirSync(process.env.TMPDIR).length !== 0) process.exit(1);
      originalFs.writeSync(1, 'PHASE_TWO_CONSTRUCTION=PASS\\n');
    `;
    const result = moduleMockChild(source, parent);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, 'PHASE_TWO_CONSTRUCTION=PASS\n');
    assert.equal(result.stderr, '');
    assert.deepEqual(readdirSync(parent), []);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('phase boundary rejects database substitution, hard links, and sidecars before reopen', async t => {
  for (const mode of ['replacement', 'symlink', 'hardlink', 'sidecar']) {
    await t.test(mode, () => {
      const parent = privateTempParent(`service-credit-durable-loopback-boundary-${mode}-`);
      try {
        const source = `
          import { mock } from 'node:test';
          import * as originalFs from 'node:fs';
          import { join } from 'node:path';
          const { ServiceCreditSqliteStore } = await import(${JSON.stringify(STORE_URL)});
          const originalClose = ServiceCreditSqliteStore.prototype.close;
          const originalOpen = ServiceCreditSqliteStore.openExisting;
          let closeCalls = 0;
          let openCalls = 0;
          let tampered = false;
          mock.method(ServiceCreditSqliteStore, 'openExisting', function countedOpen(...args) {
            openCalls += 1;
            return Reflect.apply(originalOpen, this, args);
          });
          mock.method(ServiceCreditSqliteStore.prototype, 'close', function tamperAfterClose(...args) {
            closeCalls += 1;
            const result = Reflect.apply(originalClose, this, args);
            if (closeCalls === 1) {
              const directoryName = originalFs.readdirSync(process.env.TMPDIR)[0];
              const directory = join(process.env.TMPDIR, directoryName);
              const database = join(directory, 'ledger.sqlite');
              const preserved = join(process.env.TMPDIR, 'preserved.sqlite');
              if (${JSON.stringify(mode)} === 'replacement') {
                originalFs.renameSync(database, preserved);
                originalFs.writeFileSync(database, 'replacement', { mode: 0o600 });
              } else if (${JSON.stringify(mode)} === 'symlink') {
                originalFs.renameSync(database, preserved);
                originalFs.symlinkSync(preserved, database);
              } else if (${JSON.stringify(mode)} === 'hardlink') {
                originalFs.linkSync(database, preserved);
              } else {
                originalFs.writeFileSync(join(directory, 'ledger.sqlite-wal'), 'unexpected', { mode: 0o600 });
              }
              tampered = true;
            }
            return result;
          });
          const { runDurableServiceCreditLoopbackDemo } = await import(${JSON.stringify(`${CORE_URL}?phase-boundary-${mode}`)});
          let fixed = false;
          try { await runDurableServiceCreditLoopbackDemo(); } catch (error) {
            fixed = error?.code === 'SERVICE_CREDIT_DURABLE_LOOPBACK_DEMO_FAILED';
          }
          const entries = originalFs.readdirSync(process.env.TMPDIR);
          const owned = entries.find(name => name.startsWith('zenon-x402-service-credit-durable-loopback-demo-'));
          const preserved = entries.includes('preserved.sqlite');
          const retained = typeof owned === 'string'
            && originalFs.readdirSync(join(process.env.TMPDIR, owned)).includes('ledger.sqlite');
          const passed = fixed && tampered && closeCalls === 1 && openCalls === 0 && retained
            && (${JSON.stringify(mode)} === 'sidecar' || preserved);
          for (const entry of entries) {
            originalFs.rmSync(join(process.env.TMPDIR, entry), { recursive: true, force: true });
          }
          if (!passed || originalFs.readdirSync(process.env.TMPDIR).length !== 0) process.exit(1);
          originalFs.writeSync(1, 'PHASE_BOUNDARY_IDENTITY=PASS\\n');
        `;
        const result = moduleMockChild(source, parent);
        assert.equal(result.status, 0);
        assert.equal(result.stdout, 'PHASE_BOUNDARY_IDENTITY=PASS\n');
        assert.equal(result.stderr, '');
        assert.deepEqual(readdirSync(parent), []);
      } finally {
        rmSync(parent, { recursive: true, force: true });
      }
    });
  }
});

test('terminal protected-string detection deletes only the verified owned state then fails fixed', () => {
  const parent = privateTempParent('service-credit-durable-loopback-privacy-scan-');
  try {
    const source = `
      import { mock } from 'node:test';
      import * as originalFs from 'node:fs';
      const originalClient = await import(${JSON.stringify(`${CLIENT_URL}?privacy-scan-original`)});
      let authorization = null;
      let unlinkCalls = 0;
      let rmdirCalls = 0;
      mock.module(${JSON.stringify(CLIENT_URL)}, {
        namedExports: {
          createServiceCreditAuthorization: input => {
            authorization = originalClient.createServiceCreditAuthorization(input);
            return authorization;
          },
        },
      });
      const fsNames = [
        'chmodSync', 'closeSync', 'constants', 'fchmodSync', 'fstatSync',
        'fsyncSync', 'lstatSync', 'mkdtempSync', 'openSync', 'readFileSync',
        'readdirSync', 'realpathSync', 'rmdirSync', 'unlinkSync',
      ];
      const fsExports = Object.fromEntries(fsNames.map(key => [key, originalFs[key]]));
      fsExports.readFileSync = (...args) => {
        const bytes = Reflect.apply(originalFs.readFileSync, originalFs, args);
        if (authorization === null || typeof args[0] !== 'string' || !args[0].endsWith('/ledger.sqlite')) {
          return bytes;
        }
        return Buffer.concat([bytes, Buffer.from(authorization, 'utf8')]);
      };
      fsExports.unlinkSync = (...args) => {
        unlinkCalls += 1;
        return Reflect.apply(originalFs.unlinkSync, originalFs, args);
      };
      fsExports.rmdirSync = (...args) => {
        rmdirCalls += 1;
        return Reflect.apply(originalFs.rmdirSync, originalFs, args);
      };
      mock.module('node:fs', { namedExports: fsExports });
      const { runDurableServiceCreditLoopbackDemo } = await import(${JSON.stringify(`${CORE_URL}?privacy-scan`)});
      let fixed = false;
      try { await runDurableServiceCreditLoopbackDemo(); } catch (error) {
        fixed = error?.code === 'SERVICE_CREDIT_DURABLE_LOOPBACK_DEMO_FAILED';
      }
      const passed = fixed
        && typeof authorization === 'string'
        && unlinkCalls === 1
        && rmdirCalls === 1
        && originalFs.readdirSync(process.env.TMPDIR).length === 0;
      if (!passed) process.exit(1);
      originalFs.writeSync(1, 'PRIVACY_SCAN_CLEANUP=PASS\\n');
    `;
    const result = moduleMockChild(source, parent);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, 'PRIVACY_SCAN_CLEANUP=PASS\n');
    assert.equal(result.stderr, '');
    assert.deepEqual(readdirSync(parent), []);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('incomplete phase-two response validation retains state and never retries', () => {
  const parent = privateTempParent('service-credit-durable-loopback-final-validation-');
  try {
    const source = `
      import { mock } from 'node:test';
      import { EventEmitter } from 'node:events';
      import * as originalFs from 'node:fs';
      import * as originalHttp from 'node:http';
      let requestCalls = 0;
      const request = (...args) => {
        requestCalls += 1;
        if (requestCalls < 6) return Reflect.apply(originalHttp.request, originalHttp, args);
        const responseCallback = args[1];
        const outgoing = new EventEmitter();
        outgoing.destroy = () => {};
        outgoing.end = () => queueMicrotask(() => {
          const response = new EventEmitter();
          response.statusCode = 503;
          response.headers = {};
          response.rawHeaders = [];
          response.complete = true;
          response.aborted = false;
          response.destroy = () => {};
          responseCallback(response);
          response.emit('end');
        });
        return outgoing;
      };
      mock.module('node:http', {
        namedExports: { createServer: originalHttp.createServer, request },
      });
      const fsNames = [
        'chmodSync', 'closeSync', 'constants', 'fchmodSync', 'fstatSync',
        'fsyncSync', 'lstatSync', 'mkdtempSync', 'openSync', 'readFileSync',
        'readdirSync', 'realpathSync', 'rmdirSync', 'unlinkSync',
      ];
      let unlinkCalls = 0;
      const fsExports = Object.fromEntries(fsNames.map(key => [key, originalFs[key]]));
      fsExports.unlinkSync = (...args) => {
        unlinkCalls += 1;
        return Reflect.apply(originalFs.unlinkSync, originalFs, args);
      };
      mock.module('node:fs', { namedExports: fsExports });
      const { runDurableServiceCreditLoopbackDemo } = await import(${JSON.stringify(`${CORE_URL}?final-validation`)});
      let fixed = false;
      try { await runDurableServiceCreditLoopbackDemo(); } catch (error) {
        fixed = error?.code === 'SERVICE_CREDIT_DURABLE_LOOPBACK_DEMO_FAILED';
      }
      const entries = originalFs.readdirSync(process.env.TMPDIR);
      const retained = entries.length === 1
        && originalFs.readdirSync(process.env.TMPDIR + '/' + entries[0]).includes('ledger.sqlite');
      const passed = fixed && requestCalls === 6 && unlinkCalls === 0 && retained;
      if (entries.length === 1) {
        originalFs.rmSync(process.env.TMPDIR + '/' + entries[0], { recursive: true, force: true });
      }
      if (!passed || originalFs.readdirSync(process.env.TMPDIR).length !== 0) process.exit(1);
      originalFs.writeSync(1, 'FINAL_VALIDATION_GUARD=PASS\\n');
    `;
    const result = moduleMockChild(source, parent);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, 'FINAL_VALIDATION_GUARD=PASS\n');
    assert.equal(result.stderr, '');
    assert.deepEqual(readdirSync(parent), []);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('a swapped owned directory is quarantined and never recursively deleted', async () => {
  await withTempParent(async parent => {
    const operation = runDurableServiceCreditLoopbackDemo();
    const entries = readdirSync(parent);
    assert.equal(entries.length, 1);
    const owned = join(parent, entries[0]);
    const preserved = join(parent, 'preserved-original');
    renameSync(owned, preserved);
    await assert.rejects(() => operation, assertFixedFailure);
    assert.equal(existsSync(owned), false);
    assert.equal(existsSync(preserved), true);
  });
});

test('construction, start, request, response, and deadline failures are single-attempt and retained', async t => {
  for (const mode of [
    'session-construction',
    'listener-construction',
    'listener-start',
    'request-disconnect',
    'response-malformed',
    'response-deadline',
  ]) {
    await t.test(mode, () => {
      const parent = privateTempParent(`service-credit-durable-loopback-${mode}-`);
      try {
        const sessionMock = mode === 'session-construction'
          ? `
            mock.module(${JSON.stringify(SESSION_URL)}, {
              namedExports: {
                createDurableServiceCreditHttpSession: () => {
                  sessionFactories += 1;
                  throw new Error('synthetic session construction failure');
                },
              },
            });
          `
          : '';
        const loopbackMock = mode === 'listener-construction'
          ? `
            mock.module(${JSON.stringify(LOOPBACK_URL)}, {
              namedExports: {
                createServiceCreditLoopbackServer: () => {
                  loopbackFactories += 1;
                  throw new Error('synthetic listener construction failure');
                },
              },
            });
          `
          : mode === 'listener-start'
            ? `
              mock.module(${JSON.stringify(LOOPBACK_URL)}, {
                namedExports: {
                  createServiceCreditLoopbackServer: () => {
                    loopbackFactories += 1;
                    return Object.freeze({
                      start: Object.freeze(async () => {
                        startCalls += 1;
                        throw new Error('synthetic listener start failure');
                      }),
                      close: Object.freeze(async () => { closeCalls += 1; }),
                    });
                  },
                },
              });
            `
            : mode.startsWith('request-') || mode.startsWith('response-')
              ? `
                mock.module(${JSON.stringify(LOOPBACK_URL)}, {
                  namedExports: {
                    createServiceCreditLoopbackServer: () => {
                      loopbackFactories += 1;
                      return Object.freeze({
                        start: Object.freeze(async () => {
                          startCalls += 1;
                          return Object.freeze({
                            origin: 'http://127.0.0.1:1',
                            path: '/service-credit/v1/execute',
                          });
                        }),
                        close: Object.freeze(async () => { closeCalls += 1; }),
                      });
                    },
                  },
                });
              `
              : '';
        const httpMock = mode.startsWith('request-') || mode.startsWith('response-')
          ? `
            const request = (_options, responseCallback) => {
              requestCalls += 1;
              const outgoing = new EventEmitter();
              outgoing.destroy = () => {};
              outgoing.end = () => queueMicrotask(() => {
                if (${JSON.stringify(mode)} === 'response-deadline') return;
                if (${JSON.stringify(mode)} === 'request-disconnect') {
                  outgoing.emit('error', new Error('synthetic disconnect'));
                  return;
                }
                const response = new EventEmitter();
                response.statusCode = 302;
                response.headers = {};
                response.rawHeaders = [];
                response.complete = true;
                response.aborted = false;
                response.destroy = () => {};
                responseCallback(response);
                response.emit('end');
              });
              return outgoing;
            };
            mock.module('node:http', { namedExports: { request } });
          `
          : '';
        const timerMock = mode === 'response-deadline'
          ? `
            const nativeSetTimeout = globalThis.setTimeout;
            mock.method(globalThis, 'setTimeout', function shortened(callback, milliseconds, ...args) {
              const delay = milliseconds === 2_000 ? 10 : milliseconds;
              return Reflect.apply(nativeSetTimeout, globalThis, [callback, delay, ...args]);
            });
          `
          : '';
        const expected = {
          sessionFactories: mode === 'session-construction' ? 1 : 0,
          loopbackFactories: mode === 'session-construction' ? 0 : 1,
          startCalls: mode === 'listener-start' || mode.startsWith('request-') || mode.startsWith('response-') ? 1 : 0,
          closeCalls: mode === 'listener-start' || mode.startsWith('request-') || mode.startsWith('response-') ? 1 : 0,
          requestCalls: mode.startsWith('request-') || mode.startsWith('response-') ? 1 : 0,
        };
        const source = `
          import { mock } from 'node:test';
          import { EventEmitter } from 'node:events';
          import * as originalFs from 'node:fs';
          let sessionFactories = 0;
          let loopbackFactories = 0;
          let startCalls = 0;
          let closeCalls = 0;
          let requestCalls = 0;
          ${timerMock}
          ${httpMock}
          ${sessionMock}
          ${loopbackMock}
          const { runDurableServiceCreditLoopbackDemo } = await import(${JSON.stringify(`${CORE_URL}?failure-${mode}`)});
          let fixed = false;
          try { await runDurableServiceCreditLoopbackDemo(); } catch (error) {
            fixed = error?.code === 'SERVICE_CREDIT_DURABLE_LOOPBACK_DEMO_FAILED'
              && error?.stack === 'DurableServiceCreditLoopbackDemoError: SERVICE_CREDIT_DURABLE_LOOPBACK_DEMO_FAILED';
          }
          const entries = originalFs.readdirSync(process.env.TMPDIR);
          const retained = entries.length === 1
            && originalFs.readdirSync(process.env.TMPDIR + '/' + entries[0]).includes('ledger.sqlite');
          const passed = fixed
            && sessionFactories === ${expected.sessionFactories}
            && loopbackFactories === ${expected.loopbackFactories}
            && startCalls === ${expected.startCalls}
            && closeCalls === ${expected.closeCalls}
            && requestCalls === ${expected.requestCalls}
            && retained;
          if (entries.length === 1) {
            originalFs.rmSync(process.env.TMPDIR + '/' + entries[0], { recursive: true, force: true });
          }
          if (!passed || originalFs.readdirSync(process.env.TMPDIR).length !== 0) process.exit(1);
          originalFs.writeSync(1, 'SINGLE_ATTEMPT_FAILURE=PASS\\n');
        `;
        const result = moduleMockChild(source, parent);
        assert.equal(result.status, 0);
        assert.equal(result.stdout, 'SINGLE_ATTEMPT_FAILURE=PASS\n');
        assert.equal(result.stderr, '');
        assert.deepEqual(readdirSync(parent), []);
      } finally {
        rmSync(parent, { recursive: true, force: true });
      }
    });
  }
});

test('both phases close transport then session then store before final unlink', () => {
  const parent = privateTempParent('service-credit-durable-loopback-close-order-');
  try {
    const source = `
      import { mock } from 'node:test';
      import * as originalFs from 'node:fs';
      const events = [];
      const stores = [];
      const sessions = [];
      const loopbacks = [];
      let finalStateSeen = false;
      const fsNames = [
        'chmodSync', 'closeSync', 'constants', 'fchmodSync', 'fstatSync',
        'fsyncSync', 'lstatSync', 'mkdtempSync', 'openSync', 'readFileSync',
        'readdirSync', 'realpathSync', 'rmdirSync', 'unlinkSync',
      ];
      const fsExports = Object.fromEntries(fsNames.map(key => [key, originalFs[key]]));
      fsExports.unlinkSync = (...args) => {
        if (events.join(',') !== 'transport,session,store,transport,session,store' || !finalStateSeen) {
          throw new Error('unlink before complete verified closure');
        }
        events.push('unlink');
        return Reflect.apply(originalFs.unlinkSync, originalFs, args);
      };
      mock.module('node:fs', { namedExports: fsExports });

      const originalLoopback = await import(${JSON.stringify(`${LOOPBACK_URL}?order-original`)});
      const originalSession = await import(${JSON.stringify(`${SESSION_URL}?order-original`)});
      const { ServiceCreditSqliteStore } = await import(${JSON.stringify(STORE_URL)});
      const originalClose = ServiceCreditSqliteStore.prototype.close;
      let storeCloseCalls = 0;
      mock.method(ServiceCreditSqliteStore.prototype, 'close', function orderedStoreClose(...args) {
        if (events.at(-1) !== 'session') throw new Error('store close out of order');
        storeCloseCalls += 1;
        const snapshot = this.load();
        const durable = this.getDurableExecutionSnapshot();
        if (storeCloseCalls === 1 && (snapshot.state.requests.length !== 2 || durable.executionState.executions.length !== 2)) {
          throw new Error('phase one not terminal');
        }
        if (storeCloseCalls === 2) {
          finalStateSeen = snapshot.state.requests.length === 3
            && snapshot.state.requests.every(request => request.state === 'SUCCEEDED')
            && durable.executionState.executions.length === 3
            && durable.executionState.executions.every(execution => execution.terminalClassification === 'SUCCEEDED');
        }
        events.push('store');
        return Reflect.apply(originalClose, this, args);
      });

      mock.module(${JSON.stringify(LOOPBACK_URL)}, {
        namedExports: {
          createServiceCreditLoopbackServer: options => {
            const inner = originalLoopback.createServiceCreditLoopbackServer(options);
            loopbacks.push(inner);
            return Object.freeze({
              start: inner.start,
              close: Object.freeze(async () => {
                await inner.close();
                events.push('transport');
              }),
            });
          },
        },
      });
      mock.module(${JSON.stringify(SESSION_URL)}, {
        namedExports: {
          createDurableServiceCreditHttpSession: options => {
            if (stores.length === 1 && events.join(',') !== 'transport,session,store') {
              throw new Error('phase two created before phase one closed');
            }
            stores.push(options.store);
            const inner = originalSession.createDurableServiceCreditHttpSession(options);
            sessions.push(inner);
            return Object.freeze({
              handle: inner.handle,
              close: Object.freeze(async () => {
                if (events.at(-1) !== 'transport') throw new Error('session close out of order');
                await inner.close();
                events.push('session');
              }),
            });
          },
        },
      });
      const { runDurableServiceCreditLoopbackDemo } = await import(${JSON.stringify(`${CORE_URL}?close-order`)});
      const summary = await runDurableServiceCreditLoopbackDemo();
      const passed = summary.cleanupVerified === true
        && storeCloseCalls === 2
        && stores.length === 2
        && stores[0] !== stores[1]
        && sessions.length === 2
        && sessions[0] !== sessions[1]
        && loopbacks.length === 2
        && loopbacks[0] !== loopbacks[1]
        && events.join(',') === 'transport,session,store,transport,session,store,unlink'
        && originalFs.readdirSync(process.env.TMPDIR).length === 0;
      if (!passed) process.exit(1);
      originalFs.writeSync(1, 'CLOSE_ORDER=PASS\\n');
    `;
    const result = moduleMockChild(source, parent);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, 'CLOSE_ORDER=PASS\n');
    assert.equal(result.stderr, '');
    assert.deepEqual(readdirSync(parent), []);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('post-import store close replacement cannot bypass either borrowed-handle close', () => {
  const parent = privateTempParent('service-credit-durable-loopback-store-close-capture-');
  try {
    const source = `
      import * as originalFs from 'node:fs';
      const { runDurableServiceCreditLoopbackDemo } = await import(${JSON.stringify(`${CORE_URL}?store-close-capture`)});
      const { ServiceCreditSqliteStore } = await import(${JSON.stringify(STORE_URL)});
      const originalClose = ServiceCreditSqliteStore.prototype.close;
      let poisonedCloseCalls = 0;
      ServiceCreditSqliteStore.prototype.close = function poisonedNoopClose() {
        poisonedCloseCalls += 1;
      };
      try {
        const summary = await runDurableServiceCreditLoopbackDemo();
        const passed = summary.cleanupVerified === true
          && poisonedCloseCalls === 0
          && originalFs.readdirSync(process.env.TMPDIR).length === 0;
        if (!passed) process.exit(1);
      } finally {
        ServiceCreditSqliteStore.prototype.close = originalClose;
      }
      originalFs.writeSync(1, 'STORE_CLOSE_CAPTURE=PASS\\n');
    `;
    const result = moduleMockChild(source, parent);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, 'STORE_CLOSE_CAPTURE=PASS\n');
    assert.equal(result.stderr, '');
    assert.deepEqual(readdirSync(parent), []);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('post-import store and mock lifecycle replacements never reach runner dispatch', () => {
  const parent = privateTempParent('service-credit-durable-loopback-authority-capture-');
  try {
    const source = `
      import * as originalFs from 'node:fs';
      const defineProperty = Object.defineProperty;
      const { runDurableServiceCreditLoopbackDemo } = await import(${JSON.stringify(`${CORE_URL}?authority-capture`)});
      const { ServiceCreditSqliteStore } = await import(${JSON.stringify(STORE_URL)});
      const { MockExactZenonClient, MockExactZenonFacilitator } = await import(${JSON.stringify(MOCK_PAYMENT_URL)});
      const { MockServiceCreditActivation } = await import(${JSON.stringify(pathToFileURL(join(ROOT, 'src', 'service-credit-activation.js')).href)});
      const targets = [
        [ServiceCreditSqliteStore, 'create'],
        [ServiceCreditSqliteStore, 'openExisting'],
        [ServiceCreditSqliteStore.prototype, 'close'],
        [ServiceCreditSqliteStore.prototype, 'getDurableExecutionSnapshot'],
        [ServiceCreditSqliteStore.prototype, 'registerOffer'],
        [ServiceCreditSqliteStore.prototype, 'getOffer'],
        [ServiceCreditSqliteStore.prototype, 'activateGrantFromTrustedRecord'],
        [ServiceCreditSqliteStore.prototype, 'getMetadata'],
        [ServiceCreditSqliteStore.prototype, 'initializeDurableExecution'],
        [ServiceCreditSqliteStore.prototype, 'prepareDurableExecution'],
        [ServiceCreditSqliteStore.prototype, 'persistDurableExecutionFence'],
        [ServiceCreditSqliteStore.prototype, 'completeDurableExecution'],
        [ServiceCreditSqliteStore.prototype, 'markDurableExecutionUnknown'],
        [MockExactZenonClient.prototype, 'createPaymentPayload'],
        [MockExactZenonFacilitator.prototype, 'settle'],
        [MockServiceCreditActivation.prototype, 'createFundingResource'],
        [MockServiceCreditActivation.prototype, 'activate'],
      ];
      const originals = targets.map(([owner, key]) => [owner, key, Object.getOwnPropertyDescriptor(owner, key)]);
      let hooks = 0;
      try {
        for (const [owner, key] of targets) {
          defineProperty(owner, key, {
            configurable: true,
            writable: true,
            value() { hooks += 1; throw new Error('poisoned lifecycle method'); },
          });
        }
        const summary = await runDurableServiceCreditLoopbackDemo();
        const passed = summary.cleanupVerified === true
          && hooks === 0
          && originalFs.readdirSync(process.env.TMPDIR).length === 0;
        if (!passed) process.exit(1);
      } finally {
        for (const [owner, key, descriptor] of originals) defineProperty(owner, key, descriptor);
      }
      originalFs.writeSync(1, 'AUTHORITY_CAPTURE=PASS\\n');
    `;
    const result = moduleMockChild(source, parent);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, 'AUTHORITY_CAPTURE=PASS\n');
    assert.equal(result.stderr, '');
    assert.deepEqual(readdirSync(parent), []);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('post-import admission-load replacement fails before local state', () => {
  const parent = privateTempParent('service-credit-durable-loopback-admission-load-integrity-');
  try {
    const source = `
      import * as originalFs from 'node:fs';
      const { runDurableServiceCreditLoopbackDemo } = await import(${JSON.stringify(`${CORE_URL}?admission-load-integrity`)});
      const { ServiceCreditSqliteStore } = await import(${JSON.stringify(STORE_URL)});
      const descriptor = Object.getOwnPropertyDescriptor(ServiceCreditSqliteStore.prototype, 'load');
      let hooks = 0;
      Object.defineProperty(ServiceCreditSqliteStore.prototype, 'load', {
        configurable: true,
        writable: true,
        value() { hooks += 1; throw new Error('poisoned admission load'); },
      });
      let fixed = false;
      try {
        await runDurableServiceCreditLoopbackDemo();
      } catch (error) {
        fixed = error?.name === 'DurableServiceCreditLoopbackDemoError'
          && error?.code === 'SERVICE_CREDIT_DURABLE_LOOPBACK_DEMO_FAILED'
          && error?.message === 'SERVICE_CREDIT_DURABLE_LOOPBACK_DEMO_FAILED'
          && !Object.hasOwn(error, 'cause');
      } finally {
        Object.defineProperty(ServiceCreditSqliteStore.prototype, 'load', descriptor);
      }
      if (!fixed || hooks !== 0 || originalFs.readdirSync(process.env.TMPDIR).length !== 0) process.exit(1);
      originalFs.writeSync(1, 'ADMISSION_LOAD_INTEGRITY=PASS\\n');
    `;
    const result = moduleMockChild(source, parent);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, 'ADMISSION_LOAD_INTEGRITY=PASS\n');
    assert.equal(result.stderr, '');
    assert.deepEqual(readdirSync(parent), []);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('post-import facilitator verification replacement fails before local state', () => {
  const parent = privateTempParent('service-credit-durable-loopback-verifier-integrity-');
  try {
    const source = `
      import * as originalFs from 'node:fs';
      const { runDurableServiceCreditLoopbackDemo } = await import(${JSON.stringify(`${CORE_URL}?verifier-integrity`)});
      const { MockExactZenonFacilitator } = await import(${JSON.stringify(MOCK_PAYMENT_URL)});
      const descriptor = Object.getOwnPropertyDescriptor(MockExactZenonFacilitator.prototype, 'verify');
      let hooks = 0;
      Object.defineProperty(MockExactZenonFacilitator.prototype, 'verify', {
        configurable: true,
        writable: true,
        value() { hooks += 1; throw new Error('poisoned verifier'); },
      });
      let fixed = false;
      try {
        await runDurableServiceCreditLoopbackDemo();
      } catch (error) {
        fixed = error?.name === 'DurableServiceCreditLoopbackDemoError'
          && error?.code === 'SERVICE_CREDIT_DURABLE_LOOPBACK_DEMO_FAILED'
          && error?.message === 'SERVICE_CREDIT_DURABLE_LOOPBACK_DEMO_FAILED'
          && !Object.hasOwn(error, 'cause');
      } finally {
        Object.defineProperty(MockExactZenonFacilitator.prototype, 'verify', descriptor);
      }
      if (!fixed || hooks !== 0 || originalFs.readdirSync(process.env.TMPDIR).length !== 0) process.exit(1);
      originalFs.writeSync(1, 'VERIFIER_INTEGRITY=PASS\\n');
    `;
    const result = moduleMockChild(source, parent);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, 'VERIFIER_INTEGRITY=PASS\n');
    assert.equal(result.stderr, '');
    assert.deepEqual(readdirSync(parent), []);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('post-import mock constructor prototype-chain insertion fails before local state', () => {
  for (const mode of ['client', 'facilitator']) {
    const parent = privateTempParent(`service-credit-durable-loopback-constructor-chain-${mode}-`);
    try {
      const source = `
        import * as originalFs from 'node:fs';
        const { runDurableServiceCreditLoopbackDemo } = await import(${JSON.stringify(`${CORE_URL}?constructor-chain-${mode}`)});
        const { MockExactZenonClient, MockExactZenonFacilitator } = await import(${JSON.stringify(MOCK_PAYMENT_URL)});
        const target = ${JSON.stringify(mode)} === 'client'
          ? MockExactZenonClient.prototype
          : MockExactZenonFacilitator.prototype;
        const originalParent = Object.getPrototypeOf(target);
        const injectedParent = Object.create(originalParent);
        const fields = ${JSON.stringify(mode)} === 'client'
          ? ['publicKey', 'privateKey', 'publicKeyDerB64', 'address']
          : ['records'];
        let hooks = 0;
        for (const field of fields) {
          Object.defineProperty(injectedParent, field, {
            configurable: true,
            set() { hooks += 1; },
          });
        }
        Object.setPrototypeOf(target, injectedParent);
        let fixed = false;
        try {
          await runDurableServiceCreditLoopbackDemo();
        } catch (error) {
          fixed = error?.name === 'DurableServiceCreditLoopbackDemoError'
            && error?.code === 'SERVICE_CREDIT_DURABLE_LOOPBACK_DEMO_FAILED'
            && error?.message === 'SERVICE_CREDIT_DURABLE_LOOPBACK_DEMO_FAILED'
            && !Object.hasOwn(error, 'cause');
        } finally {
          Object.setPrototypeOf(target, originalParent);
        }
        if (!fixed || hooks !== 0 || originalFs.readdirSync(process.env.TMPDIR).length !== 0) {
          process.exit(1);
        }
        originalFs.writeSync(1, 'CONSTRUCTOR_CHAIN_REJECTED=PASS\\n');
      `;
      const result = moduleMockChild(source, parent);
      assert.equal(result.status, 0, mode);
      assert.equal(result.stdout, 'CONSTRUCTOR_CHAIN_REJECTED=PASS\n', mode);
      assert.equal(result.stderr, '', mode);
      assert.deepEqual(readdirSync(parent), [], mode);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  }
});

test('captured runner intrinsics and fixed errors survive post-import poisoning', () => {
  const parent = privateTempParent('service-credit-durable-loopback-intrinsics-');
  try {
    const source = `
      import * as originalFs from 'node:fs';
      const { runDurableServiceCreditLoopbackDemo } = await import(${JSON.stringify(`${CORE_URL}?intrinsic-capture`)});
      const fill = Array.prototype.fill;
      const equals = Buffer.prototype.equals;
      const defineProperty = Object.defineProperty;
      const errorDescriptors = new Map([
        ['name', Object.getOwnPropertyDescriptor(Error.prototype, 'name')],
        ['code', Object.getOwnPropertyDescriptor(Error.prototype, 'code')],
        ['stack', Object.getOwnPropertyDescriptor(Error.prototype, 'stack')],
      ]);
      let hooks = 0;
      Array.prototype.fill = function poisonedFill() { hooks += 1; throw new Error('poisoned fill'); };
      Buffer.prototype.equals = function poisonedEquals() { hooks += 1; throw new Error('poisoned equals'); };
      let passed = false;
      try {
        const summary = await runDurableServiceCreditLoopbackDemo();
        Array.prototype.fill = fill;
        Buffer.prototype.equals = equals;
        for (const key of errorDescriptors.keys()) {
          defineProperty(Error.prototype, key, {
            configurable: true,
            set() { hooks += 1; },
          });
        }
        Object.defineProperty = function poisonedDefineProperty() {
          hooks += 1;
          return undefined;
        };
        const failure = runDurableServiceCreditLoopbackDemo(undefined);
        Object.defineProperty = defineProperty;
        for (const [key, descriptor] of errorDescriptors) {
          if (descriptor) defineProperty(Error.prototype, key, descriptor);
          else delete Error.prototype[key];
        }
        let fixed = false;
        try { await failure; } catch (error) {
          fixed = error?.name === 'DurableServiceCreditLoopbackDemoError'
            && error?.code === 'SERVICE_CREDIT_DURABLE_LOOPBACK_DEMO_FAILED'
            && error?.stack === 'DurableServiceCreditLoopbackDemoError: SERVICE_CREDIT_DURABLE_LOOPBACK_DEMO_FAILED'
            && Object.hasOwn(error, 'cause') === false
            && Object.isFrozen(error);
        }
        passed = summary.cleanupVerified === true && fixed && hooks === 0;
      } finally {
        Array.prototype.fill = fill;
        Buffer.prototype.equals = equals;
        Object.defineProperty = defineProperty;
        for (const [key, descriptor] of errorDescriptors) {
          if (descriptor) defineProperty(Error.prototype, key, descriptor);
          else delete Error.prototype[key];
        }
      }
      if (!passed || originalFs.readdirSync(process.env.TMPDIR).length !== 0) process.exit(1);
      originalFs.writeSync(1, 'CAPTURED_INTRINSICS=PASS\\n');
    `;
    const result = moduleMockChild(source, parent);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, 'CAPTURED_INTRINSICS=PASS\n');
    assert.equal(result.stderr, '');
    assert.deepEqual(readdirSync(parent), []);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('successful callback deadlines leave no timer resource after clean phase closure', () => {
  const parent = privateTempParent('service-credit-durable-loopback-timer-cleanup-');
  try {
    const source = `
      import { mock } from 'node:test';
      import * as originalFs from 'node:fs';
      const originalSession = await import(${JSON.stringify(`${SESSION_URL}?timer-cleanup-original`)});
      let sessionFactories = 0;
      let scheduled = 0;
      let cancelled = 0;
      const active = new Set();
      mock.module(${JSON.stringify(SESSION_URL)}, {
        namedExports: {
          createDurableServiceCreditHttpSession: options => {
            sessionFactories += 1;
            const runtime = options.deadlineRuntime;
            const wrappedRuntime = Object.freeze({
              monotonicNowNs: runtime.monotonicNowNs,
              schedule: (callback, delayMs) => {
                const handle = runtime.schedule(callback, delayMs);
                scheduled += 1;
                active.add(handle);
                return handle;
              },
              cancel: handle => {
                if (active.delete(handle)) cancelled += 1;
                return runtime.cancel(handle);
              },
            });
            return originalSession.createDurableServiceCreditHttpSession({
              ...options,
              deadlineRuntime: wrappedRuntime,
            });
          },
        },
      });
      const getActiveResourcesInfo = process.getActiveResourcesInfo;
      const timeoutCount = () => Reflect.apply(getActiveResourcesInfo, process, [])
        .filter(resource => resource === 'Timeout').length;
      const before = timeoutCount();
      const { runDurableServiceCreditLoopbackDemo } = await import(${JSON.stringify(`${CORE_URL}?timer-cleanup`)});
      let summary;
      try {
        summary = await runDurableServiceCreditLoopbackDemo();
      } catch {
        process.exit(41);
      }
      await new Promise(resolveImmediate => setImmediate(resolveImmediate));
      if (summary.cleanupVerified !== true) process.exit(11);
      if (timeoutCount() > before) process.exit(21);
      if (sessionFactories !== 2 || scheduled !== 3 || cancelled !== 3 || active.size !== 0) {
        process.exit(25);
      }
      if (originalFs.readdirSync(process.env.TMPDIR).length !== 0) process.exit(31);
      originalFs.writeSync(1, 'TIMER_CLEANUP=PASS\\n');
    `;
    const result = moduleMockChild(source, parent);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, 'TIMER_CLEANUP=PASS\n');
    assert.equal(result.stderr, '');
    assert.deepEqual(readdirSync(parent), []);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('short fixed descriptor writes fail without raw output or residual state', async t => {
  for (const mode of ['stdout', 'stderr']) {
    await t.test(mode, () => {
      const parent = privateTempParent(`service-credit-durable-loopback-short-${mode}-`);
      try {
        const source = `
          import { mock } from 'node:test';
          import * as originalFs from 'node:fs';
          const fsNames = [
            'chmodSync', 'closeSync', 'constants', 'fchmodSync', 'fstatSync',
            'fsyncSync', 'lstatSync', 'mkdtempSync', 'openSync', 'readFileSync',
            'readdirSync', 'realpathSync', 'rmdirSync', 'unlinkSync', 'writeSync',
          ];
          const fsExports = Object.fromEntries(fsNames.map(key => [key, originalFs[key]]));
          fsExports.writeSync = (descriptor, buffer, offset, length, ...rest) => {
            const target = ${JSON.stringify(mode)} === 'stdout' ? 1 : 2;
            if (descriptor === target) return Math.max(0, length - 1);
            return Reflect.apply(originalFs.writeSync, originalFs, [
              descriptor, buffer, offset, length, ...rest,
            ]);
          };
          mock.module('node:fs', { namedExports: fsExports });
          process.argv = ${JSON.stringify(mode)} === 'stdout'
            ? [process.execPath, ${JSON.stringify(CLI_PATH)}]
            : [process.execPath, ${JSON.stringify(CLI_PATH)}, 'unexpected'];
          await import(${JSON.stringify(`${pathToFileURL(CLI_PATH).href}?short-${mode}`)});
          for (let turn = 0; turn < 2_000 && process.exitCode === undefined; turn += 1) {
            await new Promise(resolveImmediate => setImmediate(resolveImmediate));
          }
          if (process.exitCode !== 1 || originalFs.readdirSync(process.env.TMPDIR).length !== 0) {
            process.exit(2);
          }
        `;
        const result = moduleMockChild(source, parent);
        assert.equal(result.status, 1);
        if (mode === 'stdout') {
          assert.equal(result.stdout, '');
          assert.equal(result.stderr, FAILURE_OUTPUT);
        } else {
          assert.equal(result.stdout, '');
          assert.equal(result.stderr, '');
        }
        assert.deepEqual(readdirSync(parent), []);
      } finally {
        rmSync(parent, { recursive: true, force: true });
      }
    });
  }
});

test('source closure, package command, and active imports remain bounded', () => {
  const closure = importClosure(CORE_PATH);
  const relativeFiles = [...closure.visited].map(path => relative(ROOT, path)).sort();
  assert.deepEqual(relativeFiles, [
    'src/canonical.js',
    'src/mock-payment.js',
    'src/service-credit-activation.js',
    'src/service-credit-capability.js',
    'src/service-credit-client.js',
    'src/service-credit-durable-execution-owner.js',
    'src/service-credit-durable-http-session.js',
    'src/service-credit-durable-loopback-demo.js',
    'src/service-credit-execution-contract.js',
    'src/service-credit-http.js',
    'src/service-credit-loopback-server.js',
    'src/service-credit-model.js',
    'src/service-credit-sqlite-store.js',
    'src/x402-wire.js',
  ]);
  assert.deepEqual([...closure.external].sort(), [
    'node:async_hooks',
    'node:crypto',
    'node:fs',
    'node:http',
    'node:os',
    'node:path',
    'node:perf_hooks',
    'node:sqlite',
    'node:url',
    'node:util',
  ]);
  const source = readFileSync(CORE_PATH, 'utf8');
  assert.doesNotMatch(source, /\b(?:fetch|WebSocket|wallet|rpc|child_process|worker_threads)\b/i);
  assert.doesNotMatch(source, /console\.|process\.(?:stdout|stderr)|rmSync/);
  assert.doesNotMatch(source, /\.activateGrantFromTrustedRecord\s*\(|createServiceCreditCompositionOwner/);
  assert.match(source, /createMockServiceCreditActivation/);
  assert.match(source, /const STORE_ACTIVATE_GRANT_FROM_TRUSTED_RECORD = ownMethod/);
  assert.match(source, /const OBJECT_DEFINE_PROPERTY = Object\.defineProperty;/);
  assert.match(source, /const BIGINT_FROM = BigInt;/);
  assert.match(source, /const PROCESS_HRTIME = process\.hrtime;/);
  const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(
    packageJson.scripts['demo:service-credit-durable-loopback'],
    'node src/service-credit-durable-loopback-demo-cli.js',
  );
  for (const relativePath of [
    'src/demo.js',
    'src/server-cli.js',
    'src/buyer.js',
    'src/buyer-cli.js',
    'src/resource-server.js',
    'src/service-credit-demo.js',
    'src/service-credit-loopback-demo.js',
    'src/service-credit-composition.js',
  ]) {
    assert.equal(
      readFileSync(join(ROOT, relativePath), 'utf8').includes('service-credit-durable-loopback-demo'),
      false,
    );
  }
});

test('CLI source is fixed-output only and package dependencies remain unchanged', () => {
  const source = readFileSync(CLI_PATH, 'utf8');
  assert.match(source, /writeSync/);
  assert.doesNotMatch(source, /console\.|process\.(?:stdout|stderr)\.write/);
  assert.doesNotMatch(source, /error\.(?:message|stack)|JSON\.stringify\(error/);
  assert.doesNotMatch(SUCCESS_OUTPUT, /(?:https?:|127\.0\.0\.1|authorization|signature|public.?key|grant|request|transaction|ledger|sqlite|\/)/i);
  assert.doesNotMatch(FAILURE_OUTPUT, /(?:https?:|127\.0\.0\.1|authorization|signature|public.?key|grant|request|transaction|ledger|sqlite|\/)/i);
  const changed = spawnSync('git', ['status', '--short'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(changed.status, 0);
  assert.doesNotMatch(changed.stdout, /package-lock\.json/);
  const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.deepEqual(Object.keys(packageJson.dependencies).sort(), [
    '@noble/ed25519',
    '@noble/hashes',
    'znn-typescript-sdk',
  ]);
  assert.deepEqual(Object.keys(packageJson.devDependencies), ['@x402/core']);
});

test('public documentation bounds the synthetic durable loopback milestone', () => {
  const readDocument = relativePath => readFileSync(join(ROOT, relativePath), 'utf8');
  const readme = readDocument('README.md');
  const security = readDocument('SECURITY.md');
  const plan = readDocument('docs/IMPLEMENTATION_PLAN.md');

  assert.match(readme, /npm run --silent demo:service-credit-durable-loopback/u);
  assert.match(readme, /src\/service-credit-durable-loopback-demo\.js/u);
  assert.match(readme, /src\/service-credit-durable-loopback-demo-cli\.js/u);
  assert.match(readme, /test\/service-credit-durable-loopback-demo\.test\.js/u);
  assert.match(security, /^### Synthetic durable loopback demo boundary$/mu);
  assert.match(plan, /^### Synthetic durable loopback demo$/mu);
  assert.match(plan, /Rollback is exactly eight paths/u);
  assert.match(plan, /test\/service-credit-loopback-server\.test\.js/u);

  for (const document of [readme, security, plan]) {
    assert.match(document, /clean terminal-state reopen/u);
    assert.match(document, /transport.*session.*store/u);
    assert.match(document, /post-import/u);
    assert.match(document, /pre-import poisoning/u);
    assert.match(document, /unreleased/u);
    assert.match(document, /unactivated/u);
    assert.match(document, /exactly-once external effects/u);
    assert.match(document, /authenticated transport/u);
  }
  assert.match(security, /durable loopback demo constructs it through its explicit package command/u);
});

test('temporary parent helper itself uses a private local boundary', () => {
  const parent = privateTempParent('service-credit-durable-loopback-private-');
  try {
    const descriptor = openSync(parent, 'r');
    closeSync(descriptor);
    assert.equal(isAbsolute(parent), true);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
