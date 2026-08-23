import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentIntentDigest } from '../src/canonical.js';
import { buildRequirement } from '../src/config.js';
import {
  createPaymentCapabilities,
  MAX_ZENON_AMOUNT,
  MOCK_ZENON_CHAIN_PROFILE,
  sameRequirements,
  snapshotPaymentCapabilities,
  validateActiveUpfrontRequirement,
  validateBasePaymentRequirement,
  validateCanonicalZenonAmount,
  validatePaymentPayloadEnvelope,
  validatePaymentPayloadStructure,
  validatePaymentRequired,
  validatePaymentRequiredForOfferSelection,
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
      paymentFlow: 'upfront',
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
  assert.equal(mock.extra.paymentFlow, 'upfront');
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

test('active HTTP requirements require the exact upfront payment flow', () => {
  const requirement = liveRequirement();
  assert.doesNotThrow(() => validateActiveUpfrontRequirement(requirement));

  const legacyCharacterizationRequirement = structuredClone(requirement);
  delete legacyCharacterizationRequirement.extra.paymentFlow;
  assert.doesNotThrow(() => validateRequirement(legacyCharacterizationRequirement));
  assert.throws(
    () => validateActiveUpfrontRequirement(legacyCharacterizationRequirement),
    /paymentFlow=upfront/,
  );

  for (const paymentFlow of [null, 'authorization', 'escrow', 'unknown', false, 1, {}, []]) {
    const invalid = structuredClone(requirement);
    invalid.extra.paymentFlow = paymentFlow;
    assert.throws(() => validateRequirement(invalid), /paymentFlow must equal upfront/);
    assert.throws(() => validateActiveUpfrontRequirement(invalid), /paymentFlow must equal upfront/);
  }
});

test('offer routing separates stable base shape from strict Zenon validation', () => {
  const supported = liveRequirement();
  const genericAlternative = {
    scheme: 'other',
    network: 'other:test',
    asset: 'asset',
    amount: '9'.repeat(78),
    payTo: 'recipient',
    maxTimeoutSeconds: 0.5,
    extra: { paymentFlow: 1 },
  };
  const alternatives = [
    genericAlternative,
    { ...supported, extra: null },
    { ...supported, extra: { paymentFlow: { unsupported: true } } },
  ];
  for (const alternative of alternatives) {
    assert.doesNotThrow(() => validateBasePaymentRequirement(alternative));
    assert.throws(() => validateRequirement(alternative));
  }
  assert.doesNotThrow(() => validateBasePaymentRequirement({
    ...genericAlternative,
    scheme: 's'.repeat(129),
    network: `${'n'.repeat(129)}:test`,
    asset: 'a'.repeat(129),
    payTo: 'p'.repeat(129),
  }));
  assert.doesNotThrow(() => validatePaymentRequiredForOfferSelection({
    ...paymentRequired(supported),
    accepts: [...alternatives, supported],
  }));

  const malformed = [
    { ...alternatives[0], scheme: null },
    { ...alternatives[0], network: 'unscoped' },
    { ...alternatives[0], maxTimeoutSeconds: 0 },
    { ...alternatives[0], maxTimeoutSeconds: -1 },
    { ...alternatives[0], maxTimeoutSeconds: '1' },
    { ...alternatives[0], maxTimeoutSeconds: Number.NaN },
    { ...alternatives[0], maxTimeoutSeconds: Number.POSITIVE_INFINITY },
    { ...alternatives[0], extra: [] },
    { ...alternatives[0], unexpected: true },
    Object.fromEntries(Object.entries(alternatives[0]).filter(([key]) => key !== 'amount')),
  ];
  for (const key of ['scheme', 'network', 'asset', 'amount', 'payTo']) {
    malformed.push({ ...alternatives[0], [key]: '' });
  }
  for (const requirement of malformed) {
    assert.throws(() => validateBasePaymentRequirement(requirement));
  }

  assert.throws(() => validateRequirement({ ...supported, amount: '9'.repeat(78) }));
  assert.throws(() => validateRequirement({ ...supported, maxTimeoutSeconds: 0.5 }));
});

test('payment capability descriptors are versioned, detached, and deeply immutable', () => {
  const input = [{
    scheme: 'exact',
    network: 'zenon:testnet',
    paymentFlows: ['upfront'],
  }];
  const capabilities = createPaymentCapabilities(input);
  input[0].network = 'other:test';
  input[0].paymentFlows[0] = 'authorization';

  assert.equal(capabilities.version, 1);
  assert.equal(capabilities.x402Version, 2);
  assert.equal(capabilities.routes[0].network, 'zenon:testnet');
  assert.deepEqual(capabilities.routes[0].paymentFlows, ['upfront']);
  assert.equal(Object.isFrozen(capabilities), true);
  assert.equal(Object.isFrozen(capabilities.routes), true);
  assert.equal(Object.isFrozen(capabilities.routes[0]), true);
  assert.equal(Object.isFrozen(capabilities.routes[0].paymentFlows), true);

  const snapshot = snapshotPaymentCapabilities(capabilities);
  assert.deepEqual(snapshot, capabilities);
  assert.notEqual(snapshot, capabilities);
  assert.notEqual(snapshot.routes, capabilities.routes);
  assert.notEqual(snapshot.routes[0], capabilities.routes[0]);
  assert.notEqual(snapshot.routes[0].paymentFlows, capabilities.routes[0].paymentFlows);
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

test('payment payload structure separates malformed V2 input from unsupported local policy', () => {
  const valid = paymentPayload();
  assert.doesNotThrow(() => validatePaymentPayloadStructure(valid));

  const structurallyValidButUnsupported = [
    { x402Version: 1 },
    Object.fromEntries(Object.entries(valid).filter(([key]) => key !== 'resource')),
    { ...valid, resource: null },
    { ...valid, extensions: {} },
    { ...valid, unexpected: true },
    {
      ...valid,
      resource: { url: valid.resource.url, description: null, mimeType: null },
    },
    {
      ...valid,
      accepted: { ...valid.accepted, maxTimeoutSeconds: 0.5 },
    },
    {
      ...valid,
      accepted: { ...valid.accepted, amount: (MAX_ZENON_AMOUNT + 1n).toString() },
    },
    {
      ...valid,
      accepted: {
        ...valid.accepted,
        extra: { ...valid.accepted.extra, paymentFlow: { unsupported: true } },
      },
    },
  ];
  for (const value of structurallyValidButUnsupported) {
    assert.doesNotThrow(() => validatePaymentPayloadStructure(value));
    assert.throws(() => validatePaymentPayloadEnvelope(value));
  }

  const malformed = [
    null,
    [],
    {},
    { ...valid, x402Version: '2' },
    Object.fromEntries(Object.entries(valid).filter(([key]) => key !== 'accepted')),
    Object.fromEntries(Object.entries(valid).filter(([key]) => key !== 'payload')),
    { ...valid, accepted: null },
    { ...valid, payload: [] },
    { ...valid, resource: [] },
    { ...valid, resource: { url: valid.resource.url, description: 1 } },
    { ...valid, extensions: [] },
    { ...valid, accepted: { ...valid.accepted, amount: '01' } },
    { ...valid, accepted: { ...valid.accepted, extra: null } },
    {
      ...valid,
      accepted: {
        ...valid.accepted,
        extra: { ...valid.accepted.extra, poc: 'true' },
      },
    },
    {
      ...valid,
      accepted: {
        ...valid.accepted,
        extra: { ...valid.accepted.extra, zenonChain: null },
      },
    },
    {
      ...valid,
      accepted: {
        ...valid.accepted,
        extra: {
          ...valid.accepted.extra,
          zenonChain: { ...valid.accepted.extra.zenonChain, chainIdentifier: '01' },
        },
      },
    },
    { ...valid, payload: { ...valid.payload, transaction: [] } },
    { ...valid, payload: { ...valid.payload, intentDigest: 'B'.repeat(64) } },
  ];
  for (const value of malformed) assert.throws(() => validatePaymentPayloadStructure(value));

  const unsupportedRoute = {
    ...valid,
    accepted: {
      scheme: 'other',
      network: 'other:test',
      asset: 'asset',
      amount: '01',
      payTo: 'recipient',
      maxTimeoutSeconds: 0.5,
      extra: null,
    },
  };
  assert.doesNotThrow(() => validatePaymentPayloadStructure(unsupportedRoute));
  assert.throws(() => validatePaymentPayloadEnvelope(unsupportedRoute));
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
    assert.equal(requirement.extra.paymentFlow, 'upfront');
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
