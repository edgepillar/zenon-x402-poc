"""Current offered full managed pipeline DATA; no native application imports."""
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
allowed.update({str(repo/name)for name in ["qualification/native_capacity_current_offered_resource_v1.py","qualification/native_capacity_current_offered_command_v1.py","qualification/native_capacity_current_offered_capture_v1.py","qualification/run-capacity-native-current-offered-v2.local.py","qualification/capacity-native-current-offered-v2.launch-inputs.json","qualification/capacity-native-current-offered-v2.plan.json","qualification/native_capacity_current_offered_pipeline_v1.behavior.py","qualification/run-capacity-native-paced-timer-managed-v3.local.py","qualification/run-capacity-native-workload-v3.local.py","qualification/funding_tls_current_gate.py"]})
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
        "X402_CURRENT_OFFERED_PIPELINE_DATA_SELECTION")!="current-offered-pipeline-data-v1":
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
expected="054b375cd88495796e533749be7e332e7e2d62829beb595b27d33ebe7024f36c"
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

allowed.update(str(repo/row["path"][4:])for row in selection["rows"]if row["path"].startswith("app/"))
launch_raw=p.read_owned(repo/"qualification/capacity-native-current-offered-v2.launch-inputs.json",65536)[0]
if hashlib.sha256(launch_raw).hexdigest()!=os.environ.get("X402_CURRENT_OFFERED_LAUNCH_MANIFEST_SHA256"):
    raise ValueError("CURRENT_LAUNCH_MANIFEST_PIN")
launch=json.loads(launch_raw)
control_pins={row["path"]:row for row in launch["pythonControls"]}
def load_control(relative,label):
    data,_=p.read_owned(repo/relative,131072)
    if base.pin(relative,data)!=control_pins[relative]:raise ValueError("ACTUAL_PINNED_PIPELINE_CONTROL")
    spec=importlib.util.spec_from_file_location(label,repo/relative)
    module=importlib.util.module_from_spec(spec);sys.modules[label]=module
    exec(spec.loader.source_to_code(data,str(repo/relative)),module.__dict__)
    return module
resource=load_control("qualification/native_capacity_current_offered_resource_v1.py","current_offered_actual_resource_v1")
command=load_control("qualification/native_capacity_current_offered_command_v1.py","current_offered_actual_command_v1")
capture=load_control("qualification/native_capacity_current_offered_capture_v1.py","current_offered_actual_capture_v1")
launcher=load_control("qualification/run-capacity-native-current-offered-v2.local.py","current_offered_actual_managed_launcher_v2")
WORKLOAD=json.loads(p.read_owned(repo/"qualification/capacity-native-current-offered-v2.plan.json",65536)[0])
STORE="/synthetic-current-store"
TASK_ROOT=STORE+"/tasks/"+"2"*32+"/scratch"
ROOT=dict(path=TASK_ROOT,identity=["1","800",str(os.getuid()),"20",str(stat.S_IFDIR|0o700)])
RUN="a"*64

def command_case(workload=None):
    value=copy.deepcopy(WORKLOAD if workload is None else workload);plans=planner();children=[]
    for n,lane in enumerate(value["laneIds"],1):
        for i,role in enumerate(("PAYER","SERVICE")):
            root=dict(path=TASK_ROOT+"/lanes/"+format(n,"02d")+"/"+role.lower(),
                identity=["1",str(900+2*n+i),str(os.getuid()),"20",str(stat.S_IFDIR|0o700)])
            built=plans.plan_child(role,dict(runId=RUN,laneId=lane),root);raw=built["profileBytes"]
            dto=base._private_json(raw,524288)
            children.append(dict(reference=dict(role=role,laneId=lane,path=STORE+"/objects/"+built["profileSha256"],
                sha256=built["profileSha256"],entryURL=dto["entryURL"],preloaderURL=dto["preloaderURL"],
                rootPath=root["path"],rootIdentity=root["identity"]),profileBytes=raw))
    assembly=command.assemble(plans,resource,value,RUN,ROOT,children)
    def retained(raw):
        digest=hashlib.sha256(raw).hexdigest()
        return dict(path=STORE+"/objects/"+digest,sha256=digest,raw=raw)
    return dict(planner=plans,resource=resource,workload=value,effects=assembly["resourcePlan"],repo=APP,node="/synthetic-node24",
        task_root=TASK_ROOT,parent_input=retained(assembly["parentProfile"]["profileBytes"]),
        entry_input=retained(assembly["entryPlan"]["planBytes"]),run_id=RUN,children=children)
CASE=command_case()
def case():
    return {k:(v if k in("planner","resource")else copy.deepcopy(v))for k,v in CASE.items()}
class Pipeline(unittest.TestCase):maxDiff=400
names=[]
def check(name,fn):
    names.append(name)
    def body(self):fn(self)
    body.__name__="test_"+name;setattr(Pipeline,body.__name__,body)
def default_command(self):
    result=command.plan(**case())
    self.assertEqual(result["summary"]["parentSourceRows"],564)
    self.assertEqual(result["summary"]["childSourceRows"],557)
    self.assertEqual(result["envDelta"]["X402_NATIVE_CAPACITY_RUN_SCOPE"],command.NATIVE_SCOPE)
    self.assertTrue(result["argv"][-2].endswith(command.ENTRY));self.assertEqual(result["argv"][-1],TASK_ROOT)
    self.assertEqual(result["stdoutLimit"],CASE["effects"]["nodeStdoutLimit"])
    self.assertEqual(result["stderrLimit"],1048576)
    self.assertFalse(result["summary"]["nativeCommandExecuted"])
check("whole_current_564_parent_and_557_children_bind_actual_entry_and_every_command_limit",default_command)
def all_lanes(self):
    value=copy.deepcopy(WORKLOAD);value["laneIds"]=["lane."+str(n)for n in range(16)]
    value["recordingLimits"]=dict(maxSamplesPerPhase=512,maxInFlightPerPhase=16)
    v=command_case(value);out=command.plan(**v)
    self.assertEqual(out["summary"]["childProfiles"],32)
    self.assertEqual(v["effects"]["globalMeasuredOriginalsMaximum"],4)
    self.assertEqual(v["effects"]["fundedServiceCallsReservedAllLanes"],80)
    self.assertEqual(v["effects"]["nodeChildProcessesMaximum"],32)
check("all_sixteen_lanes_use_complete_current_profiles_without_dividing_the_global_calendar",all_lanes)
for field,value in CASE["effects"].items():
    def reject(self,field=field,value=value):
        v=case();v["effects"][field]=(not value)if type(value)is bool else value+1 if type(value)is int else str(value)+"x"
        with self.assertRaises(ValueError):command.plan(**v)
    check("command_rejects_changed_resource_"+field,reject)
def mutate_retained(v,name,edit):
    value=command.decode(v[name]["raw"],524288);edit(value)
    raw=resource.canonical_bytes(value);digest=hashlib.sha256(raw).hexdigest()
    v[name]=dict(path=STORE+"/objects/"+digest,sha256=digest,raw=raw)
def reject_command(name,edit):
    def run(self):
        v=case();edit(v)
        with self.assertRaises((ValueError,TypeError)):command.plan(**v)
    check("complete_command_refuses_"+name,run)
reject_command("different_run",lambda v:v.update(run_id="b"*64))
reject_command("different_task_root",lambda v:v.update(task_root=TASK_ROOT+"other"))
reject_command("different_source_root",lambda v:v.update(repo="/different-current-source"))
reject_command("parent_cas_path_redirect",lambda v:v["parent_input"].update(path="/foreign/objects/"+v["parent_input"]["sha256"]))
reject_command("child_cas_path_redirect",lambda v:v["children"][0]["reference"].update(path="/foreign/objects/"+v["children"][0]["reference"]["sha256"]))
reject_command("one_missing_original_child",lambda v:v["children"].pop())
reject_command("reversed_original_children",lambda v:v["children"].reverse())
reject_command("changed_original_child_bytes",lambda v:v["children"][0].update(profileBytes=v["children"][0]["profileBytes"]+b" "))
reject_command("truncated_whole_parent",lambda v:v["parent_input"].update(raw=v["parent_input"]["raw"][:-1]))
reject_command("old_parent_version_with_new_digest",lambda v:mutate_retained(v,"parent_input",lambda x:x.update(profileVersion=3)))
reject_command("old_child_source_seal_with_new_digest",lambda v:mutate_retained(v,"parent_input",lambda x:x.update(childSourceRowsSha256="d756740994aeb53ebeee47320d732583d96381dfa8c00e18a30f414e70a77027")))
reject_command("missing_parent_row_with_new_digest",lambda v:mutate_retained(v,"parent_input",lambda x:x["inputs"].pop()))
reject_command("changed_parent_binding_with_new_digest",lambda v:mutate_retained(v,"parent_input",lambda x:x["bareBindings"][-1].update(targetURL="file:///wrong")))
reject_command("changed_runtime_with_new_digest",lambda v:mutate_retained(v,"parent_input",lambda x:x["runtime"].update(node="26.0.0")))
reject_command("changed_entry_calendar_with_new_digest",lambda v:mutate_retained(v,"entry_input",lambda x:x["plan"].update(arrivalIntervalMs=1)))
reject_command("changed_entry_profile_with_new_digest",lambda v:mutate_retained(v,"entry_input",lambda x:x["laneProfiles"][0]["payerProfile"].update(sha256="0"*64)))
reject_command("extra_entry_field_with_new_digest",lambda v:mutate_retained(v,"entry_input",lambda x:x.update(retry=True)))
def stderr_reservation(self):
    r=resource.resource_plan(WORKLOAD)
    self.assertLess(r["nodeStdoutLimit"],1048576)
    self.assertEqual(r["nodeStderrLimit"],1048576);self.assertEqual(r["opensslStderrLimit"],1048576)
    self.assertEqual(r["commandStreamsBytesReserved"],r["nodeStdoutLimit"]+16384+2*1048576)
check("existing_store_stderr_policy_is_reserved_independently_for_both_commands",stderr_reservation)
def overflow(self):
    v=copy.deepcopy(WORKLOAD);v["laneIds"]=["lane."+str(n)for n in range(16)]
    v["plan"].update(warmupCallsPerLane=255,measurementCallsPerLane=1,measurementWindowMs=1,arrivalIntervalMs=1,maxLedgerTransactionsPerOperation=1)
    v["recordingLimits"]=dict(maxSamplesPerPhase=4096,maxInFlightPerPhase=16)
    r=resource.resource_plan(v)
    self.assertFalse(r["captureReservationFitsEntryCap"]);self.assertGreater(r["requestedNodeStdoutLimit"],r["entryCaptureMaximum"])
    self.assertFalse(r["automaticSampleReduction"])
    with self.assertRaises(ValueError):resource.storage_policy(v)
check("full_reservation_overflow_refuses_without_shrinking_the_workload",overflow)
def policy(self):
    r=resource.resource_plan(WORKLOAD);v=resource.storage_policy(WORKLOAD);before=copy.deepcopy(v)
    self.assertTrue(launcher.policy_admits_existing_store(v,r));self.assertEqual(v,before)
    v["max_output_bytes"]=16*1048576
    self.assertTrue(launcher.policy_admits_existing_store(v,r))
    for key in("min_free_bytes","task_quota_bytes","scratch_quota_bytes","store_quota_bytes","metadata_quota_bytes"):
        bad=copy.deepcopy(v);bad[key]=0
        with self.assertRaises(ValueError):launcher.policy_admits_existing_store(bad,r)
check("existing_store_policy_is_compared_without_rewriting_or_adopting_a_root",policy)
def capacity(self):
    r=resource.resource_plan(WORKLOAD);reserved=359683588096
    need=r["requiredFreeBytesBeforeOtherReservations"]+reserved
    with self.assertRaises(ValueError):launcher.capacity_data(need-1,reserved,r,25)
    got=launcher.capacity_data(need,reserved,r,25);self.assertEqual(got["requiredBytes"],need)
    self.assertEqual(got["reservedBytes"],reserved)
check("all_other_store_reservations_stay_additive_and_one_byte_short_refuses",capacity)
def source_context(self):
    with self.assertRaises(ValueError):launcher.validate_full_source_context(CASE["planner"])
check("synthetic_registry_context_cannot_be_upgraded_to_installed_native_admission",source_context)
def native_selection(self):
    import argparse
    args=argparse.Namespace(native_selection="old-clean",approval_launch_sha256="a"*64,manifest_sha256="a"*64,
        approval_plan_sha256=CASE["effects"]["workloadPlanSha256"],execute=True,pre_native_plan=False)
    with self.assertRaises(ValueError):launcher.native_intent(args,CASE["effects"])
    args.native_selection=launcher.NATIVE_SELECTION;args.approval_plan_sha256="b"*64
    with self.assertRaises(ValueError):launcher.native_intent(args,CASE["effects"])
check("old_clean_or_r4_scope_and_changed_plan_cannot_admit_current_offered_execution",native_selection)
def source_cli(self):
    import contextlib
    output=io.StringIO()
    with contextlib.redirect_stdout(output):
        code=launcher.main(["--repo",str(repo),"--manifest-sha256",hashlib.sha256(launch_raw).hexdigest()])
    self.assertEqual(code,0);event=json.loads(output.getvalue())
    self.assertFalse(event["nativeExecuted"]);self.assertEqual(event["currentApplicationFilesRead"],160)
check("real_default_cli_is_source_only_without_any_private_native_argument",source_cli)
def source_cli_private(self):
    with self.assertRaises(ValueError):
        launcher.main(["--repo",str(repo),"--manifest-sha256",hashlib.sha256(launch_raw).hexdigest(),
            "--source-only","--node","/must-not-open-native-input"])
check("source_only_cli_refuses_private_native_arguments_before_source_or_native_setup",source_cli_private)
def old_scope_cli(self):
    import contextlib
    output=io.StringIO()
    with contextlib.redirect_stdout(output),self.assertRaises(ValueError):
        launcher.main(["--repo",str(repo),"--manifest-sha256",hashlib.sha256(launch_raw).hexdigest(),
            "--execute","--native-selection","old-r4","--approval-launch-sha256",hashlib.sha256(launch_raw).hexdigest(),
            "--approval-plan-sha256",CASE["effects"]["workloadPlanSha256"]])
check("real_execute_cli_refuses_old_r4_scope_before_package_node_root_or_manager_access",old_scope_cli)
def wrong_plan_cli(self):
    import contextlib
    output=io.StringIO()
    with contextlib.redirect_stdout(output),self.assertRaises(ValueError):
        launcher.main(["--repo",str(repo),"--manifest-sha256",hashlib.sha256(launch_raw).hexdigest(),
            "--pre-native-plan","--native-selection",launcher.NATIVE_SELECTION,
            "--approval-launch-sha256",hashlib.sha256(launch_raw).hexdigest(),"--approval-plan-sha256","0"*64])
check("real_pre_native_cli_refuses_changed_plan_before_installed_source_admission",wrong_plan_cli)
source_gate_summary=None
def source_gate(self):
    global source_gate_summary
    admitted=launcher.source_admission(str(repo),hashlib.sha256(launch_raw).hexdigest())
    self.assertEqual(admitted["effects"],resource.resource_plan(WORKLOAD));admitted["unchanged"]()
    self.assertEqual(admitted["manifest"]["effectsCeiling"]["parentSourceRows"],564)
    source_gate_summary=dict(actualApplicationFilesRead=160,installedPackageFilesRead=0,managerImported=False,nativeExecuted=False)
check("actual_source_only_launcher_composes_all_current_160_application_sources_and_real_controls",source_gate)
def metadata(self):
    self.assertEqual(launcher.metadata(b'{"created":1.25}')["created"],1.25)
    with self.assertRaises(ValueError):launcher.strict(b'{"created":1.25}')
check("finite_metadata_timestamps_do_not_relax_strict_workload_json",metadata)

def metric(n,value=1):
    return dict(samples=n,**{k:(str(value)if n else None)for k in("min","p50","p95","p99","max")})
def scalar_record(funding=0,calls=0):
    phases={}
    for name,n in(("FUNDING",funding),("FUNDED_CALL",calls),("LEDGER_TRANSACTION",0)):
        phases[name]=dict(entered=n,settled=n,pending=0,succeeded=n,rejected=0,unknown=0,peakInFlight=min(n,1),
            nonSuccessFraction=None if n==0 else dict(numerator=0,denominator=n),
            terminalLatencyNanoseconds=metric(n),successfulLatencyNanoseconds=metric(n))
    return dict(capacityRecorderVersion=1,scope="CALLER_DECLARED_OBSERVATIONS_ONLY",clock="CALLER_SUPPLIED_MONOTONIC_NANOSECONDS",
        percentileMethod="NEAREST_RANK",recordingState="COMPLETE"if funding+calls else"EMPTY",recordingIssue=None,
        stopReason=None,limits=copy.deepcopy(WORKLOAD["recordingLimits"]),refusedStarts=0,pendingObservations=0,
        observedSpanNanoseconds="1"if funding+calls else None,phases=phases,
        ledgerBalanceChecks=dict(samples=0,mismatches=0,result="NOT_RECORDED"),capacityQualification="NOT_ESTABLISHED",
        ledgerCorrectness="NOT_ESTABLISHED",authenticatedExecution=False,liveOrProduction=False,authority="NONE")
def outer_fixture(dispatched=2,busy=1,missed=1):
    intervals=[];attribution=[];groups={co:{kind:[]for kind in capture.WINDOW_CLASSES}for co in capture.COHORTS}
    originals=[("CONTROL",None,10),("WARMUP",0,30)]+[("MEASUREMENT",i,110+10*i)for i in range(dispatched)]
    for number,(co,ordinal,t)in enumerate(originals,1):
        kind="BEFORE"if co!="MEASUREMENT"else"INSIDE"
        raw=dict(ordinal=number,commandClass="CONTROL"if co=="CONTROL"else"APPLICATION_ORIGINAL",changed=True,
            beforeBeginNs=str(t),afterBeginNs=str(t+1),beforeCommitNs=str(t+2),afterCommitNs=str(t+3),
            bracketElapsedNs="3",insideTransactionElapsedNs="1")
        digest=None if ordinal is None else hashlib.sha256(("native-capacity-original-v1\0"+RUN+"\0lane.01\0"+co+"\0"+str(ordinal)).encode()).hexdigest()
        item=dict(ordinal=number,cohort=co,originalOrdinal=ordinal,windowClass=kind,changed=True,
            bracketElapsedNs="3",insideTransactionElapsedNs="1",originalCommandDigest=digest)
        intervals.append(raw);attribution.append(item);groups[co][kind].append(raw)
    cohorts={}
    for co,classes in groups.items():
        cohorts[co]={kind:dict(writerIntervals=len(rows),changedIntervals=len(rows),
            metricsStatus="WHOLE_DECLARED_BRACKETS_NOT_PURE_SQL"if rows else"NO_MATCHED_SAMPLES",
            writerBracketNs=metric(len(rows),3),insideWriterTransactionNs=metric(len(rows),1))for kind,rows in classes.items()}
    trace=dict(capacityWindowWriterTraceDataVersion=1,status="COMPLETE_DECLARED_WINDOW_TRACE_DATA",reason=None,pagesAccepted=1,
        acceptedIntervals=len(intervals),declaredIntervals=len(intervals),cohortTraceStatus="COMPLETE_DECLARED_TRACE_DATA",
        matchedCompletedOriginals=1+dispatched,clockDomain="SERVICE_CHILD_LOCAL",declaredWindowElapsedNs="100",cohorts=cohorts,
        boundaryEqualityPolicy="CONTACTS_SEPARATE_NO_SUB_NANOSECOND_ORDER_INFERRED",wholeIntervalsNotClipped=True,
        rawIdentifiersIncluded=False,parentAndChildClocksSubtracted=False,nativeEventsAuthenticated=False,nativeResourcesQualified=False,
        measurementWindowIsolationQualified=False,pureSqlLatencyQualified=False,sustainableCapacityQualified=False,authority="NONE")
    empty=hashlib.sha256(b"").hexdigest()
    child_facts=dict(observedBytes=0,retainedBytes=0,overflow=False,eof=True,prefixSha256=empty)
    children=[dict(role=role,exited=True,closed=True,disconnected=True,exitCode=0,signal=None,fault=False,pending=0,
        stdout=copy.deepcopy(child_facts),stderr=copy.deepcopy(child_facts))for role in("PAYER","SERVICE")]
    pair=dict(phase="CLOSED",held=False,completed=1+dispatched,warmupReserved=1,measuredReserved=dispatched,
        freshBalanceReads=3,windowOpenEntered=True,windowStopEntered=True,windowOpenAcknowledged=True,windowStopAcknowledged=True,
        measurementUnknown=False,activeOperation=False,referenceCandidates=1,referenceWindows=1,balancesObserved=True,
        launchAttempts=2,launchUnknown=False,historicalCloseStatus="CLOSED",children=children,nativeQualified=False,capacityQualified=False,authority="NONE")
    row=dict(laneId="lane.01",pairAcquisitionEntered=True,balanceReadsEntered=3,pendingBalanceReads=0,
        balanceObservationRoundTripNs=metric(3,2),timingPages=1,serviceWriterTraceBeforeCloseObserved=True,
        serviceWriterIntervals=len(intervals),writerBracketNs=metric(len(intervals),3),insideWriterTransactionNs=metric(len(intervals),1),
        serviceChildWindowWriterTrace=trace,measurementUnknown=False,closeStatus="RETURNED",held=False)
    kinds=["INIT","OPEN","PREPARE","COMMIT","SUBMIT","BIND"]+["EXECUTE"]*(1+dispatched)+["CLOSE","RELEASE_IPC"]
    commands=[dict(sequence=i,kind=kind,status="OBSERVED_RETURNED_CLOSE"if kind=="CLOSE"else"RELEASING_IPC"if kind=="RELEASE_IPC"else"OBSERVED",
        startNs=str(10*i),endNs=str(10*i+1),lateAfterTimeout=False,clockDomain="PAYER_CHILD_LOCAL",
        timingKind="CHILD_LOCAL_MONOTONIC_OPERATION_NOT_SQL_LATENCY")for i,kind in enumerate(kinds,1)]
    evidence=dict(laneId="lane.01",pairSnapshot=pair,serviceWriterIntervals=intervals,serviceWriterAttribution=attribution,
        serviceMeasurementWindow=dict(windowVersion=1,context=dict(runId=RUN,laneId="lane.01",sourceRowsSha256=capture.GRAPH_SHA),
            clockDomain="SERVICE_CHILD_LOCAL",phase="STOPPED",startNs="100",stopNs="200",stopCause="PARENT_STOP",
            unknown=False,clockReads=2+4*len(intervals)),payerOperationTimings=commands,
        privateStreams=[dict(role=role,stdout=dict(bytes=0,sha256=empty,base64=""),stderr=dict(bytes=0,sha256=empty,base64=""))for role in("PAYER","SERVICE")])
    measure=dict(offeredWindowOwnerVersion=1,scope="TRUSTED_SOURCE_MEASUREMENT_NOT_NATIVE_QUALIFICATION",outcome="OBSERVED_SOURCES_SETTLED",
        issue=None,stopReason="WINDOW_EXPIRED",plan={k:WORKLOAD["plan"][k]for k in("setupBudgetMs","measurementWindowMs","arrivalIntervalMs","drainGraceMs","maxLedgerTransactionsPerOperation")},
        laneCount=1,scheduledSlots=4,evaluatedOffers=dispatched+busy,sourceEntries=dispatched,busyRejectedOffers=busy,
        schedulerMissedSlots=missed,withdrawnSlots=0,pendingOriginalOperations=0,pendingLedgerObservations=0,pendingControlObservations=0,
        peakConcurrentOriginals=min(dispatched,1),queueCapacity=0,opensObserved=1,stopsObserved=1,balanceChecks=2,ledgerStarts=0,
        nominalIntervalNanoseconds="10000000",measurementStartNanoseconds="1000000000",measurementEndNanoseconds="1040000000",
        admissionStoppedNanoseconds="1040000001",dispatchedCallRecording=scalar_record(calls=dispatched),
        sourceStartDelayRecording=scalar_record(calls=dispatched),postStopLedgerRecording=scalar_record(),
        timerScheduleCalls=5,timerCancelReturns=2,borrowedResourcesClosed=False,clockAuthenticated=False,
        fixedOfferedRateQualified=False,sustainableCapacityQualified=False,nativeResourcesQualified=False,productionQualified=False,authority="NONE")
    core=dict(offeredWorkloadOwnerVersion=1,scope="TRUSTED_FUNDED_SOURCE_OWNERS_NOT_NATIVE_QUALIFICATION",outcome="OBSERVED_SOURCE_OWNERS_RETURNED",
        issue=None,stopReason="MEASUREMENT_FINISHED",plan=dict(WORKLOAD["plan"],closeGraceMs=6000),fundingEntries=1,warmupEntries=1,
        fundingBalanceChecks=1,prefixLedgerStarts=0,peakPrefixOriginals=1,pendingPrefixOriginals=0,pendingPrefixLedger=0,
        pendingFundingBalanceReads=0,pendingOwnerCloses=0,measurementPending=False,prefixRecording=scalar_record(funding=1,calls=1),
        postStopPrefixLedgerRecording=scalar_record(),offeredMeasurement=measure,
        lanes=[dict(funded=True,warmupCompleted=1,closeEntered=True,closeOutcome="RETURNED")],
        sourceOwnersCloseRequested=True,actualResourceLifetime="CAPTURED_SOURCE_OWNERS",automaticRetry=False,replacement=False,
        nativeResourcesQualified=False,sustainedCapacityQualified=False,productionQualified=False,authority="NONE")
    result=dict(nativeOfferedCapacityWorkloadAdapterVersion=3,status="OBSERVED_COMPONENT_ONLY",core=core,
        arrivalModel="FIXED_NOMINAL_CALENDAR_NO_QUEUE_OR_CATCHUP",globalScheduledOffers=4,perLaneFundedServiceCallCapacity=5,
        fundingIsSyntheticAndNotEconomicAcceptance=True,lanes=[row],parentClockDomain="PARENT_MONOTONIC_IPC_ROUNDTRIP_NOT_CHILD_OR_SQL_LATENCY",
        payerClockDomain="PAYER_CHILD_LOCAL",ledgerClockDomain="SERVICE_CHILD_LOCAL",childClockDomainsMerged=False,
        ledgerTimeInferredFromPromise=False,writerTraceCovers="WHOLE_RUN_BRACKETS_CLASSIFIED_AGAINST_SEPARATE_SERVICE_CHILD_WINDOW",
        parentAndServiceWindowsAligned=False,writerBracketsClipped=False,measurementWindowIsolationQualified=False,
        sustainedCapacityQualified=False,nativeEventsAuthenticated=False,nativeResourcesQualified=False,nativeOsNetworkSandbox=False,
        productionQualified=False,authority="NONE")
    return dict(offeredCaptureVersion=2,kind="PRIVATE_CURRENT_OFFERED_NATIVE_CAPACITY_COMPONENT_CAPTURE_NOT_PRODUCTION",
        sourceRowsSha256=capture.PARENT_SHA,childSourceRowsSha256=capture.GRAPH_SHA,result=result,
        finiteSourcePlan=resource.finite_source_plan(WORKLOAD),wholeWindowObserved=True,evidence=[evidence],
        arrivalModel="FIXED_NOMINAL_CALENDAR_NO_QUEUE_OR_CATCHUP",parentAndServiceWindowsAligned=False,
        nativeEventsAuthenticated=False,nativeResourcesQualified=False,sustainableCapacityQualified=False,chainAuthenticated=False,
        productionQualified=False,authority="NONE")
def frame(v):return json.dumps(v,separators=(",",":"),ensure_ascii=True).encode()+b"\n"
def receipt(raw,err=b""):
    return dict(state="COMPLETE",actual_exit=0,process_group=12345,stdout=dict(bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest()),
        stderr=dict(bytes=len(err),sha256=hashlib.sha256(err).hexdigest()),output_complete=True,scratch_scan_retries=0,reason=None,
        completed_at=1.25,argv=None)
def validate_fixture(v):
    raw=frame(v);return capture.validate(resource,raw,b"",receipt(raw),WORKLOAD,RUN)
for label,entries,busy,miss in(("partial",2,1,1),("all_missed",0,0,4),("all_dispatched",4,0,0)):
    def run(self,entries=entries,busy=busy,miss=miss):
        value=validate_fixture(outer_fixture(entries,busy,miss))
        self.assertEqual(value["dispatchedGlobalMeasuredOriginals"],entries);self.assertFalse(value["sustainableCapacityQualified"])
    check("fresh_synthetic_current_outer_"+label+"_does_not_confuse_funding_reservations_with_dispatch",run)
def setat(v,path,value):
    for k in path[:-1]:v=v[k]
    v[path[-1]]=value
mutations=[
("old_parent_graph",["sourceRowsSha256"],"0"*64),("old_child_graph",["childSourceRowsSha256"],"0"*64),
("old_capture_version",["offeredCaptureVersion"],1),("native_claim",["nativeResourcesQualified"],True),
("calendar_changed",["finiteSourcePlan","globalScheduledOffers"],5),("false_whole_window",["wholeWindowObserved"],False),
("hidden_queue",["result","core","offeredMeasurement","queueCapacity"],1),
("lost_slot",["result","core","offeredMeasurement","schedulerMissedSlots"],0),
("wrong_inner_plan",["result","core","offeredMeasurement","plan","arrivalIntervalMs"],1),
("late_deadline",["result","core","offeredMeasurement","stopReason"],"MANUAL"),
("pending_original",["result","core","offeredMeasurement","pendingOriginalOperations"],1),
("pending_close",["result","core","pendingOwnerCloses"],1),("retry",["result","core","automaticRetry"],True),
("wrong_child_context",["evidence",0,"serviceMeasurementWindow","context","sourceRowsSha256"],"0"*64),
("missing_window_stop",["evidence",0,"serviceMeasurementWindow","phase"],"OPEN"),
("writer_duration",["evidence",0,"serviceWriterIntervals",0,"bracketElapsedNs"],"4"),
("original_digest",["evidence",0,"serviceWriterAttribution",1,"originalCommandDigest"],"0"*64),
("native_window_claim",["result","lanes",0,"serviceChildWindowWriterTrace","nativeEventsAuthenticated"],True),
("forged_percentile",["result","lanes",0,"writerBracketNs","p50"],"999"),
("held_store_or_owner",["evidence",0,"pairSnapshot","held"],True),
("child_exit",["evidence",0,"pairSnapshot","children",0,"exitCode"],1),
("child_signal",["evidence",0,"pairSnapshot","children",0,"signal"],"SIGKILL"),
("child_stdout_eof",["evidence",0,"pairSnapshot","children",0,"stdout","eof"],False),
("child_pending_ipc",["evidence",0,"pairSnapshot","children",0,"pending"],1),
("stale_stream_digest",["evidence",0,"pairSnapshot","children",0,"stdout","prefixSha256"],"0"*64),
("different_command",["evidence",0,"payerOperationTimings",0,"kind"],"EXECUTE"),
("late_command",["evidence",0,"payerOperationTimings",0,"lateAfterTimeout"],True),
("clock_merge",["result","childClockDomainsMerged"],True),
("changed_prefix_completion",["result","core","prefixRecording","phases","FUNDED_CALL","succeeded"],0),
("changed_measured_completion",["result","core","offeredMeasurement","dispatchedCallRecording","phases","FUNDED_CALL","entered"],1),
("unknown_aggregate",["result","core","prefixRecording","recordingIssue"],"UNKNOWN")]
# Every original aggregate position is checked; recomputing the outer receipt
# digest cannot convert malformed wire DATA into a matching current record.
strict_records=[
 ("prefix",["result","core","prefixRecording"]),
 ("post_prefix",["result","core","postStopPrefixLedgerRecording"]),
 ("measured",["result","core","offeredMeasurement","dispatchedCallRecording"]),
 ("start_delay",["result","core","offeredMeasurement","sourceStartDelayRecording"]),
 ("post_measurement",["result","core","offeredMeasurement","postStopLedgerRecording"])]
strict_edits=[
 ("boolean_version",["capacityRecorderVersion"],True),
 ("wrong_scope",["scope"],"WRONG"),
 ("wrong_clock",["clock"],"WRONG"),
 ("wrong_percentile_method",["percentileMethod"],"WRONG"),
 ("boolean_pending",["pendingObservations"],False),
 ("boolean_refused",["refusedStarts"],False),
 ("stopped_recording",["stopReason"],"outcome_unknown"),
 ("boolean_sample_limit",["limits","maxSamplesPerPhase"],True),
 ("boolean_in_flight_limit",["limits","maxInFlightPerPhase"],True),
 ("changed_original_sample_limit",["limits","maxSamplesPerPhase"],63),
 ("negative_balance_samples",["ledgerBalanceChecks","samples"],-1),
 ("boolean_balance_samples",["ledgerBalanceChecks","samples"],False),
 ("boolean_balance_mismatches",["ledgerBalanceChecks","mismatches"],False),
 ("balance_result_mismatch",["ledgerBalanceChecks","result"],"MATCHES_CALLER_DECLARED_EXPECTATIONS"),
 ("extra_recording_field",["extra"],False),
 ("boolean_phase_pending",["phases","FUNDING","pending"],False),
 ("boolean_phase_peak",["phases","FUNDING","peakInFlight"],False),
 ("extra_phase_field",["phases","FUNDING","extra"],0)]
for tag,root_path in strict_records:
    for label,at,value in strict_edits:
        mutations.append(("strict_"+tag+"_"+label,root_path+at,value))
    strict_record_snapshot=outer_fixture()
    for key in root_path:strict_record_snapshot=strict_record_snapshot[key]
    mutations.append(("strict_"+tag+"_state_mismatch",root_path+["recordingState"],"COMPLETE"if strict_record_snapshot["recordingState"]=="EMPTY"else"EMPTY"))
    mutations.append(("strict_"+tag+"_null_clock",root_path+["clock"],None))
    for phase in("FUNDING","FUNDED_CALL","LEDGER_TRANSACTION"):
        fraction=None if strict_record_snapshot["phases"][phase]["settled"]else dict(numerator=0,denominator=0)
        mutations.append(("strict_"+tag+"_fraction_"+phase,root_path+["phases",phase,"nonSuccessFraction"],fraction))
mutations.extend([
 ("strict_integer_funded",["result","core","lanes",0,"funded"],1),
 ("strict_boolean_warmup_count",["result","core","lanes",0,"warmupCompleted"],True),
 ("strict_integer_close_entered",["result","core","lanes",0,"closeEntered"],1),
 ("strict_forged_denominator",["result","core","prefixRecording","phases","FUNDING","nonSuccessFraction","denominator"],99),
 ("strict_boolean_denominator",["result","core","prefixRecording","phases","FUNDING","nonSuccessFraction","denominator"],True),
 ("strict_boolean_fraction_numerator",["result","core","prefixRecording","phases","FUNDING","nonSuccessFraction","numerator"],False),
 ("strict_empty_span_with_observations",["result","core","prefixRecording","observedSpanNanoseconds"],None),
 ("strict_span_below_latency",["result","core","prefixRecording","observedSpanNanoseconds"],"0"),
 ("strict_span_without_observations",["result","core","postStopPrefixLedgerRecording","observedSpanNanoseconds"],"1"),
 ("strict_fraction_on_empty_phase",["result","core","postStopPrefixLedgerRecording","phases","FUNDING","nonSuccessFraction"],dict(numerator=0,denominator=1)),
 ("strict_mismatched_success_series",["result","core","prefixRecording","phases","FUNDING","successfulLatencyNanoseconds"],
    dict(samples=1,min="0",p50="0",p95="0",p99="0",max="0"))])
for label,path,value in mutations:
    def run(self,path=path,value=value):
        v=outer_fixture();setat(v,path,value)
        with self.assertRaises((ValueError,KeyError)):validate_fixture(v)
    check("current_outer_recomputed_receipt_digest_cannot_hide_"+label,run)
def strict_omission(name,path,field):
    def run(self):
        v=outer_fixture();record=v
        for key in path:record=record[key]
        del record[field]
        with self.assertRaises(ValueError):validate_fixture(v)
    check("current_outer_refuses_missing_"+name,run)
for tag,root_path in strict_records:
    strict_omission(tag+"_recorder_clock",root_path,"clock")
    strict_omission(tag+"_phase_fraction",root_path+["phases","FUNDING"],"nonSuccessFraction")
def missing_child(self):
    v=outer_fixture();v["evidence"][0]["pairSnapshot"]["children"].pop()
    with self.assertRaises(ValueError):validate_fixture(v)
check("current_outer_requires_both_original_child_close_streams",missing_child)
for field,value in(("state","FAILED"),("actual_exit",True),("actual_exit",1),("output_complete",False),("reason","TIMEOUT"),("process_group",0)):
    def run(self,field=field,value=value):
        raw=frame(outer_fixture());r=receipt(raw);r[field]=value
        with self.assertRaises(ValueError):capture.validate(resource,raw,b"",r,WORKLOAD,RUN)
    check("original_manager_receipt_refuses_"+field+"_"+str(value),run)
def no_second_serialization(self):
    raw=frame(outer_fixture());original=capture.json.dumps
    def forbidden(value,*a,**k):
        if type(value)is dict and "offeredCaptureVersion"in value and "result"in value:
            raise AssertionError("NO_SECOND_WHOLE_CAPTURE_SERIALIZATION")
        return original(value,*a,**k)
    capture.json.dumps=forbidden
    try:value=capture.validate(resource,raw,b"",receipt(raw),WORKLOAD,RUN)
    finally:capture.json.dumps=original
    self.assertFalse(value["fullCaptureJsonReserialized"]);self.assertFalse(value["entireInputTreeCopied"])
check("original_full_outer_frame_is_decoded_once_without_second_whole_json_serialization",no_second_serialization)
for bad in(b'{"x":-0}\n',b'{"x":1.0}\n',b'{"x":1,"x":2}\n',b'{"x":NaN}\n',b'{ "x":1}\n',b'{"x":1}\n{}\n'):
    def run(self,bad=bad):
        with self.assertRaises(ValueError):capture._frame(bad,65536)
    check("original_compact_frame_rejects_"+hashlib.sha256(bad).hexdigest()[:8],run)

parity=[]
for n in(1,2,16):
    for warm in(0,1):
        for offers in(1,4,16):
            v=copy.deepcopy(WORKLOAD);v["laneIds"]=["lane."+str(i)for i in range(n)]
            v["plan"].update(warmupCallsPerLane=warm,measurementCallsPerLane=offers,measurementWindowMs=offers*10)
            v["recordingLimits"]=dict(maxSamplesPerPhase=4096,maxInFlightPerPhase=n)
            parity.append(dict(configuration=dict(plan=v["plan"],recordingLimits=v["recordingLimits"],laneCount=n,
                commandBudgetMs=v["commandBudgetMs"],closeBudgetMs=v["closeBudgetMs"]),
                accepted=True,expected=resource.finite_source_plan(v)))
bad_vectors=[
("measurementCallsPerLane",3),("warmupCallsPerLane",True),("arrivalIntervalMs",0),("drainGraceMs",60001),
("measurementWindowMs",60001),("maxLedgerTransactionsPerOperation",9),("warmupCallsPerLane",253)]
for key,value in bad_vectors:
    v=copy.deepcopy(WORKLOAD);v["plan"][key]=value
    def run(self,v=v):
        with self.assertRaises(ValueError):resource.capture_plan(v)
    check("current_finite_source_plan_rejects_"+key+"_"+str(value),run)
    parity.append(dict(configuration=dict(plan=v["plan"],recordingLimits=v["recordingLimits"],laneCount=1,
        commandBudgetMs=v["commandBudgetMs"],closeBudgetMs=v["closeBudgetMs"]),accepted=False))
if __name__=="__main__":
    output=io.StringIO();result=unittest.TextTestRunner(stream=output,verbosity=0).run(unittest.defaultTestLoader.loadTestsFromTestCase(Pipeline))
    print(json.dumps(dict(event="CURRENT_OFFERED_PIPELINE_V1_ACTUAL_DATA_NOT_NATIVE",python=sys.version.split()[0],
        testsRun=result.testsRun,failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),
        successful=result.wasSuccessful(),names=names,sourceOnlyGate=source_gate_summary,parityVectors=parity,
        syntheticOuterFixturesNotNativeCaptures=True,realCurrentProfileProducerUsed=True,completeParentSourceRows=564,
        completeChildSourceRows=557,defaultEffects=resource.resource_plan(WORKLOAD),auditedEffects=audited,
        SDK=False,SQL=False,SQLite=False,nativeModulesImported=False,keys=False,signatures=False,nonce=False,sockets=False,
        applicationChildren=0,storageRootAccessed=False,managerImported=False,nativeAppExecutions=0,
        sourceAndPackageCopies=0,nativeCleanAllowanceConsumed=False,oldR4AllowanceConsumed=False,authority="NONE")),flush=True)
    if not result.wasSuccessful():sys.stderr.write(output.getvalue())
    sys.exit(0 if result.wasSuccessful()else 1)
