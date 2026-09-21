import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { types as utilTypes } from 'node:util';
import { runInNewContext, runInThisContext } from 'node:vm';
import { createDynamicPlasmaJsonRpcReadTransport } from '../src/zenon/dynamic-plasma-json-rpc-read-transport.js';
import { createDynamicPlasmaObservationCollector } from '../src/zenon/dynamic-plasma-observation-collector.js';
import { normalizeDynamicPlasmaObservation } from '../src/zenon/dynamic-plasma-observation-normalizer.js';

const FRONTIER = 'ledger.getFrontierMomentum';
const HEIGHT = 'ledger.getMomentumsByHeight';
const SPORK = 'embedded.spork.getAll';
const VARIABLES = 'embedded.plasma.getVariables';
const QUOTE = 'embedded.plasma.getRequiredPoWForAccountBlock';
const METHODS = [FRONTIER, HEIGHT, SPORK, VARIABLES, QUOTE];
const MAX_UINT64 = '18446744073709551615';
const MAX_RESPONSE_BYTES = 1048576 + 4096;
const GENESIS = '11'.repeat(32);
const LIBP2P = '01'.repeat(32);
const DYNAMIC = '02'.repeat(32);
const DATA = Buffer.alloc(32, 7).toString('base64');

// Test-only synchronous module evaluation avoids a loader's promise machinery
// during deliberately poisoned-intrinsic admission probes. The exhaustion
// probe changes exactly one asserted private initializer, never the API/limit.
function evaluateAdapter(nearExhaustion = false) {
  let source = readFileSync(new URL('../src/zenon/dynamic-plasma-json-rpc-read-transport.js', import.meta.url), 'utf8');
  const importLine = "import { types as utilTypes } from 'node:util';";
  const exportLine = 'export function createDynamicPlasmaJsonRpcReadTransport';
  assert.equal(source.split(importLine).length, 2);
  assert.equal(source.split(exportLine).length, 2);
  source = source.replace(importLine, '').replace(exportLine, 'function createDynamicPlasmaJsonRpcReadTransport');
  if (nearExhaustion) {
    const initializer = 'let nextId = 1;';
    assert.equal(source.split(initializer).length, 2);
    source = source.replace(initializer, 'let nextId = MAX_REQUEST_ID - 1;');
  }
  return runInThisContext(`(function(utilTypes) { ${source}\nreturn createDynamicPlasmaJsonRpcReadTransport; })`)(utilTypes);
}

function restoreDescriptor(object, key, descriptor) {
  if (descriptor === undefined) delete object[key];
  else Object.defineProperty(object, key, descriptor);
}

function shieldTestAwait(promise) {
  // Shield only a test await after the normal contract tests inspected the
  // untouched surface. The adapter itself must never decorate its output.
  Object.defineProperty(promise, 'constructor', { value: Promise });
  return promise;
}

// Deterministic synthetic addresses, unrelated to wallet material.
function fixtureAddress(bytes, hrp = 'z', constant = 1) {
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const words = [];
  let accumulator = 0;
  let bits = 0;
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) { bits -= 5; words.push((accumulator >>> bits) & 31); }
  }
  if (bits) words.push((accumulator << (5 - bits)) & 31);
  let checksum = 1;
  const hrpWords = [...Array.from(hrp, character => character.charCodeAt(0) >>> 5), 0,
    ...Array.from(hrp, character => character.charCodeAt(0) & 31)];
  for (const word of [...hrpWords, ...words, 0, 0, 0, 0, 0, 0]) {
    const top = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ word;
    for (const [index, generator] of [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3].entries()) {
      if ((top >>> index) & 1) checksum ^= generator;
    }
  }
  checksum = (checksum ^ constant) >>> 0;
  return hrp + '1' + words.map(word => alphabet[word]).join('') +
    Array.from({ length: 6 }, (_, index) => alphabet[(checksum >>> (5 * (5 - index))) & 31]).join('');
}

const ADDRESS = fixtureAddress([0, ...Array(19).fill(17)]);
const RECIPIENT = fixtureAddress([0, ...Array(19).fill(34)]);

function frozen(value) {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) frozen(value[key]);
    Object.freeze(value);
  }
  return value;
}

function quoteRequest(overrides = {}) {
  return { address: ADDRESS, blockType: 2, toAddress: RECIPIENT, data: DATA, ...overrides };
}

function request(method = FRONTIER, params) {
  const defaults = { [FRONTIER]: [], [HEIGHT]: [2, 1], [SPORK]: [0, 128], [VARIABLES]: [], [QUOTE]: [quoteRequest()] };
  return frozen({ method, params: params ?? defaults[method] ?? [] });
}

function response(id, result = '{}') {
  return `{"jsonrpc":"2.0","id":${id},"result":${result}}`;
}

function canonical(id, candidate) {
  return JSON.stringify({ jsonrpc: '2.0', id, method: candidate.method, params: candidate.params });
}

function assertFixedError(error, kind) {
  const typed = kind === 'configuration_rejected' || kind === 'input_rejected';
  assert.equal(Object.getPrototypeOf(error), typed ? TypeError.prototype : Error.prototype);
  assert.equal(error.code, `dynamic_plasma_json_rpc_read_transport_${kind}`);
  assert.equal(error.message, `Dynamic Plasma JSON-RPC read transport ${kind.replaceAll('_', ' ')}`);
  assert.equal(error.stack, `${typed ? 'TypeError' : 'Error'}: ${error.message}`);
  assert.deepEqual(Object.keys(error), ['code']);
  assert.equal(Object.isFrozen(error), true);
  assert.equal(Object.hasOwn(error, 'cause'), false);
  return true;
}

function harness(behavior = body => Promise.resolve(response(JSON.parse(body).id))) {
  const calls = [];
  const exchange = Object.freeze(function(body) {
    assert.equal(this, undefined);
    assert.equal(arguments.length, 1);
    assert.equal(typeof body, 'string');
    calls.push(body);
    return behavior(body, calls.length);
  });
  return { calls, exchange, transport: createDynamicPlasmaJsonRpcReadTransport({ exchange }) };
}

async function unavailable(raw) {
  const h = harness(() => Promise.resolve(raw));
  await assert.rejects(h.transport.callRead(request()), error => assertFixedError(error, 'unavailable'));
  assert.equal(h.calls.length, 1);
}

function momentum(overrides = {}) {
  return {
    version: 2, chainIdentifier: 73404, hash: '33'.repeat(32), previousHash: '44'.repeat(32),
    height: 42, timestamp: 1234, data: '', content: [], changesHash: '55'.repeat(32),
    publicKey: Buffer.alloc(32, 6).toString('base64'), signature: Buffer.alloc(64, 8).toString('base64'),
    nextFusionPrice: 1200, nextWorkPrice: 1100, producer: ADDRESS, ...overrides,
  };
}

function sporks(length = 2) {
  return Array.from({ length }, (_, index) => ({
    id: index === 0 ? LIBP2P : index === 1 ? DYNAMIC : index.toString(16).padStart(64, '0'),
    name: index === 0 ? 'libp2p' : index === 1 ? 'dynamic-plasma' : `fixture-${index}`,
    description: 'Synthetic fixture.', activated: index !== 0, enforcementHeight: 10,
  }));
}

function replies(length = 2) {
  const list = sporks(length);
  return [
    momentum(),
    { count: 42, list: [momentum({ version: 1, height: 2, hash: '22'.repeat(32), previousHash: GENESIS,
      nextFusionPrice: 0, nextWorkPrice: 0 })] },
    ...Array.from({ length: Math.max(1, Math.ceil(length / 128)) }, (_, page) =>
      ({ count: length, list: list.slice(page * 128, (page + 1) * 128) })),
    { MaxBasePlasmaInMomentum: 4200000, FusedPlasmaTarget: 1050000, PowPlasmaTarget: 1050000,
      MaxPriceChangePercent: 10, PriceChangeDenominator: 20 },
    { availablePlasma: 10000, basePlasma: 21000, requiredDifficulty: 20901000 },
    momentum(),
  ];
}

function input(chainIdentifier = '73404') {
  return {
    phase: 'UNSIGNED',
    expectedChainProfile: { version: 1, chainIdentifier, genesisMomentumHash: GENESIS },
    compiledSporkIds: { dynamicPlasmaId: DYNAMIC, libp2pId: LIBP2P },
    quoteRequest: quoteRequest(),
  };
}

function composition({ first = replies(), second = replies(), failFirst } = {}) {
  const log = [];
  function endpoint(values, label) {
    return createDynamicPlasmaJsonRpcReadTransport({ exchange: Object.freeze(function(body) {
      const parsed = JSON.parse(body);
      log.push({ label, ...parsed });
      if (label === 'A' && failFirst) return failFirst(parsed);
      const raw = values[parsed.id - 1];
      assert.notEqual(raw, undefined, 'no extra or repeated request');
      return Promise.resolve(response(parsed.id, typeof raw === 'string' ? raw : JSON.stringify(raw)));
    }) });
  }
  const collector = createDynamicPlasmaObservationCollector({ transports: [endpoint(first, 'A'), endpoint(second, 'B')] });
  return { log, collector };
}

test('import and factory are dormant and expose exactly one frozen non-proxy callable', async () => {
  const h = harness();
  const module = await import('../src/zenon/dynamic-plasma-json-rpc-read-transport.js');
  assert.deepEqual(Object.keys(module), ['createDynamicPlasmaJsonRpcReadTransport']);
  assert.deepEqual(Object.keys(h.transport), ['callRead']);
  assert.equal(Object.getPrototypeOf(h.transport), Object.prototype);
  assert.equal(Object.isFrozen(h.transport), true);
  assert.equal(Object.isFrozen(h.transport.callRead), true);
  assert.equal(utilTypes.isProxy(h.transport.callRead), false);
  assert.equal(h.calls.length, 0);
});

test('canonical requests preserve parameter order and IDs advance only on exchange handoff', async () => {
  const h = harness();
  await assert.rejects(h.transport.callRead(request('unknown')), error => assertFixedError(error, 'input_rejected'));
  for (const [index, method] of METHODS.entries()) {
    const candidate = request(method);
    const result = h.transport.callRead(candidate);
    assert.equal(utilTypes.isPromise(result), true);
    assert.equal(Object.getPrototypeOf(result), Promise.prototype);
    assert.deepEqual(Object.getOwnPropertyNames(result), []);
    assert.equal(await result, '{}');
    assert.equal(h.calls[index], canonical(index + 1, candidate));
  }
  const failed = harness((_body, index) => {
    if (index === 1) throw new Error('synthetic failure');
    return Promise.resolve(response(index));
  });
  await assert.rejects(failed.transport.callRead(request()), error => assertFixedError(error, 'unavailable'));
  await failed.transport.callRead(request());
  assert.deepEqual(failed.calls.map(body => JSON.parse(body).id), [1, 2]);
});

test('factory snapshots one exact data capability and rejects proxies/accessors without invocation', () => {
  let traps = 0;
  const trap = () => { traps += 1; throw new Error('trap'); };
  const h = harness();
  const proxy = new Proxy(h.exchange, { get: trap, getPrototypeOf: trap, ownKeys: trap, apply: trap });
  const getter = Object.defineProperty({}, 'exchange', { enumerable: true, get: trap });
  for (const options of [null, [], {}, Object.create(null), { exchange: null }, getter,
    { exchange: proxy }, new Proxy({ exchange: h.exchange }, { get: trap, ownKeys: trap }),
    { exchange: h.exchange, extra: true }, { exchange: h.exchange, [Symbol('extra')]: true }]) {
    assert.throws(() => createDynamicPlasmaJsonRpcReadTransport(options), error => assertFixedError(error, 'configuration_rejected'));
  }
  assert.throws(() => createDynamicPlasmaJsonRpcReadTransport({ exchange: h.exchange }, true),
    error => assertFixedError(error, 'configuration_rejected'));
  assert.equal(traps, 0);
  assert.equal(h.calls.length, 0);
});

test('factory detaches its capability and frozen requests serialize in contract order', async () => {
  let calls = 0;
  const bodies = [];
  const options = { exchange(body) {
    bodies.push(body);
    calls += 1;
    return Promise.resolve(response(calls));
  } };
  const retained = options.exchange;
  const transport = createDynamicPlasmaJsonRpcReadTransport(options);
  options.exchange = () => { throw new Error('replacement must not run'); };
  const reversed = frozen({ params: [{ data: DATA, toAddress: RECIPIENT, blockType: 2, address: ADDRESS }], method: QUOTE });
  assert.equal(await transport.callRead(reversed), '{}');
  assert.equal(bodies[0], canonical(1, request(QUOTE)));
  assert.equal(calls, 1);
  assert.notEqual(options.exchange, retained);
  assert.equal(Object.isFrozen(options), false);
  assert.throws(() => { transport.callRead = () => {}; }, TypeError);
  assert.throws(() => { transport.callRead.metadata = true; }, TypeError);
  assert.throws(() => { reversed.params[0].data = ''; }, TypeError);
});

test('request containers must be exact, actually frozen, genuine arrays and getter/proxy free', async () => {
  const h = harness();
  let traps = 0;
  const trap = () => { traps += 1; throw new Error('trap'); };
  const getter = Object.freeze(Object.defineProperty({ params: Object.freeze([]) }, 'method', { enumerable: true, get: trap }));
  const forged = Object.create(Array.prototype);
  Object.defineProperty(forged, 'length', { value: 0 });
  Object.freeze(forged);
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  const options = [null, [], {}, request('unknown'), { method: FRONTIER, params: [] },
    Object.freeze({ method: FRONTIER, params: [] }), Object.freeze({ method: FRONTIER, params: forged }),
    Object.freeze({ ...request(), extra: true }), Object.freeze({ ...request(), [Symbol('extra')]: true }), getter,
    new Proxy(request(), { get: trap, ownKeys: trap, getPrototypeOf: trap }), revoked.proxy,
    Object.freeze({ method: FRONTIER, params: new Proxy(Object.freeze([]), { get: trap, ownKeys: trap }) })];
  for (const candidate of options) {
    await assert.rejects(h.transport.callRead(candidate), error => assertFixedError(error, 'input_rejected'));
  }
  await assert.rejects(h.transport.callRead(request(), true), error => assertFixedError(error, 'input_rejected'));
  assert.equal(h.calls.length, 0);
  assert.equal(traps, 0);
});

test('every method has one exact positional parameter schema and a bounded page index', async () => {
  const h = harness();
  const invalid = [[FRONTIER, [0]], [VARIABLES, [0]], [HEIGHT, []], [HEIGHT, [1, 2]], [HEIGHT, [2, 2]],
    [HEIGHT, ['2', 1]], [HEIGHT, [2, 1, 0]], [SPORK, [0, 127]], [SPORK, [0, 129]], [SPORK, [-0, 128]],
    [SPORK, [-1, 128]], [SPORK, [8, 128]], [SPORK, [0.5, 128]], [SPORK, ['0', 128]], [SPORK, [0]],
    [QUOTE, []], [QUOTE, [quoteRequest(), quoteRequest()]], [QUOTE, [null]]];
  for (const [method, params] of invalid) {
    await assert.rejects(h.transport.callRead(request(method, params)), error => assertFixedError(error, 'input_rejected'));
  }
  assert.equal(h.calls.length, 0);
  for (let page = 0; page < 8; page += 1) await h.transport.callRead(request(SPORK, [page, 128]));
  assert.deepEqual(h.calls.map(body => JSON.parse(body).params), Array.from({ length: 8 }, (_, page) => [page, 128]));
});

test('unsigned quote accepts only canonical nonzero user Bech32 and canonical 32-byte base64', async () => {
  const h = harness();
  const badAddresses = [ADDRESS.toUpperCase(), 'bad', fixtureAddress(Array(20).fill(0)),
    fixtureAddress([1, ...Array(19).fill(17)]), fixtureAddress([2, ...Array(19).fill(17)]),
    fixtureAddress([0, ...Array(19).fill(17)], 'a'), fixtureAddress([0, ...Array(19).fill(17)], 'z', 0x2bc830a3),
    fixtureAddress([0, ...Array(18).fill(17)]), ADDRESS.slice(0, -1) + '!', null];
  const mutations = [...badAddresses.flatMap(address => [{ address }, { toAddress: address }]),
    { blockType: 1 }, { blockType: '2' }, { blockType: 3 }, { extra: true },
    ...['', DATA.slice(0, -1), DATA + '\n', Buffer.alloc(31).toString('base64'),
      Buffer.alloc(33).toString('base64'), DATA.slice(0, -2) + 'd=', null].map(data => ({ data }))];
  for (const mutation of mutations) {
    await assert.rejects(h.transport.callRead(request(QUOTE, [quoteRequest(mutation)])),
      error => assertFixedError(error, 'input_rejected'));
  }
  const shallow = Object.freeze({ method: QUOTE, params: Object.freeze([quoteRequest()]) });
  await assert.rejects(h.transport.callRead(shallow), error => assertFixedError(error, 'input_rejected'));
  assert.equal(h.calls.length, 0);
  await h.transport.callRead(request(QUOTE));
  assert.equal(h.calls[0], canonical(1, request(QUOTE)));
});

test('envelope returns the exact result slice and never coerces numeric lexemes', async () => {
  for (const raw of ['null', 'true', '[]', '"text"', '{ "number" : 18446744073709551615, "x": [1e9,-2.0] }',
    '18446744073709551616', '-0', '7.3404e4', '73404.0']) {
    const h = harness(() => Promise.resolve(` \n{ "result" : ${raw} , "id": 1, "jsonrpc":"2.0" }\t`));
    assert.equal(await h.transport.callRead(request()), raw);
  }
  const h = harness(() => Promise.resolve('{"res\\u0075lt":{},"id":1,"jsonrpc":"2\\u002e0"}'));
  assert.equal(await h.transport.callRead(request()), '{}');
});

test('response ID must match the exact canonical numeric request ID', async () => {
  for (const id of ['0', '2', '-1', '-0', '1.0', '1e0', '"1"', 'null', 'true', '4294967296', MAX_UINT64]) {
    await unavailable(response(id));
  }
  const h = harness((_body, index) => Promise.resolve(response(index === 2 ? 1 : index)));
  await h.transport.callRead(request());
  await assert.rejects(h.transport.callRead(request()), error => assertFixedError(error, 'unavailable'));
  assert.equal(await h.transport.callRead(request()), '{}');
});

test('only one complete result envelope is accepted; batches, errors, extras and notifications fail', async () => {
  for (const raw of [
    '[{"jsonrpc":"2.0","id":1,"result":{}}]', '{"jsonrpc":"2.0","result":{}}',
    '{"jsonrpc":"2.0","id":1}', '{"jsonrpc":"1.0","id":1,"result":{}}',
    '{"jsonrpc":2,"id":1,"result":{}}', '{"id":1,"result":{}}',
    '{"jsonrpc":"2.0","id":1,"error":{"code":-1}}',
    '{"jsonrpc":"2.0","id":1,"result":{},"error":null}',
    '{"jsonrpc":"2.0","id":1,"result":{},"extra":true}',
    response(1) + '{}', response(1) + '\u0000', '\ufeff' + response(1), '', 'null',
  ]) await unavailable(raw);
});

test('duplicate and dangerous keys are rejected at every structural level', async () => {
  for (const raw of [
    '{"jsonrpc":"2.0","id":1,"id":1,"result":{}}',
    '{"jsonrpc":"2.0","id":1,"result":{},"res\\u0075lt":{}}',
    ...['__proto__', 'prototype', 'constructor'].flatMap(key => [
      response(1, `{"${key}":0}`), response(1, `[{"${key}":0}]`),
      `{"jsonrpc":"2.0","id":1,"result":{},"${key}":0}`,
    ]),
    response(1, '{"key":1,"key":2}'), response(1, '{"key":1,"k\\u0065y":2}'),
  ]) await unavailable(raw);
});

test('malformed numbers, escapes, Unicode, controls, delimiters and truncated structures fail closed', async () => {
  for (const raw of ['01', '00', '+1', '.1', '1.', '1e', '1e+', 'NaN', 'Infinity', '-',
    '{"a":}', '{"a":1,}', '[1,]', '[,1]', '"\\x20"', '"\\u123"', '"\\uD800"',
    '"\\uDC00"', '"\\uD800x"', '"\ud800"', '"\udc00"', '"\n"', '{', '[', '"']) {
    await unavailable(response(1, raw));
  }
  const raw = '"\\uD83D\\uDE00"';
  assert.equal(await harness(() => Promise.resolve(response(1, raw))).transport.callRead(request()), raw);
});

test('envelope byte and structural budgets are finite and reject over-limit input', async () => {
  const base = response(1);
  const atCap = base + ' '.repeat(MAX_RESPONSE_BYTES - Buffer.byteLength(base));
  assert.equal(await harness(() => Promise.resolve(atCap)).transport.callRead(request()), '{}');
  await unavailable(atCap + ' ');
  for (const raw of ['['.repeat(18) + '0' + ']'.repeat(18),
    `[${Array(4100).fill('0').join(',')}]`, '"' + 'a'.repeat(65537) + '"',
    '{"' + 'k'.repeat(129) + '":0}']) await unavailable(response(1, raw));
});

test('exact decoded UTF-8 and structural boundaries preserve the unmodified raw result', async () => {
  const exact = [
    '['.repeat(16) + '0' + ']'.repeat(16),
    `[${Array(4096).fill('0').join(',')}]`,
    '[' + Array(4095).fill('[]').join(',') + ']',
    '"' + 'a'.repeat(65536) + '"',
    '"' + 'é'.repeat(32768) + '"',
    '"' + '\\uD83D\\uDE00'.repeat(16384) + '"',
    '{"' + 'é'.repeat(64) + '":0}',
  ];
  for (const raw of exact) {
    assert.equal(await harness(() => Promise.resolve(response(1, raw))).transport.callRead(request()), raw);
  }
  for (const raw of [
    '['.repeat(17) + '0' + ']'.repeat(17),
    `[${Array(4097).fill('0').join(',')}]`,
    '[' + Array(4096).fill('[]').join(',') + ']',
    '"' + 'é'.repeat(32768) + 'a"',
    '"' + '\\uD83D\\uDE00'.repeat(16384) + 'a"',
    '{"' + 'é'.repeat(64) + 'a":0}',
  ]) await unavailable(response(1, raw));
});

test('raw result byte limit is enforced by the adapter independently of envelope overhead', async () => {
  const value = JSON.stringify(momentum());
  const atLimit = value.slice(0, -1) + ' '.repeat(1048576 - Buffer.byteLength(value)) + '}';
  const raw = atLimit.slice(0, -1) + ' }';
  assert.equal(Buffer.byteLength(atLimit), 1048576);
  assert.equal(Buffer.byteLength(raw), 1048577);
  assert.equal(await harness(() => Promise.resolve(response(1, atLimit))).transport.callRead(request()), atLimit);
  await unavailable(response(1, raw));
  const valid = replies();
  valid[0] = atLimit;
  assert.notEqual((await composition({ first: valid }).collector.collect(input())).endpointObservations[0], null);
  const first = replies();
  first[0] = raw;
  const h = composition({ first });
  const output = await h.collector.collect(input());
  assert.equal(output.endpointObservations[0], null);
  assert.notEqual(output.endpointObservations[1], null);
});

test('result byte limit counts multibyte UTF-8 and raw escaped-string representations', async () => {
  for (const parts of [Array(16).fill('"' + 'é'.repeat(32760) + '"'),
    Array(3).fill('"' + '\\u0061'.repeat(58000) + '"')]) {
    const base = '[' + parts.join(',') + ']';
    const atLimit = base.slice(0, -1) + ' '.repeat(1048576 - Buffer.byteLength(base)) + ']';
    const overLimit = atLimit.slice(0, -1) + ' ]';
    assert.equal(Buffer.byteLength(atLimit), 1048576);
    assert.equal(Buffer.byteLength(overLimit), 1048577);
    assert.equal(await harness(() => Promise.resolve(response(1, atLimit))).transport.callRead(request()), atLimit);
    await unavailable(response(1, overLimit));
  }
});

test('exchange rejection/throw/non-string failures are sanitized without inspecting reasons', async () => {
  let traps = 0;
  const reason = new Proxy({}, { get() { traps += 1; throw new Error('must not inspect'); },
    ownKeys() { traps += 1; throw new Error('must not inspect'); } });
  for (const behavior of [() => { throw reason; }, () => Promise.reject(reason),
    () => Promise.resolve({}), () => Promise.resolve(null), () => Promise.resolve(1),
    () => Promise.resolve(new String(response(1)))]) {
    const h = harness(behavior);
    await assert.rejects(h.transport.callRead(request()), error => assertFixedError(error, 'unavailable'));
    assert.equal(h.calls.length, 1);
  }
  assert.equal(traps, 0);
});

test('thenables, proxies, foreign/subclass promises and unsafe constructor getters are not invoked', async () => {
  let traps = 0;
  const trap = () => { traps += 1; throw new Error('must not invoke'); };
  const thenable = Object.defineProperty({}, 'then', { get: trap });
  const unsafe = Object.defineProperty(Promise.resolve(response(1)), 'constructor', { get: trap });
  class ChildPromise extends Promise {}
  const revoked = Proxy.revocable(Promise.resolve(response(1)), {});
  revoked.revoke();
  for (const candidate of [null, response(1), thenable, unsafe, revoked.proxy,
    Object.create(Promise.prototype), new ChildPromise(resolve => resolve(response(1))),
    runInNewContext('Promise.resolve("{}")'),
    new Proxy(Promise.resolve(response(1)), { get: trap, getPrototypeOf: trap, ownKeys: trap })]) {
    await assert.rejects(harness(() => candidate).transport.callRead(request()), error => assertFixedError(error, 'unavailable'));
  }
  assert.equal(traps, 0);
});

test('native symbols remain unread and every own string property is rejected after safe drainage', async () => {
  let getters = 0;
  let unhandled = 0;
  const onUnhandled = () => { unhandled += 1; };
  const held = [];
  process.on('unhandledRejection', onUnhandled);
  try {
    for (const decoration of ['symbol', 'symbol-getter', 'then', 'metadata', 'constructor']) {
      const accepted = decoration.startsWith('symbol');
      const h = harness(() => {
        const promise = accepted ? Promise.resolve(response(1)) : Promise.reject('opaque fixture');
        held.push(promise);
        if (decoration === 'symbol') promise[Symbol('metadata')] = true;
        else if (decoration === 'constructor') Object.defineProperty(promise, 'constructor', { value: Promise });
        else Object.defineProperty(promise, decoration === 'symbol-getter' ? Symbol('metadata') : decoration, {
          get() { getters += 1; throw new Error('must not read'); },
        });
        return promise;
      });
      if (accepted) assert.equal(await h.transport.callRead(request()), '{}');
      else await assert.rejects(h.transport.callRead(request()), error => assertFixedError(error, 'unavailable'));
    }
    await new Promise(resolve => setImmediate(resolve));
  } finally {
    for (const promise of held) Reflect.apply(Promise.prototype.then, promise, [undefined, () => undefined]);
    process.removeListener('unhandledRejection', onUnhandled);
  }
  assert.equal(getters, 0);
  assert.equal(unhandled, 0);
});

test('owner-prehandled unsafe constructor rejection is not drained through an attacker getter', async () => {
  let getters = 0;
  const h = harness(() => {
    const returned = Promise.reject('opaque fixture');
    Reflect.apply(Promise.prototype.then, returned, [undefined, () => undefined]);
    Object.defineProperty(returned, 'constructor', { get() { getters += 1; throw new Error('must not read'); } });
    return returned;
  });
  await assert.rejects(h.transport.callRead(request()), error => assertFixedError(error, 'unavailable'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(getters, 0);
});

test('native constructor and species descriptor drift fails without invoking replacement getters', async () => {
  for (const [object, key] of [[Promise.prototype, 'constructor'], [Promise, Symbol.species]]) {
    const original = Object.getOwnPropertyDescriptor(object, key);
    let getters = 0;
    const returned = Promise.reject('opaque owner-handled rejection');
    Reflect.apply(Promise.prototype.then, returned, [undefined, () => undefined]);
    const h = harness(() => {
      Object.defineProperty(object, key, { configurable: true, get() { getters += 1; return Promise; } });
      return returned;
    });
    let pending;
    try {
      pending = h.transport.callRead(request());
    } finally {
      Object.defineProperty(object, key, original);
    }
    await assert.rejects(pending, error => assertFixedError(error, 'unavailable'));
    assert.equal(getters, 0);
    assert.equal(h.calls.length, 1);
  }
});

test('captured native then is used even when the exchange replaces the prototype method', async () => {
  const original = Object.getOwnPropertyDescriptor(Promise.prototype, 'then');
  let invocations = 0;
  const returned = Promise.resolve(response(1));
  const h = harness(() => {
    Object.defineProperty(Promise.prototype, 'then', { configurable: true, writable: true,
      value() { invocations += 1; throw new Error('replacement must not run'); } });
    return returned;
  });
  let pending;
  try {
    pending = h.transport.callRead(request());
  } finally {
    Object.defineProperty(Promise.prototype, 'then', original);
  }
  assert.equal(await pending, '{}');
  assert.equal(invocations, 0);
});

test('captured validation intrinsics do not invoke exchange-installed replacements', async () => {
  const originals = [
    [Object, 'freeze'], [Object, 'getOwnPropertyDescriptor'], [Object, 'getOwnPropertyNames'],
    [Object, 'getPrototypeOf'], [Object, 'defineProperty'], [Object, 'hasOwn'], [Object, 'isFrozen'],
    [Reflect, 'ownKeys'], [Reflect, 'apply'], [Array, 'isArray'], [Number, 'isSafeInteger'],
    [JSON, 'parse'], [JSON, 'stringify'], [RegExp.prototype, 'exec'],
  ].map(([object, key]) => [object, key, Object.getOwnPropertyDescriptor(object, key)]);
  const define = Object.defineProperty;
  let invocations = 0;
  const candidate = request(QUOTE);
  const raw = '{"lossless":18446744073709551615}';
  const returned = Promise.resolve(response(1, raw));
  const transport = createDynamicPlasmaJsonRpcReadTransport({ exchange() {
    for (const [object, key] of originals) define(object, key, { configurable: true, writable: true,
      value() { invocations += 1; throw new Error('replacement must not run'); } });
    return returned;
  } });
  let result;
  try {
    result = await transport.callRead(candidate);
  } finally {
    for (const [object, key, descriptor] of originals) define(object, key, descriptor);
  }
  assert.equal(result, raw);
  assert.equal(invocations, 0);
});

test('exchange-installed inherited then is rejected without assimilation and permits restored reuse', async () => {
  const original = Object.getOwnPropertyDescriptor(Object.prototype, 'then');
  let getters = 0;
  let calls = 0;
  const candidate = request();
  const returned = Promise.resolve(response(1));
  const transport = createDynamicPlasmaJsonRpcReadTransport({ exchange() {
    calls += 1;
    if (calls !== 1) return Promise.resolve(response(calls));
    Object.defineProperty(Object.prototype, 'then', { configurable: true,
      get() { getters += 1; throw new Error('inherited getter must not run'); } });
    return returned;
  } });
  let result;
  let failure;
  try {
    try { result = await transport.callRead(candidate); } catch (error) { failure = error; }
  } finally {
    if (original === undefined) delete Object.prototype.then;
    else Object.defineProperty(Object.prototype, 'then', original);
  }
  assert.equal(result, undefined);
  assertFixedError(failure, 'unavailable');
  assert.equal(getters, 0);
  assert.equal(await transport.callRead(candidate), '{}');
  assert.equal(calls, 2);
});

function rejectedWithInheritedThenDrift(timing, marker, onGetter) {
  let reject;
  const pending = timing === 'synchronous' ? Promise.reject(marker) :
    new Promise((_resolve, fail) => { reject = fail; });
  assert.equal(utilTypes.isPromise(pending), true);
  assert.equal(Object.getPrototypeOf(pending), Promise.prototype);
  assert.deepEqual(Object.getOwnPropertyNames(pending), []);
  Object.defineProperty(Object.prototype, 'then', { configurable: true,
    get() { onGetter(); throw marker; } });
  if (timing === 'delayed') queueMicrotask(() => reject(marker));
  // Intentionally not owner-prehandled: constructor/species are still trusted,
  // so the adapter can safely drain this exact native rejection itself.
  return pending;
}

for (const timing of ['synchronous', 'delayed']) {
  test(`inherited-then-only drift drains a ${timing} native rejection before returning unavailable`, async () => {
    await new Promise(resolve => setImmediate(resolve));
    const original = Object.getOwnPropertyDescriptor(Object.prototype, 'then');
    const marker = Object.freeze(Object.create(null));
    let getters = 0;
    let unhandled = 0;
    let calls = 0;
    const onUnhandled = () => { unhandled += 1; };
    const transport = createDynamicPlasmaJsonRpcReadTransport({ exchange() {
      calls += 1;
      return calls === 1 ? rejectedWithInheritedThenDrift(timing, marker, () => { getters += 1; }) :
        Promise.resolve(response(calls));
    } });
    const candidate = request();
    let failure;
    process.on('unhandledRejection', onUnhandled);
    try {
      try {
        try { await transport.callRead(candidate); } catch (error) { failure = error; }
      } finally {
        restoreDescriptor(Object.prototype, 'then', original);
      }
      assertFixedError(failure, 'unavailable');
      assert.notEqual(failure, marker);
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(unhandled, 0);
      assert.equal(getters, 0);
      assert.equal(await transport.callRead(candidate), '{}');
      assert.equal(calls, 2);
    } finally {
      restoreDescriptor(Object.prototype, 'then', original);
      process.removeListener('unhandledRejection', onUnhandled);
    }
  });

  for (const restoration of ['after-invariant-stop', 'before-collector-inspection']) {
    test(`inherited-then ${timing} rejection composes safely with restoration ${restoration}`, async () => {
      await new Promise(resolve => setImmediate(resolve));
      const original = Object.getOwnPropertyDescriptor(Object.prototype, 'then');
      const marker = Object.freeze(Object.create(null));
      let getters = 0;
      let unhandled = 0;
      const calls = [];
      const values = replies();
      const onUnhandled = () => { unhandled += 1; };
      const adapter = createDynamicPlasmaJsonRpcReadTransport({ exchange(body) {
        const parsed = JSON.parse(body);
        calls.push(['A', parsed.id]);
        if (parsed.id === 1) return rejectedWithInheritedThenDrift(timing, marker, () => { getters += 1; });
        return Promise.resolve(response(parsed.id, JSON.stringify(values[(parsed.id - 2) % values.length])));
      } });
      const first = Object.freeze({ callRead: Object.freeze(function(candidate) {
        const pending = adapter.callRead(candidate);
        if (restoration === 'before-collector-inspection') restoreDescriptor(Object.prototype, 'then', original);
        return pending;
      }) });
      const second = createDynamicPlasmaJsonRpcReadTransport({ exchange(body) {
        const parsed = JSON.parse(body);
        calls.push(['B', parsed.id]);
        return Promise.resolve(response(parsed.id, JSON.stringify(values[(parsed.id - 1) % values.length])));
      } });
      const collector = createDynamicPlasmaObservationCollector({ transports: [first, second] });
      let output;
      let failure;
      process.on('unhandledRejection', onUnhandled);
      try {
        try {
          try { output = await collector.collect(input()); } catch (error) { failure = error; }
        } finally {
          restoreDescriptor(Object.prototype, 'then', original);
        }
        if (restoration === 'after-invariant-stop') {
          assert.equal(output, undefined);
          assert.equal(failure.code, 'dynamic_plasma_observation_collector_configuration_rejected');
          assert.equal(Object.isFrozen(failure), true);
          assert.notEqual(failure, marker);
          assert.deepEqual(calls, [['A', 1]]);
        } else {
          assert.equal(failure, undefined);
          assert.equal(output.endpointObservations[0], null);
          assert.notEqual(output.endpointObservations[1], null);
          assert.equal(normalizeDynamicPlasmaObservation(output).classification, 'UNAVAILABLE');
          assert.deepEqual(calls, [['A', 1], ...Array.from({ length: 6 }, (_, index) => ['B', index + 1])]);
        }
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(unhandled, 0);
        assert.equal(getters, 0);
        assert.equal(normalizeDynamicPlasmaObservation(await collector.collect(input())).classification, 'DP_ACTIVE');
        assert.deepEqual(calls.filter(row => row[0] === 'A').map(row => row[1]), [1, 2, 3, 4, 5, 6, 7]);
      } finally {
        restoreDescriptor(Object.prototype, 'then', original);
        process.removeListener('unhandledRejection', onUnhandled);
      }
    });
  }
}

test('initial noncanonical intrinsic structures are permanently rejected without accessor reads', () => {
  let getters = 0;
  let calls = 0;
  const getter = () => { getters += 1; return Promise; };
  const replacements = [
    [Object.prototype, 'then', { value: undefined, configurable: true }],
    [Object.prototype, 'then', { get: getter, configurable: true }],
    [Promise.prototype, 'constructor', { get: getter, configurable: true }],
    [Promise.prototype, 'constructor', { value: Promise, writable: false, configurable: true }],
    [Promise, Symbol.species, { value: Promise, configurable: true }],
    [Promise, Symbol.species, { get: getter, configurable: true }],
    [Promise, Symbol.species, { get: new Proxy(getter, { apply: getter }), configurable: true }],
  ];
  for (const [object, key, replacement] of replacements) {
    const original = Object.getOwnPropertyDescriptor(object, key);
    let factory;
    try {
      Object.defineProperty(object, key, replacement);
      factory = evaluateAdapter();
    } finally {
      restoreDescriptor(object, key, original);
    }
    assert.throws(() => factory({ exchange() { calls += 1; } }), error => assertFixedError(error, 'configuration_rejected'));
  }
  assert.equal(getters, 0);
  assert.equal(calls, 0);
});

test('factory admission rejects later intrinsic descriptor drift before touching the capability', () => {
  let getters = 0;
  let calls = 0;
  for (const [object, key] of [[Object.prototype, 'then'], [Promise.prototype, 'constructor'], [Promise, Symbol.species]]) {
    const original = Object.getOwnPropertyDescriptor(object, key);
    let failure;
    try {
      Object.defineProperty(object, key, { configurable: true, get() { getters += 1; return Promise; } });
      try { createDynamicPlasmaJsonRpcReadTransport({ exchange() { calls += 1; } }); } catch (error) { failure = error; }
    } finally {
      restoreDescriptor(object, key, original);
    }
    assertFixedError(failure, 'configuration_rejected');
  }
  assert.equal(getters, 0);
  assert.equal(calls, 0);
});

test('call admission drift is unavailable with no input inspection, handoff or ID consumption', async () => {
  let getters = 0;
  let inputTraps = 0;
  const candidate = request();
  const hostile = new Proxy({}, { get() { inputTraps += 1; throw new Error('must not inspect'); },
    ownKeys() { inputTraps += 1; throw new Error('must not inspect'); } });
  for (const [object, key] of [[Object.prototype, 'then'], [Promise.prototype, 'constructor'], [Promise, Symbol.species]]) {
    const original = Object.getOwnPropertyDescriptor(object, key);
    const returned = Promise.resolve(response(1));
    const h = harness(() => returned);
    let pending;
    let ignoredInput;
    try {
      Object.defineProperty(object, key, { configurable: true, get() { getters += 1; return Promise; } });
      pending = h.transport.callRead(candidate);
      ignoredInput = h.transport.callRead(hostile);
    } finally {
      restoreDescriptor(object, key, original);
    }
    await assert.rejects(pending, error => assertFixedError(error, 'unavailable'));
    await assert.rejects(ignoredInput, error => assertFixedError(error, 'unavailable'));
    assert.equal(Object.isFrozen(pending), true);
    assert.deepEqual(Object.getOwnPropertyNames(pending), []);
    assert.throws(() => { pending.then = () => {}; }, TypeError);
    assert.equal(h.calls.length, 0);
    assert.equal(await h.transport.callRead(candidate), '{}');
    assert.equal(JSON.parse(h.calls[0]).id, 1);
    assert.equal(h.calls.length, 1);
  }
  assert.equal(getters, 0);
  assert.equal(inputTraps, 0);
});

test('species getter identity and own function-descriptor shape are checked without invocation', async () => {
  const getter = Object.getOwnPropertyDescriptor(Promise, Symbol.species).get;
  let invocations = 0;
  for (const key of ['name', 'length']) {
    const original = Object.getOwnPropertyDescriptor(getter, key);
    const h = harness();
    let factory;
    let pending;
    let failure;
    try {
      Object.defineProperty(getter, key, { configurable: true,
        get() { invocations += 1; throw new Error('function descriptor getter must not run'); } });
      factory = evaluateAdapter();
      try { createDynamicPlasmaJsonRpcReadTransport({ exchange: h.exchange }); } catch (error) { failure = error; }
      pending = h.transport.callRead(request());
    } finally {
      Object.defineProperty(getter, key, original);
    }
    assert.throws(() => factory({ exchange: h.exchange }), error => assertFixedError(error, 'configuration_rejected'));
    assertFixedError(failure, 'configuration_rejected');
    await assert.rejects(pending, error => assertFixedError(error, 'unavailable'));
    assert.equal(h.calls.length, 0);
    assert.equal(await h.transport.callRead(request()), '{}');
  }
  const original = Object.getOwnPropertyDescriptor(Promise, Symbol.species);
  const h = harness();
  const replacement = () => { invocations += 1; return Promise; };
  Object.defineProperty(replacement, 'name', { value: 'get [Symbol.species]', configurable: true });
  let pending;
  try {
    Object.defineProperty(Promise, Symbol.species, { ...original, get: replacement });
    pending = h.transport.callRead(request());
  } finally {
    Object.defineProperty(Promise, Symbol.species, original);
  }
  await assert.rejects(pending, error => assertFixedError(error, 'unavailable'));
  assert.equal(h.calls.length, 0);
  assert.equal(invocations, 0);
});

test('post-settlement intrinsic drift cannot return success and restoration permits safe reuse', async () => {
  // Drain the test reporter and attach to this test's own promise before the
  // bounded poisoned-intrinsic microtask interval begins.
  await new Promise(resolve => setImmediate(resolve));
  let getters = 0;
  const candidate = request();
  for (const [object, key] of [[Object.prototype, 'then'], [Promise.prototype, 'constructor'], [Promise, Symbol.species]]) {
    const original = Object.getOwnPropertyDescriptor(object, key);
    let release;
    const held = new Promise(resolve => { release = resolve; });
    const h = harness((_body, index) => index === 1 ? held : Promise.resolve(response(index)));
    const operation = shieldTestAwait(h.transport.callRead(candidate));
    let failure;
    try {
      Object.defineProperty(object, key, { configurable: true, get() { getters += 1; return Promise; } });
      release(response(1));
      try { await operation; } catch (error) { failure = error; }
    } finally {
      restoreDescriptor(object, key, original);
    }
    assertFixedError(failure, 'unavailable');
    assert.equal(await h.transport.callRead(candidate), '{}');
    assert.deepEqual(h.calls.map(body => JSON.parse(body).id), [1, 2]);
  }
  assert.equal(getters, 0);
});

for (const timing of ['synchronous', 'delayed']) {
  test(`adapter-owned outward rejection is prehandled through ${timing} constructor/species drift`, async () => {
    // The reporter is not part of the adapter's captured-intrinsic boundary.
    await new Promise(resolve => setImmediate(resolve));
    let getters = 0;
    let unhandled = 0;
    const onUnhandled = () => { unhandled += 1; };
    process.on('unhandledRejection', onUnhandled);
    try {
      for (const [object, key] of [[Promise.prototype, 'constructor'], [Promise, Symbol.species]]) {
        const original = Object.getOwnPropertyDescriptor(object, key);
        let reject;
        let poison = true;
        const owned = new Promise((_resolve, fail) => { reject = fail; });
        Reflect.apply(Promise.prototype.then, owned, [undefined, () => undefined]);
        const calls = [];
        const values = replies();
        const marker = new Proxy({}, { get() { getters += 1; throw new Error('reason must not be inspected'); } });
        const first = createDynamicPlasmaJsonRpcReadTransport({ exchange(body) {
          const parsed = JSON.parse(body);
          calls.push(['A', parsed.id]);
          if (poison) {
            const drift = () => {
              Object.defineProperty(object, key, { configurable: true,
                get() { getters += 1; throw new Error('constructor/species getter must not run'); } });
              reject(marker);
            };
            if (timing === 'synchronous') drift();
            else queueMicrotask(drift);
            return owned;
          }
          return Promise.resolve(response(parsed.id, JSON.stringify(values[parsed.id - 2])));
        } });
        const second = createDynamicPlasmaJsonRpcReadTransport({ exchange(body) {
          const parsed = JSON.parse(body);
          calls.push(['B', parsed.id]);
          return Promise.resolve(response(parsed.id, JSON.stringify(values[parsed.id - 1])));
        } });
        const collector = createDynamicPlasmaObservationCollector({ transports: [first, second] });
        let output;
        try {
          output = await shieldTestAwait(collector.collect(input()));
        } finally {
          restoreDescriptor(object, key, original);
          poison = false;
        }
        assert.deepEqual(output.endpointObservations, [null, null]);
        assert.deepEqual(calls, [['A', 1]]);
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(unhandled, 0);
        const reused = await collector.collect(input());
        assert.equal(normalizeDynamicPlasmaObservation(reused).classification, 'DP_ACTIVE');
        assert.deepEqual(calls.map(row => row[1]), [1, 2, 3, 4, 5, 6, 7, 1, 2, 3, 4, 5, 6]);
      }
    } finally {
      process.removeListener('unhandledRejection', onUnhandled);
    }
    assert.equal(getters, 0);
    assert.equal(unhandled, 0);
  });
}

test('private uint32 exhaustion boundary consumes only handed-off IDs and never wraps or reuses', async () => {
  const factory = evaluateAdapter(true);
  const last = 4294967295;
  let traps = 0;
  const hostile = new Proxy({}, { get() { traps += 1; throw new Error('must not inspect'); },
    ownKeys() { traps += 1; throw new Error('must not inspect'); },
    getPrototypeOf() { traps += 1; throw new Error('must not inspect'); } });
  let release;
  let reject;
  const first = new Promise(resolve => { release = resolve; });
  const second = new Promise((_resolve, fail) => { reject = fail; });
  const ids = [];
  const transport = factory({ exchange(body) {
    ids.push(JSON.parse(body).id);
    return ids.length === 1 ? first : second;
  } });
  assert.deepEqual(Object.keys(transport), ['callRead']);
  await assert.rejects(transport.callRead(request('unknown')), error => assertFixedError(error, 'input_rejected'));
  assert.deepEqual(ids, []);
  const firstCall = transport.callRead(request());
  assert.deepEqual(ids, [last - 1]);
  await assert.rejects(transport.callRead(hostile), error => assertFixedError(error, 'busy'));
  assert.equal(traps, 0);
  release(response(last - 1));
  assert.equal(await firstCall, '{}');
  await assert.rejects(transport.callRead(request(), true), error => assertFixedError(error, 'input_rejected'));
  assert.deepEqual(ids, [last - 1]);
  const finalCall = transport.callRead(request());
  assert.deepEqual(ids, [last - 1, last]);
  await assert.rejects(transport.callRead(hostile), error => assertFixedError(error, 'busy'));
  reject('opaque terminal failure');
  await assert.rejects(finalCall, error => assertFixedError(error, 'unavailable'));
  for (const candidate of [hostile, request(), request('unknown'), hostile]) {
    await assert.rejects(transport.callRead(candidate), error => assertFixedError(error, 'exhausted'));
  }
  assert.equal(traps, 0);
  assert.deepEqual(ids, [last - 1, last]);

  const recoveryIds = [];
  const terminalSuccess = factory({ exchange(body) {
    const id = JSON.parse(body).id;
    recoveryIds.push(id);
    if (id === last - 1) throw new Error('opaque synchronous handoff failure');
    return Promise.resolve(response(id));
  } });
  await assert.rejects(terminalSuccess.callRead(request()), error => assertFixedError(error, 'unavailable'));
  assert.equal(await terminalSuccess.callRead(request()), '{}');
  await assert.rejects(terminalSuccess.callRead(hostile), error => assertFixedError(error, 'exhausted'));
  assert.deepEqual(recoveryIds, [last - 1, last]);
  assert.equal(traps, 0);
});

test('concurrent and reentrant calls are BUSY without reading input or consuming another ID', async () => {
  let release;
  let reentrant;
  let h;
  let traps = 0;
  const bad = new Proxy({}, { get() { traps += 1; throw new Error('must not inspect'); } });
  const pending = new Promise(resolve => { release = resolve; });
  h = harness((_body, index) => {
    if (index === 1) {
      reentrant = h.transport.callRead(bad);
      reentrant.catch(() => {});
      return pending;
    }
    return Promise.resolve(response(index));
  });
  const active = h.transport.callRead(request());
  await assert.rejects(reentrant, error => assertFixedError(error, 'busy'));
  await assert.rejects(h.transport.callRead(bad), error => assertFixedError(error, 'busy'));
  assert.equal(h.calls.length, 1);
  assert.equal(traps, 0);
  release(response(1));
  assert.equal(await active, '{}');
  assert.equal(await h.transport.callRead(request()), '{}');
  assert.deepEqual(h.calls.map(body => JSON.parse(body).id), [1, 2]);
});

test('pending exchange remains caller-owned and failure clears the busy latch without retry', async () => {
  let reject;
  const pending = new Promise((_resolve, fail) => { reject = fail; });
  const h = harness((_body, index) => index === 1 ? pending : Promise.resolve(response(index)));
  const first = h.transport.callRead(request());
  await assert.rejects(h.transport.callRead(request()), error => assertFixedError(error, 'busy'));
  reject('opaque caller-owned timeout');
  await assert.rejects(first, error => assertFixedError(error, 'unavailable'));
  assert.equal(await h.transport.callRead(request()), '{}');
  assert.equal(h.calls.length, 2);
});

test('adapter collector normalizer compose DP_ACTIVE with exact A-before-B order and identical quote', async () => {
  const h = composition();
  const output = await h.collector.collect(input());
  assert.equal(normalizeDynamicPlasmaObservation(output).classification, 'DP_ACTIVE');
  assert.deepEqual(h.log.map(row => row.label), [...Array(6).fill('A'), ...Array(6).fill('B')]);
  assert.deepEqual(h.log.map(row => row.method), [...METHODS, FRONTIER, ...METHODS, FRONTIER]);
  assert.deepEqual(h.log.map(row => row.id), [1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(h.log[4].params, h.log[10].params);
});

for (const count of [0, 1, 128, 129, 1024]) {
  test(`composition supports complete collector pagination at ${count} sporks`, async () => {
    const h = composition({ first: replies(count), second: replies(count) });
    const output = await h.collector.collect(input());
    for (const endpoint of output.endpointObservations) assert.equal(endpoint.sporks.list.length, count);
    const pages = h.log.filter(row => row.method === SPORK);
    assert.deepEqual(pages.filter(row => row.label === 'A').map(row => row.params),
      Array.from({ length: Math.max(1, Math.ceil(count / 128)) }, (_, page) => [page, 128]));
  });
}

test('pre-signing gate is enforced by the collector before any exchange call', async () => {
  const h = composition();
  await assert.rejects(h.collector.collect({ ...input(), phase: 'SIGNED' }),
    error => error.code === 'dynamic_plasma_observation_collector_input_rejected');
  assert.equal(h.log.length, 0);
});

test('full uint64 chain identity is lossless and strict downstream numeric failures remain unavailable', async () => {
  function withChain(chain) {
    return replies().map((raw, index) => [0, 1, 5].includes(index) ?
      JSON.stringify(raw).replace('"chainIdentifier":73404', `"chainIdentifier":${chain}`) : raw);
  }
  const h = composition({ first: withChain(MAX_UINT64), second: withChain(MAX_UINT64) });
  const output = await h.collector.collect(input(MAX_UINT64));
  assert.equal(output.endpointObservations[0].beforeFrontier.chainIdentifier, MAX_UINT64);
  assert.equal(normalizeDynamicPlasmaObservation(output).classification, 'DP_ACTIVE');
  for (const chain of ['18446744073709551616', '073404', '73404e0', '73404.0']) {
    const candidate = composition({ first: withChain(chain) });
    const result = await candidate.collector.collect(input());
    assert.equal(result.endpointObservations[0], null);
    assert.notEqual(result.endpointObservations[1], null);
  }
  const unsafePrice = replies();
  unsafePrice[0] = JSON.stringify(momentum()).replace('"nextWorkPrice":1100', '"nextWorkPrice":9007199254740992');
  assert.equal((await composition({ first: unsafePrice }).collector.collect(input())).endpointObservations[0], null);
});

test('PRE_DP and coherent disagreement survive protocol adaptation without inferred activation', async () => {
  const legacy = replies();
  legacy[0] = momentum({ version: 1, nextFusionPrice: 0, nextWorkPrice: 0 });
  legacy[5] = legacy[0];
  legacy[2].list[1].activated = false;
  legacy[4].requiredDifficulty = 16500000;
  assert.equal(normalizeDynamicPlasmaObservation(await composition({ first: legacy, second: legacy }).collector.collect(input())).classification, 'PRE_DP');
  const second = replies();
  second[4].requiredDifficulty += 1;
  assert.equal(normalizeDynamicPlasmaObservation(await composition({ second }).collector.collect(input())).reason,
    'ENDPOINT_OBSERVATION_MISMATCH');
  const drift = replies();
  drift[5].height += 1;
  assert.equal(normalizeDynamicPlasmaObservation(await composition({ first: drift }).collector.collect(input())).reason,
    'FRONTIER_BINDING_MISMATCH');
});

test('protocol failure remains endpoint A null and B never replaces its evidence', async () => {
  const h = composition({ failFirst: parsed => Promise.resolve(`{"jsonrpc":"2.0","id":${parsed.id},"error":{"code":-1}}`) });
  const result = await h.collector.collect(input());
  assert.equal(result.endpointObservations[0], null);
  assert.notEqual(result.endpointObservations[1], null);
  assert.equal(h.log.filter(row => row.label === 'A').length, 1);
  assert.equal(h.log.filter(row => row.label === 'B').length, 6);
  assert.equal(normalizeDynamicPlasmaObservation(result).classification, 'UNAVAILABLE');
});

test('source remains a default-off pure adapter with explicit boundary and bounded ID guard', () => {
  const source = readFileSync(new URL('../src/zenon/dynamic-plasma-json-rpc-read-transport.js', import.meta.url), 'utf8');
  assert.deepEqual([...source.matchAll(/from ['"]([^'"]+)['"]/g)].map(match => match[1]), ['node:util']);
  assert.doesNotMatch(source, /\b(?:fetch|WebSocket|XMLHttpRequest|URL|setTimeout|setInterval|AbortSignal)\b/);
  assert.doesNotMatch(source, /\b(?:process|console)\s*\.|Math\.random|node:(?:http|https|net|tls|fs|crypto)/);
  assert.doesNotMatch(source, /JSON\.(?:parse|stringify)\s*\(|Promise\.resolve\s*\(/);
  assert.doesNotMatch(source, /\b(?:publishRawTransaction|prepareBlock|computePoW|signTransaction)\s*\(/);
  assert.match(source, /UNSIGNED/);
  assert.match(source, /TRANSPORT_MUST_PREHANDLE_REJECTION/);
  assert.match(source, /MAX_REQUEST_ID\s*=\s*4294967295/);
  assert.match(source, /nextId\s*>\s*MAX_REQUEST_ID/);
  assert.ok(source.indexOf('nextId += 1') < source.indexOf('apply(exchange, undefined,'));
});
