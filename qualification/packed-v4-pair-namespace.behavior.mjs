// Exact guard extraction only: no native module import, fork, SDK or filesystem fixture.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';

if (process.version !== 'v24.19.0'
    || process.env.X402_PACKED_PAIR_ADMISSION_DATA_SELECTION !== 'exact-v4-pair-namespace-data-v1')
  throw new TypeError('EXACT_PACKED_PAIR_ADMISSION_DATA_SELECTION_REQUIRED');
const pairURL = new URL('./capacity-native-current-offered-pair-v4.supervisor.draft.mjs', import.meta.url);
const manifestURL = new URL('./capacity-native-current-offered-parent-v4.inputs.json', import.meta.url);
const source = readFileSync(pairURL, 'utf8'), manifest = JSON.parse(readFileSync(manifestURL, 'utf8'));
const begin = source.indexOf('function namespace(){'), end = source.indexOf('\nfunction capture(', begin);
assert.ok(begin >= 0 && end > begin);
const guard = source.slice(begin, end);
assert.equal(guard.split('function namespace()').length, 2);
assert.equal(manifest.parentApplicationFiles, 163);
assert.equal(manifest.childGraph.applicationFiles, 154);
const NS = 'getPinnedNativeCapacityCurrentOfferedSupervisorNamespaceSnapshotV4';
const NODE_SHA = 'dbedff294bab84a0a86c04e15fbcbeb1c97ca10bef1b32b0634cd24b36f62100';
const names = [];
let entered = 0, completed = 0;
function check(name, body) {
  names.push(name); test(name, { concurrency: false, timeout: 1000 }, () => { entered++; body(); completed++; });
}
function snapshot() {
  return {
    profileKind: manifest.parentRole.profileKind,
    applicationFiles: manifest.parentApplicationFiles, packageFiles: manifest.parentPackageFiles,
    childApplicationFiles: manifest.childGraph.applicationFiles, childPackageFiles: manifest.childGraph.packageFiles,
    childSourceRowsSha256: manifest.childGraph.sourceRowsSha256,
    currentBaseApplication123Preserved: true, baselinePackages404Preserved: true,
    sourceTransforms: 0, nativeBuiltinAliases: 0, rootIndependenceVerifiedAtAdmission: true, rootIdentityFields: 5,
    sourceRowsSha256: manifest.parentSourceRowsSha256,
    childProfiles: [{ role: 'PAYER' }, { role: 'SERVICE' }], nodeSha256: NODE_SHA,
  };
}
function accepts(value = snapshot(), runtime = {}, options = {}) {
  const declared = Object.freeze(value);
  const fn = () => declared;
  if (!options.unfrozenFunction) Object.freeze(fn);
  const sandbox = {
    D: Object.getOwnPropertyDescriptor, O: Object.hasOwn, NS,
    process: Object.freeze({ version: 'v24.19.0', platform: 'darwin', arch: 'arm64', ...runtime }),
    fail() { throw new TypeError('DECLARED_PAIR_NAMESPACE_REFUSED'); },
  };
  if (!options.missingDescriptor) Object.defineProperty(sandbox, NS, {
    value: fn, writable: options.writable === true, enumerable: options.enumerable === true,
    configurable: options.configurable === true,
  });
  const context = createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  const script = new Script(guard + '\nnamespace();', { filename: 'exact-current-v4-pair-namespace-guard' });
  try { return script.runInContext(context, { timeout: 100 }) === declared; }
  catch (error) {
    assert.equal(error.message, 'DECLARED_PAIR_NAMESPACE_REFUSED');
    return false;
  }
}
check('actual V4 pair guard accepts the current 163-application namespace DATA', () => {
  assert.equal(accepts(), true);
});
check('actual V4 pair guard refuses the stale 162-application namespace DATA', () => {
  assert.equal(accepts({ ...snapshot(), applicationFiles: 162 }), false);
});
for (const [label, key, value] of [
  ['foreign_kind', 'profileKind', 'NATIVE_CAPACITY_CURRENT_OFFERED_SUPERVISOR_NODE24_V3'],
  ['package_count', 'packageFiles', 403],
  ['child_application_count', 'childApplicationFiles', 153],
  ['child_package_count', 'childPackageFiles', 403],
  ['child_seal', 'childSourceRowsSha256', '0'.repeat(64)],
  ['base_application_flag', 'currentBaseApplication123Preserved', false],
  ['base_package_flag', 'baselinePackages404Preserved', false],
  ['source_transform', 'sourceTransforms', 1],
  ['builtin_alias', 'nativeBuiltinAliases', 1],
  ['root_independence', 'rootIndependenceVerifiedAtAdmission', false],
  ['root_identity_fields', 'rootIdentityFields', 4],
  ['invalid_parent_seal', 'sourceRowsSha256', 'invalid'],
  ['too_many_children', 'childProfiles', Array.from({ length: 33 }, () => ({}))],
  ['node_digest', 'nodeSha256', '0'.repeat(64)],
]) check('actual pair guard preserves ' + label + ' refusal', () => {
  assert.equal(accepts({ ...snapshot(), [key]: value }), false);
});
for (const [label, runtime] of [
  ['node_version', { version: 'v24.0.0' }],
  ['platform', { platform: 'declared-other-platform' }],
  ['architecture', { arch: 'declared-other-architecture' }],
]) check('actual pair guard preserves runtime ' + label + ' refusal', () => {
  assert.equal(accepts(snapshot(), runtime), false);
});
for (const key of ['writable', 'enumerable', 'configurable', 'unfrozenFunction', 'missingDescriptor'])
  check('actual pair guard preserves ' + key + ' descriptor refusal', () => {
    assert.equal(accepts(snapshot(), {}, { [key]: true }), false);
  });
after(() => {
  console.log(JSON.stringify({ event: 'EXACT_V4_PAIR_NAMESPACE_GUARD_DECLARED_DATA',
    selected: names.length, entered, completed, names,
    actualGuardDefinitionExtracted: true, nativeModuleImported: false,
    namespaceAndRuntimeFactsDeclared: true, nativeNamespaceQualified: false,
    parentApplications: manifest.parentApplicationFiles, childApplications: manifest.childGraph.applicationFiles,
    SDKImported: false, SQLite: false, sockets: false, keysOrSignatures: false, nonce: false,
    profilesWritten: 0, managedTasksCreated: 0, nativeExecuted: false,
    productionQualified: false, authority: 'NONE' }));
});
