"""Current V3/V5 managed pipeline DATA; no installed package or native entry execution."""
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

repo=Path(__file__).absolute().parents[1]
LAUNCH="qualification/capacity-native-current-offered-v3.launch-inputs.json"
meta_names=[
 "qualification/native_capacity_current_offered_pipeline_v2.behavior.py",LAUNCH,
 "qualification/native_capacity_current_offered_parent_v3.py","qualification/capacity-native-current-offered-parent-v3.inputs.json",
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
if not(sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode)or os.environ.get("X402_CURRENT_V3_PIPELINE_DATA_SELECTION")!="complete-v3-v5-managed-pipeline-data-only":
    raise ValueError("EXPLICIT_CURRENT_PIPELINE_DATA")
if launch_sha!=os.environ.get("X402_CURRENT_V3_LAUNCH_MANIFEST_SHA256"):raise ValueError("EXPLICIT_CURRENT_LAUNCH_DIGEST")
pins={row["path"]:row for row in launch["pythonControls"]}
def load_control(relative,label):
    path=repo/relative;raw=path.read_bytes()
    selected=pins[relative]
    if hashlib.sha256(raw).hexdigest()!=selected["sha256"]or len(raw)!=selected["bytes"]:raise ValueError("EXACT_CURRENT_PIPELINE_CODE")
    spec=importlib.util.spec_from_file_location(label,path);value=importlib.util.module_from_spec(spec);sys.modules[label]=value
    exec(spec.loader.source_to_code(raw,str(path)),value.__dict__);return value
p=load_control("qualification/native_capacity_current_offered_parent_v3.py","pipeline_v2_actual_parent")
deps=p.load_dependencies(repo);base,legacy,child,child_deps=deps
selection=p.capture_selection(repo,deps,(repo/p.MANIFEST).read_bytes())
allowed.update(str(repo/row["path"][4:])for row in selection["rows"]if row["path"].startswith("app/"))
resource=load_control("qualification/native_capacity_current_offered_resource_v2.py","pipeline_v2_actual_resource")
command=load_control("qualification/native_capacity_current_offered_command_v2.py","pipeline_v2_actual_command")
capture=load_control("qualification/native_capacity_current_offered_capture_v2.py","pipeline_v2_actual_capture")
launcher=load_control("qualification/run-capacity-native-current-offered-v3.local.py","pipeline_v2_actual_launcher")
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
    self.assertEqual(profile["profileVersion"],6);self.assertEqual(len(profile["inputs"]),566)
    self.assertEqual(profile["childSourceRowsSha256"],p.CHILD_SEAL);self.assertEqual(len(profile["childProfiles"]),2)
    self.assertIn("offered-v3",value["argv"][-2]);self.assertEqual(value["envDelta"]["X402_NATIVE_CAPACITY_RUN_SCOPE"],command.NATIVE_SCOPE)
    self.assertEqual(value["stdoutLimit"],458752);self.assertFalse(value["summary"]["nativeCommandExecuted"])
check("whole_current_parent_entry_and_exact_v3_command_are_bound",full)

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
        self.assertEqual(len(profile["inputs"]),566)
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
    self.assertEqual(len(value["sourceProfile"]["inputs"]),566)
    summary["completeChildProfilesPlannedAndBound"]=32
check("all_32_complete_v5_profiles_bind_to_the_full_v3_parent_and_command",all_32)
def headers(self):
    effects=resource.resource_plan(WORKLOAD)
    self.assertEqual(effects["sourceSelectionSha256"],launch["profileSelection"]["sha256"])
    self.assertEqual(effects["parentProfileProducerSha256"],pins["qualification/native_capacity_current_offered_parent_v3.py"]["sha256"])
    self.assertEqual(effects["parentProfileVersion"],6);self.assertEqual(effects["childProfileVersion"],5)
    self.assertEqual(effects["parentSourceRows"],566);self.assertEqual(effects["childSourceRows"],558)
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
    self.assertEqual(admitted["sourceAdmissionFacts"]["applicationFilesVerified"],162)
    self.assertEqual(admitted["sourceAdmissionFacts"]["applicationCodeBytesRetained"],0)
    self.assertFalse(any(Path(name).suffix in(".js",".mjs")for name in admitted["inputs"]))
    before=len(recheck_opens);recheck_phase=True
    try:admitted["unchanged"]()
    finally:recheck_phase=False
    self.assertEqual(recheck_opens[before:],[])
    summary["sourceAdmissionFacts"]=admitted["sourceAdmissionFacts"];summary["actualUnchangedOpenEvents"]=0
check("actual_source_admission_verifies_162_files_and_rechecks_without_source_byte_reads",actual_source)
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
    self.assertEqual(value["currentApplicationFilesRead"],162);self.assertFalse(value["nativeExecuted"])
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

def call_binding(self):
    actual=ast.parse((repo/"qualification/run-capacity-native-current-offered-v3.local.py").read_bytes())
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
    new=ast.parse((repo/"qualification/native_capacity_current_offered_resource_v2.py").read_bytes())
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
    value=legacy_fresh_outer(*args,**kwargs);value["result"]["nativeOfferedCapacityWorkloadAdapterVersion"]=4;return value
fixtures["outer_fixture"]=outer_fixture
start=next(i for i,n in enumerate(fixture_tree.body)if isinstance(n,ast.Assign)and any(isinstance(v,ast.Name)and v.id=="mutations"for v in n.targets))
end=next(i for i,n in enumerate(fixture_tree.body[start:],start)if isinstance(n,ast.For)and isinstance(n.iter,ast.Name)and n.iter.id=="mutations")
exec(compile(ast.Module(body=fixture_tree.body[start:end],type_ignores=[]),str(fixture_path),"exec"),fixtures)
def validate_fixture(v):
    raw=fixtures["frame"](v);return capture.validate(resource,raw,b"",fixtures["receipt"](raw),WORKLOAD,RUN)
for label,count,busy,miss in[("partial",2,1,1),("all_missed",0,0,4),("all_dispatched",4,0,0)]:
    def run(self,count=count,busy=busy,miss=miss):
        value=validate_fixture(outer_fixture(count,busy,miss))
        self.assertEqual(value["dispatchedGlobalMeasuredOriginals"],count);self.assertEqual(value["currentOfferedCaptureDataVersion"],2)
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
if __name__=="__main__":
    output=io.StringIO();result=unittest.TextTestRunner(stream=output,verbosity=0).run(unittest.defaultTestLoader.loadTestsFromTestCase(Pipeline))
    print(json.dumps(dict(event="CURRENT_V3_V5_COMPLETE_MANAGED_PIPELINE_ACTUAL_DATA_NOT_NATIVE",
        testsRun=result.testsRun,failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),
        successful=result.wasSuccessful(),names=names,**summary,auditedEffects=effects,
        installedPackageFilesRead=0,nativeExecuted=False,SDKImported=False,SQLite=False,keysOrSignatures=False,nonce=False,sockets=False,
        profilesWritten=0,managedTasksCreated=0,nativeAllowanceGranted=False,authority="NONE")),flush=True)
    if not result.wasSuccessful():sys.stderr.write(output.getvalue())
    sys.exit(0 if result.wasSuccessful()else 1)

