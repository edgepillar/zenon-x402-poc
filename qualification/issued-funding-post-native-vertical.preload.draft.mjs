/*
 * SOURCE/SYNTAX ONLY. Closed actual issued-native case namespace, not authority.
 * Resolve eight reviewed bare edges to existing real packages. Never replace
 * a native builtin, format, module source, owner, transport or store operation.
 * All declared bytes/identities are checked BEFORE the case/SDK imports.
 * Cooperative admission only: no OS, network or hostile-code sandbox claim.
 */
import { registerHooks, isBuiltin } from 'node:module';
import { constants, openSync, closeSync, readSync, lstatSync, fstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Buffer } from 'node:buffer';

const KIND = 'OFFICIAL_ISSUED_FUNDING_NATIVE_VERTICAL_ONE_CASE_NODE24_V1';
const ENTRY = 'app/qualification/issued-funding-post-native-vertical.case.draft.mjs';
const APP_FILES = 116, PACKAGE_FILES = 404, INPUTS = APP_FILES + PACKAGE_FILES;
const MAX_SOURCE_BYTES = 6291456, MAX_PROFILE_BYTES = 524288;
const FIXED = new Map([
  [ENTRY, 'de5068429bb87c256dc26e04c8a050b0e84306ed19231101a98d8267047c15dc'],
  ['app/src/x402-official-issued-funding-post-native-application.js', '6a36269185cb095f2a7d2c8ac7c90c2e04432e9ef9590dbbb1ab4fecb33fac9f'],
  ['app/qualification/issued-funding-post-native-grant-operator.fixture.draft.mjs', 'b1224cc52ef9a5dd67418392b3064ea79d6a7f8c8abb9c7fb9b986a42bb4f587'],
  ['app/qualification/issued-funding-post-native-rpc-peer.fixture.draft.mjs', '8500fc75a7736a976a9b07efb537e70f7f4f4ca3a1c7a2ee41d33496f8cb706b'],
  ['app/src/zenon/dynamic-plasma-native-funding-service-client.js', '5ed9ac6189f2f86bcc2195c5c6da03ecec7e1e779c4084490029270e617743a8'],
]);
const EDGES = new Map([
  [ENTRY + '\0@noble/ed25519', 'packages/@noble/ed25519/index.js'],
  [ENTRY + '\0@noble/hashes/sha2', 'packages/@noble/hashes/esm/sha2.js'],
  ['app/src/zenon-payment.js\0znn-typescript-sdk', 'packages/znn-typescript-sdk/dist/index.js'],
  ['app/src/zenon-payment.js\0@noble/ed25519', 'packages/@noble/ed25519/index.js'],
  ['app/src/zenon-payment.js\0@noble/hashes/sha2', 'packages/@noble/hashes/esm/sha2.js'],
  ['app/src/x402-official-selected-payment-client.js\0@x402/core/client', 'packages/@x402/core/dist/esm/client/index.mjs'],
  ['app/src/x402-official-selected-settlement-server.js\0@x402/core/server', 'packages/@x402/core/dist/esm/server/index.mjs'],
  ['packages/@x402/core/dist/esm/chunk-N4QXZG2Z.mjs\0zod', 'packages/zod/index.js'],
]);
const VERSIONS = new Map([
  ['packages/@x402/core/package.json', '2.23.0'], ['packages/zod/package.json', '3.25.76'],
  ['packages/znn-typescript-sdk/package.json', '1.0.5'], ['packages/@noble/ed25519/package.json', '2.3.0'],
  ['packages/@noble/hashes/package.json', '1.8.0'],
]);
const E = process.env, mode = E.X402_ISSUED_NATIVE_VERTICAL_MODE;
if (process.version !== 'v24.19.0' || process.platform !== 'darwin' || process.arch !== 'arm64'
    || !['clean', 'lost-ack'].includes(mode)
    || E.X402_ISSUED_NATIVE_VERTICAL_SELECTION !== 'current-native-issued-post-source-draft-v1'
    || E.X402_ISSUED_NATIVE_VERTICAL_RUN_SCOPE !== 'one-reviewed-native-issued-case-v1'
    || E.NODE_DISABLE_COMPILE_CACHE !== '1' || E.WS_NO_BUFFER_UTIL !== '1' || E.WS_NO_UTF_8_VALIDATE !== '1'
    || E.NODE_OPTIONS !== undefined || E.NODE_PATH !== undefined || E.NODE_TEST_CONTEXT !== undefined || E.NODE_V8_COVERAGE !== undefined
    || typeof E.X402_ISSUED_NATIVE_VERTICAL_PROFILE_PATH !== 'string' || E.X402_ISSUED_NATIVE_VERTICAL_PROFILE_PATH.length > 4096
    || !/^[0-9a-f]{64}$/.test(E.X402_ISSUED_NATIVE_VERTICAL_PROFILE_SHA256 || '')
    || process.execArgv.some(v => v === '--permission' || v === '--experimental-permission'
      || v.startsWith('--permission=') || v.startsWith('--allow-fs-'))) reject();
const raw = readOwned(E.X402_ISSUED_NATIVE_VERTICAL_PROFILE_PATH, MAX_PROFILE_BYTES);
if (sha(raw) !== E.X402_ISSUED_NATIVE_VERTICAL_PROFILE_SHA256) reject();
const profile = JSON.parse(raw.toString('ascii'));
exact(profile, ['profileVersion', 'profileKind', 'runtime', 'mode', 'entryURL', 'inputs', 'bareBindings',
  'allowedBuiltins', 'sourceRowsSha256', 'sourceTransform', 'ordinaryInstalledNamespace']);
exact(profile.runtime, ['node', 'platform', 'arch']);
if (profile.profileVersion !== 1 || profile.profileKind !== KIND || profile.mode !== mode
    || profile.runtime.node !== '24.19.0' || profile.runtime.platform !== 'darwin' || profile.runtime.arch !== 'arm64'
    || profile.sourceTransform !== false || profile.ordinaryInstalledNamespace !== false
    || !/^[0-9a-f]{64}$/.test(profile.sourceRowsSha256)
    || !Array.isArray(profile.inputs) || profile.inputs.length !== INPUTS
    || !Array.isArray(profile.bareBindings) || profile.bareBindings.length !== EDGES.size
    || !Array.isArray(profile.allowedBuiltins) || profile.allowedBuiltins.length > 48) reject();
const inputs = new Map(), logical = new Map(), verified = new Set();
let sourceBytes = 0, appFiles = 0, packageFiles = 0;
for (const row of profile.inputs) {
  exact(row, ['logicalPath', 'url', 'bytes', 'sha256', 'identity']); canonicalFileURL(row.url);
  if (typeof row.logicalPath !== 'string' || !/^(?:app|packages)\/[A-Za-z0-9@._/-]+$/.test(row.logicalPath)
      || row.logicalPath.split('/').some(v => v === '' || v === '.' || v === '..') || row.logicalPath.length > 512
      || !Number.isSafeInteger(row.bytes) || row.bytes < 0 || row.bytes > 1048576
      || !/^[0-9a-f]{64}$/.test(row.sha256) || !Array.isArray(row.identity) || row.identity.length !== 9
      || !row.identity.every(v => typeof v === 'string' && /^[0-9]+$/.test(v))
      || inputs.has(row.url) || logical.has(row.logicalPath)) reject();
  sourceBytes += row.bytes; if (sourceBytes > MAX_SOURCE_BYTES) reject();
  if (row.logicalPath.startsWith('app/')) appFiles++; else packageFiles++;
  Object.freeze(row.identity); Object.freeze(row); inputs.set(row.url, row); logical.set(row.logicalPath, row);
}
if (appFiles !== APP_FILES || packageFiles !== PACKAGE_FILES) reject();
for (const [name, digest] of FIXED) if (logical.get(name)?.sha256 !== digest) reject();
const entry = logical.get(ENTRY);
if (!entry || entry.url !== profile.entryURL || !inputs.has(import.meta.url)
    || process.argv.length !== 3 || pathToFileURL(process.argv[1]).href !== entry.url
    || process.argv[2] !== E.SPV_TASK_SCRATCH) reject();
const scratch = lstatSync(process.argv[2], { bigint: true });
if (!scratch.isDirectory() || scratch.isSymbolicLink() || scratch.uid !== BigInt(process.getuid())
    || (scratch.mode & 0o7777n) !== 0o700n) reject();
const bindings = new Map();
for (const row of profile.bareBindings) {
  exact(row, ['parentURL', 'specifier', 'targetURL']);
  const parent = inputs.get(row.parentURL), target = inputs.get(row.targetURL);
  if (!parent || !target || EDGES.get(parent.logicalPath + '\0' + row.specifier) !== target.logicalPath) reject();
  const key = row.parentURL + '\0' + row.specifier;
  if (bindings.has(key)) reject(); bindings.set(key, row.targetURL);
}
if (bindings.size !== EDGES.size) reject();
const builtins = new Set();
for (const name of profile.allowedBuiltins) {
  if (typeof name !== 'string' || !name.startsWith('node:') || !isBuiltin(name) || builtins.has(name)) reject();
  builtins.add(name);
}
for (const row of inputs.values()) verify(row);
for (const [name, version] of VERSIONS) {
  const row = logical.get(name);
  if (!row || JSON.parse(readOwned(fileURLToPath(row.url), 1048576, row.identity).toString('ascii')).version !== version) reject();
}
let resolveCalls = 0, overrides = 0;
const resolved = new Set(), write = process.stdout.write.bind(process.stdout);
process.once('exit', () => write('# pinned-issued-native-vertical-namespace ' + JSON.stringify({
  profileKind: KIND, profileVersion: 1, mode, inputsVerifiedBeforeCase: verified.size,
  applicationFiles: appFiles, packageFiles, declaredSourceBytes: sourceBytes, sourceRowsSha256: profile.sourceRowsSha256,
  resolveCalls, bareImportOverrideHits: overrides, declaredFilesResolved: resolved.size,
  sourceTransforms: 0, nativeBuiltinAliases: 0, ordinaryInstalledNamespaceQualified: false, nativeOsNetworkSandbox: false,
}) + '\n'));
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (++resolveCalls > 8192) reject();
    const chosen = bindings.get(context.parentURL + '\0' + specifier); if (chosen !== undefined) overrides++;
    const result = nextResolve(chosen === undefined ? specifier : chosen, context);
    if (typeof result.url !== 'string') reject();
    if (result.url.startsWith('node:')) { if (!builtins.has(result.url)) reject(); }
    else { const row = inputs.get(result.url); if (!row) reject(); verify(row); resolved.add(row.logicalPath); }
    return result; // No load hook or replacement source/format.
  },
});
function identity(s) { return [s.dev, s.ino, s.uid, s.gid, s.mode, s.nlink, s.size, s.mtimeNs, s.ctimeNs].map(String); }
function verify(row) {
  const file = fileURLToPath(row.url), state = lstatSync(file, { bigint: true });
  if (identity(state).some((v, i) => v !== row.identity[i])) reject();
  if (!verified.has(row.url)) {
    const bytes = readOwned(file, 1048576, row.identity);
    if (bytes.length !== row.bytes || sha(bytes) !== row.sha256) reject(); verified.add(row.url);
  }
}
function readOwned(file, maximum, expected) {
  const s = lstatSync(file, { bigint: true });
  if (!s.isFile() || s.isSymbolicLink() || s.uid !== BigInt(process.getuid()) || s.nlink !== 1n || s.size < 0n || s.size > BigInt(maximum)) reject();
  const before = identity(s); if (expected && before.some((v, i) => v !== expected[i])) reject();
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (identity(fstatSync(fd, { bigint: true })).some((v, i) => v !== before[i])) reject();
    const bytes = Buffer.alloc(Number(s.size) + 1); let size = 0;
    while (size < bytes.length) { const n = readSync(fd, bytes, size, bytes.length - size, null); if (!n) break; size += n; }
    if (size !== Number(s.size) || identity(fstatSync(fd, { bigint: true })).some((v, i) => v !== before[i])
        || identity(lstatSync(file, { bigint: true })).some((v, i) => v !== before[i])) reject();
    return bytes.subarray(0, size);
  } finally { closeSync(fd); }
}
function canonicalFileURL(value) {
  if (typeof value !== 'string') reject(); const u = new URL(value);
  if (u.protocol !== 'file:' || u.host !== '' || u.search !== '' || u.hash !== '' || pathToFileURL(fileURLToPath(u)).href !== value) reject();
}
function exact(value, keys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) reject();
}
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function reject() {
  const code = 'ISSUED_NATIVE_VERTICAL_PINNED_NAMESPACE_REJECTED', error = new TypeError(code);
  Object.defineProperty(error, 'code', { value: code, enumerable: true });
  Object.defineProperty(error, 'stack', { value: 'TypeError: ' + code }); throw Object.freeze(error);
}
