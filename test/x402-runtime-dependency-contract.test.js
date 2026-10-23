import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inspectX402RuntimeDependencyText as CHECK } from '../scripts/x402-runtime-dependency-contract.mjs';

const PACKAGE = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
const LOCK = readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8');
const text = value => JSON.stringify(value) + '\n';
const fixture = () => ({ pkg: JSON.parse(PACKAGE), lock: JSON.parse(LOCK) });
function reject(mutate) {
  const f = fixture(); mutate(f.pkg, f.lock);
  assert.throws(() => CHECK(text(f.pkg), text(f.lock)), { code: 'X402_RUNTIME_DEPENDENCY_CONTRACT' });
}
test('runtime x402 contract reads the current pinned manifest and lock without installing packages', () => {
  const result = CHECK(PACKAGE, LOCK); assert.ok(Object.isFrozen(result));
  assert.deepEqual(result, { coreVersion: '2.23.0', coreDependencyKind: 'runtime', zodVersion: '3.25.76',
    selectedRuntimeLockRows: 2, lockfileVersion: 3, retainedArtifactIntegrityUnchanged: true,
    installedDependencies: false, x402PackageExecuted: false, sdkExecuted: false,
    ordinaryInstalledNamespaceQualified: false });
});
test('runtime x402 contract refuses missing floating development peer and optional declarations', () => {
  for (const mutate of [
    pkg => { delete pkg.dependencies['@x402/core']; },
    pkg => { pkg.dependencies['@x402/core'] = '^2.23.0'; },
    pkg => { pkg.dependencies['@x402/core'] = '2.28.0'; },
    ...['devDependencies','peerDependencies','optionalDependencies'].map(key =>
      pkg => { pkg[key] = { '@x402/core': '2.23.0' }; }),
  ]) reject(mutate);
});
test('runtime x402 contract refuses manifest lock root and engine divergence', () => {
  for (const mutate of [
    (_pkg, lock) => { lock.lockfileVersion = 2; },
    (_pkg, lock) => { lock.name = 'other'; },
    (_pkg, lock) => { lock.packages[''].version = '0.3.0'; },
    (_pkg, lock) => { lock.packages[''].engines.node = '>=20'; },
    (_pkg, lock) => { delete lock.packages[''].dependencies['@x402/core']; },
    (_pkg, lock) => { lock.packages[''].devDependencies = { '@x402/core': '2.23.0' }; },
    (pkg, lock) => { lock.packages[''].dependencies['znn-typescript-sdk'] = '^2'; },
    pkg => { pkg.private = false; },
  ]) reject(mutate);
});
test('runtime x402 contract refuses development optional link and installer-only lock rows', () => {
  for (const path of ['node_modules/@x402/core', 'node_modules/zod'])
    for (const flag of ['dev','devOptional','optional','link','hasInstallScript'])
      for (const value of [true, 'true', 1, null])
        reject((_pkg, lock) => { lock.packages[path][flag] = value; });
});
test('runtime x402 contract refuses changed versions tarball sources and retained integrity', () => {
  for (const path of ['node_modules/@x402/core', 'node_modules/zod'])
    for (const [key, value] of [['version','99.0.0'], ['resolved','file:other'], ['integrity','sha512-changed']])
      reject((_pkg, lock) => { lock.packages[path][key] = value; });
});
test('runtime x402 contract refuses changed or shadowed transitive zod resolution', () => {
  for (const mutate of [
    (_pkg, lock) => { lock.packages['node_modules/@x402/core'].dependencies.zod = '^4'; },
    (_pkg, lock) => { lock.packages['node_modules/@x402/core'].dependencies.other = '1'; },
    (_pkg, lock) => { lock.packages['node_modules/zod'].dependencies = { other: '1' }; },
    (_pkg, lock) => { lock.packages['node_modules/@x402/core/node_modules/zod'] = { version: '3.25.76' }; },
    (_pkg, lock) => { delete lock.packages['node_modules/zod']; },
  ]) reject(mutate);
});
test('runtime x402 contract refuses malformed oversized non-ASCII and non-object input text', () => {
  for (const value of [null, '', '{}', '{\n', '[]\n', 'null\n',
    ' '.repeat(131073) + '\n', '{"name":"\u00e9"}\n'])
    for (const side of ['package','lock'])
      assert.throws(() => side === 'package' ? CHECK(value, LOCK) : CHECK(PACKAGE, value),
        { code: 'X402_RUNTIME_DEPENDENCY_CONTRACT' });
});

