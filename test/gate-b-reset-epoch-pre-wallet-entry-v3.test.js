import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as entryModule from '../src/gate-b-reset-epoch-pre-wallet-entry-v3.js';
import { launchGateBOperatorCoordinator } from '../src/gate-b-operator-coordinator-launcher.js';
import {
  GATE_B_OPERATOR_COORDINATOR_ACKNOWLEDGEMENTS,
  frameGateBOperatorCoordinatorRun,
} from '../src/gate-b-operator-coordinator-schema.js';
import {
  prepareGateBPublicWsInputsForReview,
} from '../src/gate-b-public-ws-inputs-controller.js';
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

const { bindGateBResetEpochPreWalletEntryV3 } = entryModule;
const ERROR_CODE = 'gate_b_reset_epoch_pre_wallet_entry_v3_invalid';
const MODULE_NAME = 'gate-b-reset-epoch-pre-wallet-entry-v3.js';

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
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

function priorEpochSelection() {
  return {
    eventId: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_EVENT_ID,
    liveAcknowledgement: TESTNET_LIVE_ACKNOWLEDGEMENT,
    operatorTrustAcknowledgement:
      PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
    profileName: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_PROFILE_NAME,
    rpcEndpoint: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_WSS_ENDPOINT,
    wssAcknowledgement:
      PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_WSS_ACKNOWLEDGEMENT,
  };
}

function policyPreflight(policySelection = resetEpochSelection(), preflightVersion = 1) {
  return canonicalJson({ policySelection, preflightVersion });
}

function entry(policyPreflightText = policyPreflightDefault()) {
  return {
    policyPreflight: policyPreflightText,
    schemaVersion: 3,
  };
}

function policyPreflightDefault() {
  return policyPreflight(resetEpochSelection());
}

function assertSanitizedFailure(value) {
  assert.throws(
    () => bindGateBResetEpochPreWalletEntryV3(value),
    error => {
      assert.equal(error?.name, 'GateBResetEpochPreWalletEntryV3Error');
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

function legacyEffectSpies() {
  const calls = [];
  const spy = name => (...args) => {
    calls.push([name, args.length]);
    return Promise.resolve(undefined);
  };
  return {
    calls,
    dependencies: {
      assertQuickTunnelReady: spy('tunnel-readiness'),
      launchPublicWsInputs: spy('provision-or-prepare'),
      launchQuickTunnel: spy('tunnel-launch'),
      preflightPublicWsOnce: spy('legacy-preflight'),
      runPublicWsOnce: spy('legacy-run'),
      stopQuickTunnel: spy('tunnel-stop'),
      waitQuickTunnelClosed: spy('tunnel-wait'),
    },
  };
}

test('exact schema v3 reset selection binds to one deeply frozen inert result', () => {
  const input = entry();
  const result = bindGateBResetEpochPreWalletEntryV3(input);
  const repeated = bindGateBResetEpochPreWalletEntryV3(input);

  assert.deepEqual(Object.keys(entryModule), [
    'bindGateBResetEpochOperatorBootstrapV3',
    'bindGateBResetEpochPreWalletEntryV3',
  ]);
  assert.deepEqual(result, {
    policySelection: resetEpochSelection(),
    preflightVersion: 1,
    schemaVersion: 3,
    status: 'RUN_NOT_AUTHORIZED',
  });
  assert.notEqual(result, repeated);
  assert.notEqual(result.policySelection, repeated.policySelection);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.policySelection), true);
  assert.equal(containsFunction(result), false);
  assert.equal(Object.hasOwn(result, 'policy'), false);
  assert.equal(Object.hasOwn(result, 'capability'), false);
  assert.equal(Object.hasOwn(result, 'run'), false);
  assert.equal(Object.hasOwn(result, 'runAuthorized'), false);
  assert.equal(Object.hasOwn(result, 'paymentAuthorized'), false);
  assert.throws(() => { result.status = 'AUTHORIZED'; }, TypeError);
  assert.throws(() => { result.policySelection.rpcEndpoint = 'changed'; }, TypeError);
});

test('malformed, stale, and mixed v3 entries fail closed through one sanitized error', () => {
  const prior = priorEpochSelection();
  const reset = resetEpochSelection();
  const mixed = Object.entries(prior)
    .filter(([field, value]) => reset[field] !== value)
    .map(([field, value]) => entry(policyPreflight(
      resetEpochSelection({ [field]: value }),
    )));
  const cases = [
    undefined,
    null,
    '',
    [],
    {},
    { policyPreflight: policyPreflightDefault() },
    { policyPreflight: policyPreflightDefault(), schemaVersion: 2 },
    { policyPreflight: policyPreflightDefault(), schemaVersion: 4 },
    { policyPreflight: policyPreflightDefault(), schemaVersion: '3' },
    { policyPreflight: policyPreflightDefault(), schemaVersion: 3, extra: false },
    { policyPreflight: Buffer.from(policyPreflightDefault()), schemaVersion: 3 },
    entry('{}'),
    entry(`${policyPreflightDefault()}\n`),
    entry(policyPreflight(resetEpochSelection(), 2)),
    entry(policyPreflight(prior)),
    ...mixed,
  ];

  for (const value of cases) assertSanitizedFailure(value);
});

test('hostile outer entries reject without invoking proxy or accessor traps', () => {
  const calls = [];
  const proxy = new Proxy({}, {
    get() { calls.push('get'); },
    getOwnPropertyDescriptor() { calls.push('descriptor'); },
    getPrototypeOf() { calls.push('prototype'); },
    ownKeys() { calls.push('keys'); },
  });
  assertSanitizedFailure(proxy);
  assert.deepEqual(calls, []);

  const accessor = { schemaVersion: 3 };
  Object.defineProperty(accessor, 'policyPreflight', {
    enumerable: true,
    get() {
      calls.push('policy-preflight');
      return policyPreflightDefault();
    },
  });
  assertSanitizedFailure(accessor);
  assert.deepEqual(calls, []);
});

test('valid v3 cannot enter the legacy controller, child launcher, or RUN frame', async () => {
  const input = entry();
  const result = bindGateBResetEpochPreWalletEntryV3(input);
  const legacy = legacyEffectSpies();
  let spawnCalls = 0;

  assert.equal(result.status, 'RUN_NOT_AUTHORIZED');
  await assert.rejects(
    prepareGateBPublicWsInputsForReview(input, legacy.dependencies),
    error => error?.code === 'gate_b_public_ws_inputs_controller_failed',
  );
  assert.deepEqual(legacy.calls, []);

  await assert.rejects(
    launchGateBOperatorCoordinator(input, {
      spawnProcess() {
        spawnCalls += 1;
      },
    }),
    error => error?.code === 'gate_b_operator_coordinator_launch_failed',
  );
  assert.equal(spawnCalls, 0);

  assert.throws(
    () => frameGateBOperatorCoordinatorRun({
      acknowledgement: GATE_B_OPERATOR_COORDINATOR_ACKNOWLEDGEMENTS.run,
      schemaVersion: 3,
    }),
    error => error?.code === 'gate_b_operator_coordinator_schema_invalid',
  );
  assert.deepEqual(legacy.calls, []);
});

test('v3 binding imports only pure validation and legacy effect paths do not import it', () => {
  const moduleUrl = new URL(`../src/${MODULE_NAME}`, import.meta.url);
  const source = readFileSync(moduleUrl, 'utf8');
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)]
    .map(match => match[1]);

  assert.deepEqual(imports, [
    'node:path',
    'node:util',
    './gate-b-reset-epoch-policy-preflight.js',
  ]);
  assert.doesNotMatch(
    source,
    /node:(?:fs|https?|http2|net|tls|dns|child_process|worker_threads)|process\.|\bfetch\s*\(|\bWebSocket\b|\.listen\s*\(|\.connect\s*\(|\b(?:spawn|execFile|fork)\s*\(|Docker|znn-typescript-sdk|\bwallet\b|\bsigner\b|\bsigning\b|\bpayment\b|\bpublication\b|\b(?:PROVISION_ENDPOINT|PREPARE|AUTHORIZE)\b/,
  );

  const legacyEffectPaths = [
    '../src/gate-b-operator-coordinator-cli.js',
    '../src/gate-b-operator-coordinator-launcher.js',
    '../src/gate-b-operator-coordinator-schema.js',
    '../src/gate-b-public-ws-inputs-controller.js',
    '../src/live-evidence-public-ws-once-run-child.js',
    '../src/live-evidence-public-ws-once-supervisor.js',
    '../src/live-evidence-runner.js',
  ];
  for (const path of legacyEffectPaths) {
    assert.equal(readFileSync(new URL(path, import.meta.url), 'utf8').includes(MODULE_NAME), false);
  }
});
