import test from 'node:test';
import assert from 'node:assert/strict';
import { types as utilTypes } from 'node:util';
import { runInNewContext } from 'node:vm';

import { createZenonFundingJsonRpcReadTransport } from '../src/service-credit-zenon-funding-json-rpc-read-transport.js';

const FRONTIER = 'ledger.getFrontierMomentum';
const MOMENTUM = 'ledger.getMomentumByHash';
const HEIGHT = 'ledger.getMomentumsByHeight';
const BLOCK = 'ledger.getAccountBlockByHash';
const HASH_A = 'ab'.repeat(32);
const HASH_B = '22'.repeat(32);
const PREFIX = 'zenon_funding_json_rpc_read_transport_';

function frozen(value) {
  if (Array.isArray(value)) {
    for (const item of value) frozen(item);
  } else if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) frozen(item);
  }
  return Object.freeze(value);
}

function request(method = FRONTIER, params = []) {
  return frozen({ method, params });
}

function response(id, result = '{}') {
  return `{"jsonrpc":"2.0","id":${id},"result":${result}}`;
}

function errorIs(suffix) {
  return error => {
    assert.equal(error?.code, PREFIX + suffix);
    assert.equal(Object.isFrozen(error), true);
    assert.deepEqual(Object.keys(error), ['code']);
    assert.equal(error.cause, undefined);
    return true;
  };
}

function harness(implementation = (_body, id) => Promise.resolve(response(id))) {
  const bodies = [];
  const exchange = Object.freeze(function exchange(body) {
    bodies.push(body);
    return implementation(body, bodies.length);
  });
  const transport = createZenonFundingJsonRpcReadTransport({ exchange });
  return { bodies, transport };
}

test('funding JSON-RPC adapter is inert and exposes one frozen callRead capability', async () => {
  let calls = 0;
  const exchange = Object.freeze(function exchange() { calls += 1; return Promise.resolve(response(1)); });
  const transport = createZenonFundingJsonRpcReadTransport({ exchange });
  assert.deepEqual(Object.keys(transport), ['callRead']);
  assert.equal(Object.getPrototypeOf(transport), Object.prototype);
  assert.equal(Object.isFrozen(transport), true);
  assert.equal(Object.isFrozen(transport.callRead), true);
  assert.equal(utilTypes.isProxy(transport.callRead), false);
  assert.equal(calls, 0);
});

test('funding methods serialize exact positional parameters and increasing IDs', async () => {
  const h = harness();
  const inputs = [
    request(FRONTIER, []),
    request(MOMENTUM, [HASH_A]),
    request(HEIGHT, [3, 64]),
    request(BLOCK, [HASH_B]),
  ];
  for (const input of inputs) assert.equal(await h.transport.callRead(input), '{}');
  assert.deepEqual(h.bodies.map(body => JSON.parse(body)), [
    { jsonrpc: '2.0', id: 1, method: FRONTIER, params: [] },
    { jsonrpc: '2.0', id: 2, method: MOMENTUM, params: [HASH_A] },
    { jsonrpc: '2.0', id: 3, method: HEIGHT, params: [3, 64] },
    { jsonrpc: '2.0', id: 4, method: BLOCK, params: [HASH_B] },
  ]);
});

test('funding grammar rejects arbitrary and Dynamic Plasma methods and unsafe parameters', async () => {
  const h = harness();
  const rejected = [
    request('embedded.plasma.getVariables', []),
    request('embedded.spork.getAll', [0, 128]),
    request('ledger.getMomentumsByHeight', [2, 0]),
    request('ledger.getMomentumsByHeight', [0, 1]),
    request('ledger.getMomentumsByHeight', [-0, 1]),
    request('ledger.getMomentumsByHeight', [1.5, 1]),
    request('ledger.getMomentumsByHeight', [Number.MAX_SAFE_INTEGER + 1, 1]),
    request('ledger.getMomentumsByHeight', [2, 65]),
    request(MOMENTUM, [HASH_A.toUpperCase()]),
    request(MOMENTUM, ['1'.repeat(63)]),
    request(BLOCK, [HASH_A, HASH_B]),
    request(FRONTIER, [1]),
  ];
  for (const input of rejected) await assert.rejects(h.transport.callRead(input), errorIs('input_rejected'));
  assert.equal(h.bodies.length, 0);
  assert.equal(await h.transport.callRead(request()), '{}');
  assert.equal(JSON.parse(h.bodies[0]).id, 1);
});

test('request records and arrays must be exact frozen data containers', async () => {
  const h = harness();
  let traps = 0;
  const proxy = new Proxy({}, { ownKeys() { traps += 1; throw new Error('trap'); } });
  const accessor = Object.freeze(Object.defineProperty({ params: Object.freeze([]) }, 'method', {
    enumerable: true,
    get() { traps += 1; throw new Error('trap'); },
  }));
  for (const input of [
    { method: FRONTIER, params: [] },
    Object.freeze({ method: FRONTIER, params: [] }),
    frozen({ method: FRONTIER, params: [], extra: true }),
    accessor,
    proxy,
  ]) await assert.rejects(h.transport.callRead(input), errorIs('input_rejected'));
  assert.equal(traps, 0);
  assert.equal(h.bodies.length, 0);
});

test('one active call is enforced before input inspection and six handoffs exhaust the adapter', async () => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const h = harness((_body, id) => id === 1 ? held : Promise.resolve(response(id)));
  let traps = 0;
  const hostile = new Proxy({}, { ownKeys() { traps += 1; throw new Error('trap'); } });
  const first = h.transport.callRead(request());
  await assert.rejects(h.transport.callRead(hostile), errorIs('busy'));
  assert.equal(traps, 0);
  release(response(1));
  assert.equal(await first, '{}');
  for (let id = 2; id <= 6; id += 1) assert.equal(await h.transport.callRead(request()), '{}');
  for (const input of [hostile, request(), request('unknown', [])]) {
    await assert.rejects(h.transport.callRead(input), errorIs('exhausted'));
  }
  assert.equal(traps, 0);
  assert.equal(h.bodies.length, 6);
});

test('only one exact JSON-RPC result envelope is accepted and raw result text is preserved', async () => {
  const exact = ' { "nested" : [ 1e0, "\\u0061" ] } ';
  const accepted = harness((_body, id) => Promise.resolve(` { "result" :${exact}, "id" : ${id}, "jsonrpc" : "2.0" } `));
  assert.equal(await accepted.transport.callRead(request()), exact.trim());

  const invalid = [
    '[{"jsonrpc":"2.0","id":1,"result":{}}]',
    '{"jsonrpc":"2.0","id":1,"error":{"code":-1}}',
    '{"jsonrpc":"2.0","id":1,"result":{},"extra":0}',
    '{"jsonrpc":"2.0","id":2,"result":{}}',
    '{"jsonrpc":"2.0","id":1,"id":1,"result":{}}',
    '{"jsonrpc":"2.0","id":1,"result":{"constructor":0}}',
    '{"jsonrpc":"2.0","id":1,"result":{"__proto__":0}}',
    '{"jsonrpc":"2.0","id":1,"result":{"prototype":0}}',
  ];
  for (const text of invalid) {
    const h = harness(() => Promise.resolve(text));
    await assert.rejects(h.transport.callRead(request()), errorIs('unavailable'));
  }
});

test('response byte and depth budgets reject cap plus one without changing raw accepted bytes', async () => {
  const atCap = `{${' '.repeat(1048574)}}`;
  const accepted = harness((_body, id) => Promise.resolve(response(id, atCap)));
  assert.equal((await accepted.transport.callRead(request())).length, 1048576);

  const overCap = `{${' '.repeat(1048575)}}`;
  const oversized = harness((_body, id) => Promise.resolve(response(id, overCap)));
  await assert.rejects(oversized.transport.callRead(request()), errorIs('unavailable'));

  const depth16 = `${'['.repeat(16)}0${']'.repeat(16)}`;
  const bounded = harness((_body, id) => Promise.resolve(response(id, depth16)));
  assert.equal(await bounded.transport.callRead(request()), depth16);
  const depth17 = `${'['.repeat(17)}0${']'.repeat(17)}`;
  const tooDeep = harness((_body, id) => Promise.resolve(response(id, depth17)));
  await assert.rejects(tooDeep.transport.callRead(request()), errorIs('unavailable'));
});

test('malformed responses and unsafe Promise mechanics fail with fixed errors only', async () => {
  const foreign = runInNewContext('Promise.resolve("opaque")');
  const candidates = [
    () => { throw new Error('private transport reason'); },
    () => Promise.reject(new Error('private transport reason')),
    () => 'not a promise',
    () => ({ then() { throw new Error('private thenable reason'); } }),
    () => foreign,
    () => Promise.resolve('{"jsonrpc":"2.0","id":1,"result":'),
  ];
  for (const exchange of candidates) {
    const transport = createZenonFundingJsonRpcReadTransport({ exchange: Object.freeze(exchange) });
    await assert.rejects(transport.callRead(request()), errorIs('unavailable'));
  }
});
