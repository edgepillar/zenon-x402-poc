import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { types as utilTypes } from 'node:util';
import { runInNewContext } from 'node:vm';
import {
  DYNAMIC_PLASMA_OBSERVATION_COLLECTOR_CONTRACT,
  createDynamicPlasmaObservationCollector,
} from '../src/zenon/dynamic-plasma-observation-collector.js';
import {
  normalizeDynamicPlasmaObservation,
} from '../src/zenon/dynamic-plasma-observation-normalizer.js';

// Synthetic, non-wallet fixture addresses and identities only.
const CHAIN = '73404';
const GENESIS = '11'.repeat(32);
const HEIGHT_TWO = '22'.repeat(32);
const FRONTIER = '33'.repeat(32);
const LIBP2P = '01'.repeat(32);
const DYNAMIC = '02'.repeat(32);
const MAX_UINT64 = '18446744073709551615';
const MAX_SAFE = '9007199254740991';
const BECH32_ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const FRONTIER_METHOD = 'ledger.getFrontierMomentum';
const HEIGHT_METHOD = 'ledger.getMomentumsByHeight';
const SPORK_METHOD = 'embedded.spork.getAll';
const VARIABLES_METHOD = 'embedded.plasma.getVariables';
const QUOTE_METHOD = 'embedded.plasma.getRequiredPoWForAccountBlock';

// Independent fixture encoder. Production code must validate without an SDK.
function fixtureAddress(bytes, hrp = 'z', checksumConstant = 1) {
  const words = [];
  let bits = 0;
  let accumulator = 0;
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      words.push((accumulator >>> bits) & 31);
    }
  }
  if (bits) words.push((accumulator << (5 - bits)) & 31);
  const expanded = [
    ...Array.from(hrp, character => character.charCodeAt(0) >>> 5),
    0,
    ...Array.from(hrp, character => character.charCodeAt(0) & 31),
  ];
  let checksum = 1;
  for (const word of [...expanded, ...words, 0, 0, 0, 0, 0, 0]) {
    const top = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ word;
    for (const [index, generator] of [
      0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3,
    ].entries()) {
      if ((top >>> index) & 1) checksum ^= generator;
    }
  }
  checksum = (checksum ^ checksumConstant) >>> 0;
  return `${hrp}1${words.map(word => BECH32_ALPHABET[word]).join('')}${
    Array.from({ length: 6 }, (_, index) =>
      BECH32_ALPHABET[(checksum >>> (5 * (5 - index))) & 31]).join('')}`;
}

const ADDRESS = fixtureAddress([0, ...Array(19).fill(17)]);
const TO_ADDRESS = fixtureAddress([0, ...Array(19).fill(34)]);
const DATA = Buffer.alloc(32, 7).toString('base64');

function profile(chainIdentifier = CHAIN) {
  return { version: 1, chainIdentifier, genesisMomentumHash: GENESIS };
}

function compiledIds() {
  return { dynamicPlasmaId: DYNAMIC, libp2pId: LIBP2P };
}

function quoteRequest(overrides = {}) {
  return { address: ADDRESS, blockType: 2, toAddress: TO_ADDRESS, data: DATA, ...overrides };
}

function rawMomentum(overrides = {}) {
  return {
    version: 2,
    chainIdentifier: Number(CHAIN),
    hash: FRONTIER,
    previousHash: '44'.repeat(32),
    height: 42,
    timestamp: 1234,
    data: '',
    content: [],
    changesHash: '55'.repeat(32),
    publicKey: Buffer.alloc(32, 6).toString('base64'),
    signature: Buffer.alloc(64, 8).toString('base64'),
    nextFusionPrice: 1200,
    nextWorkPrice: 1100,
    producer: ADDRESS,
    ...overrides,
  };
}

function heightTwo(overrides = {}) {
  return rawMomentum({
    version: 1,
    height: 2,
    hash: HEIGHT_TWO,
    previousHash: GENESIS,
    nextFusionPrice: 0,
    nextWorkPrice: 0,
    ...overrides,
  });
}

function spork(overrides = {}) {
  return {
    id: DYNAMIC,
    name: 'dynamic-plasma',
    description: 'Synthetic fixture.',
    activated: true,
    enforcementHeight: 10,
    ...overrides,
  };
}

function sporkList(length = 2) {
  return Array.from({ length }, (_, index) => {
    if (index === 0) return spork({ id: LIBP2P, name: 'libp2p', activated: false });
    if (index === 1) return spork();
    return spork({ id: index.toString(16).padStart(64, '0'), name: `fixture-${index}` });
  });
}

function variables(overrides = {}) {
  return {
    MaxBasePlasmaInMomentum: 4200000,
    FusedPlasmaTarget: 1050000,
    PowPlasmaTarget: 1050000,
    MaxPriceChangePercent: 10,
    PriceChangeDenominator: 20,
    ...overrides,
  };
}

function quote(overrides = {}) {
  return { availablePlasma: 10000, basePlasma: 21000, requiredDifficulty: 20901000, ...overrides };
}

function fixtureReplies(list = sporkList()) {
  const replies = [rawMomentum(), { count: 42, list: [heightTwo()] }];
  const pages = Math.max(1, Math.ceil(list.length / 128));
  for (let page = 0; page < pages; page += 1) {
    replies.push({ count: list.length, list: list.slice(page * 128, (page + 1) * 128) });
  }
  replies.push(variables(), quote(), rawMomentum());
  return replies;
}

function json(value) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function numberText(value, field, lexeme) {
  return json(value).replace(new RegExp(`("${field}":)[0-9]+`), `$1${lexeme}`);
}

function allFrozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  assert.equal(utilTypes.isProxy(value), false);
  for (const key of Reflect.ownKeys(value)) {
    assert.equal(typeof key, 'string');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    assert.ok(Object.hasOwn(descriptor, 'value'));
    allFrozen(descriptor.value);
  }
}

function transport(replies, label, log = [], override) {
  let index = 0;
  const callRead = Object.freeze(function(request) {
    assert.equal(this, undefined);
    assert.deepEqual(Object.keys(request), ['method', 'params']);
    allFrozen(request);
    log.push({ label, request });
    const position = index++;
    if (override) return override(request, position, replies);
    assert.ok(position < replies.length, 'no extra calls are allowed');
    return Promise.resolve(json(replies[position]));
  });
  return Object.freeze({ callRead });
}

test('collector contract is exported as deeply frozen data', () => {
  allFrozen(DYNAMIC_PLASMA_OBSERVATION_COLLECTOR_CONTRACT);
  assert.equal(DYNAMIC_PLASMA_OBSERVATION_COLLECTOR_CONTRACT.schemaVersion, 1);
});

function collectInput(overrides = {}) {
  return {
    phase: 'UNSIGNED',
    expectedChainProfile: profile(),
    compiledSporkIds: compiledIds(),
    quoteRequest: quoteRequest(),
    ...overrides,
  };
}

function harness({ a = fixtureReplies(), b = fixtureReplies(), overrideA, overrideB } = {}) {
  const log = [];
  const first = transport(a, 'A', log, overrideA);
  const second = transport(b, 'B', log, overrideB);
  const options = { transports: [first, second] };
  const collector = createDynamicPlasmaObservationCollector(options);
  return { collector, log, options, first, second };
}

function expectedRequests(listLength = 2) {
  return [
    { method: FRONTIER_METHOD, params: [] },
    { method: HEIGHT_METHOD, params: [2, 1] },
    ...Array.from({ length: Math.max(1, Math.ceil(listLength / 128)) }, (_, index) =>
      ({ method: SPORK_METHOD, params: [index, 128] })),
    { method: VARIABLES_METHOD, params: [] },
    { method: QUOTE_METHOD, params: [quoteRequest()] },
    { method: FRONTIER_METHOD, params: [] },
  ];
}

function assertFixedError(error, kind) {
  assert.equal(Object.getPrototypeOf(error), kind === 'busy' ? Error.prototype : TypeError.prototype);
  assert.equal(error.code, `dynamic_plasma_observation_collector_${kind}`);
  assert.equal(error.message, `Dynamic Plasma observation collector ${kind.replaceAll('_', ' ')}`);
  assert.equal(Object.hasOwn(error, 'cause'), false);
  assert.deepEqual(Object.keys(error), ['code']);
  assert.equal(Object.isFrozen(error), true);
  assert.equal(error.stack, `${kind === 'busy' ? 'Error' : 'TypeError'}: ${error.message}`);
  return true;
}

async function firstUnavailable(replies, input = collectInput()) {
  const h = harness({ a: replies });
  const result = await h.collector.collect(input);
  assert.equal(result.endpointObservations[0], null);
  assert.notEqual(result.endpointObservations[1], null);
  allFrozen(result);
  return { ...h, result };
}

function changesToReplies(index, candidate) {
  const replies = fixtureReplies();
  replies[index] = candidate;
  return replies;
}

test('import and construction perform zero calls and expose only a frozen collect method', async () => {
  const h = harness();
  assert.equal(h.log.length, 0);
  assert.deepEqual(Object.keys(h.collector), ['collect']);
  assert.equal(Object.getPrototypeOf(h.collector), Object.prototype);
  assert.equal(Object.isFrozen(h.collector), true);
  assert.equal(Object.isFrozen(h.collector.collect), true);
  const imported = await import('../src/zenon/dynamic-plasma-observation-collector.js');
  assert.deepEqual(Object.keys(imported).sort(), [
    'DYNAMIC_PLASMA_OBSERVATION_COLLECTOR_CONTRACT',
    'createDynamicPlasmaObservationCollector',
  ]);
  assert.equal(h.log.length, 0);
});

test('exact frozen requests run A entirely before B with the same detached quote twice', async () => {
  const h = harness();
  const candidate = collectInput();
  const original = structuredClone(candidate);
  const result = await h.collector.collect(candidate);
  assert.deepEqual(h.log, ['A', 'B'].flatMap(label =>
    expectedRequests().map(request => ({ label, request }))));
  assert.deepEqual(candidate, original);
  assert.deepEqual(Object.keys(result), ['expectedChainProfile', 'compiledSporkIds', 'endpointObservations']);
  assert.deepEqual(Object.keys(result.endpointObservations[0]), [
    'beforeFrontier', 'profileEvidence', 'sporks', 'plasmaVariables', 'rpcObservation', 'afterFrontier',
  ]);
  assert.equal(result.endpointObservations.length, 2);
  assert.equal(result.endpointObservations[0].beforeFrontier.chainIdentifier, CHAIN);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.notEqual(result.expectedChainProfile, candidate.expectedChainProfile);
  assert.notEqual(result.compiledSporkIds, candidate.compiledSporkIds);
  assert.notEqual(h.log[4].request.params[0], candidate.quoteRequest);
  assert.deepEqual(h.log[4].request.params, h.log[10].request.params);
  allFrozen(result);
  assert.equal(normalizeDynamicPlasmaObservation(result).classification, 'DP_ACTIVE');
});

test('configuration rejects malformed containers, aliased transports and functions before calls', () => {
  const h = harness();
  const frozenFn = Object.freeze(function() { throw new Error('must not execute'); });
  const one = Object.freeze({ callRead: frozenFn });
  const accessor = {};
  Object.defineProperty(accessor, 'transports', { enumerable: true, get() { assert.fail('getter ran'); } });
  const badArray = [h.first, h.second];
  Object.defineProperty(badArray, '0', { get() { assert.fail('array getter ran'); }, enumerable: true });
  const callGetter = Object.freeze(Object.defineProperty({}, 'callRead', {
    enumerable: true, get() { assert.fail('transport getter ran'); },
  }));
  const configurations = [
    null, undefined, [], Object.create(null), {}, { transports: [h.first] },
    { transports: [h.first, h.second, h.first] }, { transports: [h.first, h.first] },
    { transports: [one, Object.freeze({ callRead: frozenFn })] },
    { transports: [h.first, { callRead: Object.freeze(() => Promise.resolve('')) }] },
    { transports: [h.first, Object.freeze({ callRead: () => Promise.resolve('') })] },
    { transports: [h.first, Object.freeze({ callRead: frozenFn, extra: true })] },
    { transports: [h.first, Object.freeze({ callRead: 'not callable' })] },
    { transports: [h.first, callGetter] },
    { transports: [h.first, Object.freeze(Object.assign(Object.create(null), { callRead: frozenFn }))] },
    { transports: [h.first, h.second], extra: true },
    { transports: Object.assign([h.first, h.second], { extra: true }) },
    { transports: [h.first, ,] }, { transports: badArray }, accessor,
    Object.assign({ transports: [h.first, h.second] }, { [Symbol('extra')]: true }),
  ];
  for (const options of configurations) {
    assert.throws(() => createDynamicPlasmaObservationCollector(options),
      error => assertFixedError(error, 'configuration_rejected'));
  }
  assert.equal(h.log.length, 0);
});

test('configuration and collection reject proxies without invoking traps or accessors', async () => {
  let traps = 0;
  const trap = () => { traps += 1; throw new Error('trap'); };
  const handler = { get: trap, ownKeys: trap, getPrototypeOf: trap, getOwnPropertyDescriptor: trap };
  const h = harness();
  for (const options of [
    new Proxy(h.options, handler),
    { transports: new Proxy(h.options.transports, handler) },
    { transports: [new Proxy(h.first, handler), h.second] },
    { transports: [Object.freeze({ callRead: new Proxy(h.first.callRead, handler) }), h.second] },
  ]) {
    assert.throws(() => createDynamicPlasmaObservationCollector(options),
      error => assertFixedError(error, 'configuration_rejected'));
  }
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  for (const candidate of [
    new Proxy(collectInput(), handler), revoked.proxy,
    collectInput({ expectedChainProfile: new Proxy(profile(), handler) }),
    collectInput({ compiledSporkIds: new Proxy(compiledIds(), handler) }),
    collectInput({ quoteRequest: new Proxy(quoteRequest(), handler) }),
  ]) {
    await assert.rejects(h.collector.collect(candidate), error => assertFixedError(error, 'input_rejected'));
  }
  assert.equal(traps, 0);
  assert.equal(h.log.length, 0);
});

test('UNSIGNED and exact input schema are mandatory before the first call', async () => {
  const h = harness();
  const missingPhase = collectInput();
  delete missingPhase.phase;
  const getter = collectInput();
  Object.defineProperty(getter, 'quoteRequest', { enumerable: true, get() { assert.fail('getter ran'); } });
  for (const candidate of [
    null, {}, [], Object.create(null), missingPhase, getter,
    collectInput({ phase: 'SIGNED' }), collectInput({ phase: undefined }),
    { ...collectInput(), extra: true },
    { ...collectInput(), [Symbol('extra')]: true },
    collectInput({ expectedChainProfile: { ...profile(), version: 2 } }),
    collectInput({ expectedChainProfile: { ...profile(), chainIdentifier: '073404' } }),
    collectInput({ expectedChainProfile: { ...profile(), chainIdentifier: '0' } }),
    collectInput({ expectedChainProfile: { ...profile(), chainIdentifier: '18446744073709551616' } }),
    collectInput({ expectedChainProfile: { ...profile(), genesisMomentumHash: GENESIS.toUpperCase() + 'x' } }),
    collectInput({ compiledSporkIds: { ...compiledIds(), dynamicPlasmaId: LIBP2P } }),
    collectInput({ compiledSporkIds: { ...compiledIds(), libp2pId: 'bad' } }),
    collectInput({ quoteRequest: { ...quoteRequest(), extra: true } }),
  ]) {
    await assert.rejects(h.collector.collect(candidate), error => assertFixedError(error, 'input_rejected'));
  }
  assert.equal(h.log.length, 0);
});

test('quote address accepts only standard canonical nonzero user Bech32', async () => {
  const badAddresses = [
    '', ADDRESS.toUpperCase(), `Z${ADDRESS.slice(1)}`, `${ADDRESS.slice(0, -1)}!`,
    `${ADDRESS.slice(0, -1)}${ADDRESS.endsWith('q') ? 'p' : 'q'}`, `${ADDRESS}q`,
    fixtureAddress(Array(20).fill(0)),
    fixtureAddress([1, ...Array(19).fill(17)]),
    fixtureAddress([2, ...Array(19).fill(17)]),
    fixtureAddress([0, ...Array(19).fill(17)], 'a'),
    fixtureAddress([0, ...Array(19).fill(17)], 'z', 0x2bc830a3),
    fixtureAddress([0, ...Array(18).fill(17)]),
    fixtureAddress([0, ...Array(20).fill(17)]),
    0, null, new String(ADDRESS),
  ];
  for (const field of ['address', 'toAddress']) {
    for (const address of badAddresses) {
      const h = harness();
      await assert.rejects(h.collector.collect(collectInput({ quoteRequest: quoteRequest({ [field]: address }) })),
        error => assertFixedError(error, 'input_rejected'));
      assert.equal(h.log.length, 0);
    }
  }
  assert.equal(ADDRESS.length, 40);
  const h = harness();
  const result = await h.collector.collect(collectInput());
  assert.notEqual(result.endpointObservations[0], null);
});

test('quote block type and 32-byte canonical standard base64 data are exact', async () => {
  const mutations = [
    ...[0, 1, 3, '2', null, 2n, -0].map(blockType => ({ blockType })),
    ...['', DATA.slice(0, -1), `${DATA}\n`, ` ${DATA}`, DATA.replace(/.$/, '_'),
      Buffer.alloc(31).toString('base64'), Buffer.alloc(33).toString('base64'),
      `${DATA.slice(0, -2)}d=`, new String(DATA), null,
    ].map(data => ({ data })),
  ];
  for (const mutation of mutations) {
    const h = harness();
    await assert.rejects(h.collector.collect(collectInput({ quoteRequest: quoteRequest(mutation) })),
      error => assertFixedError(error, 'input_rejected'));
    assert.equal(h.log.length, 0);
  }
});

for (const length of [0, 1, 127, 128, 129, 1024]) {
  test(`spork pagination is complete and bounded at count ${length}`, async () => {
    const replies = fixtureReplies(sporkList(length));
    const h = harness({ a: replies, b: replies });
    const result = await h.collector.collect(collectInput());
    for (const endpoint of result.endpointObservations) {
      assert.equal(endpoint.sporks.count, length);
      assert.equal(endpoint.sporks.list.length, length);
      assert.ok(endpoint.sporks.list.every(entry => !Object.hasOwn(entry, 'description')));
    }
    assert.deepEqual(h.log, ['A', 'B'].flatMap(label =>
      expectedRequests(length).map(request => ({ label, request }))));
  });
}

test('spork cap, count drift, missing/long pages and duplicate IDs fail the endpoint without repair', async () => {
  const cases = [];
  const overCap = fixtureReplies(sporkList(1025));
  cases.push(overCap);
  for (const count of [4294967295, 4294967296, -1, '2']) {
    cases.push(changesToReplies(2, { count, list: sporkList() }));
  }
  for (const mutate of [
    pages => { pages[3].count = 130; },
    pages => { pages[2].list.pop(); },
    pages => { pages[3].list = []; },
    pages => { pages[3].list.push(spork({ id: 'ff'.repeat(32) })); },
    pages => { pages[3].list[0] = pages[2].list[0]; },
    pages => { pages[2].list[1].id = pages[2].list[0].id; },
  ]) {
    const replies = fixtureReplies(sporkList(129));
    mutate(replies);
    cases.push(replies);
  }
  cases.push(changesToReplies(2, { count: 0, list: sporkList(1) }));
  for (const replies of cases) {
    const h = await firstUnavailable(replies);
    const aCalls = h.log.filter(entry => entry.label === 'A');
    assert.ok(aCalls.length <= 4);
    assert.ok(aCalls.every(entry => ![VARIABLES_METHOD, QUOTE_METHOD].includes(entry.request.method)));
  }
});

test('raw momentum schema rejects every missing key and all unknown fields at each momentum position', async () => {
  for (const position of [0, 1, 5]) {
    for (const field of Object.keys(rawMomentum())) {
      const raw = position === 1 ? heightTwo() : rawMomentum();
      delete raw[field];
      const replacement = position === 1 ? { count: 42, list: [raw] } : raw;
      await firstUnavailable(changesToReplies(position, replacement));
    }
    const raw = position === 1 ? heightTwo({ unknown: true }) : rawMomentum({ unknown: true });
    await firstUnavailable(changesToReplies(position, position === 1 ? { count: 42, list: [raw] } : raw));
  }
});

test('known unused momentum fields are validated then dropped', async () => {
  const content = [{ address: fixtureAddress([1, ...Array(19).fill(23)]), hash: 'aa'.repeat(32), height: 3 }];
  const replies = fixtureReplies();
  replies[0] = rawMomentum({ content });
  const h = harness({ a: replies });
  const result = await h.collector.collect(collectInput());
  assert.deepEqual(Object.keys(result.endpointObservations[0].beforeFrontier), [
    'chainIdentifier', 'height', 'hash', 'version', 'nextFusionPrice', 'nextWorkPrice',
  ]);
  for (const mutation of [
    { data: null }, { data: 'AA==' }, { content: null }, { content: {} },
    { publicKey: null }, { publicKey: '' }, { publicKey: DATA.slice(0, -1) },
    { signature: null }, { signature: DATA }, { producer: fixtureAddress(Array(20).fill(0)) },
    { producer: fixtureAddress([1, ...Array(19).fill(17)]) },
    { previousHash: 'bad' }, { changesHash: 'bad' },
    { content: [{ ...content[0], extra: true }] },
    { content: [{ ...content[0], address: 'bad' }] },
    { content: [{ ...content[0], hash: 'bad' }] },
    { content: [{ ...content[0], height: '3' }] },
    { content: [null] },
  ]) {
    await firstUnavailable(changesToReplies(0, rawMomentum(mutation)));
  }
});

test('height-two wrapper has exact count/list and fixed height/version semantics', async () => {
  for (const candidate of [
    { list: [heightTwo()] }, { count: 42 }, { count: 1, list: [heightTwo()] },
    { count: 42, list: [] }, { count: 42, list: [heightTwo(), heightTwo()] },
    { count: 42, list: [heightTwo({ height: 3 })] },
    { count: 42, list: [heightTwo({ version: 2 })] },
    { count: 42, list: [heightTwo()], extra: true },
    { count: '42', list: [heightTwo()] },
  ]) {
    await firstUnavailable(changesToReplies(1, candidate));
  }
  const h = harness({ a: changesToReplies(1, { count: 999, list: [heightTwo()] }) });
  assert.notEqual((await h.collector.collect(collectInput())).endpointObservations[0], null);
});

test('exact spork, PascalCase variable and quote schemas reject missing, extra, and mistyped fields', async () => {
  for (const [position, original] of [[2, { count: 2, list: sporkList() }], [3, variables()], [4, quote()]]) {
    for (const field of Object.keys(original)) {
      const raw = structuredClone(original);
      delete raw[field];
      await firstUnavailable(changesToReplies(position, raw));
    }
    await firstUnavailable(changesToReplies(position, { ...original, extra: true }));
  }
  for (const field of Object.keys(spork())) {
    const list = sporkList();
    delete list[1][field];
    await firstUnavailable(changesToReplies(2, { count: 2, list }));
  }
  for (const mutation of [
    { id: 'bad' }, { name: 'four' }, { name: 'a'.repeat(41) },
    { name: 'é'.repeat(21) }, { description: 'é'.repeat(201) },
    { description: null }, { activated: 1 }, { enforcementHeight: '1' }, { extra: true },
  ]) {
    await firstUnavailable(changesToReplies(2, { count: 1, list: [spork(mutation)] }));
  }
  for (const entry of [spork({ name: 'é'.repeat(20), description: 'é'.repeat(200) }),
    spork({ name: 'abcde', description: '' })]) {
    const h = harness({ a: changesToReplies(2, { count: 1, list: [entry] }) });
    assert.notEqual((await h.collector.collect(collectInput())).endpointObservations[0], null);
  }
  const lowercase = Object.fromEntries(Object.entries(variables()).map(([key, value]) =>
    [key[0].toLowerCase() + key.slice(1), value]));
  await firstUnavailable(changesToReplies(3, lowercase));
  await firstUnavailable(changesToReplies(4, quote({ basePlasma: 0 })));
});

test('factory and collect reject extra arguments and frozen configuration is detached', async () => {
  const h = harness();
  assert.throws(() => createDynamicPlasmaObservationCollector(h.options, true),
    error => assertFixedError(error, 'configuration_rejected'));
  await assert.rejects(h.collector.collect(collectInput(), true),
    error => assertFixedError(error, 'input_rejected'));
  h.options.transports[0] = null;
  h.options.transports = null;
  assert.notEqual((await h.collector.collect(collectInput())).endpointObservations[0], null);
});

for (const chain of [MAX_SAFE, '9007199254740992', MAX_UINT64]) {
  test(`chain ID is preserved losslessly at the ${chain.length}-digit boundary ${chain === MAX_UINT64 ? 'uint64' : chain === MAX_SAFE ? 'safe' : 'above-safe'}`, async () => {
    const replies = fixtureReplies().map((reply, index) =>
      [0, 1, 5].includes(index) ? numberText(reply, 'chainIdentifier', chain) : reply);
    const h = harness({ a: replies, b: replies });
    const result = await h.collector.collect(collectInput({ expectedChainProfile: profile(chain) }));
    for (const endpoint of result.endpointObservations) {
      assert.equal(endpoint.beforeFrontier.chainIdentifier, chain);
      assert.equal(endpoint.profileEvidence.heightTwo.chainIdentifier, chain);
      assert.equal(endpoint.afterFrontier.chainIdentifier, chain);
    }
    assert.equal(normalizeDynamicPlasmaObservation(result).classification, 'DP_ACTIVE');
  });
}

test('all numeric lexemes first obey canonical unsigned integer grammar', async () => {
  for (const lexeme of [
    '-0', '-1', '+1', '073404', '00', '73404.0', '73404e0', '7.3404e4',
    '1E0', '1e+0', '1e-0', 'NaN', 'Infinity', '999999999999999999999',
    '"73404"', 'true', 'null', '{}', '[]',
  ]) {
    await firstUnavailable(changesToReplies(0, numberText(rawMomentum(), 'chainIdentifier', lexeme)));
  }
  for (const lexeme of ['0', '18446744073709551616']) {
    await firstUnavailable(changesToReplies(0, numberText(rawMomentum(), 'chainIdentifier', lexeme)));
  }
});

test('projected uint64 fields never round above the safe-number contract', async () => {
  const fields = [
    ...['height', 'version', 'nextFusionPrice', 'nextWorkPrice'].map(field => [0, field, rawMomentum()]),
    [1, 'count', { count: 42, list: [heightTwo()] }],
    [2, 'enforcementHeight', { count: 2, list: sporkList() }],
    ...['MaxBasePlasmaInMomentum', 'FusedPlasmaTarget', 'PowPlasmaTarget'].map(field => [3, field, variables()]),
    ...Object.keys(quote()).map(field => [4, field, quote()]),
  ];
  for (const [position, field, raw] of fields) {
    for (const lexeme of ['9007199254740992', MAX_UINT64, '18446744073709551616']) {
      await firstUnavailable(changesToReplies(position, numberText(raw, field, lexeme)));
    }
    const h = harness({ a: changesToReplies(position, numberText(raw, field, MAX_SAFE)) });
    assert.notEqual((await h.collector.collect(collectInput())).endpointObservations[0], null,
      `safe structural integer accepted for ${field}; normalizer owns coherence`);
  }
  await firstUnavailable(changesToReplies(0, rawMomentum({ height: 0 })));
  await firstUnavailable(changesToReplies(4, quote({ basePlasma: 0 })));
});

test('unused timestamp and content heights accept full uint64 but reject overflow', async () => {
  for (const field of ['timestamp', 'height']) {
    const raw = field === 'timestamp' ? rawMomentum() : rawMomentum({
      content: [{ address: ADDRESS, hash: 'aa'.repeat(32), height: 3 }],
    });
    const pattern = field === 'timestamp' ? '"timestamp":1234' : '"height":3}';
    for (const lexeme of ['0', '9007199254740992', MAX_UINT64]) {
      const text = JSON.stringify(raw).replace(pattern, `"${field}":${lexeme}${field === 'height' ? '}' : ''}`);
      const h = harness({ a: changesToReplies(0, text) });
      assert.notEqual((await h.collector.collect(collectInput())).endpointObservations[0], null);
    }
    const text = JSON.stringify(raw).replace(pattern, `"${field}":18446744073709551616${field === 'height' ? '}' : ''}`);
    await firstUnavailable(changesToReplies(0, text));
  }
});

test('uint32 spork count and uint8 variable fields retain their raw type limits', async () => {
  for (const field of ['MaxPriceChangePercent', 'PriceChangeDenominator']) {
    for (const value of [0, 100, 255]) {
      const h = harness({ a: changesToReplies(3, variables({ [field]: value })) });
      assert.notEqual((await h.collector.collect(collectInput())).endpointObservations[0], null);
    }
    for (const value of [256, -1, '255', null]) {
      await firstUnavailable(changesToReplies(3, variables({ [field]: value })));
    }
  }
  for (const value of [4294967295, 4294967296]) {
    const h = await firstUnavailable(changesToReplies(2, { count: value, list: [] }));
    assert.equal(h.log.filter(entry => entry.label === 'A').length, 3);
  }
});

test('result-only strict JSON rejects envelopes, duplicates, dangerous keys, controls and trailing material', async () => {
  const raw = JSON.stringify(rawMomentum());
  const candidateTexts = [
    '', ' ', 'null', '[]', 'false', '{}', raw + 'x', raw + '{}', raw + '\u0000', '\ufeff' + raw,
    raw.replace('"version":2', '"version":2,"version":2'),
    raw.replace('"version":2', '"version":2,"ver\\u0073ion":2'),
    ...['__proto__', 'constructor', 'prototype'].map(key => raw.replace('{', `{"${key}":{},`)),
    raw.replace('{', '{"\\u005f_proto__":{},'),
    raw.replace('"data":""', '"data":"\n"'),
    raw.replace('"data":""', '"data":"\\x20"'),
    raw.replace('"data":""', '"data":"\\uD800"'),
    raw.replace('"data":""', '"data":"\\uDC00"'),
    raw.replace('"data":""', '"data":"\ud800"'),
    raw.replace('"data":""', '"data":"\udc00"'),
    raw.replace('"data":""', '"data":"\\uD800x"'),
    raw.replace('"data":""', '"data":"\\uD800\\u0020"'),
    raw.replace('"data":""', '"data":"\\u12"'),
    raw.replace('"version":2,', '"version":2,,'),
    raw.replace(/}$/, ',}'),
    JSON.stringify({ jsonrpc: '2.0', id: 1, result: rawMomentum() }),
  ];
  for (const text of candidateTexts) await firstUnavailable(changesToReplies(0, text));
  const h = harness({ a: changesToReplies(0, ` \n\t\r${raw}\r\n `) });
  assert.notEqual((await h.collector.collect(collectInput())).endpointObservations[0], null);
});

test('valid escaped JSON keys and Unicode scalar pairs are decoded before exact validation', async () => {
  const replies = fixtureReplies();
  replies[0] = JSON.stringify(rawMomentum()).replace('"version"', '"ver\\u0073ion"');
  replies[2] = JSON.stringify({ count: 1, list: [spork({ description: '😀' })] })
    .replace('😀', '\\uD83D\\uDE00');
  const h = harness({ a: replies });
  assert.notEqual((await h.collector.collect(collectInput())).endpointObservations[0], null);
});

test('strict parser result-byte and aggregate-member limits have usable exact boundaries', async () => {
  const raw = JSON.stringify(rawMomentum());
  const atByteCap = `${raw}${' '.repeat(1048576 - Buffer.byteLength(raw, 'utf8'))}`;
  const h = harness({ a: changesToReplies(0, atByteCap) });
  assert.notEqual((await h.collector.collect(collectInput())).endpointObservations[0], null);
  await firstUnavailable(changesToReplies(0, `${atByteCap} `));
  // 14 root members + 1020 array elements + 3060 header members = 4094.
  const content = Array.from({ length: 1020 }, () => ({ address: ADDRESS, hash: GENESIS, height: 1 }));
  const valid = harness({ a: changesToReplies(0, rawMomentum({ content })) });
  assert.notEqual((await valid.collector.collect(collectInput())).endpointObservations[0], null);
  content.push({ address: ADDRESS, hash: GENESIS, height: 1 });
  await firstUnavailable(changesToReplies(0, rawMomentum({ content })));
});

test('parser rejects budget attacks at depth, container, member, node, key and string boundaries', async () => {
  const texts = [
    ...[16, 17].map(depth => '['.repeat(depth) + '0' + ']'.repeat(depth)),
    ...[4096, 4097].map(size => `[${Array(size - 1).fill('[]').join(',')}]`),
    ...[4096, 4097].map(size => `[${Array(size).fill('0').join(',')}]`),
    ...[16384, 16385].map(size => `[${Array(size).fill('0').join(',')}]`),
    ...[128, 129].map(size => `{"${'k'.repeat(size)}":0}`),
    ...[65536, 65537].map(size => `"${'a'.repeat(size)}"`),
    ...[32768, 32769].map(size => `"${'é'.repeat(size)}"`),
  ];
  // Non-schema JSON is unavailable even at parser limits. Value/container caps
  // are defense in depth: the aggregate-member cap may reject these first.
  for (const text of texts) await firstUnavailable(changesToReplies(0, text));
});

test('operational failures stop only that endpoint and never inspect a rejection or throw reason', async () => {
  let traps = 0;
  const hostile = new Proxy({}, {
    get() { traps += 1; throw new Error('must not read'); },
    ownKeys() { traps += 1; throw new Error('must not read'); },
    getPrototypeOf() { traps += 1; throw new Error('must not read'); },
  });
  for (const behavior of [
    () => { throw hostile; }, () => Promise.reject(hostile),
    () => Promise.resolve(undefined), () => Promise.resolve(42),
    () => Promise.resolve(new String('{}')), () => Promise.resolve({}),
  ]) {
    for (const failedIndex of [0, 1, 2, 3, 4, 5]) {
      const h = harness({ overrideA: (_request, index, replies) =>
        index === failedIndex ? behavior() : Promise.resolve(json(replies[index])) });
      const result = await h.collector.collect(collectInput());
      assert.equal(result.endpointObservations[0], null);
      assert.notEqual(result.endpointObservations[1], null);
      assert.equal(h.log.filter(entry => entry.label === 'A').length, failedIndex + 1);
      assert.equal(h.log.filter(entry => entry.label === 'B').length, 6);
    }
  }
  assert.equal(traps, 0);
});

test('non-native, thenable, proxy, subclass and decorated promises are rejected without assimilation', async () => {
  let traps = 0;
  const trap = () => { traps += 1; throw new Error('must not invoke'); };
  const thenable = Object.defineProperty({}, 'then', { get: trap });
  const ownThen = Object.defineProperty(Promise.resolve('{}'), 'then', { get: trap });
  const ownConstructor = Object.defineProperty(Promise.resolve('{}'), 'constructor', { get: trap });
  class ChildPromise extends Promise {}
  const revoked = Proxy.revocable(Promise.resolve('{}'), {});
  revoked.revoke();
  for (const returned of [
    undefined, null, '{}', thenable, ownThen, ownConstructor,
    Object.assign(Promise.resolve('{}'), { metadata: true }),
    Object.create(Promise.prototype), new ChildPromise(resolve => resolve('{}')),
    runInNewContext('Promise.resolve("{}")'),
    new Proxy(Promise.resolve('{}'), { get: trap, getPrototypeOf: trap, ownKeys: trap }),
    revoked.proxy,
  ]) {
    const h = harness({ overrideA: () => returned });
    const result = await h.collector.collect(collectInput());
    assert.equal(result.endpointObservations[0], null);
    assert.notEqual(result.endpointObservations[1], null);
    assert.equal(h.log.filter(entry => entry.label === 'A').length, 1);
  }
  assert.equal(traps, 0);
});

test('instrumented native promises and unread own symbols cannot alter the captured then path', async () => {
  for (const decoration of ['runtime-only', 'data-symbol', 'getter-symbol']) {
    let getters = 0;
    const h = harness({ overrideA: (_request, index, replies) => {
      const returned = Promise.resolve(json(replies[index]));
      if (decoration === 'data-symbol') returned[Symbol('fixture')] = 'opaque';
      if (decoration === 'getter-symbol') Object.defineProperty(returned, Symbol('fixture'), {
        get() { getters += 1; throw new Error('symbol must not be read'); },
      });
      assert.equal(utilTypes.isPromise(returned), true);
      assert.deepEqual(Object.getOwnPropertyNames(returned), []);
      return returned;
    } });
    const result = await h.collector.collect(collectInput());
    assert.ok(result.endpointObservations.every(endpoint => endpoint !== null));
    assert.equal(getters, 0);
    assert.equal(h.log.length, 12);
  }
});

test('poisoned native Promise constructor/species descriptors are rejected without getter execution', async () => {
  for (const [object, key] of [[Promise.prototype, 'constructor'], [Promise, Symbol.species]]) {
    const original = Object.getOwnPropertyDescriptor(object, key);
    let traps = 0;
    const returned = Promise.resolve(json(rawMomentum()));
    const h = harness({ overrideA: () => {
      Object.defineProperty(object, key, { configurable: true, get() { traps += 1; return Promise; } });
      return returned;
    } });
    let pending;
    try {
      pending = h.collector.collect(collectInput());
    } finally {
      Object.defineProperty(object, key, original);
    }
    const result = await pending;
    assert.equal(result.endpointObservations[0], null);
    assert.notEqual(result.endpointObservations[1], null);
    assert.equal(traps, 0);
  }
});

test('captured data-validation and parser intrinsics survive transport-side replacement', async () => {
  const originals = [
    [Object, 'freeze'], [Object, 'getOwnPropertyDescriptor'], [Object, 'getPrototypeOf'],
    [Object, 'defineProperty'], [Object, 'hasOwn'], [Reflect, 'ownKeys'],
    [Number, 'isSafeInteger'], [JSON, 'parse'], [Array, 'isArray'],
  ].map(([object, key]) => [object, key, Object.getOwnPropertyDescriptor(object, key)]);
  const define = Object.defineProperty;
  let replaced = false;
  const replies = fixtureReplies().map(json);
  const first = Object.freeze({ callRead: Object.freeze(function() {
    if (!replaced) {
      replaced = true;
      for (const [object, key] of originals) define(object, key, {
        value() { throw new Error('replaced intrinsic must not execute'); }, configurable: true, writable: true,
      });
    }
    return Promise.resolve(replies.shift());
  }) });
  const secondReplies = fixtureReplies().map(json);
  const second = Object.freeze({ callRead: Object.freeze(function() {
    return Promise.resolve(secondReplies.shift());
  }) });
  const collector = createDynamicPlasmaObservationCollector({ transports: [first, second] });
  const input = collectInput();
  let result;
  try {
    result = await collector.collect(input);
  } finally {
    for (const [object, key, descriptor] of originals) define(object, key, descriptor);
  }
  assert.ok(result.endpointObservations.every(endpoint => endpoint !== null));
});

test('factory rejects an inherited then descriptor without reading its getter', () => {
  const h = harness();
  const original = Object.getOwnPropertyDescriptor(Object.prototype, 'then');
  let getters = 0;
  let rejected;
  try {
    Object.defineProperty(Object.prototype, 'then', {
      configurable: true,
      get() { getters += 1; throw new Error('inherited getter must not run'); },
    });
    try { createDynamicPlasmaObservationCollector(h.options); } catch (error) { rejected = error; }
  } finally {
    if (original === undefined) delete Object.prototype.then;
    else Object.defineProperty(Object.prototype, 'then', original);
  }
  assert.equal(getters, 0);
  assertFixedError(rejected, 'configuration_rejected');
  assert.equal(h.log.length, 0);
});

test('collection rejects inherited then drift before inspecting input or invoking transports', async () => {
  const h = harness();
  const original = Object.getOwnPropertyDescriptor(Object.prototype, 'then');
  let getters = 0;
  let rejected;
  try {
    Object.defineProperty(Object.prototype, 'then', {
      configurable: true,
      get() { getters += 1; throw new Error('inherited getter must not run'); },
    });
    try { await h.collector.collect(null); } catch (error) { rejected = error; }
  } finally {
    if (original === undefined) delete Object.prototype.then;
    else Object.defineProperty(Object.prototype, 'then', original);
  }
  assert.equal(getters, 0);
  assertFixedError(rejected, 'configuration_rejected');
  assert.equal(h.log.length, 0);
});

test('initially present inherited then is captured even if removed before factory use', async () => {
  const original = Object.getOwnPropertyDescriptor(Object.prototype, 'then');
  let imported;
  try {
    Object.defineProperty(Object.prototype, 'then', { value: undefined, configurable: true });
    imported = await import('../src/zenon/dynamic-plasma-observation-collector.js?initial-then-regression');
  } finally {
    if (original === undefined) delete Object.prototype.then;
    else Object.defineProperty(Object.prototype, 'then', original);
  }
  const h = harness();
  assert.throws(() => imported.createDynamicPlasmaObservationCollector(h.options),
    error => assertFixedError(error, 'configuration_rejected'));
  assert.equal(h.log.length, 0);
});

test('transport-installed inherited then never runs, never escapes, prevents B, and clears busy', async () => {
  const original = Object.getOwnPropertyDescriptor(Object.prototype, 'then');
  const marker = Object.freeze(Object.create(null));
  let getters = 0;
  let rejected;
  const h = harness({ overrideA: (_request, index, replies) => {
    if (index === 0) {
      Object.defineProperty(Object.prototype, 'then', {
        configurable: true,
        get() { getters += 1; throw marker; },
      });
      return Promise.resolve(json(replies[0]));
    }
    return Promise.resolve(json(replies[(index - 1) % replies.length]));
  } });
  try {
    try { await h.collector.collect(collectInput()); } catch (error) { rejected = error; }
  } finally {
    if (original === undefined) delete Object.prototype.then;
    else Object.defineProperty(Object.prototype, 'then', original);
  }
  assert.equal(getters, 0);
  assert.notEqual(rejected, marker);
  assertFixedError(rejected, 'configuration_rejected');
  assert.equal(h.log.length, 1);
  assert.equal(h.log[0].label, 'A');
  const next = await h.collector.collect(collectInput());
  assert.ok(next.endpointObservations.every(endpoint => endpoint !== null));
});

test('native RegExp exec is captured so replacement cannot approve malformed hashes', async () => {
  const original = Object.getOwnPropertyDescriptor(RegExp.prototype, 'exec');
  let callbacks = 0;
  const replies = fixtureReplies();
  replies[0] = rawMomentum({ hash: 'not-a-hash' });
  const h = harness({ a: replies, overrideA: (_request, index, values) => {
    if (index === 0) Object.defineProperty(RegExp.prototype, 'exec', {
      configurable: true,
      writable: true,
      value(value) { callbacks += 1; return [value]; },
    });
    return Promise.resolve(json(values[index]));
  } });
  let result;
  try {
    result = await h.collector.collect(collectInput());
  } finally {
    Object.defineProperty(RegExp.prototype, 'exec', original);
  }
  assert.equal(callbacks, 0);
  assert.equal(result.endpointObservations[0], null);
  assert.notEqual(result.endpointObservations[1], null);
  assert.equal(normalizeDynamicPlasmaObservation(result).classification, 'UNAVAILABLE');
});

test('rejected decorated native promises are drained without reading own then or metadata getters', async () => {
  const originalThen = Promise.prototype.then;
  let unhandled = 0;
  let getters = 0;
  const pending = [];
  const onUnhandled = () => { unhandled += 1; };
  process.on('unhandledRejection', onUnhandled);
  try {
    for (const decoration of ['metadata', 'metadata-getter', 'then-getter', 'safe-constructor']) {
      const h = harness({ overrideA: () => {
        const returned = Promise.reject('synthetic opaque rejection');
        pending.push(returned);
        if (decoration === 'metadata') Object.defineProperty(returned, 'metadata', { value: true });
        if (decoration === 'safe-constructor') Object.defineProperty(returned, 'constructor', { value: Promise });
        if (decoration === 'metadata-getter' || decoration === 'then-getter') {
          Object.defineProperty(returned, decoration === 'then-getter' ? 'then' : 'metadata', {
            get() { getters += 1; throw new Error('own getter must not run'); },
          });
        }
        return returned;
      } });
      const result = await h.collector.collect(collectInput());
      assert.equal(result.endpointObservations[0], null);
      assert.notEqual(result.endpointObservations[1], null);
    }
    await new Promise(resolve => setImmediate(resolve));
  } finally {
    for (const promise of pending) Reflect.apply(originalThen, promise, [undefined, () => undefined]);
    process.removeListener('unhandledRejection', onUnhandled);
  }
  assert.equal(getters, 0);
  assert.equal(unhandled, 0);
});

test('unsafe promise constructor requires owner-prehandled rejection and is never invoked', async () => {
  const originalThen = Promise.prototype.then;
  let getters = 0;
  let inspected = 0;
  const reason = new Proxy({}, { get() { inspected += 1; throw new Error('reason must not be read'); } });
  const h = harness({ overrideA: () => {
    const returned = Promise.reject(reason);
    Reflect.apply(originalThen, returned, [undefined, () => undefined]);
    Object.defineProperty(returned, 'constructor', {
      get() { getters += 1; throw new Error('constructor must not run'); },
    });
    return returned;
  } });
  const result = await h.collector.collect(collectInput());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(getters, 0);
  assert.equal(inspected, 0);
  assert.equal(result.endpointObservations[0], null);
  assert.notEqual(result.endpointObservations[1], null);
  assert.equal(DYNAMIC_PLASMA_OBSERVATION_COLLECTOR_CONTRACT.promiseRejectionHandling.unsafeDrain,
    'TRANSPORT_MUST_PREHANDLE_REJECTION');
  assert.equal(DYNAMIC_PLASMA_OBSERVATION_COLLECTOR_CONTRACT.promiseRejectionHandling.ownConstructorForDrain,
    'ABSENT_OR_OWN_DATA_CAPTURED_PROMISE');
});

test('forged array prototypes fail the actual Array brand gate before any capability invocation', () => {
  const h = harness();
  const forged = Object.create(Array.prototype);
  Object.defineProperties(forged, {
    length: { value: 2 },
    0: { value: h.first, enumerable: true },
    1: { value: h.second, enumerable: true },
  });
  assert.equal(Array.isArray(forged), false);
  assert.throws(() => createDynamicPlasmaObservationCollector({ transports: forged }),
    error => assertFixedError(error, 'configuration_rejected'));
  assert.equal(h.log.length, 0);
});

test('reentrant and overlapping collects reject BUSY without touching the new input and can be reused', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let h;
  let reentrant;
  let traps = 0;
  const hostileInput = new Proxy({}, { ownKeys() { traps += 1; throw new Error('must not inspect'); } });
  h = harness({ overrideA: (_request, index, replies) => {
    if (index === 0) {
      reentrant = h.collector.collect(hostileInput);
      reentrant.catch(() => {});
      return pending;
    }
    return Promise.resolve(json(replies[index % replies.length]));
  }, overrideB: (_request, index, replies) => Promise.resolve(json(replies[index % replies.length])) });
  const first = h.collector.collect(collectInput());
  await assert.rejects(h.collector.collect(hostileInput), error => assertFixedError(error, 'busy'));
  await assert.rejects(reentrant, error => assertFixedError(error, 'busy'));
  assert.equal(h.log.length, 1);
  assert.equal(traps, 0);
  release(json(rawMomentum()));
  assert.notEqual((await first).endpointObservations[0], null);
  assert.notEqual((await h.collector.collect(collectInput())).endpointObservations[0], null);
});

test('a caller-owned pending transport keeps the instance busy until externally settled', async () => {
  let rejectPending;
  const pending = new Promise((_resolve, reject) => { rejectPending = reject; });
  const h = harness({ overrideA: () => pending });
  const collecting = h.collector.collect(collectInput());
  await assert.rejects(h.collector.collect(null), error => assertFixedError(error, 'busy'));
  assert.equal(h.log.length, 1);
  rejectPending(new Error('caller-owned timeout marker'));
  assert.equal((await collecting).endpointObservations[0], null);
  await assert.rejects(h.collector.collect(null), error => assertFixedError(error, 'input_rejected'));
});

test('collector is reusable after endpoint failure and does not retry within the failed collection', async () => {
  const h = harness({
    overrideA: (_request, index, replies) => {
      if (index === 0) throw new Error('synthetic first collection failure');
      return Promise.resolve(json(replies[(index - 1) % replies.length]));
    },
    overrideB: (_request, index, replies) => Promise.resolve(json(replies[index % replies.length])),
  });
  const first = await h.collector.collect(collectInput());
  assert.equal(first.endpointObservations[0], null);
  assert.notEqual(first.endpointObservations[1], null);
  assert.equal(h.log.length, 7);
  const second = await h.collector.collect(collectInput());
  assert.ok(second.endpointObservations.every(endpoint => endpoint !== null));
  assert.equal(h.log.length, 19);
});

test('two failures remain two null endpoints and collection never returns errors as evidence', async () => {
  const h = harness({ overrideA: () => Promise.reject('private marker'), overrideB: () => Promise.resolve('null') });
  const result = await h.collector.collect(collectInput());
  assert.deepEqual(result.endpointObservations, [null, null]);
  assert.equal(h.log.length, 2);
  assert.equal(JSON.stringify(result).includes('private marker'), false);
  assert.equal(normalizeDynamicPlasmaObservation(result).reason, 'ENDPOINT_DATA_UNAVAILABLE');
});

test('input snapshots precede any transport execution and outputs contain only detached data', async () => {
  const candidate = collectInput();
  const original = structuredClone(candidate);
  const h = harness({ overrideA: (_request, index, replies) => {
    if (index === 0) {
      candidate.expectedChainProfile.chainIdentifier = '999';
      candidate.compiledSporkIds.dynamicPlasmaId = 'ff'.repeat(32);
      candidate.quoteRequest.data = Buffer.alloc(32, 9).toString('base64');
      candidate.phase = 'SIGNED';
    }
    return Promise.resolve(json(replies[index]));
  } });
  const result = await h.collector.collect(candidate);
  assert.deepEqual(result.expectedChainProfile, original.expectedChainProfile);
  assert.deepEqual(result.compiledSporkIds, original.compiledSporkIds);
  assert.deepEqual(h.log[4].request.params[0], original.quoteRequest);
  assert.equal(h.log[4].request.params[0], h.log[10].request.params[0]);
  allFrozen(result);
  const encoded = JSON.stringify(result);
  for (const marker of ['callRead', 'transport', 'quoteRequest', 'credential', 'stack', 'UNSIGNED', ADDRESS, DATA]) {
    assert.equal(encoded.includes(marker), false);
  }
  assert.throws(() => { result.endpointObservations[0].beforeFrontier.height = 9; }, TypeError);
});

test('valid disagreement and stale/cross-wired evidence reaches the existing normalizer unchanged', async () => {
  const cases = [
    { a: changesToReplies(5, rawMomentum({ height: 43 })), reason: 'FRONTIER_BINDING_MISMATCH' },
    { b: changesToReplies(4, quote({ requiredDifficulty: 20901001 })), reason: 'ENDPOINT_OBSERVATION_MISMATCH' },
    { input: collectInput({ expectedChainProfile: profile('73405') }), reason: 'PROFILE_GENESIS_MISMATCH' },
    { both: changesToReplies(1, { count: 42, list: [heightTwo({ previousHash: '77'.repeat(32) })] }),
      reason: 'PROFILE_GENESIS_MISMATCH' },
    { both: changesToReplies(2, { count: 2, list: [spork({ id: LIBP2P }), spork({ name: 'libp2p' })] }),
      reason: 'SPORK_BINDING_MISMATCH' },
    { both: changesToReplies(3, variables({ MaxPriceChangePercent: 0 })), reason: 'PLASMA_VARIABLES_INCOHERENT' },
    { both: changesToReplies(3, variables({ FusedPlasmaTarget: 4199999 })), reason: 'PLASMA_VARIABLES_INCOHERENT' },
    { both: changesToReplies(2, { count: 2, list: sporkList().map(item => ({ ...item, activated: false })) }),
      reason: 'FRONTIER_SPORK_STATE_INCOHERENT' },
  ];
  for (const candidate of cases) {
    const h = harness({ a: candidate.both ?? candidate.a, b: candidate.both ?? candidate.b });
    const result = await h.collector.collect(candidate.input ?? collectInput());
    assert.ok(result.endpointObservations.every(endpoint => endpoint !== null));
    const normalized = normalizeDynamicPlasmaObservation(result);
    assert.equal(normalized.reason, candidate.reason);
    assert.equal(normalized.classification, 'MISBOUND_OR_INCOHERENT');
  }
  const legacy = fixtureReplies();
  legacy[0] = rawMomentum({ version: 1, nextFusionPrice: 0, nextWorkPrice: 0 });
  legacy[5] = { ...legacy[0] };
  legacy[2].list[1].activated = false;
  legacy[4] = quote({ requiredDifficulty: 16500000 });
  const h = harness({ a: legacy, b: legacy });
  const result = normalizeDynamicPlasmaObservation(await h.collector.collect(collectInput()));
  assert.equal(result.classification, 'PRE_DP');
});

test('different full-range chain identifiers never compare equal after projection', async () => {
  const withChain = chain => fixtureReplies().map((reply, index) =>
    [0, 1, 5].includes(index) ? numberText(reply, 'chainIdentifier', chain) : reply);
  const h = harness({ a: withChain(MAX_UINT64), b: withChain('18446744073709551614') });
  const output = await h.collector.collect(collectInput({ expectedChainProfile: profile(MAX_UINT64) }));
  assert.equal(normalizeDynamicPlasmaObservation(output).reason, 'ENDPOINT_OBSERVATION_MISMATCH');
});

test('collector output is not a persisted quote commitment or signing authorization', async () => {
  const h = harness();
  const output = await h.collector.collect(collectInput());
  const normalized = normalizeDynamicPlasmaObservation(output);
  assert.equal(normalized.chainAuthentication, 'NOT_ESTABLISHED');
  assert.equal(normalized.canonicality, 'NOT_ESTABLISHED');
  assert.equal(normalized.finality, 'NOT_ESTABLISHED');
  assert.equal(normalized.afterSigningAction, 'NONE');
  assert.equal(Object.hasOwn(output, 'quoteRequest'), false);
  assert.equal(Object.hasOwn(output, 'quoteCommitment'), false);
  assert.equal(DYNAMIC_PLASMA_OBSERVATION_COLLECTOR_CONTRACT.quoteRequestCommitment, 'NOT_PERSISTED');
  assert.equal(DYNAMIC_PLASMA_OBSERVATION_COLLECTOR_CONTRACT.signingAuthorization, 'NOT_ESTABLISHED');
  assert.equal(DYNAMIC_PLASMA_OBSERVATION_COLLECTOR_CONTRACT.duplicateSporkIds, 'ENDPOINT_UNAVAILABLE');
});

test('source boundary contains no imported transport or execution authority and never calls the normalizer', () => {
  const source = readFileSync(new URL('../src/zenon/dynamic-plasma-observation-collector.js', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/(?:from\s+|import\s*\()['"]([^'"]+)['"]/g)].map(match => match[1]);
  assert.deepEqual(imports, ['node:util']);
  assert.doesNotMatch(source, /\b(?:fetch|WebSocket|XMLHttpRequest|setTimeout|setInterval|AbortSignal)\b/);
  assert.doesNotMatch(source, /\b(?:process|console)\s*\.|Math\.random|node:(?:http|https|net|tls|fs|crypto)/);
  assert.doesNotMatch(source, /\b(?:normalizeDynamicPlasmaObservation|classifyDynamicPlasmaCompatibility)\s*\(/);
  assert.doesNotMatch(source, /\b(?:publishRawTransaction|prepareBlock|computePoW|signTransaction)\s*\(/);
  assert.doesNotMatch(source, /JSON\.parse\s*\(|Promise\.resolve\s*\(/);
});
