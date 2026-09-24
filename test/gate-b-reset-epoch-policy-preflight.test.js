import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

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

test('module import is selector-only, effect-free, default-off, and unreachable from active entrypoints', () => {
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
  assert.equal(packageText.includes(MODULE_NAME), false);

  const roots = new Set([
    '../src/buyer.js',
    '../src/resource-server.js',
    '../src/zenon-payment.js',
  ].map(path => new URL(path, import.meta.url).href));
  for (const script of Object.values(packageJson.scripts)) {
    if (script === 'node --test') continue;
    const match = /^node (src\/[A-Za-z0-9._/-]+\.js)$/.exec(script);
    assert.ok(match);
    roots.add(new URL(`../${match[1]}`, import.meta.url).href);
  }

  const visited = new Set();
  const pending = [...roots];
  while (pending.length > 0) {
    const href = pending.pop();
    if (visited.has(href)) continue;
    visited.add(href);
    assert.equal(href.endsWith(`/${MODULE_NAME}`), false);
    const url = new URL(href);
    if (!existsSync(url)) continue;
    const activeSource = readFileSync(url, 'utf8');
    assert.equal(activeSource.includes(MODULE_NAME), false);
    for (const match of activeSource.matchAll(
      /(?:from\s+|import\s*(?:\(\s*)?)['"](\.[^'"]+)['"]/g,
    )) {
      const dependency = new URL(match[1], url);
      if (dependency.pathname.endsWith('.js')) pending.push(dependency.href);
    }
  }
});
