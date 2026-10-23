/*
 * SOURCE-ONLY qualification preload for the exact nine-case submission fixture.
 * This is an EXPLICIT PINNED PACKAGE-RESOLUTION PROFILE, not an ordinary
 * installed namespace or a production/default loader. Do not run it without
 * the separately reviewed graph/launcher, capacity and direct nine-case SDK/key/SQL scope.
 *
 * Only five reviewed bare-import edges are redirected to the existing real
 * packages. All other resolution delegates unchanged to Node, then must land
 * in the declared input set. No source transform, fake SDK/preflight/store,
 * async loader, worker, child, network import, installer or cache is supplied.
 *
 * Source pins and Node permissions are cooperative guards, NOT a sandbox
 * against hostile same-user code or a proof of caller authorization/cleanup.
 */
import { registerHooks, isBuiltin } from 'node:module';
import { constants, openSync, closeSync, readSync, lstatSync, fstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Buffer } from 'node:buffer';

const FIXTURE = 'app/qualification/dynamic-plasma-original-funding-submission-reentrant-v2.behavior.draft.mjs';
const HELPER = 'app/qualification/dynamic-plasma-original-funding-submission.fixture.draft.mjs';
const HELPER_SHA = 'e1aa5acb7c7753bf77d3a6dc582bcf874067992cf8ac9b592edcc8438ef7c3ac';
const FIXTURE_SHA = 'c673b4cfc8acf946b18befd37dadfe5a1629ebb7c716fa92b06da9296648d054';
const FIXED_SOURCES = [
  ['app/qualification/dynamic-plasma-original-funding-submission-v1.behavior.draft.mjs', 'a2b483e2d0ddb4ceb52844084d319ce97ad4d9a820f3b014fb7e5a59aef81e88'],
  ['app/qualification/service-credit-payer-owner-reentrant-recovery-close-v1.behavior.draft.mjs', '1a0ac116b91b41e1b3f26832d62564690ef26ba82a11731f1521b660b095219c'],
  ['app/src/service-credit-zenon-funding-post-v1-payer-recovery-owner.js', '150aaeeaebd5c8f9bdf7b8c84f79e9cccada265469b89c28c4252ee81d6f6de2'],
  ['app/src/service-credit-bounded-operation-drain.js', 'ccaf1742f94a2ae312598c4bb2adc0c6168b1ade0167dbc8990422f5e7037885'],
];
const PROFILE_KIND = 'ZENON_DP_SUBMISSION_SYNTHETIC_NINE_CASE_PINNED_NODE24_V2';
const stringify = JSON.stringify, parse = JSON.parse, hash = createHash;
const E = process.env, profilePath = E.X402_DP_SUBMISSION_NINE_PROFILE_PATH, profileSha = E.X402_DP_SUBMISSION_NINE_PROFILE_SHA256;
if (process.versions.node !== '24.19.0' || process.platform !== 'darwin' || process.arch !== 'arm64'
    || E.X402_DP_SUBMISSION_NINE_CASE_SELECTION !== 'nine-synthetic-cases-only'
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
process.once('exit', () => write('# pinned-dp-submission-nine-case-node-namespace ' + stringify({
  profileKind: PROFILE_KIND, expectedCases: 9, profileVersion: 2, sourceRowsSha256: p.sourceRowsSha256,
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
  const code = 'X402_PINNED_DP_NINE_CASE_SUBMISSION_PROFILE_REJECTED';
  const error = new TypeError(code);
  Object.defineProperty(error, 'code', { value: code, enumerable: true });
  Object.defineProperty(error, 'stack', { value: 'TypeError: ' + code });
  throw Object.freeze(error);
}
