/* Current V5: complete current 123-app base plus capacity controls/404 packages.
 * Bootstrap controls must be source-pinned by the reviewed launcher BEFORE
 * Node entry. This file admits real installed bytes, then registers real Node
 * resolution hooks. It never supplies fake SDK/SQL/FS modules or transforms.
 * Cooperative source/identity checks are not human authority or an OS sandbox.
 */
import { registerHooks, isBuiltin } from 'node:module';
import { constants as C, lstatSync, fstatSync, openSync, closeSync, readSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Buffer } from 'node:buffer';
import { captureNativePrivateDirectoryStatIdentity as DIRECTORY_ID } from '../src/native-private-directory-identity.js';

const SPECS = {
  "PAYER": {
    "kind": "NATIVE_CAPACITY_CURRENT_PAYER_NODE24_V5",
    "entry": "app/qualification/capacity-native-current-payer-v5.worker.draft.mjs",
    "preloader": "app/qualification/capacity-native-current-payer-v5.namespace.preload.draft.mjs",
    "namespace": "getPinnedNativeCapacityCurrentPayerNamespaceSnapshotV5",
    "pathEnv": "X402_NATIVE_CAPACITY_PROFILE_PATH",
    "shaEnv": "X402_NATIVE_CAPACITY_PROFILE_SHA256"
  },
  "SERVICE": {
    "kind": "NATIVE_CAPACITY_CURRENT_SERVICE_NODE24_V5",
    "entry": "app/qualification/capacity-native-current-service-v5.worker.draft.mjs",
    "preloader": "app/qualification/capacity-native-current-service-v5.namespace.preload.draft.mjs",
    "namespace": "getPinnedNativeCapacityCurrentServiceNamespaceSnapshotV5",
    "pathEnv": "X402_NATIVE_CAPACITY_SERVICE_PROFILE_PATH",
    "shaEnv": "X402_NATIVE_CAPACITY_SERVICE_PROFILE_SHA256"
  }
};
const ADDITIONS = [
  "app/qualification/capacity-native-current-namespace-v5.preload-common.draft.mjs",
  "app/qualification/capacity-native-current-payer-v5.namespace.preload.draft.mjs",
  "app/qualification/capacity-native-current-payer-v5.owner.draft.mjs",
  "app/qualification/capacity-native-current-payer-v5.worker.draft.mjs",
  "app/qualification/capacity-native-current-service-v5.namespace.preload.draft.mjs",
  "app/qualification/capacity-native-current-service-v5.owner.draft.mjs",
  "app/qualification/capacity-native-current-service-v5.worker.draft.mjs",
  "app/qualification/capacity-native-full-namespace-v3.preload-common.draft.mjs",
  "app/qualification/capacity-native-paired-lane-v3.supervisor.draft.mjs",
  "app/qualification/capacity-native-payer-lane-v3.namespace.preload.draft.mjs",
  "app/qualification/capacity-native-payer-lane-v3.owner.draft.mjs",
  "app/qualification/capacity-native-payer-lane-v3.worker.draft.mjs",
  "app/qualification/capacity-native-payer-lane.protocol.js",
  "app/qualification/capacity-native-service-lane-v3.namespace.preload.draft.mjs",
  "app/qualification/capacity-native-service-lane-v3.owner.draft.mjs",
  "app/qualification/capacity-native-service-lane-v3.worker.draft.mjs",
  "app/qualification/capacity-native-service-window-v3.owner.draft.mjs",
  "app/qualification/capacity-native-supervisor-v3.namespace.preload.draft.mjs",
  "app/qualification/capacity-native-workload-adapter-v3.draft.mjs",
  "app/qualification/capacity-native-workload-v3.entry.draft.mjs",
  "app/qualification/issued-current-close-v4.inputs.json",
  "app/qualification/issued-current-close-v5.inputs.json",
  "app/qualification/issued-funding-post-native-vertical.inputs-v3.json",
  "app/src/native-private-directory-identity.js",
  "app/src/service-credit-capacity-cohort-writer-trace-data.js",
  "app/src/service-credit-capacity-native-observation-data.js",
  "app/src/service-credit-capacity-parent-timing-trace-data.js",
  "app/src/service-credit-capacity-recorder.js",
  "app/src/service-credit-capacity-window-recorder.js",
  "app/src/service-credit-capacity-window-writer-trace-data.js",
  "app/src/service-credit-capacity-windowed-async-workload-owner-core.js"
];
const COMMON = 'app/qualification/capacity-native-current-namespace-v5.preload-common.draft.mjs';
const PREVIOUS = 'app/qualification/issued-current-close-v4.inputs.json';
const PREVIOUS_SHA = '8339b2a8e04e7e3c573b1c26d8162f1c821df91182738409693d188121a21893';
const CURRENT = 'app/qualification/issued-current-close-v5.inputs.json';
const CURRENT_SHA = '4a7b2f42c89363bf5d60de80fb18ecb2373963a2d5e0079d4f7225ce02c74985';
const BASE = 'app/qualification/issued-funding-post-native-vertical.inputs-v3.json';
const BASE_SHA = '51ffb5b0ff0052523c1b7f3d75fa24e9be27e60ca3bcc09236b1f439096aaed1';
const NODE_SHA = 'dbedff294bab84a0a86c04e15fbcbeb1c97ca10bef1b32b0634cd24b36f62100';
const F = Object.freeze, E = process.env, SHA = /^[0-9a-f]{64}$/;
let claimed = false;

export function installNativeCapacityCurrentNamespaceV5(role, preloaderURL) {
  if (arguments.length !== 2 || claimed || !Object.hasOwn(SPECS, role)) reject();
  const spec = SPECS[role];
  if (process.version !== 'v24.19.0' || process.platform !== 'darwin' || process.arch !== 'arm64'
      || process.argv.length !== 3 || process.argv[2] !== E.SPV_TASK_SCRATCH
      || E.X402_NATIVE_CAPACITY_RUN_SCOPE !== 'one-reviewed-native-capacity-current-roles-v5'
      || !SHA.test(E.X402_NATIVE_CAPACITY_RUN_ID || '')
      || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(E.X402_NATIVE_CAPACITY_LANE_ID || '')
      || E.NODE_DISABLE_COMPILE_CACHE !== '1' || E.WS_NO_BUFFER_UTIL !== '1' || E.WS_NO_UTF_8_VALIDATE !== '1'
      || E.NODE_OPTIONS !== undefined || E.NODE_PATH !== undefined || E.NODE_TEST_CONTEXT !== undefined || E.NODE_V8_COVERAGE !== undefined
      || Object.getOwnPropertyDescriptor(globalThis, spec.namespace) !== undefined) reject();
  if (role === 'PAYER' && (E.X402_NATIVE_CAPACITY_LANE_SELECTION !== 'native-capacity-current-payer-source-draft-v5'
        || typeof process.send !== 'function' || !process.connected)
      || role === 'SERVICE' && (E.X402_NATIVE_CAPACITY_SERVICE_SELECTION !== 'native-capacity-current-service-source-draft-v5'
        || E.X402_ISSUED_NATIVE_VERTICAL_SELECTION !== 'current-native-issued-post-source-draft-v1'
        || typeof process.send !== 'function' || !process.connected)) reject();
  canonicalFileURL(preloaderURL);
  const flags = ['--no-addons', '--disallow-code-generation-from-strings', '--disable-proto=throw',
    '--unhandled-rejections=strict', '--import=' + fileURLToPath(preloaderURL)];
  if (JSON.stringify(process.execArgv) !== JSON.stringify(flags)) reject();
  const profilePath = E[spec.pathEnv], profileSha = E[spec.shaEnv];
  if (typeof profilePath !== 'string' || profilePath.length > 4096 || !SHA.test(profileSha || '')) reject();
  const raw = readOwned(profilePath, 524288, null, true), profileId = identity(lstatSync(profilePath, { bigint: true }));
  if (sha(raw) !== profileSha) reject();
  for (const byte of raw) if (byte > 126 || byte < 32 && ![9, 10, 13].includes(byte)) reject();
  const profile = JSON.parse(raw.toString('ascii'));
  // Canonical bytes reject duplicate keys, non-integer encodings and alternate
  // spellings before interpreting private profile fields.
  if (!raw.equals(Buffer.from(canonical(profile) + '\n', 'ascii'))) reject();
  exact(profile, ['profileVersion', 'profileKind', 'role', 'runtime', 'entryURL', 'preloaderURL', 'inputs', 'bareBindings',
    'allowedBuiltins', 'sourceRowsSha256', 'sourceTransform', 'ordinaryInstalledNamespace', 'baselineManifestSha256', 'currentManifestSha256',
    'runId', 'laneId', 'rootPath', 'rootIdentity', 'childProfiles']);
  exact(profile.runtime, ['node', 'platform', 'arch', 'nodeSha256', 'nodeIdentity']);
  if (profile.profileVersion !== 5 || profile.profileKind !== spec.kind || profile.role !== role
      || profile.runtime.node !== '24.19.0' || profile.runtime.platform !== 'darwin' || profile.runtime.arch !== 'arm64'
      || profile.runtime.nodeSha256 !== NODE_SHA || !numbers(profile.runtime.nodeIdentity, 9)
      || profile.runtime.nodeIdentity[5] !== '1' || profile.runtime.nodeIdentity[6] !== '121304480'
      || profile.baselineManifestSha256 !== BASE_SHA || profile.currentManifestSha256 !== CURRENT_SHA || profile.sourceTransform !== false || profile.ordinaryInstalledNamespace !== false
      || profile.runId !== E.X402_NATIVE_CAPACITY_RUN_ID || profile.laneId !== E.X402_NATIVE_CAPACITY_LANE_ID
      || profile.rootPath !== E.SPV_TASK_SCRATCH || !numbers(profile.rootIdentity, 5)
      || profile.preloaderURL !== preloaderURL || !SHA.test(profile.sourceRowsSha256 || '')
      || !Array.isArray(profile.inputs) || profile.inputs.length !== 558
      || !Array.isArray(profile.bareBindings) || !Array.isArray(profile.allowedBuiltins) || !Array.isArray(profile.childProfiles)) reject();
  rootCheck(profile.rootPath, profile.rootIdentity); nodeCheck();
  const logical = new Map(), urls = new Map(), verified = new Set();
  let applications = 0, packages = 0, declaredBytes = 0;
  for (const row of profile.inputs) {
    exact(row, ['logicalPath', 'url', 'bytes', 'LF', 'sha256', 'gitBlob', 'identity']); canonicalFileURL(row.url);
    if (typeof row.logicalPath !== 'string' || row.logicalPath.length > 512
        || !/^(?:app|packages)\/[A-Za-z0-9@._/-]+$/.test(row.logicalPath)
        || row.logicalPath.split('/').some(p => p === '' || p === '.' || p === '..')
        || !Number.isSafeInteger(row.bytes) || row.bytes < 0 || row.bytes > 1048576
        || !Number.isSafeInteger(row.LF) || row.LF < 0 || row.LF > row.bytes
        || !SHA.test(row.sha256) || !/^[0-9a-f]{40}$/.test(row.gitBlob) || !numbers(row.identity, 9)
        || row.identity[5] !== '1' || row.identity[6] !== String(row.bytes) || logical.has(row.logicalPath) || urls.has(row.url)) reject();
    declaredBytes += row.bytes; if (declaredBytes > 6291456) reject();
    if (row.logicalPath.startsWith('app/')) applications++; else packages++;
    F(row.identity); F(row); logical.set(row.logicalPath, row); urls.set(row.url, row);
  }
  if (applications !== 154 || packages !== 404 || logical.get(spec.preloader)?.url !== preloaderURL
      || logical.get(spec.entry)?.url !== profile.entryURL || pathToFileURL(process.argv[1]).href !== profile.entryURL
      || logical.get(COMMON)?.url !== import.meta.url || logical.get(BASE)?.sha256 !== BASE_SHA || logical.get(CURRENT)?.sha256 !== CURRENT_SHA || logical.get(PREVIOUS)?.sha256 !== PREVIOUS_SHA) reject();
  const publicRows = [...logical.values()].map(r => ({ path:r.logicalPath, bytes:r.bytes, LF:r.LF, sha256:r.sha256, gitBlob:r.gitBlob }))
    .sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  if (sha(Buffer.from(canonical(publicRows), 'ascii')) !== profile.sourceRowsSha256) reject();
  for (const row of logical.values()) verify(row);
  const base = JSON.parse(readOwned(fileURLToPath(logical.get(BASE).url), 262144, logical.get(BASE).identity).toString('ascii'));
  if (base.applicationInputs.length !== 117 || base.packageInputs.length !== 404) reject();
  const delta = JSON.parse(readOwned(fileURLToPath(logical.get(PREVIOUS).url), 65536, logical.get(PREVIOUS).identity).toString('ascii'));
  if (delta.kind !== 'CURRENT_ISSUED_CLOSE_FULL_GRAPH_DELTA_NOT_EXECUTION_V4' || delta.version !== 4
      || delta.applicationReplacements.length !== 8 || delta.applicationAdditions.length !== 6) reject();
  const currentApps = new Map(base.applicationInputs.map(row => [row.path, row])), replaced = new Set();
  for (const replacement of delta.applicationReplacements) {
    const row = replacement.input;
    if (!currentApps.has(row.path) || replaced.has(row.path)
        || currentApps.get(row.path).sha256 !== replacement.beforeSha256) reject();
    replaced.add(row.path); currentApps.set(row.path, row);
  }
  for (const row of delta.applicationAdditions) {
    if (currentApps.has(row.path)) reject(); currentApps.set(row.path, row);
  }
  if (currentApps.size !== 123) reject();
  const forward = JSON.parse(readOwned(fileURLToPath(logical.get(CURRENT).url), 65536, logical.get(CURRENT).identity).toString('ascii'));
  if (forward.kind !== 'CURRENT_ISSUED_CLOSE_V5_SOURCE_CANDIDATE_NOT_NATIVE_AUTHORITY' || forward.version !== 5
      || forward.previousSelection?.sha256 !== PREVIOUS_SHA || forward.nativeAuthority !== 'NOT_GRANTED'
      || forward.applicationReplacements.length !== 3 || forward.resolvedApplicationFiles !== 123
      || forward.packageFiles !== 404 || forward.sourceTransforms !== false || forward.historicalEvidenceRebound !== false) reject();
  for (const replacement of forward.applicationReplacements) {
    const before = replacement.before, row = replacement.input, actual = currentApps.get(before.path);
    if (!actual || canonical(actual) !== canonical(before)) reject();
    currentApps.delete(before.path);
    if (!row.path.startsWith('app/') || currentApps.has(row.path)) reject();
    currentApps.set(row.path, row);
  }
  const forwardRows = [...currentApps.values(), ...base.packageInputs].sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  if (currentApps.size !== 123 || forwardRows.length !== 527
      || sha(Buffer.from(canonical(forwardRows), 'ascii')) !== forward.resolvedSourceRowsSha256
      || forwardRows.reduce((total,row) => total + row.bytes, 0) !== forward.resolvedSourceBytes) reject();
  const allPaths = new Set(ADDITIONS);
  for (const row of [...currentApps.values(), ...base.packageInputs]) {
    const actual = logical.get(row.path);
    if (!actual || allPaths.has(row.path) || actual.bytes !== row.bytes || actual.LF !== row.LF
        || actual.sha256 !== row.sha256 || actual.gitBlob !== row.gitBlob) reject();
    allPaths.add(row.path);
  }
  if (allPaths.size !== logical.size || [...logical.keys()].some(name => !allPaths.has(name))) reject();
  const wantedBuiltins = [...base.allowedBuiltins].sort();
  if (JSON.stringify(profile.allowedBuiltins) !== JSON.stringify(wantedBuiltins)) reject();
  const edges = [...forward.bareBindings,
    {parent:'app/qualification/capacity-native-payer-lane-v3.worker.draft.mjs',specifier:'@noble/ed25519',target:'packages/@noble/ed25519/index.js'},
    {parent:'app/qualification/capacity-native-payer-lane-v3.worker.draft.mjs',specifier:'@noble/hashes/sha2',target:'packages/@noble/hashes/esm/sha2.js'},
    {parent:'app/qualification/capacity-native-payer-lane-v3.worker.draft.mjs',specifier:'znn-typescript-sdk',target:'packages/znn-typescript-sdk/dist/index.js'},
    {parent:SPECS.PAYER.entry,specifier:'@noble/ed25519',target:'packages/@noble/ed25519/index.js'},
    {parent:SPECS.PAYER.entry,specifier:'@noble/hashes/sha2',target:'packages/@noble/hashes/esm/sha2.js'},
    {parent:SPECS.PAYER.entry,specifier:'znn-typescript-sdk',target:'packages/znn-typescript-sdk/dist/index.js'}];
  const expectedEdges = new Map(edges.map(e => [e.parent + '\0' + e.specifier, e.target])), bindings = new Map();
  if (profile.bareBindings.length !== expectedEdges.size || expectedEdges.size !== 16) reject();
  for (const edge of profile.bareBindings) {
    exact(edge, ['parentURL', 'specifier', 'targetURL']);
    const parent = urls.get(edge.parentURL), target = urls.get(edge.targetURL), key = edge.parentURL + '\0' + edge.specifier;
    if (!parent || !target || expectedEdges.get(parent.logicalPath + '\0' + edge.specifier) !== target.logicalPath || bindings.has(key)) reject();
    bindings.set(key, edge.targetURL);
  }
  for (const [name, version] of Object.entries(base.packageVersions)) {
    const row = logical.get(name);
    if (!row || JSON.parse(readOwned(fileURLToPath(row.url), 1048576, row.identity).toString('ascii')).version !== version) reject();
  }
  const builtins = new Set();
  for (const name of profile.allowedBuiltins) {
    if (typeof name !== 'string' || !name.startsWith('node:') || !isBuiltin(name) || builtins.has(name)) reject(); builtins.add(name);
  }
  // Leaves cannot acquire a nested process/profile tree.
  if (profile.childProfiles.length !== 0) reject();
  claimed = true;
  let resolves = 0;
  registerHooks({ resolve(specifier, context, nextResolve) {
    if (++resolves > 8192) reject();
    const selected = bindings.get(context.parentURL + '\0' + specifier);
    const result = nextResolve(selected === undefined ? specifier : selected, context);
    if (typeof result.url !== 'string') reject();
    if (result.url.startsWith('node:')) { if (!builtins.has(result.url)) reject(); }
    else { const row = urls.get(result.url); if (!row) reject(); verify(row); }
    return result;
  } });
  const snapshot = F(function nativeCapacityCurrentNamespaceSnapshotV5() {
    if (arguments.length !== 0) reject(); rootCheck(profile.rootPath, profile.rootIdentity); nodeCheck();
    if (!same(identity(lstatSync(profilePath, {bigint:true})), profileId)) reject();
    return F({ profileKind:spec.kind, sourceRowsSha256:profile.sourceRowsSha256,
      currentBaseApplication123Preserved:true, baselinePackages404Preserved:true, applicationFiles:applications, packageFiles:packages,
      sourceTransforms:0, nativeBuiltinAliases:0, ordinaryInstalledNamespaceQualified:false });
  });
  Object.defineProperty(globalThis, spec.namespace, {value:snapshot,enumerable:false,writable:false,configurable:false});
  // No URL, root, profile, private stream, diagnostics, witness or key is printed.

  function nodeCheck() {
    noLinks(process.execPath); const s = lstatSync(process.execPath, {bigint:true});
    if (!s.isFile() || s.nlink !== 1n || !same(identity(s), profile.runtime.nodeIdentity)) reject();
  }
  function verify(row) {
    if (!same(identity(lstatSync(fileURLToPath(row.url), {bigint:true})), row.identity)) reject();
    if (verified.has(row.url)) return;
    const bytes = readOwned(fileURLToPath(row.url), 1048576, row.identity); let LF = 0;
    for (const b of bytes) if (b === 10) LF++;
    if (bytes.length !== row.bytes || LF !== row.LF || sha(bytes) !== row.sha256
        || createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex') !== row.gitBlob) reject();
    verified.add(row.url);
  }
}
function rootCheck(path, expected) {
  if (typeof path !== 'string' || path.length > 4096 || !path.startsWith('/') || resolve(path) !== path || !numbers(expected, 5)) reject();
  noLinks(path); const s = lstatSync(path, {bigint:true});
  if (!s.isDirectory() || !same(DIRECTORY_ID({dev:s.dev,ino:s.ino,uid:s.uid,gid:s.gid,mode:s.mode}, BigInt(process.getuid())), expected)) reject();
}
function identity(s) { return [s.dev,s.ino,s.uid,s.gid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].map(String); }
function numbers(value, length) { return Array.isArray(value) && value.length === length
  && value.every(v => typeof v === 'string' && /^[0-9]{1,24}$/.test(v)); }
function same(a,b) { return a.length === b.length && a.every((v,i) => v === b[i]); }
function noLinks(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || resolve(path) !== path) reject();
  for (let at=path;;at=dirname(at)) { if (lstatSync(at).isSymbolicLink()) reject(); if (dirname(at)===at) break; }
}
function readOwned(path, maximum, expected, privateFile=false) {
  noLinks(path); const s=lstatSync(path,{bigint:true}), id=identity(s);
  if (!s.isFile() || s.nlink!==1n || s.uid!==BigInt(process.getuid()) || s.size<0n || s.size>BigInt(maximum)
      // Managed scratch is 0600; protected CAS profiles are 0400. No other
      // permission bits are admitted; full immutable identities still match.
      || privateFile && ![0o400n,0o600n].includes(s.mode&0o7777n) || expected && !same(id,expected)) reject();
  const fd=openSync(path,C.O_RDONLY|C.O_NOFOLLOW);
  try {
    if (!same(identity(fstatSync(fd,{bigint:true})),id)) reject();
    const bytes=Buffer.alloc(Number(s.size)+1);let used=0;
    while(used<bytes.length){const n=readSync(fd,bytes,used,bytes.length-used,null);if(n===0)break;used+=n;}
    if(used!==Number(s.size)||!same(identity(fstatSync(fd,{bigint:true})),id)||!same(identity(lstatSync(path,{bigint:true})),id))reject();
    return bytes.subarray(0,used);
  }finally{closeSync(fd);}
}
function exact(value,names) {
  if(value===null||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==names.length)reject();
  for(const name of names){const d=Object.getOwnPropertyDescriptor(value,name);if(!d||!Object.hasOwn(d,'value')||!d.enumerable)reject();}
}
function canonical(value) {
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
function canonicalFileURL(value) {
  if(typeof value!=='string')reject();const u=new URL(value);
  if(u.protocol!=='file:'||u.host!==''||u.search||u.hash||pathToFileURL(fileURLToPath(u)).href!==value)reject();
}
function sha(bytes){return createHash('sha256').update(bytes).digest('hex');}
function reject(){const e=new TypeError('NATIVE_CAPACITY_CURRENT_V5_NAMESPACE_REJECTED');
  Object.defineProperty(e,'stack',{value:'TypeError: NATIVE_CAPACITY_CURRENT_V5_NAMESPACE_REJECTED'});throw F(e);}
