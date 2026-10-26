"""Current V6/V7 RPC-rebound managed pipeline DATA; no installed package or native entry execution."""
import argparse
import ast
import copy
import hashlib
import importlib.util
import inspect
import io
import json
import os
from pathlib import Path
import stat
import sys
import unittest
import types

repo=Path(__file__).absolute().parents[1]
LAUNCH="qualification/capacity-native-current-offered-v6.launch-inputs.json"
meta_names=[
 "qualification/native_capacity_current_offered_pipeline_v5.behavior.py",LAUNCH,
 "qualification/native_capacity_current_offered_parent_v6.py","qualification/capacity-native-current-offered-parent-v6.inputs.json",
 "qualification/native_capacity_current_role_profiles_v7.py","qualification/capacity-native-current-roles-v7.inputs.json",
 "qualification/native_capacity_current_role_profiles_v5.py","qualification/capacity-native-current-roles-v5.inputs.json",
 "qualification/native_capacity_current_role_profiles_v4.py","qualification/capacity-native-current-roles-v4.inputs.json",
 "qualification/issued_current_close_v5_profile.py","qualification/run-issued-current-close-v5.source.py",
 "qualification/issued_current_close_v4_profile.py","qualification/issued-current-close-v4.inputs.json",
 "qualification/issued-current-close-v5.inputs.json","qualification/native_capacity_full_profile_v3.py",
 "qualification/capacity-native-full-graph-v3.inputs.json","qualification/recovery_crash_native_profile.py",
 "qualification/issued-funding-post-native-vertical.inputs-v3.json","qualification/capacity-native-current-offered-v2.plan.json",
 "qualification/native_capacity_current_offered_pipeline_v1.behavior.py",
 "qualification/native_capacity_current_offered_resource_v1.py","qualification/run-capacity-native-current-offered-v2.local.py"]
launch_raw=(repo/LAUNCH).read_bytes();launch_sha=hashlib.sha256(launch_raw).hexdigest();launch=json.loads(launch_raw)
meta_names.extend(row["path"]for row in launch["pythonControls"])
RETAINED_CONTROL_PINS = [{'path': 'qualification/capacity-native-current-roles-v6.inputs.json', 'bytes': 8274, 'LF': 212, 'sha256': '7ea65eab5c2c9c831d073b583636780d554edb85610de7c45cf5e7c702be8efb', 'gitBlob': 'a8002573172384acd5d05090253edf3885e76c53'}, {'path': 'qualification/native_capacity_current_role_profiles_v6.py', 'bytes': 16701, 'LF': 164, 'sha256': '0db4e53f09d12b90a3bbef25c1702f11368b4f067da05f30f022e7119af3c9d3', 'gitBlob': '5a907bb743af80d5e53f61f24cb11935dd0566e6'}, {'path': 'qualification/native_capacity_current_offered_resource_v4.py', 'bytes': 13667, 'LF': 219, 'sha256': '45095fdf2e4ff7de45641820da936be9acea6caaf82cea010306d7c6da2d44b1', 'gitBlob': '80d0efaaf09eb3c78ed295cd6db77996288ccb39'}, {'path': 'qualification/run-capacity-native-current-offered-v5.local.py', 'bytes': 44978, 'LF': 720, 'sha256': '0054a025fb6e50398c0edf47b71e9aa4562791a12588bdc6a4253079a470dd24', 'gitBlob': '275d1a2dc2eba9582450d6113f966345bc038d38'}]
meta_names.extend(row["path"]for row in RETAINED_CONTROL_PINS)
allowed={str(repo/name)for name in meta_names}
stdlib=str(Path(sys.base_prefix)/"lib"/"python3.12")+"/"
effects=dict(children=0,sockets=0,sqlite=0,writeOpens=0,outsideSourceReads=0,mutations=0)
recheck_phase=False;recheck_opens=[]
def audit(event,args):
    if event in("subprocess.Popen","os.system","os.fork","os.posix_spawn"):
        effects["children"]+=1;raise AssertionError("NO_CURRENT_PIPELINE_NATIVE_CHILD")
    if event.startswith("socket."):effects["sockets"]+=1;raise AssertionError("NO_CURRENT_PIPELINE_SOCKET")
    if event=="sqlite3.connect":effects["sqlite"]+=1;raise AssertionError("NO_CURRENT_PIPELINE_SQL")
    if event in("os.remove","os.rename","os.mkdir","os.rmdir","os.link","os.symlink"):
        effects["mutations"]+=1;raise AssertionError("NO_CURRENT_PIPELINE_MUTATION")
    if event=="open":
        if recheck_phase:recheck_opens.append(args[0])
        if type(args[2])is int and args[2]&(os.O_WRONLY|os.O_RDWR|os.O_CREAT|os.O_TRUNC):
            effects["writeOpens"]+=1;raise AssertionError("NO_CURRENT_PIPELINE_WRITE")
        if type(args[0])is str and args[0]not in allowed and not(args[0].startswith(stdlib)and"site-packages"not in Path(args[0]).parts):
            effects["outsideSourceReads"]+=1;raise AssertionError("ONLY_CURRENT_PIPELINE_SOURCE_STDLIB")
sys.addaudithook(audit)
if not(sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode)or os.environ.get("X402_CURRENT_V6_PIPELINE_DATA_SELECTION")!="complete-v6-v7-rpc-rebound-pipeline-data-only":
    raise ValueError("EXPLICIT_CURRENT_PIPELINE_DATA")
if launch_sha!=os.environ.get("X402_CURRENT_V6_LAUNCH_MANIFEST_SHA256"):raise ValueError("EXPLICIT_CURRENT_LAUNCH_DIGEST")
pins={row["path"]:row for row in launch["pythonControls"]}
if set(pins).intersection(row["path"]for row in RETAINED_CONTROL_PINS):raise ValueError("NO_RETAINED_CONTROL_SHADOWING")
pins.update({row["path"]:row for row in RETAINED_CONTROL_PINS})
def load_control(relative,label):
    path=repo/relative;raw=path.read_bytes()
    selected=pins[relative]
    if hashlib.sha256(raw).hexdigest()!=selected["sha256"]or len(raw)!=selected["bytes"]:raise ValueError("EXACT_CURRENT_PIPELINE_CODE")
    spec=importlib.util.spec_from_file_location(label,path);value=importlib.util.module_from_spec(spec);sys.modules[label]=value
    exec(spec.loader.source_to_code(raw,str(path)),value.__dict__);return value
p=load_control("qualification/native_capacity_current_offered_parent_v6.py","pipeline_v2_actual_parent")
deps=p.load_dependencies(repo);base,legacy,child,child_deps=deps
selection=p.capture_selection(repo,deps,(repo/p.MANIFEST).read_bytes())
allowed.update(str(repo/row["path"][4:])for row in selection["rows"]if row["path"].startswith("app/"))
resource=load_control("qualification/native_capacity_current_offered_resource_v5.py","pipeline_v2_actual_resource")
command=load_control("qualification/native_capacity_current_offered_command_v5.py","pipeline_v2_actual_command")
capture=load_control("qualification/native_capacity_current_offered_capture_v5.py","pipeline_v2_actual_capture")
launcher=load_control("qualification/run-capacity-native-current-offered-v6.local.py","pipeline_v2_actual_launcher")
WORKLOAD=json.loads((repo/"qualification/capacity-native-current-offered-v2.plan.json").read_bytes())
APP,PACKAGES="/synthetic-current-source","/synthetic-current-packages"
def source_capture(row,index):
    root,relative=(APP,row["path"][4:])if row["path"].startswith("app/")else(PACKAGES,row["path"][9:])
    return dict(logicalPath=row["path"],url=base.source_url(root,relative),**{k:row[k]for k in("bytes","LF","sha256","gitBlob")},
        identity=["1",str(1000+index),str(os.getuid()),"20",str(stat.S_IFREG|0o644),"1",str(row["bytes"]),"100","100"])
captured=[source_capture(row,i)for i,row in enumerate(selection["childSelection"]["rows"])]
INDEX={row["logicalPath"]:row for row in captured}
REGISTRY=dict(inputs=captured,bareBindings=[dict(parentURL=INDEX[e["parent"]]["url"],specifier=e["specifier"],targetURL=INDEX[e["target"]]["url"])for e in selection["childSelection"]["bareBindings"]],
    runtime=dict(node="24.19.0",platform="darwin",arch="arm64",nodeSha256=legacy.NODE_SHA,nodeIdentity=["1","90",str(os.getuid()),"20",str(stat.S_IFREG|0o755),"1",str(legacy.NODE_BYTES),"100","100"]),
    sourceRowsSha256=p.CHILD_SEAL,applicationRoot=APP,packageRoot=PACKAGES,sourceIdentitiesRead=False,sourcesCopied=False,nativeExecuted=False,authority="NONE")
EXTRA=[source_capture(row,700+i)for i,row in enumerate(selection["extraRows"])]
STORE="/synthetic-current-store";TASK_ROOT=STORE+"/tasks/"+"2"*32+"/scratch"
ROOT=dict(path=TASK_ROOT,identity=["1","800",str(os.getuid()),"20",str(stat.S_IFDIR|0o700)])
RUN="a"*64
def planner(application_root=APP,package_root=PACKAGES):
    registry=copy.deepcopy(REGISTRY);extras=copy.deepcopy(EXTRA)
    if (application_root,package_root)!=(APP,PACKAGES):
        for row in registry["inputs"]+extras:
            root,relative=(application_root,row["logicalPath"][4:])if row["logicalPath"].startswith("app/")else(package_root,row["logicalPath"][9:])
            row["url"]=base.source_url(root,relative)
        indexed={row["logicalPath"]:row for row in registry["inputs"]}
        registry["bareBindings"]=[dict(parentURL=indexed[e["parent"]]["url"],specifier=e["specifier"],targetURL=indexed[e["target"]]["url"])
            for e in selection["childSelection"]["bareBindings"]]
        registry.update(applicationRoot=application_root,packageRoot=package_root)
    return p._Planner._create(base,legacy,child,registry,extras,selection,False)
def command_case(workload=None,application_root=APP,package_root=PACKAGES):
    value=copy.deepcopy(WORKLOAD if workload is None else workload);plans=planner(application_root,package_root);children=[]
    for n,lane in enumerate(value["laneIds"],1):
        for i,role in enumerate(("PAYER","SERVICE")):
            root=dict(path=TASK_ROOT+"/lanes/"+format(n,"02d")+"/"+role.lower(),identity=["1",str(900+2*n+i),str(os.getuid()),"20",str(stat.S_IFDIR|0o700)])
            built=plans.plan_child(role,dict(runId=RUN,laneId=lane),root);dto=base._private_json(built["profileBytes"],524288)
            children.append(dict(reference=dict(role=role,laneId=lane,path=STORE+"/objects/"+built["profileSha256"],sha256=built["profileSha256"],
                entryURL=dto["entryURL"],preloaderURL=dto["preloaderURL"],rootPath=root["path"],rootIdentity=root["identity"]),profileBytes=built["profileBytes"]))
    assembly=command.assemble(plans,resource,value,RUN,ROOT,children)
    def retained(raw):return dict(path=STORE+"/objects/"+hashlib.sha256(raw).hexdigest(),sha256=hashlib.sha256(raw).hexdigest(),raw=raw)
    return dict(planner=plans,resource=resource,workload=value,effects=assembly["resourcePlan"],repo=application_root,node="/synthetic-node24",
        task_root=TASK_ROOT,parent_input=retained(assembly["parentProfile"]["profileBytes"]),entry_input=retained(assembly["entryPlan"]["planBytes"]),run_id=RUN,children=children)
CASE=command_case()
def case():return{k:(v if k in("planner","resource")else copy.deepcopy(v))for k,v in CASE.items()}
class Pipeline(unittest.TestCase):maxDiff=400
names=[];summary={}
def check(name,fn):
    def body(self):fn(self)
    setattr(Pipeline,"test_"+name,body);names.append(name)
def full(self):
    value=command.plan(**case());profile=value["sourceProfile"]
    self.assertEqual(profile["profileVersion"],9);self.assertEqual(len(profile["inputs"]),588)
    self.assertEqual(profile["childSourceRowsSha256"],p.CHILD_SEAL);self.assertEqual(len(profile["childProfiles"]),2)
    self.assertEqual(value["argv"][-2],APP+"/"+command.ENTRY);self.assertEqual(value["envDelta"]["X402_NATIVE_CAPACITY_RUN_SCOPE"],command.NATIVE_SCOPE)
    self.assertEqual(value["stdoutLimit"],458752);self.assertFalse(value["summary"]["nativeCommandExecuted"])
check("whole_current_parent_entry_and_exact_v4_command_are_bound",full)

for label,application_root,package_root in[
 ("at_repository","/synthetic@source","/synthetic-packages"),
 ("space_repository","/synthetic source","/synthetic-packages"),
 ("at_and_space_repository","/synthetic @ source/current app","/synthetic-packages"),
 ("at_parent_repository","/synthetic@owner/current-source","/synthetic-packages"),
 ("at_packages","/synthetic-source","/synthetic@packages"),
 ("scoped_packages","/synthetic-source","/synthetic-packages/@vendor/current"),
 ("mixed_roots","/synthetic @ owner/current app","/synthetic @ vendor/packages"),
 ("canonical_plain","/synthetic-source","/synthetic-packages")]:
    def run(self,application_root=application_root,package_root=package_root,label=label):
        value=command_case(application_root=application_root,package_root=package_root)
        result=command.plan(**value);profile=result["sourceProfile"]
        self.assertEqual(profile["entryURL"],"file://"+application_root.replace(" ","%20")+"/"+command.ENTRY)
        self.assertEqual(profile["preloaderURL"],"file://"+application_root.replace(" ","%20")+"/"+command.PRELOAD)
        self.assertEqual(result["argv"][-2],application_root+"/"+command.ENTRY)
        self.assertIn("--import="+application_root+"/"+command.PRELOAD,result["argv"])
        self.assertEqual(len(profile["inputs"]),588)
        self.assertTrue(any("/@vendor/"in row["url"]or row["url"].startswith("file://"+package_root.replace(" ","%20")+"/")
            for row in profile["inputs"]if row["logicalPath"].startswith("packages/")))
        summary.setdefault("currentCanonicalSourceRootCases",[]).append(label)
    check("genuine_current_profiles_bind_canonical_source_roots_"+label,run)
def foreign_source_root(self):
    value=command_case(application_root="/synthetic @ owner/current app",package_root="/synthetic-packages")
    value["repo"]="/synthetic @ other/current app"
    with self.assertRaisesRegex(ValueError,"^CURRENT_COMMAND_SOURCE_ROOT$"):command.plan(**value)
check("genuine_at_space_profile_refuses_a_different_command_source_root",foreign_source_root)
for label,root in[("percent","/synthetic%40source"),("fragment","/synthetic#source"),("authority","//synthetic-source")]:
    def run(self,root=root):
        with self.assertRaises(ValueError):command_case(application_root=root)
    check("canonical_source_contract_still_refuses_"+label,run)
def all_32(self):
    work=copy.deepcopy(WORKLOAD);work["laneIds"]=["lane."+str(i)for i in range(16)];work["recordingLimits"]["maxInFlightPerPhase"]=16
    work["recordingLimits"]["maxSamplesPerPhase"]=256
    value=command.plan(**command_case(work));self.assertEqual(value["summary"]["childProfiles"],32)
    self.assertEqual(len(value["sourceProfile"]["inputs"]),588)
    summary["completeChildProfilesPlannedAndBound"]=32
check("all_32_complete_v7_profiles_bind_to_the_full_v6_parent_and_command",all_32)
def headers(self):
    effects=resource.resource_plan(WORKLOAD)
    self.assertEqual(effects["sourceSelectionSha256"],launch["profileSelection"]["sha256"])
    self.assertEqual(effects["parentProfileProducerSha256"],pins["qualification/native_capacity_current_offered_parent_v6.py"]["sha256"])
    self.assertEqual(effects["parentProfileVersion"],9);self.assertEqual(effects["childProfileVersion"],7)
    self.assertEqual(effects["parentSourceRows"],588);self.assertEqual(effects["childSourceRows"],577)
    self.assertEqual(effects,launch["effectsCeiling"])
    summary["effectsCeilingFieldsBound"]=len(effects)
check("resource_graph_headers_directly_bind_actual_parent_manifest_and_producer",headers)
for name in resource.resource_plan(WORKLOAD):
    def run(self,name=name):
        value=case();old=value["effects"][name]
        value["effects"][name]=not old if type(old)is bool else old+1 if type(old)is int else "CHANGED"
        with self.assertRaises(ValueError):command.plan(**value)
    check("entire_resource_selection_refuses_changed_"+name,run)
def actual_source(self):
    global recheck_phase
    admitted=launcher.source_admission(str(repo),launch_sha)
    self.assertEqual(admitted["sourceAdmissionFacts"]["applicationFilesVerified"],184)
    self.assertEqual(admitted["sourceAdmissionFacts"]["applicationCodeBytesRetained"],0)
    self.assertFalse(any(Path(name).suffix in(".js",".mjs")for name in admitted["inputs"]))
    before=len(recheck_opens);recheck_phase=True
    try:admitted["unchanged"]()
    finally:recheck_phase=False
    self.assertEqual(recheck_opens[before:],[])
    summary["sourceAdmissionFacts"]=admitted["sourceAdmissionFacts"];summary["actualUnchangedOpenEvents"]=0
check("actual_source_admission_verifies_184_files_and_rechecks_without_source_byte_reads",actual_source)
def identity_refusal(self):
    admitted=launcher.source_admission(str(repo),launch_sha);old=launcher.identity
    target=next(iter(admitted["applicationSources"].values()))
    def changed(s):
        value=old(s)
        if tuple(value)==target:value[-1]=str(int(value[-1])+1)
        return value
    launcher.identity=changed
    try:
        with self.assertRaises(ValueError):admitted["unchanged"]()
    finally:launcher.identity=old
check("identity_drift_refuses_before_effects_without_reopening_application_code",identity_refusal)
def source_cli(self):
    old=sys.stdout;out=io.StringIO();sys.stdout=out
    try:code=launcher.main(["--repo",str(repo),"--manifest-sha256",launch_sha])
    finally:sys.stdout=old
    self.assertEqual(code,0);value=json.loads(out.getvalue())
    self.assertEqual(value["currentApplicationFilesRead"],184);self.assertFalse(value["nativeExecuted"])
    self.assertFalse(value["nativeControllerQualified"]);self.assertEqual(value["sourceAdmissionFacts"]["applicationCodeBytesRetained"],0)
check("real_default_cli_is_source_only_and_reports_no_native_authority",source_cli)
def private_cli(self):
    with self.assertRaises(ValueError):launcher.main(["--repo",str(repo),"--manifest-sha256",launch_sha,"--packages","/must-not-read-packages"])
check("source_cli_refuses_private_native_arguments_before_source_or_package_access",private_cli)
def native_cli(scope=None,plan=None):
    return ["--repo",str(repo),"--manifest-sha256",launch_sha,"--execute",
        "--native-selection",launcher.NATIVE_SELECTION if scope is None else scope,
        "--approval-launch-sha256",launch_sha,"--approval-plan-sha256",resource.resource_plan(WORKLOAD)["workloadPlanSha256"]if plan is None else plan,
        "--packages","/must-not-read-packages","--node","/must-not-read-node"]
for label,scope,plan in[("old_v2","one-new-approved-native-current-offered-parent-v2",None),
 ("old_v3","one-new-approved-native-current-offered-parent-v3",None),
 ("old_v4","one-new-approved-native-current-offered-parent-v4",None),
 ("old_clean","one-current-clean-issued-close-v4",None),("old_r4","old-r4",None),("changed_plan",None,"0"*64)]:
    def run(self,scope=scope,plan=plan):
        out=io.StringIO();old=sys.stdout;sys.stdout=out
        try:
            with self.assertRaises(ValueError):launcher.main(native_cli(scope,plan))
        finally:sys.stdout=old
    check("real_native_cli_refuses_"+label+"_before_installed_inputs",run)
def private_native_cli(mode):
    args=native_cli()
    args[args.index("--execute")]=mode
    return args+["--manager","/must-not-read-manager","--root","/must-not-read-store",
        "--store-id","a"*32,"--storage-sha256","b"*64,"--volume","/must-not-read-volume",
        "--volume-uuid","11111111-1111-1111-1111-111111111111"]

def early_storage_refusal(self):
    admitted=launcher.source_admission(str(repo),launch_sha)
    context=admitted["controls"]["context"]
    originals=launcher.source_admission,launcher.capacity,context.build_source_context,launcher.execute
    observations=[]
    for mode in("--execute","--pre-native-plan"):
        calls=[];old_stdout=sys.stdout;sys.stdout=io.StringIO()
        def refuse_capacity(volume,uuid,root,common,effects):
            calls.append("capacity")
            self.assertEqual(str(volume),"/must-not-read-volume")
            self.assertEqual(str(root),"/must-not-read-store")
            self.assertIs(effects,admitted["effects"])
            raise ValueError("DECLARED_STORAGE_REFUSAL_BEFORE_INSTALLED_INPUTS")
        def no_context(*args):
            calls.append("installed_context")
            raise AssertionError("STORAGE_REFUSAL_MUST_SKIP_INSTALLED_CONTEXT")
        def no_execute(*args):
            calls.append("execute")
            raise AssertionError("STORAGE_REFUSAL_MUST_SKIP_NATIVE_EXECUTE")
        launcher.source_admission=lambda *_:admitted
        launcher.capacity=refuse_capacity
        context.build_source_context=no_context
        launcher.execute=no_execute
        try:
            with self.assertRaisesRegex(ValueError,"^DECLARED_STORAGE_REFUSAL_BEFORE_INSTALLED_INPUTS$"):
                launcher.main(private_native_cli(mode))
            self.assertEqual(calls,["capacity"])
            observations.append(dict(mode=mode,capacityCalls=1,installedContextCalls=0,nativeExecuteCalls=0))
        finally:
            launcher.source_admission,launcher.capacity,context.build_source_context,launcher.execute=originals
            sys.stdout=old_stdout
    summary["earlyStorageRefusalOrderingData"]=observations
check("actual_main_refuses_at_declared_capacity_before_manager_package_or_node_reads",early_storage_refusal)

def early_storage_acceptance_order(self):
    admitted=launcher.source_admission(str(repo),launch_sha)
    context=admitted["controls"]["context"]
    originals=launcher.source_admission,launcher.native_storage_preflight,context.build_source_context,launcher.execute
    observations=[]
    for mode in("--execute","--pre-native-plan"):
        calls=[];old_stdout=sys.stdout;sys.stdout=io.StringIO()
        def declared_preflight(args,selected_repo,value):
            calls.append("declared_storage_preflight")
            self.assertIs(value,admitted);self.assertEqual(selected_repo,repo)
            return object()
        def stop_context(selected_repo,packages,node):
            calls.append("installed_context_boundary")
            self.assertEqual((selected_repo,packages,node),(str(repo),"/must-not-read-packages","/must-not-read-node"))
            raise ValueError("DECLARED_STOP_BEFORE_INSTALLED_SOURCE_READ")
        def no_execute(*args):
            calls.append("execute")
            raise AssertionError("ORDERING_DATA_MUST_NOT_EXECUTE_NATIVE")
        launcher.source_admission=lambda *_:admitted
        launcher.native_storage_preflight=declared_preflight
        context.build_source_context=stop_context
        launcher.execute=no_execute
        try:
            with self.assertRaisesRegex(ValueError,"^DECLARED_STOP_BEFORE_INSTALLED_SOURCE_READ$"):
                launcher.main(private_native_cli(mode))
            self.assertEqual(calls,["declared_storage_preflight","installed_context_boundary"])
            observations.append(dict(mode=mode,declaredPreflightCalls=1,installedContextBoundaryCalls=1,nativeExecuteCalls=0))
        finally:
            launcher.source_admission,launcher.native_storage_preflight,context.build_source_context,launcher.execute=originals
            sys.stdout=old_stdout
    summary["earlyStorageAcceptanceOrderingData"]=observations
check("actual_main_enters_installed_context_only_after_declared_early_preflight_success",early_storage_acceptance_order)

def declared_capacity_inventory(reserved_values,available_values,*,snapshot_change=False,metadata_change=False,
        membership_change=False,reservation_fault=None,reservation_error=None):
    """Call actual capacity control flow with DATA-only filesystem callbacks."""
    events=dict(reservations=[],snapshots=[],metadataReads=0,available=[],membershipReads=0)
    paths=["/declared-volume/spv2/store"+format(i,"03d")for i in range(1,len(reserved_values)+1)]
    directories={"/declared-volume","/declared-volume/spv2",*paths}
    class DeclaredPath:
        def __init__(self,value):self.value=value
        def __str__(self):return self.value
        def __truediv__(self,other):return DeclaredPath(self.value+"/"+other)
        def __eq__(self,other):return type(other)is DeclaredPath and self.value==other.value
        def __hash__(self):return hash(self.value)
        @property
        def parent(self):return DeclaredPath(self.value.rsplit("/",1)[0])
        def is_symlink(self):return False
        def is_dir(self):return self.value in directories
        def stat(self):
            return types.SimpleNamespace(st_dev=1,st_ino=2,st_uid=os.getuid(),st_gid=20,st_mode=stat.S_IFDIR|0o700,
                st_nlink=1,st_size=0,st_mtime_ns=1,st_ctime_ns=1)
        def iterdir(self):
            if self.value!="/declared-volume/spv2":raise AssertionError("DECLARED_PARENT_ONLY")
            events["membershipReads"]+=1
            return iter([DeclaredPath(p)for p in paths]+([DeclaredPath("/declared-volume/spv2/unexpected")]
                if membership_change and events["membershipReads"]>1 else[]))
    counts={};metadata_counts={}
    def read_metadata(path,maximum):
        value=str(path)
        if not value.endswith("/storage.json")or value.rsplit("/",1)[0]not in paths:raise AssertionError("DECLARED_METADATA_ONLY")
        directory=value.rsplit("/",1)[0];index=paths.index(directory)
        events["metadataReads"]+=1;metadata_counts[directory]=metadata_counts.get(directory,0)+1
        raw=json.dumps(dict(schema="zenon-owned-task-storage/v2",id=format(index+1,"032x"))).encode()
        ident=["1",str(index+100),"0","0","0","1",str(len(raw)),"1","1"]
        if metadata_change and metadata_counts[directory]>1:ident[-1]="2"
        return raw,ident
    def snapshot(path,common):
        value=str(path);events["snapshots"].append(value);counts[value]=counts.get(value,0)+1
        return(value,1 if snapshot_change and counts[value]>1 else 0)
    own_task=("a"*32,"b"*32)
    def reservations(path,selected_own_task):
        if selected_own_task!=own_task:raise AssertionError("SAME_OWN_TASK_EXCLUSION")
        index=paths.index(str(path));events["reservations"].append(index)
        if reservation_fault is not None and index==reservation_fault:
            raise ValueError("DECLARED_RESERVATION_READ_FAILURE") if reservation_error is None else reservation_error
        return dict(reservedBytes=reserved_values[index])
    def available(volume):
        if str(volume)!="/declared-volume":raise AssertionError("DECLARED_VOLUME_ONLY")
        value=available_values[min(len(events["available"]),len(available_values)-1)]
        events["available"].append(value);return types.SimpleNamespace(f_bavail=value,f_frsize=1)
    common=types.SimpleNamespace(no_links=lambda _:None,
        private_directory=lambda path:launcher.identity(path.stat())[:5],reservations=reservations)
    volume=DeclaredPath("/declared-volume");root=DeclaredPath(paths[0]);uuid="11111111-1111-1111-1111-111111111111"
    def mount_query(argv,**kwargs):
        if argv!=["/usr/sbin/diskutil","info","-plist",str(volume)]:raise AssertionError("DECLARED_MOUNT_QUERY_ONLY")
        return types.SimpleNamespace(returncode=0,stdout=launcher.plistlib.dumps(dict(VolumeUUID=uuid,MountPoint=str(volume))),stderr=b"")
    def capture_reservations(path,common,selected_own_task):
        # Declared aggregate callbacks stand in for the one physical capture.
        return dict(snapshot=snapshot(path,common),reservations=reservations(path,selected_own_task))
    originals=launcher.read,launcher.reservation_snapshot,launcher.subprocess.run,launcher.os.statvfs,launcher.reservation_capture
    launcher.read=read_metadata;launcher.reservation_snapshot=snapshot
    launcher.reservation_capture=capture_reservations
    launcher.subprocess.run=mount_query;launcher.os.statvfs=available
    result=error=None
    try:
        try:result=launcher.capacity(volume,uuid,root,common,resource.resource_plan(WORKLOAD),own_task)
        except (ValueError,OSError,AssertionError)as problem:error=problem
    finally:
        launcher.read,launcher.reservation_snapshot,launcher.subprocess.run,launcher.os.statvfs,launcher.reservation_capture=originals
    return dict(result=result,error=error,events=events)

def capacity_early_prefix(self):
    base_bytes=resource.resource_plan(WORKLOAD)["requiredFreeBytesBeforeOtherReservations"]
    value=declared_capacity_inventory([1048576]*111,[base_bytes+64*1048576-1])
    e=value["events"];summary["declaredReservationPrefixRefusal"]=dict(storesDeclared=111,storesRead=len(e["reservations"]),
        taskSnapshotCallbacks=len(e["snapshots"]),metadataCallbacks=e["metadataReads"],nativeExecuted=False)
    self.assertIsInstance(value["error"],ValueError)
    self.assertEqual(e["reservations"],list(range(64)))
    self.assertEqual(len(e["snapshots"]),128)
    self.assertEqual(e["metadataReads"],222)
check("actual_capacity_refuses_known_64_store_prefix_without_reading_47_later_task_sets",capacity_early_prefix)
def capacity_base_refusal(self):
    base_bytes=resource.resource_plan(WORKLOAD)["requiredFreeBytesBeforeOtherReservations"]
    value=declared_capacity_inventory([1048576]*111,[base_bytes-1]);e=value["events"]
    summary["declaredReservationBaseRefusal"]=dict(storesDeclared=111,storesRead=len(e["reservations"]),
        taskSnapshotCallbacks=len(e["snapshots"]),metadataCallbacks=e["metadataReads"],nativeExecuted=False)
    self.assertIsInstance(value["error"],ValueError);self.assertEqual(e["reservations"],[])
    self.assertEqual(e["snapshots"],[]);self.assertEqual(e["metadataReads"],222)
check("actual_capacity_refuses_below_base_floor_without_task_record_reads",capacity_base_refusal)
def capacity_complete_scope(self):
    base_bytes=resource.resource_plan(WORKLOAD)["requiredFreeBytesBeforeOtherReservations"]
    value=declared_capacity_inventory([1048576]*111,[base_bytes+111*1048576]);e=value["events"]
    self.assertIsNone(value["error"]);self.assertEqual(e["reservations"],list(range(111)))
    self.assertEqual(value["result"]["storeRoots"],111);self.assertEqual(value["result"]["reservedBytes"],111*1048576)
    self.assertEqual(len(e["snapshots"]),222);self.assertEqual(e["metadataReads"],222)
    summary["declaredReservationCompleteAdmission"]=dict(storesDeclared=111,storesRead=len(e["reservations"]),
        taskSnapshotCallbacks=len(e["snapshots"]),metadataCallbacks=e["metadataReads"],nativeExecuted=False)
check("actual_capacity_still_reads_and_rechecks_all_stores_before_complete_data_result",capacity_complete_scope)

for label,available_value in[("negative",-1),("boolean",True),("float",1.5),("unsafe_integer",2**53)]:
    def run(self,available_value=available_value):
        calls=[]
        def never(*args):calls.append(args);raise AssertionError("INVALID_SPACE_HAS_NO_TASK_CALLBACKS")
        with self.assertRaisesRegex(ValueError,"^BOUNDED_CAPACITY_DATA$"):
            launcher.reservation_capacity_data(1,resource.resource_plan(WORKLOAD),never,lambda:available_value,never)
        self.assertEqual(calls,[])
    check("prefix_capacity_rejects_"+label+"_available_data_before_task_reads",run)
for label,amount in[("negative",-1),("boolean",True),("float",1.5),("unsafe_integer",2**53)]:
    def run(self,amount=amount):
        base_bytes=resource.resource_plan(WORKLOAD)["requiredFreeBytesBeforeOtherReservations"]
        value=declared_capacity_inventory([amount,1],[base_bytes+100])
        self.assertIsInstance(value["error"],ValueError);self.assertEqual(str(value["error"]),"BOUNDED_STORE_RESERVATION_BYTES")
        self.assertEqual(value["events"]["reservations"],[0])
    check("actual_capacity_rejects_"+label+"_reservation_data_without_continuation",run)
for label,count in[("empty",0),("boolean",True),("float",1.5),("too_many",257)]:
    def run(self,count=count):
        calls=[]
        def never(*args):calls.append(args);raise AssertionError("INVALID_SCOPE_HAS_NO_CALLBACKS")
        with self.assertRaisesRegex(ValueError,"^BOUNDED_CAPACITY_DATA$"):
            launcher.reservation_capacity_data(count,resource.resource_plan(WORKLOAD),never,never,never)
        self.assertEqual(calls,[])
    check("prefix_capacity_data_rejects_"+label+"_scope_before_callbacks",run)
def capacity_grows_before_guard(self):
    base_bytes=resource.resource_plan(WORKLOAD)["requiredFreeBytesBeforeOtherReservations"]
    value=declared_capacity_inventory([1,1,1],[base_bytes-1,base_bytes+3]);e=value["events"]
    self.assertIsNone(value["error"]);self.assertEqual(e["reservations"],[0,1,2])
    self.assertEqual(len(e["snapshots"]),6);self.assertEqual(e["metadataReads"],6)
check("capacity_growth_before_prefix_guard_continues_to_complete_scope",capacity_grows_before_guard)
def capacity_grows_during_base_guard(self):
    base_bytes=resource.resource_plan(WORKLOAD)["requiredFreeBytesBeforeOtherReservations"]
    value=declared_capacity_inventory([1,1,1],[base_bytes-1,base_bytes-1,base_bytes+3]);e=value["events"]
    self.assertIsNone(value["error"]);self.assertEqual(e["reservations"],[0,1,2])
    self.assertEqual(value["result"]["reservedBytes"],3);self.assertEqual(len(e["snapshots"]),6)
    self.assertEqual(e["metadataReads"],9)
check("capacity_growth_during_zero_prefix_guard_never_returns_partial_admission",capacity_grows_during_base_guard)
def capacity_grows_during_task_guard(self):
    base_bytes=resource.resource_plan(WORKLOAD)["requiredFreeBytesBeforeOtherReservations"]
    low=base_bytes+64*1048576-1
    value=declared_capacity_inventory([1048576]*111,[low,low,base_bytes+200*1048576]);e=value["events"]
    self.assertIsNone(value["error"]);self.assertEqual(e["reservations"],list(range(111)))
    self.assertEqual(value["result"]["reservedBytes"],111*1048576)
    self.assertEqual(len(e["snapshots"]),286);self.assertEqual(e["metadataReads"],333)
    summary["declaredPrefixGrowthStillCompletes"]=dict(storesRead=111,taskSnapshotCallbacks=286,
        maximumPrefixGuards=1,nativeExecuted=False)
check("capacity_growth_during_64_prefix_guard_still_reads_all_111_and_checks_only_one_prefix",capacity_grows_during_task_guard)
def capacity_late_shrink(self):
    base_bytes=resource.resource_plan(WORKLOAD)["requiredFreeBytesBeforeOtherReservations"]
    value=declared_capacity_inventory([1,1,1],[base_bytes+3,base_bytes+2])
    self.assertIsInstance(value["error"],ValueError)
    self.assertEqual(str(value["error"]),"PRODUCTION_FLOOR_AND_ALL_STORE_RESERVATIONS")
    self.assertEqual(value["events"]["reservations"],[0,1,2]);self.assertIsNone(value["result"])
check("fresh_final_capacity_refuses_space_lost_after_complete_inventory",capacity_late_shrink)
for label,kw,code in[
 ("task_identity",dict(snapshot_change=True),"RESERVATION_RECORD_OR_SCRATCH_CHANGED"),
 ("store_metadata",dict(metadata_change=True),"STORAGE_INVENTORY_CHANGED"),
 ("parent_membership",dict(membership_change=True),"STORAGE_PARENT_CHANGED")]:
    def run(self,kw=kw,code=code):
        base_bytes=resource.resource_plan(WORKLOAD)["requiredFreeBytesBeforeOtherReservations"]
        value=declared_capacity_inventory([1,1,1],[base_bytes],**kw)
        self.assertIsInstance(value["error"],ValueError);self.assertEqual(str(value["error"]),code)
        self.assertEqual(value["events"]["reservations"],[0]);self.assertIsNone(value["result"])
    check("actual_prefix_refusal_preserves_"+label+"_failure_without_further_task_reads",run)
def capacity_reservation_failure(self):
    base_bytes=resource.resource_plan(WORKLOAD)["requiredFreeBytesBeforeOtherReservations"]
    value=declared_capacity_inventory([1,1,1],[base_bytes+100],reservation_fault=1)
    self.assertIsInstance(value["error"],ValueError);self.assertEqual(str(value["error"]),"DECLARED_RESERVATION_READ_FAILURE")
    self.assertEqual(value["events"]["reservations"],[0,1]);self.assertIsNone(value["result"])
check("actual_reservation_reader_failure_is_preserved_without_retry",capacity_reservation_failure)
def capacity_sum_overflow(self):
    value=declared_capacity_inventory([2**52,2**52],[2**53-1])
    self.assertIsInstance(value["error"],ValueError);self.assertEqual(str(value["error"]),"BOUNDED_CAPACITY_DATA")
    self.assertEqual(value["events"]["reservations"],[0,1]);self.assertIsNone(value["result"])
check("aggregate_reservations_cannot_overflow_safe_capacity_data",capacity_sum_overflow)
def capacity_unread_is_not_zero(self):
    base_bytes=resource.resource_plan(WORKLOAD)["requiredFreeBytesBeforeOtherReservations"]
    early=declared_capacity_inventory([1,True,1],[base_bytes])
    self.assertEqual(str(early["error"]),"KNOWN_RESERVATION_LOWER_BOUND_EXCEEDS_AVAILABLE")
    self.assertEqual(early["events"]["reservations"],[0]);self.assertIsNone(early["result"])
    complete=declared_capacity_inventory([1,True,1],[base_bytes+100])
    self.assertEqual(str(complete["error"]),"BOUNDED_STORE_RESERVATION_BYTES")
    self.assertEqual(complete["events"]["reservations"],[0,1]);self.assertIsNone(complete["result"])
check("unread_later_rows_are_not_zero_or_qualified_by_a_prefix_refusal",capacity_unread_is_not_zero)
def capacity_maximum_scope(self):
    base_bytes=resource.resource_plan(WORKLOAD)["requiredFreeBytesBeforeOtherReservations"]
    value=declared_capacity_inventory([1]*256,[base_bytes+256])
    self.assertIsNone(value["error"]);self.assertEqual(value["events"]["reservations"],list(range(256)))
    self.assertEqual(value["result"]["storeRoots"],256);self.assertEqual(len(value["events"]["snapshots"]),512)
check("maximum_256_store_scope_still_requires_complete_inventory",capacity_maximum_scope)
def capacity_zero_reservations(self):
    base_bytes=resource.resource_plan(WORKLOAD)["requiredFreeBytesBeforeOtherReservations"]
    value=declared_capacity_inventory([0]*111,[base_bytes])
    self.assertIsNone(value["error"]);self.assertEqual(value["events"]["reservations"],list(range(111)))
    self.assertEqual(value["result"]["reservedBytes"],0);self.assertEqual(len(value["events"]["snapshots"]),222)
check("zero_reservations_still_require_all_store_reads_and_rechecks",capacity_zero_reservations)
def capacity_callback_contract(self):
    calls=[]
    def never(*args):calls.append(args);raise AssertionError("INVALID_CALLBACK_CONTRACT")
    with self.assertRaisesRegex(ValueError,"^CAPACITY_OBSERVATION_CALLBACKS$"):
        launcher.reservation_capacity_data(1,resource.resource_plan(WORKLOAD),None,never,never)
    self.assertEqual(calls,[])
check("capacity_data_requires_complete_observation_callback_contract",capacity_callback_contract)

for label,kw,code in[
 ("task_identity",dict(snapshot_change=True),"RESERVATION_RECORD_OR_SCRATCH_CHANGED"),
 ("store_metadata",dict(metadata_change=True),"STORAGE_INVENTORY_CHANGED"),
 ("parent_membership",dict(membership_change=True),"STORAGE_PARENT_CHANGED")]:
    def run(self,kw=kw,code=code):
        base_bytes=resource.resource_plan(WORKLOAD)["requiredFreeBytesBeforeOtherReservations"]
        value=declared_capacity_inventory([1,1,1],[base_bytes+100],**kw)
        self.assertIsInstance(value["error"],ValueError);self.assertEqual(str(value["error"]),code)
        self.assertEqual(value["events"]["reservations"],[0,1,2]);self.assertIsNone(value["result"])
    check("complete_inventory_preserves_"+label+"_failure_before_successful_data_result",run)

def call_binding(self):
    actual=ast.parse((repo/"qualification/run-capacity-native-current-offered-v6.local.py").read_bytes())
    old=ast.parse((repo/"qualification/run-capacity-native-current-offered-v2.local.py").read_bytes())
    def selected(tree):
        execute=next(n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name=="execute")
        return next(n for n in ast.walk(execute)if isinstance(n,ast.Call)and isinstance(n.func,ast.Attribute)and n.func.attr=="plan"
            and isinstance(n.func.value,ast.Subscript)and isinstance(n.func.value.slice,ast.Constant)and n.func.value.slice.value=="command")
    new_call=selected(actual);old_call=selected(old)
    self.assertIsInstance(new_call.args[0],ast.Name);self.assertEqual(new_call.args[0].id,"planner")
    inspect.signature(command.plan).bind(*[None]*len(new_call.args))
    with self.assertRaises(TypeError):inspect.signature(command.plan).bind(*[None]*len(old_call.args))
    summary["nativeCommandCallArgumentsBound"]=len(new_call.args)
check("actual_native_command_call_matches_real_planner_signature_and_old_call_does_not",call_binding)
def same_math(self):
    old=ast.parse((repo/"qualification/native_capacity_current_offered_resource_v1.py").read_bytes())
    new=ast.parse((repo/"qualification/native_capacity_current_offered_resource_v5.py").read_bytes())
    for name in("capture_plan","finite_source_plan"):
        a=next(n for n in old.body if isinstance(n,ast.FunctionDef)and n.name==name)
        b=next(n for n in new.body if isinstance(n,ast.FunctionDef)and n.name==name)
        self.assertEqual(ast.dump(a,include_attributes=False),ast.dump(b,include_attributes=False))
    summary["unchangedFinitePlanFunctions"]=2
check("finite_plan_math_is_unchanged_from_the_previous_real_js_parity_control",same_math)
for label,change in[
 ("parent_profile",lambda v:v.update(profileVersion=5)),("parent_source",lambda v:v.update(sourceRowsSha256="0"*64)),
 ("child_source",lambda v:v.update(childSourceRowsSha256="0"*64)),("parent_context",lambda v:v.update(laneId="other")),
 ("final_input",lambda v:v["inputs"][-1].update(sha256="0"*64)),("changed_binding",lambda v:v["bareBindings"][0].update(specifier="WRONG"))]:
    def run(self,change=change):
        value=case();data=json.loads(value["parent_input"]["raw"]);change(data);raw=resource.canonical_bytes(data)
        value["parent_input"]=dict(path=STORE+"/objects/"+hashlib.sha256(raw).hexdigest(),sha256=hashlib.sha256(raw).hexdigest(),raw=raw)
        with self.assertRaises(ValueError):command.plan(**value)
    check("recomputed_digest_cannot_hide_changed_full_"+label,run)
def no_full_copy(self):
    value=case();original=command.decode;calls=[]
    def observe(raw,maximum):
        calls.append(len(raw));return original(raw,maximum)
    command.decode=observe
    try:result=command.plan(**value)
    finally:command.decode=original
    self.assertEqual(result["summary"]["childProfiles"],2);self.assertTrue(result["summary"]["wholeGenuineCurrentProfileBytesBound"])
check("command_retains_whole_genuine_profiles_and_never_substitutes_digest_only_checks",no_full_copy)

# Reuse only pinned DATA fixture builders, never historical result bytes or a native entry.
fixture_path=repo/"qualification/native_capacity_current_offered_pipeline_v1.behavior.py"
fixture_source=fixture_path.read_text();fixture_tree=ast.parse(fixture_source)
fixture_names={"metric","scalar_record","outer_fixture","frame","receipt","validate_fixture","setat"}
fixture_nodes=[n for n in fixture_tree.body if isinstance(n,ast.FunctionDef)and n.name in fixture_names]
fixtures=dict(copy=copy,hashlib=hashlib,json=json,capture=capture,resource=resource,WORKLOAD=WORKLOAD,RUN=RUN)
exec(compile(ast.Module(body=fixture_nodes,type_ignores=[]),str(fixture_path),"exec"),fixtures)
legacy_fresh_outer=fixtures["outer_fixture"]
def outer_fixture(*args,**kwargs):
    value=legacy_fresh_outer(*args,**kwargs);value["result"]["nativeOfferedCapacityWorkloadAdapterVersion"]=6;value["offeredCaptureVersion"]=3;return value
fixtures["outer_fixture"]=outer_fixture
start=next(i for i,n in enumerate(fixture_tree.body)if isinstance(n,ast.Assign)and any(isinstance(v,ast.Name)and v.id=="mutations"for v in n.targets))
end=next(i for i,n in enumerate(fixture_tree.body[start:],start)if isinstance(n,ast.For)and isinstance(n.iter,ast.Name)and n.iter.id=="mutations")
exec(compile(ast.Module(body=fixture_tree.body[start:end],type_ignores=[]),str(fixture_path),"exec"),fixtures)
def validate_fixture(v):
    raw=fixtures["frame"](v);return capture.validate(resource,raw,b"",fixtures["receipt"](raw),WORKLOAD,RUN)
for label,count,busy,miss in[("partial",2,1,1),("all_missed",0,0,4),("all_dispatched",4,0,0)]:
    def run(self,count=count,busy=busy,miss=miss):
        value=validate_fixture(outer_fixture(count,busy,miss))
        self.assertEqual(value["dispatchedGlobalMeasuredOriginals"],count);self.assertEqual(value["currentOfferedCaptureDataVersion"],3)
        self.assertFalse(value["nativeResourcesQualified"]);self.assertFalse(value["storageCleanupQualified"])
    check("fresh_v3_v5_outer_"+label+"_is_data_not_native_or_storage_proof",run)
vectors=fixtures["mutations"]+[("old_adapter",["result","nativeOfferedCapacityWorkloadAdapterVersion"],3),
 ("old_parent_graph",["sourceRowsSha256"],"ac68afce186b6862eac33cbb3ee88944d5e8985976e0391fedb961213bd25732"),
 ("old_child_graph",["childSourceRowsSha256"],"db33115ac37137f5b0212cb33d748154b498ec1b15ca106dfb757575da692a6e")]
for label,path,value in vectors:
    def run(self,path=path,value=value):
        data=outer_fixture();fixtures["setat"](data,path,value)
        with self.assertRaises((ValueError,KeyError)):validate_fixture(data)
    check("recomputed_outer_receipt_digest_cannot_hide_"+label,run)
def no_second_capture(self):
    data=outer_fixture();raw=fixtures["frame"](data);original=capture.canonical
    def guard(v):
        if type(v)is dict and"offeredCaptureVersion"in v:raise AssertionError("NO_SECOND_COMPLETE_CAPTURE_SERIALIZATION")
        return original(v)
    capture.canonical=guard
    try:value=capture.validate(resource,raw,b"",fixtures["receipt"](raw),WORKLOAD,RUN)
    finally:capture.canonical=original
    self.assertFalse(value["fullCaptureJsonReserialized"]);self.assertFalse(value["entireInputTreeCopied"])
check("actual_original_outer_frame_is_validated_without_complete_reserialization_or_tree_copy",no_second_capture)
for label,edit in[
 ("incomplete_stream",lambda r:r.update(output_complete=False)),("nonzero_exit",lambda r:r.update(actual_exit=1)),
 ("boolean_exit",lambda r:r.update(actual_exit=False)),("unknown_command",lambda r:r.update(state="UNKNOWN")),
 ("wrong_digest",lambda r:r["stdout"].update(sha256="0"*64)),("changed_stdout_size",lambda r:r["stdout"].update(bytes=0)),
 ("private_argv",lambda r:r.update(argv=["must-not-publish"]))]:
    def run(self,edit=edit):
        raw=fixtures["frame"](outer_fixture());r=fixtures["receipt"](raw);edit(r)
        with self.assertRaises(ValueError):capture.validate(resource,raw,b"",r,WORKLOAD,RUN)
    check("original_command_receipt_refuses_"+label,run)
def packed_graph_closure(self):
    rows={row["path"]:row for row in selection["rows"]}
    packed_names={"app/src/service-credit-capacity-recorder-packed.js",
        "app/src/service-credit-capacity-offered-window-packed-owner-core.js",
        "app/src/service-credit-capacity-offered-workload-packed-owner-core.js"}
    self.assertTrue(packed_names.issubset(rows));self.assertEqual(len(rows),588)
    self.assertEqual(sum(name.startswith("app/")for name in rows),184)
    child_names={row["path"]for row in selection["childSelection"]["rows"]}
    self.assertEqual(len(child_names),577);self.assertFalse(child_names.intersection(packed_names))
    self.assertEqual(len(selection["extraRows"]),11)
    self.assertEqual(p.CHILD_SEAL,"7561f4a96b0bb584b6b6064d7b1cb5399670ef29693d18735156c62fb7b6ec03")
    summary["packedSourceGraph"]=dict(parentRows=588,parentApplications=184,parentPackages=404,childRows=577,
        childApplications=173,childPackages=404,packedComponents=3,parentOnlyExtensions=11)
check("packed_parent_adds_three_actual_components_without_replacing_any_v6_child_row",packed_graph_closure)

def owned_window_graph_closure(self):
    expected={"app/src/service-credit-capacity-cohort-writer-coverage-data.js",
        "app/src/service-credit-capacity-window-writer-trace-owned-data.js"}
    rows={row["path"]:row for row in selection["rows"]}
    self.assertTrue(expected.issubset(row["path"]for row in selection["extraRows"]))
    self.assertFalse(expected.intersection(row["path"]for row in selection["childSelection"]["rows"]))
    for name in expected:
        raw=(repo/name[4:]).read_bytes()
        self.assertEqual(rows[name]["sha256"],hashlib.sha256(raw).hexdigest())
    adapter=(repo/"qualification/capacity-native-current-offered-adapter-v7.draft.mjs").read_text()
    self.assertIn("createServiceCreditCapacityWindowWriterTraceOwnedData as WINDOW_TRACE",adapter)
    self.assertIn("../src/service-credit-capacity-window-writer-trace-owned-data.js",adapter)
    self.assertNotIn("createServiceCreditCapacityWindowWriterTraceData as WINDOW_TRACE",adapter)
    preload=(repo/"qualification/capacity-native-current-offered-v6.namespace.preload.draft.mjs").read_text()
    for name in expected:self.assertIn(name,preload)
    source=(repo/"src/service-credit-capacity-window-writer-trace-owned-data.js").read_text()
    self.assertIn("bracket:after-before",source)
    self.assertIn("bracketElapsedNs:page.intervals[index].bracketElapsedNs",source)
    self.assertIn("insideTransactionElapsedNs:page.intervals[index].insideTransactionElapsedNs",source)
    self.assertNotIn("bracketElapsedNs:String(r.bracket)",source)
    summary["validatedDurationReuseSourceBound"]=True
    summary["ownedWindowGraph"]=dict(parentRows=588,parentApplications=184,childRows=577,
        coverageAndWindowComponents=2,allCurrentChildRowsPreserved=True,nativeExecuted=False)
check("complete_parent_selects_owned_window_and_preserves_all_577_child_rows",owned_window_graph_closure)
def native_source_edges(self):
    adapter=(repo/"qualification/capacity-native-current-offered-adapter-v7.draft.mjs").read_text()
    entry=(repo/"qualification/capacity-native-current-offered-v6.entry.draft.mjs").read_text()
    preload=(repo/"qualification/capacity-native-current-offered-v6.namespace.preload.draft.mjs").read_text()
    workload=(repo/"src/service-credit-capacity-offered-workload-packed-owner-core.js").read_text()
    window=(repo/"src/service-credit-capacity-offered-window-packed-owner-core.js").read_text()
    self.assertIn("createServiceCreditCapacityOfferedWorkloadPackedOwnerCore as CREATE_CORE",adapter)
    self.assertIn("../src/service-credit-capacity-offered-workload-packed-owner-core.js",adapter)
    self.assertIn("createNativeCapacityCurrentOfferedAdapterV7:CREATE",entry)
    self.assertIn("from './capacity-native-current-offered-pair-v6.supervisor.draft.mjs'",adapter)
    self.assertIn("capacity-native-current-offered-adapter-v7.draft.mjs",entry)
    self.assertIn("createServiceCreditCapacityRecorderPacked",workload);self.assertIn("createServiceCreditCapacityOfferedWindowPackedOwnerCore",workload)
    self.assertIn("createServiceCreditCapacityRecorderPacked",window)
    self.assertIn("profile.profileVersion !== 9",preload);self.assertIn("profile.inputs.length !== 588",preload)
    self.assertIn("applications !== 184",preload)
    self.assertIn("one-reviewed-native-capacity-current-offered-parent-v6",preload)
    self.assertIn("nativeCapacityCurrentOfferedSupervisorNamespaceSnapshotV6()",preload)
    self.assertIn("namespace.applicationFiles!==184",entry);self.assertIn("offeredCaptureVersion:3",entry)
    self.assertIn("nativeOfferedCapacityWorkloadAdapterVersion===6",entry)
    pair_source=(repo/"qualification/capacity-native-current-offered-pair-v6.supervisor.draft.mjs").read_text()
    for role in("payer","service"):
        for kind in("worker","namespace.preload"):
            self.assertIn("new URL('./capacity-native-current-"+role+"-v7."+kind+".draft.mjs'",pair_source)
    self.assertIn("s.applicationFiles!=="+str(sum(row["path"].startswith("app/")for row in selection["rows"])),pair_source)
    self.assertNotIn("s.applicationFiles!==162",pair_source)
    self.assertIn("summarizeOwned([...s.balanceReadNs])",adapter)
    self.assertEqual(adapter.count("summarizeOwned(s.intervals.map("),2)
    self.assertIn("const sorted = values.sort(",adapter)
    self.assertNotIn("const sorted = [...values].sort(",adapter)
    summary["ownedWriterScratchSortBound"]=True
    service=(repo/"qualification/capacity-native-current-service-v7.owner.draft.mjs").read_text()
    worker=(repo/"qualification/capacity-native-current-service-v7.worker.draft.mjs").read_text()
    window=(repo/"qualification/capacity-native-current-service-window-v7.owner.draft.mjs").read_text()
    self.assertIn("from './capacity-native-current-service-window-v7.owner.draft.mjs'",service)
    self.assertNotIn("from './capacity-native-service-window-v3.owner.draft.mjs'",service)
    self.assertIn("openNativeCapacityCurrentServiceV7",worker)
    self.assertIn("getPinnedNativeCapacityCurrentServiceNamespaceSnapshotV7",window)
    self.assertIn("native-capacity-current-service-source-draft-v7",window)
    self.assertIn("one-reviewed-native-capacity-current-roles-v7",window)
    summary["matchedCurrentWindowSourceEdgesChecked"]=6
    summary["packedNativeSourceEdgesChecked"]=8
check("real_native_entry_adapter_and_both_packed_owner_edges_match_new_admission_versions",native_source_edges)
for label,field,value in[("outer_version","offeredCaptureVersion",2),("adapter_version","nativeOfferedCapacityWorkloadAdapterVersion",4)]:
    def run(self,field=field,value=value):
        outer=outer_fixture()
        if field=="offeredCaptureVersion":outer[field]=value
        else:outer["result"][field]=value
        with self.assertRaises(ValueError):validate_fixture(outer)
    check("rehashed_previous_v3_capture_cannot_be_relabelled_for_packed_"+label,run)
def previous_parent_version(self):
    value=case();data=json.loads(value["parent_input"]["raw"]);data["profileVersion"]=6
    raw=resource.canonical_bytes(data)
    value["parent_input"]=dict(path=STORE+"/objects/"+hashlib.sha256(raw).hexdigest(),sha256=hashlib.sha256(raw).hexdigest(),raw=raw)
    with self.assertRaises(ValueError):command.plan(**value)
check("rehashed_previous_parent_profile_version_six_cannot_select_packed_v4",previous_parent_version)


# Diagnostic projections are DATA only. Exercise the actual capacity wrappers;
# never open a physical storage root, copy private paths or enter native code.
def diagnostic_expected(stage,index,count=3):
    return dict(diagnosticVersion=1,stage=stage,storeIndex=index,storeCount=count,
        storeIdDigest=None if index is None else hashlib.sha256(format(index+1,"032x").encode("ascii")).hexdigest(),
        admissionGranted=False,authority="NONE")

def diagnostic_capture_identity(self):
    error=ValueError("DECLARED_RESERVATION_READ_FAILURE");original=error.args
    base_bytes=resource.resource_plan(WORKLOAD)["requiredFreeBytesBeforeOtherReservations"]
    value=declared_capacity_inventory([1,1,1],[base_bytes+100],reservation_fault=1,reservation_error=error)
    self.assertIs(value["error"],error);self.assertEqual(error.args,original)
    self.assertEqual(value["events"]["reservations"],[0,1]);self.assertIsNone(value["result"])
    self.assertEqual(launcher.capacity_refusal_data(error),diagnostic_expected("STORE_RESERVATION_CAPTURE",1))
check("capacity_capture_diagnostic_preserves_same_exception_arguments_and_stop",diagnostic_capture_identity)

def diagnostic_oserror(self):
    error=OSError(13,"DECLARED_PRIVATE_MESSAGE","/declared/private/record.json");original=error.args
    base_bytes=resource.resource_plan(WORKLOAD)["requiredFreeBytesBeforeOtherReservations"]
    value=declared_capacity_inventory([1,1,1],[base_bytes+100],reservation_fault=1,reservation_error=error)
    self.assertIs(value["error"],error);self.assertEqual(error.args,original)
    data=launcher.capacity_refusal_data(error)
    self.assertEqual(data,diagnostic_expected("STORE_RESERVATION_CAPTURE",1))
    self.assertNotIn("private",json.dumps(data));self.assertNotIn("MESSAGE",json.dumps(data))
    self.assertNotIn("filename",data);self.assertEqual(error.filename,"/declared/private/record.json")
check("capacity_oserror_diagnostic_omits_original_filename_and_message",diagnostic_oserror)

for label,kw,stage,index in [
 ("snapshot",dict(snapshot_change=True),"STORE_RESERVATION_RECHECK",0),
 ("metadata",dict(metadata_change=True),"STORE_METADATA_RECHECK",0),
 ("parent",dict(membership_change=True),"CAPACITY_PREDICATE",None)]:
    def run(self,kw=kw,stage=stage,index=index):
        base_bytes=resource.resource_plan(WORKLOAD)["requiredFreeBytesBeforeOtherReservations"]
        value=declared_capacity_inventory([1,1,1],[base_bytes],**kw)
        self.assertIsInstance(value["error"],ValueError);self.assertIsNone(value["result"])
        self.assertEqual(launcher.capacity_refusal_data(value["error"]),diagnostic_expected(stage,index))
        self.assertEqual(value["events"]["reservations"],[0])
    check("actual_capacity_"+label+"_recheck_keeps_precise_diagnostic_boundary",run)

def diagnostic_predicate(self):
    base_bytes=resource.resource_plan(WORKLOAD)["requiredFreeBytesBeforeOtherReservations"]
    for available_values,code,observed in [
        ([base_bytes],"KNOWN_RESERVATION_LOWER_BOUND_EXCEEDS_AVAILABLE",[0]),
        ([base_bytes+3,base_bytes+2],"PRODUCTION_FLOOR_AND_ALL_STORE_RESERVATIONS",[0,1,2])]:
        value=declared_capacity_inventory([1,1,1],available_values)
        self.assertEqual(str(value["error"]),code);self.assertIsNone(value["result"])
        self.assertEqual(value["events"]["reservations"],observed)
        self.assertEqual(launcher.capacity_refusal_data(value["error"]),diagnostic_expected("CAPACITY_PREDICATE",None))
check("early_and_complete_capacity_refusals_remain_refusals_with_data",diagnostic_predicate)

def diagnostic_detached(self):
    error=ValueError("UNCHANGED")
    self.assertIs(launcher.annotate_capacity_refusal(error,"STORE_RESERVATION_CAPTURE",1,3,format(2,"032x")),error)
    a=launcher.capacity_refusal_data(error);b=launcher.capacity_refusal_data(error)
    self.assertEqual(a,b);self.assertIsNot(a,b)
    a["admissionGranted"]=True;a["stage"]="CHANGED"
    self.assertEqual(launcher.capacity_refusal_data(error),diagnostic_expected("STORE_RESERVATION_CAPTURE",1))
    self.assertEqual(str(error),"UNCHANGED")
check("capacity_diagnostic_returns_detached_data_and_no_admission",diagnostic_detached)

for label,field,replacement in [
 ("boolean_version","diagnosticVersion",True),("new_version","diagnosticVersion",2),
 ("boolean_count","storeCount",True),("float_count","storeCount",3.0),("zero_count","storeCount",0),
 ("large_count","storeCount",257),("boolean_index","storeIndex",True),("negative_index","storeIndex",-1),
 ("outside_index","storeIndex",3),("unknown_stage","stage","UNKNOWN"),
 ("uppercase_digest","storeIdDigest","A"*64),("short_digest","storeIdDigest","a"*63),
 ("granted","admissionGranted",True),("other_authority","authority","NATIVE")]:
    def run(self,field=field,replacement=replacement):
        error=ValueError("UNCHANGED")
        launcher.annotate_capacity_refusal(error,"STORE_RESERVATION_CAPTURE",1,3,format(2,"032x"))
        error.__dict__["_capacity_scope_data"][field]=replacement
        self.assertIsNone(launcher.capacity_refusal_data(error));self.assertEqual(error.args,("UNCHANGED",))
    check("capacity_diagnostic_rejects_"+label,run)

def diagnostic_extra_or_missing(self):
    error=ValueError("UNCHANGED")
    self.assertIsNone(launcher.capacity_refusal_data(error))
    for change in ("extra","missing"):
        launcher.annotate_capacity_refusal(error,"STORE_RESERVATION_CAPTURE",1,3,format(2,"032x"))
        value=error.__dict__["_capacity_scope_data"]
        if change=="extra":value["privatePath"]="/declared/private/record.json"
        else:value.pop("authority")
        self.assertIsNone(launcher.capacity_refusal_data(error))
    launcher.annotate_capacity_refusal(error,"CAPACITY_PREDICATE",None,3)
    error.__dict__["_capacity_scope_data"]["storeIndex"]=0
    self.assertIsNone(launcher.capacity_refusal_data(error))
check("capacity_diagnostic_rejects_extra_missing_and_predicate_identity",diagnostic_extra_or_missing)

def diagnostic_no_hooks(self):
    entered=[]
    class UnknownError(ValueError):
        def __getattribute__(self,name):
            entered.append(name);raise AssertionError("NO_EXCEPTION_SUBCLASS_HOOK")
    error=UnknownError()
    self.assertIs(launcher.annotate_capacity_refusal(error,"STORE_RESERVATION_CAPTURE",1,3,format(2,"032x")),error)
    self.assertIsNone(launcher.capacity_refusal_data(error))
    class UnknownDict(dict):
        def __iter__(self):entered.append("iter");raise AssertionError("NO_DICT_SUBCLASS_HOOK")
        def __len__(self):entered.append("len");raise AssertionError("NO_DICT_SUBCLASS_HOOK")
    plain=ValueError("UNCHANGED");plain.__dict__["_capacity_scope_data"]=UnknownDict()
    self.assertIsNone(launcher.capacity_refusal_data(plain))
    class UnknownText(str):
        def __eq__(self,other):entered.append("eq");raise AssertionError("NO_TEXT_SUBCLASS_HOOK")
    launcher.annotate_capacity_refusal(plain,"STORE_RESERVATION_CAPTURE",1,3,format(2,"032x"))
    plain.__dict__["_capacity_scope_data"]["authority"]=UnknownText("NONE")
    self.assertIsNone(launcher.capacity_refusal_data(plain))
    self.assertEqual(entered,[])
check("capacity_diagnostic_does_not_enter_exception_dict_or_text_subclass_hooks",diagnostic_no_hooks)

def diagnostic_key_hook(self):
    entered=[]
    class UnknownKey:
        active=False
        def __hash__(self):
            if self.active:entered.append("hash");raise AssertionError("NO_UNKNOWN_KEY_HASH")
            return 7
        def __eq__(self,other):entered.append("eq");raise AssertionError("NO_UNKNOWN_KEY_EQUALITY")
    key=UnknownKey();value=diagnostic_expected("STORE_RESERVATION_CAPTURE",1)
    value.pop("authority");value[key]="NONE";key.active=True
    error=ValueError("UNCHANGED");error.__dict__["_capacity_scope_data"]=value
    self.assertIsNone(launcher.capacity_refusal_data(error));self.assertEqual(entered,[])
check("capacity_diagnostic_rejects_nonstring_key_before_hash_or_equality_hooks",diagnostic_key_hook)

def diagnostic_bad_annotation(self):
    for args in [
        ("STORE_RESERVATION_CAPTURE",True,3,format(2,"032x")),
        ("STORE_RESERVATION_CAPTURE",1,True,format(2,"032x")),
        ("STORE_RESERVATION_CAPTURE",1,3,"A"*32),
        ("STORE_RESERVATION_CAPTURE",3,3,format(2,"032x")),
        ("CAPACITY_PREDICATE",0,3,None),
        ("CAPACITY_PREDICATE",None,3,format(2,"032x")),
        ("UNKNOWN",1,3,format(2,"032x"))]:
        error=ValueError("UNCHANGED");self.assertIs(launcher.annotate_capacity_refusal(error,*args),error)
        self.assertIsNone(launcher.capacity_refusal_data(error));self.assertEqual(error.__dict__,{})
check("invalid_capacity_annotation_is_inert_without_replacing_original_failure",diagnostic_bad_annotation)

def declared_cli_diagnostic(error=None):
    tree=ast.parse((repo/"qualification/run-capacity-native-current-offered-v6.local.py").read_bytes())
    guard=next(node for node in tree.body if isinstance(node,ast.If)and isinstance(node.test,ast.Compare)
        and isinstance(node.test.left,ast.Name)and node.test.left.id=="__name__")
    stderr=io.StringIO()
    def main():
        if error is not None:raise error
        return 0
    def exit_once(code):raise SystemExit(code)
    context=dict(__name__="__main__",main=main,sys=types.SimpleNamespace(exit=exit_once,stderr=stderr),
        re=launcher.re,json=json,capacity_refusal_data=launcher.capacity_refusal_data)
    try:exec(compile(ast.Module(body=[guard],type_ignores=[]),"<actual-current-cli-guard>","exec"),context)
    except SystemExit as stopped:return stopped.code,stderr.getvalue()
    raise AssertionError("EXACT_CLI_EXIT_REQUIRED")

def diagnostic_actual_cli(self):
    for error in (ValueError("UNCHANGED_ORIGINAL_CODE"),OSError(13,"DECLARED_PRIVATE_MESSAGE","/declared/private/record.json")):
        launcher.annotate_capacity_refusal(error,"STORE_RESERVATION_CAPTURE",1,3,format(2,"032x"))
        code,text=declared_cli_diagnostic(error);self.assertEqual(code,1)
        event=json.loads(text);self.assertEqual(event["event"],"CURRENT_OFFERED_V6_REFUSED_OR_UNKNOWN")
        self.assertEqual(event["code"],"UNCHANGED_ORIGINAL_CODE"if type(error)is ValueError else"PRESERVE_CURRENT_PRIVATE_RECEIPTS")
        self.assertEqual(event["errorType"],type(error).__name__)
        self.assertEqual(event["capacityLocation"],diagnostic_expected("STORE_RESERVATION_CAPTURE",1))
        self.assertFalse(event["automaticRetry"]);self.assertEqual(event["authority"],"NONE")
        self.assertNotIn("private",text);self.assertNotIn("MESSAGE",text);self.assertEqual(len(text.splitlines()),1)
check("actual_cli_guard_emits_bounded_location_without_original_private_oserror",diagnostic_actual_cli)

def diagnostic_cli_absent_or_success(self):
    code,text=declared_cli_diagnostic(ValueError("UNCHANGED_CODE"));self.assertEqual(code,1)
    self.assertNotIn("capacityLocation",json.loads(text))
    code,text=declared_cli_diagnostic();self.assertEqual(code,0);self.assertEqual(text,"")
check("actual_cli_guard_keeps_legacy_refusal_and_success_without_diagnostic",diagnostic_cli_absent_or_success)

def diagnostic_success(self):
    base_bytes=resource.resource_plan(WORKLOAD)["requiredFreeBytesBeforeOtherReservations"]
    value=declared_capacity_inventory([1,1,1],[base_bytes+100])
    self.assertIsNone(value["error"]);self.assertEqual(value["result"]["reservedBytes"],3)
    self.assertNotIn("capacityLocation",value["result"]);self.assertEqual(value["events"]["reservations"],[0,1,2])
    summary["capacityDiagnosticBoundary"]=dict(version=1,storeIdentifier="SHA256_OF_VALIDATED_STORE_ID",
        privatePathsIncluded=False,exceptionIdentityAndArgumentsPreserved=True,admissionGranted=False,authority="NONE")
check("complete_capacity_success_has_unchanged_result_and_no_diagnostic",diagnostic_success)



def diagnostic_exception_attribute_map(self):
    entered=[]
    class UnknownAttributes(dict):
        def get(self,*args):entered.append("get");raise AssertionError("NO_ATTRIBUTE_MAP_GET_HOOK")
        def __setitem__(self,*args):entered.append("set");raise AssertionError("NO_ATTRIBUTE_MAP_SET_HOOK")
    error=ValueError("UNCHANGED");error.__dict__=UnknownAttributes()
    self.assertIsNone(launcher.capacity_refusal_data(error))
    self.assertIs(launcher.annotate_capacity_refusal(error,"STORE_RESERVATION_CAPTURE",1,3,format(2,"032x")),error)
    self.assertEqual(error.args,("UNCHANGED",));self.assertEqual(entered,[])
    self.assertIs(type(error.__dict__),UnknownAttributes)
check("capacity_diagnostic_rejects_exception_attribute_map_subclass_before_hooks",diagnostic_exception_attribute_map)



# Current V7 leaf / V6 parent composition, using real source and DATA APIs only.
def rpc_revision(self):
    prior=child_deps[-1].capture_selection(repo,child_deps[:-1],(repo/child.PREVIOUS_SELECTION).read_bytes())
    before={r["path"]:r for r in prior["rows"]};after={r["path"]:r for r in selection["childSelection"]["rows"]}
    changed=[name for name in before if before[name]!=after.get(name)]
    self.assertEqual(changed,[child.RPC_BEFORE["path"]])
    self.assertEqual(before[changed[0]],child.RPC_BEFORE);self.assertEqual(after[changed[0]],child.RPC_AFTER)
    self.assertEqual([r for r in prior["rows"]if r["path"].startswith("packages/")],
        [r for r in selection["childSelection"]["rows"]if r["path"].startswith("packages/")])
    self.assertEqual(len(set(after)-set(before)),10)
    summary["explicitRpcReplacement"]=dict(before=child.RPC_BEFORE,input=child.RPC_AFTER,previousRowsPreservedWithoutRevision=566,
        newRows=10,declaredPackageRowsUnchanged=404,historicalFilesModified=False)
check("one_declared_rpc_revision_preserves_all_other_historical_rows_and_404_package_rows",rpc_revision)
def old_source_refusal(self):
    previous=child_deps[-1]
    prior=previous.capture_selection(repo,child_deps[:-1],(repo/child.PREVIOUS_SELECTION).read_bytes())
    with self.assertRaisesRegex(ValueError,"^EXACT_ACTUAL_V6_ROLE_SOURCE$"):previous.verify_application_inputs(repo,prior)
check("preserved_v6_verifier_refuses_actual_current_rpc_bytes_instead_of_relabelling_history",old_source_refusal)
def physical_leaf(self):
    value=child.verify_application_inputs(repo,selection["childSelection"])
    self.assertEqual(value,dict(applicationFilesRead=173,installedPackageFilesRead=0,nativeExecuted=False,authority="NONE"))
    summary["actualLeafSourceReadback"]=value
check("actual_v7_leaf_source_verifier_reads_all_173_current_application_files_only",physical_leaf)
for role in("PAYER","SERVICE"):
    def run(self,role=role):
        leaf=child._Planner._create(base,legacy,copy.deepcopy(REGISTRY),copy.deepcopy(selection["childSelection"]))
        parent=planner();context=dict(runId=RUN,laneId="same.complete.bytes")
        root=dict(path=TASK_ROOT+"/same/"+role.lower(),identity=["1","1800",str(os.getuid()),"20",str(stat.S_IFDIR|0o700)])
        a=leaf.plan_child(role,context,root);b=parent.plan_child(role,context,root)
        self.assertEqual(a["profileBytes"],b["profileBytes"]);self.assertEqual(a["profileSha256"],b["profileSha256"])
        dto=json.loads(a["profileBytes"]);self.assertEqual(dto["profileVersion"],7);self.assertEqual(len(dto["inputs"]),577)
        self.assertEqual(dto["profileKind"],"NATIVE_CAPACITY_CURRENT_"+role+"_NODE24_V7")
        self.assertFalse(dto["sourceTransform"]);self.assertFalse(dto["ordinaryInstalledNamespace"])
        summary.setdefault("completeLeafParentByteParityRoles",[]).append(role)
    check("separate_v7_leaf_and_v6_parent_producers_emit_identical_complete_"+role.lower()+"_profile_bytes",run)
for label,change in[
 ("legacy_child_version",lambda dto:dto.update(profileVersion=6)),
 ("legacy_child_kind",lambda dto:dto.update(profileKind="NATIVE_CAPACITY_CURRENT_PAYER_NODE24_V6")),
 ("historical_rpc_row",lambda dto:next(row for row in dto["inputs"]if row["logicalPath"]==child.RPC_BEFORE["path"]).update(
     **{k:child.RPC_BEFORE[k]for k in("bytes","LF","sha256","gitBlob")}))]:
    def run(self,change=change):
        value=case();bundle=value["children"][0];dto=json.loads(bundle["profileBytes"]);change(dto)
        raw=base.canonical(dto)+b"\n";digest=hashlib.sha256(raw).hexdigest()
        bundle["profileBytes"]=raw;bundle["reference"].update(sha256=digest,path=STORE+"/objects/"+digest)
        with self.assertRaises(ValueError):command.plan(**value)
    check("rehashed_child_profile_rejects_"+label+"_before_any_native_effect",run)
for label,scope in[
 ("old_v5","one-new-approved-native-current-offered-parent-v5"),
 ("old_v6_without_rpc_rebound","one-new-approved-native-current-offered-parent-v6")]:
    def run(self,scope=scope):
        with self.assertRaises(ValueError):launcher.main(native_cli(scope))
    check("current_rpc_rebound_cli_rejects_"+label+"_native_selector",run)
def shared_namespace_fields(self):
    import re
    contract=(repo/"src/native-capacity-role-namespace-contract-v7.js").read_text()
    fields=re.findall(r"'([A-Za-z0-9]+)'",contract.split("NATIVE_CAPACITY_ROLE_NAMESPACE_FIELDS_V7=FREEZE([",1)[1].split("]);",1)[0])
    common=(repo/"qualification/capacity-native-current-namespace-v7.preload-common.draft.mjs").read_text()
    constructed=common.split("const snapshotData = CAPTURE_ROLE_DATA(F({",1)[1].split("}), role,",1)[0]
    actual=re.findall(r"\b([A-Za-z0-9]+)\s*:",constructed)
    self.assertEqual(actual,fields);self.assertEqual(len(fields),10)
    self.assertIn("return snapshotData;",common);self.assertEqual(common.count("const snapshotData ="),1)
    for name in("payer-v7.owner","payer-v7.worker","service-v7.owner","service-v7.worker","service-window-v7.owner"):
        source=(repo/("qualification/capacity-native-current-"+name+".draft.mjs")).read_text()
        self.assertIn("captureNativeCapacityRoleNamespaceDataV7 as CAPTURE_ROLE_DATA",source)
        self.assertIn("CAPTURE_ROLE_DATA(",source);self.assertNotIn("currentV5Application154Preserved",source)
    summary["sharedNamespaceSourceEdges"]=dict(exactFields=10,actualConsumers=6,immutableLoaderSnapshotReused=True,
        nodeContractExecutionClaimedByPython=False)
check("all_genuine_v7_loader_worker_owner_sources_use_the_same_closed_namespace_contract",shared_namespace_fields)
def genuine_bare_edges(self):
    selected=selection["childSelection"];rows={r["path"]for r in selected["rows"]}
    self.assertEqual(len(selected["bareBindings"]),22)
    for edge in selected["bareBindings"]:self.assertIn(edge["parent"],rows);self.assertIn(edge["target"],rows)
    for role,spec in selected["roleSpecs"].items():
        self.assertEqual(spec["kind"],"NATIVE_CAPACITY_CURRENT_"+role+"_NODE24_V7")
        for field in("entry","preloader"):self.assertIn("-v7.",spec[field]);self.assertIn(spec[field],rows)
    source=(repo/"qualification/capacity-native-current-offered-pair-v6.supervisor.draft.mjs").read_text()
    self.assertIn("one-reviewed-native-capacity-current-roles-v7",source)
    self.assertIn("profileVersion!==7",source)
    summary["genuineSourceBindingData"]=dict(bareEdges=22,parentProtocol=9,leafProtocol=7,nativeBuiltinAliases=0,sourceTransforms=0)
check("genuine_v7_role_entries_and_all_22_bare_edges_are_members_of_the_current_full_graph",genuine_bare_edges)
def effect_parity(self):
    old=load_control("qualification/native_capacity_current_offered_resource_v4.py","retained_v4_resource_for_rpc_revision")
    before=old.resource_plan(WORKLOAD);after=resource.resource_plan(WORKLOAD)
    changed={k for k in before if before[k]!=after[k]}
    expected={"childApplicationFiles","childProfileVersion","childSourceRows","childSourceRowsSha256","parentApplicationFiles",
        "parentProfileProducerSha256","parentProfileVersion","parentSourceRows","parentSourceRowsSha256","sourceSelectionSha256"}
    self.assertEqual(set(before),set(after));self.assertEqual(changed,expected)
    self.assertEqual({k:v for k,v in before.items()if k not in expected},{k:v for k,v in after.items()if k not in expected})
    summary["nativeEffectsUnchangedOutsideMetadata"]=dict(fieldsCompared=len(after),changedMetadataFields=sorted(changed),
        taskQuotaBytes=after["taskQuotaBytes"],loopbackConnections=after["loopbackTcpConnectionsMaximum"],
        nodeTimeoutSeconds=after["nodeTimeoutSeconds"],nonceCandidates=after["nonceCandidatesTotalReserved"])
check("all_native_reservations_policy_and_effect_fields_equal_previous_generation_except_ten_source_metadata_fields",effect_parity)
def unchanged_storage_control(self):
    old=ast.parse((repo/"qualification/run-capacity-native-current-offered-v5.local.py").read_bytes())
    new=ast.parse((repo/"qualification/run-capacity-native-current-offered-v6.local.py").read_bytes())
    selected=("capacity","reservation_capture","reservation_snapshot","reservation_capacity_data","_capacity_required_bytes",
        "annotate_capacity_refusal","capacity_refusal_data","native_storage_preflight")
    for name in selected:
        a=next(n for n in old.body if isinstance(n,ast.FunctionDef)and n.name==name)
        b=next(n for n in new.body if isinstance(n,ast.FunctionDef)and n.name==name)
        self.assertEqual(ast.dump(a,include_attributes=False),ast.dump(b,include_attributes=False))
    summary["unchangedNativeStorageFunctions"]=len(selected)
check("current_native_storage_refusal_and_reservation_functions_remain_ast_identical",unchanged_storage_control)
def complete_context_dimensions(self):
    source=(repo/"qualification/run-capacity-native-current-offered-v6.local.py").read_text()
    for text in('info["sourceFilesRead"]==588','info.get("parentApplicationFiles")==184','info.get("childApplicationFiles")==173'):
        self.assertIn(text,source)
    self.assertNotIn("CURRENT_OFFERED_V5_",source)
check("full_installed_context_guard_source_binds_588_rows_184_parent_and_173_leaf_files",complete_context_dimensions)
def no_native_authority(self):
    self.assertFalse(launch["nativeExecuted"]);self.assertFalse(launch["nativeAllowanceGranted"]);self.assertEqual(launch["authority"],"NONE")
    child_manifest=json.loads((repo/child.MANIFEST).read_bytes())
    self.assertFalse(child_manifest["nativeExecuted"]);self.assertFalse(child_manifest["historicalFilesModified"])
    self.assertEqual(child_manifest["nativeAuthority"],"NOT_GRANTED")
    self.assertFalse(resource.resource_plan(WORKLOAD)["nativeAllowanceGranted"])
check("source_graphs_and_full_resource_plan_grant_no_native_allowance_or_production_authority",no_native_authority)


if __name__=="__main__":
    output=io.StringIO();result=unittest.TextTestRunner(stream=output,verbosity=0).run(unittest.defaultTestLoader.loadTestsFromTestCase(Pipeline))
    print(json.dumps(dict(event="CURRENT_V6_V7_RPC_REBOUND_COMPLETE_MANAGED_PIPELINE_ACTUAL_DATA_NOT_NATIVE",
        testsRun=result.testsRun,failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),
        successful=result.wasSuccessful(),names=names,**summary,auditedEffects=effects,
        installedPackageFilesRead=0,nativeExecuted=False,SDKImported=False,SQLite=False,keysOrSignatures=False,nonce=False,sockets=False,
        profilesWritten=0,managedTasksCreated=0,nativeAllowanceGranted=False,authority="NONE")),flush=True)
    if not result.wasSuccessful():sys.stderr.write(output.getvalue())
    sys.exit(0 if result.wasSuccessful()else 1)

