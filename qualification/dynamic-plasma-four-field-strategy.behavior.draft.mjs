import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

// Source-bound local component cases only. This does not run an SDK preparer,
// authenticate observations, sign, publish, or qualify a chain/provider pilot.
assert.equal(process.argv.length, 2);
const pins = [
  ['../src/zenon/bounded-dynamic-plasma-strategy.js', 5780,
    '59b8a19a7d70951e789634a8abd60ee25c4446af4a581e17e94e9c3abcd6dc20'],
  ['../src/zenon/plasma-strategy.js', 974,
    '1c597d4e169ba8a5e6d2b7852c4ffa3a8ec9b854332fe354b9b013c36ebae093'],
  ['../src/zenon/dynamic-plasma-required-fused-policy-adapter.js', 12024,
    'e2b693d4df9065d44ba590f4d0c8dffeb8e55187668eedfa396b4026c9905c3e'],
  ['../src/zenon/dynamic-plasma-required-fused-quote.js', 5416,
    'f5e10ff2dbfff3b6b63d87f0abadd0bb52b5d6b8fe0ead6a55fc5ea14207b730'],
  ['../src/zenon/dynamic-plasma-compatibility.js', 7732,
    'b3989ce15e5f2e9d07b0ed035fe96bcce9f22cac93f5e497fdca5c37bf7618dd'],
  ['../src/zenon/dynamic-plasma-price-policy.js', 14957,
    '41e2e2044597cfa69c5adca292bcd762a189076be1cd939bec10798d7e35c52b'],
  ['../package.json', 1413,
    '8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5'],
];
for (const [path, bytes, sha256] of pins) {
  const raw = readFileSync(new URL(path, import.meta.url));
  assert.equal(raw.length, bytes);
  assert.equal(createHash('sha256').update(raw).digest('hex'), sha256);
  const source = raw.toString('utf8');
  assert.equal(/[^\x00-\x7f]/.test(source), false);
  assert.equal(Buffer.byteLength(source), bytes);
  assert.ok(source.endsWith('\n'));
}
const { BoundedDynamicPlasmaStrategy: Bounded } = await import(pins[0][0]);
const { PlasmaStrategy, assertPlasmaStrategy } = await import(pins[1][0]);
const {
  createDynamicPlasmaRequiredFusedPolicyQuote: createFour,
  selectDynamicPlasmaRequiredFusedPolicyFields: selectFour,
} = await import(pins[2][0]);

const H0 = '0'.repeat(64), H1 = '1'.repeat(64), H2 = '2'.repeat(64);
const SUBJECT = 'sha256:' + 'a'.repeat(64);
const RUNTIME = 'sha256:' + 'b'.repeat(64);
const OTHER = 'sha256:' + 'c'.repeat(64);
const copy = value => JSON.parse(JSON.stringify(value));
const strategyError = error => error instanceof TypeError
  && error.code === 'dynamic_plasma_price_policy_input_rejected'
  && error.message === 'Dynamic Plasma price policy input rejected';
const adapterError = error => error instanceof TypeError
  && error.code === 'dynamic_plasma_required_fused_policy_input_rejected'
  && error.message === error.code;
const compatibilityError = error => error instanceof TypeError
  && error.code === 'dynamic_plasma_compatibility_input_rejected';

// Independent small-integer oracle: TOTAL is fusion-only, not a shortfall.
function observation({
  base = 21000, available = 30000, fusion = 1000, work = 1000,
  height = 100, hash = H0,
} = {}) {
  const total = Math.ceil(base * fusion / 1000);
  const fused = Math.min(available, total);
  const remaining = Math.max(0, base - Math.floor(fused * 1000 / fusion));
  const frontier = {
    height, hash, version: 2, nextFusionPrice: fusion, nextWorkPrice: work,
  };
  return {
    chainProfileMatch: { classification: 'MATCH' },
    beforeFrontier: { ...frontier },
    rpcObservation: {
      availablePlasma: available, basePlasma: base,
      requiredDifficulty: Math.ceil(remaining * work / 1000) * 1500,
      requiredFusedPlasma: total,
    },
    afterFrontier: { ...frontier },
  };
}
function context(raw = observation(), maxFusedPlasma = 30000, maxDifficulty = 0) {
  return {
    phase: 'UNSIGNED', subjectDigest: SUBJECT, runtimeContextDigest: RUNTIME,
    observation: raw,
    policy: {
      policyVersion: 1, maxPriceChangePercent: 10, maxMomentumAdvances: 2,
      maxFusedPlasma, maxDifficulty,
    },
    requiredFusedPolicyVersion: 1,
  };
}
function adapterInput(ctx, quote) {
  const input = {
    requiredFusedPolicyVersion: ctx.requiredFusedPolicyVersion,
    observation: ctx.observation, policy: ctx.policy,
    subjectDigest: ctx.subjectDigest, runtimeContextDigest: ctx.runtimeContextDigest,
  };
  if (arguments.length === 2) input.quote = quote;
  return input;
}
function legacy(ctx) {
  const old = copy(ctx);
  delete old.requiredFusedPolicyVersion;
  delete old.observation.rpcObservation.requiredFusedPlasma;
  return old;
}
function fields(value, expected) {
  assert.deepEqual(Object.keys(value), ['fusedPlasma', 'difficulty']);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.ok(Object.isFrozen(value));
  assert.deepEqual(value, expected);
}
function deeplyFrozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.ok(Object.isFrozen(value));
  for (const child of Object.values(value)) deeplyFrozen(child);
}

test('four-field strategy explicitly dispatches real SPI quote and apply to the shared adapter',
  { timeout: 5000 }, async () => {
    const strategy = new Bounded(), ctx = context();
    assert.ok(strategy instanceof PlasmaStrategy);
    assert.equal(Object.getPrototypeOf(Bounded.prototype), PlasmaStrategy.prototype);
    assert.equal(assertPlasmaStrategy(strategy), strategy);
    const before = JSON.stringify(ctx);
    const quote = await strategy.quote(ctx), independent = createFour(adapterInput(ctx));
    assert.deepEqual(quote, independent);
    assert.notEqual(quote, independent);
    assert.equal(quote.requiredFusedPolicyQuoteVersion, 1);
    assert.equal(quote.scope, 'DECLARED_V2_REQUIRED_FUSED_PRICE_POLICY');
    assert.equal(quote.activation, 'NOT_ESTABLISHED');
    assert.equal(quote.chainAuthentication, 'NOT_ESTABLISHED');
    assert.equal(quote.afterSigningAction, 'NONE');
    assert.equal(quote.authority, 'NONE');
    assert.notEqual(quote.sourceObservation, ctx.observation);
    deeplyFrozen(quote);
    const first = await strategy.apply(ctx, quote);
    const second = await strategy.apply(ctx, copy(quote));
    fields(first, { fusedPlasma: 25410, difficulty: 0 });
    fields(second, selectFour(adapterInput(ctx, quote)));
    assert.notEqual(first, second);
    assert.notEqual(first, quote.pricePolicyQuote.selected);
    assert.equal(JSON.stringify(ctx), before);
  });

test('four-field strategy preserves original headroom and hybrid pairs across declared advances',
  { timeout: 5000 }, async () => {
    const strategy = new Bounded(), ctx = context();
    const quote = await strategy.quote(ctx), before = JSON.stringify(quote);
    assert.equal(quote.sourceObservation.rpcObservation.requiredFusedPlasma, 21000);
    for (const [height, hash, fusion, work, total] of [
      [101, H1, 1050, 1100, 22050], [102, H2, 1210, 1210, 25410],
    ]) {
      const current = { ...ctx, observation: observation({ height, hash, fusion, work }) };
      assert.equal(current.observation.rpcObservation.requiredFusedPlasma, total);
      fields(await strategy.apply(current, quote), { fusedPlasma: 25410, difficulty: 0 });
    }
    const hybrid = context(observation({ base: 100, available: 1000 }), 50, 200000);
    const hybridQuote = await strategy.quote(hybrid);
    assert.equal(hybridQuote.sourceObservation.rpcObservation.requiredFusedPlasma, 100);
    fields(await strategy.apply(hybrid, hybridQuote), { fusedPlasma: 50, difficulty: 108000 });
    const changed = {
      ...hybrid, observation: observation({
        base: 100, available: 50, height: 102, hash: H2, fusion: 1210, work: 1210,
      }),
    };
    assert.equal(changed.observation.rpcObservation.requiredFusedPlasma, 121);
    fields(await strategy.apply(changed, hybridQuote), { fusedPlasma: 50, difficulty: 108000 });
    assert.equal(JSON.stringify(quote), before);
  });

test('four-field strategy refuses inconsistent totals and never downgrades missing fields',
  { timeout: 5000 }, async () => {
    const strategy = new Bounded(), ctx = context(), quote = await strategy.quote(ctx);
    for (const mutate of [
      value => { value.rpcObservation.requiredFusedPlasma++; },
      value => { delete value.rpcObservation.requiredFusedPlasma; },
      value => { value.rpcObservation.requiredFusedPlasma = '21000'; },
      value => { value.rpcObservation.requiredDifficulty = 1; },
    ]) {
      const bad = copy(ctx);
      mutate(bad.observation);
      await assert.rejects(strategy.quote(bad), adapterError);
      await assert.rejects(strategy.apply(bad, quote), adapterError);
    }
    const untaggedFour = copy(ctx);
    delete untaggedFour.requiredFusedPolicyVersion;
    await assert.rejects(strategy.quote(untaggedFour), compatibilityError);
    await assert.rejects(strategy.apply(untaggedFour, quote), compatibilityError);
    const taggedThree = legacy(ctx);
    taggedThree.requiredFusedPolicyVersion = 1;
    await assert.rejects(strategy.quote(taggedThree), adapterError);
    await assert.rejects(strategy.apply(taggedThree, quote), adapterError);
    const tampered = copy(quote);
    tampered.sourceObservation.rpcObservation.requiredFusedPlasma--;
    await assert.rejects(strategy.apply(ctx, tampered), adapterError);
  });

test('four-field strategy isolates legacy receipts and rechecks current declared bindings',
  { timeout: 5000 }, async () => {
    const strategy = new Bounded(), ctx = context(), old = legacy(ctx);
    const quote = await strategy.quote(ctx), oldQuote = await strategy.quote(old);
    assert.equal(oldQuote.quoteVersion, 1);
    assert.equal(oldQuote.scope, 'DECLARED_UNSIGNED_PRICE_BOUND');
    fields(await strategy.apply(old, oldQuote), oldQuote.selected);
    await assert.rejects(strategy.apply(ctx, oldQuote), adapterError);
    await assert.rejects(strategy.apply(old, quote), strategyError);
    for (const field of ['subjectDigest', 'runtimeContextDigest']) {
      await assert.rejects(strategy.apply({ ...ctx, [field]: OTHER }, quote), adapterError);
    }
    await assert.rejects(strategy.apply({
      ...ctx, policy: { ...ctx.policy, maxMomentumAdvances: 3 },
    }, quote), adapterError);
    for (const raw of [
      observation({ height: 103, hash: H2 }),
      observation({ height: 101, hash: H0 }),
      observation({ height: 100, hash: H0, fusion: 1100 }),
      observation({ height: 101, hash: H1, available: 25409 }),
      observation({ height: 101, hash: H1, fusion: 1211 }),
    ]) await assert.rejects(strategy.apply({ ...ctx, observation: raw }, quote), adapterError);
  });

test('four-field strategy requires exact unsigned version and arity without payment authority',
  { timeout: 5000 }, async () => {
    const strategy = new Bounded(), ctx = context(), quote = await strategy.quote(ctx);
    const bytes = Buffer.from([0, 1, 2, 3]), original = Buffer.from(bytes);
    for (const phase of [
      'SIGNED', 'UNKNOWN', 'ACKNOWLEDGED', 'VALIDATED', 'PREPARED', 'EXPIRED',
      '', null, undefined, 1, new String('UNSIGNED'),
    ]) {
      await assert.rejects(strategy.quote({ ...ctx, phase }), strategyError);
      await assert.rejects(strategy.apply({ ...ctx, phase }, quote), strategyError);
    }
    for (const version of [undefined, null, 0, 2, 1n, '1', new Number(1)]) {
      const bad = { ...ctx, requiredFusedPolicyVersion: version };
      await assert.rejects(strategy.quote(bad), strategyError);
      await assert.rejects(strategy.apply(bad, quote), strategyError);
    }
    await assert.rejects(strategy.quote(ctx, undefined), strategyError);
    await assert.rejects(strategy.apply(ctx), strategyError);
    await assert.rejects(strategy.apply(ctx, quote, undefined), strategyError);
    await assert.rejects(strategy.quote({ ...ctx, signedBlock: { bytes } }), strategyError);
    await assert.rejects(strategy.apply({ ...ctx, signedBlock: { bytes } }, quote), strategyError);
    assert.deepEqual(bytes, original);
    assert.equal(quote.afterSigningAction, 'NONE');
    assert.equal(quote.authority, 'NONE');
  });

test('four-field strategy rejects hostile context descriptors without invoking hooks',
  { timeout: 5000 }, async () => {
    const strategy = new Bounded(), ctx = context(), quote = await strategy.quote(ctx);
    let touches = 0;
    const trap = () => { touches++; throw new Error('UNREACHED_INPUT_HOOK'); };
    const traps = {
      get: trap, getPrototypeOf: trap, ownKeys: trap,
      getOwnPropertyDescriptor: trap, has: trap,
    };
    const revoked = Proxy.revocable({}, traps);
    revoked.revoke();
    const badInputs = [
      new Proxy(ctx, traps), revoked.proxy, Object.assign(Object.create(null), ctx),
      { ...ctx, [Symbol('extra')]: 1 }, { ...ctx, toJSON: trap },
    ];
    for (const field of Object.keys(ctx)) {
      const accessor = { ...ctx }, hidden = { ...ctx };
      Object.defineProperty(accessor, field, { enumerable: true, get: trap });
      Object.defineProperty(hidden, field, { enumerable: false });
      badInputs.push(accessor, hidden);
    }
    for (const bad of badInputs) {
      await assert.rejects(strategy.quote(bad), strategyError);
      await assert.rejects(strategy.apply(bad, quote), strategyError);
    }
    const hostileObservation = { ...ctx, observation: new Proxy(ctx.observation, traps) };
    await assert.rejects(strategy.quote(hostileObservation), adapterError);
    await assert.rejects(strategy.apply(hostileObservation, quote), adapterError);
    await assert.rejects(strategy.apply(ctx, new Proxy(quote, traps)), adapterError);
    const caught = await strategy.quote({ ...ctx, requiredFusedPolicyVersion: null })
      .then(() => assert.fail('EXPECTED_REJECTION'), error => error);
    assert.equal(caught.stack, 'TypeError: Dynamic Plasma price policy input rejected');
    assert.ok(Object.isFrozen(caught));
    assert.equal(Object.hasOwn(caught, 'cause'), false);
    assert.equal(touches, 0);
  });
