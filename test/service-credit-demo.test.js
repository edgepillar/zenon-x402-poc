import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runServiceCreditMockDemo } from '../src/service-credit-demo.js';

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(TEST_DIRECTORY, '..');
const CORE_PATH = join(ROOT, 'src', 'service-credit-demo.js');
const CLI_PATH = join(ROOT, 'src', 'service-credit-demo-cli.js');
const CORE_URL = pathToFileURL(CORE_PATH).href;
const MOCK_PAYMENT_URL = pathToFileURL(join(ROOT, 'src', 'mock-payment.js')).href;
const COMPOSITION_URL = pathToFileURL(join(ROOT, 'src', 'service-credit-composition.js')).href;
const EXPECTED_SUMMARY = Object.freeze({
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
const EXPECTED_OUTPUT = [
  'SERVICE_CREDIT_MOCK_DEMO_SUCCESS',
  'DEMO_VERSION=1',
  'MODE=OFFLINE_MOCK_ONLY',
  'MOCK_FUNDING_SETTLEMENTS=1',
  'SERVICE_REQUEST_ATTEMPTS=4',
  'UNIQUE_SERVICE_REQUESTS=3',
  'EXACT_REPLAYS=1',
  'APPLICATION_EXECUTIONS=3',
  'ADDITIONAL_MOCK_SETTLEMENTS=0',
  'UNITS_CONSUMED=6',
  'UNITS_REMAINING=1',
  'NETWORK_ACTIVITY=NONE',
  'TIMING_CLAIM=NONE',
  'BENCHMARK=NO',
  '',
].join('\n');
const FAILURE_OUTPUT = 'SERVICE_CREDIT_MOCK_DEMO_FAILED\n';
const MODULE_EDGE_PARSER = [
  "import { readFileSync } from 'node:fs';",
  "import { SourceTextModule } from 'node:vm';",
  "const parsed = new SourceTextModule(readFileSync(0, 'utf8'));",
  'process.stdout.write(JSON.stringify(',
  'parsed.moduleRequests.map(request => request.specifier)',
  '));',
].join('');
const DYNAMIC_IMPORT_GUARD = /\bimport(?:(?:\s+)|(?:\/\*[\s\S]*?\*\/)|(?:\/\/[^\r\n\u2028\u2029]*(?:\r\n?|\n|\u2028|\u2029|$)))*\(/u;

function privateTempParent(prefix = 'service-credit-demo-test-') {
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
  assert.equal(error?.name, 'ServiceCreditMockDemoError');
  assert.equal(error?.code, 'SERVICE_CREDIT_MOCK_DEMO_FAILED');
  assert.equal(error?.message, 'SERVICE_CREDIT_MOCK_DEMO_FAILED');
  assert.equal(error?.stack, 'ServiceCreditMockDemoError: SERVICE_CREDIT_MOCK_DEMO_FAILED');
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
  const specifiers = JSON.parse(parsed.stdout);
  assert.equal(Array.isArray(specifiers), true);
  assert.equal(specifiers.every(specifier => typeof specifier === 'string'), true);
  return specifiers;
}

function localImportSpecifiers(path) {
  return staticImportSpecifiers(readFileSync(path, 'utf8'));
}

function importClosure(entry) {
  const visited = new Set();
  const external = new Set();
  const pending = [entry];
  while (pending.length > 0) {
    const current = pending.pop();
    if (visited.has(current)) continue;
    visited.add(current);
    for (const specifier of localImportSpecifiers(current)) {
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

test('core import is inert and leaves a private temporary parent untouched', () => {
  const parent = privateTempParent('service-credit-demo-import-');
  try {
    const result = spawnSync(process.execPath, [
      '--input-type=module',
      '--eval',
      `await import(${JSON.stringify(CORE_URL)}); process.stdout.write('IMPORT_OK\\n');`,
    ], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: parent },
    });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, 'IMPORT_OK\n');
    assert.equal(result.stderr, '');
    assert.deepEqual(readdirSync(parent), []);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('module-edge extraction covers same-line imports and both re-export forms', () => {
  assert.deepEqual(staticImportSpecifiers([
    "const local = 1; import primary from 'module-default';",
    "import { named } from 'module-named'; import 'module-side-effect';",
    "export * from 'module-star-export';",
    "export { named as renamed } from 'module-named-export'; export { local };",
  ].join(' ')), [
    'module-default',
    'module-named',
    'module-side-effect',
    'module-star-export',
    'module-named-export',
  ]);
  for (const dynamicImport of [
    "const loaded = import('module-direct');",
    "const loaded = import \n\t ('module-whitespace');",
    "const loaded = import/*comment*/('module-block-comment');",
    "const loaded = import /* first */ \n /* second */ ('module-multiple-comments');",
    "const loaded = import // comment\n ('module-line-comment');",
  ]) {
    assert.throws(() => staticImportSpecifiers(dynamicImport));
  }
});

test('core import closure matches exact local-file and external-module allowlists', () => {
  const closure = importClosure(CORE_PATH);
  const relativeFiles = [...closure.visited].map(path => path.slice(ROOT.length + 1)).sort();
  assert.deepEqual(relativeFiles, [
    'src/canonical.js',
    'src/mock-payment.js',
    'src/service-credit-activation.js',
    'src/service-credit-capability.js',
    'src/service-credit-client.js',
    'src/service-credit-composition.js',
    'src/service-credit-demo.js',
    'src/service-credit-execution-contract.js',
    'src/service-credit-http.js',
    'src/service-credit-model.js',
    'src/service-credit-sqlite-store.js',
    'src/x402-wire.js',
  ]);
  assert.deepEqual([...closure.external].sort(), [
    'node:async_hooks',
    'node:crypto',
    'node:fs',
    'node:os',
    'node:path',
    'node:perf_hooks',
    'node:sqlite',
    'node:util',
  ]);
});

test('service-credit mock demo returns the exact frozen aggregate summary and removes its ledger', async () => {
  await withTempParent(async parent => {
    const summary = await runServiceCreditMockDemo();
    assert.deepEqual(summary, EXPECTED_SUMMARY);
    assert.equal(Object.isFrozen(summary), true);
    assert.deepEqual(Reflect.ownKeys(summary), Reflect.ownKeys(EXPECTED_SUMMARY));
    assert.deepEqual(readdirSync(parent), []);
  });
});

test('core rejects any argument before filesystem, key, or scenario effects', async () => {
  await withTempParent(async parent => {
    await assert.rejects(() => runServiceCreditMockDemo(undefined), assertFixedFailure);
    assert.deepEqual(readdirSync(parent), []);
  });
});

test('two direct runs have identical public output despite ephemeral randomness', () => {
  const firstParent = privateTempParent('service-credit-demo-cli-a-');
  const secondParent = privateTempParent('service-credit-demo-cli-b-');
  try {
    const first = directCli([], { env: { TMPDIR: firstParent } });
    const second = directCli([], { env: { TMPDIR: secondParent } });
    for (const result of [first, second]) {
      assert.equal(result.status, 0);
      assert.equal(result.stdout, EXPECTED_OUTPUT);
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

test('direct CLI rejects arguments with fixed stderr and no filesystem effects', () => {
  const parent = privateTempParent('service-credit-demo-cli-failure-');
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

test('direct CLI contains a real closed stdout pipe without a raw diagnostic', async () => {
  const parent = privateTempParent('service-credit-demo-closed-stdout-');
  try {
    const result = await new Promise((resolveResult, rejectResult) => {
      const child = spawn(process.execPath, [CLI_PATH], {
        cwd: ROOT,
        encoding: 'utf8',
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

test('direct CLI falls back to nonzero status when stderr is closed', () => {
  const parent = privateTempParent('service-credit-demo-closed-stderr-');
  try {
    const source = `
      import { closeSync } from 'node:fs';
      closeSync(2);
      process.argv = [process.execPath, ${JSON.stringify(CLI_PATH)}, 'unexpected'];
      await import(${JSON.stringify(`${pathToFileURL(CLI_PATH).href}?closed-stderr`)});
      await new Promise(resolveImmediate => setImmediate(resolveImmediate));
    `;
    const result = spawnSync(process.execPath, [
      '--input-type=module',
      '--eval',
      source,
    ], {
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

test('global fetch and WebSocket hooks are never consulted by the demo', async t => {
  const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  const webSocketDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
  let calls = 0;
  const forbidden = () => {
    calls += 1;
    throw new Error('forbidden network primitive');
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
    assert.deepEqual(await runServiceCreditMockDemo(), EXPECTED_SUMMARY);
  });
  assert.equal(calls, 0);
});

test('a swapped temporary directory is quarantined and never recursively deleted', async () => {
  await withTempParent(async parent => {
    const operation = runServiceCreditMockDemo();
    const entries = readdirSync(parent);
    assert.equal(entries.length, 1);
    const owned = join(parent, entries[0]);
    const preserved = join(parent, 'preserved-original');
    renameSync(owned, preserved);
    mkdirSync(owned, { mode: 0o700 });
    await assert.rejects(() => operation, assertFixedFailure);
    assert.equal(existsSync(owned), true);
    assert.equal(existsSync(preserved), true);
    assert.deepEqual(readdirSync(owned), []);
  });
});

test('a late private-ledger inspection failure still removes the verified owned directory', () => {
  const parent = privateTempParent('service-credit-demo-late-failure-');
  try {
    const source = `
      import { mock } from 'node:test';
      import * as originalFs from 'node:fs';
      const names = [
        'chmodSync', 'closeSync', 'constants', 'fchmodSync', 'fstatSync',
        'fsyncSync', 'lstatSync', 'mkdtempSync', 'openSync', 'readFileSync',
        'readdirSync', 'realpathSync', 'rmdirSync', 'unlinkSync',
      ];
      const namedExports = Object.fromEntries(names.map(key => [key, originalFs[key]]));
      namedExports.readFileSync = (...args) => {
        if (typeof args[0] === 'string' && args[0].endsWith('/ledger.sqlite')) {
          throw new Error('synthetic');
        }
        return Reflect.apply(originalFs.readFileSync, originalFs, args);
      };
      mock.module('node:fs', { namedExports });
      const { runServiceCreditMockDemo } = await import(${JSON.stringify(`${CORE_URL}?late-failure`)});
      let fixed = false;
      try { await runServiceCreditMockDemo(); } catch (error) {
        fixed = error?.code === 'SERVICE_CREDIT_MOCK_DEMO_FAILED'
          && error?.stack === 'ServiceCreditMockDemoError: SERVICE_CREDIT_MOCK_DEMO_FAILED';
      }
      if (!fixed || originalFs.readdirSync(process.env.TMPDIR).length !== 0) process.exit(1);
      process.stdout.write('LATE_FAILURE_CLEANUP=PASS\\n');
    `;
    const result = moduleMockChild(source, parent);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, 'LATE_FAILURE_CLEANUP=PASS\n');
    assert.equal(result.stderr, '');
    assert.deepEqual(readdirSync(parent), []);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('the retained final ledger independently proves the scenario and strict persistence boundary', () => {
  const parent = privateTempParent('service-credit-demo-ledger-');
  try {
    const source = `
      import { mock } from 'node:test';
      import * as originalCrypto from 'node:crypto';
      import * as originalFs from 'node:fs';
      import { dirname } from 'node:path';
      import { DatabaseSync } from 'node:sqlite';

      let retainedDatabase = null;
      let capabilityAndPaymentKeyPairs = 0;
      let capabilityAndPaymentSignatures = 0;
      let mockClientConstructions = 0;
      let settlementCalls = 0;
      let executionCalls = 0;
      const authorizationAttempts = [];
      const canaries = new Set();
      const captureCanary = value => {
        if (typeof value === 'string' && value.length > 0) canaries.add(value);
      };
      const capturePublicKey = publicKey => {
        const encoded = publicKey.export({ type: 'spki', format: 'der' });
        captureCanary(encoded.toString('base64'));
        captureCanary(encoded.toString('base64url'));
        captureCanary(encoded.subarray(-32).toString('base64url'));
      };
      const generateKeyPairSync = (...args) => {
        capabilityAndPaymentKeyPairs += 1;
        const pair = Reflect.apply(originalCrypto.generateKeyPairSync, originalCrypto, args);
        capturePublicKey(pair.publicKey);
        return pair;
      };
      const sign = (...args) => {
        capabilityAndPaymentSignatures += 1;
        const signature = Reflect.apply(originalCrypto.sign, originalCrypto, args);
        captureCanary(signature.toString('base64'));
        captureCanary(signature.toString('base64url'));
        return signature;
      };
      mock.module('node:crypto', {
        defaultExport: {
          createHash: originalCrypto.createHash,
          createPublicKey: originalCrypto.createPublicKey,
          generateKeyPairSync,
          randomBytes: originalCrypto.randomBytes,
          sign,
          verify: originalCrypto.verify,
        },
        namedExports: {
          createHash: originalCrypto.createHash,
          createPublicKey: originalCrypto.createPublicKey,
          generateKeyPairSync,
          hash: originalCrypto.hash,
          sign,
          timingSafeEqual: originalCrypto.timingSafeEqual,
          verify: originalCrypto.verify,
        },
      });

      const names = [
        'chmodSync', 'closeSync', 'constants', 'fchmodSync', 'fstatSync',
        'fsyncSync', 'lstatSync', 'mkdtempSync', 'openSync', 'readFileSync',
        'readdirSync', 'realpathSync', 'rmdirSync', 'unlinkSync',
      ];
      const namedExports = Object.fromEntries(names.map(key => [key, originalFs[key]]));
      namedExports.unlinkSync = path => {
        if (typeof path === 'string' && path.endsWith('/ledger.sqlite')) {
          retainedDatabase = path;
          throw new Error('retain');
        }
        return originalFs.unlinkSync(path);
      };
      mock.module('node:fs', { namedExports });

      const originalPayment = await import(
        ${JSON.stringify(`${MOCK_PAYMENT_URL}?instrumentation-original`)}
      );
      const originalComposition = await import(
        ${JSON.stringify(`${COMPOSITION_URL}?instrumentation-original`)}
      );
      class InstrumentedMockClient extends originalPayment.MockExactZenonClient {
        constructor(...args) {
          super(...args);
          mockClientConstructions += 1;
          captureCanary(this.publicKeyDerB64);
        }

        async createPaymentPayload(...args) {
          const payload = await super.createPaymentPayload(...args);
          captureCanary(payload.payload.transaction.publicKey);
          captureCanary(payload.payload.transaction.signature);
          return payload;
        }
      }
      class InstrumentedMockFacilitator extends originalPayment.MockExactZenonFacilitator {
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
          let authorization = null;
          const rawHeaders = request?.rawHeaders;
          if (Array.isArray(rawHeaders)) {
            for (let index = 0; index < rawHeaders.length; index += 2) {
              if (typeof rawHeaders[index] === 'string'
                  && rawHeaders[index].toLowerCase() === 'authorization') {
                authorization = rawHeaders[index + 1];
              }
            }
          }
          authorizationAttempts.push(authorization);
          captureCanary(authorization);
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
          MockExactZenonClient: InstrumentedMockClient,
          MockExactZenonFacilitator: InstrumentedMockFacilitator,
        },
      });
      mock.module(${JSON.stringify(COMPOSITION_URL)}, {
        namedExports: {
          createServiceCreditCompositionOwner: createInstrumentedOwner,
        },
      });

      const { runServiceCreditMockDemo } = await import(${JSON.stringify(`${CORE_URL}?ledger-inspection`)});
      let fixed = false;
      try { await runServiceCreditMockDemo(); } catch (error) {
        fixed = error?.code === 'SERVICE_CREDIT_MOCK_DEMO_FAILED';
      }
      let passed = fixed && retainedDatabase !== null;
      try {
        const databaseBytes = originalFs.readFileSync(retainedDatabase);
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
        const envelopeKeys = [
          'physicalVersion', 'revision', 'ledgerState', 'executionState', 'checksum',
        ];
        const stateKeys = ['schemaVersion', 'modelVersion', 'offers', 'grants', 'requests'];
        const offerKeys = [
          'modelVersion', 'providerId', 'serviceId', 'resourceId', 'resourceBinding',
          'offerId', 'offerVersion', 'costPolicyId', 'fundingPolicyId',
          'fundingPolicyVersion',
        ];
        const grantKeys = [
          'grantId', 'modelVersion', 'activationId', 'activation',
          'sourceSettlementId', 'transactionId', 'providerId', 'serviceId',
          'resourceId', 'offerId', 'offerVersion', 'holderId',
          'capabilityCommitment', 'totalUnits', 'expiresAt', 'paymentIntent',
          'lifecycle', 'availableUnits', 'heldUnits', 'consumedUnits',
        ];
        const activationKeys = [
          'activationId', 'activationVersion', 'authorityProfileId',
          'authorityProfileVersion', 'verifierVersion', 'authorityRecordDigest',
          'fundingPolicyId', 'fundingPolicyVersion', 'sourceSettlementId',
          'transactionId', 'providerId', 'serviceId', 'resourceId',
          'resourceBinding', 'offerId', 'offerVersion', 'holderId',
          'capabilityCommitment', 'totalUnits', 'expiresAt', 'scheme',
          'paymentFlow', 'network', 'chainProfile', 'asset', 'amount', 'payee',
          'payer', 'paymentResourceDigest', 'paymentRequirementDigest',
          'paymentIntentDigest', 'grantFundingCommitment', 'evidenceState',
          'confirmationPolicy',
        ];
        const requestKeys = [
          'modelVersion', 'grantId', 'requestId', 'requestDigest', 'offerId',
          'offerVersion', 'method', 'routeId', 'canonicalBodyDigest',
          'selectedContentType', 'maxCostUnits', 'costUnits', 'state',
          'cachedResult',
        ];
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
        const authorizationFrequencies = new Map();
        for (const authorization of authorizationAttempts) {
          if (typeof authorization !== 'string') continue;
          authorizationFrequencies.set(
            authorization,
            (authorizationFrequencies.get(authorization) ?? 0) + 1,
          );
        }
        const authorizationCounts = [...authorizationFrequencies.values()]
          .sort((left, right) => left - right);
        passed = passed
          && exactKeys(envelope, envelopeKeys)
          && envelope.physicalVersion === 2
          && envelope.revision === 11
          && envelope.executionState === null
          && envelope.checksum === expectedChecksum
          && row.envelope === canonicalJson(envelope)
          && exactKeys(state, stateKeys)
          && state.schemaVersion === 2
          && state.modelVersion === 1
          && Array.isArray(state.offers)
          && state.offers.length === 1
          && exactKeys(state.offers[0], offerKeys)
          && Array.isArray(state.grants)
          && state.grants.length === 1
          && exactKeys(grant, grantKeys)
          && exactKeys(grant.activation, activationKeys)
          && grant.activation.activationId === grant.activationId
          && exactKeys(grant.activation.chainProfile, [
            'version', 'chainIdentifier', 'genesisMomentumHash',
          ])
          && exactKeys(grant.activation.confirmationPolicy, [
            'policyId', 'policyVersion', 'minimumConfirmations',
          ])
          && exactKeys(grant.paymentIntent, ['intentId', 'requirementId'])
          && grant.lifecycle === 'ACTIVE'
          && grant.totalUnits === 7
          && grant.consumedUnits === 6
          && grant.heldUnits === 0
          && grant.availableUnits === 1
          && grant.totalUnits === grant.consumedUnits + grant.heldUnits + grant.availableUnits
          && Array.isArray(requests)
          && requests.length === 3
          && requests.every(request => exactKeys(request, requestKeys))
          && requests.every(request => request.state === 'SUCCEEDED')
          && requests.every(request => request.costUnits === 2)
          && requests.every(request => exactKeys(request.cachedResult, [
            'statusCode', 'contentType', 'resultCode',
          ]))
          && JSON.stringify(requests.map(request => request.requestId))
            === JSON.stringify(['request.demo.a', 'request.demo.b', 'request.demo.c'])
          && mockClientConstructions === 1
          && settlementCalls === 1
          && executionCalls === 3
          && authorizationAttempts.length === 4
          && authorizationFrequencies.size === 3
          && JSON.stringify(authorizationCounts) === JSON.stringify([1, 1, 2])
          && capabilityAndPaymentKeyPairs === 2
          && capabilityAndPaymentSignatures === 4
          && canaries.size >= 8;
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
        if (JSON.stringify(envelope).includes('ServiceCredit ')) passed = false;
        for (const canary of canaries) {
          if (databaseBytes.includes(Buffer.from(canary, 'utf8'))) passed = false;
        }
      } catch {
        passed = false;
      }
      if (retainedDatabase !== null) {
        originalFs.rmSync(dirname(retainedDatabase), { recursive: true, force: true });
      }
      if (originalFs.readdirSync(process.env.TMPDIR).length !== 0) passed = false;
      if (!passed) process.exit(1);
      originalFs.writeSync(1, 'PERSISTED_SCENARIO_AND_PRIVACY=PASS\\n');
    `;
    const result = moduleMockChild(source, parent);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, 'PERSISTED_SCENARIO_AND_PRIVACY=PASS\n');
    assert.equal(result.stderr, '');
    assert.deepEqual(readdirSync(parent), []);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('package script and documentation preserve the isolated non-benchmark boundary', () => {
  const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['demo:service-credit'], 'node src/service-credit-demo-cli.js');
  assert.equal(packageJson.scripts.demo, 'node src/demo.js');
  assert.equal(packageJson.scripts.server, 'node src/server-cli.js');
  assert.equal(packageJson.scripts.buyer, 'node src/buyer-cli.js');
  assert.equal(packageJson.scripts.test, 'node --test');
  const demoSource = readFileSync(CORE_PATH, 'utf8');
  assert.equal(
    demoSource.includes("import { createServiceCreditAuthorization } from './service-credit-client.js';"),
    true,
  );
  assert.equal(demoSource.includes('const authorization = `ServiceCredit ${'), false);
  for (const path of [
    join(ROOT, 'README.md'),
    join(ROOT, 'SECURITY.md'),
    join(ROOT, 'docs', 'IMPLEMENTATION_PLAN.md'),
  ]) {
    const document = readFileSync(path, 'utf8');
    assert.equal(document.includes('npm run --silent demo:service-credit'), true);
    assert.equal(document.includes('not a benchmark'), true);
    assert.equal(document.includes('three unique'), true);
    assert.equal(document.includes('exact replay'), true);
    assert.equal(document.includes('not additional Zenon transfers or x402 settlements'), true);
    assert.equal(
      document.includes('The filesystem boundary requires a POSIX reliable local filesystem'),
      true,
    );
    assert.equal(
      document.toLowerCase().includes('client-key generation, recovery, and lifecycle'),
      true,
    );
    assert.equal(document.toLowerCase().includes('not implemented'), true);
    assert.equal(document.includes('createServiceCreditAuthorization'), true);
    assert.equal(
      document.includes('bearer-like single-request credential material'),
      true,
    );
    assert.equal(document.includes('authenticated future transport'), true);
    assert.equal(document.includes('JavaScript strings cannot be reliably erased'), true);
    assert.equal(
      document.includes('Successful serialization proves only cryptographic consistency'),
      true,
    );
    assert.equal(document.includes('header payload contains only the six-field proof'), true);
    assert.equal(document.includes('identical out-of-band request context'), true);
    assert.equal(document.includes('route `service-credit.execute.v1`'), true);
    assert.equal(
      document.includes('shared client-and-handler wire module is a possible later refactor'),
      true,
    );
  }
});
