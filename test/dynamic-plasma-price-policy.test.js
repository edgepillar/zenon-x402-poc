import test from 'node:test';
import {
  equal as q, deepEqual as same, notEqual as ne,
  throws, rejects, ok,
} from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const selector = process.argv[2] ?? 'all';
if (process.argv.length > 3
  || !['all','1','2','3','4','5','6','7','8','9','10'].includes(selector)
) throw new Error('INVALID_SCENARIO_SELECTOR');

const specs = [
  ['../src/zenon/dynamic-plasma-price-policy.js',
    14957, '41e2e2044597cfa69c5adca292bcd762a189076be1cd939bec10798d7e35c52b'],
  ['../src/zenon/bounded-dynamic-plasma-strategy.js',
    10443, '7234013d9c05a51b0680c56e606dd82d7f10f482145f9e30906bbd28a899be71'],
  ['../src/zenon/dynamic-plasma-compatibility.js',
    7732, 'b3989ce15e5f2e9d07b0ed035fe96bcce9f22cac93f5e497fdca5c37bf7618dd'],
  ['../src/zenon/plasma-strategy.js',
    974, '1c597d4e169ba8a5e6d2b7852c4ffa3a8ec9b854332fe354b9b013c36ebae093'],
];
const pins = Object.freeze(specs.map(([path, bytes, sha]) => {
  const url = new URL(path, import.meta.url);
  const raw = readFileSync(url);
  q(raw.length, bytes);
  q(createHash('sha256').update(raw).digest('hex'), sha);
  const text = raw.toString('utf8');
  q(/[^\x00-\x7f]/.test(text), false);
  q(Buffer.byteLength(text, 'utf8'), bytes);
  ok(text.endsWith('\n'));
  return Object.freeze({ url: url.href, bytes, sha });
}));
q(pins[3].bytes, 974);
q(pins[3].sha, '1c597d4e169ba8a5e6d2b7852c4ffa3a8ec9b854332fe354b9b013c36ebae093');

const {
  calculateDynamicPlasmaPriceAmounts: calc,
  createDynamicPlasmaPricePolicyQuote: make,
  selectDynamicPlasmaPricePolicyFields: select,
  validateDynamicPlasmaPricePolicySelection: validate,
} = await import(pins[0].url);
const { BoundedDynamicPlasmaStrategy: Bounded } = await import(pins[1].url);
const {
  classifyDynamicPlasmaCompatibility: classify,
  DYNAMIC_PLASMA_COMPATIBILITY,
} = await import(pins[2].url);
const {
  PlasmaStrategy: Base,
  assertPlasmaStrategy: assertStrategy,
} = await import(pins[3].url);

const H = '0'.repeat(64), H2 = '1'.repeat(64);
const SUBJECT = 'sha256:' + 'a'.repeat(64);
const RUNTIME = 'sha256:' + 'b'.repeat(64);
const OTHER = 'sha256:' + 'c'.repeat(64);
const MAX = Number.MAX_SAFE_INTEGER;
const policyError = error => error instanceof TypeError
  && error.name === 'TypeError'
  && error.message === 'Dynamic Plasma price policy input rejected'
  && error.code === 'dynamic_plasma_price_policy_input_rejected';
const compatError = error => error instanceof TypeError
  && error.name === 'TypeError'
  && error.message === 'Dynamic Plasma compatibility input rejected'
  && error.code === 'dynamic_plasma_compatibility_input_rejected';

// Independent Number oracle, used only with small integer test vectors.
function oracle(base, available, fusion, work) {
  const needed = Math.ceil(base * fusion / 1000);
  const fused = Math.min(available, needed);
  const remaining = Math.max(0, base - Math.floor(fused * 1000 / fusion));
  return {
    fusedPlasma: fused,
    difficulty: Math.ceil(remaining * work / 1000) * 1500,
  };
}
function capOracle(price, p, n) {
  for (let step = 0; step < n; step++) {
    price = Math.max(1000, Math.floor(price * (100 + p) / 100));
  }
  return price;
}
function policy(p, n, fused, difficulty) {
  return {
    policyVersion: 1,
    maxPriceChangePercent: p,
    maxMomentumAdvances: n,
    maxFusedPlasma: fused,
    maxDifficulty: difficulty,
  };
}
function observation(base=100, available=1000, fusion=1000, work=1000, height=100, hash=H) {
  const frontier = {
    height, hash, version: 2, nextFusionPrice: fusion, nextWorkPrice: work,
  };
  return {
    chainProfileMatch: { classification: 'MATCH' },
    beforeFrontier: { ...frontier },
    rpcObservation: {
      availablePlasma: available,
      basePlasma: base,
      requiredDifficulty: oracle(base, available, fusion, work).difficulty,
    },
    afterFrontier: { ...frontier },
  };
}
const compatibility = (...args) => classify(observation(...args));
function createInput(c, p, subject=SUBJECT, runtime=RUNTIME) {
  return { compatibility: c, policy: p, subjectDigest: subject, runtimeContextDigest: runtime };
}
function selectionInput(quote, current=quote.sourceCompatibility) {
  return {
    quote,
    compatibility: current,
    policy: quote.policy,
    subjectDigest: quote.subjectDigest,
    runtimeContextDigest: quote.runtimeContextDigest,
  };
}
function context(raw, p, phase='UNSIGNED') {
  return {
    phase, subjectDigest: SUBJECT, runtimeContextDigest: RUNTIME,
    observation: raw, policy: p,
  };
}
// JSON copying is restricted to owned valid fixtures and returned receipts.
const copy = value => JSON.parse(JSON.stringify(value));
function deepFrozen(value) {
  if (value === null || typeof value !== 'object') return;
  ok(Object.isFrozen(value));
  for (const child of Object.values(value)) deepFrozen(child);
}
function fragment(value, expected) {
  same(Object.keys(value), ['fusedPlasma', 'difficulty']);
  q(Object.getPrototypeOf(value), Object.prototype);
  ok(Object.isFrozen(value));
  same(value, expected);
}

const scenarios = [
  ['shared instant math keeps legacy classifier and RPC boundaries', () => {
    const order = [];
    const amounts = calc(100n, 30n, 1000n, 1000n, 1000n, 1500n,
      value => { order.push(value); });
    same(amounts, {
      requiredFusedPlasma: 100n,
      selectedFusedPlasma: 30n,
      expectedDifficulty: 105000n,
      pricingMode: 'FUSION_AND_POW',
    });
    same(order, [100n, 105000n, 30n]);
    ok(Object.isFrozen(amounts));
    const fusionOrder = [];
    const fused = calc(100n, 1000n, 1200n, 1100n, 1000n, 1500n,
      value => { fusionOrder.push(value); });
    same(fusionOrder, [120n, 0n, 120n]);
    q(fused.pricingMode, 'FUSION_ONLY');
    const firstOnly = [], sentinel = new Error('DECLARED_GUARD_FAILURE');
    throws(() => calc(9007199254740991n, 0n, 2000n, 1000n, 1000n, 1500n,
      value => { firstOnly.push(value); throw sentinel; }), error => error === sentinel);
    same(firstOnly, [18014398509481982n]);

    const raw = observation(100, 30, 1200, 1100);
    q(raw.rpcObservation.requiredDifficulty, 124500);
    const actual = classify(raw);
    same(actual, {
      classification: 'DP_ACTIVE',
      reason: 'NONE',
      scope: 'OBSERVED_FRONTIER_ONLY',
      chainProfileGuard: 'MATCH',
      chainAuthentication: 'NOT_ESTABLISHED',
      afterSigningAction: 'NONE',
      quote: {
        frontier: raw.beforeFrontier,
        rpcObservation: raw.rpcObservation,
        selectedFusedPlasma: 30,
        requiredDifficulty: 124500,
        powRequired: true,
        pricingMode: 'FUSION_AND_POW',
        sdk105BasePlasmaUnderpricingDetected: false,
      },
    });
    deepFrozen(actual);
    const mismatch = copy(raw);
    mismatch.rpcObservation.requiredDifficulty++;
    same(classify(mismatch), {
      classification: 'MISBOUND_OR_INCOHERENT',
      reason: 'RPC_QUOTE_INCOHERENT',
      scope: 'OBSERVED_FRONTIER_ONLY',
      chainProfileGuard: 'MATCH',
      chainAuthentication: 'NOT_ESTABLISHED',
      afterSigningAction: 'NONE',
      quote: null,
    });
    const full = compatibility(100, 200, 1200, 1100);
    q(full.quote.selectedFusedPlasma, 120);
    q(full.quote.requiredDifficulty, 0);
    q(full.quote.sdk105BasePlasmaUnderpricingDetected, true);
    q(full.quote.frontier.nextFusionPrice, 1200);
    same(DYNAMIC_PLASMA_COMPATIBILITY, {
      momentumVersion: 2, minimumResourcePrice: 1000,
      priceScale: 1000, difficultyPerPlasma: 1500,
      scope: 'OBSERVED_FRONTIER_ONLY',
    });
    const bad = observation();
    bad.rpcObservation.basePlasma = -0;
    throws(() => classify(bad), compatError);
  }],
  ['integer frontier bounds use explicit rate and advance count', () => {
    const c = compatibility();
    const two = make(createInput(c, policy(10, 2, 1000, 0)));
    const three = make(createInput(c, policy(10, 3, 1000, 0)));
    q(two.boundPrices.fusionPrice, 1210);
    q(three.boundPrices.fusionPrice, 1331);
    ok(two.boundPrices.fusionPrice < 1250);
    ok(three.boundPrices.fusionPrice > 1250);
    const odd = make(createInput(compatibility(100, 1000, 1001, 1001),
      policy(10, 2, 1000, 0)));
    q(odd.boundPrices.fusionPrice, 1211);
    q(odd.boundPrices.workPrice, 1211);
    ne(odd.boundPrices.fusionPrice, 1212);
    const zero = make(createInput(c, policy(100, 0, 1000, 0)));
    same(zero.boundPrices, { fusionPrice: 1000, workPrice: 1000 });
    same(zero.selected, { fusedPlasma: 100, difficulty: 0 });
    q(make(createInput(c, policy(1, 1, 1000, 0))).boundPrices.fusionPrice, 1010);
    q(make(createInput(c, policy(100, 1, 1000, 0))).boundPrices.fusionPrice, 2000);
    for (const p of [1, 7, 10, 100]) {
      for (let n = 0; n <= 4; n++) {
        for (let start = 1000; start <= 1005; start++) {
          const quote = make(createInput(
            compatibility(7, 10000, start, 1003), policy(p, n, 10000, 0)));
          q(quote.boundPrices.fusionPrice, capOracle(start, p, n));
          q(quote.boundPrices.workPrice, capOracle(1003, p, n));
        }
      }
    }
    const localLimit = make(createInput(c, policy(1, 128, 10000, 0)));
    q(localLimit.boundPrices.fusionPrice, capOracle(1000, 1, 128));
  }],
  ['bounded allocations obey fusion and difficulty budgets', () => {
    const c = compatibility();
    const full = make(createInput(c, policy(10, 2, 1000, 0)));
    same(full.selected, { fusedPlasma: 121, difficulty: 0 });
    q(full.pricingMode, 'FUSION_ONLY');
    const hybrid = make(createInput(c, policy(10, 2, 50, 108000)));
    same(hybrid.selected, { fusedPlasma: 50, difficulty: 108000 });
    q(hybrid.pricingMode, 'FUSION_AND_POW');
    const pow = make(createInput(c, policy(10, 2, 0, 181500)));
    same(pow.selected, { fusedPlasma: 0, difficulty: 181500 });
    q(pow.pricingMode, 'FUSION_AND_POW');
    const limitedPool = make(createInput(
      compatibility(100, 30), policy(10, 2, 500, 138000)));
    same(limitedPool.selected, { fusedPlasma: 30, difficulty: 138000 });
    throws(() => make(createInput(c, policy(10, 2, 50, 107999))), policyError);
    throws(() => make(createInput(c, policy(10, 2, 0, 181499))), policyError);
    throws(() => make(createInput(c, policy(10, 2, 0, 0))), policyError);
    for (const budget of [0, 1, 29, 50, 120, 121, 1000]) {
      const quote = make(createInput(c, policy(10, 2, budget, 1000000)));
      same(quote.selected, oracle(100, Math.min(1000, budget), 1210, 1210));
      ok(quote.selected.fusedPlasma <= budget);
      ok(quote.selected.fusedPlasma <= 1000);
      ok(quote.selected.difficulty <= 1000000);
    }
  }],
  ['receipts are fresh frozen serializable declared bindings', () => {
    const c = compatibility(), p = policy(10, 2, 50, 200000);
    const first = make(createInput(c, p)), second = make(createInput(c, p));
    same(first, second);
    ne(first, second);
    ne(first.policy, second.policy);
    ne(first.sourceCompatibility, c);
    ne(first.sourceCompatibility, second.sourceCompatibility);
    ne(first.sourceCompatibility.quote, second.sourceCompatibility.quote);
    ne(first.sourceCompatibility.quote.frontier, c.quote.frontier);
    ne(first.sourceCompatibility.quote.rpcObservation, c.quote.rpcObservation);
    ne(first.boundPrices, second.boundPrices);
    ne(first.selected, second.selected);
    same(first.sourceCompatibility, c);
    same(first.policy, p);
    q(first.subjectDigest, SUBJECT);
    q(first.runtimeContextDigest, RUNTIME);
    q(first.quoteVersion, 1);
    q(first.scope, 'DECLARED_UNSIGNED_PRICE_BOUND');
    q(first.chainAuthentication, 'NOT_ESTABLISHED');
    q(first.frontierContinuity, 'HEIGHT_WINDOW_ONLY_NO_ANCESTRY_PROOF');
    q(first.afterSigningAction, 'NONE');
    same(Object.keys(first), [
      'quoteVersion', 'scope', 'chainAuthentication', 'frontierContinuity',
      'afterSigningAction', 'policy', 'sourceCompatibility', 'boundPrices',
      'selected', 'pricingMode', 'subjectDigest', 'runtimeContextDigest',
    ]);
    deepFrozen(first);
    const roundtrip = copy(first);
    fragment(select(selectionInput(roundtrip)), first.selected);
    fragment(validate({ ...selectionInput(roundtrip), selection: copy(first.selected) }),
      first.selected);
    const copiedCompatibility = copy(c);
    same(make(createInput(copiedCompatibility, copy(p))), first);
    for (const mutate of [
      value => { value.quoteVersion = 2; },
      value => { value.scope = 'OTHER'; },
      value => { value.chainAuthentication = 'ESTABLISHED'; },
      value => { value.frontierContinuity = 'ANCESTRY_PROVEN'; },
      value => { value.afterSigningAction = 'REPLACE'; },
      value => { value.boundPrices.fusionPrice++; },
      value => { value.boundPrices.workPrice++; },
      value => { value.selected.fusedPlasma++; },
      value => { value.selected.difficulty++; },
      value => { value.pricingMode = 'FUSION_ONLY'; },
      value => { value.policy.maxDifficulty++; },
      value => { value.subjectDigest = OTHER; },
      value => { value.runtimeContextDigest = OTHER; },
      value => { value.sourceCompatibility.quote.requiredDifficulty++; },
      value => { value.sourceCompatibility.quote.frontier.hash = H2; },
      value => { value.sourceCompatibility.chainAuthentication = 'ESTABLISHED'; },
    ]) {
      const bad = copy(first);
      mutate(bad);
      throws(() => select({ ...selectionInput(first), quote: bad }), policyError);
    }
    same(first, second);
  }],
  ['concrete unsigned strategy uses the real policy and base', async () => {
    const strategy = new Bounded();
    ok(strategy instanceof Base);
    q(Object.getPrototypeOf(Bounded.prototype), Base.prototype);
    q(assertStrategy(strategy), strategy);
    const raw = observation(), p = policy(10, 2, 50, 200000);
    const input = context(raw, p), before = JSON.stringify(input);
    const quote = await strategy.quote(input);
    same(quote, make(createInput(classify(raw), p)));
    const first = await strategy.apply(input, quote);
    const second = await strategy.apply(input, quote);
    fragment(first, quote.selected);
    fragment(second, quote.selected);
    ne(first, second);
    ne(first, quote.selected);
    q(JSON.stringify(input), before);
    const fresh = context(observation(100, 1000, 1100, 1100, 101, H2), p);
    fragment(await strategy.apply(fresh, quote),
      select(selectionInput(quote, classify(fresh.observation))));
    const forged = copy(quote);
    forged.selected.difficulty--;
    await rejects(strategy.apply(input, forged), policyError);
    await rejects(strategy.quote(input, undefined), policyError);
    await rejects(strategy.apply(input), policyError);
    const base = new Base();
    await rejects(base.quote(input), error => error instanceof TypeError
      && error.name === 'TypeError'
      && error.message === 'PlasmaStrategy.quote() must be implemented');
    await rejects(base.apply(input, quote), error => error instanceof TypeError
      && error.name === 'TypeError'
      && error.message === 'PlasmaStrategy.apply() must be implemented');
    q(JSON.stringify(input), before);
  }],
  ['current context rejects stale regressing and mismatched plans', () => {
    const quote = make(createInput(compatibility(), policy(10, 2, 50, 200000)));
    const before = JSON.stringify(quote);
    const badCurrent = [
      observation(100, 1000, 1000, 1000, 99),
      observation(100, 1000, 1000, 1000, 103),
      observation(100, 1000, 1000, 1000, 100, H2),
      observation(100, 1000, 1211, 1000, 101, H2),
      observation(100, 1000, 1000, 1211, 101, H2),
      observation(100, 49, 1000, 1000, 101, H2),
      observation(101, 1000, 1000, 1000, 101, H2),
    ];
    for (const raw of badCurrent) {
      const current = classify(raw);
      q(current.classification, 'DP_ACTIVE');
      throws(() => select(selectionInput(quote, current)), policyError);
    }
    const reversed = observation();
    reversed.afterFrontier.height--;
    throws(() => select(selectionInput(quote, classify(reversed))), policyError);
    for (const [field, value] of [
      ['maxPriceChangePercent', 11], ['maxMomentumAdvances', 1],
      ['maxMomentumAdvances', 3], ['maxFusedPlasma', 51], ['maxDifficulty', 200001],
      ['policyVersion', 2],
    ]) {
      const p = { ...quote.policy, [field]: value };
      throws(() => select({ ...selectionInput(quote), policy: p }), policyError);
    }
    throws(() => select({ ...selectionInput(quote), subjectDigest: OTHER }), policyError);
    throws(() => select({ ...selectionInput(quote), runtimeContextDigest: OTHER }), policyError);
    const edge = classify(observation(100, 50, 1210, 1210, 102, H2));
    q(edge.quote.requiredDifficulty, 108000);
    fragment(select(selectionInput(quote, edge)), quote.selected);
    const higher = classify(observation(100, 1000, 1100, 1100, 101, H2));
    q(higher.quote.requiredDifficulty, 0);
    const plannedRequirement = oracle(100, quote.selected.fusedPlasma, 1100, 1100);
    q(plannedRequirement.difficulty, 91500);
    ok(quote.selected.difficulty >= plannedRequirement.difficulty);
    fragment(select(selectionInput(quote, higher)), quote.selected);
    q(quote.frontierContinuity, 'HEIGHT_WINDOW_ONLY_NO_ANCESTRY_PROOF');
    q(JSON.stringify(quote), before);
  }],
  ['validation requires the exact original selected fields', () => {
    const quote = make(createInput(compatibility(), policy(10, 2, 50, 200000)));
    const root = selectionInput(quote), before = JSON.stringify(quote);
    const first = validate({ ...root, selection: copy(quote.selected) });
    const second = validate({ ...root, selection: copy(quote.selected) });
    fragment(first, quote.selected);
    fragment(second, quote.selected);
    ne(first, second);
    ne(first, quote.selected);
    const f = quote.selected.fusedPlasma, d = quote.selected.difficulty;
    for (const selection of [
      { fusedPlasma: f - 1, difficulty: d },
      { fusedPlasma: f + 1, difficulty: d },
      { fusedPlasma: f, difficulty: d - 1 },
      { fusedPlasma: f, difficulty: d + 1 },
      { fusedPlasma: f, difficulty: d, extra: 0 },
      { fusedPlasma: f }, { difficulty: d }, null, [],
      { fusedPlasma: String(f), difficulty: d },
    ]) throws(() => validate({ ...root, selection }), policyError);
    const full = make(createInput(compatibility(), policy(10, 2, 1000, 0)));
    ok(full.selected.fusedPlasma + 1 <= full.policy.maxFusedPlasma);
    throws(() => validate({
      ...selectionInput(full),
      selection: { fusedPlasma: full.selected.fusedPlasma + 1, difficulty: 0 },
    }), policyError);
    q(JSON.stringify(quote), before);
    fragment(select(root), quote.selected);
  }],
  ['hostile records fail without traps getters or coercion', async () => {
    const c = compatibility(), p = policy(10, 2, 50, 200000);
    const input = createInput(c, p), quote = make(input), root = selectionInput(quote);
    let touches = 0;
    const trap = () => { touches++; throw new Error('UNREACHED_INPUT_TRAP'); };
    const traps = {
      get: trap, getPrototypeOf: trap, ownKeys: trap,
      getOwnPropertyDescriptor: trap, has: trap,
    };
    function accessor(value, field) {
      const bad = { ...value };
      Object.defineProperty(bad, field, { enumerable: true, get: trap });
      return bad;
    }
    const revocable = Proxy.revocable({}, traps);
    revocable.revoke();
    for (const value of [
      null, [], () => {}, new Number(1), new String('fixed'),
      Object.create(null), new Proxy(input, traps), revocable.proxy,
    ]) throws(() => make(value), policyError);
    throws(() => make(accessor(input, 'policy')), policyError);
    throws(() => make({ ...input, [Symbol('extra')]: 1 }), policyError);
    throws(() => make({ ...input, toJSON: trap }), policyError);
    throws(() => make({ ...input, policy: new Proxy(p, traps) }), policyError);
    throws(() => make({ ...input, policy: accessor(p, 'maxFusedPlasma') }), policyError);
    throws(() => make({ ...input, compatibility: new Proxy(c, traps) }), policyError);
    throws(() => make({ ...input, compatibility: accessor(c, 'quote') }), policyError);
    for (const field of ['classification', 'chainAuthentication', 'afterSigningAction']) {
      throws(() => make({ ...input, compatibility: accessor(c, field) }), policyError);
    }
    for (const field of ['powRequired', 'pricingMode', 'requiredDifficulty']) {
      const bad = { ...c, quote: accessor(c.quote, field) };
      throws(() => make({ ...input, compatibility: bad }), policyError);
    }
    const frontier = { ...c, quote: {
      ...c.quote, frontier: accessor(c.quote.frontier, 'height'),
    } };
    const rpc = { ...c, quote: {
      ...c.quote, rpcObservation: accessor(c.quote.rpcObservation, 'basePlasma'),
    } };
    throws(() => make({ ...input, compatibility: frontier }), policyError);
    throws(() => make({ ...input, compatibility: rpc }), policyError);
    const coercible = { [Symbol.toPrimitive]: trap, valueOf: trap, toString: trap };
    for (const value of [coercible, new Number(50), Object(1n), Symbol('fixed')]) {
      throws(() => make({ ...input, policy: { ...p, maxFusedPlasma: value } }), policyError);
    }
    throws(() => make({ ...input, subjectDigest: new String(SUBJECT) }), policyError);
    throws(() => select({ ...root, quote: new Proxy(quote, traps) }), policyError);
    throws(() => select({ ...root, compatibility: new Proxy(c, traps) }), policyError);
    throws(() => select({ ...root, quote: accessor(quote, 'boundPrices') }), policyError);
    throws(() => select({ ...root, quote: {
      ...quote, selected: new Proxy(quote.selected, traps),
    } }), policyError);
    throws(() => validate({
      ...root, selection: accessor(quote.selected, 'difficulty'),
    }), policyError);
    throws(() => validate({
      ...root, selection: { ...quote.selected, [Symbol('extra')]: 1 },
    }), policyError);

    const strategy = new Bounded(), ctx = context(observation(), p);
    await rejects(strategy.quote(new Proxy(ctx, traps)), policyError);
    await rejects(strategy.quote(accessor(ctx, 'observation')), policyError);
    await rejects(strategy.quote({
      ...ctx, observation: new Proxy(ctx.observation, traps),
    }), compatError);
    await rejects(strategy.apply({
      ...ctx, observation: new Proxy(ctx.observation, traps),
    }, quote), compatError);
    q(touches, 0);
  }],
  ['public numbers and bounded arithmetic reject unsafe values', () => {
    const c = compatibility(), good = policy(10, 2, 50, 200000);
    const invalid = [-0, -1, NaN, Infinity, -Infinity, 1.5, MAX + 1, 1n, new Number(1)];
    for (const field of [
      'maxPriceChangePercent', 'maxMomentumAdvances', 'maxFusedPlasma', 'maxDifficulty',
    ]) {
      for (const value of invalid) {
        throws(() => make(createInput(c, { ...good, [field]: value })), policyError);
      }
    }
    for (const [field, value] of [
      ['maxPriceChangePercent', 0], ['maxPriceChangePercent', 101],
      ['maxMomentumAdvances', 129], ['maxMomentumAdvances', MAX],
      ['policyVersion', 1n], ['policyVersion', 2],
    ]) throws(() => make(createInput(c, { ...good, [field]: value })), policyError);
    for (const field of Object.keys(good)) {
      const missing = { ...good };
      delete missing[field];
      throws(() => make(createInput(c, missing)), policyError);
    }
    throws(() => make(createInput(c, policy(100, 128, MAX, MAX))), policyError);
    const allowed = make(createInput(c, policy(1, 128, 10000, 0)));
    q(allowed.boundPrices.fusionPrice, capOracle(1000, 1, 128));

    for (const value of [-0, NaN, Infinity, 1n, new Number(100)]) {
      const bad = copy(c);
      bad.quote.rpcObservation.basePlasma = value;
      throws(() => make(createInput(bad, good)), policyError);
    }
    for (const value of [-0, NaN, Infinity, 2n, new Number(2)]) {
      const bad = copy(c);
      bad.quote.frontier.version = value;
      throws(() => make(createInput(bad, good)), policyError);
    }
    const overflowing = copy(c);
    overflowing.quote.frontier.nextFusionPrice = MAX;
    overflowing.quote.rpcObservation.basePlasma = MAX;
    throws(() => make(createInput(overflowing, good)), policyError);
    const rawOverflow = observation();
    rawOverflow.beforeFrontier.nextFusionPrice = MAX;
    rawOverflow.afterFrontier.nextFusionPrice = MAX;
    rawOverflow.rpcObservation.basePlasma = MAX;
    throws(() => classify(rawOverflow), compatError);

    const largest = observation();
    largest.rpcObservation.basePlasma = MAX;
    largest.rpcObservation.availablePlasma = MAX;
    largest.rpcObservation.requiredDifficulty = 0;
    const largestCompatibility = classify(largest);
    q(largestCompatibility.classification, 'DP_ACTIVE');
    const exact = make(createInput(largestCompatibility, policy(1, 0, MAX, 0)));
    same(exact.selected, { fusedPlasma: MAX, difficulty: 0 });
    fragment(select(selectionInput(copy(exact))), exact.selected);
    throws(() => make(createInput(largestCompatibility, policy(1, 1, MAX, MAX))),
      policyError);
    const pow = make(createInput(c, policy(10, 2, 0, 181500)));
    throws(() => validate({
      ...selectionInput(pow), selection: { fusedPlasma: -0, difficulty: 181500 },
    }), policyError);
    for (const value of [SUBJECT + '\n', SUBJECT.toUpperCase(), 'sha256:' + 'a'.repeat(65), 1n]) {
      throws(() => make(createInput(c, good, value)), policyError);
    }
    throws(() => make(createInput(c, good), undefined), policyError);
    throws(() => select(selectionInput(exact), undefined), policyError);
    throws(() => validate({
      ...selectionInput(exact), selection: exact.selected,
    }, undefined), policyError);
  }],
  ['unavailable data and non-unsigned phases grant no authority', async () => {
    const p = policy(10, 2, 50, 200000);
    const good = compatibility(), quote = make(createInput(good, p));
    const unavailable = {
      chainProfileMatch: { classification: 'UNAVAILABLE' },
      beforeFrontier: null, rpcObservation: null, afterFrontier: null,
    };
    const mismatch = observation();
    mismatch.chainProfileMatch.classification = 'MISMATCH';
    const pre = observation();
    for (const f of [pre.beforeFrontier, pre.afterFrontier]) {
      f.version = 1;
      f.nextFusionPrice = 0;
      f.nextWorkPrice = 0;
    }
    const unsupported = observation();
    unsupported.beforeFrontier.version = 3;
    unsupported.afterFrontier.version = 3;
    const cases = [
      [unavailable, 'UNAVAILABLE'], [mismatch, 'MISBOUND_OR_INCOHERENT'],
      [pre, 'PRE_DP'], [unsupported, 'MISBOUND_OR_INCOHERENT'],
    ];
    const strategy = new Bounded();
    for (const [raw, kind] of cases) {
      const before = JSON.stringify(raw), c = classify(raw);
      q(c.classification, kind);
      throws(() => make(createInput(c, p)), policyError);
      throws(() => select(selectionInput(quote, c)), policyError);
      await rejects(strategy.quote(context(raw, p)), policyError);
      await rejects(strategy.apply(context(raw, p), quote), policyError);
      q(JSON.stringify(raw), before);
    }
    const spoofed = copy(good);
    spoofed.quote.frontier.version = 3;
    throws(() => make(createInput(spoofed, p)), policyError);
    const future = copy(quote);
    future.quoteVersion = 2;
    throws(() => select({ ...selectionInput(quote), quote: future }), policyError);

    const bytes = Buffer.from([0, 1, 2, 3]), saved = Buffer.from(bytes);
    const raw = observation(), rawBefore = JSON.stringify(raw);
    for (const phase of [
      'SIGNED', 'UNKNOWN', 'ACKNOWLEDGED', 'VALIDATED', 'EXPIRED',
      'PREPARED', '', null, undefined, 1, new String('UNSIGNED'),
    ]) {
      const ctx = context(raw, p, phase);
      // Explicitly preserve undefined instead of the test helper's default.
      ctx.phase = phase;
      await rejects(strategy.quote(ctx), policyError);
      await rejects(strategy.apply(ctx, quote), policyError);
      q(ctx.phase, phase);
      q(JSON.stringify(raw), rawBefore);
      same(bytes, saved);
    }
    const unsigned = context(raw, p);
    await rejects(strategy.quote({ ...unsigned, signedBlock: { bytes } }), policyError);
    await rejects(strategy.apply({ ...unsigned, signedBlock: { bytes } }, quote), policyError);
    await rejects(strategy.apply(unsigned, quote, bytes), policyError);
    same(bytes, saved);
    q(JSON.stringify(raw), rawBefore);
    q(quote.chainAuthentication, 'NOT_ESTABLISHED');
    q(quote.afterSigningAction, 'NONE');
    q(quote.scope, 'DECLARED_UNSIGNED_PRICE_BOUND');
  }],
];

q(scenarios.length, 10);
for (let index = 0; index < scenarios.length; index++) {
  if (selector === 'all' || selector === String(index + 1)) {
    const [name, run] = scenarios[index];
    test(name, { timeout: 5000 }, run);
  }
}
