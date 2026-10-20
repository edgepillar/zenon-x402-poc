import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

// Synthetic raw-result strings through the actual collector/normalizer/SPI.
// No HTTP transport, SDK, wallet, signature generation or live RPC is used.
assert.equal(process.argv.length, 2);
const pins = [
  ['../src/zenon/dynamic-plasma-observation-collector.js', 32190,
    'efffca482782d9c1e8d324e9d8e0db1d2ea45327bb33ad846b34cf0917feabed'],
  ['../src/zenon/dynamic-plasma-observation-normalizer.js', 23771,
    'a6a04dc52a52df0b583b64343946a59eb91b2e42101a6eb386e209f0e8d68e1e'],
  ['../src/zenon/bounded-dynamic-plasma-strategy.js', 5024,
    '8e9fb69300e15994b244e94e58070e47faffab6516a3c83e6096b15bfe0ea8f1'],
  ['../src/zenon/plasma-strategy.js', 974,
    '1c597d4e169ba8a5e6d2b7852c4ffa3a8ec9b854332fe354b9b013c36ebae093'],
  ['../src/zenon/dynamic-plasma-required-fused-policy-adapter.js', 8050,
    '6be7cdd599adb153cda29272bc503d185014718398886b35546756383b4e18ac'],
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
const {
  createDynamicPlasmaObservationCollector: createCollector,
  DYNAMIC_PLASMA_OBSERVATION_COLLECTOR_CONTRACT: oldCollectorContract,
  DYNAMIC_PLASMA_REQUIRED_FUSED_OBSERVATION_COLLECTOR_CONTRACT: newCollectorContract,
} = await import(pins[0][0]);
const {
  normalizeDynamicPlasmaObservation: normalize,
  DYNAMIC_PLASMA_OBSERVATION_CONTRACT: oldNormalizerContract,
  DYNAMIC_PLASMA_REQUIRED_FUSED_OBSERVATION_CONTRACT: newNormalizerContract,
} = await import(pins[1][0]);
const { BoundedDynamicPlasmaStrategy: Bounded } = await import(pins[2][0]);

const TAG = 'requiredFusedObservationVersion';
const CHAIN = '73404', GENESIS = '11'.repeat(32), HEIGHT_TWO = '22'.repeat(32);
const H0 = '33'.repeat(32), H1 = '44'.repeat(32), H2 = '55'.repeat(32);
const DYNAMIC = '02'.repeat(32), LIBP2P = '01'.repeat(32);
const RPC_KEYS = ['availablePlasma', 'basePlasma', 'requiredDifficulty', 'requiredFusedPlasma'];
const FRONTIER = 'ledger.getFrontierMomentum', HEIGHT = 'ledger.getMomentumsByHeight';
const SPORK = 'embedded.spork.getAll', VARIABLES = 'embedded.plasma.getVariables';
const QUOTE = 'embedded.plasma.getRequiredPoWForAccountBlock';
const METHODS = [FRONTIER, HEIGHT, SPORK, VARIABLES, QUOTE, FRONTIER];
const copy = value => JSON.parse(JSON.stringify(value)); // Owned fixture DATA only.

// Independent fixture encoder, not an SDK or a wallet-derived address.
function fixtureAddress(byte) {
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const words = [], bytes = [0, ...Array(19).fill(byte)];
  let bits = 0, accumulator = 0;
  for (const item of bytes) {
    accumulator = (accumulator << 8) | item;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      words.push((accumulator >>> bits) & 31);
    }
  }
  assert.equal(bits, 0);
  let checksum = 1;
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
const ADDRESS = fixtureAddress(17), RECIPIENT = fixtureAddress(34);
const DATA = Buffer.alloc(32, 7).toString('base64');

function request(four = true) {
  const value = {
    phase: 'UNSIGNED',
    expectedChainProfile: { version: 1, chainIdentifier: CHAIN, genesisMomentumHash: GENESIS },
    compiledSporkIds: { dynamicPlasmaId: DYNAMIC, libp2pId: LIBP2P },
    quoteRequest: { address: ADDRESS, blockType: 2, toAddress: RECIPIENT, data: DATA },
  };
  if (four) value[TAG] = 1;
  return value;
}
function momentum({ height = 100, hash = H0, fusion = 1000, work = 1000, version = 2 } = {}) {
  return {
    version, chainIdentifier: Number(CHAIN), hash, previousHash: GENESIS, height,
    timestamp: 1234, data: '', content: [], changesHash: '66'.repeat(32),
    publicKey: Buffer.alloc(32, 6).toString('base64'),
    signature: Buffer.alloc(64, 8).toString('base64'), // Declared bytes, not a generated signature.
    nextFusionPrice: fusion, nextWorkPrice: work, producer: ADDRESS,
  };
}
function replies({
  four = true, base = 21000, available = 30000, fusion = 1000, work = 1000,
  height = 100, hash = H0, pre = false,
} = {}) {
  const total = pre ? base : Math.ceil(base * fusion / 1000);
  const fused = Math.min(available, total);
  const remaining = Math.max(0, base - Math.floor(fused * 1000 / (pre ? 1000 : fusion)));
  const quote = {
    availablePlasma: available, basePlasma: base,
    requiredDifficulty: pre ? 0 : Math.ceil(remaining * work / 1000) * 1500,
  };
  if (four) quote.requiredFusedPlasma = total;
  const front = momentum({ height, hash, fusion: pre ? 0 : fusion, work: pre ? 0 : work, version: pre ? 1 : 2 });
  return [
    front,
    { count: 200, list: [momentum({ height: 2, hash: HEIGHT_TWO, fusion: 0, work: 0, version: 1 })] },
    { count: 2, list: [
      { id: LIBP2P, name: 'libp2p', description: 'Synthetic fixture.', activated: false, enforcementHeight: 0 },
      { id: DYNAMIC, name: 'dynamic-plasma', description: 'Synthetic fixture.', activated: !pre, enforcementHeight: 10 },
    ] },
    { MaxBasePlasmaInMomentum: 4200000, FusedPlasmaTarget: 1050000, PowPlasmaTarget: 1050000,
      MaxPriceChangePercent: 10, PriceChangeDenominator: 20 },
    quote,
    copy(front),
  ];
}
function fixture(first = replies(), second = copy(first)) {
  const calls = [], positions = [0, 0];
  const transports = [first, second].map((script, endpoint) => {
    const callRead = Object.freeze(async input => {
      const index = positions[endpoint]++;
      assert.equal(input.method, METHODS[index]);
      assert.ok(Object.isFrozen(input) && Object.isFrozen(input.params));
      assert.deepEqual(input.params, index === 1 ? [2, 1] : index === 2 ? [0, 128]
        : index === 4 ? [request().quoteRequest] : []);
      calls.push({ endpoint, input });
      if (script[index] === null) throw new Error('DECLARED_UNAVAILABLE');
      return typeof script[index] === 'string' ? script[index] : JSON.stringify(script[index]);
    });
    return Object.freeze({ callRead });
  });
  return { collector: createCollector({ transports }), calls, positions };
}
async function observed(options = {}, four = true) {
  const script = replies(options), f = fixture(script), input = request(four);
  const before = JSON.stringify(input), raw = await f.collector.collect(input);
  assert.equal(JSON.stringify(input), before);
  return { ...f, input, raw, result: normalize(raw) };
}
function declared(value, schema = 2) {
  assert.equal(value.schemaVersion, schema);
  assert.equal(Object.hasOwn(value, TAG), schema === 2);
  if (schema === 2) assert.equal(value[TAG], 1);
  for (const field of ['chainAuthentication', 'canonicality', 'finality']) {
    assert.equal(value[field], 'NOT_ESTABLISHED');
  }
  assert.equal(value.afterSigningAction, 'NONE');
}
function failed(result, reason, schema = 2) {
  declared(result, schema);
  assert.equal(result.reason, reason);
  assert.equal(result.observation, null);
  assert.equal(result.compatibility, null);
}
function frozenTree(value) {
  if (typeof value !== 'object' || value === null) return;
  assert.ok(Object.isFrozen(value));
  for (const child of Object.values(value)) frozenTree(child);
}
function strategyContext(result, maxFused = 30000, maxDifficulty = 0, advances = 2) {
  assert.equal(result.classification, 'DP_ACTIVE');
  const o = result.observation;
  const frontier = f => ({ height: f.height, hash: f.hash, version: f.version,
    nextFusionPrice: f.nextFusionPrice, nextWorkPrice: f.nextWorkPrice });
  return {
    phase: 'UNSIGNED', requiredFusedPolicyVersion: 1,
    subjectDigest: 'sha256:' + 'a'.repeat(64), runtimeContextDigest: 'sha256:' + 'b'.repeat(64),
    observation: { chainProfileMatch: { classification: 'MATCH' },
      beforeFrontier: frontier(o.beforeFrontier), rpcObservation: o.rpcObservation,
      afterFrontier: frontier(o.afterFrontier) },
    policy: { policyVersion: 1, maxPriceChangePercent: o.plasmaVariables.MaxPriceChangePercent,
      maxMomentumAdvances: advances, maxFusedPlasma: maxFused, maxDifficulty },
  };
}
const collectorInputError = error => error instanceof TypeError
  && error.code === 'dynamic_plasma_observation_collector_input_rejected';
const normalizerInputError = error => error instanceof TypeError
  && error.code === 'dynamic_plasma_observation_input_rejected';

test('observation pipeline retains the untagged three-field schema and legacy contracts',
  { timeout: 5000 }, async () => {
    const { raw, result, positions } = await observed({ four: false }, false);
    assert.deepEqual(positions, [6, 6]);
    assert.deepEqual(Object.keys(raw), ['expectedChainProfile', 'compiledSporkIds', 'endpointObservations']);
    assert.deepEqual(Object.keys(raw.endpointObservations[0].rpcObservation), RPC_KEYS.slice(0, 3));
    declared(result, 1);
    assert.equal(result.classification, 'DP_ACTIVE');
    assert.deepEqual(Object.keys(result.observation.rpcObservation), RPC_KEYS.slice(0, 3));
    assert.equal(oldCollectorContract.schemaVersion, 1);
    assert.equal(oldNormalizerContract.schemaVersion, 1);
    assert.equal(Object.hasOwn(oldCollectorContract, TAG), false);
    assert.equal(Object.hasOwn(oldNormalizerContract, TAG), false);
    assert.equal(oldCollectorContract.quoteRequestCommitment, 'NOT_PERSISTED');
    assert.equal(oldCollectorContract.signingAuthorization, 'NOT_ESTABLISHED');
  });

test('four-field raw observations flow through normalization and existing bounded strategy',
  { timeout: 5000 }, async () => {
    const first = await observed(), strategy = new Bounded();
    assert.equal(newCollectorContract.schemaVersion, 2);
    assert.equal(newNormalizerContract.schemaVersion, 2);
    assert.deepEqual(newCollectorContract.requiredRpcFields, RPC_KEYS);
    assert.deepEqual(newNormalizerContract.requiredRpcFields, RPC_KEYS);
    assert.equal(first.raw[TAG], 1);
    assert.deepEqual(first.positions, [6, 6]);
    declared(first.result);
    assert.deepEqual(Object.keys(first.result.observation.rpcObservation), RPC_KEYS);
    assert.equal(first.result.observation.rpcObservation.requiredFusedPlasma, 21000);
    const ctx = strategyContext(first.result), quote = await strategy.quote(ctx);
    assert.deepEqual(await strategy.apply(ctx, quote), { fusedPlasma: 25410, difficulty: 0 });
    for (const [height, hash, fusion, work, total] of [
      [101, H1, 1050, 1100, 22050], [102, H2, 1210, 1210, 25410],
    ]) {
      const now = await observed({ height, hash, fusion, work });
      assert.equal(now.result.observation.rpcObservation.requiredFusedPlasma, total);
      assert.deepEqual(await strategy.apply(strategyContext(now.result), quote),
        { fusedPlasma: 25410, difficulty: 0 });
    }
    assert.equal(quote.sourceObservation.rpcObservation.requiredFusedPlasma, 21000);
  });

test('four-field observation keeps fused-only total separate from hybrid recommended fields',
  { timeout: 5000 }, async () => {
    const { result } = await observed({ available: 18900, fusion: 1050, work: 1100 });
    const r = result.observation.rpcObservation;
    assert.equal(r.requiredFusedPlasma, 22050);
    assert.equal(r.requiredDifficulty, 4950000);
    assert.equal(result.compatibility.quote.selectedFusedPlasma, 18900);
    assert.deepEqual(Object.keys(result.compatibility.quote.rpcObservation), RPC_KEYS.slice(0, 3));
    const strategy = new Bounded(), ctx = strategyContext(result, 18900, 4950000, 0);
    const quote = await strategy.quote(ctx);
    const selected = await strategy.apply(ctx, quote);
    assert.deepEqual(Object.keys(selected), ['fusedPlasma', 'difficulty']);
    assert.deepEqual(selected, { fusedPlasma: 18900, difficulty: 4950000 });
    assert.notEqual(selected.fusedPlasma, r.requiredFusedPlasma);
  });

test('four-field normalization refuses incoherent totals and cross-endpoint disagreement',
  { timeout: 5000 }, async () => {
    for (const total of [0, 3150, 20999, 21001]) {
      const script = replies(); script[4].requiredFusedPlasma = total;
      const f = fixture(script), raw = await f.collector.collect(request());
      assert.ok(raw.endpointObservations.every(value => value !== null));
      failed(normalize(raw), 'RPC_QUOTE_INCOHERENT');
    }
    const a = replies(), b = replies(); b[4].requiredFusedPlasma++;
    const f = fixture(a, b);
    failed(normalize(await f.collector.collect(request())), 'ENDPOINT_OBSERVATION_MISMATCH');
    const badWork = replies(); badWork[4].requiredDifficulty = 1;
    failed(normalize(await fixture(badWork).collector.collect(request())), 'RPC_QUOTE_INCOHERENT');
  });

test('observation version selection never auto-detects or downgrades RPC fields',
  { timeout: 5000 }, async () => {
    for (const [fourReply, fourInput, schema] of [[true, false, 1], [false, true, 2]]) {
      const f = fixture(replies({ four: fourReply }));
      const raw = await f.collector.collect(request(fourInput));
      assert.deepEqual(raw.endpointObservations, [null, null]);
      failed(normalize(raw), 'ENDPOINT_DATA_UNAVAILABLE', schema);
    }
    const good = await observed();
    const noTag = copy(good.raw); delete noTag[TAG];
    assert.throws(() => normalize(noTag), normalizerInputError);
    const old = await observed({ four: false }, false);
    assert.throws(() => normalize({ ...copy(old.raw), [TAG]: 1 }), normalizerInputError);
    const f = fixture();
    for (const version of [undefined, null, 0, 2, 1n, '1', new Number(1)]) {
      await assert.rejects(f.collector.collect({ ...request(), [TAG]: version }), collectorInputError);
      assert.throws(() => normalize({ ...good.raw, [TAG]: version }), normalizerInputError);
    }
    assert.deepEqual(f.calls, []);
  });

test('four-field collector rejects unsafe or malformed total integer tokens without rounding',
  { timeout: 5000 }, async () => {
    for (const lexeme of ['9007199254740992', '18446744073709551615', '21000.0', '21e3', '-0', '-1', '"21000"', 'null']) {
      const script = replies();
      script[4] = JSON.stringify(script[4]).replace('"requiredFusedPlasma":21000', '"requiredFusedPlasma":' + lexeme);
      const f = fixture(script), raw = await f.collector.collect(request());
      assert.deepEqual(f.positions, [5, 5]);
      assert.deepEqual(raw.endpointObservations, [null, null]);
      failed(normalize(raw), 'ENDPOINT_DATA_UNAVAILABLE');
    }
    const duplicate = replies();
    duplicate[4] = JSON.stringify(duplicate[4]).replace('"requiredFusedPlasma":21000',
      '"requiredFusedPlasma":21000,"requiredFusedPlasma":21000');
    const f = fixture(duplicate), raw = await f.collector.collect(request());
    assert.deepEqual(f.positions, [5, 5]);
    assert.deepEqual(raw.endpointObservations, [null, null]);
  });

test('four-field observations preserve frontier profile spork and unavailable read guards',
  { timeout: 5000 }, async () => {
    for (const [change, reason] of [
      [s => { s[5].hash = H1; }, 'FRONTIER_BINDING_MISMATCH'],
      [s => { s[1].list[0].previousHash = H1; }, 'PROFILE_GENESIS_MISMATCH'],
      [s => { s[2].list[1].id = H1; }, 'SPORK_BINDING_MISMATCH'],
      [s => { s[2].list[1].activated = false; }, 'FRONTIER_SPORK_STATE_INCOHERENT'],
      [s => { s[3].MaxPriceChangePercent = 0; }, 'PLASMA_VARIABLES_INCOHERENT'],
    ]) {
      const script = replies(); change(script);
      failed(normalize(await fixture(script).collector.collect(request())), reason);
    }
    const a = replies(), b = replies({ height: 101, hash: H1 });
    failed(normalize(await fixture(a, b).collector.collect(request())), 'ENDPOINT_OBSERVATION_MISMATCH');
    const unavailable = replies(); unavailable[4] = null;
    const f = fixture(unavailable, replies());
    const raw = await f.collector.collect(request());
    assert.equal(raw.endpointObservations[0], null);
    assert.notEqual(raw.endpointObservations[1], null);
    assert.deepEqual(f.positions, [5, 6]);
    failed(normalize(raw), 'ENDPOINT_DATA_UNAVAILABLE');
  });

test('four-field pre-DP observations retain base total without claiming active admission',
  { timeout: 5000 }, async () => {
    const { raw, result } = await observed({ pre: true });
    declared(result);
    assert.equal(result.classification, 'PRE_DP');
    assert.equal(result.observation.rpcObservation.requiredFusedPlasma, 21000);
    assert.equal(newNormalizerContract.preDpValidation, 'TOTAL_EQUALS_BASE_ONLY_NOT_LEGACY_POW_VALIDATION');
    const bad = copy(raw);
    for (const endpoint of bad.endpointObservations) endpoint.rpcObservation.requiredFusedPlasma++;
    failed(normalize(bad), 'RPC_QUOTE_INCOHERENT');
    const old = await observed({ pre: true, four: false }, false);
    declared(old.result, 1);
    assert.equal(old.result.classification, 'PRE_DP');
    const ctx = strategyContext((await observed()).result);
    ctx.observation.beforeFrontier.version = ctx.observation.afterFrontier.version = 1;
    const strategy = new Bounded();
    await assert.rejects(strategy.quote(ctx), error => error instanceof TypeError
      && error.code === 'dynamic_plasma_required_fused_policy_input_rejected');
  });

test('four-field observation tags and total descriptors refuse hostile hooks before use',
  { timeout: 5000 }, async () => {
    const good = await observed(), f = fixture();
    let touches = 0;
    const trap = () => { touches++; throw new Error('UNREACHED_INPUT_HOOK'); };
    const traps = { get: trap, ownKeys: trap, getPrototypeOf: trap, getOwnPropertyDescriptor: trap };
    const revoked = Proxy.revocable({}, traps); revoked.revoke();
    for (const bad of [new Proxy(request(), traps), revoked.proxy,
      { ...request(), [Symbol('extra')]: 1 }]) {
      await assert.rejects(f.collector.collect(bad), collectorInputError);
    }
    for (const field of [TAG, 'phase', 'quoteRequest']) {
      const accessor = request(), hidden = request();
      Object.defineProperty(accessor, field, { enumerable: true, get: trap });
      Object.defineProperty(hidden, field, { enumerable: false });
      await assert.rejects(f.collector.collect(accessor), collectorInputError);
      await assert.rejects(f.collector.collect(hidden), collectorInputError);
    }
    for (const bad of [new Proxy(good.raw, traps), revoked.proxy,
      { ...good.raw, [Symbol('extra')]: 1 }]) assert.throws(() => normalize(bad), normalizerInputError);
    const badTag = copy(good.raw);
    Object.defineProperty(badTag, TAG, { enumerable: true, get: trap });
    assert.throws(() => normalize(badTag), normalizerInputError);
    const badTotal = copy(good.raw);
    Object.defineProperty(badTotal.endpointObservations[0].rpcObservation, 'requiredFusedPlasma',
      { enumerable: true, get: trap });
    assert.throws(() => normalize(badTotal), normalizerInputError);
    await assert.rejects(f.collector.collect({ ...request(), phase: 'SIGNED' }), collectorInputError);
    await assert.rejects(f.collector.collect(request(), undefined), collectorInputError);
    assert.deepEqual(f.calls, []);
    assert.equal(touches, 0);
  });

test('four-field outputs are detached frozen DATA and do not acquire request or signing authority',
  { timeout: 5000 }, async () => {
    const { raw, result, calls, input } = await observed();
    frozenTree(raw); frozenTree(result);
    const rawBefore = JSON.stringify(raw), resultBefore = JSON.stringify(result);
    const roundtrip = copy(raw), again = normalize(roundtrip);
    assert.deepEqual(again, result);
    assert.notEqual(again.observation, result.observation);
    assert.notEqual(again.observation.rpcObservation, raw.endpointObservations[0].rpcObservation);
    roundtrip.endpointObservations[0].rpcObservation.requiredFusedPlasma = 0;
    assert.equal(JSON.stringify(raw), rawBefore);
    assert.equal(JSON.stringify(result), resultBefore);
    assert.equal(Object.hasOwn(raw, 'quoteRequest'), false);
    assert.equal(Object.hasOwn(result.observation, 'quoteRequest'), false);
    assert.equal(newCollectorContract.quoteRequestCommitment, 'NOT_PERSISTED');
    assert.equal(newCollectorContract.signingAuthorization, 'NOT_ESTABLISHED');
    assert.deepEqual(calls.filter(call => call.input.method === QUOTE).map(call => call.input.params),
      [[input.quoteRequest], [input.quoteRequest]]);
    declared(again);
  });
