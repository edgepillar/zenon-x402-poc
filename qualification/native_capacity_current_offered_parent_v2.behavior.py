"""Complete current parent/child profile composition DATA, no native imports."""
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import sys
import unittest

repo=Path(__file__).absolute().parents[1]
module_relative="qualification/native_capacity_current_offered_parent_v2.py"
native_sources=json.loads("[\"qualification/capacity-native-current-offered-pair-v2.supervisor.draft.mjs\",\"qualification/capacity-native-current-offered-adapter-v3.draft.mjs\",\"qualification/capacity-native-current-offered-v2.entry.draft.mjs\",\"qualification/capacity-native-current-offered-v2.namespace.preload.draft.mjs\"]")
allowed={str(repo/name) for name in [module_relative,"qualification/native_capacity_current_offered_parent_v2.behavior.py","qualification/capacity-native-current-offered-parent-v2.inputs.json",
    "qualification/native_capacity_current_role_profiles_v4.py","qualification/capacity-native-current-roles-v4.inputs.json",
    "qualification/capacity-native-full-graph-v3.inputs.json","qualification/issued-funding-post-native-vertical.inputs-v3.json",
    "qualification/issued-current-close-v4.inputs.json","qualification/recovery_crash_native_profile.py",
    "qualification/issued_current_close_v4_profile.py","qualification/native_capacity_full_profile_v3.py",*native_sources]}
stdlib=str(Path(sys.base_prefix)/"lib"/"python3.12")+"/"
audited=dict(subprocesses=0,sockets=0,sqlite=0,writeOpens=0,outsideSourceReads=0,mutations=0)
def audit(event,args):
    if event in ("subprocess.Popen","os.system","os.fork","os.posix_spawn"):
        audited["subprocesses"]+=1;raise AssertionError("NO_CHILD_IN_CURRENT_PARENT_DATA")
    if event.startswith("socket."):
        audited["sockets"]+=1;raise AssertionError("NO_SOCKET_IN_CURRENT_PARENT_DATA")
    if event=="sqlite3.connect":
        audited["sqlite"]+=1;raise AssertionError("NO_SQL_IN_CURRENT_PARENT_DATA")
    if event in ("os.remove","os.rename","os.mkdir","os.rmdir","os.link","os.symlink"):
        audited["mutations"]+=1;raise AssertionError("NO_MUTATION_IN_CURRENT_PARENT_DATA")
    if event=="open":
        if type(args[2]) is int and args[2]&(os.O_WRONLY|os.O_RDWR|os.O_CREAT|os.O_TRUNC):
            audited["writeOpens"]+=1;raise AssertionError("NO_WRITE_OPEN_IN_CURRENT_PARENT_DATA")
        if type(args[0]) is str and args[0] not in allowed and not (
                args[0].startswith(stdlib) and "site-packages" not in Path(args[0]).parts):
            audited["outsideSourceReads"]+=1;raise AssertionError("ONLY_DECLARED_SOURCE_AND_STDLIB")
sys.addaudithook(audit)
if not(sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode) or os.environ.get(
        "X402_CURRENT_OFFERED_PARENT_DATA_SELECTION")!="current-offered-parent-data-v2":
    raise ValueError("EXACT_ISOLATED_CURRENT_PARENT_DATA_SELECTION")
path=repo/module_relative
def identity(s):return [str(v)for v in(s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)]
for at in(path,*path.parents):
    if at.is_symlink():raise ValueError("PARENT_PRODUCER_LINK")
before=path.lstat()
if not stat.S_ISREG(before.st_mode) or before.st_uid!=os.getuid() or before.st_nlink!=1 or before.st_size>65536:
    raise ValueError("PARENT_PRODUCER_IDENTITY")
with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW),"rb")as stream:
    if identity(os.fstat(stream.fileno()))!=identity(before):raise ValueError("PARENT_PRODUCER_OPEN")
    raw=stream.read(65537)
    if len(raw)!=before.st_size or identity(os.fstat(stream.fileno()))!=identity(before):raise ValueError("PARENT_PRODUCER_READ")
expected=os.environ.get("X402_CURRENT_OFFERED_PARENT_PRODUCER_SHA256")
if hashlib.sha256(raw).hexdigest()!=expected:raise ValueError("PARENT_PRODUCER_PIN")
spec=importlib.util.spec_from_file_location("actual_current_offered_parent_v2",path)
p=importlib.util.module_from_spec(spec);sys.modules[spec.name]=p
exec(spec.loader.source_to_code(raw,str(path)),p.__dict__)
base,current,legacy,child=p.load_dependencies(repo)
manifest_raw=p.read_owned(repo/p.MANIFEST,65536)[0]
child_manifest_raw=p.read_owned(repo/child.MANIFEST,65536)[0]
inventory_raw=p.read_owned(repo/legacy.INVENTORY,65536)[0]
baseline_raw=p.read_owned(repo/legacy.BASELINE,262144)[0]
current_raw=p.read_owned(repo/child.CURRENT,65536)[0]
selection=p.capture_selection(base,current,legacy,child,manifest_raw,child_manifest_raw,inventory_raw,baseline_raw,current_raw)
APP,PACKAGES="/synthetic-current-source","/synthetic-current-packages"
def capture(row,index):
    app=row["path"].startswith("app/");root,relative=(APP,row["path"][4:])if app else(PACKAGES,row["path"][9:])
    return dict(logicalPath=row["path"],url=base.source_url(root,relative),**{k:row[k]for k in("bytes","LF","sha256","gitBlob")},
        identity=["1",str(1000+index),str(os.getuid()),"20",str(stat.S_IFREG|0o644),"1",str(row["bytes"]),"100","100"])
captures=[capture(row,i)for i,row in enumerate(selection["childSelection"]["rows"])]
INDEX={row["logicalPath"]:row for row in captures}
REGISTRY=dict(inputs=captures,bareBindings=[dict(parentURL=INDEX[e["parent"]]["url"],specifier=e["specifier"],targetURL=INDEX[e["target"]]["url"])
    for e in selection["childSelection"]["bareBindings"]],runtime=dict(node="24.19.0",platform="darwin",arch="arm64",nodeSha256=legacy.NODE_SHA,
    nodeIdentity=["1","90",str(os.getuid()),"20",str(stat.S_IFREG|0o755),"1",str(legacy.NODE_BYTES),"100","100"]),
    sourceRowsSha256=p.CHILD_SEAL,applicationRoot=APP,packageRoot=PACKAGES,sourceIdentitiesRead=False,sourcesCopied=False,nativeExecuted=False,authority="NONE")
EXTRA=[capture(row,700+i)for i,row in enumerate(selection["extraRows"])]
CONTEXT=dict(runId="a"*64,laneId="supervisor")
ROOT=dict(path="/synthetic-current-parent",identity=["1","800",str(os.getuid()),"20",str(stat.S_IFDIR|0o700)])
def args():
    return dict(base=base,current=current,legacy=legacy,child=child,registry=copy.deepcopy(REGISTRY),extra_captures=copy.deepcopy(EXTRA),
        manifest_raw=manifest_raw,child_manifest_raw=child_manifest_raw,inventory_raw=inventory_raw,baseline_raw=baseline_raw,current_raw=current_raw)
def planner(values=None):return p.prepare_from_registry_data(**(args()if values is None else values))
def child_bundle(plans,role,n,lane="lane.one"):
    root=dict(path="/synthetic-current-child-"+str(n),identity=["1",str(900+n),str(os.getuid()),"20",str(stat.S_IFDIR|0o700)])
    result=plans.plan_child(role,dict(runId=CONTEXT["runId"],laneId=lane),root)
    value=base._private_json(result["profileBytes"],524288)
    ref=dict(role=role,laneId=lane,path="/synthetic-current-profile-"+str(n)+".json",sha256=result["profileSha256"],
        entryURL=value["entryURL"],preloaderURL=value["preloaderURL"],rootPath=root["path"],rootIdentity=root["identity"])
    return dict(reference=ref,profileBytes=result["profileBytes"])
def pair(plans):return[child_bundle(plans,"PAYER",1),child_bundle(plans,"SERVICE",2)]
def actual_child_factory():
    return child.prepare_from_registry_data(base,current,legacy,copy.deepcopy(REGISTRY),child_manifest_raw,inventory_raw,baseline_raw,current_raw)
class Profiles(unittest.TestCase):maxDiff=300
names=[]
def check(name,fn):
    names.append(name)
    def body(self):fn(self)
    body.__name__="test_"+name;setattr(Profiles,body.__name__,body)
def exact_child(self,role):
    plans=planner();bundle=child_bundle(plans,role,1);ref=bundle["reference"]
    actual=actual_child_factory().plan_child(role,dict(runId=CONTEXT["runId"],laneId=ref["laneId"]),
        dict(path=ref["rootPath"],identity=ref["rootIdentity"]))
    self.assertEqual(bundle["profileBytes"],actual["profileBytes"])
    value=base._private_json(bundle["profileBytes"],524288)
    self.assertEqual(value["profileVersion"],4);self.assertEqual(value["sourceRowsSha256"],p.CHILD_SEAL)
    self.assertEqual(len(value["inputs"]),557);self.assertNotIn("childSourceRowsSha256",value)
    self.assertFalse(set(p.EXTRAS).intersection(row["logicalPath"]for row in value["inputs"]))
for role in("PAYER","SERVICE"):
    check("whole_"+role.lower()+"_bytes_equal_genuine_current_v4_producer",lambda self,role=role:exact_child(self,role))
def exact_parent(self):
    plans=planner();children=pair(plans);result=plans.plan_parent(CONTEXT,ROOT,children)
    value=base._private_json(result["profileBytes"],524288)
    self.assertEqual(value["profileVersion"],5);self.assertEqual(value["profileKind"],p.PARENT_KIND)
    self.assertEqual(value["sourceRowsSha256"],p.PARENT_SEAL);self.assertEqual(value["childSourceRowsSha256"],p.CHILD_SEAL)
    self.assertEqual(len(value["inputs"]),564);self.assertEqual(value["childProfiles"],[row["reference"]for row in children])
    self.assertEqual(sum(row["logicalPath"].startswith("app/")for row in value["inputs"]),160)
    self.assertEqual(sum(row["logicalPath"].startswith("packages/")for row in value["inputs"]),404)
    self.assertEqual(result["profileBytes"],p.canonical(value)+b"\n");self.assertEqual(result["profileSha256"],hashlib.sha256(result["profileBytes"]).hexdigest())
    self.assertIn("node:child_process",value["allowedBuiltins"])
    self.assertEqual(value["currentManifestSha256"],child.CURRENT_SHA)
    self.assertEqual(plans.info()["completeChildByteComparisons"],2)
    for field in("sourceIdentitiesAuthenticated","rootIdentitiesAuthenticated","privateChildProfilesAuthenticated","nativeExecuted","privateProfileIsNativeAuthority"):
        self.assertIs(result[field],False)
check("distinct_v5_parent_contains_full_160_404_graph_and_complete_current_children",exact_parent)
def native_source_contract(self):
    selected={row["path"]:row for row in selection["rows"]};actual={}
    for name in native_sources:
        source,_=p.read_owned(repo/name,65536);self.assertEqual(base.pin("app/"+name,source),selected["app/"+name]);actual[name]=source
    preloader=actual["qualification/capacity-native-current-offered-v2.namespace.preload.draft.mjs"]
    self.assertIn(b"profile.profileVersion !== 5",preloader);self.assertIn(b"profileVersion:4",preloader)
    self.assertIn(b"profile.inputs.length !== 564",preloader);self.assertIn(b"currentChildRows.length !== 557",preloader)
    self.assertIn(b"currentManifestSha256",preloader)
    paired=actual["qualification/capacity-native-current-offered-pair-v2.supervisor.draft.mjs"]
    self.assertIn(b"capacity-native-current-payer-v4.worker.draft.mjs",paired)
    self.assertIn(b"capacity-native-current-service-v4.worker.draft.mjs",paired)
    self.assertIn(b"one-reviewed-native-capacity-current-roles-v4",paired)
    self.assertNotIn(b"one-reviewed-native-capacity-paired-workload-v3",paired)
    adapter=actual["qualification/capacity-native-current-offered-adapter-v3.draft.mjs"];entry=actual["qualification/capacity-native-current-offered-v2.entry.draft.mjs"]
    self.assertIn(b"createNativeCapacityCurrentOfferedPairV2 as CREATE_PAIR",adapter)
    self.assertIn(b"createServiceCreditCapacityOfferedWorkloadOwnerCore as CREATE_CORE",adapter)
    self.assertIn(b"createNativeCapacityCurrentOfferedAdapterV3:CREATE",entry)
    self.assertIn(b"owned.stop().then",entry);self.assertNotIn(b"process.exit(",entry)
check("real_parent_pair_adapter_entry_and_preloader_bind_current_v4_children_and_original_stop",native_source_contract)
optimization=None
def maximum_children(self):
    global optimization
    plans=planner();children=[child_bundle(plans,role,2*n+i,"lane."+str(n))for n in range(1,17)for i,role in enumerate(("PAYER","SERVICE"))]
    before=plans.info();seen=dict(largeRowsEncoded=0,wholeExpectedChildrenEncoded=0);original=p.canonical
    def observe(value):
        if type(value)is list and len(value)in(557,564):seen["largeRowsEncoded"]+=1
        if type(value)is dict and value.get("role")in("PAYER","SERVICE")and"inputs"in value:seen["wholeExpectedChildrenEncoded"]+=1
        return original(value)
    p.canonical=observe
    try:result=plans.plan_parent(CONTEXT,ROOT,children)
    finally:p.canonical=original
    after=plans.info();value=base._private_json(result["profileBytes"],524288)
    self.assertEqual(len(value["childProfiles"]),32);self.assertLessEqual(len(result["profileBytes"]),524288)
    self.assertEqual(seen,dict(largeRowsEncoded=0,wholeExpectedChildrenEncoded=0))
    self.assertEqual(after["sharedFieldSerializations"],4);self.assertEqual(after["sharedCanonicalBytes"],before["sharedCanonicalBytes"])
    self.assertLessEqual(after["sharedCanonicalBytes"],1048576)
    self.assertEqual(after["completeChildByteComparisons"]-before["completeChildByteComparisons"],32)
    self.assertEqual(after["wholeExpectedChildBytesMaterialized"],0)
    optimization=dict(completeChildByteComparisons=32,sharedFieldSerializations=4,sharedCanonicalBytes=after["sharedCanonicalBytes"],
        sharedByteLimit=1048576,largeRowsReserializedDuringParentValidation=0,wholeExpectedChildProfilesMaterialized=0,
        parentProfileBytes=len(result["profileBytes"]),nativePerformanceOrPeakHeapMeasured=False)
check("thirty_two_complete_current_child_comparisons_reuse_shared_fields_without_second_whole_copy",maximum_children)
def caller_detached(self):
    values=args();plans=planner(values);first=pair(plans)
    values["registry"]["inputs"][0]["identity"][1]="99999";values["registry"]["runtime"]["nodeIdentity"][1]="99999"
    values["extra_captures"][0]["url"]="file:///different"
    self.assertEqual(pair(plans),first)
check("prepared_tables_runtime_and_extensions_are_detached_from_caller",caller_detached)
def no_claim_upgrade(self):
    values=args();values["registry"]["sourceIdentitiesRead"]=True;plans=planner(values);info=plans.info()
    self.assertFalse(info["sourceFilesReadOnlyVerified"]);self.assertEqual(info["sourceFilesRead"],0)
    self.assertEqual(info["nodeBinaryHashesForContext"],0);self.assertFalse(info["privateRootsOpened"])
    self.assertFalse(info["profilesWritten"]);self.assertFalse(info["nativeExecuted"])
check("declared_registry_read_claim_never_becomes_source_root_or_node_authentication",no_claim_upgrade)
def caller_unchanged(self):
    plans=planner();values=dict(context=copy.deepcopy(CONTEXT),root=copy.deepcopy(ROOT),children=pair(plans));before=copy.deepcopy(values)
    plans.plan_parent(**values);self.assertEqual(values,before)
check("planning_does_not_mutate_caller_context_roots_or_original_child_bundles",caller_unchanged)
def source_overlays_preserved(self):
    plans=planner();value=base._private_json(plans.plan_parent(CONTEXT,ROOT,pair(plans))["profileBytes"],524288)
    sources={row["logicalPath"]:row for row in value["inputs"]}
    for replacement in json.loads(current_raw)["applicationReplacements"]:
        row=replacement["input"];self.assertEqual(sources[row["path"]]["sha256"],row["sha256"])
    self.assertEqual(len(p.EXTRAS),7);self.assertTrue(set(p.EXTRAS).issubset(sources))
check("all_eight_current_runtime_overlays_and_seven_parent_extensions_survive_composition",source_overlays_preserved)
def setat(value,path,replacement):
    for key in path[:-1]:value=value[key]
    value[path[-1]]=replacement
def reject_prepare(name,edit):
    def run(self):
        values=args();edit(values)
        with self.assertRaises(ValueError):planner(values)
    check("preparation_refuses_"+name,run)
reject_prepare("changed_parent_manifest",lambda v:v.update(manifest_raw=manifest_raw+b" "))
reject_prepare("changed_child_manifest",lambda v:v.update(child_manifest_raw=child_manifest_raw+b" "))
reject_prepare("changed_legacy_inventory",lambda v:v.update(inventory_raw=inventory_raw+b" "))
reject_prepare("changed_baseline",lambda v:v.update(baseline_raw=baseline_raw+b" "))
reject_prepare("changed_current_delta",lambda v:v.update(current_raw=current_raw+b" "))
reject_prepare("missing_parent_source",lambda v:v["extra_captures"].pop())
reject_prepare("extra_parent_source",lambda v:v["extra_captures"].append(copy.deepcopy(v["extra_captures"][0])))
reject_prepare("wrong_parent_source_hash",lambda v:v["extra_captures"][0].update(sha256="0"*64))
reject_prepare("redirected_parent_source",lambda v:v["extra_captures"][0].update(url="file:///different"))
reject_prepare("hardlinked_parent_source",lambda v:setat(v,["extra_captures",0,"identity",5],"2"))
reject_prepare("foreign_parent_source_uid",lambda v:setat(v,["extra_captures",0,"identity",2],str(os.getuid()+1)))
reject_prepare("zero_parent_source_inode",lambda v:setat(v,["extra_captures",0,"identity",1],"0"))
reject_prepare("old_child_source_seal",lambda v:v["registry"].update(sourceRowsSha256=legacy.SOURCE_SEAL))
reject_prepare("missing_current_child_source",lambda v:v["registry"]["inputs"].pop())
reject_prepare("reordered_current_child_sources",lambda v:v["registry"]["inputs"].reverse())
reject_prepare("redirected_current_child_binding",lambda v:v["registry"]["bareBindings"][0].update(targetURL="file:///different"))
reject_prepare("wrong_runtime",lambda v:v["registry"]["runtime"].update(node="24.20.0"))
def reject_parent(name,edit):
    def run(self):
        plans=planner();values=dict(context=copy.deepcopy(CONTEXT),root=copy.deepcopy(ROOT),children=pair(plans));edit(values)
        with self.assertRaises(ValueError):plans.plan_parent(**values)
    check("parent_refuses_"+name,run)
reject_parent("empty_children",lambda v:v.update(children=[]))
reject_parent("one_unpaired_child",lambda v:v["children"].pop())
reject_parent("duplicate_role",lambda v:v["children"][1]["reference"].update(role="PAYER"))
reject_parent("duplicate_profile_path",lambda v:v["children"][1]["reference"].update(path=v["children"][0]["reference"]["path"]))
reject_parent("duplicate_digest",lambda v:v["children"][1]["reference"].update(sha256=v["children"][0]["reference"]["sha256"]))
reject_parent("duplicate_root_path",lambda v:v["children"][1]["reference"].update(rootPath=v["children"][0]["reference"]["rootPath"]))
reject_parent("duplicate_physical_root",lambda v:v["children"][1]["reference"].update(rootIdentity=copy.deepcopy(v["children"][0]["reference"]["rootIdentity"])))
reject_parent("parent_root_alias",lambda v:v["children"][0]["reference"].update(rootPath=v["root"]["path"]))
reject_parent("parent_physical_alias",lambda v:v["children"][0]["reference"].update(rootIdentity=copy.deepcopy(v["root"]["identity"])))
reject_parent("profile_path_is_parent_root",lambda v:v["children"][0]["reference"].update(path=v["root"]["path"]))
reject_parent("wrong_child_preloader",lambda v:v["children"][0]["reference"].update(preloaderURL="file:///different"))
reject_parent("wrong_child_entry",lambda v:v["children"][0]["reference"].update(entryURL="file:///different"))
reject_parent("missing_child_field",lambda v:v["children"][0]["reference"].pop("path"))
reject_parent("extra_child_field",lambda v:v["children"][0]["reference"].update(execute=True))
reject_parent("mutable_child_bytes",lambda v:v["children"][0].update(profileBytes=bytearray(v["children"][0]["profileBytes"])))
reject_parent("truncated_child_bytes",lambda v:v["children"][0].update(profileBytes=v["children"][0]["profileBytes"][:-1]))
reject_parent("nonprivate_parent_root",lambda v:setat(v,["root","identity",4],str(stat.S_IFDIR|0o755)))
reject_parent("foreign_parent_uid",lambda v:setat(v,["root","identity",2],str(os.getuid()+1)))
reject_parent("wrong_parent_run",lambda v:v["context"].update(runId="A"*64))
reject_parent("invalid_parent_lane",lambda v:v["context"].update(laneId="bad lane"))
reject_parent("extra_parent_context",lambda v:v["context"].update(execute=True))
def forged_child(name,edit):
    def run(self):
        plans=planner();children=pair(plans);value=base._private_json(children[0]["profileBytes"],524288);edit(value)
        changed=p.canonical(value)+b"\n";children[0]["profileBytes"]=changed
        children[0]["reference"]["sha256"]=hashlib.sha256(changed).hexdigest()
        with self.assertRaisesRegex(ValueError,"EXACT_COMPLETE_CURRENT_V4_CHILD_BYTES"):plans.plan_parent(CONTEXT,ROOT,children)
    check("recomputed_digest_does_not_hide_"+name,run)
forged_child("missing_full_source_row",lambda v:v["inputs"].pop())
forged_child("old_profile_version",lambda v:v.update(profileVersion=3))
forged_child("parent_version_on_child",lambda v:v.update(profileVersion=5))
forged_child("parent_source_seal",lambda v:v.update(sourceRowsSha256=p.PARENT_SEAL))
forged_child("parent_extension_on_child",lambda v:v["inputs"].append(copy.deepcopy(EXTRA[0])))
forged_child("changed_current_manifest",lambda v:v.update(currentManifestSha256="0"*64))
forged_child("changed_run_id",lambda v:v.update(runId="b"*64))
forged_child("changed_last_source_identity",lambda v:setat(v,["inputs",-1,"identity",1],"999999"))
forged_child("changed_last_binding",lambda v:v["bareBindings"][-1].update(targetURL="file:///different"))
forged_child("source_transform",lambda v:v.update(sourceTransform=True))
forged_child("ordinary_namespace",lambda v:v.update(ordinaryInstalledNamespace=True))
forged_child("parent_process_builtin",lambda v:v["allowedBuiltins"].append("node:child_process"))
forged_child("extra_child_source_seal",lambda v:v.update(childSourceRowsSha256=p.CHILD_SEAL))
def seventeenth_pair(self):
    plans=planner();children=[child_bundle(plans,role,2*n+i,"lane."+str(n))for n in range(1,18)for i,role in enumerate(("PAYER","SERVICE"))]
    with self.assertRaises(ValueError):plans.plan_parent(CONTEXT,ROOT,children)
check("seventeenth_complete_pair_does_not_expand_the_source_limit",seventeenth_pair)
def child_factory_closed(self):
    for role in("SUPERVISOR","PAYMENT",True,None):
        with self.assertRaises(ValueError):planner().plan_child(role,CONTEXT,ROOT)
check("child_factory_stays_closed_to_two_current_leaf_roles",child_factory_closed)
def noncanonical(self):
    plans=planner()
    for suffix in(b"",b" "):
        children=pair(plans);changed=children[0]["profileBytes"][:-1]+suffix
        children[0]["profileBytes"]=changed;children[0]["reference"]["sha256"]=hashlib.sha256(changed).hexdigest()
        with self.assertRaisesRegex(ValueError,"EXACT_COMPLETE_CURRENT_V4_CHILD_BYTES"):plans.plan_parent(CONTEXT,ROOT,children)
check("whole_child_canonical_newline_and_whitespace_are_not_repaired",noncanonical)
def subclasses(self):
    calls=[]
    class Hostile(dict):
        def items(self):calls.append(True);raise AssertionError("not called")
    plans=planner()
    with self.assertRaises(ValueError):plans.plan_parent(Hostile(CONTEXT),ROOT,pair(plans))
    values=pair(plans);values[0]=Hostile(values[0])
    with self.assertRaises(ValueError):plans.plan_parent(CONTEXT,ROOT,values)
    self.assertEqual(calls,[])
check("subclass_hooks_are_not_evaluated_for_context_or_child_bundle",subclasses)
if __name__=="__main__":
    output=io.StringIO();result=unittest.TextTestRunner(stream=output,verbosity=0).run(unittest.defaultTestLoader.loadTestsFromTestCase(Profiles))
    unchanged=p.read_owned(path,65536)==(raw,identity(before))
    print(json.dumps(dict(event="CURRENT_OFFERED_PARENT_V2_PROFILE_ACTUAL_DATA_NOT_NATIVE",python=sys.version.split()[0],
        testsRun=result.testsRun,failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),
        successful=result.wasSuccessful() and unchanged,producerUnchanged=unchanged,names=names,sourceProducerSha256=expected,
        parentSourceRowsSha256=p.PARENT_SEAL,childSourceRowsSha256=p.CHILD_SEAL,
        parentApplicationFiles=160,parentPackageFiles=404,childApplicationFiles=153,childPackageFiles=404,
        profileOptimizationData=optimization,auditedEffects=audited,nativeModulesImported=False,SDK=False,SQLite=False,
        keys=False,signatures=False,nonceSearch=False,sockets=False,applicationChildren=0,installedPackageFilesRead=0,
        privateRootsOpened=False,profilesWritten=False,sourceCopies=0,packageCopies=0,managerImported=False,
        currentCleanAllowanceConsumed=False,oldR4AllowanceConsumed=False,authority="NONE")),flush=True)
    if not result.wasSuccessful():sys.stderr.write(output.getvalue())
    sys.exit(0 if result.wasSuccessful() and unchanged else 1)
