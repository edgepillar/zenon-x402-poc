"""Full current capacity-role profile DATA; real Python producers, no native entry.

Application/package/root identities in this fixture are declared DTOs. The
seven real native source files are read as inert text and never imported.
"""
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import stat
import sys
import unittest

repo = Path(__file__).absolute().parents[1]
module_relative = "qualification/native_capacity_current_role_profiles_v4.py"
native_sources = json.loads("[\"qualification/capacity-native-current-namespace-v4.preload-common.draft.mjs\",\"qualification/capacity-native-current-payer-v4.owner.draft.mjs\",\"qualification/capacity-native-current-payer-v4.worker.draft.mjs\",\"qualification/capacity-native-current-payer-v4.namespace.preload.draft.mjs\",\"qualification/capacity-native-current-service-v4.owner.draft.mjs\",\"qualification/capacity-native-current-service-v4.worker.draft.mjs\",\"qualification/capacity-native-current-service-v4.namespace.preload.draft.mjs\"]")
allowed = {str(repo / name) for name in [module_relative, "qualification/native_capacity_current_role_profiles_v4.behavior.py", "qualification/capacity-native-current-roles-v4.inputs.json",
    "qualification/capacity-native-full-graph-v3.inputs.json",
    "qualification/issued-funding-post-native-vertical.inputs-v3.json",
    "qualification/issued-current-close-v4.inputs.json",
    "qualification/recovery_crash_native_profile.py",
    "qualification/issued_current_close_v4_profile.py",
    "qualification/native_capacity_full_profile_v3.py", *native_sources]}
stdlib = str(Path(sys.base_prefix) / "lib" / "python3.12") + "/"
audited = dict(subprocesses=0, sockets=0, sqlite=0, writeOpens=0, outsideSourceReads=0, mutations=0)
def audit(event, args):
    if event in ("subprocess.Popen", "os.system", "os.fork", "os.posix_spawn"):
        audited["subprocesses"] += 1; raise AssertionError("NO_CHILD_IN_CURRENT_PROFILE_DATA")
    if event.startswith("socket."):
        audited["sockets"] += 1; raise AssertionError("NO_SOCKET_IN_CURRENT_PROFILE_DATA")
    if event == "sqlite3.connect":
        audited["sqlite"] += 1; raise AssertionError("NO_SQL_IN_CURRENT_PROFILE_DATA")
    if event in ("os.remove", "os.rename", "os.mkdir", "os.rmdir", "os.link", "os.symlink"):
        audited["mutations"] += 1; raise AssertionError("NO_FILESYSTEM_MUTATION_IN_CURRENT_PROFILE_DATA")
    if event == "open":
        if type(args[2]) is int and args[2] & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC):
            audited["writeOpens"] += 1; raise AssertionError("NO_WRITE_OPEN_IN_CURRENT_PROFILE_DATA")
        if type(args[0]) is str and args[0] not in allowed and not (
                args[0].startswith(stdlib) and "site-packages" not in Path(args[0]).parts):
            audited["outsideSourceReads"] += 1; raise AssertionError("ONLY_DECLARED_SOURCE_OR_STDLIB_READS")
sys.addaudithook(audit)
if (not (sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode)
        or os.environ.get("X402_CURRENT_CAPACITY_PROFILE_DATA_SELECTION") != "current-capacity-profile-data-v4"):
    raise ValueError("EXACT_ISOLATED_CURRENT_PROFILE_DATA_SELECTION")
path = repo / module_relative
def identity(s):
    return [str(v) for v in (s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)]
for at in (path, *path.parents):
    if at.is_symlink(): raise ValueError("CURRENT_PRODUCER_LINK")
before = path.lstat()
if not stat.S_ISREG(before.st_mode) or before.st_uid != os.getuid() or before.st_nlink != 1 or before.st_size > 65536:
    raise ValueError("CURRENT_PRODUCER_IDENTITY")
with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
    if identity(os.fstat(stream.fileno())) != identity(before): raise ValueError("CURRENT_PRODUCER_OPEN")
    raw = stream.read(65537)
    if len(raw) != before.st_size or identity(os.fstat(stream.fileno())) != identity(before): raise ValueError("CURRENT_PRODUCER_READ")
expected = os.environ.get("X402_CURRENT_CAPACITY_PROFILE_PRODUCER_SHA256")
if hashlib.sha256(raw).hexdigest() != expected: raise ValueError("CURRENT_PRODUCER_PIN")
spec = importlib.util.spec_from_file_location("actual_current_role_profile_v4", path)
p = importlib.util.module_from_spec(spec); sys.modules[spec.name] = p
exec(spec.loader.source_to_code(raw, str(path)), p.__dict__)
base, current, legacy = p.load_dependencies(repo)
manifest_raw = p.read_owned(repo / p.MANIFEST, 65536)[0]
inventory_raw = p.read_owned(repo / legacy.INVENTORY, 65536)[0]
baseline_raw = p.read_owned(repo / legacy.BASELINE, 262144)[0]
current_raw = p.read_owned(repo / p.CURRENT, 65536)[0]
selection = p.capture_selection(base, current, legacy, manifest_raw, inventory_raw, baseline_raw, current_raw)
old_selection = legacy.capture_selection(base, inventory_raw, baseline_raw)
APP, PACKAGES = "/synthetic-current-source", "/synthetic-current-packages"
def capture(row, index):
    is_app = row["path"].startswith("app/"); root, relative = (APP,row["path"][4:]) if is_app else (PACKAGES,row["path"][9:])
    return dict(logicalPath=row["path"],url=base.source_url(root,relative),
        **{k:row[k] for k in ("bytes","LF","sha256","gitBlob")},
        identity=["1",str(1000+index),str(os.getuid()),"20",str(stat.S_IFREG|0o644),"1",str(row["bytes"]),"100","100"])
inputs = [capture(row,i) for i,row in enumerate(selection["rows"])]
INDEX = {row["logicalPath"]:row for row in inputs}
REGISTRY = dict(inputs=inputs,bareBindings=[dict(parentURL=INDEX[e["parent"]]["url"],specifier=e["specifier"],targetURL=INDEX[e["target"]]["url"])
    for e in selection["bareBindings"]],runtime=dict(node="24.19.0",platform="darwin",arch="arm64",nodeSha256=legacy.NODE_SHA,
    nodeIdentity=["1","90",str(os.getuid()),"20",str(stat.S_IFREG|0o755),"1",str(legacy.NODE_BYTES),"100","100"]),
    sourceRowsSha256=p.SOURCE_SEAL,applicationRoot=APP,packageRoot=PACKAGES,sourceIdentitiesRead=False,
    sourcesCopied=False,nativeExecuted=False,authority="NONE")
CONTEXT = dict(runId="a"*64,laneId="lane.one")
ROOT = dict(path="/synthetic-current-owned-root",identity=["1","5000",str(os.getuid()),"20",str(stat.S_IFDIR|0o700)])
def args():
    return dict(base=base,current=current,legacy=legacy,registry=copy.deepcopy(REGISTRY),manifest_raw=manifest_raw,
        inventory_raw=inventory_raw,baseline_raw=baseline_raw,current_raw=current_raw)
def planner(values=None):
    return p.prepare_from_registry_data(**(args() if values is None else values))
def profile(role="PAYER", plans=None):
    actual = (planner() if plans is None else plans).plan_child(role,CONTEXT,ROOT)
    return actual,base._private_json(actual["profileBytes"],524288)
class Profiles(unittest.TestCase):
    maxDiff = 300
names = []
def check(name, fn):
    names.append(name)
    def body(self): fn(self)
    body.__name__ = "test_" + name; setattr(Profiles,body.__name__,body)

def full_current(self):
    self.assertEqual(len(selection["rows"]),557); self.assertEqual(p.SOURCE_BYTES,4995543)
    self.assertEqual(sum(r["path"].startswith("app/") for r in selection["rows"]),153)
    self.assertEqual(sum(r["path"].startswith("packages/") for r in selection["rows"]),404)
    self.assertEqual(len(selection["bareBindings"]),16); self.assertNotEqual(p.SOURCE_SEAL,legacy.SOURCE_SEAL)
check("complete_current_graph_has_153_application_and_all_404_package_rows",full_current)
def exact_runtime_overlays(self):
    _,value = profile(); actual={r["logicalPath"]:r for r in value["inputs"]}
    old={r["path"]:r for r in old_selection["rows"]}; delta=json.loads(current_raw)
    self.assertEqual(len(delta["applicationReplacements"]),8)
    for replacement in delta["applicationReplacements"]:
        row=replacement["input"]; self.assertEqual(actual[row["path"]]["sha256"],row["sha256"])
        self.assertEqual(old[row["path"]]["sha256"],replacement["beforeSha256"])
        self.assertNotEqual(actual[row["path"]]["sha256"],old[row["path"]]["sha256"])
    for row in delta["applicationAdditions"]: self.assertEqual(actual[row["path"]]["sha256"],row["sha256"])
check("all_eight_current_runtime_overlays_and_six_additions_reach_real_profile_bytes",exact_runtime_overlays)
def role_contract(self,role):
    result,value=profile(role)
    self.assertEqual(value["profileVersion"],4); self.assertEqual(value["profileKind"],p.SPECS[role]["kind"])
    self.assertEqual(value["role"],role); self.assertEqual(value["sourceRowsSha256"],p.SOURCE_SEAL)
    self.assertEqual(len(value["inputs"]),557); self.assertEqual(value["childProfiles"],[])
    self.assertNotIn("node:child_process",value["allowedBuiltins"])
    self.assertEqual(value["currentManifestSha256"],p.CURRENT_SHA)
    self.assertEqual(value["entryURL"],INDEX[p.SPECS[role]["entry"]]["url"])
    self.assertEqual(value["preloaderURL"],INDEX[p.SPECS[role]["preloader"]]["url"])
    self.assertEqual(result["profileBytes"],p.canonical(value)+b"\n")
    self.assertEqual(result["profileSha256"],hashlib.sha256(result["profileBytes"]).hexdigest())
    self.assertLessEqual(result["profileBytesCount"],524288)
    for name in ("sourceIdentitiesAuthenticated","rootIdentitiesAuthenticated","privateProfileIsNativeAuthority","nativeExecuted"):
        self.assertIs(result[name],False)
for role in ("PAYER","SERVICE"):
    check("canonical_current_"+role.lower()+"_profile_matches_exact_leaf_preloader_contract",lambda self,role=role:role_contract(self,role))
def native_source_contract(self):
    rows={r["path"]:r for r in selection["rows"]}
    actual={}
    for relative in native_sources:
        native,_=p.read_owned(repo/relative,65536); self.assertEqual(base.pin("app/"+relative,native),rows["app/"+relative])
        actual[relative]=native
    common=actual["qualification/capacity-native-current-namespace-v4.preload-common.draft.mjs"]
    self.assertIn(b"profile.profileVersion !== 4",common); self.assertIn(b"profile.inputs.length !== 557",common)
    self.assertIn(b"applications !== 153",common); self.assertIn(b"profile.childProfiles.length !== 0",common)
    self.assertNotIn(b"SUPERVISOR",common); self.assertNotIn(b"node:child_process",common)
    service=actual["qualification/capacity-native-current-service-v4.owner.draft.mjs"]
    self.assertIn(b"./issued-current-close-v4-rpc.fixture.mjs",service)
    self.assertNotIn(b"import('./issued-funding-post-native-rpc-peer.fixture.draft.mjs')",service)
check("real_native_leaf_sources_require_current_graph_and_current_rpc_without_parent_authority",native_source_contract)
def detach_registry(self):
    values=args(); plans=planner(values); first=profile(plans=plans)[0]["profileBytes"]
    values["registry"]["inputs"][0]["identity"][1]="99999"; values["registry"]["runtime"]["nodeIdentity"][1]="99999"
    self.assertEqual(profile(plans=plans)[0]["profileBytes"],first)
check("captured_registry_runtime_and_inputs_are_owned_not_mutable_caller_references",detach_registry)
def detach_output(self):
    plans=planner(); info=plans.info(); info["applicationFiles"]=1
    self.assertEqual(plans.info()["applicationFiles"],153)
    result,_=profile(plans=plans); result["profileBytes"]=b"changed"
    self.assertNotEqual(profile(plans=plans)[0]["profileBytes"],b"changed")
check("returned_information_and_result_mutation_do_not_change_future_profiles",detach_output)
def no_observation_upgrade(self):
    values=args(); values["registry"]["sourceIdentitiesRead"]=True; plans=planner(values)
    self.assertFalse(plans.info()["sourceFilesReadOnlyVerified"]); self.assertEqual(plans.info()["sourceFilesRead"],0)
    self.assertEqual(plans.info()["nodeBinaryHashesForContext"],0)
check("caller_read_claim_is_never_physical_source_or_node_observation",no_observation_upgrade)
optimization=None
def cached_roles(self):
    global optimization
    plans=planner(); before=plans.info(); seen={"largeRowsEncoded":0}
    original=p.canonical
    def observe(value):
        if type(value) is list and len(value)==557: seen["largeRowsEncoded"]+=1
        return original(value)
    p.canonical=observe; bytes_total=0
    try:
        for lane in range(16):
            for role in ("PAYER","SERVICE"):
                result=plans.plan_child(role,dict(runId="a"*64,laneId="lane."+str(lane)),ROOT)
                self.assertLessEqual(result["profileBytesCount"],524288); bytes_total+=result["profileBytesCount"]
    finally: p.canonical=original
    after=plans.info()
    self.assertEqual(seen["largeRowsEncoded"],0); self.assertEqual(after["sharedFieldSerializations"],3)
    self.assertEqual(after["sharedCanonicalBytes"],before["sharedCanonicalBytes"])
    self.assertLessEqual(after["sharedCanonicalBytes"],1048576)
    self.assertEqual(after["profilesPlanned"],32); self.assertEqual(after["sourceOrPackageTreeCopies"],0)
    optimization=dict(profilesGeneratedSequentially=32,sharedFieldSerializations=3,sharedCanonicalBytes=after["sharedCanonicalBytes"],
        completeSourceRows=557,largeRowsReserializedDuringRolePlanning=0,totalReturnedProfileBytes=bytes_total,
        individualProfileMaximum=524288,physicalPeakHeapOrNativePerformanceMeasured=False)
check("thirty_two_current_role_profiles_share_complete_source_fields_without_reserializing_them",cached_roles)
def old_graph_refused(self):
    with self.assertRaises(ValueError):
        legacy.validate_registry_data(base,REGISTRY,inventory_raw,baseline_raw)
    for old in (inventory_raw,current_raw):
        with self.assertRaisesRegex(ValueError,"CURRENT_ROLE_MANIFEST_PIN"):
            p.capture_selection(base,current,legacy,old,inventory_raw,baseline_raw,current_raw)
check("old_r4_registry_and_clean_selection_cannot_be_relabelled_as_current_capacity_roles",old_graph_refused)
def immutable_caller(self):
    plans=planner(); ctx=copy.deepcopy(CONTEXT); root=copy.deepcopy(ROOT); before=copy.deepcopy((ctx,root))
    plans.plan_child("PAYER",ctx,root); self.assertEqual((ctx,root),before)
check("child_planning_does_not_mutate_context_or_root_data",immutable_caller)

def setat(value,path,replacement):
    for key in path[:-1]: value=value[key]
    value[path[-1]]=replacement
def refuse_registry(name,edit):
    def fn(self):
        values=args();edit(values)
        with self.assertRaises(ValueError):planner(values)
    check("refuses_"+name,fn)
refuse_registry("changed_selection_bytes",lambda v:v.update(manifest_raw=manifest_raw+b" "))
refuse_registry("changed_current_runtime_delta",lambda v:v.update(current_raw=current_raw+b" "))
refuse_registry("changed_legacy_inventory",lambda v:v.update(inventory_raw=inventory_raw+b" "))
refuse_registry("changed_immutable_baseline",lambda v:v.update(baseline_raw=baseline_raw+b" "))
refuse_registry("old_source_seal",lambda v:v["registry"].update(sourceRowsSha256=legacy.SOURCE_SEAL))
refuse_registry("missing_last_source",lambda v:v["registry"]["inputs"].pop())
refuse_registry("extra_source",lambda v:v["registry"]["inputs"].append(copy.deepcopy(v["registry"]["inputs"][0])))
refuse_registry("reordered_source_rows",lambda v:v["registry"]["inputs"].reverse())
refuse_registry("changed_last_source_digest",lambda v:v["registry"]["inputs"][-1].update(sha256="0"*64))
refuse_registry("redirected_source_url",lambda v:v["registry"]["inputs"][0].update(url="file:///different"))
refuse_registry("hardlinked_source_data",lambda v:setat(v,["registry","inputs",0,"identity",5],"2"))
refuse_registry("foreign_source_uid",lambda v:setat(v,["registry","inputs",0,"identity",2],str(os.getuid()+1)))
refuse_registry("zero_source_inode",lambda v:setat(v,["registry","inputs",0,"identity",1],"0"))
refuse_registry("noncanonical_source_identity",lambda v:setat(v,["registry","inputs",0,"identity",0],"01"))
refuse_registry("oversized_source_identity",lambda v:setat(v,["registry","inputs",0,"identity",0],str(2**64)))
refuse_registry("directory_as_source_file",lambda v:setat(v,["registry","inputs",0,"identity",4],str(stat.S_IFDIR|0o700)))
refuse_registry("redirected_bare_binding",lambda v:v["registry"]["bareBindings"][0].update(targetURL="file:///different"))
refuse_registry("missing_bare_binding",lambda v:v["registry"]["bareBindings"].pop())
refuse_registry("wrong_node_digest",lambda v:v["registry"]["runtime"].update(nodeSha256="0"*64))
refuse_registry("wrong_node_version",lambda v:v["registry"]["runtime"].update(node="24.20.0"))
refuse_registry("wrong_node_identity_size",lambda v:setat(v,["registry","runtime","nodeIdentity",6],"1"))
refuse_registry("non_executable_node",lambda v:setat(v,["registry","runtime","nodeIdentity",4],str(stat.S_IFREG|0o600)))
refuse_registry("source_copy_claim",lambda v:v["registry"].update(sourcesCopied=True))
refuse_registry("native_execution_claim",lambda v:v["registry"].update(nativeExecuted=True))
refuse_registry("authority_claim",lambda v:v["registry"].update(authority="NATIVE"))
refuse_registry("extra_registry_authority",lambda v:v["registry"].update(nativeAllowanceGranted=True))

def reject_child(name,edit):
    def fn(self):
        values=dict(role="PAYER",context=copy.deepcopy(CONTEXT),root=copy.deepcopy(ROOT));edit(values)
        with self.assertRaises(ValueError):planner().plan_child(**values)
    check("child_refuses_"+name,fn)
reject_child("supervisor_role",lambda v:v.update(role="SUPERVISOR"))
reject_child("unknown_role",lambda v:v.update(role="PAYMENT"))
reject_child("boolean_role",lambda v:v.update(role=True))
reject_child("changed_run_id",lambda v:v["context"].update(runId="A"*64))
reject_child("invalid_lane",lambda v:v["context"].update(laneId="bad lane"))
reject_child("extra_context_authority",lambda v:v["context"].update(execute=True))
reject_child("missing_root_identity",lambda v:v["root"].pop("identity"))
reject_child("nonprivate_root_mode",lambda v:setat(v,["root","identity",4],str(stat.S_IFDIR|0o755)))
reject_child("foreign_root_uid",lambda v:setat(v,["root","identity",2],str(os.getuid()+1)))
reject_child("relative_root",lambda v:v["root"].update(path="relative"))
def subclass_rejected(self):
    calls=[]
    class Hostile(dict):
        def items(self):calls.append(True);raise AssertionError("not called")
    with self.assertRaises(ValueError):planner().plan_child("PAYER",Hostile(CONTEXT),ROOT)
    self.assertEqual(calls,[])
check("subclass_hooks_are_rejected_without_evaluation",subclass_rejected)
if __name__=="__main__":
    stream=io.StringIO(); result=unittest.TextTestRunner(stream=stream,verbosity=0).run(unittest.defaultTestLoader.loadTestsFromTestCase(Profiles))
    unchanged=p.read_owned(path,65536)==(raw,identity(before))
    print(json.dumps(dict(event="CURRENT_CAPACITY_V4_FULL_ROLE_PROFILE_ACTUAL_DATA_NOT_NATIVE",python=sys.version.split()[0],
        testsRun=result.testsRun,failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),
        successful=result.wasSuccessful() and unchanged,producerUnchanged=unchanged,names=names,
        sourceProducerSha256=expected,sourceRowsSha256=p.SOURCE_SEAL,applicationFiles=153,packageFiles=404,sourceRows=557,
        profileOptimizationData=optimization,auditedEffects=audited,
        SDK=False,SQLite=False,keys=False,signatures=False,nonceSearch=False,sockets=False,children=False,
        nativeModulesImported=False,installedPackageFilesRead=0,privateRootsOpened=False,profilesWritten=False,
        sourceCopies=0,packageCopies=0,managerImported=False,nativeAllowanceConsumed=False,authority="NONE")),flush=True)
    if not result.wasSuccessful():sys.stderr.write(stream.getvalue())
    sys.exit(0 if result.wasSuccessful() and unchanged else 1)
