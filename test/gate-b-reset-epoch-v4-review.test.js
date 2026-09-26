import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GATE_B_QUICK_TUNNEL_ARTIFACT_MANIFEST,
  GATE_B_QUICK_TUNNEL_HOSTNAME_PERSISTENCE_POLICY,
  GATE_B_QUICK_TUNNEL_RUNTIME_CONTROL_POLICY,
  GATE_B_QUICK_TUNNEL_TELEMETRY_POLICIES,
} from '../src/gate-b-quick-tunnel-artifact.js';
import {
  HISTORICAL_PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_CHAIN_PROFILE,
  HISTORICAL_PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
  HISTORICAL_PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_CHAIN_PROFILE,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ACKNOWLEDGEMENT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
  TESTNET_LIVE_ACKNOWLEDGEMENT,
} from '../src/zenon/operator-trusted-testnet-profile.js';
import { paymentIntentDigest } from '../src/canonical.js';

const importResourcesBefore = process.getActiveResourcesInfo().slice().sort();
const importCwdBefore = process.cwd();
const importFetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
let importEffectCalls = 0;
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  value() {
    importEffectCalls += 1;
    throw new Error('synthetic import effect sentinel');
  },
  writable: true,
});
let reviewModule;
try {
  reviewModule = await import('../src/gate-b-reset-epoch-v4-review.js');
} finally {
  if (importFetchDescriptor) {
    Object.defineProperty(globalThis, 'fetch', importFetchDescriptor);
  } else {
    delete globalThis.fetch;
  }
}
const importResourcesAfter = process.getActiveResourcesInfo().slice().sort();
const importCwdUnchanged = process.cwd() === importCwdBefore;
const {
  bindGateBResetEpochV4Approval,
  prepareGateBResetEpochV4Review,
} = reviewModule;
const {
  RESET_EPOCH_WSS_ONCE_POLICY,
  resetEpochWssOnceConfigDigest,
} = await import('../src/live-evidence-runner.js');

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32_GENERATORS = [
  0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3,
];
const SYNTHETIC_ASSET = 'zts1znnxxxxxxxxxxxxx9z4ulx';
const SYNTHETIC_RESOURCE = 'https://synthetic-review.trycloudflare.com/paid';
const RUN_NAME = 'synthetic-reset-epoch-v4-review';

const REVIEW_KEYS = [
  'reviewVersion', 'runName', 'runnerVersion', 'executionMode', 'eventId',
  'sourceRevision', 'profileName', 'payer', 'rpcEndpoint', 'quickTunnel',
  'expectedPaymentRequired', 'acknowledgements', 'runtime', 'configDigest',
  'paymentIntentDigest',
];

function canonicalJsonText(value) {
  return `${JSON.stringify(value)}\n`;
}

function bech32Polymod(values) {
  let checksum = 1;
  for (const value of values) {
    const high = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let bit = 0; bit < BECH32_GENERATORS.length; bit += 1) {
      if ((high >>> bit) & 1) checksum ^= BECH32_GENERATORS[bit];
    }
  }
  return checksum;
}

function syntheticUserAddress(seed) {
  const payload = Uint8Array.from(
    { length: 20 },
    (_, index) => index === 0 ? 0 : (seed + index) & 0xff,
  );
  const words = [];
  let accumulator = 0;
  let bits = 0;
  for (const byte of payload) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      words.push((accumulator >>> bits) & 31);
    }
  }
  if (bits > 0) words.push((accumulator << (5 - bits)) & 31);
  const expandedHrp = [3, 0, 26];
  const polymod = bech32Polymod([
    ...expandedHrp,
    ...words,
    0, 0, 0, 0, 0, 0,
  ]) ^ 1;
  const checksum = [];
  for (let index = 0; index < 6; index += 1) {
    checksum.push((polymod >>> (5 * (5 - index))) & 31);
  }
  return `z1${[...words, ...checksum].map(value => BECH32_CHARSET[value]).join('')}`;
}

const SYNTHETIC_PAYER = syntheticUserAddress(17);
const SYNTHETIC_PAYEE = syntheticUserAddress(83);

function quickTunnelBinding() {
  const manifest = GATE_B_QUICK_TUNNEL_ARTIFACT_MANIFEST;
  return {
    artifact: {
      architecture: manifest.architecture,
      archiveSha256: manifest.archiveSha256,
      asset: manifest.asset,
      executableSha256: manifest.executableSha256,
      manifestVersion: manifest.manifestVersion,
      platform: manifest.platform,
      release: manifest.release,
    },
    hostnamePersistence: { ...GATE_B_QUICK_TUNNEL_HOSTNAME_PERSISTENCE_POLICY },
    runtimeControl: { ...GATE_B_QUICK_TUNNEL_RUNTIME_CONTROL_POLICY },
    telemetry: {
      ...GATE_B_QUICK_TUNNEL_TELEMETRY_POLICIES.ACCEPT_POSSIBLE_ERROR_TELEMETRY,
    },
  };
}

function runConfig(changes = {}) {
  return {
    runnerVersion: 4,
    executionMode: RESET_EPOCH_WSS_ONCE_POLICY.executionMode,
    eventId: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
    rpcEndpoint: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
    sourceRevision: 'd'.repeat(40),
    profileName: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
    payer: SYNTHETIC_PAYER,
    acknowledgements: {
      live: TESTNET_LIVE_ACKNOWLEDGEMENT,
      operatorTrust:
        PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
      wss: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ACKNOWLEDGEMENT,
    },
    quickTunnel: quickTunnelBinding(),
    expectedPaymentRequired: {
      x402Version: 2,
      resource: {
        url: SYNTHETIC_RESOURCE,
        description: 'Synthetic reset-epoch review fixture',
        mimeType: 'application/json',
      },
      accepts: [{
        scheme: 'exact',
        network: 'zenon:testnet',
        asset: SYNTHETIC_ASSET,
        amount: '1',
        payTo: SYNTHETIC_PAYEE,
        maxTimeoutSeconds: 60,
        extra: {
          paymentFlow: 'upfront',
          poc: true,
          settlement: 'account-block',
          zenonChain: { ...PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_CHAIN_PROFILE },
        },
      }],
    },
    runtime: {
      listenPort: 41000,
      rpcTimeoutMs: 1000,
      maxRecoveryAttempts: 0,
      recoveryDelayMs: 0,
      maxRecoveryElapsedMs: 1000,
    },
    ...changes,
  };
}

function approval(review, changes = {}) {
  return {
    approvalVersion: 1,
    approvalType: RESET_EPOCH_WSS_ONCE_POLICY.approvalType,
    executionMode: review.executionMode,
    eventId: review.eventId,
    runName: review.runName,
    sourceRevision: review.sourceRevision,
    profileName: review.profileName,
    payer: review.payer,
    configDigest: review.configDigest,
    paymentIntentDigest: review.paymentIntentDigest,
    rpcEndpoint: review.rpcEndpoint,
    quickTunnel: structuredClone(review.quickTunnel),
    acknowledgements: {
      oneUseResetLive: RESET_EPOCH_WSS_ONCE_POLICY.oneUseApproval,
      payment: RESET_EPOCH_WSS_ONCE_POLICY.paymentAcknowledgement,
      publication: RESET_EPOCH_WSS_ONCE_POLICY.publicationAcknowledgement,
    },
    ...changes,
  };
}

function assertDeeplyFrozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeeplyFrozen(child);
}

function prepared() {
  const configuration = runConfig();
  return prepareGateBResetEpochV4Review(canonicalJsonText(configuration), RUN_NAME);
}

test('valid canonical reset-epoch v4 input produces one bounded frozen review preview', () => {
  const configuration = runConfig();
  const preview = prepareGateBResetEpochV4Review(
    canonicalJsonText(configuration),
    RUN_NAME,
  );

  assert.deepEqual(Object.keys(preview), REVIEW_KEYS);
  assert.equal(preview.reviewVersion, 1);
  assert.equal(preview.runName, RUN_NAME);
  assert.equal(preview.configDigest, resetEpochWssOnceConfigDigest(configuration));
  assert.equal(
    preview.paymentIntentDigest,
    paymentIntentDigest(
      configuration.expectedPaymentRequired,
      configuration.expectedPaymentRequired.accepts[0],
    ),
  );
  assertDeeplyFrozen(preview);
});

test('historical reset-epoch v4 input is rejected without silent migration', () => {
  const configuration = runConfig({
    eventId:
      HISTORICAL_PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
    profileName:
      HISTORICAL_PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
  });
  configuration.expectedPaymentRequired.accepts[0].extra.zenonChain = {
    ...HISTORICAL_PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_CHAIN_PROFILE,
  };
  assert.throws(() => prepareGateBResetEpochV4Review(
    canonicalJsonText(configuration),
    RUN_NAME,
  ));
});

test('binding rejects a reviewed config digest that does not match the preview', () => {
  const preview = prepared();
  const approvalJson = canonicalJsonText(approval(preview));
  assert.throws(() => bindGateBResetEpochV4Approval(
    approvalJson,
    '0'.repeat(64),
    preview,
  ));
});

test('binding rejects stale approval fields and acknowledgements', () => {
  const preview = prepared();
  const staleQuickTunnel = structuredClone(preview.quickTunnel);
  staleQuickTunnel.telemetry = {
    ...GATE_B_QUICK_TUNNEL_TELEMETRY_POLICIES.EXTERNAL_SENTRY_EGRESS_CONTROL_ATTESTED,
  };
  const staleCases = [
    { runName: 'stale-reset-epoch-v4-review' },
    { payer: SYNTHETIC_PAYEE },
    { eventId: '2026-09-24T11:14:13.446Z' },
    { profileName: 'stale-reset-epoch-profile' },
    { sourceRevision: 'e'.repeat(40) },
    { rpcEndpoint: 'wss://stale-reset.invalid' },
    { configDigest: '1'.repeat(64) },
    { paymentIntentDigest: '2'.repeat(64) },
    { quickTunnel: staleQuickTunnel },
    { acknowledgements: {
      oneUseResetLive: 'NOT_REVIEWED',
      payment: RESET_EPOCH_WSS_ONCE_POLICY.paymentAcknowledgement,
      publication: RESET_EPOCH_WSS_ONCE_POLICY.publicationAcknowledgement,
    } },
  ];

  for (const changes of staleCases) {
    assert.throws(() => bindGateBResetEpochV4Approval(
      canonicalJsonText(approval(preview, changes)),
      preview.configDigest,
      preview,
    ));
  }
});

test('inputs are detached and mutation, proxies, accessors, and unknown keys fail closed', () => {
  const configuration = runConfig();
  const preview = prepareGateBResetEpochV4Review(
    canonicalJsonText(configuration),
    RUN_NAME,
  );
  configuration.runtime.listenPort = 1;
  configuration.quickTunnel.telemetry.mode = 'changed-after-capture';
  assert.equal(preview.runtime.listenPort, 41000);
  assert.notEqual(preview.quickTunnel.telemetry.mode, 'changed-after-capture');
  assert.throws(() => { preview.runtime.listenPort = 1; }, TypeError);

  const calls = [];
  const proxy = new Proxy({}, {
    get() { calls.push('get'); },
    getOwnPropertyDescriptor() { calls.push('descriptor'); },
    getPrototypeOf() { calls.push('prototype'); },
    ownKeys() { calls.push('keys'); },
  });
  assert.throws(() => bindGateBResetEpochV4Approval(
    canonicalJsonText(approval(preview)),
    preview.configDigest,
    proxy,
  ));
  assert.deepEqual(calls, []);

  const accessor = {};
  Object.defineProperty(accessor, 'reviewVersion', {
    enumerable: true,
    get() {
      calls.push('accessor');
      return 1;
    },
  });
  assert.throws(() => bindGateBResetEpochV4Approval(
    canonicalJsonText(approval(preview)),
    preview.configDigest,
    accessor,
  ));
  assert.deepEqual(calls, []);

  assert.throws(() => prepareGateBResetEpochV4Review(
    canonicalJsonText({ ...runConfig(), unknown: true }),
    RUN_NAME,
  ));
  assert.throws(() => bindGateBResetEpochV4Approval(
    canonicalJsonText({ ...approval(preview), unknown: true }),
    preview.configDigest,
    preview,
  ));
  assert.throws(() => bindGateBResetEpochV4Approval(
    canonicalJsonText(approval(preview)),
    preview.configDigest,
    { ...preview, unknown: true },
  ));
});

test('a valid approval is not accepted without an independently supplied reviewed digest', () => {
  const preview = prepared();
  const approvalJson = canonicalJsonText(approval(preview));
  assert.throws(() => bindGateBResetEpochV4Approval(
    approvalJson,
    undefined,
    preview,
  ));
  assert.throws(() => bindGateBResetEpochV4Approval(approvalJson, preview));
});

test('pure review and binding calls create no asynchronous or global effectful work', () => {
  assert.equal(importEffectCalls, 0);
  assert.equal(importCwdUnchanged, true);
  assert.deepEqual(importResourcesAfter, importResourcesBefore);
  const beforeResources = process.getActiveResourcesInfo().slice().sort();
  let fetchCalls = 0;
  const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value() {
      fetchCalls += 1;
      throw new Error('synthetic effect sentinel');
    },
    writable: true,
  });

  try {
    const preview = prepared();
    const bound = bindGateBResetEpochV4Approval(
      canonicalJsonText(approval(preview)),
      preview.configDigest,
      preview,
    );
    assert.equal(bound instanceof Promise, false);
    assert.deepEqual(Object.keys(bound), [
      'bindingVersion', 'reviewedConfigDigest', 'review', 'approval',
    ]);
    assertDeeplyFrozen(bound);
  } finally {
    if (fetchDescriptor) Object.defineProperty(globalThis, 'fetch', fetchDescriptor);
    else delete globalThis.fetch;
  }

  assert.equal(fetchCalls, 0);
  assert.deepEqual(process.getActiveResourcesInfo().slice().sort(), beforeResources);
});
