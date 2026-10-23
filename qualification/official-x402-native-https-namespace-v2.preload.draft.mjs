/*
 * SOURCE V2 ONLY: exact three-case native HTTPS qualification namespace.
 * Requires separately reviewed direct TLS/loopback scope and managed admission.
 * Resolve only three fixed bare edges to REAL existing package files. All
 * other resolution delegates to native Node, then must land in the input set.
 * No load hook, source/format replacement, alias, worker, child or install.
 * Source/Node permission checks are NOT an OS/network/hostile-code sandbox.
 */
import { registerHooks, isBuiltin } from 'node:module';
import { constants, openSync, closeSync, readSync, lstatSync, fstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Buffer } from 'node:buffer';

const ENTRY = 'app/qualification/official-x402-native-https-pending-v2.behavior.draft.mjs';
const KIND = 'OFFICIAL_X402_NATIVE_HTTPS_THREE_CASE_PINNED_NODE24_V2';
const FIXED_SOURCES = [
  [
    "app/src/x402-official-selected-settlement-server.js",
    "7e226d378b909bbe30a536b4829313f7cc25d772ac2c0dbfba741c64fc2515b5"
  ],
  [
    "app/src/x402-official-https-request-binding.js",
    "dabf215408887bd0d2ba346085c5ab2df13f724e8759b7a98b71b09c8dc8d692"
  ],
  [
    "app/src/x402-official-selected-payment-client.js",
    "6103703a48ab93b33e1d322d01da367d9552d1e37c9d983326f6e58d1e77693c"
  ],
  [
    "app/src/x402-selected-payment-client-bridge.js",
    "d8252e421240005f51b1627ab97b624496325403508d57b030be423e871a5083"
  ],
  [
    "app/src/x402-selected-settlement-server-bridge.js",
    "38f47d24e1dcdd0f632e786054dc2e9544de2f261f74e949e28fee43ed56f40b"
  ],
  [
    "app/src/x402-verification-bound-settlement-context.js",
    "b3ad2fd33dae7e77a77f069cbc1259bf77e18a2bf383aa30f41bcc19221656f5"
  ],
  [
    "app/src/x402-selected-settlement-context.js",
    "afb6e16603023dd58d6a71cff5790a802dcfa4b98bc9d380b51ccc3d58e10991"
  ],
  [
    "app/src/x402-wire.js",
    "5fba91af5a352f62d1a335c7176a45a604e2af5d92b1c4b0e53825c1f20d4e56"
  ],
  [
    "app/package.json",
    "cb4364b57d7918682d68dd00b10a5c35c26ec6af2118a0d70353df2f3324c65f"
  ],
  [
    "app/src/x402-official-upfront-https-router.js",
    "0980e8a648eda8f0ee57353010f5ffda50bdd38ac95ee49e129201de136b9921"
  ],
  [
    "app/src/service-credit-bounded-https-ingress-owner.js",
    "3ba52fb8f33e332a30297dc93e9e6162e4c1d957b3fda1bdf61090ac57d0971a"
  ],
  [
    "app/src/service-credit-bounded-node-https-server-factory.js",
    "aead901ba154c39ea25e5cdcc363ea91ed6749841f6e8945cd01debc52cae387"
  ],
  [
    "app/qualification/official-x402-native-https-pending-v2.behavior.draft.mjs",
    "9f88c6a62ecffe580d65bb2a105cfed55922e6ccaeddbfd00f085e65851de317"
  ]
];
const stringify = JSON.stringify, parse = JSON.parse, hash = createHash;
const E = process.env;
if (process.versions.node !== '24.19.0' || process.platform !== 'darwin' || process.arch !== 'arm64'
    || E.X402_NATIVE_HTTPS_V2_OPT_IN !== 'reviewed-current-loopback-native-https-three-only'
    || E.NODE_DISABLE_COMPILE_CACHE !== '1' || E.NODE_OPTIONS !== undefined
    || E.NODE_PATH !== undefined || E.NODE_TEST_CONTEXT !== undefined || E.NODE_V8_COVERAGE !== undefined
    || typeof E.X402_NATIVE_HTTPS_V2_PROFILE_PATH !== 'string'
    || E.X402_NATIVE_HTTPS_V2_PROFILE_PATH.length > 4096
    || !/^[0-9a-f]{64}$/.test(E.X402_NATIVE_HTTPS_V2_PROFILE_SHA256 || '')) reject();
const profileBytes = readOwned(E.X402_NATIVE_HTTPS_V2_PROFILE_PATH, 65536);
if (sha(profileBytes) !== E.X402_NATIVE_HTTPS_V2_PROFILE_SHA256) reject();
const p = parse(profileBytes.toString('utf8'));
exact(p, ['profileVersion', 'profileKind', 'runtime', 'entryURL', 'inputs', 'bareBindings',
  'allowedBuiltins', 'sourceRowsSha256', 'sourceTransform', 'ordinaryInstalledNamespace']);
exact(p.runtime, ['node', 'platform', 'arch']);
if (p.profileVersion !== 2 || p.profileKind !== KIND || p.runtime.node !== '24.19.0'
    || p.runtime.platform !== 'darwin' || p.runtime.arch !== 'arm64' || p.sourceTransform !== false
    || p.ordinaryInstalledNamespace !== false || !/^[0-9a-f]{64}$/.test(p.sourceRowsSha256)
    || !Array.isArray(p.inputs) || p.inputs.length !== 36
    || !Array.isArray(p.bareBindings) || p.bareBindings.length !== 3
    || !Array.isArray(p.allowedBuiltins) || p.allowedBuiltins.length > 32) reject();
const inputs = new Map(), logical = new Map(), verified = new Set();
let sourceBytes = 0;
for (const row of p.inputs) {
  exact(row, ['logicalPath', 'url', 'bytes', 'sha256', 'identity']);
  fileURL(row.url);
  if (typeof row.logicalPath !== 'string' || !/^(?:app|packages)\//.test(row.logicalPath)
      || row.logicalPath.includes('..') || row.logicalPath.length > 512
      || !Number.isSafeInteger(row.bytes) || row.bytes < 1 || row.bytes > 262144
      || !/^[0-9a-f]{64}$/.test(row.sha256) || !Array.isArray(row.identity) || row.identity.length !== 9
      || !row.identity.every(value => typeof value === 'string' && /^[0-9]+$/.test(value))
      || inputs.has(row.url) || logical.has(row.logicalPath)) reject();
  sourceBytes += row.bytes;
  if (sourceBytes > 1048576) reject();
  Object.freeze(row.identity); Object.freeze(row);
  inputs.set(row.url, row); logical.set(row.logicalPath, row);
}
for (const [name, digest] of FIXED_SOURCES) {
  if (logical.get(name)?.sha256 !== digest) reject();
}
const entry = logical.get(ENTRY);
if (!entry || p.entryURL !== entry.url || !inputs.has(import.meta.url)
    || process.argv.length !== 2 || pathToFileURL(process.argv[1]).href !== entry.url
    || typeof E.SPV_TASK_SCRATCH !== 'string') reject();
const scratch = lstatSync(E.SPV_TASK_SCRATCH, { bigint: true });
if (!scratch.isDirectory() || scratch.isSymbolicLink() || scratch.uid !== BigInt(process.getuid())
    || (scratch.mode & 0o077n) !== 0n) reject();

const expectedEdges = new Map([
  ['app/src/x402-official-selected-payment-client.js\0@x402/core/client',
    'packages/@x402/core/dist/esm/client/index.mjs'],
  ['app/src/x402-official-selected-settlement-server.js\0@x402/core/server',
    'packages/@x402/core/dist/esm/server/index.mjs'],
  ['packages/@x402/core/dist/esm/chunk-N4QXZG2Z.mjs\0zod', 'packages/zod/index.js'],
]);
const bindings = new Map();
for (const b of p.bareBindings) {
  exact(b, ['parentURL', 'specifier', 'targetURL']);
  const parent = inputs.get(b.parentURL), target = inputs.get(b.targetURL);
  const edge = parent?.logicalPath + '\0' + b.specifier;
  if (!parent || !target || expectedEdges.get(edge) !== target.logicalPath) reject();
  const key = b.parentURL + '\0' + b.specifier;
  if (bindings.has(key)) reject();
  bindings.set(key, b.targetURL);
}
if (bindings.size !== 3) reject();
const builtins = new Set();
for (const value of p.allowedBuiltins) {
  if (typeof value !== 'string' || !value.startsWith('node:') || !isBuiltin(value)) reject();
  builtins.add(value);
}
// All bytes and identities are checked before the entry can read TLS or import SDK.
for (const row of inputs.values()) verify(row);
for (const [name, version] of [
  ['packages/@x402/core/package.json', '2.23.0'],
  ['packages/zod/package.json', '3.25.76'],
]) {
  const row = logical.get(name);
  if (!row || parse(readOwned(fileURLToPath(row.url), 262144, row.identity).toString('utf8')).version !== version) reject();
}
let resolveCalls = 0, overrideHits = 0;
const resolved = new Set(), write = process.stdout.write.bind(process.stdout);
process.once('exit', () => write('# pinned-native-https-v2-namespace ' + stringify({
  profileKind: KIND, expectedCases: 3, profileVersion: 2, sourceRowsSha256: p.sourceRowsSha256,
  inputsVerifiedBeforeFixture: verified.size, declaredSourceBytes: sourceBytes,
  resolveCalls, bareImportOverrideHits: overrideHits, declaredFilesResolved: resolved.size,
  sourceTransforms: 0, ordinaryInstalledNamespaceQualified: false,
  noNetworkOrOsSandboxClaim: true,
}) + '\n'));
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (++resolveCalls > 1024) reject();
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
    return result;
  },
});

function verify(row) {
  const path = fileURLToPath(row.url), state = lstatSync(path, { bigint: true });
  if (identity(state).some((value, index) => value !== row.identity[index])) reject();
  if (!verified.has(row.url)) {
    const raw = readOwned(path, 262144, row.identity);
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
  const code = 'X402_PINNED_NATIVE_HTTPS_V2_PROFILE_REJECTED';
  const error = new TypeError(code);
  Object.defineProperty(error, 'code', { value: code, enumerable: true });
  Object.defineProperty(error, 'stack', { value: 'TypeError: ' + code });
  throw Object.freeze(error);
}
