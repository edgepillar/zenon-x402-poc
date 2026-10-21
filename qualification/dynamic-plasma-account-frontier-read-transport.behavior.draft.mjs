import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Exactly42 retained cases plus10 closed-request/result metadata cases.
// Every exchange below is owned synthetic code returning declared text only.
// No endpoint, real RPC, native owner, SDK, work producer or signer runs.
assert.equal(process.argv.length, 2);
const pins = [
  ['../src/zenon/dynamic-plasma-account-frontier-read.js', 7417, '283209685a41aed5647c87e33d046d1f81b3a6820ea6ea307c11d2f99b91020d'],
  ['../src/zenon/dynamic-plasma-account-frontier-read-transport.js', 3690, 'c5c99de7d6f843e996fa5de5a646ddc869e27cdc2acc29206b97f34555bdcaa7'],
];
const sources = new Map();
for (const [path, bytes, sha256] of pins) {
  const raw = readFileSync(new URL(path, import.meta.url));
  assert.equal(raw.length, bytes); assert.equal(createHash('sha256').update(raw).digest('hex'), sha256);
  assert.equal(/[^\x00-\x7f]/.test(raw.toString('utf8')) || raw.includes(0), false);
  sources.set(path, raw.toString('ascii'));
}
const { createZenonAccountFrontierReadTransport: createTransport }
  = await import('../src/zenon/dynamic-plasma-account-frontier-read-transport.js');
const { decodeZenonAccountFrontierReadResult: decodeResult, decodeZenonAccountFrontierRead: decodeFrame }
  = await import('../src/zenon/dynamic-plasma-account-frontier-read.js');
const { DeclaredDynamicPlasmaUserSendAdapter: Adapter }
  = await import('../src/zenon/declared-dynamic-plasma-user-send-adapter.js');
const { frontierReadBlockFixture: block, frontierReadFrameFixture: frame }
  = await import('./dynamic-plasma-account-frontier-read.behavior.draft.mjs');
const { rawAdapterViewFixture: view, rawAdapterMaterialFixture: material }
  = await import('./dynamic-plasma-raw-adapter.behavior.draft.mjs');

const METHOD = 'ledger.getFrontierAccountBlock';
function request(address = view().payerAddress, method = METHOD) {
  return Object.freeze({ method, params: Object.freeze([address]) });
}
function resultInput(resultJson, value = view()) {
  return { frontierReadVersion: 1, phase: 'UNSIGNED', expectedChainIdentifier: '73404',
    payerAddress: value.payerAddress, resultJson };
}
function resultError(error) {
  assert.ok(error instanceof TypeError && Object.isFrozen(error));
  assert.equal(error.code, 'zenon_account_frontier_read_input_rejected');
  assert.equal(error.message, error.code); assert.equal(error.stack, 'TypeError: ' + error.code);
  assert.equal(Object.hasOwn(error, 'cause'), false); return true;
}
function transportError(kind) {
  return error => {
    assert.ok(error instanceof Error && Object.isFrozen(error));
    assert.equal(error.code, 'dynamic_plasma_json_rpc_read_transport_' + kind);
    assert.equal(Object.hasOwn(error, 'cause'), false);
    assert.equal(error.stack.includes('PRIVATE'), false); return true;
  };
}

test('closed frontier transport emits only the canonical payer read request and returns exact result text', { timeout: 5000 }, async () => {
  const value = view(), expected = JSON.stringify(block(value)), seen = [];
  const transport = createTransport({ exchange: body => {
    seen.push(body); return Promise.resolve(frame(block(value), JSON.parse(body).id));
  } });
  const pending = transport.callRead(request(value.payerAddress));
  assert.equal(await pending, expected);
  assert.deepEqual(seen, ['{"jsonrpc":"2.0","id":1,"method":"' + METHOD + '","params":["' + value.payerAddress + '"]}']);
  assert.deepEqual(Object.keys(transport), ['callRead']);
  assert.ok(Object.isFrozen(transport) && Object.isFrozen(transport.callRead));
});

test('closed frontier result flows through the frameless decoder and existing unsigned DP stages', { timeout: 5000 }, async () => {
  const value = view(), seen = [], adapter = new Adapter();
  const transport = createTransport({ exchange: body => {
    const parsed = JSON.parse(body); seen.push(parsed); return Promise.resolve(frame(block(value), parsed.id));
  } });
  const text = await transport.callRead(request(value.payerAddress));
  value.accountFrontier = decodeResult(resultInput(text, value));
  const observation = adapter.createObservationInput(value), quote = await adapter.quote(value);
  const work = await adapter.createWorkRequest(value, quote), assembly = await adapter.assemble(value, quote, material());
  assert.equal(assembly.accountBlock.previousHash, value.accountFrontier.hash);
  assert.equal(work.accountBlock.height, value.accountFrontier.height + 1);
  assert.equal(assembly.quoteRequestContextDigest, observation.expectedRequestContextDigest);
  assert.deepEqual(await adapter.validateUnsigned(value, quote, assembly.accountBlock), assembly.validation);
  assert.equal(seen.length, 1); assert.equal(seen[0].method, METHOD);
  assert.equal(assembly.authority, 'NONE'); assert.equal(assembly.accountBlock.signature, '');
});

test('closed frontier transport refuses other methods parameters and mutable requests before exchange', { timeout: 5000 }, async () => {
  const value = view(), seen = [], transport = createTransport({ exchange: body => {
    seen.push(JSON.parse(body)); return Promise.resolve(frame(block(value), JSON.parse(body).id));
  } });
  const bad = [
    request(value.payerAddress, 'ledger.publishRawTransaction'),
    request(value.payerAddress, 'ledger.getFrontierMomentum'),
    request(value.payerAddress, 'embedded.plasma.getRequiredPoWForAccountBlock'),
    request(value.payerAddress, METHOD + '\n'), request('not-an-address'),
    { method: METHOD, params: Object.freeze([value.payerAddress]) },
    Object.freeze({ method: METHOD, params: [value.payerAddress] }),
    Object.freeze({ method: METHOD, params: Object.freeze([]) }),
    Object.freeze({ method: METHOD, params: Object.freeze([value.payerAddress, value.payerAddress]) }),
    Object.freeze({ ...request(), phase: 'SIGNED' }),
  ];
  for (const input of bad) await assert.rejects(transport.callRead(input), transportError('input_rejected'));
  assert.equal(seen.length, 0);
  await transport.callRead(request(value.payerAddress)); assert.equal(seen[0].id, 1);
});

test('closed frontier transport rejects hostile descriptors proxies and constructor extras without hooks', { timeout: 5000 }, async () => {
  const value = view(); let hooks = 0, exchanges = 0;
  const hook = () => { hooks += 1; throw Error('HOOK'); };
  const exchange = () => { exchanges += 1; return Promise.resolve(frame()); };
  const transport = createTransport({ exchange });
  const getter = {}; Object.defineProperty(getter, 'method', { get: hook, enumerable: true });
  getter.params = Object.freeze([value.payerAddress]); Object.freeze(getter);
  const proxy = new Proxy(request(), { get: hook, ownKeys: hook, getPrototypeOf: hook, getOwnPropertyDescriptor: hook });
  const params = [value.payerAddress]; Object.defineProperty(params, '0', { get: hook, enumerable: true }); Object.freeze(params);
  const decorated = [value.payerAddress]; decorated[Symbol.iterator] = hook; Object.freeze(decorated);
  const sparse = new Array(1); Object.freeze(sparse);
  for (const input of [getter, proxy, Object.freeze({ method: METHOD, params }),
    Object.freeze({ method: METHOD, params: decorated }), Object.freeze({ method: METHOD, params: sparse })]) {
    await assert.rejects(transport.callRead(input), transportError('input_rejected'));
  }
  const options = {}; Object.defineProperty(options, 'exchange', { get: hook, enumerable: true });
  assert.throws(() => createTransport(options), transportError('configuration_rejected'));
  assert.throws(() => createTransport({ exchange, endpoint: 'https://unused.invalid' }), transportError('configuration_rejected'));
  assert.throws(() => createTransport({ exchange: new Proxy(exchange, { apply: hook }) }), transportError('configuration_rejected'));
  assert.throws(() => createTransport({ exchange }, null), transportError('configuration_rejected'));
  assert.equal(hooks, 0); assert.equal(exchanges, 0);
});

test('closed frontier transport keeps one pending exchange and does not burn IDs on busy reentry', { timeout: 5000 }, async () => {
  const value = view(), seen = []; let respond;
  const transport = createTransport({ exchange: body => {
    seen.push(JSON.parse(body)); return new Promise(resolve => { respond = resolve; });
  } });
  const first = transport.callRead(request(value.payerAddress));
  await assert.rejects(transport.callRead(request(value.payerAddress)), transportError('busy'));
  assert.equal(seen.length, 1); respond(frame(block(value), 1)); await first;
  const second = transport.callRead(request(value.payerAddress));
  assert.deepEqual(seen.map(row => row.id), [1, 2]); respond(frame(block(value), 2)); await second;
});

test('closed frontier transport sanitizes failed correlation and exchange results without automatic retries', { timeout: 5000 }, async () => {
  const value = view();
  const failures = [
    () => Promise.resolve(frame(block(value), 2)),
    () => Promise.resolve('{"jsonrpc":"2.0","id":1,"error":{"message":"PRIVATE"}}'),
    () => Promise.resolve('not-json'), () => Promise.resolve({ result: block(value) }),
    () => { throw Error('PRIVATE'); }, () => Promise.reject(Error('PRIVATE')),
  ];
  for (const failure of failures) {
    let calls = 0; const transport = createTransport({ exchange: () => { calls += 1; return failure(); } });
    await assert.rejects(transport.callRead(request(value.payerAddress)), transportError('unavailable'));
    assert.equal(calls, 1);
  }
  let calls = 0; const unavailable = createTransport({ exchange: () => { calls += 1; return Promise.resolve(frame(null)); } });
  const text = await unavailable.callRead(request(value.payerAddress)); assert.equal(text, 'null');
  assert.throws(() => decodeResult(resultInput(text, value)), resultError); assert.equal(calls, 1);
});

test('closed frontier transport bounds explicit handoffs to32 without reset retry or extra exchange', { timeout: 5000 }, async () => {
  const value = view(), ids = [], transport = createTransport({ exchange: body => {
    const id = JSON.parse(body).id; ids.push(id); return Promise.resolve(frame(block(value), id));
  } });
  for (let index = 0; index < 32; index += 1) await transport.callRead(request(value.payerAddress));
  assert.deepEqual(ids, Array.from({ length: 32 }, (_, index) => index + 1));
  await assert.rejects(transport.callRead(request(value.payerAddress)), transportError('exhausted'));
  assert.equal(ids.length, 32); assert.equal(transport.reset, undefined);
});

test('frameless frontier decoder is explicit syntax projection and never fabricates request correlation', { timeout: 5000 }, async () => {
  const value = view(), raw = JSON.stringify(block(value)), input = resultInput(raw, value);
  assert.deepEqual(decodeResult(input), decodeFrame({ frontierReadVersion: 1, phase: 'UNSIGNED',
    expectedChainIdentifier: '73404', payerAddress: value.payerAddress, requestId: 17,
    responseJson: frame(block(value), 17) }));
  assert.deepEqual(decodeResult(input), value.accountFrontier);
  for (const resultJson of ['null', frame(), '{"height":6}', raw.replace('"height":6,', '"height":6.0,'),
    raw.replace('"height":6,', '"height":6,"height":6,'), raw + ',"id":2', raw + 'garbage']) {
    assert.throws(() => decodeResult({ ...input, resultJson }), resultError);
  }
  assert.throws(() => decodeResult({ ...input, requestId: 17 }), resultError);
  assert.throws(() => decodeResult({ ...input, phase: 'SIGNED' }), resultError);
  assert.throws(() => decodeResult({ ...input, frontierReadVersion: 2 }), resultError);
  assert.throws(() => decodeResult(input, null), resultError);
  assert.equal(Object.hasOwn(decodeResult(input), 'requestId'), false);
  assert.equal(Object.hasOwn(decodeResult(input), 'authenticated'), false);
  let hooks = 0; const hostile = { ...input };
  Object.defineProperty(hostile, 'resultJson', { get() { hooks += 1; throw Error('HOOK'); }, enumerable: true });
  assert.throws(() => decodeResult(hostile), resultError); assert.equal(hooks, 0);
});

test('closed frontier transport uses its captured encoder without caller JSON serialization hooks', { timeout: 5000 }, async () => {
  const value = view(), response = frame(block(value)), transport = createTransport({ exchange: () => Promise.resolve(response) });
  const input = request(value.payerAddress), original = JSON.stringify; let hooks = 0, pending;
  JSON.stringify = () => { hooks += 1; throw Error('OVERRIDE'); };
  try { pending = transport.callRead(input); }
  finally { JSON.stringify = original; }
  assert.equal(await pending, JSON.stringify(block(value))); assert.equal(hooks, 0);
});

test('closed frontier adapter preserves the framed decoder prefix and creates no native owner or signing capability', { timeout: 5000 }, async () => {
  const decoder = sources.get('../src/zenon/dynamic-plasma-account-frontier-read.js');
  assert.equal(decoder.indexOf('\n/**\n * Explicit result-text seam'), 6038);
  assert.equal(createHash('sha256').update(decoder.slice(0, 6038)).digest('hex'),
    '62d4dea4b5928c2643ec90bc1344b6a1d3be346bd5fd556f6f559e49a7aa239a');
  const source = sources.get('../src/zenon/dynamic-plasma-account-frontier-read-transport.js');
  assert.match(source, /const CORE = createBoundedJsonRpcReadTransportCore/);
  assert.match(source, /const MAX_REQUESTS = 32/); assert.match(source, /const METHOD = 'ledger.getFrontierAccountBlock'/);
  assert.doesNotMatch(source, /node:(?:fs|https?|tls|dns|child_process|worker_threads)|new Promise|fetch\s*\(|generateKeyPair|randomBytes|crypto\.sign|crypto\.verify|prepareBlock|publishRawTransaction/);
  assert.equal((source.match(/^export /gm) ?? []).length, 1);
  const transport = createTransport({ exchange: () => Promise.resolve(frame()) });
  for (const key of ['prepareUnsigned', 'sign', 'publish', 'close', 'reset', 'READY']) assert.equal(transport[key], undefined);
  assert.deepEqual(Object.keys(transport), ['callRead']);
});
