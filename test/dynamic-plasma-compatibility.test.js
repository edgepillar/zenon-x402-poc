import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DYNAMIC_PLASMA_COMPATIBILITY,
  classifyDynamicPlasmaCompatibility,
} from '../src/zenon/dynamic-plasma-compatibility.js';

const HASH = 'ab'.repeat(32);

function frontier(overrides = {}) {
  return {
    height: 42,
    hash: HASH,
    version: 2,
    nextFusionPrice: 1000,
    nextWorkPrice: 1000,
    ...overrides,
  };
}

function observation(overrides = {}) {
  return {
    availablePlasma: 21000,
    basePlasma: 21000,
    requiredDifficulty: 0,
    ...overrides,
  };
}

function input(overrides = {}) {
  const beforeFrontier = frontier();
  return {
    chainProfileMatch: { classification: 'MATCH' },
    beforeFrontier,
    rpcObservation: observation(),
    afterFrontier: { ...beforeFrontier },
    ...overrides,
  };
}

function assertRejected(value) {
  assert.throws(
    () => classifyDynamicPlasmaCompatibility(value),
    error => error?.code === 'dynamic_plasma_compatibility_input_rejected',
  );
}

test('baseline v2 observation is same-frontier bound and produces a checked fusion-only quote', () => {
  const result = classifyDynamicPlasmaCompatibility(input());

  assert.deepEqual(result, {
    classification: 'DP_ACTIVE',
    reason: 'NONE',
    scope: 'OBSERVED_FRONTIER_ONLY',
    chainProfileGuard: 'MATCH',
    chainAuthentication: 'NOT_ESTABLISHED',
    afterSigningAction: 'NONE',
    quote: {
      frontier: frontier(),
      rpcObservation: observation(),
      selectedFusedPlasma: 21000,
      requiredDifficulty: 0,
      powRequired: false,
      pricingMode: 'FUSION_ONLY',
      sdk105BasePlasmaUnderpricingDetected: false,
    },
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.quote), true);
  assert.equal(Object.isFrozen(result.quote.frontier), true);
  assert.equal(Object.isFrozen(result.quote.rpcObservation), true);
  assert.equal(DYNAMIC_PLASMA_COMPATIBILITY.priceScale, 1000);
  assert.equal(DYNAMIC_PLASMA_COMPATIBILITY.difficultyPerPlasma, 1500);
});

test('elevated fusion price selects the price-scaled fused amount and detects SDK 1.0.5 underpricing', () => {
  const pricedFrontier = frontier({ nextFusionPrice: 1200 });
  const result = classifyDynamicPlasmaCompatibility(input({
    beforeFrontier: pricedFrontier,
    rpcObservation: observation({ availablePlasma: 25200 }),
    afterFrontier: { ...pricedFrontier },
  }));

  assert.equal(result.classification, 'DP_ACTIVE');
  assert.equal(result.quote.selectedFusedPlasma, 25200);
  assert.notEqual(result.quote.selectedFusedPlasma, 21000);
  assert.equal(result.quote.requiredDifficulty, 0);
  assert.equal(result.quote.sdk105BasePlasmaUnderpricingDetected, true);
});

test('partial fusion plus PoW uses independently calculated non-even rounding', () => {
  const pricedFrontier = frontier({ nextFusionPrice: 1200, nextWorkPrice: 1100 });
  const result = classifyDynamicPlasmaCompatibility(input({
    beforeFrontier: pricedFrontier,
    rpcObservation: observation({
      availablePlasma: 10000,
      requiredDifficulty: 20901000,
    }),
    afterFrontier: { ...pricedFrontier },
  }));

  assert.equal(result.classification, 'DP_ACTIVE');
  assert.equal(result.quote.selectedFusedPlasma, 10000);
  assert.equal(result.quote.requiredDifficulty, 20901000);
  assert.equal(result.quote.powRequired, true);
  assert.equal(result.quote.pricingMode, 'FUSION_AND_POW');
});

test('zero fusion requires the complete price-scaled PoW amount', () => {
  const pricedFrontier = frontier({ nextFusionPrice: 1200, nextWorkPrice: 1100 });
  const result = classifyDynamicPlasmaCompatibility(input({
    beforeFrontier: pricedFrontier,
    rpcObservation: observation({
      availablePlasma: 0,
      requiredDifficulty: 34650000,
    }),
    afterFrontier: { ...pricedFrontier },
  }));

  assert.equal(result.quote.selectedFusedPlasma, 0);
  assert.equal(result.quote.requiredDifficulty, 34650000);
  assert.equal(result.quote.powRequired, true);
});

test('the exact rounded fusion boundary is sufficient without PoW', () => {
  const pricedFrontier = frontier({ nextFusionPrice: 1500 });
  const result = classifyDynamicPlasmaCompatibility(input({
    beforeFrontier: pricedFrontier,
    rpcObservation: observation({ basePlasma: 3, availablePlasma: 5 }),
    afterFrontier: { ...pricedFrontier },
  }));

  assert.equal(result.quote.selectedFusedPlasma, 5);
  assert.equal(result.quote.requiredDifficulty, 0);
  assert.equal(result.quote.sdk105BasePlasmaUnderpricingDetected, true);
});

test('node difficulty or fusion sufficiency inconsistencies are classified incoherent', () => {
  const pricedFrontier = frontier({ nextFusionPrice: 1200, nextWorkPrice: 1100 });
  for (const rpcObservation of [
    observation({ availablePlasma: 10000, requiredDifficulty: 20900999 }),
    observation({ availablePlasma: 25200, requiredDifficulty: 1 }),
  ]) {
    const result = classifyDynamicPlasmaCompatibility(input({
      beforeFrontier: pricedFrontier,
      rpcObservation,
      afterFrontier: { ...pricedFrontier },
    }));
    assert.equal(result.classification, 'MISBOUND_OR_INCOHERENT');
    assert.equal(result.reason, 'RPC_QUOTE_INCOHERENT');
    assert.equal(result.quote, null);
  }
});

test('v1 is explicitly pre-Dynamic-Plasma and has no quote or legacy fallback', () => {
  const legacyFrontier = frontier({ version: 1, nextFusionPrice: 0, nextWorkPrice: 0 });
  const result = classifyDynamicPlasmaCompatibility(input({
    beforeFrontier: legacyFrontier,
    afterFrontier: { ...legacyFrontier },
  }));

  assert.equal(result.classification, 'PRE_DP');
  assert.equal(result.reason, 'PRE_DYNAMIC_PLASMA');
  assert.equal(result.quote, null);
});

test('frontier drift across the RPC observation is never quoted', () => {
  for (const afterFrontier of [
    frontier({ height: 43 }),
    frontier({ hash: 'cd'.repeat(32) }),
    frontier({ version: 1, nextFusionPrice: 0, nextWorkPrice: 0 }),
    frontier({ nextFusionPrice: 1001 }),
    frontier({ nextWorkPrice: 1001 }),
  ]) {
    const result = classifyDynamicPlasmaCompatibility(input({ afterFrontier }));
    assert.equal(result.classification, 'MISBOUND_OR_INCOHERENT');
    assert.equal(result.reason, 'FRONTIER_MISMATCH');
    assert.equal(result.quote, null);
  }
});

test('injected profile mismatch, including reset label or identifier swaps, is incoherent rather than authenticated', () => {
  const result = classifyDynamicPlasmaCompatibility(input({
    chainProfileMatch: { classification: 'MISMATCH' },
  }));

  assert.equal(result.classification, 'MISBOUND_OR_INCOHERENT');
  assert.equal(result.reason, 'CHAIN_PROFILE_MISMATCH');
  assert.equal(result.chainAuthentication, 'NOT_ESTABLISHED');
  assert.equal(result.quote, null);
});

test('missing normalized profile evidence or detached observations classify unavailable', () => {
  const unavailableProfile = classifyDynamicPlasmaCompatibility(input({
    chainProfileMatch: { classification: 'UNAVAILABLE' },
  }));
  assert.equal(unavailableProfile.classification, 'UNAVAILABLE');
  assert.equal(unavailableProfile.reason, 'DATA_UNAVAILABLE');

  for (const key of ['beforeFrontier', 'rpcObservation', 'afterFrontier']) {
    const result = classifyDynamicPlasmaCompatibility(input({ [key]: null }));
    assert.equal(result.classification, 'UNAVAILABLE');
    assert.equal(result.quote, null);
  }
});

test('unsupported versions and consensus-incoherent prices never activate', () => {
  for (const candidate of [
    frontier({ version: 0, nextFusionPrice: 0, nextWorkPrice: 0 }),
    frontier({ version: 3 }),
    frontier({ version: 2, nextFusionPrice: 999 }),
    frontier({ version: 2, nextWorkPrice: 999 }),
    frontier({ version: 1, nextFusionPrice: 1000, nextWorkPrice: 1000 }),
  ]) {
    const result = classifyDynamicPlasmaCompatibility(input({
      beforeFrontier: candidate,
      afterFrontier: { ...candidate },
    }));
    assert.equal(result.classification, 'MISBOUND_OR_INCOHERENT');
    assert.equal(result.quote, null);
  }
});

test('unexpected activation claims, accessors, proxies, and exotic prototypes are rejected', () => {
  assertRejected({ ...input(), dynamicPlasmaSpork: true });
  assertRejected(input({ beforeFrontier: { ...frontier(), active: true } }));
  assertRejected(input({ chainProfileMatch: { classification: 'MATCH', authenticated: true } }));
  assertRejected(input({ chainProfileMatch: { matched: true } }));

  let getterCalls = 0;
  const accessor = input();
  Object.defineProperty(accessor.beforeFrontier, 'height', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 42;
    },
  });
  assertRejected(accessor);
  assert.equal(getterCalls, 0);

  let proxyTrapCalls = 0;
  const hostileProxy = new Proxy(observation(), {
    getPrototypeOf() { proxyTrapCalls += 1; return Object.prototype; },
    ownKeys() { proxyTrapCalls += 1; return []; },
    getOwnPropertyDescriptor() { proxyTrapCalls += 1; return undefined; },
    get() { proxyTrapCalls += 1; return undefined; },
  });
  assertRejected(input({ rpcObservation: hostileProxy }));
  assert.equal(proxyTrapCalls, 0);
  assertRejected(input({ afterFrontier: Object.assign(Object.create(null), frontier()) }));
  assertRejected(input({ chainProfileMatch: new (class Guard { constructor() { this.classification = 'MATCH'; } })() }));
});

test('a zero-height value in either frontier snapshot is rejected before classification', () => {
  assertRejected(input({
    beforeFrontier: frontier({ height: 0 }),
  }));
  assertRejected(input({
    afterFrontier: frontier({ height: 0 }),
  }));
});

test('invalid numeric and hash projections fail closed before arithmetic', () => {
  for (const beforeFrontier of [
    frontier({ height: -1 }),
    frontier({ height: Number.MAX_SAFE_INTEGER + 1 }),
    frontier({ hash: HASH.toUpperCase() }),
    frontier({ nextFusionPrice: -0 }),
    frontier({ nextWorkPrice: 1.5 }),
  ]) {
    assertRejected(input({ beforeFrontier, afterFrontier: { ...beforeFrontier } }));
  }
  for (const rpcObservation of [
    observation({ basePlasma: 0 }),
    observation({ availablePlasma: -1 }),
    observation({ requiredDifficulty: Number.NaN }),
    observation({ basePlasma: '21000' }),
    observation({ requiredDifficulty: 1n }),
  ]) {
    assertRejected(input({ rpcObservation }));
  }
});

test('safe-integer boundary succeeds only when every calculated result is representable', () => {
  const maximum = Number.MAX_SAFE_INTEGER;
  const safe = classifyDynamicPlasmaCompatibility(input({
    rpcObservation: observation({ basePlasma: maximum, availablePlasma: maximum }),
  }));
  assert.equal(safe.classification, 'DP_ACTIVE');
  assert.equal(safe.quote.selectedFusedPlasma, maximum);

  const overflowFrontier = frontier({ nextFusionPrice: 1001 });
  assertRejected(input({
    beforeFrontier: overflowFrontier,
    rpcObservation: observation({ basePlasma: maximum, availablePlasma: maximum }),
    afterFrontier: { ...overflowFrontier },
  }));
  assertRejected(input({
    rpcObservation: observation({ basePlasma: maximum, availablePlasma: 0, requiredDifficulty: 0 }),
  }));
});

test('classification is detached, immutable, and contains no I/O or automatic post-signing action', () => {
  const source = readFileSync(new URL('../src/zenon/dynamic-plasma-compatibility.js', import.meta.url), 'utf8');
  const candidate = input();
  const before = structuredClone(candidate);
  const result = classifyDynamicPlasmaCompatibility(candidate);

  assert.deepEqual(candidate, before);
  assert.throws(() => { result.quote.frontier.height = 99; }, TypeError);
  candidate.beforeFrontier.height = 43;
  assert.equal(result.quote.frontier.height, 42);
  assert.equal(result.afterSigningAction, 'NONE');
  assert.equal('apply' in result, false);
  assert.doesNotMatch(source, /\b(fetch|WebSocket|XMLHttpRequest|console|process|Date|Math\.random|setTimeout|setInterval)\b/);
  assert.doesNotMatch(source, /\b(sign|publish|wallet|nonce|retry|replacement)\b/i);
});
