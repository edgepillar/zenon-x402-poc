import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

// Production collector/core/closed-DP-transport composition with only owned
// synthetic literal responses. No endpoint, RPC owner, SDK or signer runs.
// Reuse32 retained raw-adapter cases and their exported DATA fixtures.
assert.equal(process.argv.length, 2);
const raw = readFileSync(new URL('../src/zenon/dynamic-plasma-observation-collector.js', import.meta.url));
assert.equal(raw.length, 38492);
assert.equal(createHash('sha256').update(raw).digest('hex'),
  '6bb665dd97e4b262941ed11fb7a9fb5c6d7a162004a39fcbfbfa8cd7b3f82d98');
assert.equal(/[^\x00-\x7f]/.test(raw.toString('utf8')) || raw.includes(0), false);
const source = raw.toString('ascii');
const {
  createRequestBoundDynamicPlasmaObservationCollector: create,
  createDynamicPlasmaObservationCollector: legacyCreate,
} = await import('../src/zenon/dynamic-plasma-observation-collector.js');
const { createDynamicPlasmaJsonRpcReadTransport: createWire }
  = await import('../src/zenon/dynamic-plasma-json-rpc-read-transport.js');
const { normalizeDynamicPlasmaObservation: normalize }
  = await import('../src/zenon/dynamic-plasma-observation-normalizer.js');
const { DeclaredDynamicPlasmaUserSendAdapter: Adapter }
  = await import('../src/zenon/declared-dynamic-plasma-user-send-adapter.js');
const { rawAdapterViewFixture: view, rawAdapterMaterialFixture: material }
  = await import('./dynamic-plasma-raw-adapter.behavior.draft.mjs');

const METHODS = ['ledger.getFrontierMomentum', 'ledger.getMomentumsByHeight',
  'embedded.spork.getAll', 'embedded.plasma.getVariables',
  'embedded.plasma.getRequiredPoWForAccountBlock', 'ledger.getFrontierMomentum'];
const clone = value => JSON.parse(JSON.stringify(value)); // Owned DATA only.
function input(value = view()) {
  return new Adapter().createObservationInput(value).collectionInput;
}
function momentum(frontier, value) {
  return {
    version: frontier.version, chainIdentifier: Number(frontier.chainIdentifier),
    hash: frontier.hash, previousHash: value.accepted.extra.zenonChain.genesisMomentumHash,
    height: frontier.height, timestamp: 1234, data: '', content: [],
    changesHash: '66'.repeat(32), publicKey: Buffer.alloc(32, 6).toString('base64'),
    signature: Buffer.alloc(64, 8).toString('base64'), // Fixed DATA, not a signature operation.
    nextFusionPrice: frontier.nextFusionPrice, nextWorkPrice: frontier.nextWorkPrice,
    producer: value.payerAddress,
  };
}
function replies(value, endpoint) {
  const e = value.observation.endpointObservations[endpoint];
  const two = { ...e.beforeFrontier, version: 1, height: 2, hash: '22'.repeat(32),
    nextFusionPrice: 0, nextWorkPrice: 0 };
  return [
    momentum(e.beforeFrontier, value),
    { count: 200, list: [momentum(two, value)] },
    { count: e.sporks.count, list: e.sporks.list.map(s => ({ ...s, description: 'Synthetic.' })) },
    clone(e.plasmaVariables), clone(e.rpcObservation), momentum(e.afterFrontier, value),
  ];
}
function fixture(value = view(), settings = {}) {
  const scripts = [replies(value, 0), replies(value, 1)], positions = [0, 0], calls = [];
  let release;
  const transports = [0, 1].map(endpoint => createWire({ exchange: body => {
    const request = JSON.parse(body), index = positions[endpoint]++ % 6;
    assert.equal(request.method, METHODS[index]);
    calls.push({ endpoint, request });
    if (settings.onFirst && endpoint === 0 && index === 0) settings.onFirst();
    if (settings.throwFirst && index === 0) throw Error('PRIVATE');
    if (settings.badJson && index === 0) return Promise.resolve('not-json');
    const text = JSON.stringify({ jsonrpc: '2.0', id: request.id + (settings.wrongId ? 1 : 0),
      result: scripts[endpoint][index] });
    if (settings.deferred && endpoint === 0 && positions[0] === 1) {
      return new Promise(resolve => { release = () => resolve(text); });
    }
    return Promise.resolve(text);
  } }));
  const options = { transports }, collector = create(options);
  return { collector, options, transports, positions, calls, release: () => release() };
}
function rejected(kind) {
  return error => {
    const Expected = kind === 'busy' ? Error : TypeError;
    assert.ok(error instanceof Expected && Object.isFrozen(error));
    assert.equal(error.code, 'dynamic_plasma_observation_collector_' + kind);
    assert.equal(Object.hasOwn(error, 'cause'), false);
    assert.equal(error.stack.includes('PRIVATE'), false); return true;
  };
}
function frozen(value) {
  if (value !== null && typeof value === 'object') {
    assert.ok(Object.isFrozen(value));
    for (const child of Object.values(value)) frozen(child);
  }
}
function moved(value, advances) {
  const copy = clone(value), price = [1000, 1100, 1210, 1331][advances];
  for (const e of copy.observation.endpointObservations) {
    for (const frontier of [e.beforeFrontier, e.afterFrontier]) {
      frontier.height = 100 + advances; frontier.hash = String(advances + 3).repeat(64);
      frontier.nextFusionPrice = price; frontier.nextWorkPrice = price;
    }
    const q = e.rpcObservation;
    q.requiredFusedPlasma = Math.ceil(q.basePlasma * price / 1000);
    const fused = Math.min(q.availablePlasma, q.requiredFusedPlasma);
    const remaining = Math.max(0, q.basePlasma - Math.floor(fused * 1000 / price));
    q.requiredDifficulty = Math.ceil(remaining * price / 1000) * 1500;
  }
  return copy;
}

test('request-bound collection connects the raw-view request to dual closed transports and expected normalization', { timeout: 5000 }, async () => {
  const value = view(), adapter = new Adapter(), captured = adapter.createObservationInput(value), f = fixture(value);
  assert.deepEqual(f.positions, [0, 0]); assert.deepEqual(Object.keys(f.collector), ['collect']);
  assert.ok(Object.isFrozen(f.collector) && Object.isFrozen(f.collector.collect));
  const result = await f.collector.collect(captured.collectionInput);
  assert.deepEqual(Object.keys(result), ['observation', 'normalization', 'expectedRequestContextDigest']);
  assert.deepEqual(f.positions, [6, 6]);
  assert.deepEqual(f.calls.map(c => c.endpoint), [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]);
  assert.equal(result.expectedRequestContextDigest, captured.expectedRequestContextDigest);
  assert.equal(result.normalization.classification, 'DP_ACTIVE');
  assert.equal(result.normalization.requestContextBinding, 'MATCHES_DECLARED_EXPECTED_REQUEST_CONTEXT');
  assert.deepEqual(result.normalization, normalize(result.observation, captured.expectedRequestContextDigest));
  assert.deepEqual(f.calls.filter(c => c.request.method === METHODS[4]).map(c => c.request.params),
    [[captured.collectionInput.quoteRequest], [captured.collectionInput.quoteRequest]]);
  for (const key of ['chainAuthentication', 'canonicality', 'finality']) assert.equal(result.normalization[key], 'NOT_ESTABLISHED');
  assert.equal(result.normalization.afterSigningAction, 'NONE'); frozen(result);
});

test('collected raw DATA feeds original unsigned stages and bounded price advances without repricing', { timeout: 5000 }, async () => {
  const value = view(), adapter = new Adapter(), f = fixture(value);
  value.observation = (await f.collector.collect(input(value))).observation;
  const quote = await adapter.quote(value), originalQuote = JSON.stringify(quote);
  const work = await adapter.createWorkRequest(value, quote), assembly = await adapter.assemble(value, quote, material());
  const originalBlock = JSON.stringify(assembly.accountBlock);
  assert.equal(work.accountBlock.previousHash, value.accountFrontier.hash);
  assert.deepEqual(await adapter.validateUnsigned(value, quote, assembly.accountBlock), assembly.validation);
  for (const count of [1, 2, 3]) {
    const next = moved(value, count), g = fixture(next);
    next.observation = (await g.collector.collect(input(next))).observation;
    if (count <= 2) await adapter.validateUnsigned(next, quote, assembly.accountBlock);
    else await assert.rejects(adapter.validateUnsigned(next, quote, assembly.accountBlock));
    assert.deepEqual(g.positions, [6, 6]);
  }
  assert.equal(JSON.stringify(quote), originalQuote); assert.equal(JSON.stringify(assembly.accountBlock), originalBlock);
  assert.equal(assembly.accountBlock.signature, ''); assert.equal(assembly.authority, 'NONE');
});

test('request-bound collection captures mutable input before the first synthetic exchange can change it', { timeout: 5000 }, async () => {
  const value = view(), supplied = clone(input(value)), expected = new Adapter().createObservationInput(value);
  const f = fixture(value, { onFirst() {
    supplied.phase = 'SIGNED'; supplied.quoteRequest.data = Buffer.alloc(32, 9).toString('base64');
    supplied.expectedChainProfile.genesisMomentumHash = '77'.repeat(32);
    supplied.compiledSporkIds.dynamicPlasmaId = '88'.repeat(32);
  } });
  const result = await f.collector.collect(supplied);
  assert.equal(result.expectedRequestContextDigest, expected.expectedRequestContextDigest);
  assert.deepEqual(result.observation.expectedChainProfile, expected.collectionInput.expectedChainProfile);
  assert.deepEqual(result.observation.compiledSporkIds, expected.collectionInput.compiledSporkIds);
  assert.deepEqual(result.observation.quoteRequestContext.quoteRequest, expected.collectionInput.quoteRequest);
  assert.equal(result.normalization.classification, 'DP_ACTIVE'); assert.equal(supplied.phase, 'SIGNED');
});

test('request-bound collection refuses legacy modes phases external digests and extra arity before reads', { timeout: 5000 }, async () => {
  const f = fixture(), original = clone(input()), legacy = clone(original), four = clone(original);
  delete legacy.requiredFusedObservationVersion; delete legacy.quoteRequestContextVersion;
  delete four.quoteRequestContextVersion;
  for (const v of [legacy, four, { ...original, phase: 'SIGNED' }, { ...original, quoteRequestContextVersion: 2 },
    { ...original, expectedRequestContextDigest: 'sha256:' + 'a'.repeat(64) }]) {
    await assert.rejects(f.collector.collect(v), rejected('input_rejected'));
  }
  await assert.rejects(f.collector.collect(), rejected('input_rejected'));
  await assert.rejects(f.collector.collect(original, null), rejected('input_rejected'));
  assert.deepEqual(f.positions, [0, 0]);
});

test('request-bound collection and factory reject hostile descriptors proxies and aliased capabilities without hooks', { timeout: 5000 }, async () => {
  const f = fixture(), original = input(); let hooks = 0;
  const hook = () => { hooks += 1; throw Error('HOOK'); };
  const getter = { ...original }; Object.defineProperty(getter, 'quoteRequest', { get: hook, enumerable: true });
  const proxy = new Proxy(original, { get: hook, ownKeys: hook, getPrototypeOf: hook });
  for (const v of [getter, proxy]) await assert.rejects(f.collector.collect(v), rejected('input_rejected'));
  const options = {}; Object.defineProperty(options, 'transports', { get: hook, enumerable: true });
  for (const v of [options, { transports: [f.transports[0], f.transports[0]] },
    { ...f.options, endpoint: 'https://unused.invalid' }, new Proxy(f.options, { ownKeys: hook, getPrototypeOf: hook })]) {
    assert.throws(() => create(v), rejected('configuration_rejected'));
  }
  assert.throws(() => create(), rejected('configuration_rejected'));
  assert.throws(() => create(f.options, null), rejected('configuration_rejected'));
  assert.equal(hooks, 0); assert.deepEqual(f.positions, [0, 0]);
});

test('request-bound collection stays busy through an owned pending read without inspecting reentrant input', { timeout: 5000 }, async () => {
  const f = fixture(view(), { deferred: true }); let hooks = 0;
  const hostile = new Proxy({}, { ownKeys() { hooks += 1; throw Error('HOOK'); },
    getPrototypeOf() { hooks += 1; throw Error('HOOK'); } });
  const pending = f.collector.collect(input());
  let result;
  try {
    assert.deepEqual(f.positions, [1, 0]);
    await assert.rejects(f.collector.collect(hostile), rejected('busy'));
    assert.equal(hooks, 0); assert.deepEqual(f.positions, [1, 0]);
  } finally { f.release(); result = await pending; }
  assert.equal(result.normalization.classification, 'DP_ACTIVE'); assert.deepEqual(f.positions, [6, 6]);
  await f.collector.collect(input()); assert.deepEqual(f.positions, [12, 12]);
  assert.deepEqual(f.calls.filter(c => c.endpoint === 0).map(c => c.request.id), Array.from({ length: 12 }, (_, i) => i + 1));
});

test('explicit later collection gets a newly derived request digest while the original result stays bound', { timeout: 5000 }, async () => {
  const first = view(), next = view({ amount: '9' }), f = fixture(first);
  const a = await f.collector.collect(input(first)), retained = JSON.stringify(a);
  const b = await f.collector.collect(input(next));
  assert.notEqual(a.expectedRequestContextDigest, b.expectedRequestContextDigest);
  assert.equal(b.normalization.requestContextBinding, 'MATCHES_DECLARED_EXPECTED_REQUEST_CONTEXT');
  assert.equal(normalize(b.observation, a.expectedRequestContextDigest).classification, 'MISBOUND_OR_INCOHERENT');
  assert.equal(JSON.stringify(a), retained); assert.deepEqual(f.positions, [12, 12]);
  assert.deepEqual(f.calls.filter(c => c.endpoint === 1).map(c => c.request.id), Array.from({ length: 12 }, (_, i) => i + 1));
});

test('request-bound collection preserves unavailable endpoints after correlation text and exchange failures without retries', { timeout: 5000 }, async () => {
  for (const settings of [{ wrongId: true }, { throwFirst: true }, { badJson: true }]) {
    const f = fixture(view(), settings), result = await f.collector.collect(input());
    assert.deepEqual(f.positions, [1, 1]); assert.equal(f.calls.length, 2);
    assert.deepEqual(result.observation.endpointObservations, [null, null]);
    assert.equal(result.normalization.classification, 'UNAVAILABLE');
    assert.equal(result.normalization.observation, null);
    assert.equal(result.normalization.afterSigningAction, 'NONE');
  }
});

test('request-bound collection retains pre-DP and incoherent classifications without turning them into active evidence', { timeout: 5000 }, async () => {
  for (const kind of ['pre', 'frontier', 'total']) {
    const value = view();
    for (const e of value.observation.endpointObservations) {
      if (kind === 'pre') {
        for (const x of [e.beforeFrontier, e.afterFrontier]) {
          x.version = 1; x.nextFusionPrice = 0; x.nextWorkPrice = 0;
        }
        e.sporks.list[1].activated = false; e.sporks.list[1].enforcementHeight = 0;
      } else if (kind === 'frontier') e.afterFrontier.hash = '99'.repeat(32);
      else e.rpcObservation.requiredFusedPlasma += 1;
    }
    const f = fixture(value), result = await f.collector.collect(input(value));
    assert.equal(result.normalization.classification, kind === 'pre' ? 'PRE_DP' : 'MISBOUND_OR_INCOHERENT');
    assert.deepEqual(f.positions, [6, 6]); assert.equal(result.normalization.afterSigningAction, 'NONE');
    await assert.rejects(new Adapter().quote({ ...value, observation: result.observation }));
  }
});

test('request-bound composition captures transport references and preserves the original raw collector contract', { timeout: 5000 }, async () => {
  const value = view(), f = fixture(value), originalTransports = [...f.transports]; let hooks = 0;
  f.options.transports = [Object.freeze({ callRead: Object.freeze(() => { hooks += 1; throw Error('HOOK'); }) })];
  const result = await f.collector.collect(input(value));
  const legacy = legacyCreate({ transports: originalTransports }), oldRaw = await legacy.collect(input(value));
  assert.deepEqual(Object.keys(legacy), ['collect']); assert.deepEqual(result.observation, oldRaw);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result); frozen(result);
  assert.equal(hooks, 0); assert.deepEqual(f.positions, [12, 12]);
  for (const key of ['quote', 'sign', 'publish', 'close', 'reset', 'READY']) assert.equal(f.collector[key], undefined);
});

test('request-bound composition reuses the internal Promise shield and inherited-then refusal without hook execution', { timeout: 5000 }, async () => {
  let hooks = 0, second = 0;
  const first = Object.freeze({ callRead: Object.freeze(() => {
    Object.defineProperty(Object.prototype, 'then', { configurable: true, get() { hooks += 1; throw Error('HOOK'); } });
    return Promise.resolve('null');
  }) });
  const other = Object.freeze({ callRead: Object.freeze(() => { second += 1; return Promise.resolve('null'); }) });
  assert.equal(Object.getOwnPropertyDescriptor(Object.prototype, 'then'), undefined);
  const collector = create({ transports: [first, other] }); let pending;
  try { pending = collector.collect(input()); }
  finally { delete Object.prototype.then; }
  await assert.rejects(pending, rejected('configuration_rejected'));
  assert.equal(hooks, 0); assert.equal(second, 0);
  assert.equal(Object.getOwnPropertyDescriptor(Object.prototype, 'then'), undefined);
});

test('request-bound composition preserves every original collector byte and adds no native owner or signing path', { timeout: 5000 }, async () => {
  const marker = source.indexOf('\n/**\n * Explicit schema3 producer/consumer composition');
  assert.equal(marker, 35157);
  assert.equal(createHash('sha256').update(source.slice(0, marker)).digest('hex'),
    'd614506b0054a87fe553cc79812b7e5355bea924bd3654902026ece58e796eb8');
  const added = source.slice(marker);
  assert.match(added, /shieldInternalPromise\(sourceCollect\(captured\.collectionInput\)\)/);
  assert.match(added, /NORMALIZE_REQUEST_BOUND_COLLECTION\(/);
  assert.doesNotMatch(added, /node:(?:fs|https?|tls|dns|child_process|worker_threads)|fetch\s*\(|setTimeout\s*\(|generateKeyPair|randomBytes|crypto\.sign|crypto\.verify|prepareBlock|publishRawTransaction|this\.collect/);
  const value = view(); value.observation = null; value.policy = null; value.runtimeContextDigest = null;
  const f = fixture(), result = await f.collector.collect(input(value));
  assert.equal(result.normalization.classification, 'DP_ACTIVE');
  assert.equal(result.normalization.chainAuthentication, 'NOT_ESTABLISHED');
});
