/*
 * Pinned package-resolution profile for three positive-work/V3/SDK/V6 cases.
 * Not an ordinary installed namespace or production/default loader. Only five
 * reviewed bare-import edges are redirected to existing real packages. The
 * expanded actual bounded producer graph is pinned; no source transformation.
 * Source checks are cooperative, not caller authority or an OS/network sandbox.
 * Native-fchmod mode has no Node Permission Model. No installer or child.
 */
import { registerHooks, isBuiltin } from 'node:module';
import { constants, openSync, closeSync, readSync, lstatSync, fstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Buffer } from 'node:buffer';

const FIXTURE = 'app/qualification/dynamic-plasma-original-funding-positive-work-native.selection.draft.mjs';
const HELPER = 'app/qualification/dynamic-plasma-original-funding-positive-work.fixture.draft.mjs';
const HELPER_SHA = '403eea986e42eadfcb7fd10ea2769af45f0c8d9c00f0e34a1db43afb8febfda1';
const FIXTURE_SHA = '665a9a08f5b782781f57a789a04148c327900a19a72414581272a8b3de580f84';
const FIXED_SOURCES = [
  [
    "app/qualification/dynamic-plasma-original-funding-positive-work-native.behavior.draft.mjs",
    "0c9f89936915476b3c235b13189edc2813931cf4b61bc0fd36bf3eb037833a19"
  ],
  [
    "app/src/zenon/dynamic-plasma-original-funding-preparation.js",
    "0e1eb8bb94ecd4da8d4dc8f9b384510e8c2764601ba22e228126ba9ed01368c6"
  ],
  [
    "app/src/zenon/dynamic-plasma-original-funding-submission.js",
    "6929369231bba5cc7d34679ee1eda0ac43977c7ed78ebd00944f3d2c3d90d677"
  ],
  [
    "app/src/zenon/dynamic-plasma-original-funding-read-close.js",
    "5086567b2c0cce0fc3419db69641beb7e5e434d47f83e17015682964ad482a45"
  ],
  [
    "app/src/zenon/dynamic-plasma-retained-read-session-core.js",
    "a0f91046c47cfa770f30bf299f620086351ee15977f669d9ec6016dd08d65794"
  ],
  [
    "app/src/zenon/dynamic-plasma-retained-account-exchange-gate.js",
    "3304fee96333a0544c9ad3be0c5d465ff6d2377ae3ae657ac11f84482bb357f9"
  ],
  [
    "app/src/zenon/bounded-json-rpc-read-admission.js",
    "0b0b0806487c2e648a83367a9ebcd48a3a92493158ebca23abe8d6d6849d9ff3"
  ],
  [
    "app/src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js",
    "bea9e00aa6208f776561c975d54640dfb676168dd4d0b44d125c9dc684912c4a"
  ],
  [
    "app/src/zenon/dynamic-plasma-bounded-material-exchange.js",
    "6773c946991834dfe3b01943bdb9bad7513ef0cbbb15b31e607b095bab42b28b"
  ],
  [
    "app/src/zenon/dynamic-plasma-user-send-pre-work-key-binding.js",
    "81c0b84174d045baac9b3cc8915e3a079ecf60590cbe43230bff287ce37d8bd9"
  ],
  [
    "app/src/zenon/dynamic-plasma-user-send-nonce-search.js",
    "8eda71acf12265b65015ad6db20c1c7b357b207874c8e4c8b72e2889bf86f318"
  ]
];
const PROFILE_KIND = 'ZENON_DP_ORIGINAL_FUNDING_POSITIVE_WORK_THREE_CASE_NODE24';
const stringify = JSON.stringify, parse = JSON.parse, hash = createHash;
const E = process.env, profilePath = E.X402_DP_POSITIVE_WORK_PROFILE_PATH, profileSha = E.X402_DP_POSITIVE_WORK_PROFILE_SHA256;
if (process.versions.node !== '24.19.0' || process.platform !== 'darwin' || process.arch !== 'arm64'
    || E.X402_DP_POSITIVE_WORK_SELECTION !== 'three-selected-positive-work-cases-only'
    || E.X402_DP_POSITIVE_WORK_NATIVE_MODE !== 'reviewed-native-fchmod'
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
    || !Array.isArray(p.inputs) || p.inputs.length !== 442
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
process.once('exit', () => write('# pinned-dp-original-funding-positive-work-node-namespace ' + stringify({
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
  const code = 'X402_PINNED_DP_POSITIVE_WORK_THREE_CASE_PROFILE_REJECTED';
  const error = new TypeError(code);
  Object.defineProperty(error, 'code', { value: code, enumerable: true });
  Object.defineProperty(error, 'stack', { value: 'TypeError: ' + code });
  throw Object.freeze(error);
}
