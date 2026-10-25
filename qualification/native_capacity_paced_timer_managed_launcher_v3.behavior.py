"""Actual timer-aware managed-controller source/command DATA controls.

Only the genuine admitted Python controls execute. All registry/source-file
identities, private task/role roots and CAS paths used for profile assembly
are synthetic DTOs. The real application bytes are read, never imported.
No installed package, Node binary, manager, native app or private root is used.
"""
import ast
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import unittest

if (not (sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode)
        or os.environ.get("X402_TIMER_MANAGED_LAUNCHER_DATA") != "timer-parent-v3-managed-launcher-data"):
    raise ValueError("EXPLICIT_ISOLATED_TIMER_SOURCE_ASSEMBLY")
audited = dict(nativeProcesses=0, sockets=0, sqlite=0, writeOpens=0)
def audit(event, args):
    if event in ("open", "os.scandir") and args and type(args[0]) is str:
        at = args[0]
        if (at.startswith("/Volumes/") or "/node_modules/" in at
                or at.endswith(("/storage.py", "/cli.py", "/node"))):
            raise AssertionError("NO_PRIVATE_STORAGE_OR_INSTALLED_NODE_PACKAGE_ACCESS")
    if event in ("subprocess.Popen", "os.system", "os.fork", "os.posix_spawn"):
        audited["nativeProcesses"] += 1
        raise AssertionError("NO_NATIVE_PROCESS")
    if event.startswith("socket."):
        audited["sockets"] += 1
        raise AssertionError("NO_SOCKET")
    if event == "sqlite3.connect":
        audited["sqlite"] += 1
        raise AssertionError("NO_SQLITE")
    if event == "open" and type(args[2]) is int and args[2] & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC):
        audited["writeOpens"] += 1
        raise AssertionError("NO_WRITE_OPEN")
sys.addaudithook(audit)

repo = Path(__file__).absolute().parents[1]
name = "qualification/run-capacity-native-paced-timer-managed-v3.local.py"
driver_path = repo / name
for at in (driver_path, *driver_path.parents):
    if at.is_symlink():
        raise ValueError("SOURCE_LINK")
raw = driver_path.read_bytes()
if hashlib.sha256(raw).hexdigest() != os.environ.get("X402_TIMER_MANAGED_DRIVER_SHA256"):
    raise ValueError("EXACT_REVIEWED_SOURCE_DRIVER")
spec = importlib.util.spec_from_file_location("actual_timer_source_assembly_driver", driver_path)
m = importlib.util.module_from_spec(spec); sys.modules[spec.name] = m
exec(spec.loader.source_to_code(raw, str(driver_path)), m.__dict__)
before = m.read(driver_path)
if before[0] != raw:
    raise ValueError("DRIVER_CHANGED_BEFORE_ENTRY")
manifest_raw = m.read(repo / m.MANIFEST, 65536)[0]
manifest_sha = m.sha(manifest_raw)
if manifest_sha != os.environ.get("X402_TIMER_MANAGED_MANIFEST_SHA256"):
    raise ValueError("EXACT_REVIEWED_SOURCE_SELECTION")
admitted = m.source_admission(repo, manifest_sha)
c = admitted["controls"]
p, resource, bundle, b, old = [c[k] for k in ("producer", "resource", "bundle", "base", "legacy")]
workload = admitted["workload"]
inputs = {name: pair[0] for name, pair in admitted["inputs"].items()}
selection = admitted["selection"]
old_selected = old.capture_selection(b, inputs[old.INVENTORY], inputs[old.BASELINE])
run_id = "a" * 64
store = "/synthetic-timer-source-assembly"
scratch = store + "/tasks/" + "5" * 32 + "/scratch"
parent_root = dict(path=scratch, identity=["1", "800", str(os.getuid()), "20", "16832"])

def capture(row, n):
    app = row["path"].startswith("app/")
    return dict(logicalPath=row["path"], url=b.source_url("/synthetic-source" if app else "/synthetic-packages",
        row["path"][4:] if app else row["path"][9:]), bytes=row["bytes"], LF=row["LF"], sha256=row["sha256"],
        gitBlob=row["gitBlob"], identity=["1", str(1000 + n), str(os.getuid()), "20", "33188", "1", str(row["bytes"]), "100", "100"])
rows = [capture(row, n) for n, row in enumerate(old_selected["rows"])]
index = {row["logicalPath"]: row for row in rows}
registry = dict(inputs=rows, bareBindings=[dict(parentURL=index[e["parent"]]["url"], specifier=e["specifier"],
    targetURL=index[e["target"]]["url"]) for e in old_selected["bareBindings"]],
    runtime=dict(node="24.19.0", platform="darwin", arch="arm64", nodeSha256=old.NODE_SHA,
        nodeIdentity=["1", "90", str(os.getuid()), "20", "33261", "1", str(old.NODE_BYTES), "100", "100"]),
    sourceRowsSha256=old.SOURCE_SEAL, applicationRoot="/synthetic-source", packageRoot="/synthetic-packages",
    sourceIdentitiesRead=False, sourcesCopied=False, nativeExecuted=False, authority="NONE")
extra = [capture(row, 600 + n) for n, row in enumerate(selection["extraRows"])]
planner = p.prepare_from_registry_data(b, old, registry, extra, inputs[m.PARENT], inputs[old.INVENTORY], inputs[old.BASELINE])

def children_for(value=workload):
    out = []
    for ordinal, lane in enumerate(value["laneIds"], 1):
        for offset, role in enumerate(("PAYER", "SERVICE")):
            root = dict(path=scratch + "/lanes/" + format(ordinal, "02d") + "/" + role.lower(),
                identity=["1", str(900 + 2 * ordinal + offset), str(os.getuid()), "20", "16832"])
            profile = planner.plan_child(role, dict(runId=run_id, laneId=lane), root)
            full = b._private_json(profile["profileBytes"], 524288)
            ref = dict(role=role, laneId=lane, path=store + "/objects/" + profile["profileSha256"],
                sha256=profile["profileSha256"], entryURL=full["entryURL"], preloaderURL=full["preloaderURL"],
                rootPath=root["path"], rootIdentity=root["identity"])
            out.append(dict(reference=ref, profileBytes=profile["profileBytes"]))
    return out
children = children_for()
assembly = bundle.assemble(planner, resource, workload, run_id, parent_root, children)
parent = b._private_json(assembly["parentProfile"]["profileBytes"], 524288)
details = dict(defaultCompleteProfileBytes=assembly["summary"]["completePrivateProfileBytes"],
    defaultEntryPlanBytes=assembly["summary"]["entryPlanBytes"], maximumLanes=None,
    sourceApplicationFilesRead=len(admitted["applicationInputs"]), sourceControls=len(m.FROZEN) + 1)

command = c["command"]
parent_bytes = assembly["parentProfile"]["profileBytes"]
entry_bytes = assembly["entryPlan"]["planBytes"]
parent_input = dict(path=store + "/objects/" + m.sha(parent_bytes), sha256=m.sha(parent_bytes), raw=parent_bytes)
entry_input = dict(path=store + "/objects/" + m.sha(entry_bytes), sha256=m.sha(entry_bytes), raw=entry_bytes)
def params():
    return dict(resource=resource, workload=copy.deepcopy(workload), effects=copy.deepcopy(admitted["effects"]),
        repo="/synthetic-source", node="/synthetic-node/node", task_root=scratch,
        parent_input=dict(parent_input), entry_input=dict(entry_input), run_id=run_id)
planned = command.plan(**params())
details.update(parentProfileBytes=len(parent_bytes), entryPlanBytes=len(entry_bytes),
    plannedArgvCount=len(planned["argv"]), plannedEnvironmentFields=len(planned["envDelta"]),
    nodeTimeoutSeconds=planned["timeoutSeconds"], stdoutLimit=planned["stdoutLimit"], sourceProfileRows=551)

class Managed(unittest.TestCase):
    maxDiff = 400
def check(name, fn):
    def test(self):
        fn(self)
    test.__name__ = "test_" + name
    setattr(Managed, test.__name__, test)
def setat(value, path, replacement):
    for key in path[:-1]:
        value = value[key]
    value[path[-1]] = replacement

def exact_command(self):
    self.assertEqual(planned["argv"], ["/synthetic-node/node", "--no-addons", "--disallow-code-generation-from-strings",
        "--disable-proto=throw", "--unhandled-rejections=strict",
        "--import=/synthetic-source/" + command.PRELOAD, "/synthetic-source/" + command.ENTRY, scratch])
    self.assertEqual(planned["envDelta"], dict(
        X402_NATIVE_CAPACITY_SUPERVISOR_SELECTION="native-capacity-paced-supervisor-source-draft-v3",
        X402_NATIVE_CAPACITY_WORKLOAD_SELECTION="native-capacity-paced-workload-source-draft-v3",
        X402_NATIVE_CAPACITY_RUN_SCOPE="one-reviewed-native-capacity-paced-parent-v3",
        X402_NATIVE_CAPACITY_RUN_ID=run_id, X402_NATIVE_CAPACITY_LANE_ID="workload.parent",
        X402_NATIVE_CAPACITY_SUPERVISOR_PROFILE_PATH=parent_input["path"],
        X402_NATIVE_CAPACITY_SUPERVISOR_PROFILE_SHA256=parent_input["sha256"],
        X402_NATIVE_CAPACITY_PLAN_PATH=entry_input["path"], X402_NATIVE_CAPACITY_PLAN_SHA256=entry_input["sha256"]))
    self.assertEqual((planned["timeoutSeconds"], planned["stdoutLimit"], planned["stderrLimit"]), (72, 1376256, 1048576))
    self.assertEqual(planned["sourceProfile"], parent)
check("genuine_complete_parent_and_entry_produce_actual_v3_command_selections", exact_command)

def graph(self):
    self.assertEqual((len(planned["sourceProfile"]["inputs"]), len(planned["sourceProfile"]["childProfiles"])), (551, 4))
    self.assertEqual(planned["sourceProfile"]["sourceRowsSha256"], p.PARENT_SEAL)
    for child in children:
        ref = child["reference"]
        result = old.plan_role_profile(b, registry, inputs[old.INVENTORY], inputs[old.BASELINE], ref["role"],
            dict(runId=run_id, laneId=ref["laneId"]), dict(path=ref["rootPath"], identity=ref["rootIdentity"]), [])
        self.assertEqual(child["profileBytes"], result["profileBytes"])
    self.assertTrue(planned["summary"]["wholeDeclaredSourceRowSealRecomputed"])
    self.assertTrue(planned["summary"]["wholeEntryBytesBound"])
check("all_551_declared_rows_and_unchanged_full_r4_children_not_reduced", graph)

def no_authority(self):
    self.assertFalse(planner.info()["sourceFilesReadOnlyVerified"])
    self.assertEqual(planner.info()["nodeBinaryHashesForContext"], 0)
    with self.assertRaisesRegex(ValueError, "ACTUAL_551_SOURCE_CONTEXT_REQUIRED"):
        m.validate_full_source_context(planner)
    for k in ("nativeCommandExecuted", "sourceBytesPhysicallyAuthenticated", "rootsPhysicallyAuthenticated",
            "casOriginsAuthenticated", "managerReceiptOriginsAuthenticated", "nativeAllowanceGranted"):
        self.assertIs(planned["summary"][k], False)
    self.assertEqual(planned["summary"]["authority"], "NONE")
    self.assertFalse(admitted["manifest"]["managedLauncherNativeQualified"])
check("declared_registry_refuses_native_setup_and_never_authenticates_origins", no_authority)

def detached(self):
    original = params(); snapshots={k:copy.deepcopy(v) for k,v in original.items() if k!="resource"}
    result = command.plan(**original)
    result["argv"][0]="/different-node"; result["envDelta"]["X402_NATIVE_CAPACITY_PLAN_PATH"]="/different-plan"
    result["sourceProfile"]["inputs"][0]["sha256"]="0"*64
    for k,v in snapshots.items():
        self.assertEqual(original[k],v)
    self.assertEqual(command.plan(**params())["argv"][0],"/synthetic-node/node")
check("whole_original_inputs_unchanged_and_decoded_parent_detached", detached)

def max_lanes(self):
    value=copy.deepcopy(workload);value["laneIds"]=["lane."+str(i) for i in range(1,17)]
    value["plan"].update(warmupCallsPerLane=0,measurementCallsPerLane=1)
    value["recordingLimits"]["maxInFlightPerPhase"]=16
    kids=children_for(value); result=bundle.assemble(planner,resource,value,run_id,parent_root,kids)
    parraw=result["parentProfile"]["profileBytes"];entraw=result["entryPlan"]["planBytes"]
    args=params();args.update(workload=value,effects=resource.resource_plan(value),
        parent_input=dict(path=store+"/objects/"+m.sha(parraw),sha256=m.sha(parraw),raw=parraw),
        entry_input=dict(path=store+"/objects/"+m.sha(entraw),sha256=m.sha(entraw),raw=entraw))
    full=command.plan(**args)
    self.assertEqual(len(full["sourceProfile"]["childProfiles"]),32)
    self.assertEqual(full["summary"]["childProfiles"],32)
    self.assertEqual(planner.info()["wholeExpectedChildBytesMaterialized"],0)
    details["maximumDeclaredChildProfiles"]=32
check("sixteen_lane_full_command_binding_with_all_32_child_references", max_lanes)

def reject(name, edit):
    def test(self):
        args=params();edit(args)
        with self.assertRaises(ValueError):
            command.plan(**args)
    check("command_refuses_"+name,test)
for label, path, value in (
        ("relative_node",["node"],"node"),("relative_repo",["repo"],"source"),
        ("foreign_repo",["repo"],"/other-source"),("noncanonical_repo",["repo"],"/synthetic-source/../source"),
        ("foreign_run",["run_id"],"b"*64),("short_run",["run_id"],"a"*63),
        ("relative_task",["task_root"],"scratch"),("different_task",["task_root"],store+"/tasks/"+"6"*32+"/scratch"),
        ("wrong_task_schema",["task_root"],store+"/scratch"),
        ("foreign_parent_cas",["parent_input","path"],"/other/objects/"+parent_input["sha256"]),
        ("foreign_entry_cas",["entry_input","path"],"/other/objects/"+entry_input["sha256"]),
        ("false_parent_digest",["parent_input","sha256"],"0"*64),
        ("empty_parent",["parent_input","raw"],b""),("parent_bytearray",["parent_input","raw"],bytearray(parent_bytes)),
        ("false_entry_digest",["entry_input","sha256"],"0"*64),
        ("empty_entry",["entry_input","raw"],b""),("entry_bytearray",["entry_input","raw"],bytearray(entry_bytes)),
        ("extra_retained_parent_field",["parent_input","authenticated"],True),
        ("stdout_cap_reduced",["effects","nodeStdoutLimit"],1048576),
        ("timeout_reduced",["effects","nodeTimeoutSeconds"],71),
        ("metadata_reservation_removed",["effects","metadataStoreQuotaBytesReserved"],0),
        ("task_quota_reduced",["effects","taskQuotaBytes"],73400320),
        ("floor_removed",["effects","minimumFreeBytes"],0),
        ("timer_events_reduced",["effects","privateTimerEventsMaximum"],0),
        ("native_authority",["effects","nativeAllowanceGranted"],True),
        ("retry",["effects","automaticRetry"],True),
        ("bool_run_count",["effects","maximumRuns"],True),
        ("unknown_effect",["effects","callerCanAuthorize"],True)):
    reject(label,lambda args,path=path,value=value:setat(args,path,value))

def rewrite(args, key, edit=None, suffix=None, raw=None):
    selected=args[key]
    value=command.decode(selected["raw"],524288 if key=="parent_input" else 65536)
    if edit is not None:edit(value)
    raw=resource.canonical_bytes(value) if raw is None and suffix is None else (selected["raw"]+suffix if raw is None else raw)
    selected.update(raw=raw,sha256=m.sha(raw),path=store+"/objects/"+m.sha(raw))
for label,path,value in (
        ("old_parent_version",["profileVersion"],2),("bool_parent_version",["profileVersion"],True),
        ("old_parent_kind",["profileKind"],"NATIVE_CAPACITY_PACED_SUPERVISOR_NODE24_V2"),
        ("wrong_role",["role"],"PAYER"),("wrong_run",["runId"],"b"*64),("wrong_lane",["laneId"],"other"),
        ("wrong_root",["rootPath"],"/other/scratch"),("old_parent_seal",["sourceRowsSha256"],"0"*64),
        ("wrong_child_seal",["childSourceRowsSha256"],p.PARENT_SEAL),
        ("transformed_source",["sourceTransform"],True),("ordinary_namespace",["ordinaryInstalledNamespace"],True),
        ("baseline_changed",["baselineManifestSha256"],"0"*64),
        ("node_version",["runtime","node"],"26.5.0"),("node_platform",["runtime","platform"],"linux"),
        ("node_arch",["runtime","arch"],"x64"),("node_sha",["runtime","nodeSha256"],"0"*64),
        ("node_links",["runtime","nodeIdentity",5],"2"),("node_size",["runtime","nodeIdentity",6],"1"),
        ("node_mode",["runtime","nodeIdentity",4],"33188"),("root_mode",["rootIdentity",4],"16877"),
        ("root_bool_inode",["rootIdentity",1],True),("unknown_profile_field",["authority"],"NONE"),
        ("changed_input_digest",["inputs",0,"sha256"],"0"*64),("changed_input_size",["inputs",0,"bytes"],1),
        ("changed_input_inode_bool",["inputs",0,"identity",1],True),
        ("source_hardlink",["inputs",0,"identity",5],"2"),
        ("entry_url",["entryURL"],"file:///other/entry.mjs"),
        ("preloader_url",["preloaderURL"],"file:///other/preload.mjs"),
        ("parent_builtins",["allowedBuiltins"],[]),
        ("foreign_child_lane",["childProfiles",0,"laneId"],"other"),
        ("foreign_child_root",["childProfiles",0,"rootPath"],"/other/root"),
        ("aliased_child_inode",["childProfiles",0,"rootIdentity"],parent_root["identity"]),
        ("child_device",["childProfiles",0,"rootIdentity",0],"2"),
        ("foreign_child_owner",["childProfiles",0,"rootIdentity",2],"999"),
        ("child_entry",["childProfiles",0,"entryURL"],"file:///other/child.mjs"),
        ("child_cas",["childProfiles",0,"path"],"/other/objects/"+"0"*64)):
    reject("self_consistent_parent_digest_but_"+label,
        lambda args,path=path,value=value:rewrite(args,"parent_input",lambda f:setat(f,path,value)))
for label, edit in (
        ("missing_source",lambda f:f["inputs"].pop()),
        ("source_order",lambda f:f["inputs"].reverse()),
        ("duplicate_source",lambda f:f["inputs"].__setitem__(1,f["inputs"][0])),
        ("missing_child",lambda f:f["childProfiles"].pop()),
        ("duplicate_child",lambda f:f["childProfiles"].__setitem__(1,f["childProfiles"][0])),
        ("child_order",lambda f:f["childProfiles"].reverse())):
    reject("self_consistent_parent_digest_but_"+label,lambda args,edit=edit:rewrite(args,"parent_input",edit))
for label,path,value in (
        ("wrong_context",["context","runId"],"b"*64),
        ("wrong_payee",["payeeAddress"],"other"),("fewer_measured",["plan","measurementCallsPerLane"],3),
        ("wrong_gap",["pacing","minimumStartGapMs"],2),
        ("wrong_profile",["laneProfiles",0,"payerProfile","sha256"],"0"*64),
        ("extra_authority",["authority"],"NONE")):
    reject("self_consistent_entry_digest_but_"+label,
        lambda args,path=path,value=value:rewrite(args,"entry_input",lambda f:setat(f,path,value)))
reject("extra_parent_frame",lambda args:rewrite(args,"parent_input",suffix=b"\n"))
reject("extra_entry_frame",lambda args:rewrite(args,"entry_input",suffix=b"{}\n"))
reject("duplicate_private_key",lambda args:rewrite(args,"parent_input",raw=parent_bytes.replace(b"{",b'{"profileVersion":3,',1)))

def defaults():
    return m.arguments(["--repo",str(repo),"--manifest-sha256",manifest_sha])
def good_flags():
    args=defaults();args.execute=True;args.native_selection=m.NATIVE_SELECTION
    args.approval_launch_sha256=manifest_sha;args.approval_plan_sha256=admitted["effects"]["workloadPlanSha256"]
    return args
def flag_tripwire(self):
    args=good_flags()
    self.assertIsNone(m.native_intent(args,admitted["effects"]))
    self.assertFalse(admitted["manifest"]["nativeAllowanceGranted"])
check("exact_flags_are_tripwires_only_not_permission_or_execution",flag_tripwire)
for key,value in (("execute",False),("pre_native_plan",True),("native_selection","one-new-approved-native-paced-capacity-v3"),
        ("native_selection","one-unpaced-v3-r4"),("approval_launch_sha256","0"*64),
        ("approval_plan_sha256","0"*64),("manifest_sha256","bad")):
    def test(self,key=key,value=value):
        args=good_flags();setattr(args,key,value)
        with self.assertRaises(ValueError):m.native_intent(args,admitted["effects"])
    check("finite_tripwire_refuses_"+key+"_"+str(value),test)

def source_cli(self):
    output=io.StringIO()
    with __import__("contextlib").redirect_stdout(output):
        self.assertEqual(m.main(["--repo",str(repo),"--manifest-sha256",manifest_sha,"--source-only"]),0)
    value=json.loads(output.getvalue())
    self.assertEqual(value["event"],"PACED_TIMER_V3_MANAGED_SOURCE_NOT_NATIVE")
    self.assertTrue(value["completeManagedControllerSourceAuthored"]);self.assertFalse(value["managedNativeControllerQualified"])
check("actual_source_only_entry_without_manager_or_installed_graph",source_cli)
for flag in ("--root","--manager","--node","--packages","--volume","--store-id"):
    def test(self,flag=flag):
        with self.assertRaisesRegex(ValueError,"PRIVATE_NATIVE_INPUTS_NOT_ALLOWED"):
            m.main(["--repo",str(repo),"--manifest-sha256",manifest_sha,flag,"/never-open"])
    check("source_only_refuses_private_input_"+flag[2:],test)
def old_scope(self):
    output=io.StringIO()
    with __import__("contextlib").redirect_stdout(output),self.assertRaisesRegex(ValueError,"NEW_EXACT_TIMER_FINITE_SCOPE"):
        m.main(["--repo",str(repo),"--manifest-sha256",manifest_sha,"--execute",
            "--native-selection","one-new-approved-native-paced-capacity-v3"])
check("actual_main_refuses_old_unpaced_or_old_paced_scope_before_installed_reads",old_scope)
def missing_packages(self):
    output=io.StringIO()
    with __import__("contextlib").redirect_stdout(output),self.assertRaisesRegex(ValueError,"EXPLICIT_INSTALLED_SOURCE_AND_NODE"):
        m.main(["--repo",str(repo),"--manifest-sha256",manifest_sha,"--execute",
            "--native-selection",m.NATIVE_SELECTION,"--approval-launch-sha256",manifest_sha,
            "--approval-plan-sha256",admitted["effects"]["workloadPlanSha256"]])
check("actual_main_requires_installed_inputs_after_exact_tripwires_without_opening_them",missing_packages)

for key,value in (("kind","old"),("version",True),("managedLauncherNativeQualified",True),("nativeAllowanceGranted",True),
        ("nativeExecuted",True),("authority","LIVE"),("nativeSelection","old"),("nativeOsNetworkSandbox",True)):
    def test(self,key=key,value=value):
        manifest=copy.deepcopy(admitted["manifest"]);manifest[key]=value
        with self.assertRaises(ValueError):
            m.validate_launch_data(manifest,{n:pair[0]for n,pair in admitted["managedInputs"].items()})
    check("managed_manifest_refuses_"+key,test)
def replaced_source(self):
    manifest=copy.deepcopy(admitted["manifest"]);data={n:pair[0]for n,pair in admitted["managedInputs"].items()}
    key=m.FROZEN[0][0];data[key]+=b"\n"
    for row in manifest["pythonControls"]:
        if row["path"]==key:row.update(m.pin(key,data[key]))
    with self.assertRaisesRegex(ValueError,"FROZEN_TIMER_MANAGED_CONTROL"):m.validate_launch_data(manifest,data)
check("matching_caller_pin_cannot_replace_a_frozen_control",replaced_source)

def capacity(self,count):
    e=admitted["effects"];reserved=1234567*count
    required=e["requiredFreeBytesBeforeOtherReservations"]+reserved
    full=m.capacity_data(required,reserved,e,count)
    self.assertEqual(full["requiredBytes"],required);self.assertEqual(full["storeRoots"],count)
    with self.assertRaisesRegex(ValueError,"PRODUCTION_FLOOR_AND_ALL_STORE_RESERVATIONS"):
        m.capacity_data(required-1,reserved,e,count)
for count in (1,33,61,107,256):
    check("all_declared_reservation_roots_"+str(count),lambda self,count=count:capacity(self,count))
for count in (0,257,True):
    def test(self,count=count):
        with self.assertRaises(ValueError):m.capacity_data(2**53-1,0,admitted["effects"],count)
    check("capacity_refuses_root_count_"+str(count),test)
def timestamps(self):
    self.assertEqual(m.metadata(b'{"completed_at":123.25}')["completed_at"],123.25)
    for raw_value in (b'{"completed_at":NaN}',b'{"completed_at":1e309}',b'{"x":1,"x":2}'):
        with self.assertRaises(ValueError):m.metadata(raw_value)
    with self.assertRaises(ValueError):m.strict(b'{"version":3.0}')
check("storage_finite_timestamp_parser_is_separate_from_integer_source_plans",timestamps)

def native_source_wiring(self):
    tree=ast.parse(raw);execute=next(n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name=="execute")
    calls=[n for n in ast.walk(execute)if isinstance(n,ast.Call)]
    runs=[n for n in calls if isinstance(n.func,ast.Attribute)and isinstance(n.func.value,ast.Name)
        and n.func.value.id=="task"and n.func.attr=="run"]
    self.assertEqual(len(runs),2)
    self.assertIsInstance(runs[0].args[0],ast.List)
    self.assertIsInstance(runs[1].args[0],ast.Subscript)
    self.assertEqual(ast.unparse(runs[1].args[0]),"command_plan['argv']")
    self.assertIn('source_profile = command_plan["sourceProfile"]',raw.decode())
    self.assertIn('c["captureValidator"].validate(stdout, stderr, receipt, admitted["workload"], run_id)',raw.decode())
    self.assertIn('reservation_snapshot(path, common) == snapshots[str(path)]',raw.decode())
    self.assertIn('method="clone"',raw.decode())
    self.assertFalse(any("subprocess" in ast.unparse(call.func) for call in calls))
    self.assertNotIn("process.exit(",raw.decode())
check("real_unexecuted_native_branch_consumes_command_plan_and_current_validator",native_source_wiring)

suite=unittest.defaultTestLoader.loadTestsFromTestCase(Managed);count=suite.countTestCases()
stream=io.StringIO();result=unittest.TextTestRunner(stream=stream,verbosity=0).run(suite)
admitted["unchanged"]()
if m.read(driver_path)!=before or any(audited.values()):raise AssertionError("SOURCE_OR_ZERO_EFFECT_AUDIT_CHANGED")
print(json.dumps(dict(event="PACED_TIMER_MANAGED_V3_ACTUAL_SOURCE_DATA_CONTROLS",testsRun=result.testsRun,
    selectedCases=count,failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),
    validated=result.wasSuccessful()and result.testsRun==count,details=details,audited=audited,
    profileRegistryAndRootFactsSynthetic=True,nativeControllerSourceAuthored=True,nativeControllerExecuted=False,
    privateStorageOrInstalledSourceOpened=False,nativeExecuted=False,authority="NONE"),sort_keys=True),flush=True)
if not result.wasSuccessful():print(stream.getvalue(),file=sys.stderr)
sys.exit(0 if result.wasSuccessful()and result.testsRun==count else 1)
