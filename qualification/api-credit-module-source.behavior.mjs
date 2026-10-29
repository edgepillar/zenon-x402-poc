// Actual pure guard with declared source/ordinary-loader ports. Source bytes
// are synthetic DATA and are never evaluated. No filesystem or hooks run.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { createApiCreditModuleSourceGuard as create } from '../src/api-credit-module-source-guard.js';

const F = Object.freeze, checks = [], ROOT = 'file:///synthetic/project/';
const parent = 'src/entry.js', target = 'node_modules/example/index.js';
const url = path => ROOT + path, hash = value => createHash('sha256').update(value).digest('hex');
const context = () => ({ parentURL: url(parent), conditions: ['node', 'import'], importAttributes: {} });
function check(id, run) { checks.push({ id, run }); }
function fixture(options = {}) {
  const sources = new Map([[parent, Buffer.from('synthetic parent DATA')], [target, Buffer.from('synthetic target DATA')]]);
  if (options.big) for (const name of sources.keys()) sources.set(name, Buffer.alloc(1048576, 97));
  const catalog = { version: 1, rows: [...sources].map(([path, source]) => ({ path, bytes: source.length, sha256: hash(source), format: 'module' })),
    edges: [{ parent, specifier: 'example', path: target }] };
  options.catalog?.(catalog); let calls = 0, guard;
  const read = F((path, size) => {
    calls++; if (options.read) return options.read(path, size, sources, guard);
    return F({ mode: 'SOURCE', source: sources.get(path) });
  });
  guard = create(ROOT, catalog, read, F(name => ['node:fs', 'fs', 'node:buffer', 'buffer'].includes(name)));
  if (options.ready !== false) assert.equal(guard.preflight(), 'READY');
  return { guard, sources, catalog, calls: () => calls };
}
function refused(guard, fn, state = 'REFUSED') { assert.throws(fn); assert.equal(guard.status(), state); }

check('module-source-real-guard-delegates-and-returns-the-identical-ordinary-resolution-result', () => {
  const { guard } = fixture(), c = context(), r = { url: url(target), format: 'module' }; let calls = 0;
  assert.equal(guard.resolve('example', c, (specifier, ctx) => { calls++; assert.equal(specifier, 'example'); assert.equal(ctx, c); return r; }), r);
  assert.equal(calls, 1); assert.equal(guard.status(), 'READY');
});
check('module-source-load-returns-unchanged-source-and-context-after-byte-and-format-checks', () => {
  const { guard, sources } = fixture(), c = { format: 'module', importAttributes: {} }, r = { source: sources.get(target), format: 'module' };
  assert.equal(guard.load(url(target), c, (actual, ctx) => { assert.equal(actual, url(target)); assert.equal(ctx, c); return r; }), r);
  assert.equal(guard.status(), 'READY');
});
check('module-source-preflight-is-one-shot-and-required-before-either-loader-port', () => {
  for (const method of ['resolve', 'load']) {
    const { guard } = fixture({ ready: false }); let entered = 0;
    refused(guard, () => method === 'resolve' ? guard.resolve('example', context(), () => { entered++; }) : guard.load(url(target), {}, () => { entered++; }));
    assert.equal(entered, 0); refused(guard, () => guard.preflight());
  }
  const { guard } = fixture(); refused(guard, () => guard.preflight());
});
check('module-source-eager-preflight-rejects-a-same-size-byte-change-before-loading', () => {
  const { guard } = fixture({ ready: false, read: (path, size) => ({ mode: 'SOURCE', source: Buffer.alloc(size, 120) }) }); refused(guard, () => guard.preflight());
});
check('module-source-eager-preflight-rejects-short-and-extra-bytes', () => {
  for (const delta of [-1, 1]) { const { guard } = fixture({ ready: false, read: (path, size) => ({ mode: 'SOURCE', source: Buffer.alloc(size + delta) }) }); refused(guard, () => guard.preflight()); }
});
check('module-source-preflight-preserves-declared-refusal-versus-unknown-source-ownership', () => {
  for (const mode of ['REFUSED', 'UNKNOWN']) { const { guard } = fixture({ ready: false, read: () => ({ mode }) }); refused(guard, () => guard.preflight(), mode); }
  const { guard } = fixture({ ready: false, read() { throw Error('synthetic source uncertainty'); } }); refused(guard, () => guard.preflight(), 'UNKNOWN');
});
check('module-source-rechecks-replaced-parent-before-entering-ordinary-resolution', () => {
  const { guard, sources } = fixture(); sources.set(parent, Buffer.alloc(sources.get(parent).length, 120)); let entered = 0;
  refused(guard, () => guard.resolve('example', context(), () => { entered++; return { url: url(target) }; })); assert.equal(entered, 0);
});
check('module-source-rechecks-selected-target-after-ordinary-resolution', () => {
  const { guard, sources } = fixture();
  refused(guard, () => guard.resolve('example', context(), () => { sources.set(target, Buffer.alloc(sources.get(target).length, 120)); return { url: url(target) }; }));
});
check('module-source-catalog-membership-cannot-substitute-a-different-direct-package-entry', () => {
  const { guard } = fixture(); refused(guard, () => guard.resolve('example', context(), () => ({ url: url(parent), format: 'module' })));
});
check('module-source-resolved-unlisted-and-global-search-targets-remain-sticky-refused', () => {
  for (const resolved of [ROOT + 'node_modules/optional/index.js', 'file:///synthetic/global/index.js', 'https://synthetic.invalid/x.js', 'data:text/javascript,0']) {
    const { guard } = fixture(); refused(guard, () => guard.resolve('optional', context(), () => ({ url: resolved })));
    let entered = 0; refused(guard, () => guard.load(url(target), {}, () => { entered++; })); assert.equal(entered, 0);
  }
});
check('module-source-normal-missing-optional-lookup-propagates-without-authorizing-a-target', () => {
  const { guard } = fixture(), failure = Error('synthetic ordinary lookup missing');
  assert.throws(() => guard.resolve('not-installed', context(), () => { throw failure; }), error => error === failure);
  assert.equal(guard.status(), 'READY'); const r = { url: url(target) }; assert.equal(guard.resolve('example', context(), () => r), r);
});
check('module-source-import-cache-aliases-query-fragment-and-normalization-variants-are-unselected', () => {
  for (const resolved of [url(target) + '?again', url(target) + '#again', ROOT + 'node_modules/example/../example/index.js', ROOT + 'node_modules/%65xample/index.js']) {
    const { guard } = fixture(); refused(guard, () => guard.resolve('example', context(), () => ({ url: resolved })));
  }
});
check('module-source-only-real-builtins-and-their-ordinary-canonical-targets-are-admitted', () => {
  for (const specifier of ['node:fs', 'fs']) { const { guard } = fixture(), r = { url: 'node:fs', format: 'builtin' }; assert.equal(guard.resolve(specifier, context(), () => r), r); }
  for (const [specifier, resolved] of [['node:fs', url(target)], ['example', 'node:fs'], ['node:unselected', 'node:unselected']]) {
    const { guard } = fixture(); refused(guard, () => guard.resolve(specifier, context(), () => ({ url: resolved })));
  }
});
check('module-source-builtin-load-rejects-source-or-format-substitution', () => {
  const { guard } = fixture(), r = { format: 'builtin', source: null }; assert.equal(guard.load('node:fs', {}, () => r), r);
  for (const result of [{ format: 'module', source: null }, { format: 'builtin', source: 'synthetic DATA' }]) { const { guard } = fixture(); refused(guard, () => guard.load('node:fs', {}, () => result)); }
});
check('module-source-actual-loader-returned-bytes-must-match-even-if-disk-port-is-unchanged', () => {
  const { guard, sources } = fixture(); refused(guard, () => guard.load(url(target), {}, () => ({ format: 'module', source: Buffer.alloc(sources.get(target).length, 120) })));
});
check('module-source-format-and-response-url-cannot-be-transformed-by-a-loader', () => {
  for (const fields of [{ format: 'commonjs' }, { responseURL: url(parent) }]) {
    const { guard, sources } = fixture(); refused(guard, () => guard.load(url(target), {}, () => ({ format: 'module', source: sources.get(target), ...fields })));
  }
  const { guard } = fixture(); refused(guard, () => guard.resolve('example', context(), () => ({ url: url(target), format: 'commonjs' })));
});
check('module-source-post-load-recheck-detects-a-source-port-change-during-default-load', () => {
  const { guard, sources } = fixture(), original = sources.get(target);
  refused(guard, () => guard.load(url(target), {}, () => { sources.set(target, Buffer.alloc(original.length, 120)); return { format: 'module', source: original }; }));
});
check('module-source-supported-string-buffer-uint8array-and-arraybuffer-data-keep-exact-bytes', () => {
  for (const kind of ['string', 'buffer', 'uint8array', 'arraybuffer']) {
    const { guard, sources } = fixture(), b = sources.get(target), source = kind === 'string' ? b.toString('utf8') : kind === 'buffer' ? b : kind === 'uint8array' ? new Uint8Array(b) : new Uint8Array(b).buffer;
    const r = { format: 'module', source }; assert.equal(guard.load(url(target), {}, () => r), r);
  }
});
check('module-source-source-conversion-proxies-and-accessor-records-never-enter-user-hooks', () => {
  let entered = 0;
  const proxy = new Proxy({}, { get() { entered++; throw Error('unselected'); } });
  const conversion = { valueOf() { entered++; throw Error('unselected'); }, toString() { entered++; throw Error('unselected'); } };
  for (const source of [proxy, conversion]) { const { guard } = fixture(); refused(guard, () => guard.load(url(target), {}, () => ({ format: 'module', source }))); }
  const accessor = { format: 'module' }; Object.defineProperty(accessor, 'source', { get() { entered++; throw Error('unselected'); } });
  const { guard } = fixture(); refused(guard, () => guard.load(url(target), {}, () => accessor)); assert.equal(entered, 0);
});
check('module-source-shared-and-resizable-storage-are-not-stable-source-data', () => {
  for (const source of [new Uint8Array(new SharedArrayBuffer(21)), new ArrayBuffer(21, { maxByteLength: 42 })]) {
    const { guard } = fixture(); refused(guard, () => guard.load(url(target), {}, () => ({ format: 'module', source })));
  }
});
check('module-source-source-read-reentry-remains-unknown-even-when-the-port-catches-it', () => {
  const { guard } = fixture({ ready: false, read(path, size, sources, current) { try { current.status(); } catch {} return { mode: 'SOURCE', source: sources.get(path) }; } });
  refused(guard, () => guard.preflight(), 'UNKNOWN'); refused(guard, () => guard.preflight(), 'UNKNOWN');
});
check('module-source-resolution-and-load-reentry-cannot-be-cleared-by-catching-an-error', () => {
  for (const method of ['resolve', 'load']) {
    const { guard, sources } = fixture(); const next = () => { try { guard.status(); } catch {} return method === 'resolve' ? { url: url(target) } : { format: 'module', source: sources.get(target) }; };
    refused(guard, () => method === 'resolve' ? guard.resolve('example', context(), next) : guard.load(url(target), {}, next), 'UNKNOWN');
  }
});
check('module-source-loader-failure-retains-unknown-and-does-not-retry-source-loading', () => {
  const { guard } = fixture(); let calls = 0;
  refused(guard, () => guard.load(url(target), {}, () => { calls++; throw Error('synthetic loader uncertainty'); }), 'UNKNOWN');
  refused(guard, () => guard.load(url(target), {}, () => { calls++; }), 'UNKNOWN'); assert.equal(calls, 1);
});
check('module-source-unlisted-parent-and-accessor-context-are-refused-before-next-resolve', () => {
  let entered = 0; const accessor = {}; Object.defineProperty(accessor, 'parentURL', { get() { entered++; throw Error('unselected'); } });
  for (const c of [{ parentURL: 'file:///synthetic/outside.js' }, accessor]) { const { guard } = fixture(); refused(guard, () => guard.resolve('example', c, () => { entered++; })); }
  assert.equal(entered, 0);
});
check('module-source-catalog-rejects-traversal-case-aliases-and-duplicate-edge-policy', () => {
  for (const mutate of [c => { c.rows[0].path = '../escape.js'; }, c => { c.rows.push({ ...c.rows[0], path: 'SRC/ENTRY.JS' }); },
    c => { c.edges.push({ ...c.edges[0] }); }, c => { c.rows[0].bytes = 1048577; }, c => { c.edges[0].path = 'unlisted.js'; }]) assert.throws(() => fixture({ catalog: mutate }));
});
check('module-source-captured-catalog-cannot-be-replaced-or-widened-after-construction', () => {
  const { guard, catalog } = fixture(); catalog.rows[0].sha256 = '0'.repeat(64); catalog.edges[0].path = parent;
  const r = { url: url(target) }; assert.equal(guard.resolve('example', context(), () => r), r);
  assert.deepEqual(Reflect.ownKeys(guard), ['preflight', 'status', 'resolve', 'load']); assert.equal(Object.isFrozen(guard), true);
});
check('module-source-global-read-count-budget-is-sticky-without-native-io-or-timers', () => {
  const { guard } = fixture(); let count = 0;
  assert.throws(() => { for (; count < 8193; count++) guard.resolve('example', context(), () => ({ url: url(target) })); });
  assert.equal(guard.status(), 'REFUSED'); assert.ok(count > 0 && count < 8193);
});
check('module-source-global-byte-budget-is-enforced-separately-from-call-count', () => {
  const { guard } = fixture({ big: true }); let count = 0;
  assert.throws(() => { for (; count < 64; count++) guard.resolve('example', context(), () => ({ url: url(target) })); });
  assert.equal(guard.status(), 'REFUSED'); assert.ok(count > 0 && count < 64);
});

const cases = [];
for (const { id, run } of checks) { try { run(); cases.push({ id, status: 'PASS' }); } catch (error) { cases.push({ id, status: 'FAIL', error: String(error?.message ?? error) }); } }
const failed = cases.filter(row => row.status !== 'PASS').length;
console.log(JSON.stringify({ qualification: 'G0_API_CREDIT_MODULE_SOURCE_DATA', passed: cases.length - failed, failed, cases,
  actualPureModuleSourceGuard: true, ordinaryResolverAndSourceReader: 'DECLARED_DATA_PORTS_ONLY', sourceBytesEvaluated: false,
  nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0, actualPrepare: 0, payouts: 0,
  nativeHooksExecuted: false, installedNamespaceQualified: false, nativeAcceptance: 'NOT_ESTABLISHED', LinuxAcceptance: 'NOT_ESTABLISHED' }));
if (failed) process.exitCode = 1;
