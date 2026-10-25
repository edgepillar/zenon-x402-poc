/*
 * NOT_EXECUTED current full native close namespace, not human authority.
 * Retains all baseline source rows; one NEW finite clean scope is required.
 * Resolve ten reviewed bare edges to existing real packages. Never replace
 * a native builtin, format, module source, owner, transport or store operation.
 * All declared bytes/identities are checked BEFORE the case/SDK imports.
 * Cooperative admission only: no OS, network or hostile-code sandbox claim.
 */
import { registerHooks, isBuiltin } from 'node:module';
import { constants, openSync, closeSync, readSync, lstatSync, fstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Buffer } from 'node:buffer';
import { dirname, isAbsolute, resolve } from 'node:path';

const KIND = 'OFFICIAL_ISSUED_CURRENT_CLOSE_ONE_CLEAN_NODE24_V4';
const ENTRY = 'app/qualification/issued-current-close-v4.case.mjs';
const APP_FILES = 123, PACKAGE_FILES = 404, INPUTS = APP_FILES + PACKAGE_FILES;
const MAX_SOURCE_BYTES = 6291456, MAX_PROFILE_BYTES = 524288;
const FIXED = new Map([
  ["app/qualification/issued-current-close-v4.case.mjs", "b79e955adffd83cd727e613fa9e54bede5edb06c678e303dbbea3578cfbbf883"],
  ["app/qualification/issued-current-close-v4-grant.fixture.mjs", "0134331b571eda461c8af2398e7dccd67010ed8b0f2c563b11415efc57ef8422"],
  ["app/qualification/issued-current-close-v4-rpc.fixture.mjs", "f54f75f6e6f50d2ebf9b47323cb16764dc885b754aef3bde390495c973046fc7"],
  ["app/src/zenon/dynamic-plasma-native-funding-service-client.js", "71b6a60c926d66dbc1b70888a2dc1720abc6886cb3c98cac28722d7be4089a01"],
  ["app/src/service-credit-bounded-close-completion.js", "1d59ec72cf9b8877947ba766316746be1e2ca5b82029c9b656757c2953ff7e5e"],
  ["app/src/service-credit-bounded-operation-drain.js", "4ea81e010451f91bb8f0ca668dd6bd3966763ea23385bdd0d511c200e4b3eecd"],
  ["app/src/service-credit-native-guarded-store-close.js", "9110b9127388c893163f153a7bbea373955a44a49bc5f0ca595e6b179389e885"],
  ["app/src/x402-official-issued-funding-post-native-application.js", "19f147de7167ea0c20f51958b3716fb9d8fcc21e63ee6c9d74fe34dcde727cdd"],
]);
const EDGES = new Map([
  ["app/qualification/issued-funding-post-native-vertical.case.draft.mjs\0@noble/ed25519", "packages/@noble/ed25519/index.js"],
  ["app/qualification/issued-funding-post-native-vertical.case.draft.mjs\0@noble/hashes/sha2", "packages/@noble/hashes/esm/sha2.js"],
  ["app/src/zenon-payment.js\0znn-typescript-sdk", "packages/znn-typescript-sdk/dist/index.js"],
  ["app/src/zenon-payment.js\0@noble/ed25519", "packages/@noble/ed25519/index.js"],
  ["app/src/zenon-payment.js\0@noble/hashes/sha2", "packages/@noble/hashes/esm/sha2.js"],
  ["app/src/x402-official-selected-payment-client.js\0@x402/core/client", "packages/@x402/core/dist/esm/client/index.mjs"],
  ["app/src/x402-official-selected-settlement-server.js\0@x402/core/server", "packages/@x402/core/dist/esm/server/index.mjs"],
  ["packages/@x402/core/dist/esm/chunk-N4QXZG2Z.mjs\0zod", "packages/zod/index.js"],
  ["app/qualification/issued-current-close-v4.case.mjs\0@noble/ed25519", "packages/@noble/ed25519/index.js"],
  ["app/qualification/issued-current-close-v4.case.mjs\0@noble/hashes/sha2", "packages/@noble/hashes/esm/sha2.js"],
]);
const VERSIONS = new Map([
  ['packages/@x402/core/package.json', '2.23.0'], ['packages/zod/package.json', '3.25.76'],
  ['packages/znn-typescript-sdk/package.json', '1.0.5'], ['packages/@noble/ed25519/package.json', '2.3.0'],
  ['packages/@noble/hashes/package.json', '1.8.0'],
]);
const EXPECTED_BUILTINS = Object.freeze(["node:assert/strict","node:async_hooks","node:buffer","node:crypto","node:events","node:fs","node:fs/promises","node:http","node:https","node:module","node:net","node:path","node:perf_hooks","node:sqlite","node:stream","node:test","node:timers","node:tls","node:url","node:util","node:vm","node:zlib"]);
const E = process.env, mode = E.X402_ISSUED_CLOSE_NATIVE_MODE;
if (process.version !== 'v24.19.0' || process.platform !== 'darwin' || process.arch !== 'arm64'
    || mode !== 'clean'
    || E.X402_ISSUED_CLOSE_NATIVE_SELECTION !== 'current-native-issued-close-source-v4'
    || E.X402_ISSUED_CLOSE_NATIVE_RUN_SCOPE !== 'one-current-clean-issued-close-v4'
    || E.NODE_DISABLE_COMPILE_CACHE !== '1' || E.WS_NO_BUFFER_UTIL !== '1' || E.WS_NO_UTF_8_VALIDATE !== '1'
    || E.NODE_OPTIONS !== undefined || E.NODE_PATH !== undefined || E.NODE_TEST_CONTEXT !== undefined || E.NODE_V8_COVERAGE !== undefined
    || typeof E.X402_ISSUED_CLOSE_NATIVE_PROFILE_PATH !== 'string' || E.X402_ISSUED_CLOSE_NATIVE_PROFILE_PATH.length > 4096
    || !/^[0-9a-f]{64}$/.test(E.X402_ISSUED_CLOSE_NATIVE_PROFILE_SHA256 || '')
    || process.execArgv.some(v => v === '--permission' || v === '--experimental-permission'
      || v.startsWith('--permission=') || v.startsWith('--allow-fs-'))) reject();
const raw = readOwned(E.X402_ISSUED_CLOSE_NATIVE_PROFILE_PATH, MAX_PROFILE_BYTES);
if (sha(raw) !== E.X402_ISSUED_CLOSE_NATIVE_PROFILE_SHA256) reject();
const profile = JSON.parse(raw.toString('ascii'));
exact(profile, ['profileVersion', 'profileKind', 'runtime', 'mode', 'entryURL', 'inputs', 'bareBindings',
  'allowedBuiltins', 'sourceRowsSha256', 'sourceTransform', 'ordinaryInstalledNamespace']);
exact(profile.runtime, ['node', 'platform', 'arch']);
if (profile.profileVersion !== 4 || profile.profileKind !== KIND || profile.mode !== mode
    || profile.runtime.node !== '24.19.0' || profile.runtime.platform !== 'darwin' || profile.runtime.arch !== 'arm64'
    || profile.sourceTransform !== false || profile.ordinaryInstalledNamespace !== false
    || !/^[0-9a-f]{64}$/.test(profile.sourceRowsSha256)
    || !Array.isArray(profile.inputs) || profile.inputs.length !== INPUTS
    || !Array.isArray(profile.bareBindings) || profile.bareBindings.length !== EDGES.size
    || !Array.isArray(profile.allowedBuiltins)
    || JSON.stringify(profile.allowedBuiltins) !== JSON.stringify(EXPECTED_BUILTINS)) reject();
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
process.once('exit', () => write('# pinned-issued-native-current-close-v4-namespace ' + JSON.stringify({
  profileKind: KIND, profileVersion: 4, mode, inputsVerifiedBeforeCase: verified.size,
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
  if (!isAbsolute(file) || resolve(file) !== file) reject();
  for (let at = file; ; at = dirname(at)) {
    if (lstatSync(at).isSymbolicLink()) reject();
    if (dirname(at) === at) break;
  }
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
