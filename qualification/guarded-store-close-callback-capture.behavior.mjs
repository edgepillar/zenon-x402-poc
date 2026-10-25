// Actual guarded-close boundary, synthetic callbacks only. No native SQL/TLS owner.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeGuardedStoreCloseBoundary as BOUNDARY } from '../src/service-credit-native-guarded-store-close.js';

assert.equal(process.version, 'v24.19.0'); assert.equal(process.argv.length, 2);
assert.equal(process.env.X402_GUARDED_CLOSE_CAPTURE_SELECTION, 'module-private-callbacks-only');
assert.equal(process.env.X402_NATIVE_STORE_BOUNDARY_SELECTION, 'eighteen-boundary-three-join-data-cases-only');
assert.equal(process.env.NODE_DISABLE_COMPILE_CACHE, '1');
for (const key of ['NODE_OPTIONS','NODE_PATH','NODE_TEST_CONTEXT','NODE_V8_COVERAGE','NODE_COMPILE_CACHE'])
  assert.equal(process.env[key], undefined);
const F = Object.freeze, GET = Object.getOwnPropertyDescriptor, DEFINE = Object.defineProperty;
const CREATE = Object.create, PROTO = Object.prototype, fields = ['nativeGuard','closeResource'];
const names = [], OPTIONS = { concurrency: false, timeout: 3000 };
let entered = 0, completed = 0, hooks = 0, leakedCallbacks = 0, substitutedGuards = 0, substitutedCloses = 0;
function clean() { for (const field of fields) assert.equal(GET(PROTO, field), undefined); }
function error(value) {
  const code = 'native_guarded_store_close_input_rejected';
  assert.ok(value instanceof TypeError && Object.isFrozen(value));
  assert.equal(value.code, code); assert.equal(value.message, code);
  assert.equal(value.stack, 'TypeError: ' + code); assert.equal(Object.hasOwn(value, 'cause'), false); return true;
}
function fixture(allowed = true, afterClose = null) {
  const stats = { allowed, guards: 0, closes: 0, receivers: [] };
  const config = F({ nativeGuard: F(function actualGuard() {
    stats.guards++; assert.equal(this, undefined); assert.equal(arguments.length, 0);
    return stats.allowed;
  }), closeResource: F(function actualClose() {
    stats.closes++; assert.equal(this, undefined); assert.equal(arguments.length, 0);
    if (afterClose !== null) afterClose(stats);
  }) });
  return { config, stats };
}
function prototypeFields(selected, mode, work) {
  clean(); const fakeGuard = F(function neverSubstitutedGuard() { substitutedGuards++; return true; });
  const fakeClose = F(function neverSubstitutedClose() { substitutedCloses++; });
  for (const field of selected) {
    const value = field === 'nativeGuard' ? fakeGuard : fakeClose;
    if (mode === 'read-only-data' || mode === 'writable-data') DEFINE(PROTO, field, {
      configurable: true, writable: mode === 'writable-data', value });
    else {
      const descriptor = { configurable: true };
      if (mode !== 'setter-only') descriptor.get = function getter() { hooks++; return value; };
      if (mode !== 'getter-only') descriptor.set = function setter(callback) {
        hooks++; leakedCallbacks++; assert.equal(typeof callback, 'function');
        if (mode === 'setter-only') throw Error('PRIVATE_SETTER_MUST_NOT_RUN');
      };
      DEFINE(PROTO, field, descriptor);
    }
  }
  try { return work(); } finally { for (const field of selected) delete PROTO[field]; clean(); }
}
async function selected(name, run) {
  let passed = false; clean();
  await test(name, OPTIONS, async () => { entered++; await run(); completed++; passed = true; });
  clean(); if (!passed) throw new Error('GUARDED_CLOSE_CAPTURE_CASE_FAILED');
  names.push(name);
}
for (const selectedFields of [['nativeGuard'],['closeResource'],fields]) {
  for (const allowed of [false,true]) {
    await selected('accessors at ' + selectedFields.join('+') + ' cannot change an original guard=' + allowed, () => {
      const f = fixture(allowed);
      const b = prototypeFields(selectedFields, 'accessors', () => BOUNDARY(f.config));
      assert.equal(f.stats.guards, 0); assert.equal(f.stats.closes, 0);
      assert.equal(b.close(), allowed);
      assert.equal(f.stats.guards, allowed ? 2 : 1); assert.equal(f.stats.closes, allowed ? 1 : 0);
      assert.equal(b.snapshot().clean, allowed); assert.equal(b.snapshot().held, !allowed);
      assert.equal(b.snapshot().resourceCloseReturned, allowed);
      assert.equal(hooks, 0); assert.equal(leakedCallbacks, 0);
    });
  }
}
for (const mode of ['setter-only','getter-only','read-only-data','writable-data']) {
  for (const field of fields) {
    await selected(mode + ' at inherited ' + field + ' does not intercept valid construction', () => {
      const f = fixture(), b = prototypeFields([field], mode, () => BOUNDARY(f.config));
      assert.equal(b.close(), true); assert.equal(f.stats.guards, 2); assert.equal(f.stats.closes, 1);
      assert.equal(hooks, 0); assert.equal(substitutedGuards, 0); assert.equal(substitutedCloses, 0);
    });
  }
}
await selected('a rejected second callback cannot expose an already inspected private guard', () => {
  const f = fixture(), invalid = F({ nativeGuard: f.config.nativeGuard, closeResource: 1 });
  prototypeFields(fields, 'accessors', () => assert.throws(() => BOUNDARY(invalid), error));
  assert.equal(hooks, 0); assert.equal(leakedCallbacks, 0); assert.equal(f.stats.guards, 0); assert.equal(f.stats.closes, 0);
});
await selected('a mutable close callback refuses without partial capture exposure', () => {
  const f = fixture(), invalid = F({ nativeGuard: f.config.nativeGuard, closeResource: function mutableClose() {} });
  prototypeFields(fields, 'accessors', () => assert.throws(() => BOUNDARY(invalid), error));
  assert.equal(hooks, 0); assert.equal(leakedCallbacks, 0);
});
await selected('configuration own getters are not invoked even when prototype capture fields exist', () => {
  const f = fixture(), invalid = F({ get nativeGuard() { hooks++; throw Error('PRIVATE'); }, closeResource: f.config.closeResource });
  prototypeFields(fields, 'accessors', () => assert.throws(() => BOUNDARY(invalid), error));
  assert.equal(hooks, 0); assert.equal(leakedCallbacks, 0);
});
await selected('configuration proxies refuse before any capture or trap', () => {
  const trap = () => { hooks++; throw Error('PRIVATE'); };
  const proxy = new Proxy({}, { get: trap, getPrototypeOf: trap, ownKeys: trap, isExtensible: trap });
  prototypeFields(fields, 'accessors', () => assert.throws(() => BOUNDARY(proxy), error));
  assert.equal(hooks, 0); assert.equal(leakedCallbacks, 0);
});
await selected('invalid arity does not learn a private callback through inherited fields', () => {
  const f = fixture();
  prototypeFields(fields, 'accessors', () => { assert.throws(() => BOUNDARY(), error); assert.throws(() => BOUNDARY(f.config, true), error); });
  assert.equal(hooks, 0); assert.equal(leakedCallbacks, 0);
});
await selected('public frozen boundary and snapshots expose no original callback', () => {
  const f = fixture(), b = prototypeFields(fields, 'accessors', () => BOUNDARY(f.config));
  assert.deepEqual(Reflect.ownKeys(b).sort(), ['close','snapshot']); assert.ok(Object.isFrozen(b));
  assert.notEqual(b.close, f.config.closeResource); assert.notEqual(b.snapshot, f.config.nativeGuard);
  const snapshot = b.snapshot(); assert.ok(Object.isFrozen(snapshot));
  for (const value of Object.values(snapshot)) { assert.notEqual(value, f.config.nativeGuard); assert.notEqual(value, f.config.closeResource); }
  assert.equal(f.stats.guards, 0); assert.equal(f.stats.closes, 0);
});
await selected('prototype changes after construction do not replace the captured operations', () => {
  const f = fixture(), b = BOUNDARY(f.config);
  const result = prototypeFields(fields, 'accessors', () => b.close());
  assert.equal(result, true); assert.equal(f.stats.guards, 2); assert.equal(f.stats.closes, 1); assert.equal(hooks, 0);
});
await selected('prototype changes during the real guard cannot replace the pending close', () => {
  let guards = 0, closes = 0;
  const fakeGuard = F(function neverGuard() { substitutedGuards++; return true; });
  const fakeClose = F(function neverClose() { substitutedCloses++; });
  const config = F({ nativeGuard: F(function actualGuard() {
    guards++;
    if (guards === 1) for (const field of fields) DEFINE(PROTO, field, { configurable: true,
      get() { hooks++; return field === 'nativeGuard' ? fakeGuard : fakeClose; },
      set() { hooks++; leakedCallbacks++; } });
    return true;
  }), closeResource: F(function actualClose() { closes++; }) });
  const b = BOUNDARY(config); let result;
  try { result = b.close(); } finally { for (const field of fields) delete PROTO[field]; clean(); }
  assert.equal(result, true); assert.equal(guards, 2); assert.equal(closes, 1); assert.equal(hooks, 0);
});
await selected('post-close refusal still preserves actual returned-close evidence without retry', () => {
  const f = fixture(true, stats => { stats.allowed = false; });
  const b = prototypeFields(fields, 'accessors', () => BOUNDARY(f.config));
  assert.equal(b.close(), false); assert.equal(b.close(), false);
  const s = b.snapshot(); assert.equal(s.stage, 'HELD_AFTER_CLOSE_RETURN'); assert.equal(s.resourceCloseReturned, true);
  assert.equal(s.firstRefusal, 'AFTER_REFUSED'); assert.equal(f.stats.closes, 1); assert.equal(f.stats.guards, 2);
});
await selected('a refused original guard remains held after later repair and prototype restoration', () => {
  const f = fixture(false), b = prototypeFields(fields, 'accessors', () => BOUNDARY(f.config));
  assert.equal(b.close(), false); f.stats.allowed = true;
  assert.equal(b.close(), false); assert.equal(b.snapshot().held, true); assert.equal(f.stats.closes, 0); assert.equal(f.stats.guards, 1);
});
await selected('separate component instances are not deduplicated or granted native ownership', () => {
  const f = fixture(), pair = prototypeFields(fields, 'accessors', () => [BOUNDARY(f.config), BOUNDARY(f.config)]);
  assert.notEqual(pair[0], pair[1]); assert.equal(pair[0].close(), true); assert.equal(pair[1].close(), true);
  assert.equal(f.stats.closes, 2); assert.equal(f.stats.guards, 4);
  assert.equal(pair[0].snapshot().nativeHandleBrandAuthenticated, false); assert.equal(pair[1].snapshot().authority, 'NONE');
});
await selected('the captured object allocator is not replaced through a later global edit', () => {
  const f = fixture(), descriptor = GET(Object, 'create'); let b;
  try { DEFINE(Object, 'create', { ...descriptor, value() { hooks++; throw Error('PRIVATE_ALLOCATOR'); } }); b = BOUNDARY(f.config); }
  finally { DEFINE(Object, 'create', descriptor); }
  assert.equal(b.close(), true); assert.equal(hooks, 0);
});
clean(); assert.equal(entered, completed); assert.equal(entered, names.length);
assert.equal(new Set(names).size, names.length); assert.ok(entered >= 24 && entered <= 40);
assert.equal(hooks, 0); assert.equal(leakedCallbacks, 0); assert.equal(substitutedGuards, 0); assert.equal(substitutedCloses, 0);
console.log('# guarded-store-close-callback-capture ' + JSON.stringify({ entered, completed, names, hooks,
  leakedCallbacks, substitutedGuards, substitutedCloses, actualBoundaryComponent: true,
  originalCallbacksSelected: true, constructionInert: true, rootGuardAndReturnedCloseFactsPreserved: true,
  actualNativeOwner: false, actualSqliteStore: false, SDK: false, network: false, keyGeneration: false,
  signatureOperations: 0, nonceSearches: 0, physicalDrain: 'NOT_ESTABLISHED', authority: 'NONE' }));
// Exact existing 18 boundary + 3 actual bounded-join component cases.
// The caller pins this current SDK/SQL-free graph, not a historical native recipe.
await import('./native-guarded-store-close.behavior.draft.mjs');
