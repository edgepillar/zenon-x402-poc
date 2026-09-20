import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DYNAMIC_PLASMA_OBSERVATION_CONTRACT,
  normalizeDynamicPlasmaObservation,
} from '../src/zenon/dynamic-plasma-observation-normalizer.js';

const CHAIN_IDENTIFIER = '73404';
const MAX_UINT64 = '18446744073709551615';
const GENESIS_HASH = '11'.repeat(32);
const HEIGHT_TWO_HASH = '22'.repeat(32);
const FRONTIER_HASH = '33'.repeat(32);
const LIBP2P_ID = `${'0'.repeat(63)}1`;
const DYNAMIC_PLASMA_ID = `${'0'.repeat(63)}2`;
const OTHER_SPORK_ID = '44'.repeat(32);

function expectedChainProfile(overrides = {}) {
  return {
    version: 1,
    chainIdentifier: CHAIN_IDENTIFIER,
    genesisMomentumHash: GENESIS_HASH,
    ...overrides,
  };
}

function compiledSporkIds(overrides = {}) {
  return {
    dynamicPlasmaId: DYNAMIC_PLASMA_ID,
    libp2pId: LIBP2P_ID,
    ...overrides,
  };
}

function frontier(overrides = {}) {
  return {
    chainIdentifier: CHAIN_IDENTIFIER,
    height: 42,
    hash: FRONTIER_HASH,
    version: 2,
    nextFusionPrice: 1200,
    nextWorkPrice: 1100,
    ...overrides,
  };
}

function profileEvidence(overrides = {}) {
  return {
    heightTwo: {
      chainIdentifier: CHAIN_IDENTIFIER,
      height: 2,
      hash: HEIGHT_TWO_HASH,
      previousHash: GENESIS_HASH,
      version: 1,
      ...(overrides.heightTwo ?? {}),
    },
  };
}

function spork(id, name, activated, enforcementHeight) {
  return { id, name, activated, enforcementHeight };
}

function sporks(overrides = {}) {
  const list = overrides.list ?? [
    spork(LIBP2P_ID, 'libp2p', false, 20),
    spork(DYNAMIC_PLASMA_ID, 'dynamic-plasma', true, 10),
    spork(OTHER_SPORK_ID, 'other-reviewed-spork', true, 0),
  ];
  return {
    count: overrides.count ?? list.length,
    list,
  };
}

function plasmaVariables(overrides = {}) {
  return {
    MaxBasePlasmaInMomentum: 4200000,
    FusedPlasmaTarget: 1050000,
    PowPlasmaTarget: 1050000,
    MaxPriceChangePercent: 10,
    PriceChangeDenominator: 20,
    ...overrides,
  };
}

function rpcObservation(overrides = {}) {
  return {
    availablePlasma: 10000,
    basePlasma: 21000,
    requiredDifficulty: 20901000,
    ...overrides,
  };
}

function endpointObservation(overrides = {}) {
  const beforeFrontier = frontier(overrides.beforeFrontier);
  return {
    beforeFrontier,
    profileEvidence: overrides.profileEvidence ?? profileEvidence(),
    sporks: overrides.sporks ?? sporks(),
    plasmaVariables: overrides.plasmaVariables ?? plasmaVariables(),
    rpcObservation: overrides.rpcObservation ?? rpcObservation(),
    afterFrontier: overrides.afterFrontier ?? { ...beforeFrontier },
  };
}

function clone(value) {
  return structuredClone(value);
}

function withChainIdentifier(candidate, chainIdentifier) {
  candidate.expectedChainProfile.chainIdentifier = chainIdentifier;
  for (const endpoint of candidate.endpointObservations) {
    endpoint.beforeFrontier.chainIdentifier = chainIdentifier;
    endpoint.profileEvidence.heightTwo.chainIdentifier = chainIdentifier;
    endpoint.afterFrontier.chainIdentifier = chainIdentifier;
  }
  return candidate;
}

function fullSporkList(length) {
  return Array.from({ length }, (_, index) => {
    const id = index.toString(16).padStart(64, '0');
    if (id === LIBP2P_ID) return spork(id, 'libp2p', false, 20);
    if (id === DYNAMIC_PLASMA_ID) return spork(id, 'dynamic-plasma', true, 10);
    return spork(id, `spork-${index}`, true, 0);
  });
}

function input(overrides = {}) {
  const first = endpointObservation(overrides.endpoint);
  return {
    expectedChainProfile: overrides.expectedChainProfile ?? expectedChainProfile(),
    compiledSporkIds: overrides.compiledSporkIds ?? compiledSporkIds(),
    endpointObservations: overrides.endpointObservations ?? [first, clone(first)],
  };
}

function assertRejected(value) {
  assert.throws(
    () => normalizeDynamicPlasmaObservation(value),
    error => error instanceof TypeError &&
      error.code === 'dynamic_plasma_observation_input_rejected' &&
      error.message === 'Dynamic Plasma observation input rejected',
  );
}

function assertEvidenceFailure(result, reason, classification = 'MISBOUND_OR_INCOHERENT') {
  assert.equal(result.classification, classification);
  assert.equal(result.reason, reason);
  assert.equal(result.observation, null);
  assert.equal(result.compatibility, null);
  assert.equal(result.chainAuthentication, 'NOT_ESTABLISHED');
  assert.equal(result.canonicality, 'NOT_ESTABLISHED');
  assert.equal(result.finality, 'NOT_ESTABLISHED');
  assert.equal(result.afterSigningAction, 'NONE');
}

test('normalizes two matching detached projections and delegates checked pricing', () => {
  const candidate = input();
  const before = clone(candidate);
  const result = normalizeDynamicPlasmaObservation(candidate);

  assert.equal(result.schemaVersion, 1);
  assert.equal(result.classification, 'DP_ACTIVE');
  assert.equal(result.reason, 'NONE');
  assert.equal(result.scope, 'DETACHED_DUAL_ENDPOINT_OBSERVATION');
  assert.equal(result.chainAuthentication, 'NOT_ESTABLISHED');
  assert.equal(result.canonicality, 'NOT_ESTABLISHED');
  assert.equal(result.finality, 'NOT_ESTABLISHED');
  assert.equal(result.afterSigningAction, 'NONE');
  assert.equal(result.compatibility.classification, 'DP_ACTIVE');
  assert.equal(result.compatibility.quote.selectedFusedPlasma, 10000);
  assert.equal(result.compatibility.quote.requiredDifficulty, 20901000);
  assert.equal(result.compatibility.quote.pricingMode, 'FUSION_AND_POW');
  assert.deepEqual(candidate, before);
  assert.equal(result.observation.expectedChainProfile.chainIdentifier, CHAIN_IDENTIFIER);
  assert.equal(result.observation.sporks.list[1].name, 'dynamic-plasma');
  assert.equal(DYNAMIC_PLASMA_OBSERVATION_CONTRACT.schemaVersion, 1);
  assert.equal(DYNAMIC_PLASMA_OBSERVATION_CONTRACT.endpointCount, 2);
  assert.equal(DYNAMIC_PLASMA_OBSERVATION_CONTRACT.observationBounds.maximumSporkSnapshotEntries, 1024);
  assert.equal(
    'maximumSporkSnapshotEntries' in DYNAMIC_PLASMA_OBSERVATION_CONTRACT.consensusBounds,
    false,
  );
});

test('null endpoint evidence is unavailable and never reaches compatibility pricing', () => {
  for (const endpointObservations of [
    [null, endpointObservation()],
    [endpointObservation(), null],
    [null, null],
  ]) {
    assertEvidenceFailure(
      normalizeDynamicPlasmaObservation(input({ endpointObservations })),
      'ENDPOINT_DATA_UNAVAILABLE',
      'UNAVAILABLE',
    );
  }
});

test('partial pagination and count mismatches are unavailable rather than chain incoherence', () => {
  const complete = sporks().list;
  const candidates = [
    sporks({ count: complete.length + 1, list: complete }),
    sporks({ count: complete.length, list: complete.slice(0, -1) }),
  ];
  for (const snapshot of candidates) {
    const first = endpointObservation({ sporks: snapshot });
    assertEvidenceFailure(
      normalizeDynamicPlasmaObservation(input({ endpointObservations: [first, clone(first)] })),
      'SPORK_SNAPSHOT_INCOMPLETE',
      'UNAVAILABLE',
    );
  }
});

test('six equivalent spork permutations canonicalize identically before endpoint comparison', () => {
  const entries = sporks().list;
  const permutations = [
    [entries[0], entries[1], entries[2]],
    [entries[0], entries[2], entries[1]],
    [entries[1], entries[0], entries[2]],
    [entries[1], entries[2], entries[0]],
    [entries[2], entries[0], entries[1]],
    [entries[2], entries[1], entries[0]],
  ];
  const expectedIds = entries.map(entry => entry.id).sort();

  for (const permutation of permutations) {
    const first = endpointObservation({ sporks: sporks({ list: permutation }) });
    const second = endpointObservation({ sporks: sporks({ list: [...permutation].reverse() }) });
    const result = normalizeDynamicPlasmaObservation(input({ endpointObservations: [first, second] }));
    assert.equal(result.classification, 'DP_ACTIVE');
    assert.deepEqual(result.observation.sporks.list.map(entry => entry.id), expectedIds);
  }
});

test('schema-v1 spork snapshot cap accepts 1024 entries and makes over-cap evidence unavailable', () => {
  const atCap = fullSporkList(1024);
  const accepted = endpointObservation({ sporks: sporks({ list: atCap }) });
  const result = normalizeDynamicPlasmaObservation(input({ endpointObservations: [accepted, clone(accepted)] }));
  assert.equal(result.classification, 'DP_ACTIVE');
  assert.equal(result.observation.sporks.list.length, 1024);

  for (const snapshot of [
    sporks({ list: fullSporkList(1025) }),
    sporks({ count: 1025, list: sporks().list }),
  ]) {
    const first = endpointObservation({ sporks: snapshot });
    assertEvidenceFailure(
      normalizeDynamicPlasmaObservation(input({ endpointObservations: [first, clone(first)] })),
      'SPORK_SNAPSHOT_INCOMPLETE',
      'UNAVAILABLE',
    );
  }
});

test('RPC spork count retains its uint32 structural bound before schema-v1 availability policy', () => {
  const first = endpointObservation({ sporks: sporks({ count: 4294967296 }) });
  assertRejected(input({ endpointObservations: [first, clone(first)] }));
});

test('before and after must bind the quote to the exact same frontier', () => {
  for (const afterFrontier of [
    frontier({ chainIdentifier: '73405' }),
    frontier({ height: 43 }),
    frontier({ hash: '55'.repeat(32) }),
    frontier({ version: 1, nextFusionPrice: 0, nextWorkPrice: 0 }),
    frontier({ nextFusionPrice: 1201 }),
    frontier({ nextWorkPrice: 1101 }),
  ]) {
    const first = endpointObservation({ afterFrontier });
    assertEvidenceFailure(
      normalizeDynamicPlasmaObservation(input({ endpointObservations: [first, clone(first)] })),
      'FRONTIER_BINDING_MISMATCH',
    );
  }
});

test('the two exact normalized endpoint observations must agree', () => {
  const baseline = endpointObservation();
  const changes = [
    endpointObservation({ beforeFrontier: { hash: '55'.repeat(32) } }),
    endpointObservation({ profileEvidence: profileEvidence({ heightTwo: { hash: '66'.repeat(32) } }) }),
    endpointObservation({ sporks: sporks({ list: [
      spork(LIBP2P_ID, 'libp2p', true, 20),
      ...sporks().list.slice(1),
    ] }) }),
    endpointObservation({ plasmaVariables: plasmaVariables({ PriceChangeDenominator: 21 }) }),
    endpointObservation({ rpcObservation: rpcObservation({ availablePlasma: 9999 }) }),
  ];
  for (const second of changes) {
    assertEvidenceFailure(
      normalizeDynamicPlasmaObservation(input({ endpointObservations: [baseline, second] })),
      'ENDPOINT_OBSERVATION_MISMATCH',
    );
  }
});

test('profile evidence must bind both endpoints and both frontiers to the expected genesis profile', () => {
  const mismatches = [
    input({ expectedChainProfile: expectedChainProfile({ chainIdentifier: '73405' }) }),
    input({ expectedChainProfile: expectedChainProfile({ genesisMomentumHash: '77'.repeat(32) }) }),
    input({ endpoint: { beforeFrontier: { chainIdentifier: '73405' } } }),
    input({ endpoint: { profileEvidence: profileEvidence({ heightTwo: { chainIdentifier: '73405' } }) } }),
    input({ endpoint: { profileEvidence: profileEvidence({ heightTwo: { previousHash: '77'.repeat(32) } }) } }),
  ];
  for (const candidate of mismatches) {
    assertEvidenceFailure(
      normalizeDynamicPlasmaObservation(candidate),
      'PROFILE_GENESIS_MISMATCH',
    );
  }
});

test('compiled IDs must bind to their exact canonical names with no canonical duplicates', () => {
  const baseline = sporks().list;
  const candidates = [
    [
      spork(LIBP2P_ID, 'dynamic-plasma', false, 20),
      spork(DYNAMIC_PLASMA_ID, 'libp2p', true, 10),
      baseline[2],
    ],
    [
      spork(LIBP2P_ID, 'libp2p', false, 20),
      spork(DYNAMIC_PLASMA_ID, 'not-dynamic-plasma', true, 10),
      baseline[2],
    ],
    [
      spork(LIBP2P_ID, 'libp2p', false, 20),
      spork(DYNAMIC_PLASMA_ID, 'dynamic-plasma', true, 10),
      spork(OTHER_SPORK_ID, 'dynamic-plasma', true, 0),
    ],
    [
      spork(LIBP2P_ID, 'libp2p', false, 20),
      spork(LIBP2P_ID, 'dynamic-plasma', true, 10),
      baseline[2],
    ],
  ];
  for (const list of candidates) {
    const sorted = [...list].sort((left, right) => left.id.localeCompare(right.id));
    const first = endpointObservation({ sporks: sporks({ list: sorted }) });
    assertEvidenceFailure(
      normalizeDynamicPlasmaObservation(input({ endpointObservations: [first, clone(first)] })),
      'SPORK_BINDING_MISMATCH',
    );
  }
});

test('spork names enforce the Go 5..40 UTF-8-byte contract', () => {
  for (const name of ['aaaaa', 'a'.repeat(40), 'ééé', 'é'.repeat(20)]) {
    const list = sporks().list.map(entry => entry.id === OTHER_SPORK_ID
      ? { ...entry, name }
      : entry);
    const first = endpointObservation({ sporks: sporks({ list }) });
    assert.equal(
      normalizeDynamicPlasmaObservation(input({ endpointObservations: [first, clone(first)] })).classification,
      'DP_ACTIVE',
    );
  }

  for (const name of ['aaaa', 'a'.repeat(41), 'éé', 'é'.repeat(21)]) {
    const list = sporks().list.map(entry => entry.id === OTHER_SPORK_ID
      ? { ...entry, name }
      : entry);
    const first = endpointObservation({ sporks: sporks({ list }) });
    assertRejected(input({ endpointObservations: [first, clone(first)] }));
  }
});

test('oversized spork names fail before UTF-8 encoding work', () => {
  const encoderPrototype = Object.getPrototypeOf(new TextEncoder());
  const originalEncode = encoderPrototype.encode;
  let encodeCalls = 0;
  encoderPrototype.encode = function countedEncode(...args) {
    encodeCalls += 1;
    return Reflect.apply(originalEncode, this, args);
  };
  try {
    const baseline = sporks().list;
    const list = [
      { ...baseline[2], id: '00'.repeat(32), name: 'a'.repeat(1000000) },
      baseline[0],
      baseline[1],
    ];
    const first = endpointObservation({ sporks: sporks({ list }) });
    assertRejected(input({ endpointObservations: [first, clone(first)] }));
    assert.equal(encodeCalls, 0);
  } finally {
    encoderPrototype.encode = originalEncode;
  }
});

test('current stale profile plus cross-wired testnet spork labels can never classify active', () => {
  const crossWired = [
    spork(LIBP2P_ID, 'dynamic-plasma', true, 10),
    spork(DYNAMIC_PLASMA_ID, 'libp2p', false, 20),
    spork(OTHER_SPORK_ID, 'other-reviewed-spork', true, 0),
  ];
  const first = endpointObservation({ sporks: sporks({ list: crossWired }) });
  const result = normalizeDynamicPlasmaObservation(input({
    expectedChainProfile: expectedChainProfile({ genesisMomentumHash: '88'.repeat(32) }),
    endpointObservations: [first, clone(first)],
  }));

  assert.notEqual(result.classification, 'DP_ACTIVE');
  assert.equal(result.compatibility, null);
  assert.ok(['PROFILE_GENESIS_MISMATCH', 'SPORK_BINDING_MISMATCH'].includes(result.reason));
});

test('PascalCase consensus variables are required and bounded by current consensus limits', () => {
  const incoherent = [
    { MaxBasePlasmaInMomentum: 209999 },
    { MaxBasePlasmaInMomentum: 210000000000001 },
    { FusedPlasmaTarget: 0 },
    { PowPlasmaTarget: 0 },
    { FusedPlasmaTarget: 3000000, PowPlasmaTarget: 2000000 },
    { MaxPriceChangePercent: 0 },
    { MaxPriceChangePercent: 101 },
    { PriceChangeDenominator: 0 },
    { PriceChangeDenominator: 101 },
  ];
  for (const overrides of incoherent) {
    const first = endpointObservation({ plasmaVariables: plasmaVariables(overrides) });
    assertEvidenceFailure(
      normalizeDynamicPlasmaObservation(input({ endpointObservations: [first, clone(first)] })),
      'PLASMA_VARIABLES_INCOHERENT',
    );
  }

  const wrongCase = input();
  const variables = wrongCase.endpointObservations[0].plasmaVariables;
  variables.maxBasePlasmaInMomentum = variables.MaxBasePlasmaInMomentum;
  delete variables.MaxBasePlasmaInMomentum;
  assertRejected(wrongCase);
});

test('the exact enforcement height permits the one-momentum v1 transition boundary', () => {
  const transitionSporks = sporks({ list: [
    spork(LIBP2P_ID, 'libp2p', false, 20),
    spork(DYNAMIC_PLASMA_ID, 'dynamic-plasma', true, 42),
    spork(OTHER_SPORK_ID, 'other-reviewed-spork', true, 0),
  ] });
  const preFrontier = frontier({ version: 1, nextFusionPrice: 0, nextWorkPrice: 0 });
  const first = endpointObservation({
    beforeFrontier: preFrontier,
    afterFrontier: { ...preFrontier },
    sporks: transitionSporks,
  });
  const result = normalizeDynamicPlasmaObservation(input({ endpointObservations: [first, clone(first)] }));

  assert.equal(result.classification, 'PRE_DP');
  assert.equal(result.reason, 'PRE_DYNAMIC_PLASMA');
  assert.equal(result.compatibility.classification, 'PRE_DP');
});

test('genesis special case makes height 3 the first possible v2 momentum for enforcement 0, 1, or 2', () => {
  for (const enforcementHeight of [0, 1, 2]) {
    const snapshot = sporks({ list: [
      spork(LIBP2P_ID, 'libp2p', false, 20),
      spork(DYNAMIC_PLASMA_ID, 'dynamic-plasma', true, enforcementHeight),
      spork(OTHER_SPORK_ID, 'other-reviewed-spork', true, 0),
    ] });
    const heightTwo = frontier({
      height: 2,
      hash: HEIGHT_TWO_HASH,
      version: 1,
      nextFusionPrice: 0,
      nextWorkPrice: 0,
    });
    const pre = endpointObservation({
      beforeFrontier: heightTwo,
      afterFrontier: { ...heightTwo },
      sporks: snapshot,
    });
    const preResult = normalizeDynamicPlasmaObservation(input({ endpointObservations: [pre, clone(pre)] }));
    assert.equal(preResult.classification, 'PRE_DP');

    const heightThree = frontier({ height: 3, hash: '99'.repeat(32) });
    const active = endpointObservation({
      beforeFrontier: heightThree,
      afterFrontier: { ...heightThree },
      sporks: snapshot,
    });
    assert.equal(
      normalizeDynamicPlasmaObservation(input({ endpointObservations: [active, clone(active)] })).classification,
      'DP_ACTIVE',
    );

    const staleHeightThree = {
      ...heightThree,
      version: 1,
      nextFusionPrice: 0,
      nextWorkPrice: 0,
    };
    const stale = endpointObservation({
      beforeFrontier: staleHeightThree,
      afterFrontier: { ...staleHeightThree },
      sporks: snapshot,
    });
    assertEvidenceFailure(
      normalizeDynamicPlasmaObservation(input({ endpointObservations: [stale, clone(stale)] })),
      'FRONTIER_SPORK_STATE_INCOHERENT',
    );
  }
});

test('frontier version and prices must cohere with compiled-ID enforcement state', () => {
  const cases = [
    {
      frontier: frontier({ height: 43, version: 1, nextFusionPrice: 0, nextWorkPrice: 0 }),
      dynamic: spork(DYNAMIC_PLASMA_ID, 'dynamic-plasma', true, 42),
    },
    {
      frontier: frontier({ height: 42, version: 2 }),
      dynamic: spork(DYNAMIC_PLASMA_ID, 'dynamic-plasma', true, 42),
    },
    {
      frontier: frontier({ height: 41, version: 2 }),
      dynamic: spork(DYNAMIC_PLASMA_ID, 'dynamic-plasma', true, 42),
    },
    {
      frontier: frontier({ version: 2 }),
      dynamic: spork(DYNAMIC_PLASMA_ID, 'dynamic-plasma', false, 10),
    },
  ];
  for (const candidate of cases) {
    const snapshot = sporks({ list: [
      spork(LIBP2P_ID, 'libp2p', false, 20),
      candidate.dynamic,
      spork(OTHER_SPORK_ID, 'other-reviewed-spork', true, 0),
    ] });
    const first = endpointObservation({
      beforeFrontier: candidate.frontier,
      afterFrontier: { ...candidate.frontier },
      sporks: snapshot,
    });
    assertEvidenceFailure(
      normalizeDynamicPlasmaObservation(input({ endpointObservations: [first, clone(first)] })),
      'FRONTIER_SPORK_STATE_INCOHERENT',
    );
  }
});

test('inactive or not-yet-enforced Dynamic Plasma delegates as PRE_DP without a legacy fallback quote', () => {
  for (const dynamic of [
    spork(DYNAMIC_PLASMA_ID, 'dynamic-plasma', false, 10),
    spork(DYNAMIC_PLASMA_ID, 'dynamic-plasma', true, 43),
  ]) {
    const legacyFrontier = frontier({ version: 1, nextFusionPrice: 0, nextWorkPrice: 0 });
    const snapshot = sporks({ list: [
      spork(LIBP2P_ID, 'libp2p', false, 20),
      dynamic,
      spork(OTHER_SPORK_ID, 'other-reviewed-spork', true, 0),
    ] });
    const first = endpointObservation({
      beforeFrontier: legacyFrontier,
      afterFrontier: { ...legacyFrontier },
      sporks: snapshot,
    });
    const result = normalizeDynamicPlasmaObservation(input({ endpointObservations: [first, clone(first)] }));
    assert.equal(result.classification, 'PRE_DP');
    assert.equal(result.compatibility.quote, null);
  }
});

test('existing classifier reasons and checked BigInt quote consistency are preserved', () => {
  const inconsistent = endpointObservation({
    rpcObservation: rpcObservation({ requiredDifficulty: 20900999 }),
  });
  const result = normalizeDynamicPlasmaObservation(input({
    endpointObservations: [inconsistent, clone(inconsistent)],
  }));

  assert.equal(result.classification, 'MISBOUND_OR_INCOHERENT');
  assert.equal(result.reason, 'RPC_QUOTE_INCOHERENT');
  assert.equal(result.compatibility.reason, 'RPC_QUOTE_INCOHERENT');
  assert.notEqual(result.observation, null);
});

test('known compatibility input rejection is translated to the fixed normalizer error', () => {
  const maximum = Number.MAX_SAFE_INTEGER;
  const priced = frontier({ nextFusionPrice: 1001, nextWorkPrice: 1000 });
  const overflowing = endpointObservation({
    beforeFrontier: priced,
    afterFrontier: { ...priced },
    rpcObservation: rpcObservation({
      availablePlasma: maximum,
      basePlasma: maximum,
      requiredDifficulty: 0,
    }),
  });

  assertRejected(input({ endpointObservations: [overflowing, clone(overflowing)] }));
});

test('spoofed compatibility errors with the known code are rethrown unchanged', () => {
  const maximum = Number.MAX_SAFE_INTEGER;
  const priced = frontier({ nextFusionPrice: 1001, nextWorkPrice: 1000 });
  const overflowing = endpointObservation({
    beforeFrontier: priced,
    afterFrontier: { ...priced },
    rpcObservation: rpcObservation({
      availablePlasma: maximum,
      basePlasma: maximum,
      requiredDifficulty: 0,
    }),
  });
  const candidate = input({ endpointObservations: [overflowing, clone(overflowing)] });
  const OriginalTypeError = globalThis.TypeError;
  const created = [];
  function SpoofingTypeError(message) {
    const error = new OriginalTypeError(message);
    Object.defineProperty(error, 'message', {
      value: message,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    created.push(error);
    return error;
  }

  let caught;
  globalThis.TypeError = SpoofingTypeError;
  try {
    normalizeDynamicPlasmaObservation(candidate);
  } catch (error) {
    caught = error;
  } finally {
    globalThis.TypeError = OriginalTypeError;
  }

  assert.equal(created.length, 1);
  assert.equal(caught, created[0]);
  assert.equal(caught.message, 'Dynamic Plasma compatibility input rejected');
  assert.equal(Object.getOwnPropertyDescriptor(caught, 'message').enumerable, true);
});

test('all objects and arrays require exact plain data descriptors and prototypes', () => {
  assertRejected({ ...input(), transport: 'forbidden' });
  assertRejected(input({ expectedChainProfile: { ...expectedChainProfile(), extra: true } }));
  assertRejected(input({ compiledSporkIds: Object.assign(Object.create(null), compiledSporkIds()) }));
  assertRejected(input({ endpointObservations: Object.assign([endpointObservation(), endpointObservation()], { extra: true }) }));
  const extraEndpoint = endpointObservation();
  extraEndpoint.url = 'forbidden';
  assertRejected(input({ endpointObservations: [extraEndpoint, clone(extraEndpoint)] }));
  const extraSpork = sporks();
  extraSpork.list[0].description = 'forbidden';
  const first = endpointObservation({ sporks: extraSpork });
  assertRejected(input({ endpointObservations: [first, clone(first)] }));
});

test('accessors and proxies are rejected without invoking user code', () => {
  let getterCalls = 0;
  const accessor = input();
  Object.defineProperty(accessor.endpointObservations[0].beforeFrontier, 'height', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 42;
    },
  });
  assertRejected(accessor);
  assert.equal(getterCalls, 0);

  let trapCalls = 0;
  const proxy = new Proxy(endpointObservation(), {
    getPrototypeOf() { trapCalls += 1; return Object.prototype; },
    ownKeys() { trapCalls += 1; return []; },
    getOwnPropertyDescriptor() { trapCalls += 1; return undefined; },
    get() { trapCalls += 1; return undefined; },
  });
  assertRejected(input({ endpointObservations: [proxy, endpointObservation()] }));
  assert.equal(trapCalls, 0);

  const arrayProxy = new Proxy([endpointObservation(), endpointObservation()], {
    getPrototypeOf() { trapCalls += 1; return Array.prototype; },
    ownKeys() { trapCalls += 1; return []; },
    getOwnPropertyDescriptor() { trapCalls += 1; return undefined; },
    get() { trapCalls += 1; return undefined; },
  });
  assertRejected(input({ endpointObservations: arrayProxy }));
  assert.equal(trapCalls, 0);
});

test('chain identifiers use canonical positive uint64 decimal strings without number coercion', () => {
  const maximum = normalizeDynamicPlasmaObservation(withChainIdentifier(input(), MAX_UINT64));
  assert.equal(maximum.classification, 'DP_ACTIVE');
  assert.equal(maximum.observation.beforeFrontier.chainIdentifier, MAX_UINT64);

  for (const invalid of [
    '18446744073709551616',
    '100000000000000000000',
    '073404',
    '0',
    CHAIN_IDENTIFIER.length,
  ]) assertRejected(withChainIdentifier(input(), invalid));
});

test('malformed scalar values use one sanitized fixed-code error', () => {
  for (const candidate of [
    input({ expectedChainProfile: expectedChainProfile({ chainIdentifier: '073404' }) }),
    input({ expectedChainProfile: expectedChainProfile({ chainIdentifier: '0' }) }),
    input({ compiledSporkIds: compiledSporkIds({ dynamicPlasmaId: LIBP2P_ID }) }),
    input({ endpointObservations: [endpointObservation()] }),
    input({ endpoint: { beforeFrontier: { height: 0 } } }),
    input({ endpoint: { profileEvidence: { heightTwo: { ...profileEvidence().heightTwo, height: 3 } } } }),
    input({ endpoint: { rpcObservation: rpcObservation({ basePlasma: 0 }) } }),
    input({ endpoint: { plasmaVariables: plasmaVariables({ PriceChangeDenominator: 1.5 }) } }),
  ]) assertRejected(candidate);
});

test('successful output is deeply frozen, detached, and preserves no endpoint capabilities', () => {
  const candidate = input();
  const result = normalizeDynamicPlasmaObservation(candidate);

  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.observation), true);
  assert.equal(Object.isFrozen(result.observation.sporks), true);
  assert.equal(Object.isFrozen(result.observation.sporks.list), true);
  assert.equal(Object.isFrozen(result.observation.sporks.list[0]), true);
  assert.equal(Object.isFrozen(result.compatibility), true);
  assert.throws(() => { result.observation.beforeFrontier.height = 99; }, TypeError);
  candidate.endpointObservations[0].sporks.list[0].name = 'mutated';
  assert.equal(result.observation.sporks.list[0].name, 'libp2p');
  assert.equal('endpointObservations' in result.observation, false);
  assert.equal('url' in result.observation, false);
});

test('source is an inert normalizer with one compatibility delegation and no effect seams', () => {
  const source = readFileSync(
    new URL('../src/zenon/dynamic-plasma-observation-normalizer.js', import.meta.url),
    'utf8',
  );

  assert.match(source, /from ['"]\.\/dynamic-plasma-compatibility\.js['"]/);
  assert.match(source, /classifyDynamicPlasmaCompatibility\(/);
  assert.match(source, /dynamic_plasma_compatibility_input_rejected/);
  assert.match(source, /Dynamic Plasma compatibility input rejected/);
  assert.match(source, /throw error/);
  assert.ok(
    source.indexOf('fields.name.length > MAXIMUM_SPORK_NAME_BYTES') <
      source.indexOf('utf8Encoder.encode(fields.name)'),
  );
  assert.doesNotMatch(source, /\b(fetch|WebSocket|XMLHttpRequest|console|process|Date|setTimeout|setInterval)\b/);
  assert.doesNotMatch(source, /\b(wallet|mnemonic|privateKey|sign|publish|broadcast|retry|replace|reprice|fuse|qsr|pow)\b/i);
  assert.doesNotMatch(source, /node:(fs|net|http|https|tls|crypto|child_process|worker_threads)/);
});
