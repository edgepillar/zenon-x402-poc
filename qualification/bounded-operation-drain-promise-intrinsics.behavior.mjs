// Actual bounded-drain helper with synthetic callbacks and bounded real timers.
// No native resource owner, SDK, x402 package, SQL, socket, key, signing or work.
import assert from 'node:assert/strict';
import test from 'node:test';
import { types } from 'node:util';
import { observeServiceCreditOperationDrain as OBSERVE } from '../src/service-credit-bounded-operation-drain.js';

assert.equal(process.version, 'v24.19.0'); assert.equal(process.argv.length, 2);
assert.equal(process.env.X402_DRAIN_PROMISE_INTEGRITY, 'bounded-local-component-only');
assert.equal(process.env.NODE_DISABLE_COMPILE_CACHE, '1');
for (const name of ['NODE_OPTIONS','NODE_PATH','NODE_TEST_CONTEXT','NODE_V8_COVERAGE','NODE_COMPILE_CACHE'])
  assert.equal(process.env[name], undefined);
const Native = Promise, PROTO = Native.prototype, SPECIES = Symbol.species;
const GET = Object.getOwnPropertyDescriptor, DEFINE = Object.defineProperty, APPLY = Reflect.apply;
const descriptors = { then: GET(PROTO, 'then'), constructor: GET(PROTO, 'constructor'), species: GET(Native, SPECIES) };
const names = [], OPTIONS = { concurrency: false, timeout: 3000 };
let entered = 0, completed = 0, hooks = 0, newHelperInvocations = 0;
function observe(...args) { newHelperInvocations++; assert.ok(newHelperInvocations <= 96); return OBSERVE(...args); }
function clean() {
  assert.deepEqual(GET(PROTO, 'then'), descriptors.then);
  assert.deepEqual(GET(PROTO, 'constructor'), descriptors.constructor);
  assert.deepEqual(GET(Native, SPECIES), descriptors.species);
}
function shielded(value) {
  assert.equal(types.isPromise(value), true); assert.equal(Object.getPrototypeOf(value), PROTO);
  const d = GET(value, 'constructor'); assert.equal(d.value, Native);
  assert.equal(d.enumerable, false); assert.equal(d.writable, false); assert.equal(d.configurable, false);
}
function location(field) { return field === 'species' ? [Native, SPECIES] : [PROTO, field]; }
function patch(field) {
  const [owner, key] = location(field), before = GET(owner, key);
  if (field === 'then') DEFINE(owner, key, { ...before, value: function substitutedThen(...args) {
    hooks++; return APPLY(descriptors.then.value, this, args);
  } });
  else DEFINE(owner, key, { configurable: before.configurable, enumerable: before.enumerable,
    get() { hooks++; return Native; } });
  return () => DEFINE(owner, key, before);
}
function patchMetadata(field) {
  const [owner, key] = location(field), before = GET(owner, key);
  DEFINE(owner, key, { ...before, enumerable: !before.enumerable });
  return () => DEFINE(owner, key, before);
}
async function selected(name, run) {
  let passed = false; clean();
  await test(name, OPTIONS, async () => { entered++; await run(); completed++; passed = true; });
  clean(); if (!passed) throw new Error('BOUNDED_DRAIN_PROMISE_INTEGRITY_CASE_FAILED');
  names.push(name);
}
await selected('synchronous drain preserves success and returns a constructor-pinned native promise', async () => {
  let probes = 0; const value = observe(() => { probes++; return 'DRAINED'; }, 1000);
  shielded(value); assert.equal(await value, true); assert.equal(probes, 1);
});
await selected('native asynchronous drain preserves success and pins the public promise', async () => {
  let probes = 0; const value = observe(async () => { probes++; return 'DRAINED'; }, 1000);
  shielded(value); assert.equal(await value, true); assert.equal(probes, 1);
});
await selected('invalid input still resolves false with a safe public constructor', async () => {
  for (const value of [observe(), observe(null, 1), observe(() => 'DRAINED', 0)]) {
    shielded(value); assert.equal(await value, false);
  }
});
await selected('an own native-promise then getter is never consulted', async () => {
  const pending = Native.resolve('DRAINED');
  DEFINE(pending, 'then', { get() { hooks++; throw Error('PRIVATE'); } });
  assert.equal(await observe(() => pending, 1000), true); assert.equal(hooks, 0);
});
await selected('an immutable own native constructor remains a supported probe promise', async () => {
  const pending = Native.resolve('DRAINED'); DEFINE(pending, 'constructor', { value: Native });
  assert.equal(await observe(() => pending, 1000), true);
});
await selected('a mutable own data constructor keeps its previous supported meaning', async () => {
  const pending = Native.resolve('DRAINED');
  DEFINE(pending, 'constructor', { configurable: true, writable: true, value: Native });
  assert.equal(await observe(() => pending, 1000), true);
});
await selected('an own constructor getter remains unread and fails closed', async () => {
  const pending = Native.resolve('DRAINED');
  DEFINE(pending, 'constructor', { get() { hooks++; throw Error('PRIVATE'); } });
  assert.equal(await observe(() => pending, 1000), false); assert.equal(hooks, 0);
});
await selected('a different own promise constructor is refused without construction', async () => {
  const pending = Native.resolve('DRAINED');
  DEFINE(pending, 'constructor', { value: function notInvoked() { hooks++; throw Error('PRIVATE'); } });
  assert.equal(await observe(() => pending, 1000), false); assert.equal(hooks, 0);
});
await selected('late-added then hooks on fulfilled result objects are not assimilated', async () => {
  const result = {}, pending = Native.resolve(result);
  DEFINE(result, 'then', { get() { hooks++; throw Error('PRIVATE'); } });
  assert.equal(await observe(() => pending, 1000), false); assert.equal(hooks, 0);
});
await selected('subclass promises do not enter the native observer or a then getter', async () => {
  class Other extends Native {}
  const pending = new Other(resolve => resolve('DRAINED'));
  DEFINE(pending, 'then', { get() { hooks++; throw Error('PRIVATE'); } });
  assert.equal(await observe(() => pending, 1000), false); assert.equal(hooks, 0);
});
await selected('proxy results reject without prototype property or then traps', async () => {
  const trap = () => { hooks++; throw Error('PRIVATE'); };
  const pending = new Proxy({}, { get: trap, getPrototypeOf: trap, ownKeys: trap });
  assert.equal(await observe(() => pending, 1000), false); assert.equal(hooks, 0);
});
await selected('revoked proxy results do not escape the boolean drain boundary', async () => {
  const value = Proxy.revocable({}, {}); value.revoke();
  assert.equal(await observe(() => value.proxy, 1000), false);
});
for (const field of ['then','constructor','species']) {
  await selected('pre-admission ' + field + ' drift refuses without probe or getter entry', async () => {
    let probes = 0, value; const restore = patch(field);
    try { value = observe(() => { probes++; return 'DRAINED'; }, 1000); shielded(value); }
    finally { restore(); }
    assert.equal(await value, false); assert.equal(probes, 0); assert.equal(hooks, 0);
  });
}
for (const field of ['then','constructor','species']) {
  await selected('native-promise probe ' + field + ' drift refuses before a substituted observer', async () => {
    let probes = 0, restore = null; const pending = Native.resolve('DRAINED');
    const value = observe(() => { probes++; restore = patch(field); return pending; }, 1000);
    try { shielded(value); } finally { if (restore !== null) restore(); }
    assert.equal(await value, false); assert.equal(probes, 1); assert.equal(hooks, 0);
  });
}
for (const field of ['then','constructor','species']) {
  await selected('synchronous DRAINED cannot overrule post-probe ' + field + ' drift', async () => {
    let probes = 0, restore = null;
    const value = observe(() => { probes++; restore = patch(field); return 'DRAINED'; }, 1000);
    try { shielded(value); } finally { if (restore !== null) restore(); }
    assert.equal(await value, false); assert.equal(probes, 1); assert.equal(hooks, 0);
  });
}
for (const field of ['then','constructor','species']) {
  await selected('descriptor-only ' + field + ' drift also refuses before admission', async () => {
    let probes = 0, value; const restore = patchMetadata(field);
    try { value = observe(() => { probes++; return 'DRAINED'; }, 1000); }
    finally { restore(); }
    assert.equal(await value, false); assert.equal(probes, 0);
  });
}
await selected('drift visible when a pending probe settles cannot become clean drain', async () => {
  let resolveProbe; const pending = new Native(resolve => { resolveProbe = resolve; });
  const result = observe(() => pending, 1000), restore = patchMetadata('species');
  let outcome; try { resolveProbe('DRAINED'); outcome = await result; } finally { restore(); }
  assert.equal(outcome, false);
});
await selected('BUSY backoff stops before another probe after observed descriptor drift', async () => {
  let probes = 0; const result = observe(() => ++probes === 1 ? 'BUSY' : 'DRAINED', 1000);
  const restore = patchMetadata('species'); let outcome;
  try { outcome = await result; } finally { restore(); }
  assert.equal(outcome, false); assert.equal(probes, 1);
});
await selected('stable BUSY backoff still succeeds and retains the same pinned promise', async () => {
  let probes = 0; const result = observe(() => ++probes < 3 ? 'BUSY' : 'DRAINED', 1000);
  shielded(result); assert.equal(await result, true); assert.equal(probes, 3); shielded(result);
});
await selected('invalid arity under a constructor getter does not call that getter', async () => {
  let value; const restore = patch('constructor');
  try { value = observe(); shielded(value); } finally { restore(); }
  assert.equal(await value, false); assert.equal(hooks, 0);
});
await selected('a terminal historical result is not rewritten by later descriptor drift', async () => {
  const result = observe(() => 'DRAINED', 1000); assert.equal(await result, true);
  const restore = patchMetadata('species'); try { shielded(result); } finally { restore(); }
  assert.equal(await result, true); // Not a fresh native/store-close permit.
});
await selected('a separate healthy observation never upgrades an earlier false result', async () => {
  let first; const restore = patch('species');
  try { first = observe(() => 'DRAINED', 1000); } finally { restore(); }
  assert.equal(await first, false); assert.equal(await observe(() => 'DRAINED', 1000), true);
  assert.equal(await first, false); // Caller-owned HOLD/retry policy is unchanged.
});
clean(); assert.equal(entered, completed); assert.equal(entered, names.length);
assert.equal(new Set(names).size, names.length); assert.ok(entered >= 28 && entered <= 40); assert.equal(hooks, 0);
console.log('# bounded-drain-promise-intrinsics ' + JSON.stringify({ entered, completed, names, hooks,
  newHelperInvocations, realBoundedLocalTimerComponent: true, supportedNativePromisesPreserved: true,
  preAdmissionDriftRefused: true, postProbeDriftRefused: true, pendingOrBackoffDriftRefused: true,
  terminalResultNotRewritten: true, syntheticProbeCallbacksOnly: true,
  SDK: false, SQLite: false, x402PackageImports: false, network: false, nativeOwnerImported: false,
  keysGenerated: false, signatureOperations: 0, nonceSearches: 0, actualStoreCloseObserved: false,
  nativeTransportDrain: false, OSOrHostileCodeHardDeadline: false, authority: 'NONE' }));
// Relevant unchanged regression: its real helper implementation changed above.
await import('../test/service-credit-bounded-operation-drain.test.js');
