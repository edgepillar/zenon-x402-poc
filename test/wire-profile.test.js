import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentIntentDigest } from '../src/canonical.js';
import { buildRequirement } from '../src/config.js';
import {
  MAX_ZENON_AMOUNT,
  MOCK_ZENON_CHAIN_PROFILE,
  sameRequirements,
  validateCanonicalZenonAmount,
  validatePaymentPayloadEnvelope,
  validatePaymentRequired,
  validateRequirement,
  validateZenonChainProfile,
} from '../src/x402-wire.js';

const LIVE_PROFILE = Object.freeze({
  version: 1,
  // Synthetic test data; this is not a published network profile.
  chainIdentifier: '42424242',
  genesisMomentumHash: 'a'.repeat(64),
});

function liveRequirement(profile = LIVE_PROFILE) {
  return {
    scheme: 'exact',
    network: 'zenon:testnet',
    asset: 'zts1qqqqqqqqqqqqtq587y',
    amount: '1',
    payTo: 'z1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsggv2f',
    maxTimeoutSeconds: 30,
    extra: {
      poc: true,
      settlement: 'account-block',
      zenonChain: { ...profile },
    },
  };
}

function paymentRequired(requirement = liveRequirement()) {
  return {
    x402Version: 2,
    resource: {
      url: 'https://resource.example/paid',
      description: 'test resource',
      mimeType: 'application/json',
    },
    accepts: [requirement],
  };
}

function paymentPayload(requirement = liveRequirement()) {
  return {
    x402Version: 2,
    resource: paymentRequired(requirement).resource,
    accepted: requirement,
    payload: {
      transaction: { fixture: true },
      intentDigest: 'b'.repeat(64),
    },
  };
}

async function withEnvironment(values, operation) {
  const previous = new Map();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await operation();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('Zenon amount validation uses the canonical positive 255-bit limit', () => {
  assert.equal(MAX_ZENON_AMOUNT, (1n << 255n) - 1n);
  assert.doesNotThrow(() => validateCanonicalZenonAmount(MAX_ZENON_AMOUNT.toString()));
  for (const value of [
    '0', '00', '01', '+1', '-1', '1.0', '1e2', ' 1', '1 ', (1n << 255n).toString(),
  ]) {
    assert.throws(() => validateCanonicalZenonAmount(value));
  }
});

test('Zenon chain profile has an exact, canonical, SDK-safe schema', () => {
  assert.doesNotThrow(() => validateZenonChainProfile(LIVE_PROFILE));
  assert.doesNotThrow(() => validateZenonChainProfile({
    ...LIVE_PROFILE,
    chainIdentifier: Number.MAX_SAFE_INTEGER.toString(),
  }));

  const invalid = [
    null,
    [],
    { ...LIVE_PROFILE, version: 2 },
    { ...LIVE_PROFILE, chainIdentifier: '0' },
    { ...LIVE_PROFILE, chainIdentifier: '042424242' },
    { ...LIVE_PROFILE, chainIdentifier: '+42424242' },
    { ...LIVE_PROFILE, chainIdentifier: (BigInt(Number.MAX_SAFE_INTEGER) + 1n).toString() },
    { ...LIVE_PROFILE, genesisMomentumHash: 'A'.repeat(64) },
    { ...LIVE_PROFILE, genesisMomentumHash: 'a'.repeat(63) },
    { ...LIVE_PROFILE, unexpected: true },
  ];
  for (const profile of invalid) assert.throws(() => validateZenonChainProfile(profile));
});

test('requirements bind exact chain identity and reserve the mock profile', async () => {
  const requirement = liveRequirement();
  assert.doesNotThrow(() => validateRequirement(requirement));

  const differentGenesis = liveRequirement({ ...LIVE_PROFILE, genesisMomentumHash: 'b'.repeat(64) });
  const differentChain = liveRequirement({ ...LIVE_PROFILE, chainIdentifier: '42424243' });
  assert.equal(sameRequirements(requirement, differentGenesis), false);
  assert.equal(sameRequirements(requirement, differentChain), false);

  const required = paymentRequired(requirement);
  assert.notEqual(
    paymentIntentDigest(required, requirement),
    paymentIntentDigest(paymentRequired(differentGenesis), differentGenesis),
  );
  assert.notEqual(
    paymentIntentDigest(required, requirement),
    paymentIntentDigest(paymentRequired(differentChain), differentChain),
  );

  const mock = await buildRequirement('mock');
  assert.deepEqual(mock.extra.zenonChain, MOCK_ZENON_CHAIN_PROFILE);
  assert.throws(() => validateRequirement({
    ...requirement,
    extra: { ...requirement.extra, zenonChain: { ...MOCK_ZENON_CHAIN_PROFILE } },
  }));
  assert.throws(() => validateRequirement({
    ...mock,
    extra: { ...mock.extra, zenonChain: { ...LIVE_PROFILE } },
  }));
});

test('outer x402 structures reject missing and unexpected fields', () => {
  const requirement = liveRequirement();
  const required = paymentRequired(requirement);
  const payload = paymentPayload(requirement);
  assert.doesNotThrow(() => validatePaymentRequired(required));
  assert.doesNotThrow(() => validatePaymentPayloadEnvelope(payload));

  assert.throws(() => validateRequirement({ ...requirement, unexpected: true }));
  assert.throws(() => validateRequirement({ ...requirement, maxTimeoutSeconds: 301 }));
  assert.throws(() => validateRequirement({ ...requirement, asset: 'a'.repeat(129) }));
  assert.throws(() => validateRequirement({ ...requirement, payTo: 'z'.repeat(129) }));
  assert.throws(() => validateRequirement({
    ...requirement,
    extra: { ...requirement.extra, unexpected: true },
  }));
  assert.throws(() => validatePaymentRequired({ ...required, unexpected: true }));
  assert.throws(() => validatePaymentRequired({
    ...required,
    resource: { ...required.resource, unexpected: true },
  }));
  assert.throws(() => validatePaymentPayloadEnvelope({ ...payload, unexpected: true }));
  assert.throws(() => validatePaymentPayloadEnvelope({
    ...payload,
    payload: { ...payload.payload, unexpected: true },
  }));
  const missingProfile = structuredClone(requirement);
  delete missingProfile.extra.zenonChain;
  assert.throws(() => validateRequirement(missingProfile));
});

test('live requirement construction requires a programmatic profile and enforces amount boundaries', async () => {
  await assert.rejects(buildRequirement('zenon'), /explicit programmatic Zenon chain profile/);

  await withEnvironment({
    X402_NETWORK: 'zenon:testnet',
    ZENON_PAY_TO: 'configured-test-recipient',
    ZENON_ASSET: 'ZNN',
    ZENON_MAX_TIMEOUT_SECONDS: '60',
    ZENON_AMOUNT: MAX_ZENON_AMOUNT.toString(),
  }, async () => {
    const requirement = await buildRequirement('zenon', {
      zenonChain: LIVE_PROFILE,
      resolveAsset: async () => 'zts1qqqqqqqqqqqqtq587y',
    });
    assert.equal(requirement.amount, MAX_ZENON_AMOUNT.toString());
    assert.deepEqual(requirement.extra.zenonChain, LIVE_PROFILE);
  });

  await withEnvironment({
    X402_NETWORK: 'zenon:testnet',
    ZENON_PAY_TO: 'configured-test-recipient',
    ZENON_ASSET: 'ZNN',
    ZENON_AMOUNT: (1n << 255n).toString(),
  }, async () => {
    await assert.rejects(buildRequirement('zenon', { zenonChain: LIVE_PROFILE }), /2\^255 - 1/);
  });
});
