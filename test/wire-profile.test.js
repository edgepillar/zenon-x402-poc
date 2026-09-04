import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { paymentIntentDigest } from '../src/canonical.js';
import { buildRequirement } from '../src/config.js';
import {
  createPaymentCapabilities,
  makePaymentRequired,
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
  validateResource,
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

function liveConfigurationEnvironment(overrides = {}) {
  return {
    X402_NETWORK: 'zenon:testnet',
    ZENON_PAY_TO: 'configured-test-recipient',
    ZENON_ASSET: 'ZNN',
    ZENON_AMOUNT: '1',
    ZENON_MAX_TIMEOUT_SECONDS: '60',
    ...overrides,
  };
}

function independentCanonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(independentCanonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(key =>
    `${JSON.stringify(key)}:${independentCanonicalJson(value[key])}`).join(',')}}`;
}

function independentIntentDigest(paymentRequiredValue, accepted) {
  const preimage = {
    x402Version: paymentRequiredValue.x402Version,
    resource: paymentRequiredValue.resource,
    accepted,
  };
  return createHash('sha256').update(independentCanonicalJson(preimage)).digest('hex');
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

test('minimum confirmation configuration preserves literal default-one wire bytes and intent', async () => {
  const expectedWire = '{"scheme":"exact","network":"zenon:testnet","asset":"zts1qqqqqqqqqqqqtq587y","amount":"1","payTo":"configured-test-recipient","maxTimeoutSeconds":60,"extra":{"paymentFlow":"upfront","poc":true,"settlement":"account-block","zenonChain":{"version":1,"chainIdentifier":"42424242","genesisMomentumHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}}';
  const variants = [undefined, '', '1'];
  const observed = [];
  let assetResolutions = 0;

  for (const value of variants) {
    const environment = liveConfigurationEnvironment();
    if (value !== undefined) environment.ZENON_MINIMUM_MOMENTUM_CONFIRMATIONS = value;
    const accepted = await buildRequirement('zenon', {
      zenonChain: LIVE_PROFILE,
      resolveAsset: async () => {
        assetResolutions += 1;
        return 'zts1qqqqqqqqqqqqtq587y';
      },
    }, environment);
    assert.equal(Object.hasOwn(accepted.extra, 'minimumMomentumConfirmations'), false);
    assert.equal(JSON.stringify(accepted), expectedWire);
    const required = paymentRequired(accepted);
    assert.equal(paymentIntentDigest(required, accepted), independentIntentDigest(required, accepted));
    observed.push({ wire: JSON.stringify(accepted), intent: paymentIntentDigest(required, accepted) });
  }

  assert.deepEqual(observed, [observed[0], observed[0], observed[0]]);
  assert.equal(assetResolutions, variants.length);
});

test('canonical minimum confirmation configuration is emitted as a signed numeric live field', async () => {
  for (const [encoded, numeric] of [['2', 2], ['30', 30]]) {
    const accepted = await buildRequirement('zenon', {
      zenonChain: LIVE_PROFILE,
      resolveAsset: async () => 'zts1qqqqqqqqqqqqtq587y',
    }, liveConfigurationEnvironment({
      ZENON_MINIMUM_MOMENTUM_CONFIRMATIONS: encoded,
    }));
    assert.equal(accepted.extra.minimumMomentumConfirmations, numeric);
    assert.equal(typeof accepted.extra.minimumMomentumConfirmations, 'number');
    assert.doesNotThrow(() => validateRequirement(accepted));
  }
});

test('effective confirmation policy exposes only the absent-one and explicit live range', async () => {
  const wire = await import('../src/x402-wire.js');
  assert.equal(typeof wire.effectiveMinimumMomentumConfirmations, 'function');
  assert.equal(wire.effectiveMinimumMomentumConfirmations(liveRequirement()), 1);
  for (const value of [2, 30]) {
    const candidate = liveRequirement();
    candidate.extra.minimumMomentumConfirmations = value;
    assert.equal(wire.effectiveMinimumMomentumConfirmations(candidate), value);
  }
  for (const value of [
    undefined,
    1,
    '2',
    0,
    2.5,
    31,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    null,
  ]) {
    const candidate = liveRequirement();
    candidate.extra.minimumMomentumConfirmations = value;
    assert.throws(() => wire.effectiveMinimumMomentumConfirmations(candidate));
  }
  const malformed = liveRequirement();
  malformed.amount = '0';
  malformed.extra.minimumMomentumConfirmations = 2;
  assert.throws(() => wire.effectiveMinimumMomentumConfirmations(malformed));
});

test('active requirement snapshots are descriptor-safe, detached, and deeply immutable', async () => {
  const wire = await import('../src/x402-wire.js');
  assert.equal(typeof wire.snapshotActiveUpfrontRequirement, 'function');

  const accepted = liveRequirement();
  accepted.extra.minimumMomentumConfirmations = 2;
  const snapshot = wire.snapshotActiveUpfrontRequirement(accepted);
  assert.deepEqual(snapshot, accepted);
  assert.notEqual(snapshot, accepted);
  assert.notEqual(snapshot.extra, accepted.extra);
  assert.notEqual(snapshot.extra.zenonChain, accepted.extra.zenonChain);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.extra), true);
  assert.equal(Object.isFrozen(snapshot.extra.zenonChain), true);

  accepted.amount = '2';
  accepted.extra.minimumMomentumConfirmations = 30;
  accepted.extra.zenonChain.chainIdentifier = '42424243';
  assert.equal(snapshot.amount, '1');
  assert.equal(snapshot.extra.minimumMomentumConfirmations, 2);
  assert.equal(snapshot.extra.zenonChain.chainIdentifier, LIVE_PROFILE.chainIdentifier);

  let accessorReads = 0;
  const accessorBacked = liveRequirement();
  Object.defineProperty(accessorBacked.extra, 'minimumMomentumConfirmations', {
    enumerable: true,
    get() {
      accessorReads += 1;
      return 2;
    },
  });
  assert.throws(() => wire.snapshotActiveUpfrontRequirement(accessorBacked));
  assert.equal(accessorReads, 0);

  assert.throws(() => wire.snapshotActiveUpfrontRequirement(
    new Proxy(liveRequirement(), {}),
  ));
  const proxiedNested = liveRequirement();
  proxiedNested.extra = new Proxy(proxiedNested.extra, {});
  assert.throws(() => wire.snapshotActiveUpfrontRequirement(proxiedNested));
  const proxiedChain = liveRequirement();
  proxiedChain.extra.zenonChain = new Proxy(proxiedChain.extra.zenonChain, {});
  assert.throws(() => wire.snapshotActiveUpfrontRequirement(proxiedChain));
});

test('requirement equality ignores poisoned canonicalization and collection methods',
  { concurrency: false }, () => {
    const absent = liveRequirement();
    const explicit = liveRequirement();
    explicit.extra.minimumMomentumConfirmations = 30;
    const mapDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'map');
    const sortDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'sort');
    const joinDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'join');
    const setAddDescriptor = Object.getOwnPropertyDescriptor(Set.prototype, 'add');
    const setHasDescriptor = Object.getOwnPropertyDescriptor(Set.prototype, 'has');
    const mapSetDescriptor = Object.getOwnPropertyDescriptor(Map.prototype, 'set');
    const mapGetDescriptor = Object.getOwnPropertyDescriptor(Map.prototype, 'get');
    const mapHasDescriptor = Object.getOwnPropertyDescriptor(Map.prototype, 'has');
    let hookCalls = 0;
    let equal;
    try {
      Object.defineProperty(Array.prototype, 'map', {
        ...mapDescriptor,
        value() {
          hookCalls += 1;
          return [];
        },
      });
      Object.defineProperty(Array.prototype, 'sort', {
        ...sortDescriptor,
        value() {
          hookCalls += 1;
          return [];
        },
      });
      Object.defineProperty(Array.prototype, 'join', {
        ...joinDescriptor,
        value() {
          hookCalls += 1;
          return '';
        },
      });
      Object.defineProperty(Set.prototype, 'add', {
        ...setAddDescriptor,
        value() {
          hookCalls += 1;
          return this;
        },
      });
      Object.defineProperty(Set.prototype, 'has', {
        ...setHasDescriptor,
        value() {
          hookCalls += 1;
          return true;
        },
      });
      Object.defineProperty(Map.prototype, 'set', {
        ...mapSetDescriptor,
        value() {
          hookCalls += 1;
          return this;
        },
      });
      Object.defineProperty(Map.prototype, 'get', {
        ...mapGetDescriptor,
        value() {
          hookCalls += 1;
          return undefined;
        },
      });
      Object.defineProperty(Map.prototype, 'has', {
        ...mapHasDescriptor,
        value() {
          hookCalls += 1;
          return false;
        },
      });
      equal = sameRequirements(absent, explicit);
    } finally {
      Object.defineProperty(Array.prototype, 'map', mapDescriptor);
      Object.defineProperty(Array.prototype, 'sort', sortDescriptor);
      Object.defineProperty(Array.prototype, 'join', joinDescriptor);
      Object.defineProperty(Set.prototype, 'add', setAddDescriptor);
      Object.defineProperty(Set.prototype, 'has', setHasDescriptor);
      Object.defineProperty(Map.prototype, 'set', mapSetDescriptor);
      Object.defineProperty(Map.prototype, 'get', mapGetDescriptor);
      Object.defineProperty(Map.prototype, 'has', mapHasDescriptor);
    }
    assert.equal(equal, false);
    assert.equal(hookCalls, 0);
  });

test('active requirement snapshots reject unexpected fields without mutable collection hooks',
  { concurrency: false }, () => {
    const candidate = liveRequirement();
    candidate.extra.unexpected = true;
    const someDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'some');
    const setAddDescriptor = Object.getOwnPropertyDescriptor(Set.prototype, 'add');
    const setHasDescriptor = Object.getOwnPropertyDescriptor(Set.prototype, 'has');
    const mapSetDescriptor = Object.getOwnPropertyDescriptor(Map.prototype, 'set');
    const mapGetDescriptor = Object.getOwnPropertyDescriptor(Map.prototype, 'get');
    const mapHasDescriptor = Object.getOwnPropertyDescriptor(Map.prototype, 'has');
    let hookCalls = 0;
    let rejected = false;
    try {
      Object.defineProperty(Array.prototype, 'some', {
        ...someDescriptor,
        value() {
          hookCalls += 1;
          return false;
        },
      });
      Object.defineProperty(Set.prototype, 'add', {
        ...setAddDescriptor,
        value() {
          hookCalls += 1;
          return this;
        },
      });
      Object.defineProperty(Set.prototype, 'has', {
        ...setHasDescriptor,
        value() {
          hookCalls += 1;
          return true;
        },
      });
      Object.defineProperty(Map.prototype, 'set', {
        ...mapSetDescriptor,
        value() {
          hookCalls += 1;
          return this;
        },
      });
      Object.defineProperty(Map.prototype, 'get', {
        ...mapGetDescriptor,
        value() {
          hookCalls += 1;
          return undefined;
        },
      });
      Object.defineProperty(Map.prototype, 'has', {
        ...mapHasDescriptor,
        value() {
          hookCalls += 1;
          return false;
        },
      });
      try {
        validateActiveUpfrontRequirement(candidate);
      } catch {
        rejected = true;
      }
    } finally {
      Object.defineProperty(Array.prototype, 'some', someDescriptor);
      Object.defineProperty(Set.prototype, 'add', setAddDescriptor);
      Object.defineProperty(Set.prototype, 'has', setHasDescriptor);
      Object.defineProperty(Map.prototype, 'set', mapSetDescriptor);
      Object.defineProperty(Map.prototype, 'get', mapGetDescriptor);
      Object.defineProperty(Map.prototype, 'has', mapHasDescriptor);
    }
    assert.equal(rejected, true);
    assert.equal(hookCalls, 0);
  });

test('invalid minimum confirmation configuration fails before asset resolution', async () => {
  const invalidValues = [
    '0', '01', '+2', '-2', '2.0', '2e0', ' 2', '2 ', '31',
    2, 2n, null, false, {}, [], Number.MAX_SAFE_INTEGER,
  ];

  for (const value of invalidValues) {
    let assetResolutions = 0;
    await assert.rejects(buildRequirement('zenon', {
      zenonChain: LIVE_PROFILE,
      resolveAsset: async () => {
        assetResolutions += 1;
        return 'zts1qqqqqqqqqqqqtq587y';
      },
    }, liveConfigurationEnvironment({
      ZENON_MINIMUM_MOMENTUM_CONFIRMATIONS: value,
    })));
    assert.equal(assetResolutions, 0);
  }

  let undefinedAssetResolutions = 0;
  await assert.rejects(buildRequirement('zenon', {
    zenonChain: LIVE_PROFILE,
    resolveAsset: async () => {
      undefinedAssetResolutions += 1;
      return 'zts1qqqqqqqqqqqqtq587y';
    },
  }, liveConfigurationEnvironment({
    ZENON_MINIMUM_MOMENTUM_CONFIRMATIONS: undefined,
  })));
  assert.equal(undefinedAssetResolutions, 0);

  let accessorReads = 0;
  let accessorAssetResolutions = 0;
  const accessorEnvironment = liveConfigurationEnvironment();
  Object.defineProperty(accessorEnvironment, 'ZENON_MINIMUM_MOMENTUM_CONFIRMATIONS', {
    enumerable: true,
    get() {
      accessorReads += 1;
      return '2';
    },
  });
  await assert.rejects(buildRequirement('zenon', {
    zenonChain: LIVE_PROFILE,
    resolveAsset: async () => {
      accessorAssetResolutions += 1;
      return 'zts1qqqqqqqqqqqqtq587y';
    },
  }, accessorEnvironment));
  assert.equal(accessorReads, 0);
  assert.equal(accessorAssetResolutions, 0);

  let proxyAssetResolutions = 0;
  const proxiedEnvironment = new Proxy(liveConfigurationEnvironment({
    ZENON_MINIMUM_MOMENTUM_CONFIRMATIONS: '2',
  }), {});
  await assert.rejects(buildRequirement('zenon', {
    zenonChain: LIVE_PROFILE,
    resolveAsset: async () => {
      proxyAssetResolutions += 1;
      return 'zts1qqqqqqqqqqqqtq587y';
    },
  }, proxiedEnvironment));
  assert.equal(proxyAssetResolutions, 0);
});

test('wire minimum confirmation policy is live-only, descriptor-safe, and intent-bound', async () => {
  const absent = liveRequirement();
  assert.doesNotThrow(() => validateRequirement(absent));

  const explicit = [];
  for (const value of [2, 30]) {
    const candidate = structuredClone(absent);
    candidate.extra.minimumMomentumConfirmations = value;
    assert.doesNotThrow(() => validateRequirement(candidate));
    explicit.push(candidate);
  }
  assert.notEqual(
    paymentIntentDigest(paymentRequired(absent), absent),
    paymentIntentDigest(paymentRequired(explicit[0]), explicit[0]),
  );
  assert.notEqual(
    paymentIntentDigest(paymentRequired(explicit[0]), explicit[0]),
    paymentIntentDigest(paymentRequired(explicit[1]), explicit[1]),
  );

  for (const value of [
    undefined,
    1,
    '2',
    0,
    -0,
    2.5,
    31,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER + 1,
    2n,
    null,
    {},
    [],
  ]) {
    const candidate = structuredClone(absent);
    candidate.extra.minimumMomentumConfirmations = value;
    assert.throws(() => validateRequirement(candidate));
  }

  const thresholdRequired = paymentRequired(explicit[0]);
  const thresholdPayload = paymentPayload(explicit[0]);
  assert.doesNotThrow(() => validatePaymentRequired(thresholdRequired));
  assert.doesNotThrow(() => validatePaymentRequiredForOfferSelection(thresholdRequired));
  assert.doesNotThrow(() => validatePaymentPayloadStructure(thresholdPayload));
  assert.doesNotThrow(() => validatePaymentPayloadEnvelope(thresholdPayload));
  assert.equal(sameRequirements(explicit[0], structuredClone(explicit[0])), true);
  assert.equal(sameRequirements(absent, explicit[0]), false);
  assert.equal(sameRequirements(explicit[0], explicit[1]), false);

  let getterReads = 0;
  const accessorBacked = structuredClone(absent);
  Object.defineProperty(accessorBacked.extra, 'minimumMomentumConfirmations', {
    enumerable: true,
    get() {
      getterReads += 1;
      return 2;
    },
  });
  assert.throws(() => validateRequirement(accessorBacked));
  assert.equal(getterReads, 0);

  const structuralAccessor = paymentPayload(absent);
  Object.defineProperty(structuralAccessor.accepted.extra, 'minimumMomentumConfirmations', {
    enumerable: true,
    get() {
      getterReads += 1;
      return 2;
    },
  });
  assert.throws(() => validatePaymentPayloadStructure(structuralAccessor));
  assert.equal(getterReads, 0);

  const proxied = structuredClone(explicit[0]);
  proxied.extra = new Proxy(proxied.extra, {});
  assert.throws(() => validateRequirement(proxied));

  let mockEnvironmentTouches = 0;
  const mock = await buildRequirement('mock', {}, new Proxy({}, {
    get() {
      mockEnvironmentTouches += 1;
      throw new Error('mock configuration must not be consulted');
    },
    ownKeys() {
      mockEnvironmentTouches += 1;
      throw new Error('mock configuration must not be consulted');
    },
    getOwnPropertyDescriptor() {
      mockEnvironmentTouches += 1;
      throw new Error('mock configuration must not be consulted');
    },
  }));
  assert.equal(mockEnvironmentTouches, 0);
  assert.equal(Object.hasOwn(mock.extra, 'minimumMomentumConfirmations'), false);
  mock.extra.minimumMomentumConfirmations = 2;
  assert.throws(() => validateRequirement(mock));
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

test('PaymentRequired error compatibility is descriptor-safe and intent-neutral', () => {
  const requirement = liveRequirement();
  const absent = paymentRequired(requirement);
  const validators = [validatePaymentRequired, validatePaymentRequiredForOfferSelection];
  const expectedDigest = paymentIntentDigest(absent, requirement);
  const absentSnapshot = structuredClone(absent);
  const absentKeys = Reflect.ownKeys(absent);

  for (const validate of validators) assert.doesNotThrow(() => validate(absent));
  assert.deepEqual(absent, absentSnapshot);
  assert.deepEqual(Reflect.ownKeys(absent), absentKeys);
  assert.equal(Object.hasOwn(absent, 'error'), false);

  for (const value of [undefined, '', 'informational']) {
    const candidate = paymentRequired(requirement);
    Object.defineProperty(candidate, 'error', {
      value,
      enumerable: true,
      writable: false,
      configurable: false,
    });
    const snapshot = structuredClone(candidate);
    const descriptor = Object.getOwnPropertyDescriptor(candidate, 'error');
    const keys = Reflect.ownKeys(candidate);

    for (const validate of validators) assert.doesNotThrow(() => validate(candidate));
    assert.deepEqual(candidate, snapshot);
    assert.deepEqual(Object.getOwnPropertyDescriptor(candidate, 'error'), descriptor);
    assert.deepEqual(Reflect.ownKeys(candidate), keys);
    assert.equal(paymentIntentDigest(candidate, requirement), expectedDigest);
  }

  let coercions = 0;
  const coercionProbe = {
    [Symbol.toPrimitive]() {
      coercions += 1;
      return 'coerced';
    },
  };
  const invalidValues = [
    null,
    false,
    1,
    1n,
    Symbol('invalid-error'),
    function invalidError() {},
    [],
    coercionProbe,
  ];
  for (const value of invalidValues) {
    const candidate = paymentRequired(requirement);
    Object.defineProperty(candidate, 'error', {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    const descriptor = Object.getOwnPropertyDescriptor(candidate, 'error');
    for (const validate of validators) {
      assert.throws(
        () => validate(candidate),
        error => error?.message === 'PaymentRequired.error must be a string or undefined',
      );
    }
    assert.deepEqual(Object.getOwnPropertyDescriptor(candidate, 'error'), descriptor);
  }
  assert.equal(coercions, 0);

  let getterReads = 0;
  for (const getter of [
    () => {
      getterReads += 1;
      return undefined;
    },
    () => {
      getterReads += 1;
      throw new Error('unexpected error accessor read');
    },
  ]) {
    const candidate = paymentRequired(requirement);
    Object.defineProperty(candidate, 'error', {
      enumerable: true,
      configurable: true,
      get: getter,
    });
    const descriptor = Object.getOwnPropertyDescriptor(candidate, 'error');
    for (const validate of validators) {
      assert.throws(
        () => validate(candidate),
        error => error?.message === 'PaymentRequired.error must be an enumerable data property',
      );
    }
    assert.deepEqual(Object.getOwnPropertyDescriptor(candidate, 'error'), descriptor);
  }
  assert.equal(getterReads, 0);

  let setterCalls = 0;
  const setterOnly = paymentRequired(requirement);
  Object.defineProperty(setterOnly, 'error', {
    enumerable: true,
    configurable: true,
    set() {
      setterCalls += 1;
    },
  });
  for (const validate of validators) {
    assert.throws(
      () => validate(setterOnly),
      error => error?.message === 'PaymentRequired.error must be an enumerable data property',
    );
  }
  assert.equal(setterCalls, 0);

  const nonEnumerable = paymentRequired(requirement);
  Object.defineProperty(nonEnumerable, 'error', {
    value: 'informational',
    enumerable: false,
  });
  for (const validate of validators) {
    assert.throws(
      () => validate(nonEnumerable),
      error => error?.message === 'PaymentRequired.error must be an enumerable data property',
    );
  }

  const inherited = paymentRequired(requirement);
  const previousDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, 'error');
  let inheritedReads = 0;
  const inheritedResults = [];
  try {
    Object.defineProperty(Object.prototype, 'error', {
      enumerable: true,
      configurable: true,
      get() {
        inheritedReads += 1;
        return 'inherited';
      },
    });
    for (const validate of validators) {
      try {
        validate(inherited);
        inheritedResults.push('accepted');
      } catch {
        inheritedResults.push('rejected');
      }
    }
  } finally {
    if (previousDescriptor) Object.defineProperty(Object.prototype, 'error', previousDescriptor);
    else delete Object.prototype.error;
  }
  assert.deepEqual(inheritedResults, ['accepted', 'accepted']);
  assert.equal(inheritedReads, 0);
  assert.equal(Object.hasOwn(inherited, 'error'), false);
  assert.equal(paymentIntentDigest(inherited, requirement), expectedDigest);
});

test('strict ResourceInfo preserves optional metadata absence and empty strings', () => {
  const requirement = liveRequirement();
  const url = 'https://resource.example/paid';
  const resources = [
    { url },
    { url, description: '' },
    { url, mimeType: '' },
    { url, description: 'test resource' },
    { url, mimeType: 'application/json' },
    { url, description: '', mimeType: '' },
    { url, description: 'test resource', mimeType: 'application/json' },
  ];

  for (const resource of resources) {
    const original = structuredClone(resource);
    assert.doesNotThrow(() => validateResource(resource));
    assert.doesNotThrow(() => validatePaymentRequired({
      x402Version: 2,
      resource,
      accepts: [requirement],
    }));
    assert.doesNotThrow(() => validatePaymentPayloadEnvelope({
      ...paymentPayload(requirement),
      resource,
    }));
    assert.deepEqual(resource, original);
  }

  const omitted = makePaymentRequired({ resourceUrl: url, requirement });
  assert.deepEqual(omitted.resource, { url });
  assert.deepEqual(Object.keys(omitted.resource), ['url']);

  const complete = makePaymentRequired({
    resourceUrl: url,
    description: 'test resource',
    mimeType: 'application/json',
    requirement,
  });
  assert.deepEqual(complete.resource, resources.at(-1));

  const digests = resources.slice(0, 5).map(resource => paymentIntentDigest({
    x402Version: 2,
    resource,
    accepts: [requirement],
  }, requirement));
  assert.equal(new Set(digests).size, digests.length);
});

test('strict ResourceInfo preserves service names and descriptor-safe tags exactly', async () => {
  const requirement = liveRequirement();
  const url = 'https://resource.example/paid';
  const resources = [
    { url, serviceName: 'A' },
    { url, serviceName: 'S'.repeat(32) },
    { url, tags: [] },
    { url, tags: ['A'] },
    { url, tags: ['T'.repeat(32)] },
    { url, tags: ['alpha'] },
    { url, tags: ['alpha', 'beta'] },
    { url, tags: ['alpha', 'beta', 'gamma'] },
    { url, tags: ['alpha', 'beta', 'gamma', 'delta'] },
    { url, tags: ['alpha', 'alpha', 'beta', 'alpha', 'beta'] },
    { url, description: '', mimeType: '', serviceName: 'Service', tags: ['beta', 'alpha'] },
  ];

  for (const resource of resources) {
    const original = structuredClone(resource);
    assert.doesNotThrow(() => validateResource(resource));
    assert.doesNotThrow(() => validatePaymentRequired({
      x402Version: 2,
      resource,
      accepts: [requirement],
    }));
    assert.doesNotThrow(() => validatePaymentPayloadEnvelope({
      ...paymentPayload(requirement),
      resource,
    }));
    assert.deepEqual(resource, original);
  }

  const sourceTags = ['alpha', 'alpha', 'beta'];
  const constructed = makePaymentRequired({
    resourceUrl: url,
    serviceName: 'Service',
    tags: sourceTags,
    requirement,
  });
  sourceTags[0] = 'changed';
  sourceTags.push('later');
  assert.deepEqual(constructed.resource, {
    url,
    serviceName: 'Service',
    tags: ['alpha', 'alpha', 'beta'],
  });

  const emptyTags = makePaymentRequired({ resourceUrl: url, tags: [], requirement });
  assert.equal(Object.hasOwn(emptyTags.resource, 'tags'), true);
  assert.deepEqual(emptyTags.resource.tags, []);

  const wire = await import('../src/x402-wire.js');
  assert.equal(typeof wire.sameResource, 'function');
  assert.equal(wire.sameResource(resources.at(-1), structuredClone(resources.at(-1))), true);
  for (const different of [
    { ...resources.at(-1), serviceName: 'Other' },
    { ...resources.at(-1), tags: [] },
    { ...resources.at(-1), tags: ['alpha', 'beta'] },
    { ...resources.at(-1), tags: ['beta', 'alpha', 'alpha'] },
    { url, description: '', mimeType: '', serviceName: 'Service' },
  ]) {
    assert.equal(wire.sameResource(resources.at(-1), different), false);
  }

  let resourceReads = 0;
  const accessorResource = { url };
  Object.defineProperty(accessorResource, 'tags', {
    enumerable: true,
    get() {
      resourceReads += 1;
      return ['alpha'];
    },
  });
  assert.equal(wire.sameResource(accessorResource, { url, tags: ['alpha'] }), false);
  assert.equal(resourceReads, 0);

  let constructionReads = 0;
  const accessorConstructionTags = [];
  Object.defineProperty(accessorConstructionTags, '0', {
    enumerable: true,
    get() {
      constructionReads += 1;
      return 'alpha';
    },
  });
  accessorConstructionTags.length = 1;
  assert.throws(() => makePaymentRequired({
    resourceUrl: url,
    tags: accessorConstructionTags,
    requirement,
  }));
  assert.equal(constructionReads, 0);

  const boundResources = [
    { url },
    { url, serviceName: 'Service' },
    { url, tags: [] },
    { url, tags: ['alpha', 'beta'] },
    { url, tags: ['beta', 'alpha'] },
    { url, tags: ['alpha', 'alpha', 'beta'] },
    { url, tags: ['alpha', 'beta', 'alpha'] },
  ];
  const digests = boundResources.map(resource => paymentIntentDigest({
    x402Version: 2,
    resource,
    accepts: [requirement],
  }, requirement));
  assert.equal(new Set(digests).size, digests.length);
});

test('ResourceInfo service metadata rejects unsafe descriptors without invoking getters', () => {
  const url = 'https://resource.example/paid';
  const invalidServiceNames = [
    '',
    'a'.repeat(33),
    'line\nfeed',
    `delete${String.fromCharCode(0x7f)}`,
    'caf\u00e9',
    null,
    undefined,
    1,
    [],
    {},
    Symbol('invalid'),
  ];
  for (const serviceName of invalidServiceNames) {
    assert.throws(() => validateResource({ url, serviceName }));
  }

  const invalidTags = [
    ['one', 'two', 'three', 'four', 'five', 'six'],
    [''],
    ['a'.repeat(33)],
    ['line\nfeed'],
    [`delete${String.fromCharCode(0x7f)}`],
    ['caf\u00e9'],
    [1],
    [null],
    [undefined],
  ];
  for (const tags of invalidTags) assert.throws(() => validateResource({ url, tags }));
  for (const tags of [undefined, null, 'tag', 1, true, {}, new Set(['tag'])]) {
    assert.throws(() => validateResource({ url, tags }));
  }

  const sparse = new Array(1);
  assert.throws(() => validateResource({ url, tags: sparse }));

  const inherited = [];
  inherited.length = 1;
  Object.setPrototypeOf(inherited, Object.create(Array.prototype, {
    0: { value: 'inherited', enumerable: true },
  }));
  assert.throws(() => validateResource({ url, tags: inherited }));

  let tagReads = 0;
  const accessorTags = [];
  Object.defineProperty(accessorTags, '0', {
    enumerable: true,
    get() {
      tagReads += 1;
      return 'must-not-run';
    },
  });
  accessorTags.length = 1;
  assert.throws(() => validateResource({ url, tags: accessorTags }));
  assert.equal(tagReads, 0);

  const unexpectedKey = ['tag'];
  unexpectedKey.extra = true;
  assert.throws(() => validateResource({ url, tags: unexpectedKey }));

  const symbolKey = ['tag'];
  symbolKey[Symbol('unexpected')] = true;
  assert.throws(() => validateResource({ url, tags: symbolKey }));

  const nonEnumerableIndex = [];
  Object.defineProperty(nonEnumerableIndex, '0', {
    value: 'tag',
    enumerable: false,
    writable: true,
    configurable: true,
  });
  nonEnumerableIndex.length = 1;
  assert.throws(() => validateResource({ url, tags: nonEnumerableIndex }));

  for (const key of ['url', 'description', 'mimeType', 'serviceName', 'tags']) {
    const resource = key === 'url' ? {} : { url };
    const values = {
      url,
      description: 'description',
      mimeType: 'application/json',
      serviceName: 'Service',
      tags: ['tag'],
    };
    Object.defineProperty(resource, key, {
      value: values[key],
      enumerable: false,
    });
    assert.throws(() => validateResource(resource));
  }

  let tagsPropertyReads = 0;
  const accessorTagsProperty = { url };
  Object.defineProperty(accessorTagsProperty, 'tags', {
    enumerable: true,
    get() {
      tagsPropertyReads += 1;
      return ['must-not-run'];
    },
  });
  assert.throws(() => validateResource(accessorTagsProperty));
  assert.equal(tagsPropertyReads, 0);

  let serviceReads = 0;
  const accessorService = { url };
  Object.defineProperty(accessorService, 'serviceName', {
    enumerable: true,
    get() {
      serviceReads += 1;
      return 'must-not-run';
    },
  });
  assert.throws(() => validateResource(accessorService));
  assert.equal(serviceReads, 0);

  const symbolResource = { url };
  symbolResource[Symbol('unexpected')] = true;
  assert.throws(() => validateResource(symbolResource));

  assert.throws(() => createPaymentCapabilities([]));
  assert.throws(() => createPaymentCapabilities([{
    scheme: 'exact',
    network: 'zenon:testnet',
    paymentFlows: [],
  }]));
});

test('stable ResourceInfo structure separates malformed released metadata from unsupported policy', () => {
  const valid = paymentPayload();
  for (const resource of [
    { ...valid.resource, serviceName: '' },
    { ...valid.resource, serviceName: 'a'.repeat(33) },
    { ...valid.resource, tags: ['one', 'two', 'three', 'four', 'five', 'six'] },
    { ...valid.resource, tags: [''] },
  ]) {
    assert.throws(() => validatePaymentPayloadStructure({ ...valid, resource }));
  }

  let reads = 0;
  const accessorTags = [];
  Object.defineProperty(accessorTags, '0', {
    enumerable: true,
    get() {
      reads += 1;
      return 'must-not-run';
    },
  });
  accessorTags.length = 1;
  assert.throws(() => validatePaymentPayloadStructure({
    ...valid,
    resource: { ...valid.resource, tags: accessorTags },
  }));
  assert.equal(reads, 0);

  for (const resource of [
    { ...valid.resource, serviceName: null },
    { ...valid.resource, tags: null },
    { ...valid.resource, unknownMetadata: 'unsupported' },
  ]) {
    assert.doesNotThrow(() => validatePaymentPayloadStructure({ ...valid, resource }));
    assert.throws(() => validatePaymentPayloadEnvelope({ ...valid, resource }));
  }
});

test('strict ResourceInfo rejects invalid optional metadata without invoking accessors', () => {
  const url = 'https://resource.example/paid';
  for (const key of ['description', 'mimeType']) {
    for (const value of [null, undefined, 1, [], {}, Symbol('invalid')]) {
      assert.throws(() => validateResource({ url, [key]: value }));
    }

    let reads = 0;
    const resource = { url };
    Object.defineProperty(resource, key, {
      enumerable: true,
      get() {
        reads += 1;
        return 'must not be read';
      },
    });
    assert.throws(() => validateResource(resource));
    assert.equal(reads, 0);
  }

  let urlReads = 0;
  const accessorUrl = {};
  Object.defineProperty(accessorUrl, 'url', {
    enumerable: true,
    get() {
      urlReads += 1;
      return url;
    },
  });
  assert.throws(() => validateResource(accessorUrl));
  assert.equal(urlReads, 0);

  for (const unexpected of [
    { unexpected: true },
  ]) {
    assert.throws(() => validateResource({ url, ...unexpected }));
  }

  const credentialUrl = new URL(url);
  credentialUrl.username = 'x';
  credentialUrl.password = 'x';
  for (const invalidUrl of [
    '',
    'relative/path',
    'ftp://resource.example/paid',
    credentialUrl.href,
    `https://resource.example/${'a'.repeat(4096)}`,
  ]) {
    assert.throws(() => validateResource({ url: invalidUrl }));
  }
  assert.throws(() => validateResource({ url, description: 'a'.repeat(4097) }));
  assert.throws(() => validateResource({ url, mimeType: 'a'.repeat(257) }));
  assert.throws(() => validateResource({ url, mimeType: 'text/plain\r\ninvalid: true' }));
});

test('payment payload structure separates malformed V2 input from unsupported local policy', () => {
  const valid = paymentPayload();
  assert.doesNotThrow(() => validatePaymentPayloadStructure(valid));

  const structurallyValidButUnsupported = [
    { x402Version: 1 },
    Object.fromEntries(Object.entries(valid).filter(([key]) => key !== 'resource')),
    { ...valid, resource: null },
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


test('ResourceInfo iconUrl accepts parser-approved absolute HTTP representations without normalization', async () => {
  const {
    makePaymentRequired,
    sameResource,
    validatePaymentRequired,
    validateResource,
  } = await import('../src/x402-wire.js');
  const { paymentIntentDigest } = await import('../src/canonical.js');

  const base = paymentRequired();
  const prefix = 'https://icons.example/';
  const maximumLengthIcon = prefix + 'a'.repeat(2048 - prefix.length);
  assert.equal(maximumLengthIcon.length, 2048);

  const acceptedIcons = [
    'http://icons.example/icon.png',
    'HTTPS://icons.example/icon.png',
    'http://192.0.2.10/icon.png',
    'http://[2001:db8::1]/icon.png',
    'http://localhost/icon.png',
    'http://private.test/icon.png',
    'https://public.example/icon.png',
    'https://café.example/icon.png',
    'https://icons.example:8443/path/icon.png?size=2#mark',
    'https://icons.example:443/a%2Fb.png',
    ' \thttps://icons.example/icon.png\n',
    'https://icons.example/icon\t.png',
    'https:\\\\icons.example\\\\icon.png',
    maximumLengthIcon,
  ];

  for (const iconUrl of acceptedIcons) {
    const parsed = new URL(iconUrl);
    assert.ok(parsed.protocol === 'http:' || parsed.protocol === 'https:');
    assert.ok(parsed.hostname);

    const resource = { ...base.resource, iconUrl };
    assert.doesNotThrow(() => validateResource(resource));
    assert.doesNotThrow(() => validatePaymentRequired({ ...base, resource }));
    assert.equal(resource.iconUrl, iconUrl);
  }

  const withoutIcon = makePaymentRequired({
    resourceUrl: base.resource.url,
    requirement: base.accepts[0],
  });
  assert.equal(Object.hasOwn(withoutIcon.resource, 'iconUrl'), false);

  const constructorInput = {
    resourceUrl: base.resource.url,
    requirement: base.accepts[0],
    iconUrl: acceptedIcons[1],
  };
  const withIcon = makePaymentRequired(constructorInput);
  constructorInput.iconUrl = 'https://changed.example/icon.png';
  assert.equal(withIcon.resource.iconUrl, acceptedIcons[1]);
  assert.equal(sameResource(withIcon.resource, { ...withIcon.resource }), true);
  assert.equal(sameResource(withIcon.resource, withoutIcon.resource), false);

  const identityVariants = [
    undefined,
    'https://icons.example/icon.png',
    'HTTPS://icons.example/icon.png',
    'https://ICONS.example/icon.png',
    'https://icons.example:443/icon.png',
    'https://icons.example/a%2fb.png',
    'https://icons.example/a%2Fb.png',
    'https://icons.example/other.png',
    'https://icons.example/icon.png?size=2',
    'https://icons.example/icon.png#mark',
  ];
  const digests = identityVariants.map((iconUrl) => {
    const resource = {
      ...base.resource,
      ...(iconUrl === undefined ? {} : { iconUrl }),
    };
    return paymentIntentDigest({ ...base, resource }, base.accepts[0]);
  });
  assert.equal(new Set(digests).size, digests.length);

  for (const resourceUrl of [
    ' \thttps://resource.example/item\n',
    'https://resource.example/it\tem',
    'https:\\\\resource.example\\\\item',
    'https://resource.example/a%2Fb',
  ]) {
    assert.doesNotThrow(() => validateResource({ ...base.resource, url: resourceUrl }));
  }
});

test('ResourceInfo iconUrl structural and strict validation remain descriptor-safe and fail closed', async () => {
  const {
    validatePaymentPayloadStructure,
    validateResource,
  } = await import('../src/x402-wire.js');

  const baseResource = paymentRequired().resource;
  const makePayload = (resource) => ({
    ...paymentPayload(),
    resource,
  });
  const prefix = 'https://icons.example/';
  const overlongIcon = prefix + 'a'.repeat(2049 - prefix.length);
  assert.equal(overlongIcon.length, 2049);

  assert.throws(() =>
    validatePaymentPayloadStructure(
      makePayload({ ...baseResource, iconUrl: overlongIcon }),
    ),
  );

  for (const invalidValue of [undefined, 1, true, [], {}, Symbol('synthetic')]) {
    assert.throws(() =>
      validatePaymentPayloadStructure(
        makePayload({ ...baseResource, iconUrl: invalidValue }),
      ),
    );
  }

  const nullResource = { ...baseResource, iconUrl: null };
  assert.doesNotThrow(() => validatePaymentPayloadStructure(makePayload(nullResource)));
  assert.throws(() => validateResource(nullResource));

  for (const invalidUrl of [
    '',
    'icons.example/icon.png',
    '//icons.example/icon.png',
    'http://[',
    'data:image/png,synthetic',
    'javascript:synthetic',
    'file:///synthetic/icon.png',
    'https://synthetic-user@icons.example/icon.png',
    'https://:synthetic-pass@icons.example/icon.png',
  ]) {
    const resource = { ...baseResource, iconUrl: invalidUrl };
    assert.doesNotThrow(() => validatePaymentPayloadStructure(makePayload(resource)));
    assert.throws(() => validateResource(resource));
  }

  let getterReads = 0;
  const accessorResource = { ...baseResource };
  Object.defineProperty(accessorResource, 'iconUrl', {
    enumerable: true,
    get() {
      getterReads += 1;
      return 'https://icons.example/icon.png';
    },
  });
  assert.throws(() => validatePaymentPayloadStructure(makePayload(accessorResource)));
  assert.equal(getterReads, 0);

  const nonEnumerableResource = { ...baseResource };
  Object.defineProperty(nonEnumerableResource, 'iconUrl', {
    enumerable: false,
    value: 'https://icons.example/icon.png',
  });
  assert.throws(() => validatePaymentPayloadStructure(makePayload(nonEnumerableResource)));

  const inheritedResource = Object.assign(
    Object.create({ iconUrl: 'https://icons.example/icon.png' }),
    baseResource,
  );
  assert.throws(() => validatePaymentPayloadStructure(makePayload(inheritedResource)));

  const symbolResource = { ...baseResource };
  symbolResource[Symbol('synthetic')] = 'https://icons.example/icon.png';
  assert.throws(() => validatePaymentPayloadStructure(makePayload(symbolResource)));
});

test('empty top-level extensions are equivalent to absence without automatic advertisement', async () => {
  const required = paymentRequired();
  const requiredWithEmptyExtensions = structuredClone(required);
  requiredWithEmptyExtensions.extensions = {};
  const requiredSnapshot = structuredClone(requiredWithEmptyExtensions);

  assert.equal(
    paymentIntentDigest(required, required.accepts[0]),
    paymentIntentDigest(requiredWithEmptyExtensions, requiredWithEmptyExtensions.accepts[0]),
  );
  assert.doesNotThrow(() => validatePaymentRequired(requiredWithEmptyExtensions));
  assert.deepEqual(requiredWithEmptyExtensions, requiredSnapshot);

  const payload = paymentPayload();
  const payloadWithEmptyExtensions = structuredClone(payload);
  payloadWithEmptyExtensions.extensions = {};
  const payloadSnapshot = structuredClone(payloadWithEmptyExtensions);
  const payloadWithUndefinedExtensions = structuredClone(payload);
  Object.defineProperty(payloadWithUndefinedExtensions, 'extensions', {
    value: undefined,
    enumerable: true,
    writable: true,
    configurable: true,
  });
  const undefinedPayloadSnapshot = structuredClone(payloadWithUndefinedExtensions);
  const undefinedExtensionsDescriptor = Object.getOwnPropertyDescriptor(
    payloadWithUndefinedExtensions,
    'extensions',
  );

  assert.doesNotThrow(() => validatePaymentPayloadStructure(payload));
  assert.doesNotThrow(() => validatePaymentPayloadStructure(payloadWithEmptyExtensions));
  assert.doesNotThrow(() => validatePaymentPayloadEnvelope(payloadWithEmptyExtensions));
  const undefinedValidationResults = [
    validatePaymentPayloadStructure,
    validatePaymentPayloadEnvelope,
  ].map(validate => {
    try {
      validate(payloadWithUndefinedExtensions);
      return true;
    } catch {
      return false;
    }
  });
  assert.deepEqual(
    undefinedValidationResults,
    [true, true],
    'PaymentPayload undefined extensions must be accepted',
  );
  assert.deepEqual(payloadWithEmptyExtensions, payloadSnapshot);
  assert.equal(
    isDeepStrictEqual(payloadWithUndefinedExtensions, undefinedPayloadSnapshot),
    true,
  );
  assert.equal(
    isDeepStrictEqual(
      Object.getOwnPropertyDescriptor(
        payloadWithUndefinedExtensions,
        'extensions',
      ),
      undefinedExtensionsDescriptor,
    ),
    true,
  );
  const undefinedJsonRoundTrip = JSON.parse(
    JSON.stringify(payloadWithUndefinedExtensions),
  );
  const emptyJsonRoundTrip = JSON.parse(JSON.stringify(payloadWithEmptyExtensions));
  assert.equal(Object.hasOwn(undefinedJsonRoundTrip, 'extensions'), false);
  assert.equal(Object.hasOwn(emptyJsonRoundTrip, 'extensions'), true);
  assert.equal(Reflect.ownKeys(emptyJsonRoundTrip.extensions).length, 0);

  const nullPrototypeExtensions = Object.create(null);
  assert.doesNotThrow(() =>
    validatePaymentRequired({ ...required, extensions: nullPrototypeExtensions }),
  );
  assert.doesNotThrow(() =>
    validatePaymentPayloadStructure({ ...payload, extensions: nullPrototypeExtensions }),
  );
  assert.doesNotThrow(() =>
    validatePaymentPayloadEnvelope({ ...payload, extensions: nullPrototypeExtensions }),
  );

  const locallyConstructed = makePaymentRequired({
    resourceUrl: required.resource.url,
    requirement: required.accepts[0],
  });
  assert.equal(Object.hasOwn(locallyConstructed, 'extensions'), false);
  assert.equal(Object.hasOwn(payload, 'extensions'), false);
});

test('top-level extensions preserve structural and strict rejection boundaries', async () => {
  const required = paymentRequired();
  const payload = paymentPayload();

  for (const extensions of [null, { synthetic: true }]) {
    assert.throws(() => validatePaymentRequired({ ...required, extensions }));
    assert.doesNotThrow(() =>
      validatePaymentPayloadStructure({ ...payload, extensions }),
    );
    assert.throws(() => validatePaymentPayloadEnvelope({ ...payload, extensions }));
  }

  const requiredWithUndefinedExtensions = {
    ...required,
    extensions: undefined,
  };
  const requiredUndefinedDescriptor = Object.getOwnPropertyDescriptor(
    requiredWithUndefinedExtensions,
    'extensions',
  );
  assert.throws(() => validatePaymentRequired(requiredWithUndefinedExtensions));
  assert.throws(() =>
    validatePaymentRequiredForOfferSelection(requiredWithUndefinedExtensions),
  );
  assert.equal(
    isDeepStrictEqual(
      Object.getOwnPropertyDescriptor(
        requiredWithUndefinedExtensions,
        'extensions',
      ),
      requiredUndefinedDescriptor,
    ),
    true,
  );

  for (const extensions of [true, 1, 'synthetic', 1n, Symbol('synthetic'), () => {}, []]) {
    assert.throws(() => validatePaymentRequired({ ...required, extensions }));
    assert.throws(() =>
      validatePaymentPayloadStructure({ ...payload, extensions }),
    );
    assert.throws(() =>
      validatePaymentPayloadEnvelope({ ...payload, extensions }),
    );
  }

  let getterReads = 0;
  const accessorExtensions = {};
  Object.defineProperty(accessorExtensions, 'synthetic', {
    enumerable: true,
    get() {
      getterReads += 1;
      return true;
    },
  });
  assert.throws(() =>
    validatePaymentRequired({ ...required, extensions: accessorExtensions }),
  );
  assert.throws(() =>
    validatePaymentPayloadStructure({ ...payload, extensions: accessorExtensions }),
  );
  assert.throws(() =>
    validatePaymentPayloadEnvelope({ ...payload, extensions: accessorExtensions }),
  );
  assert.equal(getterReads, 0);

  const nonEnumerableExtensions = {};
  Object.defineProperty(nonEnumerableExtensions, 'synthetic', {
    enumerable: false,
    value: true,
  });
  assert.throws(() =>
    validatePaymentRequired({ ...required, extensions: nonEnumerableExtensions }),
  );
  assert.throws(() =>
    validatePaymentPayloadStructure({ ...payload, extensions: nonEnumerableExtensions }),
  );
  assert.throws(() =>
    validatePaymentPayloadEnvelope({ ...payload, extensions: nonEnumerableExtensions }),
  );

  const symbolExtensions = {};
  symbolExtensions[Symbol('synthetic')] = true;
  assert.throws(() =>
    validatePaymentRequired({ ...required, extensions: symbolExtensions }),
  );
  assert.throws(() =>
    validatePaymentPayloadStructure({ ...payload, extensions: symbolExtensions }),
  );
  assert.throws(() =>
    validatePaymentPayloadEnvelope({ ...payload, extensions: symbolExtensions }),
  );

  const inheritedExtensions = Object.create({ synthetic: true });
  assert.throws(() =>
    validatePaymentRequired({ ...required, extensions: inheritedExtensions }),
  );
  assert.throws(() =>
    validatePaymentPayloadStructure({ ...payload, extensions: inheritedExtensions }),
  );
  assert.throws(() =>
    validatePaymentPayloadEnvelope({ ...payload, extensions: inheritedExtensions }),
  );

  const topLevelAccessor = { ...payload };
  Object.defineProperty(topLevelAccessor, 'extensions', {
    enumerable: true,
    get() {
      getterReads += 1;
      return undefined;
    },
  });
  const topLevelAccessorDescriptor = Object.getOwnPropertyDescriptor(
    topLevelAccessor,
    'extensions',
  );
  assert.throws(() => validatePaymentPayloadStructure(topLevelAccessor));
  assert.throws(() => validatePaymentPayloadEnvelope(topLevelAccessor));
  assert.equal(getterReads, 0);
  assert.equal(
    isDeepStrictEqual(
      Object.getOwnPropertyDescriptor(topLevelAccessor, 'extensions'),
      topLevelAccessorDescriptor,
    ),
    true,
  );

  let setterWrites = 0;
  const topLevelSetterOnly = { ...payload };
  Object.defineProperty(topLevelSetterOnly, 'extensions', {
    enumerable: true,
    set() {
      setterWrites += 1;
    },
  });
  const topLevelSetterDescriptor = Object.getOwnPropertyDescriptor(
    topLevelSetterOnly,
    'extensions',
  );
  assert.throws(() => validatePaymentPayloadStructure(topLevelSetterOnly));
  assert.throws(() => validatePaymentPayloadEnvelope(topLevelSetterOnly));
  assert.equal(setterWrites, 0);
  assert.equal(
    isDeepStrictEqual(
      Object.getOwnPropertyDescriptor(topLevelSetterOnly, 'extensions'),
      topLevelSetterDescriptor,
    ),
    true,
  );

  const requiredTopLevelAccessor = { ...required };
  Object.defineProperty(requiredTopLevelAccessor, 'extensions', {
    enumerable: true,
    get() {
      getterReads += 1;
      return {};
    },
  });
  assert.throws(() => validatePaymentRequired(requiredTopLevelAccessor));
  assert.equal(getterReads, 0);

  const topLevelNonEnumerable = { ...payload };
  Object.defineProperty(topLevelNonEnumerable, 'extensions', {
    enumerable: false,
    value: undefined,
  });
  const topLevelNonEnumerableDescriptor = Object.getOwnPropertyDescriptor(
    topLevelNonEnumerable,
    'extensions',
  );
  assert.throws(() => validatePaymentPayloadStructure(topLevelNonEnumerable));
  assert.throws(() => validatePaymentPayloadEnvelope(topLevelNonEnumerable));
  assert.equal(
    isDeepStrictEqual(
      Object.getOwnPropertyDescriptor(topLevelNonEnumerable, 'extensions'),
      topLevelNonEnumerableDescriptor,
    ),
    true,
  );

  const requiredTopLevelNonEnumerable = { ...required };
  Object.defineProperty(requiredTopLevelNonEnumerable, 'extensions', {
    enumerable: false,
    value: undefined,
  });
  assert.throws(() => validatePaymentRequired(requiredTopLevelNonEnumerable));
  assert.throws(() =>
    validatePaymentRequiredForOfferSelection(requiredTopLevelNonEnumerable),
  );

  let coercionCalls = 0;
  const coercionExtensions = {};
  Object.defineProperty(coercionExtensions, Symbol.toPrimitive, {
    enumerable: true,
    value() {
      coercionCalls += 1;
      return 'synthetic';
    },
  });
  assert.throws(() =>
    validatePaymentPayloadStructure({ ...payload, extensions: coercionExtensions }),
  );
  assert.throws(() =>
    validatePaymentPayloadEnvelope({ ...payload, extensions: coercionExtensions }),
  );
  assert.equal(coercionCalls, 0);

  const inheritedExtensionsDescriptor = Object.getOwnPropertyDescriptor(
    Object.prototype,
    'extensions',
  );
  try {
    Object.defineProperty(Object.prototype, 'extensions', {
      value: undefined,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    const inheritedPayload = structuredClone(payload);
    const inheritedRequired = structuredClone(required);
    assert.equal(Object.hasOwn(inheritedPayload, 'extensions'), false);
    assert.equal(Object.hasOwn(inheritedRequired, 'extensions'), false);
    assert.doesNotThrow(() => validatePaymentPayloadStructure(inheritedPayload));
    assert.doesNotThrow(() => validatePaymentPayloadEnvelope(inheritedPayload));
    assert.doesNotThrow(() => validatePaymentRequired(inheritedRequired));
    assert.doesNotThrow(() =>
      validatePaymentRequiredForOfferSelection(inheritedRequired),
    );
  } finally {
    if (inheritedExtensionsDescriptor) {
      Object.defineProperty(
        Object.prototype,
        'extensions',
        inheritedExtensionsDescriptor,
      );
    } else {
      Reflect.deleteProperty(Object.prototype, 'extensions');
    }
  }
});
