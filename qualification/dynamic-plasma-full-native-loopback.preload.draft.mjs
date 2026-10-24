/*
 * Unexecuted full native local namespace admission, not execution authority.
 * Only five reviewed bare imports resolve to actual pinned existing packages.
 * Native builtins and module source loading are not replaced or transformed.
 * Source/identity checks are cooperative, not an OS/network sandbox.
 * Native-fchmod mode uses no Node Permission Model; no installer or child.
 */
import { registerHooks, isBuiltin } from 'node:module';
import { constants, openSync, closeSync, readSync, lstatSync, fstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Buffer } from 'node:buffer';

const FIXTURE = 'app/qualification/dynamic-plasma-full-native-loopback.selection.draft.mjs';
const HELPER = 'app/qualification/dynamic-plasma-full-native-loopback.fixture.draft.mjs';
const HELPER_SHA = 'f28e3d782ab7c56b80e6f1e483c639b5b93f07559ff8bf8da07708439e3f1ab3';
const FIXTURE_SHA = 'faca4303ed279a1dbfc8267311c477f10a1c0054efd66e297a4b5120c2cd4e26';
const FIXED_SOURCES = [
  [
    "app/qualification/dynamic-plasma-full-native-loopback.behavior.draft.mjs",
    "5cfba4dbee41c508bfa074753e9ede5572b932caa742c5d711e260df8de8dff3"
  ],
  [
    "app/src/service-credit-funding-post-native-https-transport.js",
    "3b3fec921b46c62ed7557043f99cffb2e1a12f515bf4e607ea8f61525db28b7c"
  ],
  [
    "app/src/service-credit-zenon-funding-post-v1-payer-recovery-owner.js",
    "d62450b462a5412c35dfa474cbf7cac1e5aad88ecd6fc04106e36a67f8459a80"
  ],
  [
    "app/src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js",
    "bea9e00aa6208f776561c975d54640dfb676168dd4d0b44d125c9dc684912c4a"
  ],
  [
    "app/src/zenon/bounded-json-rpc-https-exchange-owner.js",
    "2c501f3353d55e31d4baedcb068e2bac5943ca7e3e4171521a3bb0ee8a0a8bdb"
  ],
  [
    "app/src/zenon/dynamic-plasma-bounded-material-exchange.js",
    "6773c946991834dfe3b01943bdb9bad7513ef0cbbb15b31e607b095bab42b28b"
  ],
  [
    "app/src/zenon/dynamic-plasma-native-funding-close-session.js",
    "642ba6edf4983818145b973116638e63f15eaa0fcc4fe342052d927a096d2bc7"
  ],
  [
    "app/src/zenon/dynamic-plasma-native-https-original-funding-submission.js",
    "813ee2aa8488f788025d9ee2704e4a207dfd6dc2e34cbf5c827988d1908ae8d6"
  ],
  [
    "app/src/zenon/dynamic-plasma-original-funding-bounded-read-close.js",
    "69fe92b9460aba5f5ecb671a4befe059f0686f4ca2e50ffeaf468e25893f0f9c"
  ],
  [
    "app/src/zenon/dynamic-plasma-original-funding-preparation.js",
    "0e1eb8bb94ecd4da8d4dc8f9b384510e8c2764601ba22e228126ba9ed01368c6"
  ],
  [
    "app/src/zenon/dynamic-plasma-original-funding-submission.js",
    "666551930bcf481d136c773de12d00228822c0f2a810d5c92aafa401acf80c68"
  ],
  [
    "app/src/zenon/dynamic-plasma-retained-https-read-owners.js",
    "48ed2db2e36a12a93c106d76315f376a56f186cbf591ac544cb02c51f203c64d"
  ],
  [
    "app/src/zenon/dynamic-plasma-retained-https-read-session.js",
    "791d2c74a81a18d4e3b4478d9ca569db1ec971f5c1e0540ddac02eb3a79938b7"
  ],
  [
    "app/src/zenon/dynamic-plasma-user-send-nonce-search.js",
    "8eda71acf12265b65015ad6db20c1c7b357b207874c8e4c8b72e2889bf86f318"
  ]
];
const PROFILE_KIND = 'ZENON_DP_FULL_NATIVE_LOOPBACK_THREE_CASE_NODE24';
const stringify = JSON.stringify, parse = JSON.parse, hash = createHash;
const E = process.env, profilePath = E.X402_DP_FULL_LOCAL_PROFILE_PATH, profileSha = E.X402_DP_FULL_LOCAL_PROFILE_SHA256;
if (process.versions.node !== '24.19.0' || process.platform !== 'darwin' || process.arch !== 'arm64'
    || E.X402_DP_FULL_LOCAL_SELECTION !== 'three-full-native-loopback-cases-only'
    || E.X402_DP_FULL_LOCAL_NATIVE_MODE !== 'reviewed-native-fchmod'
    || process.execArgv.some(value => value === '--permission' || value === '--experimental-permission'
      || value.startsWith('--permission=') || value.startsWith('--allow-fs-'))
    || E.WS_NO_BUFFER_UTIL !== '1' || E.WS_NO_UTF_8_VALIDATE !== '1'
    || E.NODE_DISABLE_COMPILE_CACHE !== '1' || E.NODE_OPTIONS !== undefined
    || E.NODE_PATH !== undefined || E.NODE_TEST_CONTEXT !== undefined || E.NODE_V8_COVERAGE !== undefined
    || typeof profilePath !== 'string' || profilePath.length > 4096
    || !/^[0-9a-f]{64}$/.test(profileSha || '')) reject();
const profileBytes = readOwned(profilePath, 262144);
if (sha(profileBytes) !== profileSha) reject();
const p = parse(profileBytes.toString('utf8'));
exact(p, ['profileVersion', 'profileKind', 'runtime', 'entryURL', 'inputs', 'bareBindings',
  'allowedBuiltins', 'sourceRowsSha256', 'sourceTransform', 'ordinaryInstalledNamespace']);
exact(p.runtime, ['node', 'platform', 'arch']);
if (p.profileVersion !== 2 || p.profileKind !== PROFILE_KIND || p.runtime.node !== '24.19.0'
    || p.runtime.platform !== 'darwin' || p.runtime.arch !== 'arm64' || p.sourceTransform !== false
    || p.ordinaryInstalledNamespace !== false || !/^[0-9a-f]{64}$/.test(p.sourceRowsSha256)
    || !Array.isArray(p.inputs) || p.inputs.length !== 456
    || !Array.isArray(p.bareBindings) || p.bareBindings.length !== 5
    || !Array.isArray(p.allowedBuiltins) || p.allowedBuiltins.length > 48) reject();
const inputs = new Map(), logical = new Map(), verified = new Set();
let sourceBytes = 0;
for (const row of p.inputs) {
  exact(row, ['logicalPath', 'url', 'bytes', 'sha256', 'identity']);
  fileURL(row.url);
  if (typeof row.logicalPath !== 'string' || !/^(?:app|packages)\//.test(row.logicalPath)
      || row.logicalPath.includes('..') || row.logicalPath.length > 512
      || !Number.isSafeInteger(row.bytes) || row.bytes < 0 || row.bytes > 1048576
      || !/^[0-9a-f]{64}$/.test(row.sha256) || !Array.isArray(row.identity) || row.identity.length !== 9
      || !row.identity.every(value => typeof value === 'string' && /^[0-9]+$/.test(value))
      || inputs.has(row.url) || logical.has(row.logicalPath)) reject();
  sourceBytes += row.bytes;
  if (sourceBytes > 4194304) reject();
  Object.freeze(row.identity); Object.freeze(row);
  inputs.set(row.url, row); logical.set(row.logicalPath, row);
}
for (const [name, digest] of FIXED_SOURCES) {
  if (logical.get(name)?.sha256 !== digest) reject();
}
const entry = logical.get(FIXTURE), helper = logical.get(HELPER);
if (!helper || helper.sha256 !== HELPER_SHA) reject();
if (!entry || entry.sha256 !== FIXTURE_SHA || p.entryURL !== entry.url
    || !inputs.has(import.meta.url) || process.argv.length !== 3
    || pathToFileURL(process.argv[1]).href !== p.entryURL
    || process.argv[2] !== E.SPV_TASK_SCRATCH) reject();
const scratch = lstatSync(process.argv[2], { bigint: true });
if (!scratch.isDirectory() || scratch.isSymbolicLink() || scratch.uid !== BigInt(process.getuid())
    || (scratch.mode & 0o077n) !== 0n) reject();

const expectedTargets = new Map([
  ['@noble/ed25519', 'packages/@noble/ed25519/index.js'],
  ['@noble/hashes/sha2', 'packages/@noble/hashes/esm/sha2.js'],
  ['znn-typescript-sdk', 'packages/znn-typescript-sdk/dist/index.js'],
]);
const callerNames = new Set([HELPER, 'app/src/zenon-payment.js']);
const bindings = new Map();
for (const b of p.bareBindings) {
  exact(b, ['parentURL', 'specifier', 'targetURL']);
  const parent = inputs.get(b.parentURL), target = inputs.get(b.targetURL);
  if (!parent || !target || !callerNames.has(parent.logicalPath)
      || expectedTargets.get(b.specifier) !== target.logicalPath
      || (parent.logicalPath === HELPER && b.specifier === 'znn-typescript-sdk')) reject();
  const key = b.parentURL + '\0' + b.specifier;
  if (bindings.has(key)) reject();
  bindings.set(key, b.targetURL);
}
if (bindings.size !== 5) reject();
const builtins = new Set();
for (const value of p.allowedBuiltins) {
  if (typeof value !== 'string' || !value.startsWith('node:') || !isBuiltin(value)) reject();
  builtins.add(value);
}
// Check every reviewed byte/identity before any fixture or SDK is imported.
for (const row of inputs.values()) verify(row);
for (const [name, version] of [
  ['packages/znn-typescript-sdk/package.json', '1.0.5'],
  ['packages/@noble/ed25519/package.json', '2.3.0'],
  ['packages/@noble/hashes/package.json', '1.8.0'],
]) {
  const row = logical.get(name);
  if (!row || parse(readOwned(fileURLToPath(row.url), 1048576, row.identity).toString('utf8')).version !== version) reject();
}
let resolveCalls = 0, overrideHits = 0;
const resolved = new Set();
const write = process.stdout.write.bind(process.stdout);
process.once('exit', () => write('# pinned-dp-full-native-loopback-node-namespace ' + stringify({
  profileKind: PROFILE_KIND, expectedCases: 3, profileVersion: 2, sourceRowsSha256: p.sourceRowsSha256,
  inputsVerifiedBeforeFixture: verified.size, declaredSourceBytes: sourceBytes,
  resolveCalls, bareImportOverrideHits: overrideHits, declaredFilesResolved: resolved.size,
  sourceTransforms: 0, ordinaryInstalledNamespaceQualified: false,
  noNetworkOrOsSandboxClaim: true,
}) + '\n'));
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (++resolveCalls > 4096) reject();
    const chosen = bindings.get(context.parentURL + '\0' + specifier);
    if (chosen !== undefined) overrideHits++;
    const result = nextResolve(chosen === undefined ? specifier : chosen, context);
    if (typeof result.url !== 'string') reject();
    if (result.url.startsWith('node:')) {
      if (!builtins.has(result.url)) reject();
    } else {
      const row = inputs.get(result.url);
      if (!row) reject();
      verify(row); resolved.add(row.logicalPath);
    }
    return result; // Native result/format/source loading is not replaced or transformed.
  },
});

function verify(row) {
  const path = fileURLToPath(row.url), state = lstatSync(path, { bigint: true });
  if (identity(state).some((value, index) => value !== row.identity[index])) reject();
  if (!verified.has(row.url)) {
    const raw = readOwned(path, 1048576, row.identity);
    if (raw.length !== row.bytes || sha(raw) !== row.sha256) reject();
    verified.add(row.url);
  }
}
function identity(s) {
  return [s.dev, s.ino, s.uid, s.gid, s.mode, s.nlink, s.size, s.mtimeNs, s.ctimeNs].map(String);
}
function readOwned(path, maximum, expected) {
  const s = lstatSync(path, { bigint: true });
  if (!s.isFile() || s.isSymbolicLink() || s.uid !== BigInt(process.getuid()) || s.nlink !== 1n
      || s.size < 0n || s.size > BigInt(maximum)) reject();
  const before = identity(s);
  if (expected && before.some((value, index) => value !== expected[index])) reject();
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (identity(fstatSync(fd, { bigint: true })).some((value, index) => value !== before[index])) reject();
    const out = Buffer.alloc(Number(s.size) + 1);
    let length = 0;
    while (length < out.length) {
      const n = readSync(fd, out, length, out.length - length, null);
      if (n === 0) break;
      length += n;
    }
    if (length !== Number(s.size)
        || identity(fstatSync(fd, { bigint: true })).some((value, index) => value !== before[index])
        || identity(lstatSync(path, { bigint: true })).some((value, index) => value !== before[index])) reject();
    return out.subarray(0, length);
  } finally { closeSync(fd); }
}
function fileURL(value) {
  if (typeof value !== 'string') reject();
  const u = new URL(value);
  if (u.protocol !== 'file:' || u.host !== '' || u.search !== '' || u.hash !== ''
      || pathToFileURL(fileURLToPath(u)).href !== value) reject();
}
function exact(value, keys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== keys.length
      || keys.some(key => !Object.hasOwn(value, key))) reject();
}
function sha(raw) { return hash('sha256').update(raw).digest('hex'); }
function reject() {
  const code = 'X402_PINNED_DP_FULL_NATIVE_LOOPBACK_PROFILE_REJECTED';
  const error = new TypeError(code);
  Object.defineProperty(error, 'code', { value: code, enumerable: true });
  Object.defineProperty(error, 'stack', { value: 'TypeError: ' + code });
  throw Object.freeze(error);
}
