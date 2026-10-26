"""Current packed offered V4 parent: all genuine V5 child bytes, no native launcher."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import sys
MANIFEST = 'qualification/capacity-native-current-offered-parent-v4.inputs.json'
MANIFEST_SHA = 'd65741b39885872f5d71ed3d3dbf7992a46966f66c64328850b2536dc91e0b83'
CHILD_PRODUCER = 'qualification/native_capacity_current_role_profiles_v5.py'
CHILD_PRODUCER_PIN = {'path': 'qualification/native_capacity_current_role_profiles_v5.py', 'bytes': 17540, 'LF': 179, 'sha256': 'ec6aed07ce441669aa4f4ecff6a416c7b49e6f648e70d108dade283f3911735d', 'gitBlob': '898b972b3a6ebf7e2c9c5eae7079b8aa62fbd4c0'}
PARENT_SEAL = 'cb24514abb5536ed1c4564654426229880872020d17c90ffc73e2f29c269efa1'
CHILD_SEAL = 'be5952dbf0e5fe17dbdd16549f2ac039802abbb92f541deb31c2591f4db653d7'
PARENT_BYTES = 5161518
PARENT_KIND = 'NATIVE_CAPACITY_CURRENT_OFFERED_SUPERVISOR_NODE24_V4'
PARENT_ENTRY = 'app/qualification/capacity-native-current-offered-v4.entry.draft.mjs'
PARENT_PRELOAD = 'app/qualification/capacity-native-current-offered-v4.namespace.preload.draft.mjs'
PARENT_NAMESPACE = 'getPinnedNativeCapacityCurrentOfferedSupervisorNamespaceSnapshotV4'
EXTRAS = ('app/qualification/capacity-native-current-offered-adapter-v5.draft.mjs', 'app/qualification/capacity-native-current-offered-pair-v4.supervisor.draft.mjs', 'app/qualification/capacity-native-current-offered-v4.entry.draft.mjs', 'app/qualification/capacity-native-current-offered-v4.namespace.preload.draft.mjs', 'app/src/native-profile-byte-fragments.js', 'app/src/service-credit-capacity-offered-plan-data.js', 'app/src/service-credit-capacity-offered-window-packed-owner-core.js', 'app/src/service-credit-capacity-offered-workload-packed-owner-core.js', 'app/src/service-credit-capacity-recorder-packed.js')
MAX_PROFILE, MAX_SHARED = 524288, 1048576
HASH = re.compile(r"[0-9a-f]{64}")
LANE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}")

def require(ok, code):
    if not ok:
        raise ValueError(code)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("ascii")


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def identity(s):
    return [str(v) for v in (s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)]


def read_owned(path, maximum=1048576):
    require(isinstance(path, Path) and path.is_absolute() and os.path.normpath(str(path)) == str(path), "ABSOLUTE_SOURCE_PATH")
    for at in (path, *path.parents):
        require(not stat.S_ISLNK(at.lstat().st_mode), "SOURCE_LINK")
    s=path.lstat(); before=identity(s)
    require(stat.S_ISREG(s.st_mode) and s.st_uid==os.getuid() and s.st_nlink==1 and 0<=s.st_size<=maximum, "SOURCE_FILE_IDENTITY")
    with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW),"rb") as stream:
        require(identity(os.fstat(stream.fileno()))==before,"SOURCE_OPEN_IDENTITY")
        raw=stream.read(maximum+1)
        require(len(raw)==s.st_size and identity(os.fstat(stream.fileno()))==before,"SOURCE_READ_IDENTITY")
    require(identity(path.lstat())==before,"SOURCE_PATH_IDENTITY")
    return raw,before


def context_data(base,value):
    value=base._plain(value);base._fields(value,("runId","laneId"),"CURRENT_PROFILE_CONTEXT_FIELDS")
    require(type(value["runId"]) is str and HASH.fullmatch(value["runId"])
        and type(value["laneId"]) is str and LANE.fullmatch(value["laneId"]),"CURRENT_PROFILE_CONTEXT_VALUES")
    return value


def load_dependencies(repo):
    require(sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode,"ISOLATED_CURRENT_V5_PARENT_SOURCE")
    path=Path(repo)/CHILD_PRODUCER;raw,before=read_owned(path,65536)
    require(sha(raw)==CHILD_PRODUCER_PIN["sha256"]and len(raw)==CHILD_PRODUCER_PIN["bytes"],"EXACT_ACTUAL_V5_CHILD_PRODUCER")
    spec=importlib.util.spec_from_file_location("current_offered_v3_actual_v5_child",path)
    require(spec is not None and spec.loader is not None,"CURRENT_V5_CHILD_SOURCE_SPEC")
    child=importlib.util.module_from_spec(spec);sys.modules[spec.name]=child
    exec(spec.loader.source_to_code(raw,str(path)),child.__dict__)
    require(read_owned(path,65536)==(raw,before),"CURRENT_V5_CHILD_PRODUCER_STABLE")
    dependencies=child.load_dependencies(repo)
    return dependencies[0],dependencies[2],child,dependencies
def validate_selection_data(child,selection):
    require(type(selection)is dict and set(selection)=={"rows","childSelection","extraRows"},"EXACT_V5_PARENT_SELECTION")
    child.validate_selection_data(selection["childSelection"])
    require(type(selection["extraRows"])is list and tuple(row["path"]for row in selection["extraRows"])==EXTRAS,"EXACT_EIGHT_V5_PARENT_EXTENSIONS")
    rows=selection["rows"];full={row["path"]:row for row in selection["childSelection"]["rows"]+selection["extraRows"]}
    require(len(full)==len(rows)==567 and len({row["path"]for row in rows})==567
        and all(full.get(row["path"])==row for row in rows)
        and sha(canonical(rows))==PARENT_SEAL and sum(row["bytes"]for row in rows)==PARENT_BYTES,"FULL_CURRENT_V5_PARENT_SEAL")
def capture_selection(repo,dependencies,manifest_raw):
    base,legacy,child,child_dependencies=dependencies
    require(type(manifest_raw)is bytes and sha(manifest_raw)==MANIFEST_SHA,"EXACT_CURRENT_V5_PARENT_MANIFEST")
    m=base.decode_json(manifest_raw,65536)
    child_raw,_=read_owned(Path(repo)/m["childGraph"]["manifest"]["path"],65536)
    require(base.pin(child.MANIFEST,child_raw)==m["childGraph"]["manifest"]and m["childGraph"]["producer"]==CHILD_PRODUCER_PIN
        and child.SOURCE_SEAL==CHILD_SEAL and m["nativeExecuted"]is False and m["historicalSourcesModified"]is False
        and m["nativeAuthority"]=="NOT_GRANTED"and m["authority"]=="NONE","CURRENT_V5_PARENT_NOT_NATIVE_AUTHORITY")
    selected=child.capture_selection(repo,child_dependencies,child_raw)
    extras=base._rows(m["additionalParentApplicationInputs"],"app/",9)
    require(tuple(extras)==EXTRAS and not set(extras).intersection(row["path"]for row in selected["rows"]),"ONLY_PARENT_EXTENSIONS")
    value=dict(rows=sorted(selected["rows"]+list(extras.values()),key=lambda row:row["path"]),childSelection=selected,extraRows=list(extras.values()))
    validate_selection_data(child,value);return value
def verify_application_inputs(repo,child,selection):
    validate_selection_data(child,selection);root=Path(repo);before=identity(root.lstat());captured=[]
    for row in selection["rows"]:
        if not row["path"].startswith("app/"):continue
        raw,ident=read_owned(root/row["path"][4:])
        actual=dict(path=row["path"],bytes=len(raw),LF=raw.count(b"\n"),sha256=sha(raw),
            gitBlob=hashlib.sha1(b"blob "+str(len(raw)).encode()+b"\0"+raw).hexdigest())
        require(actual==row,"ACTUAL_CURRENT_V5_PARENT_APPLICATION_PIN");captured.append((row["path"],ident))
    require(len(captured)==163 and identity(root.lstat())==before,"ALL_163_CURRENT_PARENT_APPLICATION_SOURCES")
    for name,ident in captured:require(identity((root/name[4:]).lstat())==ident,"PARENT_APPLICATION_IDENTITIES_RECHECKED")
    return dict(applicationFilesRead=163,installedPackageFilesRead=0,nativeExecuted=False,authority="NONE")

class _Planner:
    """Detached full tables and bounded shared canonical fields."""
    __slots__=("_base","_legacy","_child_module","_child_inputs","_parent_inputs","_index",
        "_runtime","_bindings","_shared","_shared_bytes","_source_read","_child_comparisons","_source_roots")

    def __init__(self):
        raise ValueError("USE_EXPLICIT_CURRENT_PARENT_FACTORY")

    @classmethod
    def _create(cls,base,legacy,child,registry,extra_captures,selection,observed=False):
        validate_selection_data(child,selection)
        self=object.__new__(cls)
        r,inputs,indexed=child.validate_registry_data(base,legacy,registry,selection["childSelection"])
        extras,_=base._captured_inputs(selection["extraRows"],extra_captures,r["applicationRoot"],r["packageRoot"])
        physical={tuple(row["identity"][:2])for row in inputs}|{tuple(r["runtime"]["nodeIdentity"][:2])}
        for row in extras:
            ident=row["identity"]
            require(all(re.fullmatch(r"(?:0|[1-9][0-9]{0,19})",v) and int(v)<2**64 for v in ident)
                and int(ident[1])>0 and int(ident[2])==os.getuid() and int(ident[4])<=0o177777
                and stat.S_ISREG(int(ident[4]))and ident[5]=="1"and ident[6]==str(row["bytes"])
                and tuple(ident[:2])not in physical,
                "CURRENT_PARENT_EXTENSION_IDENTITY")
            physical.add(tuple(ident[:2]))
        self._base,self._legacy,self._child_module=base,legacy,child
        self._child_inputs=inputs
        self._parent_inputs=sorted(inputs+extras,key=lambda row:row["logicalPath"])
        self._index={row["logicalPath"]:row for row in self._parent_inputs}
        self._runtime,self._bindings=r["runtime"],r["bareBindings"]
        self._source_roots=(r["applicationRoot"],r["packageRoot"])
        self._shared={name:canonical(value) for name,value in (
            ("childInputs",inputs),("parentInputs",self._parent_inputs),
            ("runtime",self._runtime),("bareBindings",self._bindings))}
        self._shared_bytes=sum(map(len,self._shared.values()))
        require(self._shared_bytes<=MAX_SHARED,"BOUNDED_CURRENT_PARENT_SHARED_FIELDS")
        self._source_read,self._child_comparisons=observed,0
        return self

    def info(self):
        return dict(parentApplicationFiles=163,parentPackageFiles=404,parentSourceRows=567,
            childApplicationFiles=154,childPackageFiles=404,childSourceRows=558,
            parentSourceRowsSha256=PARENT_SEAL,childSourceRowsSha256=CHILD_SEAL,
            sourceFilesReadOnlyVerified=self._source_read,sourceFilesRead=567 if self._source_read else 0,
            nodeBinaryHashesForContext=1 if self._source_read else 0,sharedFieldSerializations=4,
            sharedCanonicalBytes=self._shared_bytes,sharedCanonicalByteLimit=MAX_SHARED,
            completeChildByteComparisons=self._child_comparisons,wholeExpectedChildBytesMaterialized=0,
            sourceOrPackageTreeCopies=0,privateRootsOpened=False,profilesWritten=False,
            nativeExecuted=False,privateProfileIsNativeAuthority=False,nativeAuthority="NOT_GRANTED",profileFactsAreCallerDeclared=True,authority="NONE")

    def _root(self,value):
        root=self._legacy.directory_data(self._base,value);physical=tuple(root["identity"][:2])
        require(physical!=tuple(self._runtime["nodeIdentity"][:2])and all(physical!=tuple(row["identity"][:2])for row in self._parent_inputs),"NO_PARENT_ROLE_ROOT_SOURCE_ALIAS")
        for source in self._source_roots:
            require(root["path"]!=source and not root["path"].startswith(source+"/")and not source.startswith(root["path"]+"/"),"INDEPENDENT_CURRENT_PARENT_ROLE_ROOT")
        return root

    def _value(self,role,context,root,children):
        base=self._base;context=context_data(base,context);root=self._root(root)
        parent=role=="SUPERVISOR"
        spec=dict(kind=PARENT_KIND,entry=PARENT_ENTRY,preloader=PARENT_PRELOAD) if parent else self._child_module.CONTEXT["roleSpecs"][role]
        value=dict(profileVersion=7 if parent else 5,profileKind=spec["kind"],role=role,runtime=self._runtime,
            entryURL=self._index[spec["entry"]]["url"],preloaderURL=self._index[spec["preloader"]]["url"],
            inputs=self._parent_inputs if parent else self._child_inputs,bareBindings=self._bindings,
            allowedBuiltins=sorted(base.BUILTINS+["node:child_process"])if parent else list(base.BUILTINS),
            sourceRowsSha256=PARENT_SEAL if parent else CHILD_SEAL,sourceTransform=False,ordinaryInstalledNamespace=False,
            baselineManifestSha256=self._legacy.BASELINE_SHA,currentManifestSha256=self._child_module.CONTEXT["currentManifestSha256"],
            runId=context["runId"],laneId=context["laneId"],rootPath=root["path"],rootIdentity=root["identity"],childProfiles=children)
        if parent:value["childSourceRowsSha256"]=CHILD_SEAL
        return value

    def _fragments(self,value):
        pieces=[b"{"]
        for index,field in enumerate(sorted(value)):
            if index:pieces.append(b",")
            shared=("parentInputs" if value["role"]=="SUPERVISOR" else "childInputs") if field=="inputs" else field
            pieces.extend((canonical(field),b":",self._shared[shared] if shared in self._shared else canonical(value[field])))
        pieces.append(b"}\n")
        require(sum(map(len,pieces))<=MAX_PROFILE,"BOUNDED_CURRENT_PRIVATE_PROFILE")
        return tuple(pieces)

    def _result(self,value):
        raw=b"".join(self._fragments(value))
        return dict(profileBytes=raw,profileSha256=sha(raw),profileBytesCount=len(raw),
            sourceIdentitiesAuthenticated=False,rootIdentitiesAuthenticated=False,privateChildProfilesAuthenticated=False,
            privateProfileIsNativeAuthority=False,nativeExecuted=False,authority="NONE")

    def _matches_child(self,raw,role,context,root):
        fragments=self._fragments(self._value(role,context,root,[]))
        if sum(map(len,fragments))!=len(raw):return False
        view,offset=memoryview(raw),0
        for fragment in fragments:
            end=offset+len(fragment)
            if view[offset:end]!=fragment:return False
            offset=end
        self._child_comparisons+=1
        return offset==len(raw)

    def plan_child(self,role,context,root):
        require(type(role) is str and role in self._child_module.CONTEXT["roleSpecs"],"CLOSED_CURRENT_CHILD_ROLE")
        return self._result(self._value(role,context,root,[]))

    def plan_parent(self,context,root,children):
        base=self._base;context=context_data(base,context);root=self._root(root)
        require(type(children) is list and 2<=len(children)<=32 and len(children)%2==0,"COMPLETE_CURRENT_CHILD_PAIRS")
        roots,physical,paths,digests,lanes,refs={root["path"]},{tuple(root["identity"][:2])},set(),set(),{},[]
        for bundle in children:
            base._fields(bundle,("reference","profileBytes"),"CURRENT_CHILD_BUNDLE_FIELDS")
            child=base._plain(bundle["reference"])
            base._fields(child,("role","laneId","path","sha256","entryURL","preloaderURL","rootPath","rootIdentity"),"CURRENT_CHILD_REFERENCE_FIELDS")
            require(type(child["role"]) is str and child["role"] in self._child_module.CONTEXT["roleSpecs"]
                and type(child["laneId"]) is str and LANE.fullmatch(child["laneId"]),"CURRENT_CHILD_ROLE_CONTEXT")
            path=base._absolute(child["path"])
            child_root=self._root(dict(path=child["rootPath"],identity=child["rootIdentity"]))
            require(type(child["sha256"]) is str and HASH.fullmatch(child["sha256"])
                and path not in paths and path not in roots and child_root["path"] not in roots and child_root["path"] not in paths
                and child["sha256"] not in digests and tuple(child_root["identity"][:2]) not in physical,"CURRENT_CHILD_ALIAS_OR_DIGEST")
            spec=self._child_module.CONTEXT["roleSpecs"][child["role"]]
            require(child["entryURL"]==self._index[spec["entry"]]["url"]
                and child["preloaderURL"]==self._index[spec["preloader"]]["url"],"CURRENT_CHILD_ROLE_URLS")
            roles=lanes.setdefault(child["laneId"],set());require(child["role"] not in roles,"DUPLICATE_CURRENT_CHILD_ROLE")
            raw=bundle["profileBytes"]
            require(type(raw) is bytes and 0<len(raw)<=MAX_PROFILE and sha(raw)==child["sha256"],"CURRENT_CHILD_BYTES_DIGEST")
            require(self._matches_child(raw,child["role"],dict(runId=context["runId"],laneId=child["laneId"]),child_root),
                "EXACT_COMPLETE_CURRENT_V5_CHILD_BYTES")
            roles.add(child["role"]);paths.add(path);roots.add(child_root["path"]);physical.add(tuple(child_root["identity"][:2]))
            digests.add(child["sha256"]);refs.append(child)
        require(all(len(roles)==2 for roles in lanes.values()),"COMPLETE_CURRENT_PAYER_SERVICE_LANES")
        return self._result(self._value("SUPERVISOR",context,root,refs))


def prepare_from_registry_data(repo,dependencies,registry,extra_captures,manifest_raw):
    selection=capture_selection(repo,dependencies,manifest_raw)
    return _Planner._create(dependencies[0],dependencies[1],dependencies[2],registry,extra_captures,selection,False)
