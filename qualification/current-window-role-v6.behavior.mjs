// Exact window-owner definitions over declared process/namespace/clock DATA only.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { types as utilTypes } from 'node:util';
import { Script, createContext } from 'node:vm';
const phase = process.env.X402_CURRENT_WINDOW_BINDING_DATA_PHASE;
if (process.version !== 'v24.19.0' || !['RED', 'GREEN'].includes(phase))
  throw new TypeError('EXACT_WINDOW_BINDING_DATA_SELECTION_REQUIRED');
const names = [];
let entered = 0, completed = 0;
function check(name, body) {
  names.push(name); test(name, { concurrency: false, timeout: 3000 }, () => { entered++; body(); completed++; });
}
const path = phase === 'RED' ? './capacity-native-service-window-v3.owner.draft.mjs'
  : './capacity-native-current-service-window-v6.owner.draft.mjs';
const source = readFileSync(new URL(path, import.meta.url), 'utf8');
const seal = 'a1'.repeat(32), runId = 'b2'.repeat(32), laneId = 'declared.lane';
const version = phase === 'RED' ? 5 : 6, applications = phase === 'RED' ? 154 : 163;
const hook = 'getPinnedNativeCapacityCurrentServiceNamespaceSnapshotV' + version;
function fixture(options = {}) {
  let clockCalls = 0, namespaceCalls = 0, now = 10n;
  const ctx = createContext({ utilTypes }, { codeGeneration: { strings: false, wasm: false } });
  ctx.rawConfig = JSON.stringify({ context: { runId, laneId, sourceRowsSha256: seal }, totalCalls: 5 });
  ctx.rawProcess = JSON.stringify({ version: 'v24.19.0', platform: 'darwin', arch: 'arm64', env: {
    X402_NATIVE_CAPACITY_SERVICE_SELECTION: 'native-capacity-current-service-source-draft-v' + version,
    X402_NATIVE_CAPACITY_RUN_SCOPE: 'one-reviewed-native-capacity-current-roles-v' + version,
    X402_NATIVE_CAPACITY_RUN_ID: runId, X402_NATIVE_CAPACITY_LANE_ID: laneId, ...options.env,
  }, ...options.process });
  ctx.rawSnapshot = JSON.stringify({ profileKind: 'NATIVE_CAPACITY_CURRENT_SERVICE_NODE24_V' + version,
    sourceRowsSha256: seal, currentBaseApplication123Preserved: true, currentV5Application154Preserved: true,
    baselinePackages404Preserved: true, applicationFiles: applications, packageFiles: 404,
    sourceTransforms: 0, nativeBuiltinAliases: 0, ordinaryInstalledNamespaceQualified: false, ...options.snapshot });
  ctx.clockSource = () => { clockCalls++; if (options.clock) return options.clock(clockCalls); now += 10n; return now; };
  ctx.namespaceObserved = () => { namespaceCalls++; };
  new Script("const process=JSON.parse(rawProcess);process.hrtime={bigint:clockSource};\n"
    + "const declaredSnapshot=Object.freeze(JSON.parse(rawSnapshot));\n"
    + "const namespaceSource=Object.freeze(function declaredNamespace(){namespaceObserved();return declaredSnapshot;});\n"
    + "Object.defineProperty(globalThis," + JSON.stringify(options.hook ?? hook)
    + ",{value:namespaceSource,writable:false,enumerable:false,configurable:false});\n"
    + "const configuration=JSON.parse(rawConfig);Object.freeze(configuration.context);Object.freeze(configuration);\n")
    .runInContext(ctx, { timeout: 1000 });
  const name = phase === 'RED' ? 'createNativeCapacityServiceWindowOwner' : 'createNativeCapacityCurrentServiceWindowOwnerV6';
  const start = source.indexOf('const F='); assert.ok(start >= 0);
  const defs = source.slice(start).replace('export function ' + name, 'function ' + name);
  const owner = new Script(defs + '\n' + name + '(configuration);',
    { filename: 'exact-window-owner-declared-environment' }).runInContext(ctx, { timeout: 1000 });
  return { owner, counts: () => ({ clockCalls, namespaceCalls }) };
}
if (phase === 'RED') {
  const read = n => readFileSync(new URL(n, import.meta.url), 'utf8');
  assert.ok(read('./capacity-native-current-service-v5.owner.draft.mjs')
    .includes("from './capacity-native-service-window-v3.owner.draft.mjs'"));
  assert.ok(read('./capacity-native-current-service-v5.worker.draft.mjs')
    .includes('native-capacity-current-service-source-draft-v5'));
  const preload = read('./capacity-native-current-namespace-v5.preload-common.draft.mjs');
  assert.ok(preload.includes('getPinnedNativeCapacityCurrentServiceNamespaceSnapshotV5'));
  assert.equal(preload.includes('getPinnedNativeCapacityServiceLaneNamespaceSnapshotV3'), false);
  check('actual V5 window edge accepts its actual V5 role context DATA', () => {
    const f = fixture(); assert.doesNotThrow(() => f.owner.timestamp());
    assert.deepEqual(f.counts(), { clockCalls: 1, namespaceCalls: 1 });
  });
} else {
  check('V6 context timestamps and opens/stops its current window definition', () => {
    const f = fixture(); assert.equal(f.owner.timestamp(), 20n); f.owner.open();
    assert.equal(f.owner.snapshot().phase, 'OPEN'); f.owner.timestamp(); f.owner.stop();
    const s = f.owner.snapshot();
    assert.equal(s.phase, 'STOPPED'); assert.equal(s.unknown, false); assert.equal(s.stopCause, 'PARENT_STOP');
    assert.equal(s.startNs, '30'); assert.equal(s.stopNs, '50');
    assert.deepEqual(f.counts(), { clockCalls: 4, namespaceCalls: 3 });
  });
  check('construction and an unused close fallback are inert', () => {
    const f = fixture(); f.owner.closeFallback(); assert.equal(f.owner.snapshot().phase, 'NOT_OPEN');
    assert.equal(f.owner.snapshot().unknown, false); assert.deepEqual(f.counts(), { clockCalls: 0, namespaceCalls: 0 });
  });
  check('close fallback preserves a stopped uncertain measurement', () => {
    const f = fixture(); f.owner.open(); f.owner.closeFallback();
    assert.equal(f.owner.snapshot().phase, 'STOPPED'); assert.equal(f.owner.snapshot().unknown, true);
    assert.equal(f.owner.snapshot().stopCause, 'OWNER_CLOSE_FALLBACK'); assert.throws(() => f.owner.timestamp());
  });
  for (const [name, env] of Object.entries({
    old_selector: { X402_NATIVE_CAPACITY_SERVICE_SELECTION: 'native-capacity-service-source-draft-v3' },
    old_scope: { X402_NATIVE_CAPACITY_RUN_SCOPE: 'one-reviewed-native-capacity-paired-workload-v3' },
    v5_selector: { X402_NATIVE_CAPACITY_SERVICE_SELECTION: 'native-capacity-current-service-source-draft-v5' },
    v5_scope: { X402_NATIVE_CAPACITY_RUN_SCOPE: 'one-reviewed-native-capacity-current-roles-v5' },
    wrong_run: { X402_NATIVE_CAPACITY_RUN_ID: 'c3'.repeat(32) },
    wrong_lane: { X402_NATIVE_CAPACITY_LANE_ID: 'foreign.lane' },
    node_options: { NODE_OPTIONS: '' }, node_path: { NODE_PATH: '' }, node_test: { NODE_TEST_CONTEXT: '' },
  })) check('window refuses ' + name + ' before its clock', () => {
    const f = fixture({ env }); assert.throws(() => f.owner.timestamp());
    assert.equal(f.counts().clockCalls, 0); assert.equal(f.owner.snapshot().unknown, true);
  });
  for (const [name, value] of Object.entries({ version: 'v26.0.0', platform: 'linux', arch: 'x64' }))
    check('window refuses foreign runtime ' + name, () => {
      const f = fixture({ process: { [name]: value } }); assert.throws(() => f.owner.timestamp());
      assert.equal(f.counts().clockCalls, 0);
    });
  for (const [name, value] of Object.entries({ profileKind: 'NATIVE_CAPACITY_SERVICE_LANE_NODE24_V3',
    sourceRowsSha256: 'c3'.repeat(32), currentV5Application154Preserved: false,
    baselinePackages404Preserved: false, applicationFiles: 154, packageFiles: 403,
    sourceTransforms: 1, nativeBuiltinAliases: 1, ordinaryInstalledNamespaceQualified: true }))
    check('window refuses namespace field ' + name, () => {
      const f = fixture({ snapshot: { [name]: value } }); assert.throws(() => f.owner.timestamp());
      assert.equal(f.counts().clockCalls, 0);
    });
  check('an old V3 hook cannot substitute for the current namespace', () => {
    const f = fixture({ hook: 'getPinnedNativeCapacityServiceLaneNamespaceSnapshotV3' });
    assert.throws(() => f.owner.timestamp()); assert.deepEqual(f.counts(), { clockCalls: 0, namespaceCalls: 0 });
  });
  for (const [name, clock] of Object.entries({ number: () => 7, negative: () => -1n,
    overflow: () => 1n << 128n, regression: i => i === 1 ? 10n : 9n }))
    check('window preserves unknown for ' + name + ' clock DATA', () => {
      const f = fixture({ clock }); if (name === 'regression') f.owner.timestamp();
      assert.throws(() => f.owner.timestamp()); assert.equal(f.owner.snapshot().unknown, true);
    });
  check('the complete per-lane clock-read ceiling is preserved', () => {
    const f = fixture(), maximum = 4 * (12 * 5 + 64) + 2;
    for (let i = 0; i < maximum; i++) f.owner.timestamp();
    assert.throws(() => f.owner.timestamp()); assert.equal(f.owner.snapshot().clockReads, maximum);
    assert.equal(f.counts().clockCalls, maximum);
  });
  check('ordinary timestamps do not open a window', () => {
    const f = fixture(); f.owner.timestamp(); assert.equal(f.owner.snapshot().phase, 'NOT_OPEN');
    assert.equal(f.owner.snapshot().startNs, null);
  });
  check('a second open latches unknown without another clock read', () => {
    const f = fixture(); f.owner.open(); const count = f.counts().clockCalls;
    assert.throws(() => f.owner.open()); assert.equal(f.counts().clockCalls, count);
    assert.equal(f.owner.snapshot().unknown, true);
  });
  check('stop before open cannot manufacture a measurement window', () => {
    const f = fixture(); assert.throws(() => f.owner.stop()); assert.equal(f.counts().clockCalls, 0);
    assert.equal(f.owner.snapshot().unknown, true);
  });
}
after(() => console.log(JSON.stringify({ event: 'CURRENT_WINDOW_ROLE_NAMESPACE_DECLARED_DATA', phase,
  selected: names.length, entered, completed, exactWindowDefinitionsExecuted: true,
  processNamespaceAndClockDeclared: true, nativeWindowModuleImported: false,
  nativeWorkerPreloaderOrOwnerImported: false, nativeClockRead: false, SDKImported: false, SQLite: false,
  sockets: false, keysOrSignatures: false, nonce: false, nativeNamespaceQualified: false,
  productionQualified: false, authority: 'NONE' })));

