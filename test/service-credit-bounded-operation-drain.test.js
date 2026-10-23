import assert from 'node:assert/strict';
import test from 'node:test';
import { observeServiceCreditOperationDrain as observe } from '../src/service-credit-bounded-operation-drain.js';

await test('synchronous DRAINED completes one observation', async () => {
  let calls = 0;
  assert.equal(await observe(() => { calls++; return 'DRAINED'; }, 1000), true);
  assert.equal(calls, 1);
});
await test('native async DRAINED is observed without a replacement operation', async () => {
  let calls = 0;
  assert.equal(await observe(async () => { calls++; return 'DRAINED'; }, 1000), true);
  assert.equal(calls, 1);
});
await test('BUSY observations back off and reach the same owned operation', async () => {
  let calls = 0;
  assert.equal(await observe(() => ++calls < 4 ? 'BUSY' : 'DRAINED', 1000), true);
  assert.equal(calls, 4);
});
await test('permanently BUSY is bounded and stops scheduling probes', async () => {
  let calls = 0;
  assert.equal(await observe(() => { calls++; return 'BUSY'; }, 10), false);
  const terminalCalls = calls;
  assert.ok(terminalCalls >= 1 && terminalCalls <= 64);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(calls, terminalCalls);
});
await test('a never-settling native probe cannot hold the public observation forever', async () => {
  let calls = 0;
  assert.equal(await observe(() => { calls++; return new Promise(() => {}); }, 10), false);
  assert.equal(calls, 1);
});
await test('late DRAINED cannot upgrade a timed-out observation', async () => {
  let release, calls = 0;
  const probe = new Promise(resolve => { release = resolve; });
  const result = await observe(() => { calls++; return probe; }, 10);
  assert.equal(result, false);
  release('DRAINED');
  await Promise.resolve(); await Promise.resolve();
  assert.equal(result, false); assert.equal(calls, 1);
});
await test('late BUSY cannot restart polling after timeout', async () => {
  let release, calls = 0;
  const probe = new Promise(resolve => { release = resolve; });
  assert.equal(await observe(() => { calls++; return probe; }, 10), false);
  release('BUSY');
  await Promise.resolve(); await Promise.resolve();
  assert.equal(calls, 1);
});
await test('UNKNOWN is terminal rather than retried', async () => {
  let calls = 0;
  assert.equal(await observe(() => { calls++; return 'UNKNOWN'; }, 1000), false);
  assert.equal(calls, 1);
});
await test('synchronous probe failure fails closed', async () => {
  assert.equal(await observe(() => { throw new Error('synthetic'); }, 1000), false);
});
await test('native probe rejection is observed and fails closed', async () => {
  assert.equal(await observe(async () => { throw new Error('synthetic'); }, 1000), false);
});
await test('invalid result data does not become DRAINED', async () => {
  for (const result of [true, false, null, undefined, 1, {}, 'BOUND', '']) {
    assert.equal(await observe(() => result, 1000), false);
  }
});
await test('arbitrary thenables are rejected without reading then', async () => {
  let getters = 0;
  const thenable = Object.defineProperty({}, 'then', { get() { getters++; throw new Error('not called'); } });
  assert.equal(await observe(() => thenable, 1000), false);
  assert.equal(getters, 0);
});
await test('a proxy probe is rejected without invoking its traps', async () => {
  let traps = 0;
  const probe = new Proxy(() => 'DRAINED', { apply() { traps++; return 'DRAINED'; } });
  assert.equal(await observe(probe, 1000), false); assert.equal(traps, 0);
});
await test('invalid budgets and argument counts do not call the probe', async () => {
  let calls = 0; const probe = () => { calls++; return 'DRAINED'; };
  for (const budget of [0, -1, 1001, 1.5, NaN, Infinity, '10', undefined]) {
    assert.equal(await observe(probe, budget), false);
  }
  assert.equal(await observe(probe), false);
  assert.equal(await observe(probe, 10, 'extra'), false);
  assert.equal(calls, 0);
});
await test('promise constructor accessors are not executed', async () => {
  let getters = 0;
  const promise = Promise.resolve('DRAINED');
  Object.defineProperty(promise, 'constructor', { get() { getters++; throw new Error('not called'); } });
  assert.equal(await observe(() => promise, 1000), false);
  assert.equal(getters, 0);
});
await test('an unexpected native promise result fails closed without retry', async () => {
  let calls = 0;
  assert.equal(await observe(async () => { calls++; return 'UNKNOWN'; }, 1000), false);
  assert.equal(calls, 1);
});

console.log('# bounded-operation-drain-runtime ' + JSON.stringify({
  node: process.versions.node, platform: process.platform, arch: process.arch,
}));
