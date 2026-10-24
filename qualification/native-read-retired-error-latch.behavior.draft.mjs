// Actual shared leaf only: no native owner/HTTPS/SDK/SQL/signing import.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNativeReadRetiredErrorLatch as CREATE } from '../src/zenon/native-read-retired-error-latch.js';

assert.equal(process.version, 'v24.19.0'); assert.equal(process.platform, 'darwin');
assert.equal(process.arch, 'arm64'); assert.equal(process.argv.length, 2);
assert.equal(process.env.X402_RETIRED_READ_LATCH_SELECTION, 'five-sdk-free-leaf-cases');
assert.equal(process.env.NODE_DISABLE_COMPILE_CACHE, '1');
assert.ok(process.execArgv.includes('--permission'));
assert.ok(!process.execArgv.some(value => /allow-(?:child|worker|addons|fs-write)/.test(value)));
for (const name of ['NODE_OPTIONS', 'NODE_PATH', 'NODE_COMPILE_CACHE', 'NODE_V8_COVERAGE', 'NODE_TEST_CONTEXT'])
  assert.equal(process.env[name], undefined);

await test('retired error latch constructs inert frozen capabilities without authority or reset', () => {
  const latch = CREATE();
  assert.deepEqual(Object.keys(latch), ['onError', 'isLatched']);
  assert.equal(Object.isFrozen(latch), true); assert.equal(Object.isFrozen(latch.onError), true);
  assert.equal(Object.isFrozen(latch.isLatched), true); assert.equal(latch.isLatched(), false);
  assert.equal('reset' in latch, false);
});
await test('actual shared latch ignores error data getters and keeps the first true state', () => {
  let reads = 0;
  const errorData = Object.create(null);
  for (const name of ['message', 'stack', 'code', 'cause']) Object.defineProperty(errorData, name, {
    get() { reads++; throw new Error('ERROR_DATA_MUST_NOT_BE_READ'); },
  });
  const latch = CREATE();
  assert.equal(latch.onError(errorData), undefined); assert.equal(latch.isLatched(), true);
  assert.equal(latch.onError(null, undefined, false), undefined);
  assert.equal(latch.isLatched(), true); assert.equal(reads, 0);
});
await test('actual shared latch never touches proxy traps on an event argument', () => {
  let traps = 0;
  const refused = () => { traps++; throw new Error('PROXY_TRAP_MUST_NOT_RUN'); };
  const proxy = new Proxy({}, { get: refused, ownKeys: refused, getPrototypeOf: refused,
    getOwnPropertyDescriptor: refused, has: refused });
  const latch = CREATE();
  assert.equal(latch.onError(proxy), undefined); assert.equal(latch.isLatched(), true);
  assert.equal(traps, 0);
});
await test('separate native-owner latches stay independent and ignore the emitter receiver', () => {
  const first = CREATE(), second = CREATE();
  let reads = 0;
  const receiver = new Proxy({}, { get() { reads++; throw new Error('RECEIVER_MUST_NOT_BE_READ'); } });
  assert.equal(Reflect.apply(first.onError, receiver, [new Error('SYNTHETIC')]), undefined);
  assert.equal(first.isLatched(), true); assert.equal(second.isLatched(), false); assert.equal(reads, 0);
  second.onError(); assert.equal(second.isLatched(), true); assert.equal(first.isLatched(), true);
});
await test('invalid constructor or inspection arity refuses without clearing prior uncertainty', () => {
  const invalid = value => value instanceof TypeError && Object.isFrozen(value)
    && value.code === 'NATIVE_READ_RETIRED_ERROR_LATCH_INVALID_INPUT'
    && value.stack === 'TypeError: NATIVE_READ_RETIRED_ERROR_LATCH_INVALID_INPUT';
  assert.throws(() => CREATE(undefined), invalid);
  const latch = CREATE(); latch.onError();
  assert.throws(() => latch.isLatched(undefined), invalid);
  assert.equal(latch.isLatched(), true);
});
