// Resolve-only namespace for ONE reviewed P1 native/V6 attempt.
// Existing fixed package bytes; no install, worker, child, load hook or transform.
import { registerHooks, isBuiltin } from 'node:module';
import { constants, lstatSync, openSync, readSync, fstatSync, closeSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';

const E = process.env, sha = raw => createHash('sha256').update(raw).digest('hex');
const identity = s => [s.dev,s.ino,s.uid,s.gid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].map(String);
function reject() { throw Error('P1_PINNED_NAMESPACE_REFUSED'); }
function read(path, cap, expected) {
  const s = lstatSync(path, { bigint: true }), ids = identity(s);
  if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1n || s.uid !== BigInt(process.getuid())
      || s.size < 1n || s.size > BigInt(cap) || expected && JSON.stringify(ids) !== JSON.stringify(expected)) reject();
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW), bytes = Buffer.alloc(Number(s.size) + 1);
  let used = 0;
  try {
    if (JSON.stringify(identity(fstatSync(fd, { bigint: true }))) !== JSON.stringify(ids)) reject();
    while (used < bytes.length) {
      const n = readSync(fd, bytes, used, bytes.length - used, null); if (n === 0) break; used += n;
    }
    if (used !== Number(s.size) || JSON.stringify(identity(fstatSync(fd, { bigint: true }))) !== JSON.stringify(ids)
        || JSON.stringify(identity(lstatSync(path, { bigint: true }))) !== JSON.stringify(ids)) reject();
    return bytes.subarray(0, used);
  } finally { closeSync(fd); }
}
if (process.versions.node !== '24.19.0' || process.platform !== 'darwin' || process.arch !== 'arm64'
    || E.X402_P1_ONCE_OPT_IN !== 'approved-p1-two-sqlite-loopback-once'
    || E.NODE_DISABLE_COMPILE_CACHE !== '1' || E.NODE_OPTIONS !== undefined || E.NODE_PATH !== undefined
    || E.NODE_TEST_CONTEXT !== undefined || E.NODE_V8_COVERAGE !== undefined
    || typeof E.X402_P1_PROFILE_PATH !== 'string' || !/^[0-9a-f]{64}$/.test(E.X402_P1_PROFILE_SHA256 || '')) reject();
const raw = read(E.X402_P1_PROFILE_PATH, 65536);
if (sha(raw) !== E.X402_P1_PROFILE_SHA256) reject();
const p = JSON.parse(raw.toString('utf8'));
if (p.profileVersion !== 1 || p.profileKind !== 'P1_NATIVE_V6_TWO_SQLITE_ONCE'
    || !Array.isArray(p.inputs) || p.inputs.length < 35 || p.inputs.length > 90
    || !Array.isArray(p.bareBindings) || p.bareBindings.length !== 3
    || !Array.isArray(p.allowedBuiltins) || p.allowedBuiltins.length > 32
    || p.sourceTransform !== false || p.ordinaryInstalledNamespace !== false
    || !/^[0-9a-f]{64}$/.test(p.sourceRowsSha256)) reject();
const inputs = new Map(), logical = new Map();
let total = 0;
for (const row of p.inputs) {
  if (typeof row.logicalPath !== 'string' || !/^(app|packages)\//.test(row.logicalPath)
      || row.logicalPath.includes('..') || !Number.isSafeInteger(row.bytes) || row.bytes < 1
      || row.bytes > 262144 || !/^[0-9a-f]{64}$/.test(row.sha256) || row.identity.length !== 9
      || inputs.has(row.url) || logical.has(row.logicalPath)) reject();
  const u = new URL(row.url);
  if (u.protocol !== 'file:' || u.host !== '' || u.search !== '' || u.hash !== '') reject();
  const bytes = read(fileURLToPath(u), 262144, row.identity);
  if (bytes.length !== row.bytes || sha(bytes) !== row.sha256) reject();
  inputs.set(row.url, row); logical.set(row.logicalPath, row);
  total += bytes.length; if (total > 2 * 1048576) reject();
}
const entry = logical.get('app/qualification/p1-native-v6-two-sqlite-once.behavior.draft.mjs');
if (!entry || p.entryURL !== entry.url || process.argv.length !== 2
    || pathToFileURL(process.argv[1]).href !== entry.url || !inputs.has(import.meta.url)) reject();
for (const [label, version] of [['packages/@x402/core/package.json','2.23.0'],['packages/zod/package.json','3.25.76']]) {
  const row = logical.get(label);
  if (!row || JSON.parse(read(fileURLToPath(row.url), 262144, row.identity).toString('utf8')).version !== version) reject();
}
const expected = new Map([
  ['app/src/x402-official-selected-payment-client.js\0@x402/core/client','packages/@x402/core/dist/esm/client/index.mjs'],
  ['app/src/x402-official-selected-settlement-server.js\0@x402/core/server','packages/@x402/core/dist/esm/server/index.mjs'],
  ['packages/@x402/core/dist/esm/chunk-N4QXZG2Z.mjs\0zod','packages/zod/index.js'],
]), bindings = new Map(), builtins = new Set(p.allowedBuiltins);
for (const b of p.bareBindings) {
  const from = inputs.get(b.parentURL), to = inputs.get(b.targetURL);
  if (!from || !to || expected.get(from.logicalPath + '\0' + b.specifier) !== to.logicalPath) reject();
  const key = b.parentURL + '\0' + b.specifier; if (bindings.has(key)) reject();
  bindings.set(key, b.targetURL);
}
for (const name of builtins) if (!name.startsWith('node:') || !isBuiltin(name)) reject();
let calls = 0, overrides = 0;
const resolved = new Set(), write = process.stdout.write.bind(process.stdout);
process.once('exit', () => write('# p1-native-v6-namespace ' + JSON.stringify({
  profileKind: p.profileKind, inputsVerifiedBeforeFixture: inputs.size, declaredSourceBytes: total,
  sourceRowsSha256: p.sourceRowsSha256, resolveCalls: calls, bareImportOverrideHits: overrides,
  declaredFilesResolved: resolved.size, sourceTransforms: 0, ordinaryInstalledNamespaceQualified: false,
  networkOrOsSandbox: false,
}) + '\n'));
registerHooks({ resolve(specifier, context, nextResolve) {
  if (++calls > 2048) reject();
  const chosen = bindings.get(context.parentURL + '\0' + specifier);
  if (chosen !== undefined) overrides++;
  const result = nextResolve(chosen ?? specifier, context);
  if (result.url.startsWith('node:')) { if (!builtins.has(result.url)) reject(); }
  else {
    const row = inputs.get(result.url); if (!row) reject();
    if (JSON.stringify(identity(lstatSync(fileURLToPath(result.url), { bigint: true }))) !== JSON.stringify(row.identity)) reject();
    resolved.add(row.logicalPath);
  }
  return result;
} });

