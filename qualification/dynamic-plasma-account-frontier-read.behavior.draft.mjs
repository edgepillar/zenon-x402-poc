import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

// Register the unchanged32 raw-adapter cases plus10 frontier-read cases only.
// No SDK, native owner, real RPC, work producer or signature operation runs.
assert.equal(process.argv.length, 2);
const pins = [
  ['../src/zenon/bounded-json-rpc-read-core.js', 21759, '10cc529bfb0676bb03dc4dad56059663f4a578b586c52f6404fc859d27d18f76'],
  ['../src/zenon/dynamic-plasma-account-frontier-read.js', 7417, '283209685a41aed5647c87e33d046d1f81b3a6820ea6ea307c11d2f99b91020d'],
];
const sources = new Map();
for (const [path, bytes, sha256] of pins) {
  const raw = readFileSync(new URL(path, import.meta.url));
  assert.equal(raw.length, bytes); assert.equal(createHash('sha256').update(raw).digest('hex'), sha256);
  assert.equal(/[^\x00-\x7f]/.test(raw.toString('utf8')) || raw.includes(0), false);
  sources.set(path, raw.toString('ascii'));
}
const { decodeZenonAccountFrontierRead: decode }
  = await import('../src/zenon/dynamic-plasma-account-frontier-read.js');
const { snapshotBoundedJsonRpcReadResultText: resultText }
  = await import('../src/zenon/bounded-json-rpc-read-core.js');
const { DeclaredDynamicPlasmaUserSendAdapter: Adapter }
  = await import('../src/zenon/declared-dynamic-plasma-user-send-adapter.js');
const { rawAdapterViewFixture: view, rawAdapterMaterialFixture: material }
  = await import('./dynamic-plasma-raw-adapter.behavior.draft.mjs');

const copy = value => JSON.parse(JSON.stringify(value)); // Owned synthetic DATA only.
const ZERO = '0'.repeat(64);
function block(value = view()) {
  return { version: 1, chainIdentifier: 73404, blockType: 3,
    hash: value.accountFrontier.hash, previousHash: '77'.repeat(32), height: value.accountFrontier.height,
    momentumAcknowledged: { hash: '33'.repeat(32), height: 100 },
    address: value.payerAddress, toAddress: value.accepted.payTo,
    amount: value.accepted.amount, tokenStandard: value.accepted.asset, fromBlockHash: '88'.repeat(32),
    descendantBlocks: [], data: null, fusedPlasma: 0, difficulty: 0,
    nonce: '0000000000000000', basePlasma: 21000, usedPlasma: 21000,
    changesHash: ZERO, publicKey: '', signature: '',
    token: null, confirmationDetail: null, pairedAccountBlock: null };
}
function frame(result = block(), id = 1) { return JSON.stringify({ jsonrpc: '2.0', id, result }); }
function input(responseJson = frame(), value = view()) {
  return { frontierReadVersion: 1, phase: 'UNSIGNED', expectedChainIdentifier: '73404',
    payerAddress: value.payerAddress, requestId: 1, responseJson };
}
function rejected(error) {
  assert.ok(error instanceof TypeError && Object.isFrozen(error));
  assert.equal(error.code, 'zenon_account_frontier_read_input_rejected');
  assert.equal(error.message, error.code); assert.equal(error.stack, 'TypeError: ' + error.code);
  assert.equal(Object.hasOwn(error, 'cause'), false); return true;
}
function coreRejected(error) {
  assert.ok(error instanceof TypeError && Object.isFrozen(error));
  assert.equal(error.code, 'bounded_json_rpc_read_transport_core_input_rejected');
  assert.equal(Object.hasOwn(error, 'cause'), false); return true;
}

test('raw frontier read extracts only the expected four fields from the pinned full RPC result shape', { timeout: 5000 }, async () => {
  const value = view(), raw = block(value), source = input(frame(raw), value), before = copy(source);
  assert.equal(Object.keys(raw).length, 25); assert.equal(raw.blockType, 3);
  const result = decode(source);
  assert.deepEqual(result, value.accountFrontier);
  assert.deepEqual(Object.keys(result), ['address', 'chainIdentifier', 'hash', 'height']);
  assert.equal(typeof result.then, 'undefined'); assert.ok(Object.isFrozen(result));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result); assert.deepEqual(source, before);
  assert.throws(() => { result.height = 1; }, TypeError);
  assert.equal(Object.isFrozen(source), false);
});

test('raw frontier read connects the decoded sequence to existing DP request quote work assembly and consumer', { timeout: 5000 }, async () => {
  const adapter = new Adapter(), value = view();
  value.accountFrontier = decode(input(frame(block(value)), value));
  const request = adapter.createObservationInput(value), quote = await adapter.quote(value);
  const work = await adapter.createWorkRequest(value, quote), assembly = await adapter.assemble(value, quote, material());
  assert.equal(work.accountBlock.height, value.accountFrontier.height + 1);
  assert.equal(assembly.accountBlock.previousHash, value.accountFrontier.hash);
  assert.equal(assembly.quoteRequestContextDigest, request.expectedRequestContextDigest);
  assert.deepEqual(await adapter.validateUnsigned(value, quote, assembly.accountBlock), assembly.validation);
  const advanced = block(value); advanced.height += 1; advanced.hash = '99'.repeat(32);
  const current = { ...value, accountFrontier: decode(input(frame(advanced), value)) };
  await assert.rejects(adapter.createWorkRequest(current, quote), error => {
    assert.equal(error.code, 'zenon_declared_dp_adapter_input_rejected'); return true;
  });
});

test('raw frontier read never infers empty accounts from null zero missing or reduced results', { timeout: 5000 }, async () => {
  for (const result of [null, {}, [], false, 'unavailable',
    { address: view().payerAddress, chainIdentifier: 73404, hash: ZERO, height: 0 }]) {
    assert.throws(() => decode(input(frame(result))), rejected);
  }
  for (const changes of [{ hash: ZERO }, { height: 0 }, { hash: ZERO, height: 0 }]) {
    assert.throws(() => decode(input(frame({ ...block(), ...changes }))), rejected);
  }
  const missing = block(); delete missing.height;
  assert.throws(() => decode(input(frame(missing))), rejected);
  const unknown = { ...block(), runtimeReady: true };
  assert.throws(() => decode(input(frame(unknown))), rejected);
});

test('raw frontier read requires numeric source lexemes and reserves a safe next account height', { timeout: 5000 }, async () => {
  const source = frame(), base = input(source);
  for (const literal of ['"6"', '6.0', '6e0', '-0', '-1', '0', '6.00000000000000001',
    '9007199254740991.1', '9007199254740991', '9007199254740992', '18446744073709551615']) {
    const raw = source.replace('"height":6,', '"height":' + literal + ',');
    assert.notEqual(raw, source); assert.throws(() => decode({ ...base, responseJson: raw }), rejected);
  }
  const edge = source.replace('"height":6,', '"height":9007199254740990,');
  assert.equal(decode({ ...base, responseJson: edge }).height + 1, Number.MAX_SAFE_INTEGER);
  for (const [field, original, literal] of [
    ['chainIdentifier', '73404', '73404.000000000001'], ['chainIdentifier', '73404', '7.3404e4'],
    ['chainIdentifier', '73404', '"73404"'], ['version', '1', '1.0'], ['version', '1', '1e0'],
  ]) {
    const raw = source.replace('"' + field + '":' + original + ',', '"' + field + '":' + literal + ',');
    assert.throws(() => decode({ ...base, responseJson: raw }), rejected);
  }
  // A uint64 in an UNUSED field is not converted to a trusted rounded Number.
  const unused = source.replace('"difficulty":0,', '"difficulty":18446744073709551615,');
  assert.deepEqual(decode({ ...base, responseJson: unused }), view().accountFrontier);
});

test('raw frontier read checks expected payer chain request correlation and supported wire version', { timeout: 5000 }, async () => {
  const value = view(), source = input(), other = block(); other.address = value.accepted.payTo;
  for (const raw of [frame(other), frame({ ...block(), chainIdentifier: 73405 }),
    frame({ ...block(), version: 2 }), frame(block(), 2), frame(block(), '1'),
    frame({ ...block(), hash: 'AB'.repeat(32) }), frame({ ...block(), hash: 'ab'.repeat(32) + '\n' })]) assert.throws(() => decode({ ...source, responseJson: raw }), rejected);
  for (const changes of [
    { expectedChainIdentifier: '073404' }, { expectedChainIdentifier: '73404\n' }, { expectedChainIdentifier: 73404 },
    { expectedChainIdentifier: '9007199254740992' }, { payerAddress: 'not-an-address' },
    { requestId: 0 }, { requestId: 4294967296 }, { requestId: '1' },
  ]) assert.throws(() => decode({ ...source, ...changes }), rejected);
});

test('raw frontier read reuses duplicate envelope key UTF8 depth and byte refusals before native parsing', { timeout: 5000 }, async () => {
  const source = frame(), base = input(source);
  const invalid = [
    source.replace('"height":6,', '"height":6,"height":6,'),
    source.replace('"height":6,', '"height":6,"heig\\u0068t":6,'),
    source.replace('"confirmationDetail":null', '"confirmationDetail":{"x":1,"x":2}'),
    source.replace('"token":null', '"token":{"__proto__":{}}'),
    source.replace('"token":null', '"token":' + '['.repeat(20) + '0' + ']'.repeat(20)),
    source.replace('"jsonrpc":"2.0"', '"jsonrpc":"2.0","error":null'),
    source.replace('"jsonrpc":"2.0"', '"jsonrpc":"1.0"'),
    source.replace('"id":1,', '"id":1.0,'),
    source + 'garbage', '[' + source + ']', source.slice(0, -1),
    source.replace('"data":null', '"data":"\\ud800"'),
    source.replace('"data":null', '"data":"' + 'x'.repeat(65536) + '"'),
    source.replace('"data":null', '"data":"' + '\u20ac'.repeat(22000) + '"'),
  ];
  assert.ok(invalid.at(-1).length < 65536); assert.ok(Buffer.byteLength(invalid.at(-1)) > 65536);
  for (const raw of invalid) assert.throws(() => decode({ ...base, responseJson: raw }), rejected);
});

test('raw frontier read requires exact descriptor DATA inputs without hooks operations or authority fields', { timeout: 5000 }, async () => {
  const source = input(); let hooks = 0;
  const hook = () => { hooks += 1; throw new Error('HOOK'); };
  for (const field of Object.keys(source)) {
    const bad = { ...source }; Object.defineProperty(bad, field, { get: hook, enumerable: true });
    assert.throws(() => decode(bad), rejected);
  }
  const proxy = new Proxy(source, { get: hook, ownKeys: hook, getPrototypeOf: hook, getOwnPropertyDescriptor: hook });
  assert.throws(() => decode(proxy), rejected);
  for (const field of ['transport', 'callRead', 'signer', 'payment', 'consumedAuthority', 'READY']) {
    assert.throws(() => decode({ ...source, [field]: hook }), rejected);
  }
  for (const phase of ['SIGNED', 'VALIDATED', 'UNKNOWN', 'ACKNOWLEDGED']) {
    assert.throws(() => decode({ ...source, phase }), rejected);
  }
  assert.throws(() => decode({ ...source, frontierReadVersion: 2 }), rejected);
  assert.throws(() => decode({ ...source, responseJson: { toString: hook } }), rejected);
  assert.throws(() => decode(), rejected); assert.throws(() => decode(source, null), rejected);
  assert.equal(hooks, 0);
});

test('raw result text export preserves untouched numeric source without transport allocation or coercion', { timeout: 5000 }, async () => {
  const result = '{"n":9007199254740993,"nested":[null,true,"x"]}';
  const envelope = '{"result": ' + result + ', "id":1,"jsonrpc":"2.0"}';
  assert.equal(resultText(envelope, 1), result);
  for (const id of [0, -0, -1, 1.5, '1', 4294967296, null]) {
    assert.throws(() => resultText(envelope, id), coreRejected);
  }
  let hooks = 0; const text = { toString() { hooks += 1; throw Error('HOOK'); } };
  assert.throws(() => resultText(text, 1), coreRejected);
  assert.throws(() => resultText(envelope), coreRejected);
  assert.throws(() => resultText(envelope, 1, null), coreRejected); assert.equal(hooks, 0);
});

test('raw frontier read captures native parsing and never claims full block signature genesis or current-state validation', { timeout: 5000 }, async () => {
  const raw = { ...block(), signature: 'not-validated', publicKey: 'not-validated',
    confirmationDetail: { arbitraryDeclaredMetadata: true }, amount: 'not-validated' };
  const source = input(frame(raw)), expected = view().accountFrontier, original = JSON.parse;
  let calls = 0;
  JSON.parse = () => { calls += 1; throw Error('OVERRIDE'); };
  try { assert.deepEqual(decode(source), expected); }
  finally { JSON.parse = original; }
  assert.equal(calls, 0); assert.deepEqual(Object.keys(decode(source)), Object.keys(expected));
  for (const key of ['genesisMomentumHash', 'authenticated', 'authority', 'signatureValidated', 'READY']) {
    assert.equal(Object.hasOwn(decode(source), key), false);
  }
});

test('raw frontier read leaves every earlier core byte unchanged and imports no operational provider', { timeout: 5000 }, async () => {
  const source = sources.get('../src/zenon/bounded-json-rpc-read-core.js');
  assert.equal(source.indexOf('\n/**\n * Pure synchronous reuse'), 20906);
  assert.equal(createHash('sha256').update(source.slice(0, 20906)).digest('hex'),
    '5572d24175455c6b3a9924688d601d31585454ce62dac9eb27151d2a65c83fcd');
  const decoder = sources.get('../src/zenon/dynamic-plasma-account-frontier-read.js');
  assert.match(decoder, /const RESULT_TEXT = snapshotBoundedJsonRpcReadResultText/);
  assert.match(decoder, /const PARSE = JSON.parse/);
  assert.match(decoder, /descriptor\(context, 'source'\)/);
  assert.doesNotMatch(decoder, /node:(?:fs|https?|tls|dns|child_process|worker_threads)|new Promise|fetch\s*\(|createBoundedJsonRpcReadTransportCore\s*\(|generateKeyPair|randomBytes|crypto\.sign|crypto\.verify|prepareBlock|publishRawTransaction/);
  assert.equal((decoder.match(/^export /gm) ?? []).length, 2);
  assert.match(decoder, /export function decodeZenonAccountFrontierReadResult\(input\)/);
});

// Reuse owned declared node-result DATA without copying the fixture builders.
export { block as frontierReadBlockFixture, frame as frontierReadFrameFixture };
