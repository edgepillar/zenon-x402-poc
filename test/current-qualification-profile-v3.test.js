import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import {
  PROFILE_ID, NODE_VERSION, SOURCE_PATHS, ENTRY_PATHS, EXCLUDED_SCOPES,
  inspectCurrentQualificationProfile as INSPECT,
  parseCurrentQualificationProfile as PARSE, requireCompleteCaseResults as COMPLETE,
  requireUnchangedProfile as UNCHANGED,
} from '../scripts/current-qualification-profile-v3.mjs';

function fixture() {
  return { schemaVersion: 1, profileId: PROFILE_ID, sourceBase: 'a'.repeat(40),
    runtime: { node: NODE_VERSION, platforms: ['darwin-arm64', 'linux-x64', 'linux-arm64'],
      installDependencies: false },
    packageContract: { name: 'zenon-x402-poc', type: 'module', nodeEngine: '>=24',
      x402CoreDeclared: '2.23.0', x402CoreDependencyKind: 'runtime', lockfileVersion: 3,
      installedNamespaceQualified: false, x402CoreExecuted: false, sdkExecuted: false },
    scope: 'DECLARED_P2_CAPACITY_COMPONENTS_AND_RUNTIME_DEPENDENCY_CONTRACT_ONLY',
    excludedScopes: [...EXCLUDED_SCOPES],
    selections: ENTRY_PATHS.map((path, index) => ({ path,
      names: Array.from({ length: [13, 1, 7, 7, 54, 26][index] }, (_, n) => 'fixture case ' + index + ' ' + n) })),
    sources: SOURCE_PATHS.map(path => ({ path, bytes: 100, LF: 2, sha256: 'b'.repeat(64) })) };
}
const parse = value => PARSE(JSON.stringify(value) + '\n');
const refuse = (mutate, code) => {
  const value = fixture(); mutate(value);
  assert.throws(() => parse(value), { code });
};
test('current profile admits a closed immutable source and case selection', () => {
  const result = parse(fixture());
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.sources));
  assert.ok(Object.isFrozen(result.selections[0].names));
  assert.equal(result.selections.reduce((n, entry) => n + entry.names.length, 0), 108);
  assert.equal(result.runtime.installDependencies, false);
});
test('current profile rejects malformed text and unknown schema members', () => {
  assert.throws(() => PARSE('{}'), { code: 'PROFILE_TEXT' });
  assert.throws(() => PARSE('{\n'), { code: 'PROFILE_JSON' });
  assert.throws(() => PARSE(' '.repeat(32769) + '\n'), { code: 'PROFILE_TEXT' });
  refuse(value => { value.extra = true; }, 'PROFILE_SHAPE');
  refuse(value => { value.schemaVersion = 2; }, 'PROFILE_IDENTITY');
});
test('current profile refuses floating runtime and dependency installation', () => {
  refuse(value => { value.runtime.node = '24'; }, 'PROFILE_RUNTIME');
  refuse(value => { value.runtime.installDependencies = true; }, 'PROFILE_RUNTIME');
  refuse(value => { value.runtime.platforms.push('win32-x64'); }, 'PROFILE_RUNTIME');
});
test('current profile keeps package declaration separate from package execution', () => {
  refuse(value => { value.packageContract.x402CoreDeclared = '2.28.0'; }, 'PROFILE_PACKAGE');
  refuse(value => { value.packageContract.x402CoreExecuted = true; }, 'PROFILE_PACKAGE');
  refuse(value => { value.packageContract.sdkExecuted = true; }, 'PROFILE_PACKAGE');
  refuse(value => { value.packageContract.x402CoreDependencyKind = 'development'; }, 'PROFILE_PACKAGE');
  refuse(value => { value.packageContract.lockfileVersion = 2; }, 'PROFILE_PACKAGE');
  refuse(value => { value.packageContract.installedNamespaceQualified = true; }, 'PROFILE_PACKAGE');
});
test('current profile refuses missing reordered or historical entry paths', () => {
  refuse(value => { value.selections.pop(); }, 'PROFILE_SELECTION');
  refuse(value => { value.selections.reverse(); }, 'PROFILE_SELECTION');
  refuse(value => { value.selections[0].path = 'test/historical.test.js'; }, 'PROFILE_SELECTION');
  refuse(value => { value.profileId = 'historical'; }, 'PROFILE_IDENTITY');
});
test('current profile rejects duplicate empty and unsafe case names', () => {
  refuse(value => { value.selections[0].names[1] = value.selections[0].names[0]; }, 'PROFILE_CASE');
  refuse(value => { value.selections[0].names[0] = ''; }, 'PROFILE_CASE');
  refuse(value => { value.selections[0].names[0] = 'case\nprivate'; }, 'PROFILE_CASE');
  refuse(value => { value.selections[0].names.pop(); }, 'PROFILE_SELECTION');
});
test('current profile rejects traversal incomplete or additional source rows', () => {
  refuse(value => { value.sources[0].path = '../private'; }, 'PROFILE_SOURCE');
  refuse(value => { value.sources.pop(); }, 'PROFILE_SOURCES');
  refuse(value => { value.sources.push(value.sources[0]); }, 'PROFILE_SOURCES');
});
test('current profile requires bounded exact hashes sizes and source budget', () => {
  refuse(value => { value.sources[0].sha256 = 'b'.repeat(63); }, 'PROFILE_SOURCE');
  refuse(value => { value.sources[0].bytes = 0; }, 'PROFILE_SOURCE');
  refuse(value => { value.sources[0].LF = 101; }, 'PROFILE_SOURCE');
  refuse(value => { for (const row of value.sources) row.bytes = 30000; }, 'PROFILE_SOURCE_BUDGET');
});
test('current profile cannot omit excluded authority or broaden its declared scope', () => {
  refuse(value => { value.excludedScopes.pop(); }, 'PROFILE_SCOPE');
  refuse(value => { value.scope = 'FULL_APPLICATION'; }, 'PROFILE_SCOPE');
});
test('current profile recheck rejects content and physical identity drift', () => {
  const before = { manifestSha256: 'declared', rows: [{ identity: ['1'], sha256: 'a' }] };
  UNCHANGED(before, JSON.parse(JSON.stringify(before)));
  const changed = JSON.parse(JSON.stringify(before)); changed.rows[0].identity[0] = '2';
  assert.throws(() => UNCHANGED(before, changed), { code: 'SOURCE_CHANGED_DURING_RUN' });
  changed.rows[0].identity[0] = '1'; changed.rows[0].sha256 = 'b';
  assert.throws(() => UNCHANGED(before, changed), { code: 'SOURCE_CHANGED_DURING_RUN' });
});
function complete() {
  return { names: ['a', 'b'],
    rows: ['a', 'b'].map(name => ({ name, nesting: 0, pass: true, skip: false, todo: false })),
    counts: { tests: 2, suites: 0, pass: 2, fail: 0, cancelled: 0, skipped: 0, todo: 0 } };
}
test('current profile requires real complete passes and both stream completions', () => {
  const { names, rows, counts } = complete(); COMPLETE(names, rows, counts, true, true);
  assert.throws(() => COMPLETE(names, rows, counts, false, true), { code: 'INCOMPLETE_RESULTS' });
  assert.throws(() => COMPLETE(names, rows, counts, true, false), { code: 'INCOMPLETE_RESULTS' });
  assert.throws(() => COMPLETE(names, rows.slice(1), counts, true, true), { code: 'INCOMPLETE_RESULTS' });
});
test('current profile rejects skipped duplicate unexpected nested or failed case results', () => {
  for (const mutate of [
    value => { value.rows[0].skip = 'reason'; }, value => { value.rows[0].todo = true; },
    value => { value.rows[0].pass = false; }, value => { value.rows[0].nesting = 1; },
    value => { value.rows[1].name = 'a'; }, value => { value.rows[0].name = 'unexpected'; },
    value => { value.counts.skipped = 1; }, value => { value.counts.pass = 1; },
    value => { value.counts.extra = 0; },
  ]) {
    const value = complete(); mutate(value);
    assert.throws(() => COMPLETE(value.names, value.rows, value.counts, true, true),
      { code: 'INCOMPLETE_RESULTS' });
  }
});

test('current capacity profile reads exact file-sized buffers with complete source hashes', t => {
  const root=dirname(dirname(fileURLToPath(import.meta.url)));
  const descriptor=Object.getOwnPropertyDescriptor(Buffer,'alloc'),sizes=[];
  let snapshot;
  try {
    Object.defineProperty(Buffer,'alloc',{...descriptor,value:function(size,...args) {
      sizes.push(size);return Reflect.apply(descriptor.value,Buffer,[size,...args]);
    }});
    snapshot=INSPECT(root);
  } finally { Object.defineProperty(Buffer,'alloc',descriptor); }
  const expected=[Number(snapshot.manifestIdentity[6])+1,...snapshot.profile.sources.map(row=>row.bytes+1)];
  assert.deepEqual(sizes,expected);
  assert.equal(snapshot.rows.length,22);
  for(let i=0;i<snapshot.rows.length;i++)assert.equal(snapshot.rows[i].sha256,snapshot.profile.sources[i].sha256);
  const allocatedBytes=sizes.reduce((a,b)=>a+b,0),legacyCapacityBytes=32769+snapshot.rows.length*131073;
  assert.ok(allocatedBytes<legacyCapacityBytes);
  t.diagnostic('PROFILE_V3_FILE_BUFFERS '+JSON.stringify({files:sizes.length,allocatedBytes,legacyCapacityBytes,
    savedBytes:legacyCapacityBytes-allocatedBytes}));
});
