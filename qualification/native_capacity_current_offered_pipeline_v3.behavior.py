"""Current V4/V5 managed pipeline DATA; no installed package or native entry execution."""
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
LAUNCH="qualification/capacity-native-current-offered-v4.launch-inputs.json"
meta_names=[
 "qualification/native_capacity_current_offered_pipeline_v3.behavior.py",LAUNCH,
 "qualification/native_capacity_current_offered_parent_v4.py","qualification/capacity-native-current-offered-parent-v4.inputs.json",
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
if not(sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode)or os.environ.get("X402_CURRENT_V4_PIPELINE_DATA_SELECTION")!="complete-v4-v5-packed-pipeline-data-only":
    raise ValueError("EXPLICIT_CURRENT_PIPELINE_DATA")
if launch_sha!=os.environ.get("X402_CURRENT_V4_LAUNCH_MANIFEST_SHA256"):raise ValueError("EXPLICIT_CURRENT_LAUNCH_DIGEST")
pins={row["path"]:row for row in launch["pythonControls"]}
def load_control(relative,label):
    path=repo/relative;raw=path.read_bytes()
    selected=pins[relative]
    if hashlib.sha256(raw).hexdigest()!=selected["sha256"]or len(raw)!=selected["bytes"]:raise ValueError("EXACT_CURRENT_PIPELINE_CODE")
    spec=importlib.util.spec_from_file_location(label,path);value=importlib.util.module_from_spec(spec);sys.modules[label]=value
    exec(spec.loader.source_to_code(raw,str(path)),value.__dict__);return value
p=load_control("qualification/native_capacity_current_offered_parent_v4.py","pipeline_v2_actual_parent")
deps=p.load_dependencies(repo);base,legacy,child,child_deps=deps
selection=p.capture_selection(repo,deps,(repo/p.MANIFEST).read_bytes())
allowed.update(str(repo/row["path"][4:])for row in selection["rows"]if row["path"].startswith("app/"))
resource=load_control("qualification/native_capacity_current_offered_resource_v3.py","pipeline_v2_actual_resource")
command=load_control("qualification/native_capacity_current_offered_command_v3.py","pipeline_v2_actual_command")
capture=load_control("qualification/native_capacity_current_offered_capture_v3.py","pipeline_v2_actual_capture")
launcher=load_control("qualification/run-capacity-native-current-offered-v4.local.py","pipeline_v2_actual_launcher")
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
    self.assertEqual(profile["profileVersion"],7);self.assertEqual(len(profile["inputs"]),567)
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
        self.assertEqual(len(profile["inputs"]),567)
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
    self.assertEqual(len(value["sourceProfile"]["inputs"]),567)
    summary["completeChildProfilesPlannedAndBound"]=32
check("all_32_complete_v5_profiles_bind_to_the_full_v3_parent_and_command",all_32)
def headers(self):
    effects=resource.resource_plan(WORKLOAD)
    self.assertEqual(effects["sourceSelectionSha256"],launch["profileSelection"]["sha256"])
    self.assertEqual(effects["parentProfileProducerSha256"],pins["qualification/native_capacity_current_offered_parent_v4.py"]["sha256"])
    self.assertEqual(effects["parentProfileVersion"],7);self.assertEqual(effects["childProfileVersion"],5)
    self.assertEqual(effects["parentSourceRows"],567);self.assertEqual(effects["childSourceRows"],558)
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
    self.assertEqual(admitted["sourceAdmissionFacts"]["applicationFilesVerified"],163)
    self.assertEqual(admitted["sourceAdmissionFacts"]["applicationCodeBytesRetained"],0)
    self.assertFalse(any(Path(name).suffix in(".js",".mjs")for name in admitted["inputs"]))
    before=len(recheck_opens);recheck_phase=True
    try:admitted["unchanged"]()
    finally:recheck_phase=False
    self.assertEqual(recheck_opens[before:],[])
    summary["sourceAdmissionFacts"]=admitted["sourceAdmissionFacts"];summary["actualUnchangedOpenEvents"]=0
check("actual_source_admission_verifies_163_files_and_rechecks_without_source_byte_reads",actual_source)
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
    self.assertEqual(value["currentApplicationFilesRead"],163);self.assertFalse(value["nativeExecuted"])
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
        membership_change=False,reservation_fault=None):
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
        if reservation_fault is not None and index==reservation_fault:raise ValueError("DECLARED_RESERVATION_READ_FAILURE")
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
    originals=launcher.read,launcher.reservation_snapshot,launcher.subprocess.run,launcher.os.statvfs
    launcher.read=read_metadata;launcher.reservation_snapshot=snapshot
    launcher.subprocess.run=mount_query;launcher.os.statvfs=available
    result=error=None
    try:
        try:result=launcher.capacity(volume,uuid,root,common,resource.resource_plan(WORKLOAD),own_task)
        except (ValueError,AssertionError)as problem:error=problem
    finally:
        launcher.read,launcher.reservation_snapshot,launcher.subprocess.run,launcher.os.statvfs=originals
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
    actual=ast.parse((repo/"qualification/run-capacity-native-current-offered-v4.local.py").read_bytes())
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
    new=ast.parse((repo/"qualification/native_capacity_current_offered_resource_v3.py").read_bytes())
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
    value=legacy_fresh_outer(*args,**kwargs);value["result"]["nativeOfferedCapacityWorkloadAdapterVersion"]=5;value["offeredCaptureVersion"]=3;return value
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
    self.assertTrue(packed_names.issubset(rows));self.assertEqual(len(rows),567)
    self.assertEqual(sum(name.startswith("app/")for name in rows),163)
    child_names={row["path"]for row in selection["childSelection"]["rows"]}
    self.assertEqual(len(child_names),558);self.assertFalse(child_names.intersection(packed_names))
    self.assertEqual(len(selection["extraRows"]),9)
    self.assertEqual(p.CHILD_SEAL,"be5952dbf0e5fe17dbdd16549f2ac039802abbb92f541deb31c2591f4db653d7")
    summary["packedSourceGraph"]=dict(parentRows=567,parentApplications=163,parentPackages=404,childRows=558,
        childApplications=154,childPackages=404,packedComponents=3,parentOnlyExtensions=9)
check("packed_parent_adds_three_actual_components_without_replacing_any_v5_child_row",packed_graph_closure)
def native_source_edges(self):
    adapter=(repo/"qualification/capacity-native-current-offered-adapter-v5.draft.mjs").read_text()
    entry=(repo/"qualification/capacity-native-current-offered-v4.entry.draft.mjs").read_text()
    preload=(repo/"qualification/capacity-native-current-offered-v4.namespace.preload.draft.mjs").read_text()
    workload=(repo/"src/service-credit-capacity-offered-workload-packed-owner-core.js").read_text()
    window=(repo/"src/service-credit-capacity-offered-window-packed-owner-core.js").read_text()
    self.assertIn("createServiceCreditCapacityOfferedWorkloadPackedOwnerCore as CREATE_CORE",adapter)
    self.assertIn("../src/service-credit-capacity-offered-workload-packed-owner-core.js",adapter)
    self.assertIn("createNativeCapacityCurrentOfferedAdapterV5:CREATE",entry)
    self.assertIn("capacity-native-current-offered-adapter-v5.draft.mjs",entry)
    self.assertIn("createServiceCreditCapacityRecorderPacked",workload);self.assertIn("createServiceCreditCapacityOfferedWindowPackedOwnerCore",workload)
    self.assertIn("createServiceCreditCapacityRecorderPacked",window)
    self.assertIn("profile.profileVersion !== 7",preload);self.assertIn("profile.inputs.length !== 567",preload)
    self.assertIn("applications !== 163",preload)
    self.assertIn("one-reviewed-native-capacity-current-offered-parent-v4",preload)
    self.assertIn("nativeCapacityCurrentOfferedSupervisorNamespaceSnapshotV4()",preload)
    self.assertIn("namespace.applicationFiles!==163",entry);self.assertIn("offeredCaptureVersion:3",entry)
    self.assertIn("nativeOfferedCapacityWorkloadAdapterVersion===5",entry)
    summary["packedNativeSourceEdgesChecked"]=7
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

if __name__=="__main__":
    output=io.StringIO();result=unittest.TextTestRunner(stream=output,verbosity=0).run(unittest.defaultTestLoader.loadTestsFromTestCase(Pipeline))
    print(json.dumps(dict(event="CURRENT_V4_V5_COMPLETE_MANAGED_PIPELINE_ACTUAL_DATA_NOT_NATIVE",
        testsRun=result.testsRun,failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),
        successful=result.wasSuccessful(),names=names,**summary,auditedEffects=effects,
        installedPackageFilesRead=0,nativeExecuted=False,SDKImported=False,SQLite=False,keysOrSignatures=False,nonce=False,sockets=False,
        profilesWritten=0,managedTasksCreated=0,nativeAllowanceGranted=False,authority="NONE")),flush=True)
    if not result.wasSuccessful():sys.stderr.write(output.getvalue())
    sys.exit(0 if result.wasSuccessful()else 1)

