/*
 * Qualification preload for the exact twelve-case v2 submission fixture.
 * This is an EXPLICIT PINNED PACKAGE-RESOLUTION PROFILE, not an ordinary
 * installed namespace or a production/default loader. Do not run it without
 * the separately reviewed graph/launcher, capacity and direct twelve-case v2 SDK/key/SQL scope.
 *
 * Only five reviewed bare-import edges are redirected to the existing real
 * packages. All other resolution delegates unchanged to Node, then must land
 * in the declared input set. No source transform, fake SDK/preflight/store,
 * async loader, worker, child, network import, installer or cache is supplied.
 *
 * Source pins and resolver checks are cooperative guards, NOT a sandbox
 * against hostile same-user code or a proof of caller authorization/cleanup.
 * Native-fchmod mode has NO Node Permission Model or OS/network isolation.
 */
import { registerHooks, isBuiltin } from 'node:module';
import { constants, openSync, closeSync, readSync, lstatSync, fstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Buffer } from 'node:buffer';

const FIXTURE = 'app/qualification/dynamic-plasma-original-funding-submission-v2-selection.behavior.draft.mjs';
const HELPER = 'app/qualification/dynamic-plasma-original-funding-submission-v2.fixture.draft.mjs';
const HELPER_SHA = '592bfcfc92054ef120803ad4a60f124b580c3d424cd3345f807ae7e9f46c46eb';
const FIXTURE_SHA = '6922e8ac6f349c4866c861d31eab676ee101494079c19d165452408138206677';
const FIXED_SOURCES = [
  [
    "app/qualification/dynamic-plasma-original-funding-submission-v2.behavior.draft.mjs",
    "36e545c480922e2144ee7539551f8d8bb11dcf02fa9942cbed33438f534c0072"
  ],
  [
    "app/qualification/service-credit-payer-owner-reentrant-recovery-close-v2.behavior.draft.mjs",
    "03194cc30d41d58ec50219c80329cb6624ba618fc2c5d7a737117b0b8ff601fa"
  ],
  [
    "app/src/zenon/dynamic-plasma-original-funding-preparation.js",
    "0e1eb8bb94ecd4da8d4dc8f9b384510e8c2764601ba22e228126ba9ed01368c6"
  ],
  [
    "app/src/zenon/dynamic-plasma-original-funding-submission.js",
    "011077f16718334ef0c67c51901cc1f090ac872181e621da48932ec6f102698e"
  ],
  [
    "app/src/zenon/dynamic-plasma-original-funding-data.js",
    "b2cf8d63646ed4da467ddb3e621247470c2462925c190866d5a070d9dc5b123d"
  ],
  [
    "app/src/zenon/dynamic-plasma-observed-balance-deferred-material-planner.js",
    "4cd321d23d9786c0cdff6ff9490b03d07441ba75aa66011b64ca4c16a84a4a4a"
  ],
  [
    "app/src/zenon/dynamic-plasma-observed-balance-user-send-read-adapter.js",
    "36f40b8bac1359d8e1986ed75714ccb7c94912829181a03fa6b479ad262a2184"
  ],
  [
    "app/src/service-credit-zenon-funding-post-v1-payer-recovery-owner.js",
    "150aaeeaebd5c8f9bdf7b8c84f79e9cccada265469b89c28c4252ee81d6f6de2"
  ],
  [
    "app/src/service-credit-bounded-operation-drain.js",
    "ccaf1742f94a2ae312598c4bb2adc0c6168b1ade0167dbc8990422f5e7037885"
  ]
];
const PROFILE_KIND = 'ZENON_DP_ORIGINAL_FUNDING_V2_TWELVE_CASE_NODE24';
const stringify = JSON.stringify, parse = JSON.parse, hash = createHash;
const E = process.env, profilePath = E.X402_DP_SUBMISSION_V2_PROFILE_PATH, profileSha = E.X402_DP_SUBMISSION_V2_PROFILE_SHA256;
if (process.versions.node !== '24.19.0' || process.platform !== 'darwin' || process.arch !== 'arm64'
    || E.X402_DP_SUBMISSION_V2_SELECTION !== 'twelve-synthetic-v2-cases-only'
    || E.X402_DP_SUBMISSION_V2_NATIVE_MODE !== 'reviewed-native-fchmod'
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
if (p.profileVersion !== 3 || p.profileKind !== PROFILE_KIND || p.runtime.node !== '24.19.0'
    || p.runtime.platform !== 'darwin' || p.runtime.arch !== 'arm64' || p.sourceTransform !== false
    || p.ordinaryInstalledNamespace !== false || !/^[0-9a-f]{64}$/.test(p.sourceRowsSha256)
    || !Array.isArray(p.inputs) || p.inputs.length !== 436
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
process.once('exit', () => write('# pinned-dp-original-funding-v2-node-namespace ' + stringify({
  profileKind: PROFILE_KIND, expectedCases: 12, profileVersion: 3, sourceRowsSha256: p.sourceRowsSha256,
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
  const code = 'X402_PINNED_DP_V2_TWELVE_CASE_PROFILE_REJECTED';
  const error = new TypeError(code);
  Object.defineProperty(error, 'code', { value: code, enumerable: true });
  Object.defineProperty(error, 'stack', { value: 'TypeError: ' + code });
  throw Object.freeze(error);
}
