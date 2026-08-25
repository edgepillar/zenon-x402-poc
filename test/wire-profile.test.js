import test from 'node:test';
import assert from 'node:assert/strict';
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
