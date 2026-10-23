/* DATA-only tests. The effectful bounded funding adapter is NOT imported.
 * Fixed public bytes are DATA; no nonce/key/signature/SDK/SQL/network operation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { captureZenonDynamicPlasmaBoundedOriginalFundingConfiguration as CAPTURE } from '../src/zenon/dynamic-plasma-bounded-original-funding-configuration.js';

const PUBLIC = Buffer.alloc(32, 7).toString('base64');
let callbackInvocations = 0, traps = 0;
const forbidden = () => { callbackInvocations++; throw new Error('CAPABILITY_MUST_NOT_RUN'); };
function fixture() {
  return { readOptions: { accountExchange: forbidden, transports: [] },
    materialOptions: { publicKey: PUBLIC, startNonce: '0102030405060708',
      limits: { maxAttempts: 4096, maxDifficulty: 1000 } },
    materialWaitMs: 250, wallet: { getAddress: forbidden, sign: forbidden },
    store: { borrowedOpaqueHandle: true }, fundingResourceUrl: 'https://resource.invalid/paid',
    deadlineMs: 200, fetchImpl: forbidden };
}
function refusal(problem) {
  const code = 'zenon_bounded_original_funding_configuration_rejected';
  assert.ok(problem instanceof TypeError && Object.isFrozen(problem));
  assert.equal(problem.code, code); assert.equal(problem.message, code);
  assert.equal(problem.stack, 'TypeError: ' + code); return true;
}
function reject(mutate) {
  const value = fixture(); mutate(value); assert.throws(() => CAPTURE(value), refusal);
}
function trapped(value) {
  const fail = () => { traps++; throw new Error('PROXY_MUST_NOT_BE_INSPECTED'); };
  return new Proxy(value, { get: fail, ownKeys: fail, getPrototypeOf: fail,
    getOwnPropertyDescriptor: fail, apply: fail });
}

test('capture detaches the explicit material budget and preserves borrowed handle identities without invoking them', () => {
  const input = fixture(), result = CAPTURE(input);
  assert.equal(Object.getPrototypeOf(result), null); assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.materialOptions)); assert.ok(Object.isFrozen(result.materialOptions.limits));
  assert.deepEqual(result.materialOptions, input.materialOptions);
  for (const field of ['readOptions', 'wallet', 'store', 'fetchImpl']) assert.equal(result[field], input[field]);
  for (const field of ['readOptions', 'wallet', 'store']) assert.equal(Object.isFrozen(input[field]), false);
  assert.equal(callbackInvocations, 0);
});
test('separate DATA captures do not share or consume an operational producer or owner', () => {
  const input = fixture(), a = CAPTURE(input), b = CAPTURE(input);
  assert.notEqual(a, b); assert.notEqual(a.materialOptions, b.materialOptions);
  assert.notEqual(a.materialOptions.limits, b.materialOptions.limits);
  assert.deepEqual(Object.keys(a).sort(), Object.keys(input).sort());
  assert.equal(callbackInvocations, 0);
});
test('later caller mutations cannot change the captured public bytes cursor count or wait budgets', () => {
  const input = fixture(), result = CAPTURE(input);
  input.materialOptions.publicKey = 'changed'; input.materialOptions.startNonce = 'changed';
  input.materialOptions.limits.maxAttempts = 1; input.materialOptions.limits.maxDifficulty = 1;
  input.materialWaitMs = 1; input.deadlineMs = 1; input.fundingResourceUrl = 'changed'; input.store = {};
  assert.equal(result.materialOptions.publicKey, PUBLIC); assert.equal(result.materialOptions.startNonce, '0102030405060708');
  assert.deepEqual(result.materialOptions.limits, { maxAttempts: 4096, maxDifficulty: 1000 });
  assert.equal(result.materialWaitMs, 250); assert.equal(result.deadlineMs, 200);
  assert.equal(result.fundingResourceUrl, 'https://resource.invalid/paid');
  assert.equal(result.store.borrowedOpaqueHandle, true);
});
test('arity and non-record configurations fail without fallback or defaults', () => {
  for (const args of [[], [fixture(), fixture()], [null], [undefined], [true], [1], ['record'], [[]], [forbidden]])
    assert.throws(() => Reflect.apply(CAPTURE, undefined, args), refusal);
});
test('closed top-level schema refuses missing extra symbol and supplied factory or material callback fields', () => {
  for (const field of Object.keys(fixture())) reject(value => { delete value[field]; });
  for (const field of ['materialExchange', 'preparerFactory', 'ownerFactory', 'preflight', 'extra', Symbol('extra')])
    reject(value => { value[field] = forbidden; });
});
test('top material and limit records must have their own plain-object prototype', () => {
  for (const level of ['top', 'material', 'limits']) for (const proto of [null, { inherited: true }]) {
    const value = fixture(), original = level === 'top' ? value : level === 'material' ? value.materialOptions : value.materialOptions.limits;
    const changed = Object.assign(Object.create(proto), original);
    if (level === 'top') assert.throws(() => CAPTURE(changed), refusal);
    else { if (level === 'material') value.materialOptions = changed; else value.materialOptions.limits = changed;
      assert.throws(() => CAPTURE(value), refusal); }
  }
});
test('proxy records and operational handles are rejected without inspecting traps', () => {
  assert.throws(() => CAPTURE(trapped(fixture())), refusal);
  for (const field of ['materialOptions', 'readOptions', 'wallet', 'store', 'fetchImpl'])
    reject(value => { value[field] = trapped(value[field]); });
  reject(value => { value.materialOptions.limits = trapped(value.materialOptions.limits); });
  assert.equal(traps, 0);
});
test('accessors are refused at every captured DATA level without getter execution', () => {
  for (const field of Object.keys(fixture())) reject(value => {
    Object.defineProperty(value, field, { enumerable: true, get: forbidden });
  });
  for (const field of ['publicKey', 'startNonce', 'limits']) reject(value => {
    Object.defineProperty(value.materialOptions, field, { enumerable: true, get: forbidden });
  });
  for (const field of ['maxAttempts', 'maxDifficulty']) reject(value => {
    Object.defineProperty(value.materialOptions.limits, field, { enumerable: true, get: forbidden });
  });
  assert.equal(callbackInvocations, 0);
});
test('nonenumerable fields and extra material or limit keys cannot be silently ignored', () => {
  reject(value => { Object.defineProperty(value, 'store', { enumerable: false }); });
  reject(value => { Object.defineProperty(value.materialOptions, 'publicKey', { enumerable: false }); });
  reject(value => { Object.defineProperty(value.materialOptions.limits, 'maxAttempts', { enumerable: false }); });
  reject(value => { value.materialOptions.extra = true; });
  reject(value => { value.materialOptions.limits.continueFromPrevious = true; });
});
test('public bytes require canonical 32-byte base64 without key generation or curve claims', () => {
  for (const key of [null, 1, '', PUBLIC.slice(0, -1), PUBLIC + '=', Buffer.alloc(31).toString('base64'),
    Buffer.alloc(33).toString('base64'), PUBLIC.slice(0, -2) + 'd=', PUBLIC.replace('/', '_') + ' '])
    reject(value => { value.materialOptions.publicKey = key; });
});
test('the nonce cursor is explicit eight-byte lowercase hex and is never searched or defaulted', () => {
  for (const nonce of [null, 0, '', '0'.repeat(15), '0'.repeat(17), 'GG'.repeat(8), 'AB'.repeat(8), ' 0000000000000000'])
    reject(value => { value.materialOptions.startNonce = nonce; });
  assert.equal(CAPTURE(fixture()).materialOptions.startNonce, '0102030405060708');
});
test('candidate count is an explicit safe integer from zero through 4096 with no renewal', () => {
  for (const limit of [-0, -1, 4097, 1.5, NaN, Infinity, '4096', null, 1n])
    reject(value => { value.materialOptions.limits.maxAttempts = limit; });
  for (const limit of [0, 1, 4096]) {
    const value = fixture(); value.materialOptions.limits.maxAttempts = limit;
    assert.equal(CAPTURE(value).materialOptions.limits.maxAttempts, limit);
  }
});
test('difficulty remains declared safe DATA with no implicit maximum or actual work predicate', () => {
  for (const limit of [-0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1', null, 1n])
    reject(value => { value.materialOptions.limits.maxDifficulty = limit; });
  for (const limit of [0, 1, Number.MAX_SAFE_INTEGER]) {
    const value = fixture(); value.materialOptions.limits.maxDifficulty = limit;
    assert.equal(CAPTURE(value).materialOptions.limits.maxDifficulty, limit);
  }
});
test('material wait and request deadline stay separate explicit bounded scalar budgets', () => {
  for (const field of ['materialWaitMs', 'deadlineMs']) for (const limit of [-0, 0, -1, 60001, 1.5, NaN, Infinity, '1', null])
    reject(value => { value[field] = limit; });
  for (const limit of [1, 60000]) {
    const value = fixture(); value.materialWaitMs = limit; value.deadlineMs = limit;
    const result = CAPTURE(value); assert.equal(result.materialWaitMs, limit); assert.equal(result.deadlineMs, limit);
  }
});
test('borrowed handles need object or function kinds but are not inspected as wallet store or transport brands', () => {
  for (const field of ['readOptions', 'wallet', 'store']) for (const wrong of [null, undefined, false, 1, 'handle', forbidden])
    reject(value => { value[field] = wrong; });
  for (const wrong of [null, undefined, false, 1, 'fetch', {}]) reject(value => { value.fetchImpl = wrong; });
  const value = fixture(), opaque = Object.create(null);
  Object.defineProperty(opaque, 'load', { get: forbidden }); value.store = opaque;
  assert.equal(CAPTURE(value).store, opaque); assert.equal(callbackInvocations, 0);
});
test('resource capture bounds string DATA without fetching or claiming canonical store agreement', () => {
  for (const wrong of ['', null, undefined, 1, {}, 'x'.repeat(4097)]) reject(value => { value.fundingResourceUrl = wrong; });
  const value = fixture(); value.fundingResourceUrl = 'x'.repeat(4096);
  assert.equal(CAPTURE(value).fundingResourceUrl.length, 4096); assert.equal(callbackInvocations, 0);
});
test('safe failures contain neither caller DATA nor operational capability invocation', () => {
  const value = fixture(); value.materialOptions.publicKey = 'PRIVATE_SENTINEL_MUST_NOT_APPEAR';
  assert.throws(() => CAPTURE(value), problem => {
    refusal(problem); assert.equal(String(problem).includes('PRIVATE_SENTINEL'), false); return true;
  });
  assert.equal(callbackInvocations, 0); assert.equal(traps, 0);
  console.log('# bounded-original-funding-config-only ' + JSON.stringify({ cases: 17,
    callbackInvocations, proxyTraps: traps, SDK: 0, SQLite: 0, nonceProducerImported: false,
    effectfulAdapterImported: false, candidateEvaluations: 0, keys: 0, signatures: 0,
    network: 0, newTasks: 0, newScratch: 0, fullBoundedFundingQualified: false }));
});
