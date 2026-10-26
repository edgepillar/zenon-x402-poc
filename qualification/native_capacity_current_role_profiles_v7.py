"""Complete V7 RPC-rebound payer/service profiles. Source and DATA only; no native launcher."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import sys
from urllib.parse import quote

MANIFEST = 'qualification/capacity-native-current-roles-v7.inputs.json'
MANIFEST_SHA = '6d7cad66afa4b6762a31b7ff9b0b0cb1d26a37215e4663f040fea5638ed5a3fe'
SOURCE_SEAL = '7561f4a96b0bb584b6b6064d7b1cb5399670ef29693d18735156c62fb7b6ec03'
SOURCE_BYTES = 5256886
APP_FILES,PACKAGE_FILES,SOURCE_ROWS=173,404,577
MAX_PROFILE,MAX_SHARED=524288,1048576
PREVIOUS_PRODUCER='qualification/native_capacity_current_role_profiles_v6.py'
PREVIOUS_PRODUCER_SHA='0db4e53f09d12b90a3bbef25c1702f11368b4f067da05f30f022e7119af3c9d3'
PREVIOUS_SELECTION='qualification/capacity-native-current-roles-v6.inputs.json'
RPC_BEFORE={'path': 'app/src/zenon/bounded-json-rpc-read-core.js', 'bytes': 21759, 'LF': 582, 'sha256': '10cc529bfb0676bb03dc4dad56059663f4a578b586c52f6404fc859d27d18f76', 'gitBlob': '3bd98a83413eb13e3bceb097d35fb874b4c030a2'}
RPC_AFTER={'path': 'app/src/zenon/bounded-json-rpc-read-core.js', 'bytes': 22116, 'LF': 586, 'sha256': '1d8873868274045825717ee70b9a402d91cd6235fdaf410d93ddb365fc2d7ca3', 'gitBlob': '82d49d18a92c1074819e8976d94a2cfef3975466'}
HASH=re.compile(r"[0-9a-f]{64}")
LANE=re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}")
FIELDS=("path","bytes","LF","sha256","gitBlob")
CONTEXT = {'bareBindings': [{'parent': 'app/qualification/issued-funding-post-native-vertical.case.draft.mjs', 'specifier': '@noble/ed25519', 'target': 'packages/@noble/ed25519/index.js'}, {'parent': 'app/qualification/issued-funding-post-native-vertical.case.draft.mjs', 'specifier': '@noble/hashes/sha2', 'target': 'packages/@noble/hashes/esm/sha2.js'}, {'parent': 'app/src/zenon-payment.js', 'specifier': 'znn-typescript-sdk', 'target': 'packages/znn-typescript-sdk/dist/index.js'}, {'parent': 'app/src/zenon-payment.js', 'specifier': '@noble/ed25519', 'target': 'packages/@noble/ed25519/index.js'}, {'parent': 'app/src/zenon-payment.js', 'specifier': '@noble/hashes/sha2', 'target': 'packages/@noble/hashes/esm/sha2.js'}, {'parent': 'app/src/x402-official-selected-payment-client.js', 'specifier': '@x402/core/client', 'target': 'packages/@x402/core/dist/esm/client/index.mjs'}, {'parent': 'app/src/x402-official-selected-settlement-server.js', 'specifier': '@x402/core/server', 'target': 'packages/@x402/core/dist/esm/server/index.mjs'}, {'parent': 'packages/@x402/core/dist/esm/chunk-N4QXZG2Z.mjs', 'specifier': 'zod', 'target': 'packages/zod/index.js'}, {'parent': 'app/qualification/issued-current-close-v5.case.mjs', 'specifier': '@noble/ed25519', 'target': 'packages/@noble/ed25519/index.js'}, {'parent': 'app/qualification/issued-current-close-v5.case.mjs', 'specifier': '@noble/hashes/sha2', 'target': 'packages/@noble/hashes/esm/sha2.js'}, {'parent': 'app/qualification/capacity-native-payer-lane-v3.worker.draft.mjs', 'specifier': '@noble/ed25519', 'target': 'packages/@noble/ed25519/index.js'}, {'parent': 'app/qualification/capacity-native-payer-lane-v3.worker.draft.mjs', 'specifier': '@noble/hashes/sha2', 'target': 'packages/@noble/hashes/esm/sha2.js'}, {'parent': 'app/qualification/capacity-native-payer-lane-v3.worker.draft.mjs', 'specifier': 'znn-typescript-sdk', 'target': 'packages/znn-typescript-sdk/dist/index.js'}, {'parent': 'app/qualification/capacity-native-current-payer-v5.worker.draft.mjs', 'specifier': '@noble/ed25519', 'target': 'packages/@noble/ed25519/index.js'}, {'parent': 'app/qualification/capacity-native-current-payer-v5.worker.draft.mjs', 'specifier': '@noble/hashes/sha2', 'target': 'packages/@noble/hashes/esm/sha2.js'}, {'parent': 'app/qualification/capacity-native-current-payer-v5.worker.draft.mjs', 'specifier': 'znn-typescript-sdk', 'target': 'packages/znn-typescript-sdk/dist/index.js'}, {'parent': 'app/qualification/capacity-native-current-payer-v6.worker.draft.mjs', 'specifier': '@noble/ed25519', 'target': 'packages/@noble/ed25519/index.js'}, {'parent': 'app/qualification/capacity-native-current-payer-v6.worker.draft.mjs', 'specifier': '@noble/hashes/sha2', 'target': 'packages/@noble/hashes/esm/sha2.js'}, {'parent': 'app/qualification/capacity-native-current-payer-v6.worker.draft.mjs', 'specifier': 'znn-typescript-sdk', 'target': 'packages/znn-typescript-sdk/dist/index.js'}, {'parent': 'app/qualification/capacity-native-current-payer-v7.worker.draft.mjs', 'specifier': '@noble/ed25519', 'target': 'packages/@noble/ed25519/index.js'}, {'parent': 'app/qualification/capacity-native-current-payer-v7.worker.draft.mjs', 'specifier': '@noble/hashes/sha2', 'target': 'packages/@noble/hashes/esm/sha2.js'}, {'parent': 'app/qualification/capacity-native-current-payer-v7.worker.draft.mjs', 'specifier': 'znn-typescript-sdk', 'target': 'packages/znn-typescript-sdk/dist/index.js'}], 'roleSpecs': {'PAYER': {'kind': 'NATIVE_CAPACITY_CURRENT_PAYER_NODE24_V7', 'entry': 'app/qualification/capacity-native-current-payer-v7.worker.draft.mjs', 'preloader': 'app/qualification/capacity-native-current-payer-v7.namespace.preload.draft.mjs', 'namespace': 'getPinnedNativeCapacityCurrentPayerNamespaceSnapshotV7', 'pathEnv': 'X402_NATIVE_CAPACITY_PROFILE_PATH', 'shaEnv': 'X402_NATIVE_CAPACITY_PROFILE_SHA256'}, 'SERVICE': {'kind': 'NATIVE_CAPACITY_CURRENT_SERVICE_NODE24_V7', 'entry': 'app/qualification/capacity-native-current-service-v7.worker.draft.mjs', 'preloader': 'app/qualification/capacity-native-current-service-v7.namespace.preload.draft.mjs', 'namespace': 'getPinnedNativeCapacityCurrentServiceNamespaceSnapshotV7', 'pathEnv': 'X402_NATIVE_CAPACITY_SERVICE_PROFILE_PATH', 'shaEnv': 'X402_NATIVE_CAPACITY_SERVICE_PROFILE_SHA256'}}, 'currentManifestSha256': '4a7b2f42c89363bf5d60de80fb18ecb2373963a2d5e0079d4f7225ce02c74985', 'baselineManifestSha256': '51ffb5b0ff0052523c1b7f3d75fa24e9be27e60ca3bcc09236b1f439096aaed1', 'authority': 'NONE'}
def require(value,code):
    if not value:raise ValueError(code)
def sha(raw):return hashlib.sha256(raw).hexdigest()
def canonical(value):return json.dumps(value,sort_keys=True,separators=(",",":"),ensure_ascii=True).encode("ascii")
def identity(s):return[str(x)for x in(s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)]
def read_owned(path,maximum=1048576):
    path=Path(path)
    require(path.is_absolute()and os.path.normpath(str(path))==str(path),"ABSOLUTE_CURRENT_V6_SOURCE")
    for parent in(path,*path.parents):require(not stat.S_ISLNK(parent.lstat().st_mode),"NO_CURRENT_V6_LINK")
    before=path.lstat();ident=identity(before)
    require(stat.S_ISREG(before.st_mode)and before.st_uid==os.getuid()and before.st_nlink==1 and 0<=before.st_size<=maximum,"OWNED_CURRENT_V6_SOURCE")
    with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW),"rb")as stream:
        require(identity(os.fstat(stream.fileno()))==ident,"CURRENT_V7_SOURCE_OPEN")
        raw=stream.read(maximum+1)
        require(len(raw)==before.st_size and identity(os.fstat(stream.fileno()))==ident,"CURRENT_V7_SOURCE_READ")
    require(identity(path.lstat())==ident,"CURRENT_V7_SOURCE_STABLE")
    return raw,ident
def load_dependencies(repo):
    require(sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode,"ISOLATED_V7_SOURCE_ONLY")
    path=Path(repo)/PREVIOUS_PRODUCER
    raw,before=read_owned(path,65536)
    require(sha(raw)==PREVIOUS_PRODUCER_SHA,"EXACT_PRESERVED_V6_PRODUCER")
    spec=importlib.util.spec_from_file_location("capacity_v7_previous_roles",path)
    require(spec is not None and spec.loader is not None,"V7_PREVIOUS_SOURCE_SPEC")
    previous=importlib.util.module_from_spec(spec);sys.modules[spec.name]=previous
    exec(spec.loader.source_to_code(raw,str(path)),previous.__dict__)
    require(read_owned(path,65536)==(raw,before),"V7_PREVIOUS_SOURCE_STABLE")
    return (*previous.load_dependencies(repo),previous)
def validate_selection_data(selection):
    require(type(selection)is dict and set(selection)==set(CONTEXT)|{"rows"},"EXACT_V6_SELECTION_FIELDS")
    require(canonical({key:selection[key]for key in CONTEXT})==canonical(CONTEXT),"EXACT_V6_SELECTION_CONTEXT")
    require(type(selection["rows"])is list and len(selection["rows"])==SOURCE_ROWS
        and sha(canonical(selection["rows"]))==SOURCE_SEAL,"EXACT_V6_COMPLETE_SELECTION")
def capture_selection(repo,dependencies,manifest_raw):
    require(type(manifest_raw)is bytes and sha(manifest_raw)==MANIFEST_SHA,"EXACT_V7_ROLE_MANIFEST")
    base=dependencies[0];previous=dependencies[-1]
    m=base.decode_json(manifest_raw,65536)
    require(set(m)=={"version","kind","sourceParent","previousRoleProducer","previousRoleSelection",
        "applicationReplacements","additionalNativeRoleInputs","additionalMetadataInputs","applicationFiles",
        "packageFiles","sourceRows","sourceRowsSha256","declaredSourceBytes","bareBindings","roleSpecs",
        "currentManifestSha256","baselineManifestSha256","authority","nativeExecuted","historicalFilesModified","nativeAuthority"},
        "CLOSED_V7_MANIFEST_FIELDS")
    require(type(m["version"])is int and m["version"]==7 and m["kind"]=="CURRENT_V7_RPC_REBOUND_COMPLETE_ROLES_SOURCE_NOT_NATIVE"
        and m["nativeExecuted"]is False and m["historicalFilesModified"]is False
        and m["nativeAuthority"]=="NOT_GRANTED"and m["authority"]=="NONE","V7_SOURCE_NOT_AUTHORITY")
    prior={}
    for key in("previousRoleProducer","previousRoleSelection"):
        row=m[key];raw,_=read_owned(Path(repo)/row["path"],65536)
        require(base.pin(row["path"],raw)==row,"EXACT_V7_PRESERVED_METADATA");prior[key]=raw
    require(m["previousRoleProducer"]["path"]==PREVIOUS_PRODUCER
        and m["previousRoleSelection"]["path"]==PREVIOUS_SELECTION,"EXACT_V7_PREVIOUS_GENERATION")
    previous_selection=previous.capture_selection(repo,dependencies[:-1],prior["previousRoleSelection"])
    replacements=m["applicationReplacements"]
    require(type(replacements)is list and len(replacements)==1
        and canonical(replacements[0])==canonical(dict(before=RPC_BEFORE,input=RPC_AFTER)),"EXACT_ONE_V7_RPC_REVISION")
    previous_rows=previous_selection["rows"];index={row["path"]:row for row in previous_rows}
    require(len(index)==len(previous_rows)==567 and index.get(RPC_BEFORE["path"])==RPC_BEFORE
        and RPC_AFTER["path"]==RPC_BEFORE["path"],"EXACT_PRIOR_RPC_METADATA_ROW")
    index[RPC_AFTER["path"]]=RPC_AFTER
    require(len(m["additionalNativeRoleInputs"])==9 and m["additionalMetadataInputs"]==[
        base.pin("app/"+PREVIOUS_SELECTION,prior["previousRoleSelection"])],"ALL_NINE_NEW_ROLE_AND_CONTRACT_INPUTS")
    rows=sorted(list(index.values())+m["additionalNativeRoleInputs"]+m["additionalMetadataInputs"],key=lambda r:r["path"])
    require(len(rows)==len({r["path"]for r in rows})==SOURCE_ROWS
        and sum(r["path"].startswith("app/")for r in rows)==APP_FILES
        and sum(r["path"].startswith("packages/")for r in rows)==PACKAGE_FILES
        and sha(canonical(rows))==SOURCE_SEAL==m["sourceRowsSha256"]
        and sum(r["bytes"]for r in rows)==SOURCE_BYTES==m["declaredSourceBytes"],"COMPLETE_V7_173_404_SOURCE_SEAL")
    require([r for r in rows if r["path"].startswith("packages/")]==[r for r in previous_rows if r["path"].startswith("packages/")],
        "ALL_404_PACKAGES_UNCHANGED")
    names={r["path"]for r in rows};edges=m["bareBindings"]
    require(len(edges)==len({(e["parent"],e["specifier"])for e in edges})==22
        and all(e["parent"]in names and e["target"]in names for e in edges),"ALL_22_V7_BARE_EDGES")
    value=dict(rows=rows,**{key:m[key]for key in CONTEXT});validate_selection_data(value);return value
def verify_application_inputs(repo,selection):
    validate_selection_data(selection)
    root=Path(repo);before=identity(root.lstat());captures=[]
    require(root.is_absolute()and root.is_dir()and root.lstat().st_uid==os.getuid(),"OWNED_V7_APPLICATION_ROOT")
    for row in selection["rows"]:
        if not row["path"].startswith("app/"):continue
        content,ident=read_owned(root/row["path"][4:])
        require(dict(path=row["path"],bytes=len(content),LF=content.count(b"\n"),sha256=sha(content),
            gitBlob=hashlib.sha1(b"blob "+str(len(content)).encode()+b"\0"+content).hexdigest())==row,"EXACT_ACTUAL_V6_ROLE_SOURCE")
        captures.append((row["path"],ident))
    require(len(captures)==APP_FILES and identity(root.lstat())==before,"COMPLETE_V6_APPLICATION_ROOT")
    for name,ident in captures:require(identity((root/name[4:]).lstat())==ident,"V7_APPLICATION_IDENTITIES_RECHECKED")
    return dict(applicationFilesRead=APP_FILES,installedPackageFilesRead=0,nativeExecuted=False,authority="NONE")
def validate_registry_data(base,legacy,registry,selection):
    validate_selection_data(selection)
    r=base._plain(registry)
    base._fields(r,("inputs","bareBindings","runtime","sourceRowsSha256","applicationRoot","packageRoot",
        "sourceIdentitiesRead","sourcesCopied","nativeExecuted","authority"),"EXACT_V6_REGISTRY")
    require(type(r["sourceIdentitiesRead"])is bool and r["sourcesCopied"]is False and r["nativeExecuted"]is False
        and r["authority"]=="NONE"and r["sourceRowsSha256"]==SOURCE_SEAL,"V7_REGISTRY_NOT_AUTHORITY")
    require(len(selection["rows"])==SOURCE_ROWS and sha(canonical(selection["rows"]))==SOURCE_SEAL,"NO_MUTATED_V6_SELECTION")
    app,packages=base._absolute(r["applicationRoot"]),base._absolute(r["packageRoot"])
    require(app!=packages and not app.startswith(packages+"/")and not packages.startswith(app+"/"),"SEPARATE_V6_SOURCE_ROOTS")
    inputs,indexed=base._captured_inputs(selection["rows"],r["inputs"],app,packages)
    physical=set()
    for row in inputs:
        ident=row["identity"]
        require(all(type(v)is str and re.fullmatch(r"(?:0|[1-9][0-9]{0,19})",v)and int(v)<2**64 for v in ident)
            and int(ident[1])>0 and int(ident[2])==os.getuid()and int(ident[4])<=0o177777
            and stat.S_ISREG(int(ident[4]))and ident[5]=="1"and ident[6]==str(row["bytes"]),"CANONICAL_V6_SOURCE_IDENTITY")
        require(tuple(ident[:2])not in physical,"NO_V6_SOURCE_ALIAS");physical.add(tuple(ident[:2]))
    expected=[dict(parentURL=indexed[row["parent"]]["url"],specifier=row["specifier"],targetURL=indexed[row["target"]]["url"])for row in selection["bareBindings"]]
    require(r["bareBindings"]==expected,"EXACT_V6_ROLE_BINDINGS")
    runtime=r["runtime"];base._fields(runtime,("node","platform","arch","nodeSha256","nodeIdentity"),"EXACT_V6_RUNTIME")
    require(all(runtime[k]==v for k,v in dict(node="24.19.0",platform="darwin",arch="arm64",nodeSha256=legacy.NODE_SHA).items()),"PINNED_V7_RUNTIME")
    ident=runtime["nodeIdentity"]
    require(type(ident)is list and len(ident)==9 and all(type(v)is str and re.fullmatch(r"(?:0|[1-9][0-9]{0,19})",v)and int(v)<2**64 for v in ident)
        and int(ident[1])>0 and int(ident[2])in(0,os.getuid())and int(ident[4])<=0o177777
        and stat.S_ISREG(int(ident[4]))and int(ident[4])&0o111 and ident[5]=="1"and ident[6]==str(legacy.NODE_BYTES)
        and tuple(ident[:2])not in physical,"PINNED_V7_NODE_IDENTITY")
    return r,inputs,indexed
class _Planner:
    __slots__=("_base","_legacy","_runtime","_inputs","_index","_bindings","_shared","_shared_bytes","_selection","_planned","_roots")
    def __init__(self):raise ValueError("USE_EXPLICIT_V6_ROLE_FACTORY")
    @classmethod
    def _create(cls,base,legacy,registry,selection):
        self=object.__new__(cls);self._selection=base._plain(selection)
        r,inputs,indexed=validate_registry_data(base,legacy,registry,self._selection)
        self._base,self._legacy,self._runtime=base,legacy,r["runtime"]
        self._inputs,self._index,self._bindings=inputs,indexed,r["bareBindings"]
        self._roots=(r["applicationRoot"],r["packageRoot"]);self._planned=0
        self._shared={name:canonical(value)for name,value in(("inputs",inputs),("runtime",self._runtime),("bareBindings",self._bindings))}
        self._shared_bytes=sum(map(len,self._shared.values()));require(self._shared_bytes<=MAX_SHARED,"BOUNDED_V7_SHARED_FIELDS")
        return self
    def info(self):
        return dict(selectionVersion=7,applicationFiles=APP_FILES,packageFilesDeclared=PACKAGE_FILES,sourceRows=SOURCE_ROWS,
            sourceRowsSha256=SOURCE_SEAL,sharedFieldSerializations=3,sharedCanonicalBytes=self._shared_bytes,sharedCanonicalByteLimit=MAX_SHARED,
            profilesPlanned=self._planned,installedPackageFilesRead=0,sourceOrPackageTreeCopies=0,profilesWritten=False,
            privateRootsOpened=False,profileFactsAreCallerDeclared=True,nativeExecuted=False,nativeAuthority="NOT_GRANTED",authority="NONE")
    def plan_child(self,role,context,root):
        require(type(role)is str and role in self._selection["roleSpecs"],"CLOSED_V6_LEAF_ROLE")
        context=self._base._plain(context);self._base._fields(context,("runId","laneId"),"EXACT_V6_CONTEXT")
        require(type(context["runId"])is str and HASH.fullmatch(context["runId"])and type(context["laneId"])is str and LANE.fullmatch(context["laneId"]),"CANONICAL_V6_CONTEXT")
        root=self._legacy.directory_data(self._base,root);physical=tuple(root["identity"][:2])
        require(physical!=tuple(self._runtime["nodeIdentity"][:2])and all(physical!=tuple(row["identity"][:2])for row in self._inputs),"NO_V6_ROLE_ROOT_SOURCE_ALIAS")
        for source in self._roots:
            require(root["path"]!=source and not root["path"].startswith(source+"/")and not source.startswith(root["path"]+"/"),"INDEPENDENT_V6_ROLE_ROOT")
        spec=self._selection["roleSpecs"][role]
        value=dict(profileVersion=7,profileKind=spec["kind"],role=role,runtime=self._runtime,
            entryURL=self._index[spec["entry"]]["url"],preloaderURL=self._index[spec["preloader"]]["url"],
            inputs=self._inputs,bareBindings=self._bindings,allowedBuiltins=list(self._base.BUILTINS),
            sourceRowsSha256=SOURCE_SEAL,sourceTransform=False,ordinaryInstalledNamespace=False,
            baselineManifestSha256=self._selection["baselineManifestSha256"],currentManifestSha256=self._selection["currentManifestSha256"],
            runId=context["runId"],laneId=context["laneId"],rootPath=root["path"],rootIdentity=root["identity"],childProfiles=[])
        pieces=[b"{"]
        for index,name in enumerate(sorted(value)):
            if index:pieces.append(b",")
            pieces.extend((canonical(name),b":",self._shared[name]if name in self._shared else canonical(value[name])))
        pieces.append(b"}\n");require(sum(map(len,pieces))<=MAX_PROFILE,"BOUNDED_V7_COMPLETE_ROLE_PROFILE")
        raw=b"".join(pieces);self._planned+=1
        return dict(profileBytes=raw,profileSha256=sha(raw),profileBytesCount=len(raw),profileFactsAreCallerDeclared=True,
            nativeExecuted=False,nativeAuthority="NOT_GRANTED",authority="NONE")
def prepare_from_registry_data(repo,dependencies,registry,manifest_raw):
    selection=capture_selection(repo,dependencies,manifest_raw)
    return _Planner._create(dependencies[0],dependencies[2],registry,selection)

