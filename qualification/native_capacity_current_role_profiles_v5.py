"""Complete V5 payer/service profiles. Source and DATA only; no native launcher."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import sys
from urllib.parse import quote

MANIFEST="qualification/capacity-native-current-roles-v5.inputs.json"
MANIFEST_SHA="468d202518c01f456c520860468994202a7f4df86d168fa5e0d1a871e6b106f5"
SOURCE_SEAL="be5952dbf0e5fe17dbdd16549f2ac039802abbb92f541deb31c2591f4db653d7"
SOURCE_BYTES=5005199
APP_FILES,PACKAGE_FILES,SOURCE_ROWS=154,404,558
MAX_PROFILE,MAX_SHARED=524288,1048576
HASH=re.compile(r"[0-9a-f]{64}")
LANE=re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}")
FIELDS=("path","bytes","LF","sha256","gitBlob")
CONTEXT=json.loads('{"bareBindings":[{"parent":"app/qualification/issued-funding-post-native-vertical.case.draft.mjs","specifier":"@noble/ed25519","target":"packages/@noble/ed25519/index.js"},{"parent":"app/qualification/issued-funding-post-native-vertical.case.draft.mjs","specifier":"@noble/hashes/sha2","target":"packages/@noble/hashes/esm/sha2.js"},{"parent":"app/src/zenon-payment.js","specifier":"znn-typescript-sdk","target":"packages/znn-typescript-sdk/dist/index.js"},{"parent":"app/src/zenon-payment.js","specifier":"@noble/ed25519","target":"packages/@noble/ed25519/index.js"},{"parent":"app/src/zenon-payment.js","specifier":"@noble/hashes/sha2","target":"packages/@noble/hashes/esm/sha2.js"},{"parent":"app/src/x402-official-selected-payment-client.js","specifier":"@x402/core/client","target":"packages/@x402/core/dist/esm/client/index.mjs"},{"parent":"app/src/x402-official-selected-settlement-server.js","specifier":"@x402/core/server","target":"packages/@x402/core/dist/esm/server/index.mjs"},{"parent":"packages/@x402/core/dist/esm/chunk-N4QXZG2Z.mjs","specifier":"zod","target":"packages/zod/index.js"},{"parent":"app/qualification/issued-current-close-v5.case.mjs","specifier":"@noble/ed25519","target":"packages/@noble/ed25519/index.js"},{"parent":"app/qualification/issued-current-close-v5.case.mjs","specifier":"@noble/hashes/sha2","target":"packages/@noble/hashes/esm/sha2.js"},{"parent":"app/qualification/capacity-native-payer-lane-v3.worker.draft.mjs","specifier":"@noble/ed25519","target":"packages/@noble/ed25519/index.js"},{"parent":"app/qualification/capacity-native-payer-lane-v3.worker.draft.mjs","specifier":"@noble/hashes/sha2","target":"packages/@noble/hashes/esm/sha2.js"},{"parent":"app/qualification/capacity-native-payer-lane-v3.worker.draft.mjs","specifier":"znn-typescript-sdk","target":"packages/znn-typescript-sdk/dist/index.js"},{"parent":"app/qualification/capacity-native-current-payer-v5.worker.draft.mjs","specifier":"@noble/ed25519","target":"packages/@noble/ed25519/index.js"},{"parent":"app/qualification/capacity-native-current-payer-v5.worker.draft.mjs","specifier":"@noble/hashes/sha2","target":"packages/@noble/hashes/esm/sha2.js"},{"parent":"app/qualification/capacity-native-current-payer-v5.worker.draft.mjs","specifier":"znn-typescript-sdk","target":"packages/znn-typescript-sdk/dist/index.js"}],"roleSpecs":{"PAYER":{"kind":"NATIVE_CAPACITY_CURRENT_PAYER_NODE24_V5","entry":"app/qualification/capacity-native-current-payer-v5.worker.draft.mjs","preloader":"app/qualification/capacity-native-current-payer-v5.namespace.preload.draft.mjs","namespace":"getPinnedNativeCapacityCurrentPayerNamespaceSnapshotV5","pathEnv":"X402_NATIVE_CAPACITY_PROFILE_PATH","shaEnv":"X402_NATIVE_CAPACITY_PROFILE_SHA256"},"SERVICE":{"kind":"NATIVE_CAPACITY_CURRENT_SERVICE_NODE24_V5","entry":"app/qualification/capacity-native-current-service-v5.worker.draft.mjs","preloader":"app/qualification/capacity-native-current-service-v5.namespace.preload.draft.mjs","namespace":"getPinnedNativeCapacityCurrentServiceNamespaceSnapshotV5","pathEnv":"X402_NATIVE_CAPACITY_SERVICE_PROFILE_PATH","shaEnv":"X402_NATIVE_CAPACITY_SERVICE_PROFILE_SHA256"}},"currentManifestSha256":"4a7b2f42c89363bf5d60de80fb18ecb2373963a2d5e0079d4f7225ce02c74985","baselineManifestSha256":"51ffb5b0ff0052523c1b7f3d75fa24e9be27e60ca3bcc09236b1f439096aaed1","authority":"NONE"}')
def require(value,code):
    if not value:raise ValueError(code)
def sha(raw):return hashlib.sha256(raw).hexdigest()
def canonical(value):return json.dumps(value,sort_keys=True,separators=(",",":"),ensure_ascii=True).encode("ascii")
def identity(s):return[str(x)for x in(s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)]
def read_owned(path,maximum=1048576):
    path=Path(path)
    require(path.is_absolute()and os.path.normpath(str(path))==str(path),"ABSOLUTE_CURRENT_V5_SOURCE")
    for parent in(path,*path.parents):require(not stat.S_ISLNK(parent.lstat().st_mode),"NO_CURRENT_V5_LINK")
    before=path.lstat();ident=identity(before)
    require(stat.S_ISREG(before.st_mode)and before.st_uid==os.getuid()and before.st_nlink==1 and 0<=before.st_size<=maximum,"OWNED_CURRENT_V5_SOURCE")
    with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW),"rb")as stream:
        require(identity(os.fstat(stream.fileno()))==ident,"CURRENT_V5_SOURCE_OPEN")
        raw=stream.read(maximum+1)
        require(len(raw)==before.st_size and identity(os.fstat(stream.fileno()))==ident,"CURRENT_V5_SOURCE_READ")
    require(identity(path.lstat())==ident,"CURRENT_V5_SOURCE_STABLE")
    return raw,ident
def load_dependencies(repo):
    require(sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode,"ISOLATED_V5_SOURCE_ONLY")
    modules=[]
    for name,path,digest in(
        ("capacity_v5_previous_roles","qualification/native_capacity_current_role_profiles_v4.py","a32d566f61c7093464a8c84e543965d82bf9fedf45741e65101ae28f331db24f"),
        ("capacity_v5_current_base","qualification/issued_current_close_v5_profile.py","c96432e2af56c49932e7a403b099b57d4a1028866980ab37e031deb79fd45d6a")):
        selected=Path(repo)/path;raw,before=read_owned(selected,65536)
        require(sha(raw)==digest,"EXACT_V5_PYTHON_DEPENDENCY")
        spec=importlib.util.spec_from_file_location(name,selected)
        require(spec is not None and spec.loader is not None,"V5_PYTHON_SOURCE_SPEC")
        module=importlib.util.module_from_spec(spec);sys.modules[name]=module
        exec(spec.loader.source_to_code(raw,str(selected)),module.__dict__)
        require(read_owned(selected,65536)==(raw,before),"V5_DEPENDENCY_STABLE");modules.append(module)
    old,forward=modules;base,current,legacy=old.load_dependencies(repo)
    return base,current,legacy,old,forward
def validate_selection_data(selection):
    require(type(selection)is dict and set(selection)==set(CONTEXT)|{"rows"},"EXACT_V5_SELECTION_FIELDS")
    require(canonical({key:selection[key]for key in CONTEXT})==canonical(CONTEXT),"EXACT_V5_SELECTION_CONTEXT")
    require(type(selection["rows"])is list and len(selection["rows"])==SOURCE_ROWS
        and sha(canonical(selection["rows"]))==SOURCE_SEAL,"EXACT_V5_COMPLETE_SELECTION")
def capture_selection(repo,dependencies,manifest_raw):
    require(type(manifest_raw)is bytes and sha(manifest_raw)==MANIFEST_SHA,"EXACT_V5_ROLE_MANIFEST")
    base,current,legacy,old,forward=dependencies
    manifest=base.decode_json(manifest_raw,65536)
    require(manifest["version"]==5 and type(manifest["version"])is int
        and manifest["nativeExecuted"]is False and manifest["historicalFilesModified"]is False
        and manifest["nativeAuthority"]=="NOT_GRANTED"and manifest["authority"]=="NONE","V5_SOURCE_NOT_AUTHORITY")
    raw={}
    for name in("currentProducer","currentSelection","previousRoleProducer","previousRoleSelection",
        "legacyInventory","baseline","previousCurrentSelection"):
        selected=manifest[name];content,_=read_owned(Path(repo)/selected["path"],262144)
        require(base.pin(selected["path"],content)==selected,"EXACT_PRESERVED_V5_METADATA");raw[name]=content
    previous=old.capture_selection(base,current,legacy,raw["previousRoleSelection"],raw["legacyInventory"],raw["baseline"],raw["previousCurrentSelection"])
    previous_base=current.expand_manifest(base.decode_json(raw["previousCurrentSelection"],65536),base.decode_json(raw["baseline"],262144))
    current_base=forward.capture_selection(repo,raw["currentSelection"],manifest["currentSelection"]["sha256"]).rows_data()
    previous_manifest=base.decode_json(raw["previousRoleSelection"],65536)
    exclude={row["path"]for row in previous_base}|{row["path"]for row in previous_manifest["additionalNativeRoleInputs"]}|{"app/"+old.CURRENT}
    extras=[row for row in previous["rows"]if row["path"]not in exclude]
    native=manifest["additionalNativeRoleInputs"];metadata=manifest["currentMetadataInputs"]
    require(len(extras)==22 and len(native)==7 and len(metadata)==2,"COMPLETE_V5_CAPACITY_EXTENSIONS")
    require(metadata==[dict(base.pin("app/"+name,raw[key]))for name,key in
        ((old.CURRENT,"previousCurrentSelection"),(forward.MANIFEST,"currentSelection"))],"BOTH_V4_AND_V5_METADATA_ROWS")
    rows=sorted(current_base+extras+native+metadata,key=lambda row:row["path"])
    require(len(rows)==len({row["path"]for row in rows})==SOURCE_ROWS
        and sum(row["path"].startswith("app/")for row in rows)==APP_FILES
        and sum(row["path"].startswith("packages/")for row in rows)==PACKAGE_FILES
        and sha(canonical(rows))==SOURCE_SEAL==manifest["sourceRowsSha256"]
        and sum(row["bytes"]for row in rows)==SOURCE_BYTES==manifest["declaredSourceBytes"],"COMPLETE_V5_154_404_SOURCE_SEAL")
    packages=[row for row in rows if row["path"].startswith("packages/")]
    require(packages==[row for row in current_base if row["path"].startswith("packages/")],"V5_ALL_404_PACKAGES_UNCHANGED")
    names={row["path"]for row in rows};edges=manifest["bareBindings"]
    require(len(edges)==len({(row["parent"],row["specifier"])for row in edges})==16
        and all(row["parent"]in names and row["target"]in names for row in edges),"ALL_16_V5_BARE_EDGES")
    return dict(rows=rows,bareBindings=edges,roleSpecs=manifest["roleSpecs"],currentManifestSha256=manifest["currentSelection"]["sha256"],
        baselineManifestSha256=manifest["baseline"]["sha256"],authority="NONE")
def verify_application_inputs(repo,selection):
    validate_selection_data(selection)
    root=Path(repo);before=identity(root.lstat());captures=[]
    require(root.is_absolute()and root.is_dir()and root.lstat().st_uid==os.getuid(),"OWNED_V5_APPLICATION_ROOT")
    for row in selection["rows"]:
        if not row["path"].startswith("app/"):continue
        content,ident=read_owned(root/row["path"][4:])
        require(dict(path=row["path"],bytes=len(content),LF=content.count(b"\n"),sha256=sha(content),
            gitBlob=hashlib.sha1(b"blob "+str(len(content)).encode()+b"\0"+content).hexdigest())==row,"EXACT_ACTUAL_V5_ROLE_SOURCE")
        captures.append((row["path"],ident))
    require(len(captures)==APP_FILES and identity(root.lstat())==before,"COMPLETE_V5_APPLICATION_ROOT")
    for name,ident in captures:require(identity((root/name[4:]).lstat())==ident,"V5_APPLICATION_IDENTITIES_RECHECKED")
    return dict(applicationFilesRead=APP_FILES,installedPackageFilesRead=0,nativeExecuted=False,authority="NONE")
def validate_registry_data(base,legacy,registry,selection):
    validate_selection_data(selection)
    r=base._plain(registry)
    base._fields(r,("inputs","bareBindings","runtime","sourceRowsSha256","applicationRoot","packageRoot",
        "sourceIdentitiesRead","sourcesCopied","nativeExecuted","authority"),"EXACT_V5_REGISTRY")
    require(type(r["sourceIdentitiesRead"])is bool and r["sourcesCopied"]is False and r["nativeExecuted"]is False
        and r["authority"]=="NONE"and r["sourceRowsSha256"]==SOURCE_SEAL,"V5_REGISTRY_NOT_AUTHORITY")
    require(len(selection["rows"])==SOURCE_ROWS and sha(canonical(selection["rows"]))==SOURCE_SEAL,"NO_MUTATED_V5_SELECTION")
    app,packages=base._absolute(r["applicationRoot"]),base._absolute(r["packageRoot"])
    require(app!=packages and not app.startswith(packages+"/")and not packages.startswith(app+"/"),"SEPARATE_V5_SOURCE_ROOTS")
    inputs,indexed=base._captured_inputs(selection["rows"],r["inputs"],app,packages)
    physical=set()
    for row in inputs:
        ident=row["identity"]
        require(all(type(v)is str and re.fullmatch(r"(?:0|[1-9][0-9]{0,19})",v)and int(v)<2**64 for v in ident)
            and int(ident[1])>0 and int(ident[2])==os.getuid()and int(ident[4])<=0o177777
            and stat.S_ISREG(int(ident[4]))and ident[5]=="1"and ident[6]==str(row["bytes"]),"CANONICAL_V5_SOURCE_IDENTITY")
        require(tuple(ident[:2])not in physical,"NO_V5_SOURCE_ALIAS");physical.add(tuple(ident[:2]))
    expected=[dict(parentURL=indexed[row["parent"]]["url"],specifier=row["specifier"],targetURL=indexed[row["target"]]["url"])for row in selection["bareBindings"]]
    require(r["bareBindings"]==expected,"EXACT_V5_ROLE_BINDINGS")
    runtime=r["runtime"];base._fields(runtime,("node","platform","arch","nodeSha256","nodeIdentity"),"EXACT_V5_RUNTIME")
    require(all(runtime[k]==v for k,v in dict(node="24.19.0",platform="darwin",arch="arm64",nodeSha256=legacy.NODE_SHA).items()),"PINNED_V5_RUNTIME")
    ident=runtime["nodeIdentity"]
    require(type(ident)is list and len(ident)==9 and all(type(v)is str and re.fullmatch(r"(?:0|[1-9][0-9]{0,19})",v)and int(v)<2**64 for v in ident)
        and int(ident[1])>0 and int(ident[2])in(0,os.getuid())and int(ident[4])<=0o177777
        and stat.S_ISREG(int(ident[4]))and int(ident[4])&0o111 and ident[5]=="1"and ident[6]==str(legacy.NODE_BYTES)
        and tuple(ident[:2])not in physical,"PINNED_V5_NODE_IDENTITY")
    return r,inputs,indexed
class _Planner:
    __slots__=("_base","_legacy","_runtime","_inputs","_index","_bindings","_shared","_shared_bytes","_selection","_planned","_roots")
    def __init__(self):raise ValueError("USE_EXPLICIT_V5_ROLE_FACTORY")
    @classmethod
    def _create(cls,base,legacy,registry,selection):
        self=object.__new__(cls);self._selection=base._plain(selection)
        r,inputs,indexed=validate_registry_data(base,legacy,registry,self._selection)
        self._base,self._legacy,self._runtime=base,legacy,r["runtime"]
        self._inputs,self._index,self._bindings=inputs,indexed,r["bareBindings"]
        self._roots=(r["applicationRoot"],r["packageRoot"]);self._planned=0
        self._shared={name:canonical(value)for name,value in(("inputs",inputs),("runtime",self._runtime),("bareBindings",self._bindings))}
        self._shared_bytes=sum(map(len,self._shared.values()));require(self._shared_bytes<=MAX_SHARED,"BOUNDED_V5_SHARED_FIELDS")
        return self
    def info(self):
        return dict(selectionVersion=5,applicationFiles=APP_FILES,packageFilesDeclared=PACKAGE_FILES,sourceRows=SOURCE_ROWS,
            sourceRowsSha256=SOURCE_SEAL,sharedFieldSerializations=3,sharedCanonicalBytes=self._shared_bytes,sharedCanonicalByteLimit=MAX_SHARED,
            profilesPlanned=self._planned,installedPackageFilesRead=0,sourceOrPackageTreeCopies=0,profilesWritten=False,
            privateRootsOpened=False,profileFactsAreCallerDeclared=True,nativeExecuted=False,nativeAuthority="NOT_GRANTED",authority="NONE")
    def plan_child(self,role,context,root):
        require(type(role)is str and role in self._selection["roleSpecs"],"CLOSED_V5_LEAF_ROLE")
        context=self._base._plain(context);self._base._fields(context,("runId","laneId"),"EXACT_V5_CONTEXT")
        require(type(context["runId"])is str and HASH.fullmatch(context["runId"])and type(context["laneId"])is str and LANE.fullmatch(context["laneId"]),"CANONICAL_V5_CONTEXT")
        root=self._legacy.directory_data(self._base,root);physical=tuple(root["identity"][:2])
        require(physical!=tuple(self._runtime["nodeIdentity"][:2])and all(physical!=tuple(row["identity"][:2])for row in self._inputs),"NO_V5_ROLE_ROOT_SOURCE_ALIAS")
        for source in self._roots:
            require(root["path"]!=source and not root["path"].startswith(source+"/")and not source.startswith(root["path"]+"/"),"INDEPENDENT_V5_ROLE_ROOT")
        spec=self._selection["roleSpecs"][role]
        value=dict(profileVersion=5,profileKind=spec["kind"],role=role,runtime=self._runtime,
            entryURL=self._index[spec["entry"]]["url"],preloaderURL=self._index[spec["preloader"]]["url"],
            inputs=self._inputs,bareBindings=self._bindings,allowedBuiltins=list(self._base.BUILTINS),
            sourceRowsSha256=SOURCE_SEAL,sourceTransform=False,ordinaryInstalledNamespace=False,
            baselineManifestSha256=self._selection["baselineManifestSha256"],currentManifestSha256=self._selection["currentManifestSha256"],
            runId=context["runId"],laneId=context["laneId"],rootPath=root["path"],rootIdentity=root["identity"],childProfiles=[])
        pieces=[b"{"]
        for index,name in enumerate(sorted(value)):
            if index:pieces.append(b",")
            pieces.extend((canonical(name),b":",self._shared[name]if name in self._shared else canonical(value[name])))
        pieces.append(b"}\n");require(sum(map(len,pieces))<=MAX_PROFILE,"BOUNDED_V5_COMPLETE_ROLE_PROFILE")
        raw=b"".join(pieces);self._planned+=1
        return dict(profileBytes=raw,profileSha256=sha(raw),profileBytesCount=len(raw),profileFactsAreCallerDeclared=True,
            nativeExecuted=False,nativeAuthority="NOT_GRANTED",authority="NONE")
def prepare_from_registry_data(repo,dependencies,registry,manifest_raw):
    selection=capture_selection(repo,dependencies,manifest_raw)
    return _Planner._create(dependencies[0],dependencies[2],registry,selection)

