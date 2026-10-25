"""Current offered parent V2: full current child profiles, no native execution.

The actual V4 child producer validates the whole 557-row graph. This parent adds
seven source rows, emits a distinct V5 parent profile, and compares every
original child byte without materializing a second whole expected child.
All roots/identities supplied to DATA factories remain declarations.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import sys

MANIFEST = "qualification/capacity-native-current-offered-parent-v2.inputs.json"
MANIFEST_SHA = "c9eb8a699217aade0e5e09de014045fcf912c5f554246a1dd4dddd6ef78d530d"
CHILD_PRODUCER = "qualification/native_capacity_current_role_profiles_v4.py"
CHILD_PRODUCER_PIN = json.loads("{\"path\":\"qualification/native_capacity_current_role_profiles_v4.py\",\"bytes\":19763,\"LF\":295,\"sha256\":\"a32d566f61c7093464a8c84e543965d82bf9fedf45741e65101ae28f331db24f\",\"gitBlob\":\"3d99b2ab631c1ef1857f0c90af7330340410eb52\"}")
PARENT_SEAL = "f5ba2a28fe30f6ff1b5d54a45c1c3e424806ad6fa858fe2d0d57d11ba41b4b84"
CHILD_SEAL = "db33115ac37137f5b0212cb33d748154b498ec1b15ca106dfb757575da692a6e"
PARENT_BYTES = 5134462
PARENT_KIND = "NATIVE_CAPACITY_CURRENT_OFFERED_SUPERVISOR_NODE24_V2"
PARENT_ENTRY = "app/qualification/capacity-native-current-offered-v2.entry.draft.mjs"
PARENT_PRELOAD = "app/qualification/capacity-native-current-offered-v2.namespace.preload.draft.mjs"
PARENT_NAMESPACE = "getPinnedNativeCapacityCurrentOfferedSupervisorNamespaceSnapshotV2"
EXTRAS = tuple(["app/qualification/capacity-native-current-offered-adapter-v3.draft.mjs","app/qualification/capacity-native-current-offered-pair-v2.supervisor.draft.mjs","app/qualification/capacity-native-current-offered-v2.entry.draft.mjs","app/qualification/capacity-native-current-offered-v2.namespace.preload.draft.mjs","app/src/service-credit-capacity-offered-plan-data.js","app/src/service-credit-capacity-offered-window-owner-core.js","app/src/service-credit-capacity-offered-workload-owner-core.js"])
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


def load_dependencies(repo):
    """Execute the captured unmodified current producer, not cached bytecode."""
    require(sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode,"ISOLATED_SOURCE_REQUIRED")
    path=Path(repo)/CHILD_PRODUCER; raw,before=read_owned(path,65536)
    require(sha(raw)==CHILD_PRODUCER_PIN["sha256"] and len(raw)==CHILD_PRODUCER_PIN["bytes"],"EXACT_CURRENT_CHILD_PRODUCER")
    spec=importlib.util.spec_from_file_location("current_offered_v2_actual_child",path)
    require(spec is not None and spec.loader is not None,"CURRENT_CHILD_SOURCE_SPEC")
    child=importlib.util.module_from_spec(spec);sys.modules[spec.name]=child
    exec(spec.loader.source_to_code(raw,str(path)),child.__dict__)
    require(read_owned(path,65536)==(raw,before),"CURRENT_CHILD_PRODUCER_CHANGED")
    base,current,legacy=child.load_dependencies(repo)
    return base,current,legacy,child


def capture_selection(base,current,legacy,child,manifest_raw,child_manifest_raw,inventory_raw,baseline_raw,current_raw):
    require(type(manifest_raw) is bytes and sha(manifest_raw)==MANIFEST_SHA,"CURRENT_PARENT_MANIFEST_PIN")
    manifest=base.decode_json(manifest_raw,65536)
    base._fields(manifest,("sourceSelectionVersion","kind","sourceParent","runtime","parentRole","childGraph",
        "additionalParentApplicationInputs","parentApplicationFiles","parentPackageFiles","parentSourceRows",
        "parentSourceRowsSha256","parentDeclaredInputBytes","capture","sourceEvidence","remaining","authority"),
        "CURRENT_PARENT_MANIFEST_FIELDS")
    selected=child.capture_selection(base,current,legacy,child_manifest_raw,inventory_raw,baseline_raw,current_raw)
    require(type(manifest["sourceSelectionVersion"]) is int and manifest["sourceSelectionVersion"]==2
        and manifest["kind"]=="CURRENT_OFFERED_PARENT_160_404_SOURCE_NOT_NATIVE_EXECUTION"
        and manifest["sourceParent"]=="9a2dbbe5cc3ab6d4ed300f7b3d625136f15192a8"
        and manifest["authority"]=="NONE","CURRENT_PARENT_SELECTION")
    require(manifest["runtime"]==dict(node="24.19.0",platform="darwin",arch="arm64",
        nodeSha256=legacy.NODE_SHA,nodeBytes=legacy.NODE_BYTES),"CURRENT_PARENT_RUNTIME")
    require(manifest["childGraph"]==dict(manifest=base.pin(child.MANIFEST,child_manifest_raw),
        producer=CHILD_PRODUCER_PIN,sourceRowsSha256=CHILD_SEAL,applicationFiles=153,packageFiles=404,
        profileVersion=4,completeCurrentChildRowsPreserved=True) and child.SOURCE_SEAL==CHILD_SEAL,
        "EXACT_COMPLETE_CURRENT_CHILD_SELECTION")
    require(manifest["parentRole"]==dict(profileKind=PARENT_KIND,profileVersion=5,entry=PARENT_ENTRY,
        preloader=PARENT_PRELOAD,namespace=PARENT_NAMESPACE),"DISTINCT_CURRENT_PARENT_ROLE")
    extras=base._rows(manifest["additionalParentApplicationInputs"],"app/",7)
    require(tuple(extras)==EXTRAS and not set(extras).intersection(row["path"] for row in selected["rows"]),
        "SEVEN_PARENT_ONLY_ROWS_NO_CHILD_REPLACEMENT")
    rows=sorted(selected["rows"]+list(extras.values()),key=lambda row:row["path"])
    require(len(rows)==564 and sum(row["bytes"] for row in rows)==PARENT_BYTES==manifest["parentDeclaredInputBytes"]
        and sha(canonical(rows))==PARENT_SEAL==manifest["parentSourceRowsSha256"]
        and manifest["parentApplicationFiles"]==160 and manifest["parentPackageFiles"]==404
        and manifest["parentSourceRows"]==564,"COMPLETE_CURRENT_PARENT_SEAL")
    require(manifest["capture"]==dict(offeredCaptureVersion=2,wholeOriginalResultAndChildEvidencePreserved=True,
        parentAndChildClockDomainsAligned=False) and manifest["sourceEvidence"]["nativeAppExecutions"]==0
        and manifest["sourceEvidence"]["newNativeAllowanceGranted"] is False
        and all(value is False for value in manifest["remaining"].values()),"SOURCE_NOT_NATIVE_OR_AUTHORITY")
    return dict(rows=rows,childSelection=selected,extraRows=list(extras.values()))


def context_data(base,value):
    value=base._plain(value);base._fields(value,("runId","laneId"),"CURRENT_PROFILE_CONTEXT_FIELDS")
    require(type(value["runId"]) is str and HASH.fullmatch(value["runId"])
        and type(value["laneId"]) is str and LANE.fullmatch(value["laneId"]),"CURRENT_PROFILE_CONTEXT_VALUES")
    return value


class _Planner:
    """Detached full tables and bounded shared canonical fields."""
    __slots__=("_base","_legacy","_child_module","_child_inputs","_parent_inputs","_index",
        "_runtime","_bindings","_shared","_shared_bytes","_source_read","_child_comparisons")

    def __init__(self):
        raise ValueError("USE_EXPLICIT_CURRENT_PARENT_FACTORY")

    @classmethod
    def _create(cls,base,legacy,child,registry,extra_captures,selection,observed=False):
        self=object.__new__(cls)
        r,inputs,indexed=child.validate_registry_data(base,legacy,registry,selection["childSelection"])
        extras,_=base._captured_inputs(selection["extraRows"],extra_captures,r["applicationRoot"],r["packageRoot"])
        for row in extras:
            ident=row["identity"]
            require(all(re.fullmatch(r"(?:0|[1-9][0-9]{0,19})",v) and int(v)<2**64 for v in ident)
                and int(ident[1])>0 and int(ident[2])==os.getuid() and int(ident[4])<=0o177777,
                "CURRENT_PARENT_EXTENSION_IDENTITY")
        self._base,self._legacy,self._child_module=base,legacy,child
        self._child_inputs=inputs
        self._parent_inputs=sorted(inputs+extras,key=lambda row:row["logicalPath"])
        self._index={row["logicalPath"]:row for row in self._parent_inputs}
        self._runtime,self._bindings=r["runtime"],r["bareBindings"]
        self._shared={name:canonical(value) for name,value in (
            ("childInputs",inputs),("parentInputs",self._parent_inputs),
            ("runtime",self._runtime),("bareBindings",self._bindings))}
        self._shared_bytes=sum(map(len,self._shared.values()))
        require(self._shared_bytes<=MAX_SHARED,"BOUNDED_CURRENT_PARENT_SHARED_FIELDS")
        self._source_read,self._child_comparisons=observed,0
        return self

    def info(self):
        return dict(parentApplicationFiles=160,parentPackageFiles=404,parentSourceRows=564,
            childApplicationFiles=153,childPackageFiles=404,childSourceRows=557,
            parentSourceRowsSha256=PARENT_SEAL,childSourceRowsSha256=CHILD_SEAL,
            sourceFilesReadOnlyVerified=self._source_read,sourceFilesRead=564 if self._source_read else 0,
            nodeBinaryHashesForContext=1 if self._source_read else 0,sharedFieldSerializations=4,
            sharedCanonicalBytes=self._shared_bytes,sharedCanonicalByteLimit=MAX_SHARED,
            completeChildByteComparisons=self._child_comparisons,wholeExpectedChildBytesMaterialized=0,
            sourceOrPackageTreeCopies=0,privateRootsOpened=False,profilesWritten=False,
            nativeExecuted=False,privateProfileIsNativeAuthority=False,authority="NONE")

    def _value(self,role,context,root,children):
        base=self._base;context=context_data(base,context);root=self._legacy.directory_data(base,root)
        parent=role=="SUPERVISOR"
        spec=dict(kind=PARENT_KIND,entry=PARENT_ENTRY,preloader=PARENT_PRELOAD) if parent else self._child_module.SPECS[role]
        value=dict(profileVersion=5 if parent else 4,profileKind=spec["kind"],role=role,runtime=self._runtime,
            entryURL=self._index[spec["entry"]]["url"],preloaderURL=self._index[spec["preloader"]]["url"],
            inputs=self._parent_inputs if parent else self._child_inputs,bareBindings=self._bindings,
            allowedBuiltins=sorted(base.BUILTINS+(["node:child_process"] if parent else [])),
            sourceRowsSha256=PARENT_SEAL if parent else CHILD_SEAL,sourceTransform=False,ordinaryInstalledNamespace=False,
            baselineManifestSha256=self._legacy.BASELINE_SHA,currentManifestSha256=self._child_module.CURRENT_SHA,
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
        require(type(role) is str and role in self._child_module.SPECS,"CLOSED_CURRENT_CHILD_ROLE")
        return self._result(self._value(role,context,root,[]))

    def plan_parent(self,context,root,children):
        base=self._base;context=context_data(base,context);root=self._legacy.directory_data(base,root)
        require(type(children) is list and 2<=len(children)<=32 and len(children)%2==0,"COMPLETE_CURRENT_CHILD_PAIRS")
        roots,physical,paths,digests,lanes,refs={root["path"]},{tuple(root["identity"][:2])},set(),set(),{},[]
        for bundle in children:
            base._fields(bundle,("reference","profileBytes"),"CURRENT_CHILD_BUNDLE_FIELDS")
            child=base._plain(bundle["reference"])
            base._fields(child,("role","laneId","path","sha256","entryURL","preloaderURL","rootPath","rootIdentity"),"CURRENT_CHILD_REFERENCE_FIELDS")
            require(type(child["role"]) is str and child["role"] in self._child_module.SPECS
                and type(child["laneId"]) is str and LANE.fullmatch(child["laneId"]),"CURRENT_CHILD_ROLE_CONTEXT")
            path=base._absolute(child["path"])
            child_root=self._legacy.directory_data(base,dict(path=child["rootPath"],identity=child["rootIdentity"]))
            require(type(child["sha256"]) is str and HASH.fullmatch(child["sha256"])
                and path not in paths and path not in roots and child_root["path"] not in roots and child_root["path"] not in paths
                and child["sha256"] not in digests and tuple(child_root["identity"][:2]) not in physical,"CURRENT_CHILD_ALIAS_OR_DIGEST")
            spec=self._child_module.SPECS[child["role"]]
            require(child["entryURL"]==self._index[spec["entry"]]["url"]
                and child["preloaderURL"]==self._index[spec["preloader"]]["url"],"CURRENT_CHILD_ROLE_URLS")
            roles=lanes.setdefault(child["laneId"],set());require(child["role"] not in roles,"DUPLICATE_CURRENT_CHILD_ROLE")
            raw=bundle["profileBytes"]
            require(type(raw) is bytes and 0<len(raw)<=MAX_PROFILE and sha(raw)==child["sha256"],"CURRENT_CHILD_BYTES_DIGEST")
            require(self._matches_child(raw,child["role"],dict(runId=context["runId"],laneId=child["laneId"]),child_root),
                "EXACT_COMPLETE_CURRENT_V4_CHILD_BYTES")
            roles.add(child["role"]);paths.add(path);roots.add(child_root["path"]);physical.add(tuple(child_root["identity"][:2]))
            digests.add(child["sha256"]);refs.append(child)
        require(all(len(roles)==2 for roles in lanes.values()),"COMPLETE_CURRENT_PAYER_SERVICE_LANES")
        return self._result(self._value("SUPERVISOR",context,root,refs))


def prepare_from_registry_data(base,current,legacy,child,registry,extra_captures,manifest_raw,child_manifest_raw,inventory_raw,baseline_raw,current_raw):
    selected=capture_selection(base,current,legacy,child,manifest_raw,child_manifest_raw,inventory_raw,baseline_raw,current_raw)
    return _Planner._create(base,legacy,child,registry,extra_captures,selected,False)


def build_source_context(repo,packages,node):
    """One in-place full source pass and one Node hash; no role-root access."""
    repo=Path(repo);base,current,legacy,child=load_dependencies(repo)
    manifest_raw=read_owned(repo/MANIFEST,65536)[0];child_manifest_raw=read_owned(repo/child.MANIFEST,65536)[0]
    inventory_raw=read_owned(repo/legacy.INVENTORY,65536)[0];baseline_raw=read_owned(repo/legacy.BASELINE,262144)[0]
    current_raw=read_owned(repo/child.CURRENT,65536)[0]
    selection=capture_selection(base,current,legacy,child,manifest_raw,child_manifest_raw,inventory_raw,baseline_raw,current_raw)
    app,package_root=base._absolute(str(repo)),base._absolute(packages)
    before=(legacy.capture_directory(base,app,False),legacy.capture_directory(base,package_root,False))
    captures=[]
    for row in selection["rows"]:
        is_app=row["path"].startswith("app/");root,relative=(app,row["path"][4:]) if is_app else (package_root,row["path"][9:])
        raw,ident=read_owned(Path(root)/relative)
        require(base.pin(row["path"],raw)==row,"ACTUAL_CURRENT_PARENT_SOURCE_PIN")
        if row["path"] in base.VERSIONS:
            package=json.loads(raw.decode("utf8"),object_pairs_hook=base._pairs)
            require(type(package) is dict and package.get("version")==base.VERSIONS[row["path"]],"ACTUAL_PACKAGE_VERSION")
        captures.append(dict(logicalPath=row["path"],url=base.source_url(root,relative),
            **{k:row[k] for k in ("bytes","LF","sha256","gitBlob")},identity=ident))
    indexed={row["logicalPath"]:row for row in captures};child_rows=selection["childSelection"]["rows"]
    registry=dict(inputs=[indexed[row["path"]] for row in child_rows],
        bareBindings=[dict(parentURL=indexed[e["parent"]]["url"],specifier=e["specifier"],targetURL=indexed[e["target"]]["url"])
            for e in selection["childSelection"]["bareBindings"]],runtime=legacy.node_pin(node),sourceRowsSha256=CHILD_SEAL,
        applicationRoot=app,packageRoot=package_root,sourceIdentitiesRead=True,sourcesCopied=False,nativeExecuted=False,authority="NONE")
    for row in captures:
        root,relative=(app,row["logicalPath"][4:]) if row["logicalPath"].startswith("app/") else (package_root,row["logicalPath"][9:])
        require(identity((Path(root)/relative).lstat())==row["identity"],"CURRENT_PARENT_SOURCE_CHANGED")
    require(identity(Path(node).lstat())==registry["runtime"]["nodeIdentity"]
        and before==(legacy.capture_directory(base,app,False),legacy.capture_directory(base,package_root,False)),"CURRENT_PARENT_ROOT_OR_NODE_CHANGED")
    return _Planner._create(base,legacy,child,registry,[indexed[row["path"]] for row in selection["extraRows"]],selection,True)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ("repo","packages","node","selection-sha256"):parser.add_argument("--"+name,required=True)
    parser.add_argument("--source-only",action="store_true");args=parser.parse_args()
    require(args.source_only and args.selection_sha256==MANIFEST_SHA,"EXPLICIT_CURRENT_PARENT_SOURCE_ONLY")
    planner=build_source_context(args.repo,args.packages,args.node)
    print(json.dumps(dict(event="CURRENT_OFFERED_PARENT_V2_SOURCE_CONTEXT_NOT_NATIVE",**planner.info()),sort_keys=True),flush=True)
    return 0


if __name__=="__main__":
    try:sys.exit(main())
    except (OSError,ValueError,KeyError,TypeError,SyntaxError) as error:
        code=str(error) if type(error) is ValueError and re.fullmatch(r"[A-Z0-9_]+",str(error)) else "REVIEW_CURRENT_PARENT_SOURCE"
        print(json.dumps(dict(event="CURRENT_OFFERED_PARENT_V2_SOURCE_REFUSED",code=code,nativeExecuted=False,authority="NONE")),file=sys.stderr,flush=True)
        sys.exit(1)
