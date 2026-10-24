/*
 * SOURCE DRAFT. Closed FULL actual issued application + recovery namespace.
 * Builtin-only admission precedes effectful child imports. ALL frozen 130
 * application and 404 package rows are mandatory. Four explicit new rows add
 * operation diagnostics without replacing, renaming or transforming old code.
 * A complete managed launcher, exact source review and separate native approval
 * are still required. Flags/profile hashes are not authority or an OS sandbox.
 */
import { registerHooks, isBuiltin } from 'node:module';
import { constants,openSync,closeSync,readSync,lstatSync,fstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { dirname } from 'node:path';
import { Buffer } from 'node:buffer';

const KIND='OFFICIAL_ISSUED_FULL_GRAPH_CRASH_PAIR_NODE24_V2';
const ENTRY='app/qualification/recovery-crash-committed-intent-v2.child.draft.mjs';
const PRELOAD='app/qualification/recovery-crash-full-namespace-v2.preload.draft.mjs';
const FULL='app/qualification/recovery-crash-full-graph.source-inputs.json';
const FULL_SHA='68cc83addfc65c0679d6289ae67b33602c29b470c8689e3169c069efdf3e7aaf';
const OLD_SEAL='5aff94f7427ba46bbf3cc8e8ddc4f896672909773e44ff0335a26dc52502e979';
const BASE='app/qualification/issued-funding-post-native-vertical.inputs-v3.json';
const BASE_SHA='51ffb5b0ff0052523c1b7f3d75fa24e9be27e60ca3bcc09236b1f439096aaed1';
const MAX_SOURCE=6291456,MAX_PROFILE=524288,PACKAGE_FILES=404;
const E=process.env,mode=process.argv[3];
if(process.version!=='v24.19.0'||process.platform!=='darwin'||process.arch!=='arm64'
    ||process.argv.length!==4||!['seed','recover'].includes(mode)||process.argv[2]!==E.SPV_TASK_SCRATCH
    ||E.X402_RECOVERY_CRASH_CHILD_SELECTION!=='one-owned-committed-intent-source-draft'
    ||E.X402_RECOVERY_CRASH_DIAGNOSTIC_SELECTION!=='full-committed-child-v2-source-draft'
    ||E.X402_ISSUED_NATIVE_VERTICAL_SELECTION!=='current-native-issued-post-source-draft-v1'
    ||E.NODE_DISABLE_COMPILE_CACHE!=='1'||E.WS_NO_BUFFER_UTIL!=='1'||E.WS_NO_UTF_8_VALIDATE!=='1'
    ||E.NODE_OPTIONS!==undefined||E.NODE_PATH!==undefined||E.NODE_TEST_CONTEXT!==undefined||E.NODE_V8_COVERAGE!==undefined
    ||typeof E.X402_RECOVERY_CRASH_PROFILE_PATH!=='string'||E.X402_RECOVERY_CRASH_PROFILE_PATH.length>4096
    ||!/^[0-9a-f]{64}$/.test(E.X402_RECOVERY_CRASH_PROFILE_SHA256||''))reject();
const expectedFlags=['--no-addons','--disallow-code-generation-from-strings','--disable-proto=throw',
  '--unhandled-rejections=strict','--import='+fileURLToPath(import.meta.url)];
if(JSON.stringify(process.execArgv)!==JSON.stringify(expectedFlags))reject();
const raw=readOwned(E.X402_RECOVERY_CRASH_PROFILE_PATH,MAX_PROFILE);
if(sha(raw)!==E.X402_RECOVERY_CRASH_PROFILE_SHA256)reject();
const profile=JSON.parse(raw.toString('ascii'));
exact(profile,['profileVersion','profileKind','runtime','entryURL','inputs','bareBindings','allowedBuiltins',
  'sourceRowsSha256','sourceTransform','ordinaryInstalledNamespace','baselineManifestSha256','baselineCrashInventorySha256']);
exact(profile.runtime,['node','platform','arch']);
if(profile.profileVersion!==2||profile.profileKind!==KIND
    ||profile.runtime.node!=='24.19.0'||profile.runtime.platform!=='darwin'||profile.runtime.arch!=='arm64'
    ||profile.sourceTransform!==false||profile.ordinaryInstalledNamespace!==false
    ||profile.baselineManifestSha256!==BASE_SHA||profile.baselineCrashInventorySha256!==FULL_SHA
    ||!/^[0-9a-f]{64}$/.test(profile.sourceRowsSha256)
    ||!Array.isArray(profile.inputs)||profile.inputs.length!==538
    ||!Array.isArray(profile.bareBindings)||!Array.isArray(profile.allowedBuiltins))reject();
const logical=new Map(),inputs=new Map(),verified=new Set();
let declaredBytes=0,applicationFiles=0,packageFiles=0;
for(const row of profile.inputs){
  exact(row,['logicalPath','url','bytes','LF','sha256','gitBlob','identity']);canonicalFileURL(row.url);
  if(typeof row.logicalPath!=='string'||row.logicalPath.length>512
      ||!/^(?:app|packages)\/[A-Za-z0-9@._/-]+$/.test(row.logicalPath)
      ||row.logicalPath.split('/').some(p=>p===''||p==='.'||p==='..')
      ||!Number.isSafeInteger(row.bytes)||row.bytes<0||row.bytes>1048576
      ||!Number.isSafeInteger(row.LF)||row.LF<0||row.LF>row.bytes
      ||!/^[0-9a-f]{64}$/.test(row.sha256)||!/^[0-9a-f]{40}$/.test(row.gitBlob)
      ||!Array.isArray(row.identity)||row.identity.length!==9
      ||!row.identity.every(v=>typeof v==='string'&&/^[0-9]+$/.test(v))
      ||logical.has(row.logicalPath)||inputs.has(row.url))reject();
  declaredBytes+=row.bytes;if(declaredBytes>MAX_SOURCE)reject();
  if(row.logicalPath.startsWith('app/'))applicationFiles++;else packageFiles++;
  Object.freeze(row.identity);Object.freeze(row);logical.set(row.logicalPath,row);inputs.set(row.url,row);
}
if(applicationFiles!==134||packageFiles!==PACKAGE_FILES
    ||logical.get(PRELOAD)?.url!==import.meta.url||logical.get(ENTRY)?.url!==profile.entryURL
    ||pathToFileURL(process.argv[1]).href!==profile.entryURL||logical.get(BASE)?.sha256!==BASE_SHA
    ||logical.get(FULL)?.sha256!==FULL_SHA)reject();
const publicRows=[...logical.values()].map(r=>({path:r.logicalPath,bytes:r.bytes,LF:r.LF,sha256:r.sha256,gitBlob:r.gitBlob}))
  .sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
if(sha(Buffer.from(canonical(publicRows),'ascii'))!==profile.sourceRowsSha256)reject();
for(const row of logical.values())verify(row);
const frozen=JSON.parse(readOwned(fileURLToPath(logical.get(FULL).url),262144,logical.get(FULL).identity).toString('ascii'));
if(!Array.isArray(frozen.applicationInputs)||frozen.applicationInputs.length!==130
    ||!Array.isArray(frozen.packageInputs)||frozen.packageInputs.length!==404
    ||frozen.sourceRowsSha256!==OLD_SEAL||frozen.profileKind!=='OFFICIAL_ISSUED_FULL_GRAPH_CRASH_PAIR_NODE24_V1')reject();
const frozenRows=[...frozen.applicationInputs,...frozen.packageInputs].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
if(sha(Buffer.from(canonical(frozenRows),'ascii'))!==OLD_SEAL)reject();
for(const row of frozenRows){
  const current=logical.get(row.path);
  if(!current||current.bytes!==row.bytes||current.LF!==row.LF||current.sha256!==row.sha256||current.gitBlob!==row.gitBlob)reject();
}
const base=JSON.parse(readOwned(fileURLToPath(logical.get(BASE).url),262144,logical.get(BASE).identity).toString('ascii'));
if(base.applicationInputs.length!==117||base.packageInputs.length!==404)reject();
for(const row of [...base.applicationInputs,...base.packageInputs]){
  const current=logical.get(row.path);
  if(!current||current.bytes!==row.bytes||current.LF!==row.LF||current.sha256!==row.sha256||current.gitBlob!==row.gitBlob)reject();
}
if(JSON.stringify(profile.allowedBuiltins)!==JSON.stringify(base.allowedBuiltins)
    ||JSON.stringify(frozen.allowedBuiltins)!==JSON.stringify(base.allowedBuiltins)
    ||JSON.stringify(frozen.packageVersions)!==JSON.stringify(base.packageVersions))reject();
const edges=[...frozen.bareBindings,
  {parent:ENTRY,specifier:'@noble/ed25519',target:'packages/@noble/ed25519/index.js'},
  {parent:ENTRY,specifier:'@noble/hashes/sha2',target:'packages/@noble/hashes/esm/sha2.js'}];
const expectedEdges=new Map(edges.map(e=>[e.parent+'\0'+e.specifier,e.target]));
const bindings=new Map();
if(profile.bareBindings.length!==expectedEdges.size)reject();
for(const row of profile.bareBindings){
  exact(row,['parentURL','specifier','targetURL']);
  const parent=inputs.get(row.parentURL),target=inputs.get(row.targetURL);
  if(!parent||!target||expectedEdges.get(parent.logicalPath+'\0'+row.specifier)!==target.logicalPath)reject();
  const key=row.parentURL+'\0'+row.specifier;if(bindings.has(key))reject();bindings.set(key,row.targetURL);
}
for(const[name,version]of Object.entries(base.packageVersions)){
  const row=logical.get(name);
  if(!row||JSON.parse(readOwned(fileURLToPath(row.url),1048576,row.identity).toString('ascii')).version!==version)reject();
}
const builtins=new Set();
for(const name of profile.allowedBuiltins){
  if(typeof name!=='string'||!name.startsWith('node:')||!isBuiltin(name)||builtins.has(name))reject();builtins.add(name);
}
let resolveCalls=0,overrides=0;
const resolved=new Set(),write=process.stdout.write.bind(process.stdout);
registerHooks({resolve(specifier,context,nextResolve){
  if(++resolveCalls>8192)reject();
  const selected=bindings.get(context.parentURL+'\0'+specifier);if(selected!==undefined)overrides++;
  const result=nextResolve(selected===undefined?specifier:selected,context);
  if(typeof result.url!=='string')reject();
  if(result.url.startsWith('node:')){if(!builtins.has(result.url))reject();}
  else{const row=inputs.get(result.url);if(!row)reject();verify(row);resolved.add(row.logicalPath);}
  return result;
}});
export function getPinnedRecoveryCrashNamespaceSnapshotV2(){
  if(arguments.length!==0)reject();
  return Object.freeze({profileKind:KIND,profileVersion:2,mode,sourceRowsSha256:profile.sourceRowsSha256,
    applicationFiles,packageFiles,inputsVerifiedBeforeCase:verified.size,declaredSourceBytes:declaredBytes,
    baselineApplication117Preserved:true,baselinePackages404Preserved:true,baselineCrashApplication130Preserved:true,
    resolveCalls,bareImportOverrideHits:overrides,declaredFilesResolved:resolved.size,
    sourceTransforms:0,nativeBuiltinAliases:0,ordinaryInstalledNamespaceQualified:false,nativeOsNetworkSandbox:false});
}
// SIGKILL cannot run an exit hook. Admission is therefore reported BEFORE the
// application imports, and a second current snapshot accompanies the cutpoint.
write('# pinned-recovery-crash-namespace-v2-admitted '+JSON.stringify(getPinnedRecoveryCrashNamespaceSnapshotV2())+'\n');

function canonical(value){
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
function identity(s){return[s.dev,s.ino,s.uid,s.gid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].map(String);}
function readOwned(file,maximum,expected){
  if(typeof file!=='string'||!file.startsWith('/'))reject();
  for(let at=file;;at=dirname(at)){if(lstatSync(at).isSymbolicLink())reject();if(dirname(at)===at)break;}
  const s=lstatSync(file,{bigint:true}),before=identity(s);
  if(!s.isFile()||s.nlink!==1n||s.uid!==BigInt(process.getuid())||s.size<0n||s.size>BigInt(maximum)
      ||expected&&before.some((v,i)=>v!==expected[i]))reject();
  const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    if(identity(fstatSync(fd,{bigint:true})).some((v,i)=>v!==before[i]))reject();
    const bytes=Buffer.alloc(Number(s.size)+1);let used=0;
    while(used<bytes.length){const n=readSync(fd,bytes,used,bytes.length-used,null);if(!n)break;used+=n;}
    if(used!==Number(s.size)||identity(fstatSync(fd,{bigint:true})).some((v,i)=>v!==before[i])
        ||identity(lstatSync(file,{bigint:true})).some((v,i)=>v!==before[i]))reject();
    return bytes.subarray(0,used);
  }finally{closeSync(fd);}
}
function verify(row){
  if(identity(lstatSync(fileURLToPath(row.url),{bigint:true})).some((v,i)=>v!==row.identity[i]))reject();
  if(verified.has(row.url))return;
  const bytes=readOwned(fileURLToPath(row.url),1048576,row.identity);
  let LF=0;for(const byte of bytes)if(byte===10)LF++;
  if(bytes.length!==row.bytes||LF!==row.LF||sha(bytes)!==row.sha256
      ||createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex')!==row.gitBlob)reject();
  verified.add(row.url);
}
function canonicalFileURL(value){
  if(typeof value!=='string')reject();const u=new URL(value);
  if(u.protocol!=='file:'||u.host!==''||u.search!==''||u.hash!==''||pathToFileURL(fileURLToPath(u)).href!==value)reject();
}
function exact(value,names){
  if(value===null||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype
      ||Reflect.ownKeys(value).length!==names.length)reject();
  for(const name of names){
    const d=Object.getOwnPropertyDescriptor(value,name);
    if(!d||!Object.hasOwn(d,'value')||!d.enumerable)reject();
  }
}
function sha(bytes){return createHash('sha256').update(bytes).digest('hex');}
function reject(){
  const code='RECOVERY_CRASH_FULL_NAMESPACE_REJECTED',e=new TypeError(code);
  Object.defineProperty(e,'code',{value:code,enumerable:true});
  Object.defineProperty(e,'stack',{value:'TypeError: '+code});throw Object.freeze(e);
}
