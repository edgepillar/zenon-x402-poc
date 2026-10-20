import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

// Explicit local synthetic component selection only. No HTTP owner, SDK,
// wallet, SQL, work producer, signature generation or payment is exercised.
assert.equal(process.versions.node, '24.19.0');
assert.equal(process.argv.length, 2);
const pins = [
  ['../src/zenon/dynamic-plasma-required-fused-policy-adapter.js', 12024,
    'e2b693d4df9065d44ba590f4d0c8dffeb8e55187668eedfa396b4026c9905c3e'],
  ['../src/zenon/bounded-dynamic-plasma-strategy.js', 12046,
    '596359b3d71ad072f4692d0f57b4ddb726469379faf78ac0f558c93122dead99'],
  ['../src/zenon/dynamic-plasma-observation-collector.js', 33780,
    'dd298d4cb2ec1c5e2afb7d0fcc51f94f37c3b3793be3e70dc1ce113f2f0f413e'],
  ['../src/zenon/dynamic-plasma-observation-normalizer.js', 28398,
    '2c3f7d42ded21a5513ff26c23a00a35a53aa334f053d10930f1571a020286897'],
  ['../src/zenon/dynamic-plasma-json-rpc-read-transport.js', 9063,
    'f89d9b40b2b0d3ec009365be8a7682bc5f0c4821a258ab5993c5782951f2bc6c'],
  ['../src/zenon/bounded-json-rpc-read-core.js', 20906,
    '5572d24175455c6b3a9924688d601d31585454ce62dac9eb27151d2a65c83fcd'],
  ['../src/zenon/dynamic-plasma-price-policy.js', 14957,
    '41e2e2044597cfa69c5adca292bcd762a189076be1cd939bec10798d7e35c52b'],
  ['../src/zenon/dynamic-plasma-compatibility.js', 7732,
    'b3989ce15e5f2e9d07b0ed035fe96bcce9f22cac93f5e497fdca5c37bf7618dd'],
  ['../src/zenon/dynamic-plasma-required-fused-quote.js', 5416,
    'f5e10ff2dbfff3b6b63d87f0abadd0bb52b5d6b8fe0ead6a55fc5ea14207b730'],
  ['../src/zenon/plasma-strategy.js', 974,
    '1c597d4e169ba8a5e6d2b7852c4ffa3a8ec9b854332fe354b9b013c36ebae093'],
  ['../package.json', 1413,
    '8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5'],
  ['../test/dynamic-plasma-price-policy.test.js', 28827,
    'd871b2effec34dbdba2095c7f40d2c0b3fdaaaa1fc1ceebe80f3f58ad5009863'],
  ['./dynamic-plasma-price-policy-frontier-binding.behavior.draft.mjs', 8745,
    'd7f672ee4464bd002e893e231dec5acc85785db2407f7df25fa601d74f972409'],
  ['./dynamic-plasma-required-fused-policy-adapter.behavior.draft.mjs', 17942,
    '8f641945d9f699579a2440a7c6f90e16c4d1712e0e042e9135f0468a8db514f1'],
  ['./dynamic-plasma-four-field-strategy.behavior.draft.mjs', 13760,
    '56b1d9629cb616da4493da5037fd9b0b2a8c0b4f28163cbb9a8e696f88965513'],
];
for (const [path, bytes, sha256] of pins) {
  const raw = readFileSync(new URL(path, import.meta.url));
  assert.equal(raw.length, bytes);
  assert.equal(createHash('sha256').update(raw).digest('hex'), sha256);
  const source = raw.toString('utf8');
  assert.equal(/[^\x00-\x7f]/.test(source) || source.includes('\0'), false);
  assert.equal(Buffer.byteLength(source), bytes);
  assert.ok(source.endsWith('\n'));
}
// Thirty registrations exercise the CHANGED adapter/strategy/import graph.
// Three older guards were refreshed; all older scenario bodies are unchanged.
for (const index of [11, 12, 13, 14]) await import(pins[index][0]);
const {
  createDynamicPlasmaRequiredFusedPolicyQuote: create,
  selectDynamicPlasmaRequiredFusedPolicyFields: select,
  validateDynamicPlasmaRequiredFusedPolicySelection: validate,
} = await import(pins[0][0]);
const { BoundedDynamicPlasmaStrategy: Bounded } = await import(pins[1][0]);
const { createDynamicPlasmaObservationCollector: createCollector } = await import(pins[2][0]);
const {
  normalizeDynamicPlasmaObservation: normalize,
  snapshotDynamicPlasmaQuoteRequestContext: snapshotContext,
} = await import(pins[3][0]);

const H = '33'.repeat(32), H1 = '44'.repeat(32), H2 = '55'.repeat(32);
const GENESIS = '11'.repeat(32), TWO = '22'.repeat(32);
const DYNAMIC = '02'.repeat(32), LIBP2P = '01'.repeat(32);
const SUBJECT = 'sha256:' + 'a'.repeat(64), RUNTIME = 'sha256:' + 'b'.repeat(64);
const copy = value => JSON.parse(JSON.stringify(value)); // Owned valid fixture DATA only.
function fixtureAddress(byte) {
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l', words = [];
  let accumulator = 0, bits = 0, checksum = 1;
  for (const value of [0, ...Array(19).fill(byte)]) {
    accumulator = (accumulator << 8) | value; bits += 8;
    while (bits >= 5) { bits -= 5; words.push((accumulator >>> bits) & 31); }
  }
  assert.equal(bits, 0);
  for (const word of [3, 0, 26, ...words, 0, 0, 0, 0, 0, 0]) {
    const top = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ word;
    for (const [index, generator] of [
      0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3,
    ].entries()) if ((top >>> index) & 1) checksum ^= generator;
  }
  checksum = (checksum ^ 1) >>> 0;
  return 'z1' + words.map(word => alphabet[word]).join('')
    + Array.from({ length: 6 }, (_, index) => alphabet[(checksum >>> (5 * (5 - index))) & 31]).join('');
}
const A = fixtureAddress(17), B = fixtureAddress(34), C = fixtureAddress(51);
const DATA = Buffer.alloc(32, 7).toString('base64');
const OTHER_DATA = Buffer.alloc(32, 9).toString('base64');
function expectation() {
  return {
    requestContextVersion: 1,
    expectedChainProfile: { version: 1, chainIdentifier: '73404', genesisMomentumHash: GENESIS },
    compiledSporkIds: { dynamicPlasmaId: DYNAMIC, libp2pId: LIBP2P },
    quoteRequest: { address: A, blockType: 2, toAddress: B, data: DATA },
  };
}
// Independent small-integer arithmetic for these exact synthetic vectors.
function rpc(base, available, fusion, work) {
  const total = Math.ceil(base * fusion / 1000), fused = Math.min(available, total);
  const remaining = Math.max(0, base - Math.floor(fused * 1000 / fusion));
  return { availablePlasma: available, basePlasma: base,
    requiredDifficulty: Math.ceil(remaining * work / 1000) * 1500, requiredFusedPlasma: total };
}
function observation({
  base = 21000, available = 30000, fusion = 1000, work = 1000,
  height = 100, hash = H, p = 10, expected = expectation(),
} = {}) {
  const frontier = {
    chainIdentifier: '73404', height, hash, version: 2,
    nextFusionPrice: fusion, nextWorkPrice: work,
  };
  const endpoint = {
    beforeFrontier: { ...frontier },
    profileEvidence: { heightTwo: {
      chainIdentifier: '73404', height: 2, hash: TWO, previousHash: GENESIS, version: 1,
    } },
    sporks: { count: 2, list: [
      { id: LIBP2P, name: 'libp2p', activated: false, enforcementHeight: 0 },
      { id: DYNAMIC, name: 'dynamic-plasma', activated: true, enforcementHeight: 10 },
    ] },
    plasmaVariables: { MaxBasePlasmaInMomentum: 4200000, FusedPlasmaTarget: 1050000,
      PowPlasmaTarget: 1050000, MaxPriceChangePercent: p, PriceChangeDenominator: 20 },
    rpcObservation: rpc(base, available, fusion, work),
    afterFrontier: { ...frontier },
  };
  return {
    expectedChainProfile: copy(expected.expectedChainProfile),
    compiledSporkIds: copy(expected.compiledSporkIds),
    endpointObservations: [copy(endpoint), copy(endpoint)],
    requiredFusedObservationVersion: 1, quoteRequestContextVersion: 1,
    quoteRequestContext: snapshotContext(expected),
  };
}
function context(options = {}) {
  const expected = options.expected ?? expectation();
  return {
    phase: 'UNSIGNED', subjectDigest: SUBJECT, runtimeContextDigest: RUNTIME,
    observation: observation({ ...options, expected }),
    policy: { policyVersion: 1, maxPriceChangePercent: options.p ?? 10,
      maxMomentumAdvances: 2, maxFusedPlasma: options.maxFused ?? 30000,
      maxDifficulty: options.maxDifficulty ?? 0 },
    requiredFusedPolicyVersion: 1, quoteRequestContextVersion: 1,
    expectedQuoteRequestContext: copy(expected),
  };
}
function adapterInput(ctx) {
  const value = { ...ctx }; delete value.phase; return value;
}
function fields(value, expected) {
  assert.deepEqual(Object.keys(value), ['fusedPlasma', 'difficulty']);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.ok(Object.isFrozen(value)); assert.deepEqual(value, expected);
}
function frozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.ok(Object.isFrozen(value));
  for (const child of Object.values(value)) frozen(child);
}
function rejection(error) {
  assert.ok(error instanceof TypeError && Object.isFrozen(error));
  assert.ok(['dynamic_plasma_required_fused_policy_input_rejected',
    'dynamic_plasma_price_policy_input_rejected'].includes(error.code));
  assert.equal(Object.hasOwn(error, 'cause'), false);
  assert.equal(error.stack, error.code === 'dynamic_plasma_price_policy_input_rejected'
    ? 'TypeError: Dynamic Plasma price policy input rejected' : 'TypeError: ' + error.code);
  return true;
}
async function refusesCurrent(ctx, quote) {
  const input = adapterInput(ctx), strategy = new Bounded();
  assert.throws(() => create(input), rejection);
  assert.throws(() => select({ ...input, quote }), rejection);
  assert.throws(() => validate({ ...input, quote, selection: quote.pricePolicyQuote.selected }), rejection);
  await assert.rejects(strategy.quote(ctx), rejection);
  await assert.rejects(strategy.apply(ctx, quote), rejection);
}
async function refusesReceipt(ctx, quote) {
  const input = adapterInput(ctx);
  assert.throws(() => select({ ...input, quote }), rejection);
  assert.throws(() => validate({ ...input, quote, selection: { fusedPlasma: 25410, difficulty: 0 } }), rejection);
  await assert.rejects(new Bounded().apply(ctx, quote), rejection);
}
async function accepts(ctx, quote, expected) {
  const input = adapterInput(ctx);
  fields(select({ ...input, quote }), expected);
  fields(validate({ ...input, quote, selection: copy(expected) }), expected);
  fields(await new Bounded().apply(ctx, quote), expected);
}
function rewriteRawRequest(raw, request) {
  raw.quoteRequestContext = snapshotContext({
    requestContextVersion: 1, expectedChainProfile: raw.expectedChainProfile,
    compiledSporkIds: raw.compiledSporkIds, quoteRequest: request,
  });
}
async function collected() {
  const ctx = context(), before = JSON.stringify(ctx.expectedQuoteRequestContext);
  const expected = ctx.expectedQuoteRequestContext;
  const momentum = (height = 100, hash = H, version = 2) => ({
    version, chainIdentifier: 73404, hash, previousHash: GENESIS, height, timestamp: 1234,
    data: '', content: [], changesHash: '66'.repeat(32),
    publicKey: Buffer.alloc(32, 6).toString('base64'),
    signature: Buffer.alloc(64, 8).toString('base64'), // Declared bytes, not a signature operation.
    nextFusionPrice: version === 2 ? 1000 : 0, nextWorkPrice: version === 2 ? 1000 : 0, producer: A,
  });
  const endpoint = ctx.observation.endpointObservations[0];
  const replies = [momentum(), { count: 200, list: [momentum(2, TWO, 1)] },
    { count: 2, list: endpoint.sporks.list.map(value => ({ ...value, description: 'Synthetic.' })) },
    endpoint.plasmaVariables, endpoint.rpcObservation, momentum()];
  const methods = ['ledger.getFrontierMomentum', 'ledger.getMomentumsByHeight',
    'embedded.spork.getAll', 'embedded.plasma.getVariables',
    'embedded.plasma.getRequiredPoWForAccountBlock', 'ledger.getFrontierMomentum'];
  const positions = [0, 0], calls = [];
  const transports = [0, 1].map(index => Object.freeze({
    callRead: Object.freeze(async request => {
      const position = positions[index]++;
      assert.equal(request.method, methods[position]);
      assert.ok(Object.isFrozen(request) && Object.isFrozen(request.params));
      calls.push(request);
      return JSON.stringify(replies[position]);
    }),
  }));
  ctx.observation = await createCollector({ transports }).collect({
    phase: 'UNSIGNED', requiredFusedObservationVersion: 1, quoteRequestContextVersion: 1,
    expectedChainProfile: expected.expectedChainProfile, compiledSporkIds: expected.compiledSporkIds,
    quoteRequest: expected.quoteRequest,
  });
  assert.deepEqual(positions, [6, 6]); assert.equal(calls.length, 12);
  assert.equal(JSON.stringify(ctx.expectedQuoteRequestContext), before);
  return ctx;
}

test('request-bound consumer connects the real collector normalizer SPI and shared validator',
  { timeout: 5000 }, async () => {
    const ctx = await collected(), before = JSON.stringify(ctx), strategy = new Bounded();
    const normalized = normalize(ctx.observation);
    assert.equal(normalized.requestContextBinding, 'SELF_CONSISTENT_DECLARED_REQUEST_ONLY');
    const quote = await strategy.quote(ctx);
    assert.deepEqual(quote, create(adapterInput(ctx)));
    assert.equal(quote.requiredFusedPolicyQuoteVersion, 2);
    assert.equal(quote.scope, 'DECLARED_V2_REQUEST_BOUND_REQUIRED_FUSED_PRICE_POLICY');
    assert.equal(quote.requestContextBinding, 'MATCHES_DECLARED_EXPECTED_REQUEST_CONTEXT');
    assert.deepEqual(quote.sourceObservation.quoteRequestContext, snapshotContext(ctx.expectedQuoteRequestContext));
    assert.equal(quote.sourceObservation.rpcObservation.requiredFusedPlasma, 21000);
    assert.deepEqual(quote.pricePolicyQuote.boundPrices, { fusionPrice: 1210, workPrice: 1210 });
    await accepts(ctx, quote, { fusedPlasma: 25410, difficulty: 0 });
    for (const field of ['chainAuthentication', 'activation']) assert.equal(quote[field], 'NOT_ESTABLISHED');
    assert.equal(quote.authority, 'NONE'); assert.equal(quote.afterSigningAction, 'NONE');
    frozen(quote); assert.equal(JSON.stringify(ctx), before);
  });

test('request-bound consumer rejects coherent foreign request snapshots through all entry points',
  { timeout: 5000 }, async () => {
    const ctx = context(), quote = create(adapterInput(ctx));
    for (const [field, value] of [['address', C], ['toAddress', C], ['data', OTHER_DATA]]) {
      const bad = copy(ctx), request = copy(bad.observation.quoteRequestContext.quoteRequest);
      request[field] = value; rewriteRawRequest(bad.observation, request);
      assert.equal(normalize(bad.observation).requestContextBinding, 'SELF_CONSISTENT_DECLARED_REQUEST_ONLY');
      assert.equal(normalize(bad.observation).classification, 'DP_ACTIVE');
      await refusesCurrent(bad, quote);
    }
  });

test('request-bound consumer independently binds declared profile genesis and compiled spork identities',
  { timeout: 5000 }, async () => {
    const ctx = context(), quote = create(adapterInput(ctx));
    for (const mutate of [
      e => { e.expectedChainProfile.chainIdentifier = '73405'; },
      e => { e.expectedChainProfile.genesisMomentumHash = '77'.repeat(32); },
      e => { e.compiledSporkIds.dynamicPlasmaId = '88'.repeat(32); },
      e => { e.compiledSporkIds.libp2pId = '99'.repeat(32); },
      e => { e.quoteRequest.toAddress = C; },
      e => { e.quoteRequest.data = OTHER_DATA; },
    ]) {
      const bad = copy(ctx); mutate(bad.expectedQuoteRequestContext);
      await refusesCurrent(bad, quote);
    }
  });

test('request-bound consumer prevents cross-request receipt reuse without treating coherent DATA as authority',
  { timeout: 5000 }, async () => {
    const first = context(), otherExpected = expectation();
    otherExpected.quoteRequest.toAddress = C; otherExpected.quoteRequest.data = OTHER_DATA;
    const second = context({ expected: otherExpected });
    const q1 = create(adapterInput(first)), q2 = create(adapterInput(second));
    assert.equal(q1.pricePolicyQuote.subjectDigest, q2.pricePolicyQuote.subjectDigest);
    assert.equal(q1.pricePolicyQuote.runtimeContextDigest, q2.pricePolicyQuote.runtimeContextDigest);
    assert.notEqual(q1.sourceObservation.quoteRequestContext.digest, q2.sourceObservation.quoteRequestContext.digest);
    await refusesReceipt(first, q2); await refusesReceipt(second, q1);
    await accepts(second, copy(q2), { fusedPlasma: 25410, difficulty: 0 });
    assert.equal(q2.authority, 'NONE'); assert.equal(q2.chainAuthentication, 'NOT_ESTABLISHED');
  });

test('request-bound consumer matches policy p to declared variables and refuses changed pricing context',
  { timeout: 5000 }, async () => {
    const ctx = context(), quote = create(adapterInput(ctx));
    for (const p of [1, 9, 11, 100]) {
      const bad = copy(ctx); bad.policy.maxPriceChangePercent = p;
      await refusesCurrent(bad, quote);
    }
    const changed = copy(ctx);
    for (const endpoint of changed.observation.endpointObservations) endpoint.plasmaVariables.MaxPriceChangePercent = 11;
    await refusesCurrent(changed, quote);
    changed.policy.maxPriceChangePercent = 11;
    const coherent = create(adapterInput(changed));
    assert.equal(coherent.pricePolicyQuote.policy.maxPriceChangePercent, 11);
    await refusesReceipt(changed, quote);
    assert.equal(coherent.chainAuthentication, 'NOT_ESTABLISHED');
  });

test('request-bound consumer preserves original budgeted fields through the declared advance window',
  { timeout: 5000 }, async () => {
    const ctx = context(), quote = create(adapterInput(ctx)), saved = JSON.stringify(quote);
    for (const [height, hash, fusion, work, total] of [
      [101, H1, 1050, 1100, 22050], [102, H2, 1210, 1210, 25410],
    ]) {
      const now = context({ height, hash, fusion, work });
      assert.equal(now.observation.endpointObservations[0].rpcObservation.requiredFusedPlasma, total);
      await accepts(now, quote, { fusedPlasma: 25410, difficulty: 0 });
    }
    for (const options of [
      { height: 103, hash: H2 }, { height: 101, hash: H },
      { height: 100, hash: H1 }, { height: 101, hash: H1, fusion: 1211 },
      { height: 101, hash: H1, available: 25409 }, { base: 21001 },
    ]) await refusesReceipt(context(options), quote);
    assert.equal(JSON.stringify(quote), saved);
  });

test('request-bound consumer keeps hybrid fields distinct from the fusion-only total target',
  { timeout: 5000 }, async () => {
    const ctx = context({ base: 100, available: 1000, maxFused: 50, maxDifficulty: 200000 });
    const quote = create(adapterInput(ctx)), pair = { fusedPlasma: 50, difficulty: 108000 };
    assert.equal(quote.sourceObservation.rpcObservation.requiredFusedPlasma, 100);
    await accepts(ctx, quote, pair);
    const now = context({ base: 100, available: 50, maxFused: 50, maxDifficulty: 200000,
      height: 102, hash: H2, fusion: 1210, work: 1210 });
    assert.equal(now.observation.endpointObservations[0].rpcObservation.requiredFusedPlasma, 121);
    await accepts(now, quote, pair);
    assert.throws(() => validate({ ...adapterInput(now), quote,
      selection: { fusedPlasma: 121, difficulty: 108000 } }), rejection);
  });

test('request-bound consumer rejects altered context receipt and nested policy DATA',
  { timeout: 5000 }, async () => {
    const ctx = context(), quote = create(adapterInput(ctx));
    for (const mutate of [
      q => { q.requiredFusedPolicyQuoteVersion = 1; },
      q => { q.requestContextBinding = 'AUTHENTICATED'; },
      q => { q.sourceObservation.quoteRequestContext.digest = 'sha256:' + 'f'.repeat(64); },
      q => { q.sourceObservation.quoteRequestContext.quoteRequest.data = OTHER_DATA; },
      q => { q.sourceObservation.quoteRequestContext.requestContextVersion = 2; },
      q => { delete q.sourceObservation.quoteRequestContext; },
      q => { q.sourceObservation.quoteRequestContext.extra = 1; },
      q => { q.sourceObservation.rpcObservation.requiredFusedPlasma++; },
      q => { q.pricePolicyQuote.selected.fusedPlasma++; },
      q => { q.authority = 'SIGN'; },
      q => { q.afterSigningAction = 'REPLACE'; },
    ]) {
      const bad = copy(quote); mutate(bad); await refusesReceipt(ctx, bad);
    }
  });

test('request-bound consumer detaches snapshots and preserves JSON receipts without refreshing authority',
  { timeout: 5000 }, async () => {
    const ctx = context(), clean = copy(ctx), quote = create(adapterInput(ctx));
    const saved = JSON.stringify(quote), restored = copy(quote);
    assert.notEqual(quote.sourceObservation.quoteRequestContext, ctx.observation.quoteRequestContext);
    assert.notEqual(quote.sourceObservation.quoteRequestContext.quoteRequest, ctx.expectedQuoteRequestContext.quoteRequest);
    frozen(quote); await accepts(ctx, restored, { fusedPlasma: 25410, difficulty: 0 });
    ctx.expectedQuoteRequestContext.quoteRequest.data = OTHER_DATA;
    await refusesCurrent(ctx, quote);
    assert.equal(JSON.stringify(quote), saved);
    await accepts(clean, restored, { fusedPlasma: 25410, difficulty: 0 });
    const changedRaw = copy(clean);
    changedRaw.observation.quoteRequestContext.quoteRequest.data = OTHER_DATA;
    await refusesCurrent(changedRaw, quote);
    assert.equal(JSON.stringify(quote), saved);
  });

test('request-bound consumer requires explicit selectors raw schema unsigned SPI and isolated receipt versions',
  { timeout: 5000 }, async () => {
    const ctx = context(), quote = create(adapterInput(ctx)), strategy = new Bounded();
    for (const version of [undefined, null, 0, 2, '1', 1n]) {
      const bad = { ...ctx, quoteRequestContextVersion: version };
      await refusesCurrent(bad, quote);
    }
    for (const field of ['requiredFusedPolicyVersion', 'quoteRequestContextVersion', 'expectedQuoteRequestContext']) {
      const bad = copy(ctx); delete bad[field]; await refusesCurrent(bad, quote);
    }
    const schema2 = copy(ctx);
    delete schema2.observation.quoteRequestContextVersion; delete schema2.observation.quoteRequestContext;
    await refusesCurrent(schema2, quote);
    await refusesCurrent({ ...ctx, observation: normalize(ctx.observation) }, quote);
    for (const phase of ['SIGNED', 'UNKNOWN', 'ACKNOWLEDGED', 'VALIDATED', 'EXPIRED', undefined]) {
      await assert.rejects(strategy.quote({ ...ctx, phase }), rejection);
      await assert.rejects(strategy.apply({ ...ctx, phase }, quote), rejection);
    }
    const bytes = Buffer.from([0, 1, 2, 3]), saved = Buffer.from(bytes);
    await assert.rejects(strategy.quote({ ...ctx, signedBlock: { bytes } }), rejection);
    await assert.rejects(strategy.quote(ctx, undefined), rejection);
    await assert.rejects(strategy.apply(ctx), rejection);
    await assert.rejects(strategy.apply(ctx, quote, undefined), rejection);
    assert.deepEqual(bytes, saved);
    const old = copy(ctx);
    delete old.quoteRequestContextVersion; delete old.expectedQuoteRequestContext;
    old.observation = copy(quote.sourceObservation); delete old.observation.quoteRequestContext;
    const oldQuote = await strategy.quote(old);
    assert.equal(oldQuote.requiredFusedPolicyQuoteVersion, 1);
    await assert.rejects(strategy.apply(old, quote), rejection);
    await refusesReceipt(ctx, oldQuote);
    await assert.rejects(strategy.quote({ ...old, observation: copy(quote.sourceObservation) }), rejection);
  });

test('request-bound consumer rejects unavailable incoherent and pre-DP endpoint evidence before policy use',
  { timeout: 5000 }, async () => {
    const ctx = context(), quote = create(adapterInput(ctx));
    for (const mutate of [
      r => { r.endpointObservations[0] = null; },
      r => { r.endpointObservations[1] = null; },
      r => { r.endpointObservations[0].afterFrontier.hash = H1; },
      r => { r.endpointObservations[1].rpcObservation.requiredFusedPlasma++; },
      r => { for (const e of r.endpointObservations) e.profileEvidence.heightTwo.previousHash = H1; },
      r => { for (const e of r.endpointObservations) e.sporks.list[1].id = H1; },
      r => { for (const e of r.endpointObservations) e.plasmaVariables.MaxBasePlasmaInMomentum = 1; },
      r => { for (const e of r.endpointObservations) e.rpcObservation.requiredFusedPlasma++; },
      r => {
        for (const e of r.endpointObservations) {
          e.sporks.list[1].activated = false;
          for (const f of [e.beforeFrontier, e.afterFrontier]) {
            f.version = 1; f.nextFusionPrice = 0; f.nextWorkPrice = 0;
          }
        }
      },
    ]) {
      const bad = copy(ctx); mutate(bad.observation); await refusesCurrent(bad, quote);
    }
  });

test('request-bound consumer rejects hostile expected observed and receipt records without invoking hooks',
  { timeout: 5000 }, async () => {
    const ctx = context(), quote = create(adapterInput(ctx));
    let touches = 0;
    const trip = () => { touches++; throw new Error('UNREACHED_INPUT_HOOK'); };
    const traps = { get: trip, ownKeys: trip, getPrototypeOf: trip, getOwnPropertyDescriptor: trip };
    const at = (value, path) => path.reduce((object, field) => object[field], value);
    const paths = [
      ['expectedQuoteRequestContext'], ['expectedQuoteRequestContext', 'expectedChainProfile'],
      ['expectedQuoteRequestContext', 'compiledSporkIds'], ['expectedQuoteRequestContext', 'quoteRequest'],
      ['observation'], ['observation', 'quoteRequestContext'],
      ['observation', 'quoteRequestContext', 'quoteRequest'], ['policy'],
    ];
    for (const path of paths) {
      const pristine = at(ctx, path);
      for (const field of Object.keys(pristine)) {
        const bad = copy(ctx);
        Object.defineProperty(at(bad, path), field, { enumerable: true, get: trip });
        await refusesCurrent(bad, quote);
      }
      for (const value of [new Proxy(pristine, traps), Object.create(pristine)]) {
        const bad = copy(ctx); at(bad, path.slice(0, -1))[path.at(-1)] = value;
        await refusesCurrent(bad, quote);
      }
    }
    for (const field of ['quoteRequestContextVersion', 'expectedQuoteRequestContext']) {
      const bad = { ...ctx };
      Object.defineProperty(bad, field, { enumerable: true, get: trip });
      // Preserve the hostile descriptor when passing the public adapter.
      const direct = { ...ctx }; delete direct.phase;
      Object.defineProperty(direct, field, { enumerable: true, get: trip });
      assert.throws(() => create(direct), rejection);
      assert.throws(() => select({ ...adapterInput(ctx), quote,
        get [field]() { return trip(); } }), rejection);
      await assert.rejects(new Bounded().quote(bad), rejection);
      await assert.rejects(new Bounded().apply(bad, quote), rejection);
    }
    const badReceipt = copy(quote);
    badReceipt.sourceObservation.quoteRequestContext = new Proxy(quote.sourceObservation.quoteRequestContext, traps);
    await refusesReceipt(ctx, badReceipt);
    const revoked = Proxy.revocable({}, traps); revoked.revoke();
    await refusesCurrent({ ...ctx, expectedQuoteRequestContext: revoked.proxy }, quote);
    assert.equal(touches, 0);
  });
