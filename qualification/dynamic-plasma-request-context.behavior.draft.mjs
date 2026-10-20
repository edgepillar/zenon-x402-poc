import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

// Selected in-memory declared DATA only. No HTTP owner, socket, SDK, wallet,
// generated signature, real provider or signed-payment operation is exercised.
assert.equal(process.argv.length, 2);
const pins = [
  ['../src/zenon/dynamic-plasma-observation-collector.js', 33780,
    'dd298d4cb2ec1c5e2afb7d0fcc51f94f37c3b3793be3e70dc1ce113f2f0f413e'],
  ['../src/zenon/dynamic-plasma-observation-normalizer.js', 28398,
    '2c3f7d42ded21a5513ff26c23a00a35a53aa334f053d10930f1571a020286897'],
  ['../src/zenon/dynamic-plasma-json-rpc-read-transport.js', 9063,
    'f89d9b40b2b0d3ec009365be8a7682bc5f0c4821a258ab5993c5782951f2bc6c'],
  ['../src/zenon/bounded-json-rpc-read-core.js', 20906,
    '5572d24175455c6b3a9924688d601d31585454ce62dac9eb27151d2a65c83fcd'],
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
  ['./dynamic-plasma-four-field-observation.behavior.draft.mjs', 21482,
    '758e20b0dcf8b974eb7f16d8422e5303ca6eb9e79c3e1bf8c804b707af814cae'],
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
// These ten registrations are requalified because their component graph changed.
// Only the two source-pin literal pairs changed; their scenario bodies did not.
await import('./dynamic-plasma-four-field-observation.behavior.draft.mjs');
const {
  createDynamicPlasmaObservationCollector: createCollector,
  DYNAMIC_PLASMA_REQUEST_BOUND_OBSERVATION_COLLECTOR_CONTRACT: collectorContract,
} = await import(pins[0][0]);
const {
  normalizeDynamicPlasmaObservation: normalize,
  snapshotDynamicPlasmaQuoteRequestContext: snapshotContext,
  DYNAMIC_PLASMA_REQUEST_BOUND_OBSERVATION_CONTRACT: normalizerContract,
} = await import(pins[1][0]);
const {
  snapshotDynamicPlasmaQuoteRequest: snapshotRequest,
  createDynamicPlasmaJsonRpcReadTransport: createRpc,
} = await import(pins[2][0]);

const H = '33'.repeat(32), GENESIS = '11'.repeat(32), TWO = '22'.repeat(32);
const DYNAMIC = '02'.repeat(32), LIBP2P = '01'.repeat(32);
const DOMAIN = 'zenon-x402-dp-quote-request-context/v1';
const QUOTE = 'embedded.plasma.getRequiredPoWForAccountBlock';
const FRONTIER = 'ledger.getFrontierMomentum', HEIGHT = 'ledger.getMomentumsByHeight';
const SPORK = 'embedded.spork.getAll', VARIABLES = 'embedded.plasma.getVariables';
const METHODS = [FRONTIER, HEIGHT, SPORK, VARIABLES, QUOTE, FRONTIER];
const copy = value => JSON.parse(JSON.stringify(value)); // Owned fixture DATA only.

// Independent synthetic address encoder; no wallet or SDK is involved.
function fixtureAddress(byte) {
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l', words = [];
  let accumulator = 0, bits = 0;
  for (const value of [0, ...Array(19).fill(byte)]) {
    accumulator = (accumulator << 8) | value; bits += 8;
    while (bits >= 5) { bits -= 5; words.push((accumulator >>> bits) & 31); }
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
const A = fixtureAddress(17), B = fixtureAddress(34), C = fixtureAddress(51);
const DATA = Buffer.alloc(32, 7).toString('base64'), OTHER_DATA = Buffer.alloc(32, 9).toString('base64');
const normalizerError = e => e instanceof TypeError && e.code === 'dynamic_plasma_observation_input_rejected';
const collectorError = e => e instanceof TypeError && e.code === 'dynamic_plasma_observation_collector_input_rejected';
const snapshotError = e => e instanceof TypeError && e.code === 'dynamic_plasma_quote_request_input_rejected';
function input() {
  return {
    phase: 'UNSIGNED', requiredFusedObservationVersion: 1, quoteRequestContextVersion: 1,
    expectedChainProfile: { version: 1, chainIdentifier: '73404', genesisMomentumHash: GENESIS },
    compiledSporkIds: { dynamicPlasmaId: DYNAMIC, libp2pId: LIBP2P },
    quoteRequest: { address: A, blockType: 2, toAddress: B, data: DATA },
  };
}
function contextInput(value) {
  return { requestContextVersion: 1, expectedChainProfile: value.expectedChainProfile,
    compiledSporkIds: value.compiledSporkIds, quoteRequest: value.quoteRequest };
}
function momentum(height = 100, hash = H, version = 2) {
  return {
    version, chainIdentifier: 73404, hash, previousHash: GENESIS, height,
    timestamp: 1234, data: '', content: [], changesHash: '66'.repeat(32),
    publicKey: Buffer.alloc(32, 6).toString('base64'),
    signature: Buffer.alloc(64, 8).toString('base64'), // Declared bytes, not signing.
    nextFusionPrice: version === 2 ? 1000 : 0, nextWorkPrice: version === 2 ? 1000 : 0,
    producer: A,
  };
}
function replies() {
  return [
    momentum(), { count: 200, list: [momentum(2, TWO, 1)] },
    { count: 2, list: [
      { id: LIBP2P, name: 'libp2p', description: 'Synthetic.', activated: false, enforcementHeight: 0 },
      { id: DYNAMIC, name: 'dynamic-plasma', description: 'Synthetic.', activated: true, enforcementHeight: 10 },
    ] },
    { MaxBasePlasmaInMomentum: 4200000, FusedPlasmaTarget: 1050000, PowPlasmaTarget: 1050000,
      MaxPriceChangePercent: 10, PriceChangeDenominator: 20 },
    { availablePlasma: 30000, basePlasma: 21000, requiredDifficulty: 0, requiredFusedPlasma: 21000 },
    momentum(),
  ];
}
function fixture({ deferFirst = false, unavailable = false } = {}) {
  const calls = [], positions = [0, 0], script = replies();
  let release;
  const firstGate = deferFirst ? new Promise(resolve => { release = resolve; }) : null;
  const transports = [0, 1].map(endpoint => Object.freeze({ callRead: Object.freeze(async request => {
    const index = positions[endpoint]++;
    assert.equal(request.method, METHODS[index]);
    assert.ok(Object.isFrozen(request) && Object.isFrozen(request.params));
    calls.push({ endpoint, request });
    if (deferFirst && endpoint === 0 && index === 0) await firstGate;
    if (unavailable && index === 4) throw new Error('DECLARED_UNAVAILABLE');
    return JSON.stringify(script[index]);
  }) }));
  return { collector: createCollector({ transports }), calls, positions, release };
}
async function observed(value = input(), options = {}) {
  const f = fixture(options), original = snapshotContext(contextInput(value));
  const raw = await f.collector.collect(value);
  return { ...f, original, raw };
}
function assertBound(result, binding) {
  assert.equal(result.schemaVersion, 3);
  assert.equal(result.requiredFusedObservationVersion, 1);
  assert.equal(result.quoteRequestContextVersion, 1);
  assert.equal(result.requestContextBinding, binding);
  assert.equal(result.chainAuthentication, 'NOT_ESTABLISHED');
  assert.equal(result.canonicality, 'NOT_ESTABLISHED');
  assert.equal(result.finality, 'NOT_ESTABLISHED');
  assert.equal(result.afterSigningAction, 'NONE');
}
function mismatch(raw, expected) {
  const result = normalize(raw, expected);
  assertBound(result, 'NOT_ESTABLISHED');
  assert.equal(result.classification, 'MISBOUND_OR_INCOHERENT');
  assert.equal(result.reason, 'QUOTE_REQUEST_CONTEXT_MISMATCH');
  assert.equal(result.observation, null); assert.equal(result.compatibility, null);
}

test('quote request snapshot shares the unchanged closed RPC parameter grammar',
  { timeout: 5000 }, async () => {
    const q = input().quoteRequest, before = copy(q), snap = snapshotRequest(q);
    const canonical = `[{"address":"${A}","blockType":2,"toAddress":"${B}","data":"${DATA}"}]`;
    assert.equal(snap.requestSnapshotVersion, 1);
    assert.deepEqual(snap.quoteRequest, q); assert.notEqual(snap.quoteRequest, q);
    assert.ok(Object.isFrozen(snap) && Object.isFrozen(snap.quoteRequest));
    assert.equal(snap.canonicalParams, canonical); assert.deepEqual(q, before);
    const sent = [], exchange = Object.freeze(async body => {
      sent.push(body); return '{"jsonrpc":"2.0","id":1,"result":{"declared":true}}';
    });
    const rpc = createRpc({ exchange });
    const result = await rpc.callRead(Object.freeze({ method: QUOTE,
      params: Object.freeze([Object.freeze(copy(q))]) }));
    assert.equal(result, '{"declared":true}');
    assert.deepEqual(sent, [`{"jsonrpc":"2.0","id":1,"method":"${QUOTE}","params":${canonical}}`]);
    await assert.rejects(rpc.callRead(Object.freeze({ method: 'ledger.publishRawTransaction', params: Object.freeze([]) })),
      e => e.code === 'dynamic_plasma_json_rpc_read_transport_input_rejected');
    assert.equal(sent.length, 1);
  });

test('quote context digest binds the exact canonical request profile and compiled identities',
  { timeout: 5000 }, () => {
    const value = input(), supplied = contextInput(value), snap = snapshotContext(supplied);
    const canonical = `[{"address":"${A}","blockType":2,"toAddress":"${B}","data":"${DATA}"}]`;
    const preimage = JSON.stringify([DOMAIN, 1, '73404', GENESIS, DYNAMIC, LIBP2P, canonical]);
    assert.equal(snap.digest, 'sha256:' + createHash('sha256').update(preimage, 'utf8').digest('hex'));
    assert.equal(normalizerContract.requestContextDomain, DOMAIN);
    for (const change of [
      v => { v.quoteRequest.address = C; }, v => { v.quoteRequest.toAddress = C; },
      v => { v.quoteRequest.data = OTHER_DATA; }, v => { v.expectedChainProfile.chainIdentifier = '73405'; },
      v => { v.expectedChainProfile.genesisMomentumHash = '77'.repeat(32); },
      v => { v.compiledSporkIds.dynamicPlasmaId = '88'.repeat(32); },
      v => { v.compiledSporkIds.libp2pId = '99'.repeat(32); },
    ]) {
      const other = copy(supplied); change(other);
      assert.notEqual(snapshotContext(other).digest, snap.digest);
    }
  });

test('collector retains the request snapshot and normalizer matches a separately supplied digest',
  { timeout: 5000 }, async () => {
    const { raw, original, calls, positions } = await observed();
    assert.deepEqual(positions, [6, 6]);
    assert.deepEqual(raw.quoteRequestContext, original);
    assert.equal(collectorContract.quoteRequestContextVersion, 1);
    const result = normalize(raw, original.digest);
    assertBound(result, 'MATCHES_DECLARED_EXPECTED_REQUEST_CONTEXT');
    assert.equal(result.classification, 'DP_ACTIVE');
    assert.deepEqual(result.observation.quoteRequestContext, original);
    assert.notEqual(result.observation.quoteRequestContext, raw.quoteRequestContext);
    assert.equal(result.observation.rpcObservation.requiredFusedPlasma, 21000);
    assert.deepEqual(calls.filter(c => c.request.method === QUOTE).map(c => c.request.params),
      [[original.quoteRequest], [original.quoteRequest]]);
  });

test('collector captures request context before the first asynchronous read can mutate input',
  { timeout: 5000 }, async () => {
    const value = input(), original = snapshotContext(contextInput(value)), f = fixture({ deferFirst: true });
    const pending = f.collector.collect(value);
    assert.deepEqual(f.positions, [1, 0]);
    value.quoteRequest.data = OTHER_DATA; value.quoteRequest.toAddress = C;
    value.expectedChainProfile.genesisMomentumHash = '77'.repeat(32);
    value.compiledSporkIds.dynamicPlasmaId = '88'.repeat(32);
    f.release();
    const raw = await pending;
    assert.deepEqual(raw.quoteRequestContext, original);
    const result = normalize(raw, original.digest);
    assertBound(result, 'MATCHES_DECLARED_EXPECTED_REQUEST_CONTEXT');
    assert.equal(result.classification, 'DP_ACTIVE');
    assert.deepEqual(f.calls.filter(c => c.request.method === QUOTE).map(c => c.request.params),
      [[original.quoteRequest], [original.quoteRequest]]);
  });

test('request context normalization refuses mixed requests changed hashes and wrong expected bindings',
  { timeout: 5000 }, async () => {
    const { raw, original } = await observed();
    for (const change of [
      v => { v.quoteRequestContext.quoteRequest.address = C; },
      v => { v.quoteRequestContext.quoteRequest.toAddress = C; },
      v => { v.quoteRequestContext.quoteRequest.data = OTHER_DATA; },
      v => { v.quoteRequestContext.digest = 'sha256:' + 'f'.repeat(64); },
      v => { v.expectedChainProfile.chainIdentifier = '73405'; },
      v => { v.expectedChainProfile.genesisMomentumHash = '77'.repeat(32); },
      v => { v.compiledSporkIds.dynamicPlasmaId = '88'.repeat(32); },
      v => { v.compiledSporkIds.libp2pId = '99'.repeat(32); },
    ]) { const bad = copy(raw); change(bad); mismatch(bad, original.digest); }
    mismatch(raw, 'sha256:' + 'f'.repeat(64));
  });

test('self-consistent request DATA is explicitly weaker than a matched expected request',
  { timeout: 5000 }, async () => {
    const { raw, original } = await observed();
    const self = normalize(raw);
    assertBound(self, 'SELF_CONSISTENT_DECLARED_REQUEST_ONLY');
    assert.equal(self.classification, 'DP_ACTIVE');
    const forged = copy(raw), other = input(); other.quoteRequest.data = OTHER_DATA;
    forged.quoteRequestContext = snapshotContext(contextInput(other));
    assertBound(normalize(forged), 'SELF_CONSISTENT_DECLARED_REQUEST_ONLY');
    mismatch(forged, original.digest);
    assert.equal(collectorContract.quoteRequestCommitment, 'RETAINED_DETACHED_DATA_NOT_AUTHENTICATED_OR_DURABLE');
  });

test('request context namespace never silently upgrades old observations or ignores expected input',
  { timeout: 5000 }, async () => {
    const { raw, original } = await observed();
    const oldInput = input(); delete oldInput.quoteRequestContextVersion;
    const old = await fixture().collector.collect(oldInput);
    assert.equal(normalize(old).schemaVersion, 2);
    assert.throws(() => normalize(old, original.digest), normalizerError);
    const noContext = copy(raw); delete noContext.quoteRequestContext;
    assert.throws(() => normalize(noContext), normalizerError);
    const noMarker = copy(raw); delete noMarker.quoteRequestContextVersion;
    assert.throws(() => normalize(noMarker), normalizerError);
    for (const version of [undefined, null, 0, 2, 1n, '1', new Number(1)]) {
      const bad = input(); bad.quoteRequestContextVersion = version;
      const f = fixture(); await assert.rejects(f.collector.collect(bad), collectorError);
      assert.deepEqual(f.calls, []);
    }
  });

test('request context matching does not bypass unavailable frontier profile or quote arithmetic guards',
  { timeout: 5000 }, async () => {
    const { raw, original } = await observed();
    for (const [change, reason] of [
      [v => { v.endpointObservations[0] = null; }, 'ENDPOINT_DATA_UNAVAILABLE'],
      [v => { v.endpointObservations[0].afterFrontier.hash = '77'.repeat(32); }, 'FRONTIER_BINDING_MISMATCH'],
      [v => { for (const e of v.endpointObservations) e.profileEvidence.heightTwo.previousHash = '77'.repeat(32); }, 'PROFILE_GENESIS_MISMATCH'],
      [v => { for (const e of v.endpointObservations) e.rpcObservation.requiredFusedPlasma++; }, 'RPC_QUOTE_INCOHERENT'],
    ]) {
      const bad = copy(raw); change(bad);
      const result = normalize(bad, original.digest);
      assertBound(result, 'NOT_ESTABLISHED'); assert.equal(result.reason, reason);
      assert.equal(result.observation, null);
    }
    const failed = await observed(input(), { unavailable: true });
    assert.deepEqual(failed.raw.quoteRequestContext, failed.original);
    const result = normalize(failed.raw, failed.original.digest);
    assertBound(result, 'NOT_ESTABLISHED'); assert.equal(result.classification, 'UNAVAILABLE');
  });

test('closed request snapshots refuse malformed addresses data block types extras and unsafe hooks',
  { timeout: 5000 }, () => {
    const good = input().quoteRequest;
    for (const bad of [
      { ...good, address: A.slice(0, -1) + 'i' }, { ...good, toAddress: 'invalid' },
      { ...good, data: 'not-base64' }, { ...good, blockType: 1 }, { ...good, blockType: '2' },
      { ...good, extra: 0 }, Object.assign(Object.create(null), good), null, [],
    ]) assert.throws(() => snapshotRequest(bad), snapshotError);
    let touches = 0; const trap = () => { touches++; throw new Error('UNREACHED_INPUT_HOOK'); };
    const traps = { get: trap, ownKeys: trap, getPrototypeOf: trap, getOwnPropertyDescriptor: trap };
    assert.throws(() => snapshotRequest(new Proxy(good, traps)), snapshotError);
    const accessor = { ...good }; Object.defineProperty(accessor, 'data', { enumerable: true, get: trap });
    assert.throws(() => snapshotRequest(accessor), snapshotError);
    assert.throws(() => snapshotRequest({ ...good, toJSON: trap }), snapshotError);
    assert.throws(() => snapshotRequest(good, undefined), snapshotError);
    assert.equal(touches, 0);
  });

test('context DATA and expected digest guards reject hostile descriptors without coercion',
  { timeout: 5000 }, async () => {
    const { raw } = await observed(), good = contextInput(input());
    let touches = 0; const trap = () => { touches++; throw new Error('UNREACHED_INPUT_HOOK'); };
    const traps = { get: trap, ownKeys: trap, getPrototypeOf: trap, getOwnPropertyDescriptor: trap };
    for (const field of Object.keys(good)) {
      const bad = { ...good }; Object.defineProperty(bad, field, { enumerable: true, get: trap });
      assert.throws(() => snapshotContext(bad), normalizerError);
    }
    assert.throws(() => snapshotContext(new Proxy(good, traps)), normalizerError);
    for (const version of [0, 2, 1n, '1']) {
      assert.throws(() => snapshotContext({ ...good, requestContextVersion: version }), normalizerError);
    }
    assert.throws(() => snapshotContext(good, undefined), normalizerError);
    const badRaw = copy(raw);
    Object.defineProperty(badRaw.quoteRequestContext, 'digest', { enumerable: true, get: trap });
    assert.throws(() => normalize(badRaw), normalizerError);
    for (const expected of [null, 1n, new String('sha256:' + 'a'.repeat(64)),
      { [Symbol.toPrimitive]: trap }, 'sha256:' + 'A'.repeat(64), 'wrong']) {
      assert.throws(() => normalize(raw, expected), normalizerError);
    }
    assert.throws(() => normalize(raw, undefined, undefined), normalizerError);
    assert.equal(touches, 0);
  });

test('request context and wire snapshots are detached frozen and stable across DATA roundtrips',
  { timeout: 5000 }, async () => {
    const supplied = contextInput(input()), snap = snapshotContext(supplied), before = copy(snap);
    assert.ok(Object.isFrozen(snap) && Object.isFrozen(snap.quoteRequest));
    supplied.quoteRequest.data = OTHER_DATA;
    assert.deepEqual(snap, before);
    const { raw, original } = await observed(), first = normalize(raw, original.digest);
    const second = normalize(copy(raw), original.digest);
    assert.deepEqual(first, second);
    assert.notEqual(first.observation.quoteRequestContext, second.observation.quoteRequestContext);
    assert.ok(Object.isFrozen(second.observation.quoteRequestContext));
    assert.ok(Object.isFrozen(second.observation.quoteRequestContext.quoteRequest));
  });

test('request context admission preserves unsigned and one-attempt busy boundaries',
  { timeout: 5000 }, async () => {
    const f = fixture();
    await assert.rejects(f.collector.collect({ ...input(), phase: 'SIGNED' }), collectorError);
    assert.deepEqual(f.calls, []);
    const held = fixture({ deferFirst: true }), original = input();
    const first = held.collector.collect(original);
    let touched = 0;
    const hostile = new Proxy({}, { get() { touched++; throw new Error('UNREACHED'); } });
    await assert.rejects(held.collector.collect(hostile), e => e.code === 'dynamic_plasma_observation_collector_busy');
    assert.equal(touched, 0); held.release();
    const raw = await first;
    assertBound(normalize(raw), 'SELF_CONSISTENT_DECLARED_REQUEST_ONLY');
    assert.equal(collectorContract.signingAuthorization, 'NOT_ESTABLISHED');
  });
