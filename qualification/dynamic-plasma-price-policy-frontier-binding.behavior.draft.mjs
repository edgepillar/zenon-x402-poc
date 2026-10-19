import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDynamicPlasmaPricePolicyQuote as createQuote,
  selectDynamicPlasmaPricePolicyFields as select,
  validateDynamicPlasmaPricePolicySelection as validate,
} from '../src/zenon/dynamic-plasma-price-policy.js';
import {
  classifyDynamicPlasmaCompatibility as classify,
} from '../src/zenon/dynamic-plasma-compatibility.js';
import {
  BoundedDynamicPlasmaStrategy as Bounded,
} from '../src/zenon/bounded-dynamic-plasma-strategy.js';

// Declared component observations only; no chain authentication or ancestry.
const ORIGIN_HASH = '0'.repeat(64);
const NEXT_HASH = '1'.repeat(64);
const LAST_HASH = '2'.repeat(64);
const SUBJECT = 'sha256:' + 'a'.repeat(64);
const RUNTIME = 'sha256:' + 'b'.repeat(64);
const snapshot = (...values) => JSON.stringify(values);
const policyError = error => error instanceof TypeError
  && error.name === 'TypeError'
  && error.message === 'Dynamic Plasma price policy input rejected'
  && error.code === 'dynamic_plasma_price_policy_input_rejected';

// Independent Number oracle for these small integer vectors, not shared math.
function oracle(base, available, fusion, work) {
  const fusedPlasma = Math.min(available, Math.ceil(base * fusion / 1000));
  const remaining = Math.max(0, base - Math.floor(fusedPlasma * 1000 / fusion));
  return {
    fusedPlasma,
    difficulty: Math.ceil(remaining * work / 1000) * 1500,
  };
}

function observation({
  height = 100, hash = ORIGIN_HASH, fusion = 1200, work = 1200,
  available = 1000,
} = {}) {
  const frontier = {
    height, hash, version: 2, nextFusionPrice: fusion, nextWorkPrice: work,
  };
  return {
    chainProfileMatch: { classification: 'MATCH' },
    beforeFrontier: { ...frontier },
    rpcObservation: {
      availablePlasma: available,
      basePlasma: 100,
      requiredDifficulty: oracle(100, available, fusion, work).difficulty,
    },
    afterFrontier: { ...frontier },
  };
}

function context(raw, policy) {
  return {
    phase: 'UNSIGNED', subjectDigest: SUBJECT, runtimeContextDigest: RUNTIME,
    observation: raw, policy,
  };
}

function assertDeclared(quote, compatibility) {
  assert.equal(quote.quoteVersion, 1);
  assert.equal(quote.scope, 'DECLARED_UNSIGNED_PRICE_BOUND');
  assert.equal(quote.chainAuthentication, 'NOT_ESTABLISHED');
  assert.equal(quote.frontierContinuity, 'HEIGHT_WINDOW_ONLY_NO_ANCESTRY_PROOF');
  assert.equal(quote.afterSigningAction, 'NONE');
  assert.equal(compatibility.classification, 'DP_ACTIVE');
  assert.equal(compatibility.reason, 'NONE');
  assert.equal(compatibility.scope, 'OBSERVED_FRONTIER_ONLY');
  assert.equal(compatibility.chainProfileGuard, 'MATCH');
  assert.equal(compatibility.chainAuthentication, 'NOT_ESTABLISHED');
  assert.equal(compatibility.afterSigningAction, 'NONE');
}

async function plan(maxFusedPlasma) {
  const policy = {
    policyVersion: 1, maxPriceChangePercent: 10, maxMomentumAdvances: 2,
    maxFusedPlasma, maxDifficulty: maxFusedPlasma === 1000 ? 0 : 300000,
  };
  const originInput = context(observation(), policy);
  const before = snapshot(originInput);
  const compatibility = classify(originInput.observation);
  const quote = createQuote({
    compatibility, policy, subjectDigest: SUBJECT, runtimeContextDigest: RUNTIME,
  });
  const strategy = new Bounded();
  assert.deepEqual(await strategy.quote(originInput), quote);
  assert.equal(snapshot(originInput), before);
  // floor(floor(1200 * 110 / 100) * 110 / 100) = 1452.
  assert.deepEqual(quote.boundPrices, { fusionPrice: 1452, workPrice: 1452 });
  const expected = oracle(100, Math.min(1000, maxFusedPlasma), 1452, 1452);
  assert.deepEqual(quote.selected, expected);
  assert.equal(quote.pricingMode,
    maxFusedPlasma === 1000 ? 'FUSION_ONLY' : 'FUSION_AND_POW');
  assertDeclared(quote, compatibility);
  return { originInput, quote, strategy, expected };
}

function currentInputs(planned, raw) {
  const { quote } = planned;
  const compatibility = classify(raw);
  assertDeclared(quote, compatibility);
  assert.deepEqual(compatibility.quote.frontier, raw.beforeFrontier);
  assert.deepEqual(compatibility.quote.rpcObservation, raw.rpcObservation);
  const { nextFusionPrice: fusion, nextWorkPrice: work } = raw.beforeFrontier;
  const instant = oracle(100, raw.rpcObservation.availablePlasma, fusion, work);
  assert.equal(compatibility.quote.selectedFusedPlasma, instant.fusedPlasma);
  assert.equal(compatibility.quote.requiredDifficulty, instant.difficulty);
  // These vectors satisfy the existing price, pool and planned-work guards.
  assert.ok(fusion <= quote.boundPrices.fusionPrice);
  assert.ok(work <= quote.boundPrices.workPrice);
  assert.ok(raw.rpcObservation.availablePlasma >= quote.selected.fusedPlasma);
  assert.ok(quote.selected.difficulty
    >= oracle(100, quote.selected.fusedPlasma, fusion, work).difficulty);
  const input = {
    quote, compatibility, policy: quote.policy,
    subjectDigest: SUBJECT, runtimeContextDigest: RUNTIME,
  };
  const validation = { ...input, selection: { ...quote.selected } };
  return { input, validation, currentContext: context(raw, quote.policy) };
}

async function accepted(planned, raw) {
  const before = snapshot(planned.originInput, planned.quote, raw);
  const { input, validation, currentContext } = currentInputs(planned, raw);
  const inputsBefore = snapshot(input, validation, currentContext);
  const results = [
    select(input),
    validate(validation),
    await planned.strategy.apply(currentContext, planned.quote),
  ];
  for (const result of results) {
    assert.deepEqual(Object.keys(result), ['fusedPlasma', 'difficulty']);
    assert.deepEqual(result, planned.expected);
    assert.deepEqual(result, planned.quote.selected);
    assert.ok(Object.isFrozen(result));
    assert.notEqual(result, planned.quote.selected);
  }
  assert.equal(snapshot(input, validation, currentContext), inputsBefore);
  assert.equal(snapshot(planned.originInput, planned.quote, raw), before);
}

async function refused(planned, raw) {
  const before = snapshot(planned.originInput, planned.quote, raw);
  const { input, validation, currentContext } = currentInputs(planned, raw);
  const inputsBefore = snapshot(input, validation, currentContext);
  assert.throws(() => select(input), policyError);
  assert.throws(() => validate(validation), policyError);
  await assert.rejects(planned.strategy.apply(currentContext, planned.quote), policyError);
  assert.equal(snapshot(input, validation, currentContext), inputsBefore);
  assert.equal(snapshot(planned.originInput, planned.quote, raw), before);
}

test('identical origin frontier accepts sufficient pools for fusion-only and hybrid plans',
  { timeout: 5000 }, async () => {
    for (const maxFused of [1000, 50]) {
      const planned = await plan(maxFused);
      assert.deepEqual(planned.expected, maxFused === 1000
        ? { fusedPlasma: 146, difficulty: 0 }
        : { fusedPlasma: 50, difficulty: 144000 });
      const pools = maxFused === 1000 ? [1000, 146, 600] : [1000, 50, 80];
      for (const available of pools) {
        await accepted(planned, observation({ available }));
      }
    }
  });

test('same height and hash refuse changed fusion or work prices through all entry points',
  { timeout: 5000 }, async () => {
    const changedPrices = [
      [1300, 1200], [1100, 1200], [1200, 1300], [1200, 1100],
      [1300, 1300], [1100, 1100], [1300, 1100], [1100, 1300],
    ];
    for (const maxFused of [1000, 50]) {
      const planned = await plan(maxFused);
      for (const [fusion, work] of changedPrices) {
        await refused(planned, observation({ fusion, work }));
      }
    }
  });

test('age one and two refuse reuse of the origin hash through all entry points',
  { timeout: 5000 }, async () => {
    for (const maxFused of [1000, 50]) {
      const planned = await plan(maxFused);
      for (const age of [1, 2]) {
        await refused(planned, observation({ height: 100 + age }));
      }
    }
  });

test('distinct hashes at age one and two preserve planned fields and no-authority labels',
  { timeout: 5000 }, async () => {
    const advances = [
      [1, NEXT_HASH, 1300, 1200], [1, NEXT_HASH, 1100, 1300],
      [2, LAST_HASH, 1452, 1452], [2, LAST_HASH, 1100, 1100],
    ];
    for (const maxFused of [1000, 50]) {
      const planned = await plan(maxFused);
      for (const [age, hash, fusion, work] of advances) {
        assert.notEqual(hash, ORIGIN_HASH);
        for (const available of [planned.expected.fusedPlasma,
          planned.expected.fusedPlasma + 37]) {
          await accepted(planned, observation({
            height: 100 + age, hash, fusion, work, available,
          }));
        }
      }
    }
  });
