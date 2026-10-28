/*
 * NOT_EXECUTED SDK105 issued-command namespace, not human authority.
 * Retains all baseline source rows; one NEW finite selected-mode scope is required.
 * Resolve nine reviewed bare edges to existing real packages. Never replace
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

const KIND = 'SDK105_ISSUED_COMMAND_APPLICATION_NODE24_V7';
const ENTRY = 'app/qualification/sdk105-issued-command-application-v7.case.mjs';
const APP_FILES = 135, PACKAGE_FILES = 404, INPUTS = APP_FILES + PACKAGE_FILES;
const MAX_SOURCE_BYTES = 6291456, MAX_PROFILE_BYTES = 524288;
const FIXED = new Map([
  [
    "app/qualification/funding-bound-response-loss-gate.mjs",
    "5fdb03510126fb7b13f291eb07d89589c8a8447c3ff767c31c4943eb9a551b65"
  ],
  [
    "app/qualification/issued-current-close-v4-grant.fixture.mjs",
    "0134331b571eda461c8af2398e7dccd67010ed8b0f2c563b11415efc57ef8422"
  ],
  [
    "app/qualification/issued-current-close-v4-rpc.fixture.mjs",
    "f54f75f6e6f50d2ebf9b47323cb16764dc885b754aef3bde390495c973046fc7"
  ],
  [
    "app/qualification/native-funding-bound-response-loss.fixture.mjs",
    "27aa72b2389263e1f1864fd289d8d0ec5a2ae786e2a15675472857bac43a23eb"
  ],
  [
    "app/qualification/sdk105-issued-command-application-v7.case.mjs",
    "5f1cf28128a1af5f710157e8552b007d72b7b40aafde95a3be76d6afd8f32141"
  ],
  [
    "app/src/buyer-command-line-channel.js",
    "aea944d8fd1b28290c6beafe7d13985da1194ed5be5d0e1957490fe8c13e1fab"
  ],
  [
    "app/src/buyer-funding-owned-stream-session.js",
    "3228e6fc0abcaf9714dca72009b99610808a9cc80674662396cb16a4f0b26ad2"
  ],
  [
    "app/src/buyer-original-command-host.js",
    "b81bddf6b944aa39521d20ea5c43ce17f15c3a0f39a462de149d399f2ad300b3"
  ],
  [
    "app/src/buyer-original-funding-command-session.js",
    "19d91c723622e1cb2244c1fa9b3dd59db5fd72120c7163df53076b833ba0c9c5"
  ],
  [
    "app/src/buyer-original-funding-command.js",
    "064a31640b10da873ecf558b0550024366e50cc9d1a5e91a15cc4e006e05e7e9"
  ],
  [
    "app/src/x402-issued-application-response-writer.js",
    "929e619c4261befeba8a583a0096688df5ad6ed1cadee774a89aa579a5a60d95"
  ],
  [
    "app/src/x402-official-issued-funding-post-native-application-v2.js",
    "caffd11d190611f29f9c7ebeef88e009804a878715f7702e32e35b71d37524d9"
  ],
  [
    "app/src/zenon/prepared-hash-wallet-adapter.js",
    "113c275a38aaec45a347666b28fdc43c70704973b8d1c20956ebacad18db3e25"
  ],
  [
    "app/src/zenon/sdk105-funding-service-lifecycle.js",
    "f0c1c1aadd46e14af7709ed84afbd96c2d98c93fb7860e189c2ace38e6ad7c3e"
  ],
  [
    "app/src/zenon/sdk105-local-funding-service-selection.js",
    "54c55352bf4f8ca8a70e582c121c4a86ebd3e72b0f58c35bbb91e72218cb0e23"
  ],
  [
    "app/src/zenon/sdk105-native-funding-command-session.js",
    "7312de4f92e9703b522defffed4b845d0f09c444a8e7ec71184aa99f49d51ae2"
  ],
  [
    "app/src/zenon/sdk105-native-funding-service-client.js",
    "7297c6ba09dcd311888c8c9142119fe7a40d32dfd937c730aa6b070ac202ae8c"
  ],
  [
    "app/src/zenon/sdk105-prepared-hash-wallet-owner.js",
    "73f5e3fb4e90f8b93a6063e26cc353530b50b623d3fb3def9b39f00c43445b56"
  ]
]);
const EDGES = new Map([
  [
    "app/src/zenon-payment.js\u0000znn-typescript-sdk",
    "packages/znn-typescript-sdk/dist/index.js"
  ],
  [
    "app/src/zenon-payment.js\u0000@noble/ed25519",
    "packages/@noble/ed25519/index.js"
  ],
  [
    "app/src/zenon-payment.js\u0000@noble/hashes/sha2",
    "packages/@noble/hashes/esm/sha2.js"
  ],
  [
    "app/src/x402-official-selected-payment-client.js\u0000@x402/core/client",
    "packages/@x402/core/dist/esm/client/index.mjs"
  ],
  [
    "app/src/x402-official-selected-settlement-server.js\u0000@x402/core/server",
    "packages/@x402/core/dist/esm/server/index.mjs"
  ],
  [
    "packages/@x402/core/dist/esm/chunk-N4QXZG2Z.mjs\u0000zod",
    "packages/zod/index.js"
  ],
  [
    "app/qualification/sdk105-issued-command-application-v7.case.mjs\u0000@noble/ed25519",
    "packages/@noble/ed25519/index.js"
  ],
  [
    "app/qualification/sdk105-issued-command-application-v7.case.mjs\u0000@noble/hashes/sha2",
    "packages/@noble/hashes/esm/sha2.js"
  ],
  [
    "app/qualification/sdk105-issued-command-application-v7.case.mjs\u0000znn-typescript-sdk",
    "packages/znn-typescript-sdk/dist/index.js"
  ]
]);
const VERSIONS = new Map([
  ['packages/@x402/core/package.json', '2.23.0'], ['packages/zod/package.json', '3.25.76'],
  ['packages/znn-typescript-sdk/package.json', '1.0.5'], ['packages/@noble/ed25519/package.json', '2.3.0'],
  ['packages/@noble/hashes/package.json', '1.8.0'],
]);
const EXPECTED_BUILTINS = Object.freeze(["node:assert/strict","node:async_hooks","node:buffer","node:crypto","node:events","node:fs","node:fs/promises","node:http","node:https","node:module","node:net","node:path","node:perf_hooks","node:process","node:sqlite","node:stream","node:test","node:timers","node:tls","node:url","node:util","node:vm","node:zlib"]);
const E = process.env, mode = E.X402_SDK105_ISSUED_COMMAND_MODE;
if (process.version !== 'v24.19.0' || process.platform !== 'darwin' || process.arch !== 'arm64'
    || !['funding-response-loss'].includes(E.X402_SDK105_ISSUED_COMMAND_MODE)
    || E.X402_SDK105_ISSUED_COMMAND_SELECTION !== 'sdk105-issued-command-application-v7'
    || E.X402_ISSUED_CLOSE_NATIVE_SELECTION !== 'current-native-issued-close-source-v4'
    || E.X402_SDK105_ISSUED_COMMAND_RUN_SCOPE !== 'one-sdk105-issued-command-application-v7'
    || E.NODE_DISABLE_COMPILE_CACHE !== '1' || E.WS_NO_BUFFER_UTIL !== '1' || E.WS_NO_UTF_8_VALIDATE !== '1'
    || E.NODE_OPTIONS !== undefined || E.NODE_PATH !== undefined || E.NODE_TEST_CONTEXT !== undefined || E.NODE_V8_COVERAGE !== undefined
    || typeof E.X402_SDK105_ISSUED_COMMAND_PROFILE_PATH !== 'string' || E.X402_SDK105_ISSUED_COMMAND_PROFILE_PATH.length > 4096
    || !/^[0-9a-f]{64}$/.test(E.X402_SDK105_ISSUED_COMMAND_PROFILE_SHA256 || '')
    || process.execArgv.some(v => v === '--permission' || v === '--experimental-permission'
      || v.startsWith('--permission=') || v.startsWith('--allow-fs-'))) reject();
const raw = readOwned(E.X402_SDK105_ISSUED_COMMAND_PROFILE_PATH, MAX_PROFILE_BYTES);
if (sha(raw) !== E.X402_SDK105_ISSUED_COMMAND_PROFILE_SHA256) reject();
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
process.once('exit', () => write('# pinned-sdk105-issued-command-application-v7-namespace ' + JSON.stringify({
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
  const code = 'SDK105_ISSUED_COMMAND_PINNED_NAMESPACE_REJECTED', error = new TypeError(code);
  Object.defineProperty(error, 'code', { value: code, enumerable: true });
  Object.defineProperty(error, 'stack', { value: 'TypeError: ' + code }); throw Object.freeze(error);
}
