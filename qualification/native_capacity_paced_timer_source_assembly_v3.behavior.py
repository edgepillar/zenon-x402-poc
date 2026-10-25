"""Actual timer-parent source/whole-profile assembly DATA controls.

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
        or os.environ.get("X402_TIMER_SOURCE_ASSEMBLY_DATA") != "timer-parent-v3-complete-source-assembly-data"):
    raise ValueError("EXPLICIT_ISOLATED_TIMER_SOURCE_ASSEMBLY")
audited = dict(nativeProcesses=0, sockets=0, sqlite=0, writeOpens=0)
def audit(event, args):
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
name = "qualification/run-capacity-native-paced-timer-source-v3.local.py"
driver_path = repo / name
for at in (driver_path, *driver_path.parents):
    if at.is_symlink():
        raise ValueError("SOURCE_LINK")
raw = driver_path.read_bytes()
if hashlib.sha256(raw).hexdigest() != os.environ.get("X402_TIMER_SOURCE_DRIVER_SHA256"):
    raise ValueError("EXACT_REVIEWED_SOURCE_DRIVER")
spec = importlib.util.spec_from_file_location("actual_timer_source_assembly_driver", driver_path)
m = importlib.util.module_from_spec(spec); sys.modules[spec.name] = m
exec(spec.loader.source_to_code(raw, str(driver_path)), m.__dict__)
before = m.read(driver_path)
if before[0] != raw:
    raise ValueError("DRIVER_CHANGED_BEFORE_ENTRY")
manifest_raw = m.read(repo / m.MANIFEST, 65536)[0]
manifest_sha = m.sha(manifest_raw)
if manifest_sha != os.environ.get("X402_TIMER_SOURCE_MANIFEST_SHA256"):
    raise ValueError("EXACT_REVIEWED_SOURCE_SELECTION")
admitted = m.source_admission(repo, manifest_sha)
c = admitted["controls"]
p, resource, bundle, b, old = [c[k] for k in ("producer", "resource", "bundle", "base", "legacy")]
workload = admitted["workload"]
inputs = {name: pair[0] for name, pair in admitted["inputs"].items()}
selection = admitted["selection"]
old_selected = old.capture_selection(b, inputs[m.INVENTORY], inputs[m.BASELINE])
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
planner = p.prepare_from_registry_data(b, old, registry, extra, inputs[m.PARENT], inputs[m.INVENTORY], inputs[m.BASELINE])

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

class Assembly(unittest.TestCase):
    maxDiff = 400
def check(name, fn):
    def run(self):
        fn(self)
    run.__name__ = "test_" + name
    setattr(Assembly, run.__name__, run)

def complete(self):
    self.assertEqual((parent["profileVersion"], parent["profileKind"], len(parent["inputs"])), (3, p.PARENT_KIND, 551))
    self.assertEqual(parent["childProfiles"], [v["reference"] for v in children])
    self.assertEqual(sum(row["logicalPath"].startswith("app/") for row in parent["inputs"]), 147)
    for item in children:
        full = b._private_json(item["profileBytes"], 524288); ref = item["reference"]
        expected = old.plan_role_profile(b, registry, inputs[m.INVENTORY], inputs[m.BASELINE], ref["role"],
            dict(runId=run_id, laneId=ref["laneId"]), dict(path=ref["rootPath"], identity=ref["rootIdentity"]), [])
        self.assertEqual(item["profileBytes"], expected["profileBytes"])
        self.assertEqual((full["profileVersion"], len(full["inputs"])), (3, 543))
    self.assertEqual(assembly["summary"]["completePrivateProfileBytes"],
        sum(len(v["profileBytes"]) for v in children) + len(assembly["parentProfile"]["profileBytes"]))
check("all_five_complete_profiles_and_original_r4_child_bytes", complete)

def default(self):
    self.assertEqual(m.sha(inputs[m.PLAN]), "cbbf3b62215473ea614867461eb27ceefc3c5478f6a70eeac781982ad5689a2f")
    self.assertEqual(workload["laneIds"], ["lane.one", "lane.two"])
    self.assertEqual((workload["plan"]["warmupCallsPerLane"], workload["plan"]["measurementCallsPerLane"]), (1, 4))
    entry = assembly["entryPlan"]["plan"]
    for field in ("plan", "pacing", "recordingLimits", "payeeAddress", "commandBudgetMs", "closeBudgetMs"):
        self.assertEqual(entry[field], workload[field])
    self.assertEqual(entry["context"], dict(runId=run_id))
    self.assertEqual([row["laneId"] for row in entry["laneProfiles"]], workload["laneIds"])
check("unchanged_full_default_reaches_actual_entry_plan", default)

def effects(self):
    r = assembly["resourcePlan"]
    self.assertTrue(m.same(r, admitted["effects"]))
    self.assertEqual((r["resourcePlanVersion"], r["parentProfileVersion"], r["pacedCaptureVersion"], r["pacedTimerCaptureVersion"]), (3, 3, 4, 1))
    self.assertEqual((r["taskQuotaBytes"], r["nodeStdoutLimit"], r["nodeTimeoutSeconds"]), (74448896, 1376256, 72))
    self.assertEqual((r["privateTimerEventsMaximum"], r["uniqueRawTimingEventsMaximum"]), (513, 1938))
    self.assertEqual(r["metadataStoreQuotaBytesReserved"], 4194304)
check("whole_v3_resource_policy_and_timer_budget_not_reduced", effects)

def declared(self):
    s = assembly["summary"]
    self.assertFalse(s["sourceFilesReadOnlyVerified"]); self.assertTrue(s["registryFactsAreDeclaredData"])
    self.assertEqual(planner.info()["sourceFilesRead"], 0)
    self.assertEqual(planner.info()["nodeBinaryHashesForContext"], 0)
    for k in ("physicalRootsAuthenticated", "physicalAliasesCreated", "profilesWritten", "nativeExecuted", "nativeAllowanceGranted"):
        self.assertIs(s[k], False)
    self.assertEqual(s["authority"], "NONE")
    self.assertFalse(admitted["manifest"]["nativeExecutionImplemented"])
check("synthetic_registry_and_roots_never_become_native_authority", declared)

def controls(self):
    pins = c["captureValidator"].info()["controlPins"]
    self.assertEqual([v["sha256"] for v in pins], [
        "6d4e2d726bd600b84be387147ee7cd6555daa8b72b8940a8719861a1078b4567",
        "5519fe20147ae3d03910daf089111a5803648bb5f245916659f07c151bf07997",
        "88a27b04b2cf83315d91390eef0889bc4c4732336d7fb569487950d8a75a5a28"])
    self.assertFalse(c["captureValidator"].info()["SDKImported"])
    with self.assertRaises(ValueError):
        c["captureValidator"].validate(b"{}\n", b"", {}, workload, run_id)
check("real_current_outer_validator_loaded_without_native_entry", controls)

def lanes(self, count):
    value = copy.deepcopy(workload); value["laneIds"] = ["lane." + str(i) for i in range(1, count + 1)]
    value["plan"].update(warmupCallsPerLane=0, measurementCallsPerLane=1)
    value["recordingLimits"]["maxInFlightPerPhase"] = max(count, workload["recordingLimits"]["maxInFlightPerPhase"])
    kids = children_for(value)
    result = bundle.assemble(planner, resource, value, run_id, parent_root, kids)
    full = b._private_json(result["parentProfile"]["profileBytes"], 524288)
    self.assertEqual((len(full["inputs"]), len(full["childProfiles"])), (551, 2 * count))
    self.assertTrue(result["summary"]["completePrivateProfilesFitReservedBytes"])
    self.assertLessEqual(len(result["parentProfile"]["profileBytes"]), 524288)
    if count == 16:
        details["maximumLanes"] = dict(lanes=16, childProfiles=32, parentProfileBytes=len(result["parentProfile"]["profileBytes"]),
            wholeExpectedChildBytesMaterialized=planner.info()["wholeExpectedChildBytesMaterialized"],
            sharedFieldSerializations=planner.info()["sharedFieldSerializations"],
            sharedCanonicalBytes=planner.info()["sharedCanonicalBytes"])
for count in (1, 3, 16):
    check("whole_profiles_for_" + str(count) + "_lanes", lambda self, count=count: lanes(self, count))

def nonmutation(self):
    refs = json.dumps([v["reference"] for v in children], sort_keys=True); original = [v["profileBytes"] for v in children]
    root = copy.deepcopy(parent_root); plan = copy.deepcopy(workload)
    result = bundle.assemble(planner, resource, plan, run_id, root, children)
    self.assertEqual(refs, json.dumps([v["reference"] for v in children], sort_keys=True))
    self.assertEqual(original, [v["profileBytes"] for v in children]); self.assertEqual(root, parent_root); self.assertEqual(plan, workload)
    result["entryPlan"]["plan"]["laneProfiles"][0]["payerProfile"]["path"] = "/changed-detached-entry"
    result["summary"]["authority"] = "changed"
    self.assertEqual(refs, json.dumps([v["reference"] for v in children], sort_keys=True))
    self.assertEqual(bundle.assemble(planner, resource, workload, run_id, parent_root, children)["summary"]["authority"], "NONE")
check("inputs_and_small_returned_references_are_detached", nonmutation)

def insufficient_slots(self):
    value = copy.deepcopy(workload); value["laneIds"] = ["lane." + str(i) for i in range(1, 17)]
    value["plan"].update(warmupCallsPerLane=0, measurementCallsPerLane=1)
    with self.assertRaisesRegex(ValueError, "ACTUAL_CORE_RECORDING_CAPACITY"):
        bundle.assemble(planner, resource, value, run_id, parent_root, [])
check("sixteen_lanes_cannot_reuse_default_four_in_flight_slots", insufficient_slots)

def reject_bundle(name, edit):
    def test(self):
        args = dict(planner=planner, resource=resource, workload=copy.deepcopy(workload), run_id=run_id,
            parent_root=copy.deepcopy(parent_root), children=copy.deepcopy(children))
        edit(args)
        with self.assertRaises(ValueError):
            bundle.assemble(**args)
    check("assembly_refuses_" + name, test)
def setat(value, path, replacement):
    for key in path[:-1]:
        value = value[key]
    value[path[-1]] = replacement
for name, path, value in (
        ("bad_run", ["run_id"], "b" * 63), ("foreign_run", ["run_id"], "b" * 64),
        ("missing_child", ["children"], children[:-1]), ("extra_child", ["children"], children + children[:1]),
        ("swapped_roles", ["children"], [children[1], children[0], *children[2:]]),
        ("duplicate_pair", ["children"], children[:2] + children[:2]),
        ("empty_children", ["children"], []), ("tuple_children", ["children"], tuple(children)),
        ("non_private_root_mode", ["parent_root", "identity", 4], "16877"),
        ("boolean_inode", ["parent_root", "identity", 1], True),
        ("leading_zero_inode", ["parent_root", "identity", 1], "0800"),
        ("zero_device", ["parent_root", "identity", 0], "0"),
        ("relative_scratch", ["parent_root", "path"], "relative/tasks/" + "5" * 32 + "/scratch"),
        ("wrong_task_schema", ["parent_root", "path"], store + "/other/" + "5" * 32 + "/scratch"),
        ("wrong_task_id", ["parent_root", "path"], store + "/tasks/other/scratch"),
        ("noncanonical_scratch", ["parent_root", "path"], store + "//tasks/" + "5" * 32 + "/scratch"),
        ("foreign_lane", ["children", 0, "reference", "laneId"], "foreign"),
        ("foreign_cas", ["children", 0, "reference", "path"], "/other/objects/" + children[0]["reference"]["sha256"]),
        ("foreign_role_root", ["children", 0, "reference", "rootPath"], "/other/payer"),
        ("aliased_physical_root", ["children", 0, "reference", "rootIdentity"], parent_root["identity"]),
        ("false_child_digest", ["children", 0, "reference", "sha256"], "0" * 64),
        ("false_role_url", ["children", 0, "reference", "entryURL"], "file:///synthetic-source/other.mjs"),
        ("empty_raw_child", ["children", 0, "profileBytes"], b""),
        ("non_bytes_child", ["children", 0, "profileBytes"], bytearray(children[0]["profileBytes"])),
        ("unexpected_bundle_field", ["children", 0, "nativeAuthority"], True),
        ("unknown_reference_field", ["children", 0, "reference", "nativeAuthority"], True),
        ("extra_root_field", ["parent_root", "authenticated"], True)):
    reject_bundle(name, lambda args, path=path, value=value: setat(args, path, value))

def rewrite_child(args, edit=None, suffix=None):
    item = args["children"][0]
    full = b._private_json(item["profileBytes"], 524288)
    if edit is not None:
        edit(full)
    raw = old.canonical(full) + b"\n" if suffix is None else item["profileBytes"] + suffix
    item["profileBytes"] = raw; item["reference"]["sha256"] = m.sha(raw)
    item["reference"]["path"] = store + "/objects/" + m.sha(raw)
for label, edit in (
        ("missing_input", lambda f: f["inputs"].pop()),
        ("changed_input_digest", lambda f: f["inputs"][0].update(sha256="0" * 64)),
        ("parent_rows_in_child", lambda f: f["inputs"].append(parent["inputs"][-1])),
        ("wrong_child_version", lambda f: f.update(profileVersion=2)),
        ("boolean_child_version", lambda f: f.update(profileVersion=True)),
        ("wrong_context", lambda f: f.update(runId="b" * 64)),
        ("wrong_child_root", lambda f: f.update(rootPath="/other/payer")),
        ("extra_authority_field", lambda f: f.update(authority="NONE")),
        ("wrong_runtime", lambda f: f["runtime"].update(node="26.5.0")),
        ("missing_import_binding", lambda f: f["bareBindings"].pop())):
    reject_bundle("self_consistent_digest_but_" + label, lambda args, edit=edit: rewrite_child(args, edit))
reject_bundle("self_consistent_digest_but_second_lf", lambda args: rewrite_child(args, suffix=b"\n"))

def reject_manifest(name, edit):
    def test(self):
        manifest = copy.deepcopy(admitted["manifest"]); sources = dict(inputs)
        edit(manifest, sources)
        with self.assertRaises(ValueError):
            m.validate_launch_data(manifest, sources)
    check("selection_refuses_" + name, test)
for field, value in (("version", True), ("version", 2), ("kind", "ONE_FULL_NATIVE_CAPACITY_V3_MANAGED_LAUNCH_SOURCE_NOT_EXECUTION"),
        ("sourceParent", 4), ("sourceOnly", False), ("nativeExecutionImplemented", True), ("nativeExecuted", True),
        ("nativeAllowanceGranted", True), ("nativeOsNetworkSandbox", True), ("authority", "LIVE"),
        ("parentSourceRowsSha256", bundle.CHILD_SOURCE), ("childSourceRowsSha256", bundle.PARENT_SOURCE)):
    reject_manifest(field + "_" + str(value), lambda manifest, sources, field=field, value=value: manifest.update({field: value}))
reject_manifest("unknown_field", lambda manifest, sources: manifest.update(automaticRetry=True))
reject_manifest("missing_control", lambda manifest, sources: manifest["pythonControls"].pop())
reject_manifest("extra_control", lambda manifest, sources: manifest["pythonControls"].append(manifest["pythonControls"][0]))
reject_manifest("extra_source", lambda manifest, sources: sources.update({"foreign.py": b""}))
reject_manifest("missing_source", lambda manifest, sources: sources.pop(m.PLAN))
reject_manifest("control_pin_boolean", lambda manifest, sources: manifest["pythonControls"][0].update(bytes=True))
reject_manifest("control_extra_field", lambda manifest, sources: manifest["pythonControls"][0].update(private=True))
def changed_frozen(manifest, sources):
    name = m.FROZEN[0][0]; sources[name] += b"\n"
    for row in manifest["pythonControls"]:
        if row["path"] == name:
            row.update(m.pin(name, sources[name]))
reject_manifest("changed_frozen_source_even_with_matching_caller_pin", changed_frozen)
reject_manifest("changed_workload_without_new_pin", lambda manifest, sources: sources.update({m.PLAN: sources[m.PLAN] + b"\n"}))

def effect_refusal(self, path, value):
    manifest = copy.deepcopy(admitted["manifest"]); setat(manifest, path, value)
    with self.assertRaises(ValueError):
        m.validate_effects_data(manifest, resource, workload)
for path, value in (
        (["effectsCeiling", "nodeStdoutLimit"], 1048576),
        (["effectsCeiling", "nodeTimeoutSeconds"], 71),
        (["effectsCeiling", "taskQuotaBytes"], 73400320),
        (["effectsCeiling", "minimumFreeBytes"], 0),
        (["effectsCeiling", "metadataStoreQuotaBytesReserved"], 0),
        (["effectsCeiling", "privateTimerEventsMaximum"], 1),
        (["effectsCeiling", "automaticRetry"], True),
        (["effectsCeiling", "maximumRuns"], True),
        (["effectsCeiling", "nativeAllowanceGranted"], True),
        (["effectsCeiling", "parentSourceRowsSha256"], bundle.CHILD_SOURCE),
        (["storagePolicy", "max_tasks"], True),
        (["storagePolicy", "task_quota_bytes"], 1),
        (["storagePolicy", "max_commands_per_task"], 3),
        (["storagePolicy", "min_free_bytes"], 0)):
    check("whole_effects_refuse_" + "_".join(path), lambda self, path=path, value=value: effect_refusal(self, path, value))

def bad_json(self, raw):
    with self.assertRaises((ValueError, UnicodeError)):
        m.strict(raw)
for label, data in (("duplicate", b'{"x":1,"x":2}'), ("float", b'{"x":3.0}'),
        ("constant", b'{"x":NaN}'), ("negative_zero", b'{"x":-0}'), ("unsafe", b'{"x":9007199254740992}'),
        ("non_ascii", b'{"x":"\xff"}'), ("empty", b""), ("oversize", b" " * 262145)):
    check("strict_json_refuses_" + label, lambda self, data=data: bad_json(self, data))
def native_flags(self, flag):
    with io.StringIO() as captured, __import__("contextlib").redirect_stderr(captured):
        with self.assertRaises(SystemExit) as stopped:
            m.arguments(["--repo", str(repo), "--manifest-sha256", manifest_sha, *flag])
        self.assertEqual(stopped.exception.code, 2)
for flag in (["--execute"], ["--pre-native-plan"], ["--manager", "/never-open-manager"],
        ["--root", "/never-open-root"], ["--packages", "/never-open-packages"], ["--node", "/never-open-node"],
        ["--approval-launch-sha256", "0" * 64], ["--native-selection", "old-unpaced-v3-r4"]):
    check("native_cli_not_exposed_" + flag[0][2:].replace("-", "_"), lambda self, flag=flag: native_flags(self, flag))

def entry(self):
    output = io.StringIO()
    with __import__("contextlib").redirect_stdout(output):
        self.assertEqual(m.main(["--repo", str(repo), "--manifest-sha256", manifest_sha, "--source-only"]), 0)
    value = json.loads(output.getvalue())
    self.assertEqual(value["event"], "PACED_TIMER_V3_SOURCE_ADMITTED_NOT_NATIVE")
    self.assertEqual((value["applicationFilesRead"], value["packageRowsDeclared"]), (147, 404))
    self.assertFalse(value["nativeExecutionImplemented"]); self.assertFalse(value["installedPackageBytesVerified"])
check("real_source_only_cli_path_not_a_managed_native_launch", entry)

def safe_ast(self):
    tree = ast.parse(raw)
    names = {alias.name for node in ast.walk(tree) if isinstance(node, (ast.Import, ast.ImportFrom))
        for alias in node.names}
    self.assertFalse(names.intersection({"subprocess", "sqlite3", "socket", "storage", "dataclasses"}))
    self.assertFalse(any(isinstance(node, ast.FunctionDef) and node.name in ("execute", "capacity") for node in ast.walk(tree)))
check("driver_contains_no_native_execution_or_storage_preflight_branch", safe_ast)

def unchanged(self):
    admitted["unchanged"]()
    self.assertEqual(m.read(driver_path), before)
    self.assertEqual(audited, dict(nativeProcesses=0, sockets=0, sqlite=0, writeOpens=0))
check("source_identities_and_zero_effect_audit_preserved", unchanged)

suite = unittest.defaultTestLoader.loadTestsFromTestCase(Assembly)
count = suite.countTestCases()
stream = io.StringIO(); result = unittest.TextTestRunner(stream=stream, verbosity=0).run(suite)
admitted["unchanged"]()
if m.read(driver_path) != before or any(audited.values()):
    raise AssertionError("SOURCE_OR_ZERO_EFFECT_AUDIT_CHANGED")
print(json.dumps(dict(event="PACED_TIMER_SOURCE_ASSEMBLY_V3_ACTUAL_DATA_CONTROLS", testsRun=result.testsRun,
    selectedCases=count, failures=len(result.failures), errors=len(result.errors), skipped=len(result.skipped),
    validated=result.wasSuccessful() and result.testsRun == count, details=details, audited=audited,
    profileRegistryAndRootFactsSynthetic=True, installedPackageBytesVerified=False,
    nativeExecutionImplemented=False, nativeExecuted=False, authority="NONE"), sort_keys=True), flush=True)
if not result.wasSuccessful():
    print(stream.getvalue(), file=sys.stderr)
sys.exit(0 if result.wasSuccessful() and result.testsRun == count else 1)
