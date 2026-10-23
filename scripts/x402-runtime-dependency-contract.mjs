// Source/lock contract only. This never installs or imports an npm package.
const CORE = '@x402/core', CORE_VERSION = '2.23.0', ZOD_VERSION = '3.25.76';
const CORE_INTEGRITY = 'sha512-EFeV0nXbTPPe5FXaD6y9vMgqc+k/ujLXCrUPrQXkmHjHyjC3Ir5tTL1e2FPSkx2+GUGzfpt1wVZb36639ygkWw==';
const ZOD_INTEGRITY = 'sha512-gzUt/qt81nXsFGKIFcC3YnfEAx5NkunCfnDlvuBSSFS02bcXu4Lmea0AFIUwbLWxWPx3d9p8S5QoaujKcNQxcQ==';
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype;
function refuse() {
  const error = new Error('X402_RUNTIME_DEPENDENCY_CONTRACT');
  error.code = 'X402_RUNTIME_DEPENDENCY_CONTRACT'; throw error;
}
function parse(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 131072 || !text.endsWith('\n')
      || /[^\x09\x0a\x0d\x20-\x7e]/.test(text)) refuse();
  let data;
  try { data = JSON.parse(text); } catch { refuse(); }
  if (!plain(data)) refuse();
  return data;
}
function dependencies(value) {
  if (!plain(value)) refuse();
  return Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
}
function noDuplicate(group) {
  if (group === undefined) return;
  if (!plain(group) || Object.hasOwn(group, CORE)) refuse();
}
function runtimeRow(row, version, resolved, integrity) {
  if (!plain(row) || row.version !== version || row.resolved !== resolved
      || row.integrity !== integrity) refuse();
  for (const flag of ['dev','devOptional','optional','link','hasInstallScript'])
    if (row[flag] !== undefined && row[flag] !== false) refuse();
}
/**
 * Check the selected manifest/lock DATA before a current-profile run.
 * The fixed registry URLs and integrity strings are retained lock inputs, not
 * freshly fetched or installed artifact evidence. There is no npm resolver here.
 */
export function inspectX402RuntimeDependencyText(packageText, lockText) {
  const pkg = parse(packageText), lock = parse(lockText);
  if (pkg.name !== 'zenon-x402-poc' || pkg.version !== '0.2.0' || pkg.private !== true
      || pkg.type !== 'module' || pkg.engines?.node !== '>=24'
      || !plain(pkg.dependencies) || pkg.dependencies[CORE] !== CORE_VERSION) refuse();
  noDuplicate(pkg.devDependencies); noDuplicate(pkg.peerDependencies); noDuplicate(pkg.optionalDependencies);
  if (lock.name !== pkg.name || lock.version !== pkg.version || lock.lockfileVersion !== 3
      || lock.requires !== true || !plain(lock.packages) || Object.keys(lock.packages).length > 512) refuse();
  const root = lock.packages[''];
  if (!plain(root) || root.name !== pkg.name || root.version !== pkg.version
      || root.engines?.node !== pkg.engines.node
      || JSON.stringify(dependencies(root.dependencies)) !== JSON.stringify(dependencies(pkg.dependencies))) refuse();
  noDuplicate(root.devDependencies); noDuplicate(root.peerDependencies); noDuplicate(root.optionalDependencies);
  const core = lock.packages['node_modules/@x402/core'], zod = lock.packages['node_modules/zod'];
  runtimeRow(core, CORE_VERSION, 'https://registry.npmjs.org/@x402/core/-/core-2.23.0.tgz', CORE_INTEGRITY);
  runtimeRow(zod, ZOD_VERSION, 'https://registry.npmjs.org/zod/-/zod-3.25.76.tgz', ZOD_INTEGRITY);
  if (!plain(core.dependencies) || Object.keys(core.dependencies).length !== 1
      || core.dependencies.zod !== '^3.24.2'
      || (zod.dependencies !== undefined && (!plain(zod.dependencies) || Object.keys(zod.dependencies).length !== 0))
      || Object.hasOwn(lock.packages, 'node_modules/@x402/core/node_modules/zod')) refuse();
  return Object.freeze({
    coreVersion: CORE_VERSION, coreDependencyKind: 'runtime', zodVersion: ZOD_VERSION,
    selectedRuntimeLockRows: 2, lockfileVersion: 3, retainedArtifactIntegrityUnchanged: true,
    installedDependencies: false, x402PackageExecuted: false, sdkExecuted: false,
    ordinaryInstalledNamespaceQualified: false,
  });
}

