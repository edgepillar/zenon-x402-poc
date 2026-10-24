/* SOURCE DRAFT. Exact full P1 baseline plus the actual P4 lane sources.
 * Builtin-only admission precedes worker SDK/SQL/key/socket effects. No source
 * transform, builtin alias, copied application graph or ordinary package fallback.
 * A complete managed parent/profile builder and a new finite native approval are
 * still required. This cooperative check is neither authority nor an OS sandbox.
 */
import { registerHooks, isBuiltin } from 'node:module';
import { constants as C, lstatSync, fstatSync, openSync, closeSync, readSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Buffer } from 'node:buffer';

const KIND = 'NATIVE_CAPACITY_PAYER_LANE_NODE24_V1';
const ENTRY = 'app/qualification/capacity-native-payer-lane.worker.draft.mjs';
const SELF = 'app/qualification/capacity-native-payer-lane.namespace.preload.draft.mjs';
const BASE = 'app/qualification/issued-funding-post-native-vertical.inputs-v3.json';
const BASE_SHA = '51ffb5b0ff0052523c1b7f3d75fa24e9be27e60ca3bcc09236b1f439096aaed1';
const ADDITIONS = [BASE, SELF, ENTRY, 'app/qualification/capacity-native-payer-lane.owner.draft.mjs',
  'app/qualification/capacity-native-payer-lane.protocol.js'];
const NS = 'getPinnedNativeCapacityPayerLaneNamespaceSnapshot', E = process.env;
if (process.version !== 'v24.19.0' || process.platform !== 'darwin' || process.arch !== 'arm64'
    || process.argv.length !== 3 || process.argv[2] !== E.SPV_TASK_SCRATCH
    || E.X402_NATIVE_CAPACITY_LANE_SELECTION !== 'native-capacity-lane-source-draft-v1'
    || E.X402_NATIVE_CAPACITY_RUN_SCOPE !== 'one-reviewed-native-capacity-lane-v1'
    || !/^[0-9a-f]{64}$/.test(E.X402_NATIVE_CAPACITY_RUN_ID || '')
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(E.X402_NATIVE_CAPACITY_LANE_ID || '')
    || !/^[0-9a-f]{64}$/.test(E.X402_NATIVE_CAPACITY_PROFILE_SHA256 || '')
    || typeof E.X402_NATIVE_CAPACITY_PROFILE_PATH !== 'string' || E.X402_NATIVE_CAPACITY_PROFILE_PATH.length > 4096
    || E.NODE_DISABLE_COMPILE_CACHE !== '1' || E.WS_NO_BUFFER_UTIL !== '1' || E.WS_NO_UTF_8_VALIDATE !== '1'
    || E.NODE_OPTIONS !== undefined || E.NODE_PATH !== undefined || E.NODE_TEST_CONTEXT !== undefined || E.NODE_V8_COVERAGE !== undefined
    || Object.getOwnPropertyDescriptor(globalThis, NS) !== undefined) reject();
const flags = ['--no-addons','--disallow-code-generation-from-strings','--disable-proto=throw',
  '--unhandled-rejections=strict','--import=' + fileURLToPath(import.meta.url)];
if (JSON.stringify(process.execArgv) !== JSON.stringify(flags)) reject();
const raw = readOwned(E.X402_NATIVE_CAPACITY_PROFILE_PATH, 524288, null, true);
if (sha(raw) !== E.X402_NATIVE_CAPACITY_PROFILE_SHA256) reject();
for (const byte of raw) if (byte < 32 && ![9,10,13].includes(byte) || byte > 126) reject();
const profile = JSON.parse(raw.toString('ascii'));
exact(profile, ['profileVersion','profileKind','runtime','entryURL','inputs','bareBindings','allowedBuiltins',
  'sourceRowsSha256','sourceTransform','ordinaryInstalledNamespace','baselineManifestSha256','runId','laneId','rootPath','rootIdentity']);
exact(profile.runtime, ['node','platform','arch']);
if (profile.profileVersion !== 1 || profile.profileKind !== KIND || profile.sourceTransform !== false
    || profile.ordinaryInstalledNamespace !== false || profile.baselineManifestSha256 !== BASE_SHA
    || profile.runtime.node !== '24.19.0' || profile.runtime.platform !== 'darwin' || profile.runtime.arch !== 'arm64'
    || profile.runId !== E.X402_NATIVE_CAPACITY_RUN_ID || profile.laneId !== E.X402_NATIVE_CAPACITY_LANE_ID
    || profile.rootPath !== E.SPV_TASK_SCRATCH || !Array.isArray(profile.rootIdentity) || profile.rootIdentity.length !== 6
    || !/^[0-9a-f]{64}$/.test(profile.sourceRowsSha256 || '')
    || !Array.isArray(profile.inputs) || profile.inputs.length !== 526
    || !Array.isArray(profile.bareBindings) || !Array.isArray(profile.allowedBuiltins)) reject();
rootCheck();
const logical = new Map(), urls = new Map(), verified = new Set();
let totalBytes = 0, applications = 0, packages = 0;
for (const row of profile.inputs) {
  exact(row, ['logicalPath','url','bytes','LF','sha256','gitBlob','identity']); canonicalFileURL(row.url);
  if (typeof row.logicalPath !== 'string' || row.logicalPath.length > 512
      || !/^(?:app|packages)\/[A-Za-z0-9@._/-]+$/.test(row.logicalPath)
      || row.logicalPath.split('/').some(p => p === '' || p === '.' || p === '..')
      || !Number.isSafeInteger(row.bytes) || row.bytes < 0 || row.bytes > 1048576
      || !Number.isSafeInteger(row.LF) || row.LF < 0 || row.LF > row.bytes
      || !/^[0-9a-f]{64}$/.test(row.sha256) || !/^[0-9a-f]{40}$/.test(row.gitBlob)
      || !Array.isArray(row.identity) || row.identity.length !== 9
      || !row.identity.every(v => typeof v === 'string' && /^[0-9]+$/.test(v))
      || logical.has(row.logicalPath) || urls.has(row.url)) reject();
  totalBytes += row.bytes; if (totalBytes > 6291456) reject();
  if (row.logicalPath.startsWith('app/')) applications++; else packages++;
  Object.freeze(row.identity); Object.freeze(row); logical.set(row.logicalPath,row); urls.set(row.url,row);
}
if (applications !== 122 || packages !== 404 || logical.get(SELF)?.url !== import.meta.url
    || logical.get(ENTRY)?.url !== profile.entryURL || pathToFileURL(process.argv[1]).href !== profile.entryURL
    || logical.get(BASE)?.sha256 !== BASE_SHA) reject();
const publicRows = [...logical.values()].map(r => ({ path:r.logicalPath,bytes:r.bytes,LF:r.LF,sha256:r.sha256,gitBlob:r.gitBlob }))
  .sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
if (sha(Buffer.from(canonical(publicRows),'ascii')) !== profile.sourceRowsSha256) reject();
for (const row of logical.values()) verify(row);
const base = JSON.parse(readOwned(fileURLToPath(logical.get(BASE).url),262144,logical.get(BASE).identity).toString('ascii'));
if (base.applicationInputs.length !== 117 || base.packageInputs.length !== 404) reject();
const exactPaths = new Set(ADDITIONS);
for (const row of [...base.applicationInputs,...base.packageInputs]) {
  const selected = logical.get(row.path);
  if (!selected || selected.bytes !== row.bytes || selected.LF !== row.LF
      || selected.sha256 !== row.sha256 || selected.gitBlob !== row.gitBlob || exactPaths.has(row.path)) reject();
  exactPaths.add(row.path);
}
if (exactPaths.size !== logical.size || [...logical.keys()].some(p => !exactPaths.has(p))) reject();
if (JSON.stringify(profile.allowedBuiltins) !== JSON.stringify(base.allowedBuiltins)) reject();
const edges = [...base.bareBindings,
  { parent:ENTRY,specifier:'@noble/ed25519',target:'packages/@noble/ed25519/index.js' },
  { parent:ENTRY,specifier:'@noble/hashes/sha2',target:'packages/@noble/hashes/esm/sha2.js' },
  { parent:ENTRY,specifier:'znn-typescript-sdk',target:'packages/znn-typescript-sdk/dist/index.js' }];
const expectedEdges = new Map(edges.map(e => [e.parent + '\0' + e.specifier,e.target])), bindings = new Map();
if (profile.bareBindings.length !== expectedEdges.size) reject();
for (const row of profile.bareBindings) {
  exact(row, ['parentURL','specifier','targetURL']);
  const parent = urls.get(row.parentURL), target = urls.get(row.targetURL), key = row.parentURL + '\0' + row.specifier;
  if (!parent || !target || expectedEdges.get(parent.logicalPath + '\0' + row.specifier) !== target.logicalPath || bindings.has(key)) reject();
  bindings.set(key,row.targetURL);
}
for (const [name,version] of Object.entries(base.packageVersions)) {
  const row = logical.get(name); if (!row || JSON.parse(readOwned(fileURLToPath(row.url),1048576,row.identity).toString('ascii')).version !== version) reject();
}
const builtins = new Set();
for (const name of profile.allowedBuiltins) {
  if (typeof name !== 'string' || !name.startsWith('node:') || !isBuiltin(name) || builtins.has(name)) reject(); builtins.add(name);
}
let resolves = 0;
registerHooks({ resolve(specifier, context, nextResolve) {
  if (++resolves > 8192) reject();
  const selected = bindings.get(context.parentURL + '\0' + specifier);
  const result = nextResolve(selected === undefined ? specifier : selected,context);
  if (typeof result.url !== 'string') reject();
  if (result.url.startsWith('node:')) { if (!builtins.has(result.url)) reject(); }
  else { const row = urls.get(result.url); if (!row) reject(); verify(row); }
  return result;
} });
const snapshot = Object.freeze(function getPinnedNativeCapacityPayerLaneNamespaceSnapshot() {
  if (arguments.length !== 0) reject(); rootCheck();
  return Object.freeze({ profileKind:KIND,sourceRowsSha256:profile.sourceRowsSha256,
    baselineApplication117Preserved:true,baselinePackages404Preserved:true,applicationFiles:applications,packageFiles:packages,
    sourceTransforms:0,nativeBuiltinAliases:0,ordinaryInstalledNamespaceQualified:false });
});
Object.defineProperty(globalThis,NS,{ value:snapshot,enumerable:false,writable:false,configurable:false });
// No profile, URL, private root, raw diagnostics or original material is printed.

function rootCheck() {
  const path = profile.rootPath;
  if (typeof path !== 'string' || path.length > 4096 || !path.startsWith('/') || resolve(path) !== path) reject();
  noLinks(path); const s = lstatSync(path,{ bigint:true });
  const id = [s.dev,s.ino,s.uid,s.gid,s.mode,s.nlink].map(String);
  if (!s.isDirectory() || s.uid !== BigInt(process.getuid()) || (s.mode & 0o7777n) !== 0o700n
      || id.some((v,i) => v !== profile.rootIdentity[i])) reject();
}
function noLinks(path) { for (let at = path;; at = dirname(at)) { if (lstatSync(at).isSymbolicLink()) reject(); if (dirname(at) === at) break; } }
function identity(s) { return [s.dev,s.ino,s.uid,s.gid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].map(String); }
function readOwned(path, maximum, expected, privateFile = false) {
  if (typeof path !== 'string' || !path.startsWith('/') || resolve(path) !== path) reject(); noLinks(path);
  const s = lstatSync(path,{ bigint:true }), id = identity(s);
  if (!s.isFile() || s.nlink !== 1n || s.uid !== BigInt(process.getuid()) || s.size < 0n || s.size > BigInt(maximum)
      || privateFile && (s.mode & 0o7777n) !== 0o600n || expected && id.some((v,i) => v !== expected[i])) reject();
  const fd = openSync(path,C.O_RDONLY | C.O_NOFOLLOW);
  try {
    if (identity(fstatSync(fd,{ bigint:true })).some((v,i) => v !== id[i])) reject();
    const bytes = Buffer.alloc(Number(s.size) + 1); let used = 0;
    while (used < bytes.length) { const n = readSync(fd,bytes,used,bytes.length-used,null); if (n === 0) break; used += n; }
    if (used !== Number(s.size) || identity(fstatSync(fd,{ bigint:true })).some((v,i) => v !== id[i])
        || identity(lstatSync(path,{ bigint:true })).some((v,i) => v !== id[i])) reject(); return bytes.subarray(0,used);
  } finally { closeSync(fd); }
}
function verify(row) {
  if (identity(lstatSync(fileURLToPath(row.url),{ bigint:true })).some((v,i) => v !== row.identity[i])) reject();
  if (verified.has(row.url)) return;
  const bytes = readOwned(fileURLToPath(row.url),1048576,row.identity); let LF = 0; for (const b of bytes) if (b === 10) LF++;
  if (bytes.length !== row.bytes || LF !== row.LF || sha(bytes) !== row.sha256
      || createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex') !== row.gitBlob) reject(); verified.add(row.url);
}
function canonicalFileURL(value) {
  if (typeof value !== 'string') reject(); const u = new URL(value);
  if (u.protocol !== 'file:' || u.host !== '' || u.search || u.hash || pathToFileURL(fileURLToPath(u)).href !== value) reject();
}
function exact(value,names) {
  if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== names.length) reject();
  for (const name of names) { const d = Object.getOwnPropertyDescriptor(value,name); if (!d || !Object.hasOwn(d,'value') || !d.enumerable) reject(); }
}
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k)+':'+canonical(value[k])).join(',') + '}';
}
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function reject() { const e = new TypeError('NATIVE_CAPACITY_FULL_NAMESPACE_REJECTED');
  Object.defineProperty(e,'stack',{ value:'TypeError: NATIVE_CAPACITY_FULL_NAMESPACE_REJECTED' }); throw Object.freeze(e); }
