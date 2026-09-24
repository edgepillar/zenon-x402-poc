import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import * as preflightModule from '../src/gate-b-reset-epoch-policy-preflight.js';
import {
  PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_EVENT_ID,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_PROFILE_NAME,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_WSS_ACKNOWLEDGEMENT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_WSS_ENDPOINT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ACKNOWLEDGEMENT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
  TESTNET_LIVE_ACKNOWLEDGEMENT,
} from '../src/zenon/operator-trusted-testnet-profile.js';

const { parseGateBResetEpochPolicyPreflight } = preflightModule;
const ERROR_CODE = 'gate_b_reset_epoch_policy_preflight_invalid';
const MODULE_NAME = 'gate-b-reset-epoch-policy-preflight.js';
const CLI_MODULE_NAME = 'gate-b-reset-epoch-policy-preflight-cli.js';
const ENTRY_MODULE_NAME = 'gate-b-reset-epoch-pre-wallet-entry-v3.js';
const OPERATOR_V3_CLI_MODULE_NAME = 'gate-b-reset-epoch-operator-v3-cli.js';
const CLI_SCRIPT_NAME = 'preflight:gate-b-reset-epoch-policy';
const CLI_SUCCESS =
  'GATE_B_RESET_EPOCH_POLICY_PREFLIGHT_VALID_RUN_NOT_AUTHORIZED\n';
const CLI_FAILURE =
  'GATE_B_RESET_EPOCH_POLICY_PREFLIGHT_INVALID_RUN_NOT_AUTHORIZED\n';
const CLI_URL = new URL(`../src/${CLI_MODULE_NAME}`, import.meta.url);

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function resetEpochSelection(overrides = {}) {
  return {
    eventId: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
    liveAcknowledgement: TESTNET_LIVE_ACKNOWLEDGEMENT,
    operatorTrustAcknowledgement:
      PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
    profileName: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
    rpcEndpoint: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
    wssAcknowledgement:
      PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ACKNOWLEDGEMENT,
    ...overrides,
  };
}

function preflightText(options = {}) {
  const preflightVersion = Object.hasOwn(options, 'preflightVersion')
    ? options.preflightVersion
    : 1;
  const policySelection = Object.hasOwn(options, 'policySelection')
    ? options.policySelection
    : resetEpochSelection();
  return canonicalJson({
    policySelection,
    preflightVersion,
  });
}

function assertSanitizedFailure(input) {
  assert.throws(
    () => parseGateBResetEpochPolicyPreflight(input),
    error => {
      assert.equal(error?.name, 'GateBResetEpochPolicyPreflightError');
      assert.equal(error?.code, ERROR_CODE);
      assert.equal(error?.message, ERROR_CODE);
      assert.equal(error?.stack, undefined);
      assert.equal(error?.cause, undefined);
      return true;
    },
  );
}

function containsFunction(value) {
  if (typeof value === 'function') return true;
  if (value === null || typeof value !== 'object') return false;
  return Object.values(value).some(containsFunction);
}

function runCli(input, args = []) {
  return spawnSync(process.execPath, [fileURLToPath(CLI_URL), ...args], {
    encoding: null,
    input,
    maxBuffer: 16 * 1024,
    timeout: 5_000,
  });
}

function assertCliFailure(input, args = []) {
  const result = runCli(input, args);
  assert.equal(result.signal, null);
  assert.notEqual(result.status, 0);
  assert.deepEqual(result.stdout, Buffer.alloc(0));
  assert.deepEqual(result.stderr, Buffer.from(CLI_FAILURE));
  assert.equal(result.error, undefined);
}

test('canonical v1 input returns only a deeply frozen inert RUN_NOT_AUTHORIZED descriptor', () => {
  const input = preflightText();
  const result = parseGateBResetEpochPolicyPreflight(input);
  const repeated = parseGateBResetEpochPolicyPreflight(input);

  assert.deepEqual(Object.keys(preflightModule), [
    'parseGateBResetEpochPolicyPreflight',
  ]);
  assert.deepEqual(result, {
    policySelection: resetEpochSelection(),
    preflightVersion: 1,
    status: 'RUN_NOT_AUTHORIZED',
  });
  assert.notEqual(result, repeated);
  assert.notEqual(result.policySelection, repeated.policySelection);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.policySelection), true);
  assert.equal(containsFunction(result), false);
  assert.equal(Object.hasOwn(result, 'policy'), false);
  assert.equal(Object.hasOwn(result, 'run'), false);
  assert.equal(Object.hasOwn(result, 'runAuthorized'), false);
  assert.equal(Object.hasOwn(result, 'paymentAuthorized'), false);
  assert.equal(Object.hasOwn(result, 'observeChainTrust'), false);
  assert.throws(() => { result.status = 'AUTHORIZED'; }, TypeError);
  assert.throws(() => { result.policySelection.rpcEndpoint = 'changed'; }, TypeError);
});

test('v1 rejects duplicate keys, extra fields, aliases, and noncanonical JSON', () => {
  const canonical = preflightText();
  const endpointMember = `"rpcEndpoint":${JSON.stringify(
    PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
  )}`;

  for (const input of [
    canonical.replace(
      '"preflightVersion":1',
      '"preflightVersion":1,"preflightVersion":1',
    ),
    canonical.replace(endpointMember, `${endpointMember},${endpointMember}`),
    canonicalJson({
      policySelection: resetEpochSelection(),
      preflightVersion: 1,
      runAuthorized: false,
    }),
    canonicalJson({
      policySelection: resetEpochSelection({ credentials: 'placeholder' }),
      preflightVersion: 1,
    }),
    canonicalJson({
      policySelection: {
        ...resetEpochSelection(),
        evidenceWssEndpoint:
          PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
      },
      preflightVersion: 1,
    }),
    canonicalJson({
      policySelection: {
        eventId: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
        liveAcknowledgement: TESTNET_LIVE_ACKNOWLEDGEMENT,
        operatorTrustAcknowledgement:
          PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
        profileName: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
        wssAcknowledgement:
          PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ACKNOWLEDGEMENT,
        wssEndpoint: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
      },
      preflightVersion: 1,
    }),
    ` ${canonical}`,
    `${canonical}\n`,
    JSON.stringify({
      preflightVersion: 1,
      policySelection: resetEpochSelection(),
    }),
    canonical.replace('"preflightVersion":1', '"preflightVersion":1.0'),
    canonical.replace('public-testnet', '\\u0070ublic-testnet'),
  ]) {
    assertSanitizedFailure(input);
  }
});

test('preflight v1 rejects the prior epoch and every mixed reset/prior tuple', () => {
  const priorEpoch = {
    eventId: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_EVENT_ID,
    liveAcknowledgement: TESTNET_LIVE_ACKNOWLEDGEMENT,
    operatorTrustAcknowledgement:
      PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
    profileName: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_PROFILE_NAME,
    rpcEndpoint: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_WSS_ENDPOINT,
    wssAcknowledgement:
      PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_WSS_ACKNOWLEDGEMENT,
  };
  const priorValues = Object.entries(priorEpoch);
  const resetEpoch = resetEpochSelection();

  assertSanitizedFailure(preflightText({ policySelection: priorEpoch }));
  for (const [field, value] of priorValues) {
    if (resetEpoch[field] === value) continue;
    assertSanitizedFailure(preflightText({
      policySelection: resetEpochSelection({ [field]: value }),
    }));
  }
});

test('credentials, protocol substitutions, endpoint mutations, and altered acknowledgements reject', () => {
  for (const rpcEndpoint of [
    'ws://rpc.testnet.zenon.info',
    'https://rpc.testnet.zenon.info',
    'wss://placeholder:placeholder@rpc.testnet.zenon.info',
    `${PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT}/`,
    `${PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT}:443`,
    `${PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT}?credential=placeholder`,
    `${PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT}#fragment`,
  ]) {
    assertSanitizedFailure(preflightText({
      policySelection: resetEpochSelection({ rpcEndpoint }),
    }));
  }

  for (const [field, value] of [
    ['operatorTrustAcknowledgement',
      `${PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT}_ALTERED`],
    ['liveAcknowledgement', `${TESTNET_LIVE_ACKNOWLEDGEMENT}_ALTERED`],
    ['wssAcknowledgement',
      `${PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ACKNOWLEDGEMENT}_ALTERED`],
  ]) {
    assertSanitizedFailure(preflightText({
      policySelection: resetEpochSelection({ [field]: value }),
    }));
  }
});

test('malformed types, missing fields, wrong versions, and oversized text use one error', () => {
  for (const input of [
    undefined,
    null,
    Buffer.from(preflightText()),
    { preflightVersion: 1, policySelection: resetEpochSelection() },
    '',
    ' '.repeat(4096),
    '{}',
    'null',
    '[]',
    preflightText({ preflightVersion: 0 }),
    preflightText({ preflightVersion: 2 }),
    preflightText({ preflightVersion: '1' }),
    preflightText({ policySelection: null }),
    preflightText({ policySelection: [] }),
    preflightText({ policySelection: 'reset-epoch' }),
  ]) {
    assertSanitizedFailure(input);
  }

  for (const field of Object.keys(resetEpochSelection())) {
    const missing = resetEpochSelection();
    delete missing[field];
    assertSanitizedFailure(preflightText({ policySelection: missing }));
    for (const value of [null, true, 1, {}]) {
      assertSanitizedFailure(preflightText({
        policySelection: resetEpochSelection({ [field]: value }),
      }));
    }
  }
});

test('package exposes only the exact bounded reset-epoch preflight script mapping', () => {
  const packageJson = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  );
  const expected = `node src/${CLI_MODULE_NAME}`;

  assert.equal(packageJson.scripts[CLI_SCRIPT_NAME], expected);
  assert.deepEqual(
    Object.entries(packageJson.scripts).filter(([, command]) =>
      command.includes(CLI_MODULE_NAME)),
    [[CLI_SCRIPT_NAME, expected]],
  );
});

test('CLI import is inert and its only local dependency is the pure parser', () => {
  const imported = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `await import(${JSON.stringify(CLI_URL.href)})`,
    ],
    { encoding: null, maxBuffer: 16 * 1024, timeout: 5_000 },
  );
  assert.equal(imported.status, 0);
  assert.equal(imported.signal, null);
  assert.deepEqual(imported.stdout, Buffer.alloc(0));
  assert.deepEqual(imported.stderr, Buffer.alloc(0));
  assert.equal(imported.error, undefined);

  const source = readFileSync(CLI_URL, 'utf8');
  const imports = [
    ...source.matchAll(/from\s+['"]([^'"]+)['"]/g),
  ].map(match => match[1]);
  assert.deepEqual(imports, [
    'node:buffer',
    'node:fs',
    'node:url',
    'node:util',
    `./${MODULE_NAME}`,
  ]);
  assert.doesNotMatch(
    source,
    /process\.env|node:(?:https?|http2|net|tls|dns|child_process|worker_threads)|\bfetch\s*\(|\bWebSocket\b|\.listen\s*\(|\.connect\s*\(|\b(?:spawn|execFile|fork)\s*\(|Docker|znn-typescript-sdk|wallet|signer|signing|payment|publication|controller|RUN handoff/i,
  );
});

test('CLI accepts one canonical document through short reads and emits one fixed success line', async () => {
  const input = Buffer.from(preflightText());
  async function* shortReads() {
    for (let index = 0; index < input.length; index += 1) {
      yield input.subarray(index, index + 1);
    }
  }
  const stdout = [];
  const stderr = [];
  const { runGateBResetEpochPolicyPreflightCli } = await import(CLI_URL);
  const success = await runGateBResetEpochPolicyPreflightCli({
    argv: [],
    stdin: shortReads(),
    stdout: line => {
      stdout.push(line);
      return Buffer.byteLength(line);
    },
    stderr: line => {
      stderr.push(line);
      return Buffer.byteLength(line);
    },
  });

  assert.equal(success, true);
  assert.deepEqual(stdout, [CLI_SUCCESS]);
  assert.deepEqual(stderr, []);

  const direct = runCli(input);
  assert.equal(direct.status, 0);
  assert.equal(direct.signal, null);
  assert.deepEqual(direct.stdout, Buffer.from(CLI_SUCCESS));
  assert.deepEqual(direct.stderr, Buffer.alloc(0));
  assert.equal(direct.error, undefined);
});

test('CLI rejects malformed, oversized, noncanonical, prior, mixed, and non-UTF-8 input', async t => {
  const priorEpoch = {
    eventId: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_EVENT_ID,
    liveAcknowledgement: TESTNET_LIVE_ACKNOWLEDGEMENT,
    operatorTrustAcknowledgement:
      PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
    profileName: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_PROFILE_NAME,
    rpcEndpoint: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_WSS_ENDPOINT,
    wssAcknowledgement:
      PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_WSS_ACKNOWLEDGEMENT,
  };
  const valid = Buffer.from(preflightText());
  const cases = [
    ['malformed JSON', Buffer.from('{"policySelection":')],
    ['oversized stream', Buffer.alloc(2049, 0x20)],
    ['noncanonical trailing newline', Buffer.concat([valid, Buffer.from('\n')])],
    ['UTF-8 BOM', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), valid])],
    ['malformed UTF-8', Buffer.from([0x7b, 0x22, 0xc3, 0x28])],
    ['prior epoch', Buffer.from(preflightText({ policySelection: priorEpoch }))],
    ['mixed epoch', Buffer.from(preflightText({
      policySelection: resetEpochSelection({
        eventId: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_EVENT_ID,
      }),
    }))],
    ['parser-invalid extra field', Buffer.from(canonicalJson({
      policySelection: resetEpochSelection(),
      preflightVersion: 1,
      runAuthorized: false,
    }))],
  ];

  for (const [name, input] of cases) {
    await t.test(name, () => assertCliFailure(input));
  }
  await t.test('extra argument', () => assertCliFailure(valid, ['unexpected']));
});

test('CLI fails closed when fixed output cannot be written', async () => {
  const { runGateBResetEpochPolicyPreflightCli } = await import(CLI_URL);
  const stderr = [];
  const success = await runGateBResetEpochPolicyPreflightCli({
    argv: [],
    stdin: [Buffer.from(preflightText())],
    stdout: () => {
      throw new Error('unreported stdout failure');
    },
    stderr: line => {
      stderr.push(line);
      return Buffer.byteLength(line);
    },
  });

  assert.equal(success, false);
  assert.deepEqual(stderr, [CLI_FAILURE]);

  const shortWrite = await runGateBResetEpochPolicyPreflightCli({
    argv: [],
    stdin: [Buffer.from(preflightText())],
    stdout: () => 0,
    stderr: () => {
      throw new Error('unreported stderr failure');
    },
  });
  assert.equal(shortWrite, false);
});

test('only reset boundaries import the parser and ordinary runtime roots cannot reach them', () => {
  const moduleUrl = new URL(`../src/${MODULE_NAME}`, import.meta.url);
  const source = readFileSync(moduleUrl, 'utf8');
  const selectorSource = readFileSync(
    new URL('../src/zenon/operator-trusted-testnet-profile.js', import.meta.url),
    'utf8',
  );
  const imports = text => [
    ...text.matchAll(/from\s+['"]([^'"]+)['"]/g),
  ].map(match => match[1]);

  assert.deepEqual(imports(source), [
    './zenon/operator-trusted-testnet-profile.js',
  ]);
  assert.deepEqual(imports(selectorSource), ['node:util']);
  assert.doesNotMatch(
    source,
    /node:(?:fs|https?|http2|net|tls|dns|child_process|worker_threads)|process\.|\bfetch\s*\(|\bWebSocket\b|\.listen\s*\(|\.connect\s*\(|\b(?:spawn|execFile|fork)\s*\(|Docker|znn-typescript-sdk|wallet|signing|payment|publication/,
  );

  const packageText = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  const packageJson = JSON.parse(packageText);
  const sourceDirectory = new URL('../src/', import.meta.url);
  const directImporters = readdirSync(sourceDirectory)
    .filter(name => name.endsWith('.js'))
    .filter(name => imports(readFileSync(new URL(name, sourceDirectory), 'utf8'))
      .includes(`./${MODULE_NAME}`))
    .sort();
  assert.deepEqual(directImporters, [CLI_MODULE_NAME, ENTRY_MODULE_NAME]);
  assert.equal(
    readFileSync(new URL('../src/gate-b-operator-front-end.js', import.meta.url), 'utf8')
      .includes(OPERATOR_V3_CLI_MODULE_NAME),
    true,
  );

  const roots = new Set([
    '../src/buyer.js',
    '../src/resource-server.js',
    '../src/zenon-payment.js',
  ].map(path => new URL(path, import.meta.url).href));
  for (const [name, script] of Object.entries(packageJson.scripts)) {
    if (script === 'node --test') continue;
    const match = /^node (src\/[A-Za-z0-9._/-]+\.js)$/.exec(script);
    assert.ok(match);
    if (name === CLI_SCRIPT_NAME) continue;
    roots.add(new URL(`../${match[1]}`, import.meta.url).href);
  }

  const visited = new Set();
  const pending = [...roots];
  while (pending.length > 0) {
    const href = pending.pop();
    if (visited.has(href)) continue;
    visited.add(href);
    assert.equal(href.endsWith(`/${MODULE_NAME}`), false);
    assert.equal(href.endsWith(`/${CLI_MODULE_NAME}`), false);
    assert.equal(href.endsWith(`/${ENTRY_MODULE_NAME}`), false);
    const url = new URL(href);
    if (!existsSync(url)) continue;
    const activeSource = readFileSync(url, 'utf8');
    assert.equal(activeSource.includes(MODULE_NAME), false);
    assert.equal(activeSource.includes(CLI_MODULE_NAME), false);
    for (const match of activeSource.matchAll(
      /(?:from\s+|import\s*(?:\(\s*)?)['"](\.[^'"]+)['"]/g,
    )) {
      const dependency = new URL(match[1], url);
      if (dependency.pathname.endsWith('.js')) pending.push(dependency.href);
    }
  }
});
