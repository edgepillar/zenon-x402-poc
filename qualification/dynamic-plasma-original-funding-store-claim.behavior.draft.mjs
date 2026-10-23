/*
 * Actual SDK/SQL-free store-object claim primitive, not a native store double
 * qualification. All objects below are explicitly declared opaque fixtures.
 * No real owner import, wallet, crypto signature, SDK, SQL, network or payment.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as module from '../src/zenon/dynamic-plasma-original-funding-store-claim.js';

assert.equal(process.argv.length, 2);
const CLAIM = module.claimZenonDynamicPlasmaOriginalFundingStore;
const OPTIONS = { timeout: 5000, concurrency: false };
const calls = { claims: 0, firstClaims: 0, alreadyClaimed: 0, invalidInputs: 0, hooks: 0 };
function claim(...args) {
  assert.ok(++calls.claims <= 128);
  try { const out = CLAIM(...args); calls.firstClaims++; return out; }
  catch (error) {
    if (error.code.endsWith('_already_claimed')) calls.alreadyClaimed++;
    else if (error.code.endsWith('_input_rejected')) calls.invalidInputs++;
    else throw error;
    throw error;
  }
}
function refusal(kind) {
  return error => {
    const code = 'zenon_dynamic_plasma_original_funding_store_claim_' + kind;
    assert.ok(error instanceof TypeError && Object.isFrozen(error));
    assert.equal(error.code, code); assert.equal(error.message, code);
    assert.equal(error.stack, 'TypeError: ' + code); assert.equal(Object.hasOwn(error, 'cause'), false);
    return true;
  };
}
const used = refusal('already_claimed'), invalid = refusal('input_rejected');
function hook() { calls.hooks++; throw Error('PRIVATE'); }

test('store claim permits one actual primitive claim and refuses the same opaque object thereafter', OPTIONS, () => {
  const store = {}, receipt = claim(store);
  assert.equal(receipt.storeClaimVersion, 1);
  assert.equal(receipt.scope, 'ONE_STORE_OBJECT_IN_THIS_MODULE_INSTANCE');
  assert.equal(receipt.released, false); assert.equal(receipt.authority, 'NONE');
  assert.throws(() => claim(store), used);
});
test('store claim treats distinct object identities separately without claiming same-file or restart authority', OPTIONS, () => {
  const one = { declaredFile: 'synthetic.db' }, two = { declaredFile: 'synthetic.db' };
  assert.equal(claim(one), claim(two)); // Same DATA receipt, not an identity-bound capability.
  assert.throws(() => claim(one), used); assert.throws(() => claim(two), used);
});
test('store claim does not inspect opaque fields getters symbols or inherited accessors', OPTIONS, () => {
  const prototype = Object.create(null);
  Object.defineProperty(prototype, 'resourceUrl', { get: hook });
  const store = Object.create(prototype);
  for (const name of ['then', 'toJSON', 'load', 'close', 'prepareWithOriginalPaymentCheckpoint'])
    Object.defineProperty(store, name, { enumerable: true, get: hook });
  Object.defineProperty(store, Symbol.toStringTag, { get: hook });
  claim(store); assert.throws(() => claim(store), used); assert.equal(calls.hooks, 0);
});
test('store claim rejects proxies without invoking ownKeys prototype property or conversion hooks', OPTIONS, () => {
  for (const store of [
    new Proxy({}, { get: hook, getPrototypeOf: hook, ownKeys: hook }),
    new Proxy(Object.create(null), {}),
  ]) assert.throws(() => claim(store), invalid);
  assert.equal(calls.hooks, 0);
});
test('store claim rejects primitive callable missing and excess arguments before allocating ownership', OPTIONS, () => {
  for (const value of [null, undefined, false, true, 0, 1, 'store', Symbol('store'), () => hook()])
    assert.throws(() => claim(value), invalid);
  const store = {};
  assert.throws(() => claim(), invalid); assert.throws(() => claim(store, true), invalid);
  claim(store); assert.throws(() => claim(store), used);
});
test('store claim accepts frozen sealed and null-prototype opaque objects without mutating them', OPTIONS, () => {
  for (const store of [Object.freeze({}), Object.seal({}), Object.create(null)]) {
    const keys = Reflect.ownKeys(store), prototype = Object.getPrototypeOf(store);
    claim(store); assert.deepEqual(Reflect.ownKeys(store), keys); assert.equal(Object.getPrototypeOf(store), prototype);
    assert.throws(() => claim(store), used);
  }
});
test('store claim remains held when caller DATA says closed failed cancelled or commit outcome unknown', OPTIONS, () => {
  const store = { declaredState: 'OPEN' };
  claim(store);
  for (const state of ['CLOSED', 'PREPARE_REFUSED', 'CANCELLED', 'COMMIT_OUTCOME_UNKNOWN']) {
    store.declaredState = state;
    assert.throws(() => claim(store), used);
  }
});
test('store claim does not invoke a hostile prototype installed after the first claim', OPTIONS, () => {
  const store = {};
  claim(store);
  Object.setPrototypeOf(store, new Proxy({}, { get: hook, getPrototypeOf: hook, ownKeys: hook }));
  assert.throws(() => claim(store), used); assert.equal(calls.hooks, 0);
});
test('store claim captured native weak-set operations cannot be replaced by later prototype methods', OPTIONS, () => {
  const has = Object.getOwnPropertyDescriptor(WeakSet.prototype, 'has');
  const add = Object.getOwnPropertyDescriptor(WeakSet.prototype, 'add');
  const store = {};
  let receipt, firstError, secondError;
  try {
    Object.defineProperty(WeakSet.prototype, 'has', { ...has, value: hook });
    Object.defineProperty(WeakSet.prototype, 'add', { ...add, value: hook });
    try { receipt = claim(store); } catch (error) { firstError = error; }
    try { claim(store); } catch (error) { secondError = error; }
  } finally {
    Object.defineProperty(WeakSet.prototype, 'has', has);
    Object.defineProperty(WeakSet.prototype, 'add', add);
  }
  assert.equal(firstError, undefined); assert.equal(receipt.authority, 'NONE');
  assert.equal(used(secondError), true); assert.equal(calls.hooks, 0);
});
test('store claim returns immutable null-prototype DATA without retaining the supplied store handle', OPTIONS, () => {
  const store = { privateMarker: {} }, receipt = claim(store);
  assert.equal(Object.getPrototypeOf(receipt), null); assert.equal(Object.isFrozen(receipt), true);
  assert.deepEqual(Object.keys(receipt), ['storeClaimVersion', 'scope', 'released', 'authority']);
  for (const value of Object.values(receipt)) assert.notEqual(value, store);
  for (const name of Object.keys(receipt)) {
    const d = Object.getOwnPropertyDescriptor(receipt, name);
    assert.equal(d.writable, false); assert.equal(d.configurable, false); assert.equal(d.enumerable, true);
  }
  assert.equal(Object.isFrozen(store), false); assert.equal(Object.isFrozen(store.privateMarker), false);
});
test('store claim export has no release reset close sign prepare retry or dispatch capability', OPTIONS, () => {
  assert.deepEqual(Object.keys(module), ['claimZenonDynamicPlasmaOriginalFundingStore']);
  assert.equal(Object.isFrozen(CLAIM), true);
  const receipt = claim({});
  for (const key of ['release', 'reset', 'close', 'sign', 'prepare', 'retry', 'dispatch', 'store'])
    assert.equal(key in receipt, false);
});
test('store claim refusals are sanitized DATA and repeated refusal never consumes another object', OPTIONS, () => {
  const one = {}, two = {};
  claim(one);
  for (let i = 0; i < 4; i++) assert.throws(() => claim(one), used);
  claim(two); assert.throws(() => claim(two), used);
  assert.equal(calls.hooks, 0);
  process.stdout.write('# original-funding-store-claim-fixture ' + JSON.stringify(calls) + '\n');
});
