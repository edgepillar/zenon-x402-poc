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

import { runServiceCreditLoopbackDemo } from '../src/service-credit-loopback-demo.js';

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(TEST_DIRECTORY, '..');
const CORE_PATH = join(ROOT, 'src', 'service-credit-loopback-demo.js');
const CLI_PATH = join(ROOT, 'src', 'service-credit-loopback-demo-cli.js');
const CORE_URL = pathToFileURL(CORE_PATH).href;
const LOOPBACK_URL = pathToFileURL(join(ROOT, 'src', 'service-credit-loopback-server.js')).href;
const STORE_URL = pathToFileURL(join(ROOT, 'src', 'service-credit-sqlite-store.js')).href;
const MOCK_PAYMENT_URL = pathToFileURL(join(ROOT, 'src', 'mock-payment.js')).href;
const COMPOSITION_URL = pathToFileURL(join(ROOT, 'src', 'service-credit-composition.js')).href;
const EXPECTED_SUMMARY = Object.freeze({
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
const SUCCESS_OUTPUT = 'SERVICE_CREDIT_LOOPBACK_DEMO_SUCCESS\n';
const FAILURE_OUTPUT = 'SERVICE_CREDIT_LOOPBACK_DEMO_FAILED\n';
const MODULE_EDGE_PARSER = [
  "import { readFileSync } from 'node:fs';",
  "import { SourceTextModule } from 'node:vm';",
  "const parsed = new SourceTextModule(readFileSync(0, 'utf8'));",
  'process.stdout.write(JSON.stringify(',
  'parsed.moduleRequests.map(request => request.specifier)',
  '));',
].join('');
const DYNAMIC_IMPORT_GUARD = /\bimport(?:(?:\s+)|(?:\/\*[\s\S]*?\*\/)|(?:\/\/[^\r\n\u2028\u2029]*(?:\r\n?|\n|\u2028|\u2029|$)))*\(/u;

function privateTempParent(prefix = 'service-credit-loopback-demo-test-') {
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
  assert.equal(error?.name, 'ServiceCreditLoopbackDemoError');
  assert.equal(error?.code, 'SERVICE_CREDIT_LOOPBACK_DEMO_FAILED');
  assert.equal(error?.message, 'SERVICE_CREDIT_LOOPBACK_DEMO_FAILED');
  assert.equal(
    error?.stack,
    'ServiceCreditLoopbackDemoError: SERVICE_CREDIT_LOOPBACK_DEMO_FAILED',
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

test('core import is inert and creates no listener, timer, process listener, or file', () => {
  const parent = privateTempParent('service-credit-loopback-demo-import-');
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
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: parent },
    });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, 'IMPORT_INERT=PASS\n');
    assert.equal(result.stderr, '');
    assert.deepEqual(readdirSync(parent), []);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('wrong arity fails before filesystem, listener, or scenario effects', async () => {
  await withTempParent(async parent => {
    const beforeServers = process._getActiveHandles().filter(value => value instanceof Server).length;
    await assert.rejects(() => runServiceCreditLoopbackDemo(undefined), assertFixedFailure);
    let afterServers = process._getActiveHandles().filter(value => value instanceof Server).length;
    for (let turn = 0; turn < 20 && afterServers !== beforeServers; turn += 1) {
      await new Promise(resolveImmediate => setImmediate(resolveImmediate));
      afterServers = process._getActiveHandles().filter(value => value instanceof Server).length;
    }
    assert.equal(afterServers, beforeServers);
    assert.deepEqual(readdirSync(parent), []);
  });
});

test('real loopback run returns only the deeply frozen fixed aggregate and cleans up', async () => {
  await withTempParent(async parent => {
    const beforeServers = process._getActiveHandles().filter(value => value instanceof Server).length;
    const summary = await runServiceCreditLoopbackDemo();
    assert.deepEqual(summary, EXPECTED_SUMMARY);
    assert.equal(Object.isFrozen(summary), true);
    assert.deepEqual(Reflect.ownKeys(summary), Reflect.ownKeys(EXPECTED_SUMMARY));
    assert.equal(Object.values(summary).every(value => Object(value) !== value), true);
    let afterServers = process._getActiveHandles().filter(value => value instanceof Server).length;
    for (let turn = 0; turn < 20 && afterServers !== beforeServers; turn += 1) {
      await new Promise(resolveImmediate => setImmediate(resolveImmediate));
      afterServers = process._getActiveHandles().filter(value => value instanceof Server).length;
    }
    assert.equal(afterServers, beforeServers);
    assert.deepEqual(readdirSync(parent), []);
  });
});

test('two direct CLI runs have byte-identical fixed success output', () => {
  const firstParent = privateTempParent('service-credit-loopback-demo-cli-a-');
  const secondParent = privateTempParent('service-credit-loopback-demo-cli-b-');
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

test('direct CLI rejects arguments with fixed failure output and no effects', () => {
  const parent = privateTempParent('service-credit-loopback-demo-cli-failure-');
  try {
    const result = directCli(['unexpected'], { env: { TMPDIR: parent } });
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, FAILURE_OUTPUT);
    assert.deepEqual(readdirSync(parent), []);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('closed stdout cannot produce a raw diagnostic', async () => {
  const parent = privateTempParent('service-credit-loopback-demo-closed-stdout-');
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

test('closed stderr leaves nonzero status as the only failure signal', () => {
  const parent = privateTempParent('service-credit-loopback-demo-closed-stderr-');
  try {
    const source = `
      import { closeSync } from 'node:fs';
      closeSync(2);
      process.argv = [process.execPath, ${JSON.stringify(CLI_PATH)}, 'unexpected'];
      await import(${JSON.stringify(`${pathToFileURL(CLI_PATH).href}?closed-stderr`)});
      await new Promise(resolveImmediate => setImmediate(resolveImmediate));
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: parent },
    });
    assert.equal(result.status, 1);
    assert.equal(result.signal, null);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
    assert.deepEqual(readdirSync(parent), []);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('global fetch and WebSocket hooks are never consulted', async t => {
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
    assert.deepEqual(await runServiceCreditLoopbackDemo(), EXPECTED_SUMMARY);
  });
  assert.equal(calls, 0);
});

test('retained ledger independently proves settlement, replay, accounting, and persistence boundaries', () => {
  const parent = privateTempParent('service-credit-loopback-demo-ledger-');
  try {
    const source = `
      import { mock } from 'node:test';
      import * as originalCrypto from 'node:crypto';
      import * as originalFs from 'node:fs';
      import { dirname } from 'node:path';
      import { DatabaseSync } from 'node:sqlite';

      let retainedDatabase = null;
      let settlementCalls = 0;
      let executionCalls = 0;
      const authorizationAttempts = [];
      const names = [
        'chmodSync', 'closeSync', 'constants', 'fchmodSync', 'fstatSync',
        'fsyncSync', 'lstatSync', 'mkdtempSync', 'openSync', 'readFileSync',
        'readdirSync', 'realpathSync', 'rmdirSync', 'unlinkSync',
      ];
      const namedExports = Object.fromEntries(names.map(key => [key, originalFs[key]]));
      namedExports.unlinkSync = path => {
        if (typeof path === 'string' && path.endsWith('/ledger.sqlite')) {
          retainedDatabase = path;
          throw new Error('synthetic retained ledger');
        }
        return Reflect.apply(originalFs.unlinkSync, originalFs, [path]);
      };
      mock.module('node:fs', { namedExports });

      const originalPayment = await import(${JSON.stringify(`${MOCK_PAYMENT_URL}?loopback-demo-instrumentation`)});
      const originalComposition = await import(${JSON.stringify(`${COMPOSITION_URL}?loopback-demo-instrumentation`)});
      class InstrumentedFacilitator extends originalPayment.MockExactZenonFacilitator {
        async settle(...args) {
          settlementCalls += 1;
          return super.settle(...args);
        }
      }
      const createInstrumentedOwner = options => {
        const application = options.execute;
        const owner = originalComposition.createServiceCreditCompositionOwner({
          store: options.store,
          activationOptions: options.activationOptions,
          execute: (...args) => {
            executionCalls += 1;
            return Reflect.apply(application, undefined, args);
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
          return Reflect.apply(owner.handle, undefined, [request, response]);
        };
        return Object.freeze({
          createFundingResource: owner.createFundingResource,
          activateFunding: owner.activateFunding,
          handle: Object.freeze(handle),
        });
      };
      mock.module(${JSON.stringify(MOCK_PAYMENT_URL)}, {
        namedExports: {
          MockExactZenonClient: originalPayment.MockExactZenonClient,
          MockExactZenonFacilitator: InstrumentedFacilitator,
        },
      });
      mock.module(${JSON.stringify(COMPOSITION_URL)}, {
        namedExports: { createServiceCreditCompositionOwner: createInstrumentedOwner },
      });

      const { runServiceCreditLoopbackDemo } = await import(${JSON.stringify(`${CORE_URL}?retained-ledger`)});
      let fixedFailure = false;
      try { await runServiceCreditLoopbackDemo(); } catch (error) {
        fixedFailure = error?.code === 'SERVICE_CREDIT_LOOPBACK_DEMO_FAILED';
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
        const exactKeys = (value, expected) => value !== null
          && typeof value === 'object'
          && !Array.isArray(value)
          && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
        const canonicalJson = value => {
          if (value === null || typeof value !== 'object') return JSON.stringify(value);
          if (Array.isArray(value)) return \`[\${value.map(canonicalJson).join(',')}]\`;
          const keys = Object.keys(value).sort();
          return \`{\${keys.map(key => \`\${JSON.stringify(key)}:\${canonicalJson(value[key])}\`).join(',')}}\`;
        };
        const expectedChecksum = \`sha256:\${originalCrypto.createHash('sha256')
          .update('zenon-x402:service-credit-sqlite-physical-v2')
          .update(String.fromCharCode(0))
          .update(canonicalJson({
            executionState: envelope.executionState,
            ledgerState: envelope.ledgerState,
            physicalVersion: envelope.physicalVersion,
            revision: envelope.revision,
          }))
          .digest('hex')}\`;
        const state = envelope.ledgerState;
        const grant = state?.grants?.[0];
        const requests = state?.requests;
        const frequencies = new Map();
        for (const value of authorizationAttempts) {
          if (typeof value !== 'string') continue;
          frequencies.set(value, (frequencies.get(value) ?? 0) + 1);
          if (bytes.includes(Buffer.from(value, 'utf8'))) passed = false;
        }
        const counts = [...frequencies.values()].sort((left, right) => left - right);
        const forbiddenKeys = new Set([
          'privateKey', 'publicKey', 'signature', 'authorization', 'proof',
          'paymentPayload', 'signingBytes',
        ]);
        const visit = value => {
          if (value === null || typeof value !== 'object') return;
          for (const [key, child] of Object.entries(value)) {
            if (forbiddenKeys.has(key)) passed = false;
            visit(child);
          }
        };
        visit(envelope);
        passed = passed
          && exactKeys(envelope, [
            'physicalVersion', 'revision', 'ledgerState', 'executionState', 'checksum',
          ])
          && envelope.physicalVersion === 2
          && envelope.revision === 11
          && envelope.executionState === null
          && envelope.checksum === expectedChecksum
          && row.envelope === canonicalJson(envelope)
          && Array.isArray(state?.offers) && state.offers.length === 1
          && Array.isArray(state?.grants) && state.grants.length === 1
          && grant.lifecycle === 'ACTIVE'
          && grant.totalUnits === 7
          && grant.consumedUnits === 6
          && grant.heldUnits === 0
          && grant.availableUnits === 1
          && grant.totalUnits === grant.consumedUnits + grant.heldUnits + grant.availableUnits
          && Array.isArray(requests) && requests.length === 3
          && requests.every(request => request.state === 'SUCCEEDED' && request.costUnits === 2)
          && new Set(requests.map(request => request.requestId)).size === 3
          && settlementCalls === 1
          && executionCalls === 3
          && authorizationAttempts.length === 4
          && frequencies.size === 3
          && JSON.stringify(counts) === JSON.stringify([1, 1, 2])
          && !JSON.stringify(envelope).includes('ServiceCredit ');
      } catch {
        passed = false;
      }
      if (retainedDatabase !== null) {
        originalFs.rmSync(dirname(retainedDatabase), { recursive: true, force: true });
      }
      if (originalFs.readdirSync(process.env.TMPDIR).length !== 0) passed = false;
      if (!passed) process.exit(1);
      originalFs.writeSync(1, 'SCENARIO_LEDGER=PASS\\n');
    `;
    const result = moduleMockChild(source, parent);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, 'SCENARIO_LEDGER=PASS\n');
    assert.equal(result.stderr, '');
    assert.deepEqual(readdirSync(parent), []);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('timeout, disconnect, malformed response, and ambiguous completion never retry', async t => {
  for (const mode of ['timeout', 'disconnect', 'malformed', 'ambiguous']) {
    await t.test(mode, () => {
      const parent = privateTempParent(`service-credit-loopback-demo-${mode}-`);
      try {
        const source = `
          import { mock } from 'node:test';
          import { EventEmitter } from 'node:events';
          import * as originalFs from 'node:fs';
          const nativeSetTimeout = globalThis.setTimeout;
          let attempts = 0;
          let closes = 0;
          mock.method(globalThis, 'setTimeout', function boundedTimer(callback, milliseconds, ...args) {
            if (milliseconds === 2_000) {
              return Reflect.apply(nativeSetTimeout, globalThis, [callback, 10, ...args]);
            }
            return Reflect.apply(nativeSetTimeout, globalThis, [callback, milliseconds, ...args]);
          });
          const request = (_options, responseCallback) => {
            const outgoing = new EventEmitter();
            outgoing.destroy = () => {};
            outgoing.end = () => {
              attempts += 1;
              queueMicrotask(() => {
                if (${JSON.stringify(mode)} === 'timeout') return;
                if (${JSON.stringify(mode)} === 'disconnect') {
                  outgoing.emit('error', new Error('synthetic private disconnect'));
                  return;
                }
                const response = new EventEmitter();
                response.statusCode = ${JSON.stringify(mode)} === 'malformed' ? 302 : 200;
                response.headers = ${JSON.stringify(mode)} === 'malformed' ? {} : {
                  'cache-control': 'private, no-store, max-age=0',
                  'content-type': 'application/json',
                  vary: 'Authorization',
                  'x-content-type-options': 'nosniff',
                  'content-length': '58',
                  connection: 'close',
                };
                response.rawHeaders = ${JSON.stringify(mode)} === 'malformed' ? [] : [
                  'Cache-Control', 'private, no-store, max-age=0',
                  'Content-Type', 'application/json',
                  'Vary', 'Authorization',
                  'X-Content-Type-Options', 'nosniff',
                  'Content-Length', '58',
                  'Connection', 'close',
                ];
                responseCallback(response);
                if (${JSON.stringify(mode)} === 'ambiguous') {
                  response.emit('aborted');
                  return;
                }
                response.emit('end');
              });
            };
            return outgoing;
          };
          mock.module('node:http', { namedExports: { request } });
          mock.module(${JSON.stringify(LOOPBACK_URL)}, {
            namedExports: {
              createServiceCreditLoopbackServer: () => Object.freeze({
                start: Object.freeze(async () => Object.freeze({
                  origin: 'http://127.0.0.1:1',
                  path: '/service-credit/v1/execute',
                })),
                close: Object.freeze(async () => { closes += 1; }),
              }),
            },
          });
          const { runServiceCreditLoopbackDemo } = await import(${JSON.stringify(`${CORE_URL}?failure-${mode}`)});
          let fixed = false;
          try { await runServiceCreditLoopbackDemo(); } catch (error) {
            fixed = error?.code === 'SERVICE_CREDIT_LOOPBACK_DEMO_FAILED'
              && error?.stack === 'ServiceCreditLoopbackDemoError: SERVICE_CREDIT_LOOPBACK_DEMO_FAILED';
          }
          if (!fixed || attempts !== 1 || closes !== 1) process.exit(1);
          if (originalFs.readdirSync(process.env.TMPDIR).length !== 0) process.exit(1);
          originalFs.writeSync(1, 'NO_RETRY_FAILURE=PASS\\n');
        `;
        const result = moduleMockChild(source, parent);
        assert.equal(result.status, 0);
        assert.equal(result.stdout, 'NO_RETRY_FAILURE=PASS\n');
        assert.equal(result.stderr, '');
        assert.deepEqual(readdirSync(parent), []);
      } finally {
        rmSync(parent, { recursive: true, force: true });
      }
    });
  }
});

test('loopback close completes before store close and owned-file removal', () => {
  const parent = privateTempParent('service-credit-loopback-demo-close-order-');
  try {
    const source = `
      import { mock } from 'node:test';
      import * as originalFs from 'node:fs';
      let loopbackClosed = false;
      let storeClosed = false;
      const fsNames = [
        'chmodSync', 'closeSync', 'constants', 'fchmodSync', 'fstatSync',
        'fsyncSync', 'lstatSync', 'mkdtempSync', 'openSync', 'readFileSync',
        'readdirSync', 'realpathSync', 'rmdirSync', 'unlinkSync',
      ];
      const fsExports = Object.fromEntries(fsNames.map(key => [key, originalFs[key]]));
      fsExports.unlinkSync = (...args) => {
        if (!loopbackClosed || !storeClosed) throw new Error('unlink before closure');
        return Reflect.apply(originalFs.unlinkSync, originalFs, args);
      };
      mock.module('node:fs', { namedExports: fsExports });
      const originalLoopback = await import(${JSON.stringify(`${LOOPBACK_URL}?close-order-original`)});
      const { ServiceCreditSqliteStore } = await import(${JSON.stringify(STORE_URL)});
      const originalStoreClose = ServiceCreditSqliteStore.prototype.close;
      mock.method(ServiceCreditSqliteStore.prototype, 'close', function observedStoreClose(...args) {
        if (!loopbackClosed) throw new Error('store closed before loopback');
        storeClosed = true;
        return Reflect.apply(originalStoreClose, this, args);
      });
      mock.module(${JSON.stringify(LOOPBACK_URL)}, {
        namedExports: {
          createServiceCreditLoopbackServer: options => {
            const inner = originalLoopback.createServiceCreditLoopbackServer(options);
            return Object.freeze({
              start: inner.start,
              close: Object.freeze(async () => {
                await inner.close();
                loopbackClosed = true;
              }),
            });
          },
        },
      });
      const { runServiceCreditLoopbackDemo } = await import(${JSON.stringify(`${CORE_URL}?close-order`)});
      const summary = await runServiceCreditLoopbackDemo();
      if (summary.mode !== 'SYNTHETIC_LOOPBACK_ONLY' || !loopbackClosed || !storeClosed) process.exit(1);
      if (originalFs.readdirSync(process.env.TMPDIR).length !== 0) process.exit(1);
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

test('close uncertainty preserves the higher-level ledger for adjudication', () => {
  const parent = privateTempParent('service-credit-loopback-demo-quarantine-');
  try {
    const source = `
      import { mock } from 'node:test';
      import * as originalFs from 'node:fs';
      const originalLoopback = await import(${JSON.stringify(`${LOOPBACK_URL}?uncertain-original`)});
      const { ServiceCreditSqliteStore } = await import(${JSON.stringify(STORE_URL)});
      let storeCloseCalls = 0;
      const originalStoreClose = ServiceCreditSqliteStore.prototype.close;
      mock.method(ServiceCreditSqliteStore.prototype, 'close', function observedStoreClose(...args) {
        storeCloseCalls += 1;
        return Reflect.apply(originalStoreClose, this, args);
      });
      mock.module(${JSON.stringify(LOOPBACK_URL)}, {
        namedExports: {
          createServiceCreditLoopbackServer: options => {
            const inner = originalLoopback.createServiceCreditLoopbackServer(options);
            return Object.freeze({
              start: inner.start,
              close: Object.freeze(async () => {
                await inner.close();
                throw new Error('synthetic private close uncertainty');
              }),
            });
          },
        },
      });
      const { runServiceCreditLoopbackDemo } = await import(${JSON.stringify(`${CORE_URL}?close-uncertain`)});
      let fixed = false;
      try { await runServiceCreditLoopbackDemo(); } catch (error) {
        fixed = error?.code === 'SERVICE_CREDIT_LOOPBACK_DEMO_FAILED';
      }
      const entries = originalFs.readdirSync(process.env.TMPDIR);
      const preserved = entries.length === 1
        && originalFs.readdirSync(process.env.TMPDIR + '/' + entries[0]).includes('ledger.sqlite');
      if (!fixed || storeCloseCalls !== 0 || !preserved) process.exit(1);
      originalFs.rmSync(process.env.TMPDIR + '/' + entries[0], { recursive: true, force: true });
      originalFs.writeSync(1, 'CLOSE_UNCERTAINTY_QUARANTINED=PASS\\n');
    `;
    const result = moduleMockChild(source, parent);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, 'CLOSE_UNCERTAINTY_QUARANTINED=PASS\n');
    assert.equal(result.stderr, '');
    assert.deepEqual(readdirSync(parent), []);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('a swapped temporary directory is quarantined and never recursively deleted', async () => {
  await withTempParent(async parent => {
    const operation = runServiceCreditLoopbackDemo();
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

test('source closure, package command, active paths, and documentation stay bounded', () => {
  const closure = importClosure(CORE_PATH);
  const relativeFiles = [...closure.visited].map(path => relative(ROOT, path)).sort();
  assert.deepEqual(relativeFiles, [
    'src/canonical.js',
    'src/mock-payment.js',
    'src/service-credit-activation.js',
    'src/service-credit-capability.js',
    'src/service-credit-client.js',
    'src/service-credit-composition.js',
    'src/service-credit-execution-contract.js',
    'src/service-credit-http.js',
    'src/service-credit-loopback-demo.js',
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
  assert.doesNotMatch(source, /console\.|process\.(?:stdout|stderr)/);
  const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(
    packageJson.scripts['demo:service-credit-loopback'],
    'node src/service-credit-loopback-demo-cli.js',
  );
  assert.equal(packageJson.scripts['demo:service-credit'], 'node src/service-credit-demo-cli.js');
  for (const relativePath of [
    'src/demo.js',
    'src/service-credit-demo.js',
    'src/service-credit-demo-cli.js',
    'src/server-cli.js',
    'src/buyer.js',
    'src/buyer-cli.js',
    'src/resource-server.js',
  ]) {
    assert.equal(
      readFileSync(join(ROOT, relativePath), 'utf8').includes('service-credit-loopback-demo'),
      false,
    );
  }
  for (const relativePath of ['README.md', 'SECURITY.md', 'docs/IMPLEMENTATION_PLAN.md']) {
    const document = readFileSync(join(ROOT, relativePath), 'utf8');
    for (const required of [
      'npm run --silent demo:service-credit-loopback',
      'synthetic',
      'loopback',
      'plaintext',
      'unauthenticated',
      'disposable',
      'authenticated transport',
      'not a benchmark',
      'no retry',
      'Abrupt',
    ]) {
      assert.equal(document.includes(required), true);
    }
  }
});

test('CLI source uses only fixed synchronous descriptor writes', () => {
  const source = readFileSync(CLI_PATH, 'utf8');
  assert.match(source, /writeSync/);
  assert.doesNotMatch(source, /console\.|process\.(?:stdout|stderr)\.write/);
  assert.doesNotMatch(source, /error\.(?:message|stack)|JSON\.stringify\(error/);
});

test('package lock and dependencies remain untouched by the focused patch', () => {
  const changed = spawnSync('git', ['status', '--short'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
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

test('CLI descriptors can be closed without creating local artifacts', () => {
  const parent = privateTempParent('service-credit-loopback-demo-closed-both-');
  try {
    const source = `
      import { closeSync } from 'node:fs';
      closeSync(1);
      closeSync(2);
      process.argv = [process.execPath, ${JSON.stringify(CLI_PATH)}, 'unexpected'];
      await import(${JSON.stringify(`${pathToFileURL(CLI_PATH).href}?closed-both`)});
      await new Promise(resolveImmediate => setImmediate(resolveImmediate));
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
      cwd: ROOT,
      env: { ...process.env, TMPDIR: parent },
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    assert.equal(result.status, 1);
    assert.deepEqual(readdirSync(parent), []);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('temporary parent helper itself uses a private local boundary', () => {
  const parent = privateTempParent('service-credit-loopback-demo-private-');
  try {
    const descriptor = openSync(parent, 'r');
    closeSync(descriptor);
    assert.equal(isAbsolute(parent), true);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
