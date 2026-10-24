"""Selected actual paced-launcher DATA controls; never a native launch.

Read the real source selection and actual frozen Python controls. Exercise
closed declarations, finite flag tripwires and capacity arithmetic only.
No storage manager, task, root, alias, application, SDK or socket is entered.
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
        or os.environ.get("X402_PACED_LAUNCHER_DATA") != "paced-managed-launcher-data-v2"):
    raise ValueError("EXPLICIT_ISOLATED_LAUNCHER_DATA_SELECTION")
repo = Path(__file__).absolute().parents[1]
source_path = repo / "qualification/run-capacity-native-paced-workload-v2.local.py"
raw = source_path.read_bytes()
if hashlib.sha256(raw).hexdigest() != os.environ.get("X402_PACED_LAUNCHER_SOURCE_SHA256"):
    raise ValueError("ACTUAL_LAUNCHER_SOURCE_PIN")
audited = dict(nativeProcesses=0, sockets=0, sqlite=0, writeOpens=0)


def audit(event, args):
    if event in ("subprocess.Popen", "os.system", "os.fork", "os.posix_spawn"):
        audited["nativeProcesses"] += 1
        raise AssertionError("NATIVE_PROCESS_FORBIDDEN_IN_DATA_CONTROL")
    if event.startswith("socket."):
        audited["sockets"] += 1
        raise AssertionError("SOCKET_FORBIDDEN_IN_DATA_CONTROL")
    if event == "sqlite3.connect":
        audited["sqlite"] += 1
        raise AssertionError("SQLITE_FORBIDDEN_IN_DATA_CONTROL")
    if event == "open" and type(args[2]) is int and args[2] & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC):
        audited["writeOpens"] += 1
        raise AssertionError("WRITE_OPEN_FORBIDDEN_IN_DATA_CONTROL")


sys.addaudithook(audit)
spec = importlib.util.spec_from_file_location("actual_paced_managed_launcher_v2", source_path)
m = importlib.util.module_from_spec(spec)
exec(spec.loader.source_to_code(raw, str(source_path)), m.__dict__)
manifest_raw = m.read(repo / m.MANIFEST, 65536)[0]
manifest_sha = m.sha(manifest_raw)
if manifest_sha != os.environ.get("X402_PACED_LAUNCHER_MANIFEST_SHA256"):
    raise ValueError("ACTUAL_LAUNCHER_MANIFEST_PIN")
admitted = m.source_admission(repo, manifest_sha)
manifest = admitted["manifest"]
inputs = {name: pair[0] for name, pair in admitted["inputs"].items()}
effects, policy = admitted["effects"], admitted["policy"]


class Launcher(unittest.TestCase):
    maxDiff = 400


def check(name, fn):
    def run(self):
        fn(self)
    run.__name__ = "test_" + name
    setattr(Launcher, run.__name__, run)


def validate(value=None, selected=None):
    return m.validate_launch_data(manifest if value is None else value, inputs if selected is None else selected, effects, policy)


def assign(value, keys, replacement):
    for key in keys[:-1]:
        value = value[key]
    value[keys[-1]] = replacement


def reject_manifest(self, keys, replacement):
    value = copy.deepcopy(manifest)
    assign(value, keys, replacement)
    with self.assertRaises(ValueError):
        validate(value)


def valid(self):
    before = copy.deepcopy(manifest)
    self.assertIsNone(validate())
    self.assertEqual(manifest, before)
    self.assertEqual(len(manifest["pythonControls"]), 11)
    self.assertEqual(len(inputs), 15)
    self.assertEqual(effects["taskQuotaBytes"], 71 * 1048576)
    self.assertEqual(effects["nodeTimeoutSeconds"], 72)
    self.assertEqual(effects["loopbackTcpConnectionsMaximum"], 362)
    self.assertEqual(effects["nodeStdoutLimit"], 1179648)
    self.assertFalse(effects["nativeAllowanceGranted"])
    self.assertFalse(manifest["nativeExecuted"])
    self.assertEqual(manifest["authority"], "NONE")


check("actual_complete_source_selection", valid)
BAD = [
    ("old_unpaced_kind", ["kind"], "ONE_NATIVE_CAPACITY_V3_LAUNCH_SOURCE_NOT_EXECUTION"),
    ("boolean_version", ["version"], True),
    ("different_version", ["version"], 2),
    ("unbounded_parent_ref", ["sourceParent"], "main"),
    ("not_source_authored", ["managedLauncherSourceAuthored"], False),
    ("executed_claim", ["nativeExecuted"], True),
    ("grant_claim", ["nativeAllowanceGranted"], True),
    ("sandbox_claim", ["nativeOsNetworkSandbox"], True),
    ("integer_false_alias", ["nativeExecuted"], 0),
    ("authority_claim", ["authority"], "NATIVE_APPROVED"),
    ("different_parent_graph", ["parentSourceRowsSha256"], "a" * 64),
    ("different_child_graph", ["childSourceRowsSha256"], "b" * 64),
    ("effect_boolean_run_count", ["effectsCeiling", "maximumRuns"], True),
    ("effect_float_run_count", ["effectsCeiling", "maximumRuns"], 1.0),
    ("effect_integer_false_alias", ["effectsCeiling", "nativeAllowanceGranted"], 0),
    ("effect_second_run", ["effectsCeiling", "maximumRuns"], 2),
    ("effect_dropped_reservation", ["effectsCeiling", "nodeStderrLimit"], 0),
    ("effect_old_stdout_cap", ["effectsCeiling", "nodeStdoutLimit"], 1048576),
    ("effect_lower_floor", ["effectsCeiling", "minimumFreeBytes"], 0),
    ("policy_boolean_max_tasks", ["storagePolicy", "max_tasks"], True),
    ("policy_lower_floor", ["storagePolicy", "min_free_bytes"], 0),
    ("policy_second_task", ["storagePolicy", "max_tasks"], 2),
    ("different_workload_pin", ["workload", "sha256"], "a" * 64),
    ("unknown_workload_pin_field", ["workload", "authority"], "NONE"),
    ("changed_parent_selection", ["parentSelection", "LF"], 122),
]
for name, keys, value in BAD:
    check("manifest_refuses_" + name, lambda self, keys=keys, value=value: reject_manifest(self, keys, value))


def changed_fields(self, mode):
    value = copy.deepcopy(manifest)
    if mode == "extra":
        value["unreviewed"] = True
    elif mode == "missing":
        value.pop("workload")
    elif mode == "reordered_controls":
        value["pythonControls"].reverse()
    else:
        value["pythonControls"].pop()
    with self.assertRaises(ValueError):
        validate(value)


for name in ("extra", "missing", "reordered_controls", "missing_control"):
    check("manifest_refuses_" + name, lambda self, name=name: changed_fields(self, name))


def changed_control(self, name):
    changed = dict(inputs); changed[name] += b"\n"
    value = copy.deepcopy(manifest)
    # Re-pinning the manifest cannot rewrite an independently frozen control.
    for row in value["pythonControls"]:
        if row["path"] == name:
            row.update(m.pin(name, changed[name]))
    with self.assertRaisesRegex(ValueError, "FROZEN_CONTROL_NOT_REWRITTEN"):
        validate(value, changed)


for index, (name, digest) in enumerate(m.FROZEN):
    check("independent_frozen_control_" + str(index + 1), lambda self, name=name: changed_control(self, name))


def input_set(self, extra):
    selected = dict(inputs)
    if extra:
        selected["unselected.py"] = b""
    else:
        selected.pop(m.PLAN)
    with self.assertRaisesRegex(ValueError, "EXACT_LAUNCH_INPUT_BYTES"):
        validate(selected=selected)


check("missing_input_refused", lambda self: input_set(self, False))
check("additional_input_refused", lambda self: input_set(self, True))


def equality(self):
    self.assertTrue(m.same(dict(v=[1, False, None, "x"]), dict(v=[1, False, None, "x"])))
    for left, right in ((True, 1), (False, 0), (1, 1.0), ([1], [True]), (dict(v=1), dict(v=True)), ((1,), [1])):
        self.assertFalse(m.same(left, right))
    self.assertFalse(m.same(1.0, 1.0))
    self.assertFalse(m.same(float("nan"), float("nan")))
    deep = None
    for unused in range(18):
        deep = [deep]
    with self.assertRaisesRegex(ValueError, "BOUNDED_DECLARATION_DATA"):
        m.same(deep, deep)


check("typed_and_bounded_data_equality", equality)
for name, value in (("duplicate", b'{"a":1,"a":2}'), ("nan", b'{"a":NaN}'), ("infinity", b'{"a":Infinity}')):
    def reject_json(self, value=value):
        with self.assertRaises(ValueError):
            m.strict(value)
    check("non_json_or_ambiguous_" + name, reject_json)


def capacity_valid(self):
    reserved = 123456789
    minimum = 11 * 1024**3 + effects["taskQuotaBytes"] + 4 * 1048576 + reserved
    before = copy.deepcopy(effects)
    for count in (1, 105, 256):
        value = m.capacity_data(minimum, reserved, effects, count)
        self.assertEqual(value["requiredBytes"], minimum)
        self.assertEqual(value["storeRoots"], count)
    with self.assertRaisesRegex(ValueError, "PRODUCTION_FLOOR_AND_ALL_STORE_RESERVATIONS"):
        m.capacity_data(minimum - 1, reserved, effects, 105)
    self.assertEqual(effects, before)


check("complete_sibling_reservation_floor_arithmetic_only", capacity_valid)
for name, index, replacement in (
    ("boolean_available", 0, True), ("negative_available", 0, -1), ("unsafe_available", 0, 2**53),
    ("boolean_reserved", 1, False), ("negative_reserved", 1, -1), ("unsafe_reserved", 1, 2**53),
    ("zero_roots", 3, 0), ("boolean_roots", 3, True), ("too_many_roots", 3, 257)):
    def invalid_capacity(self, index=index, replacement=replacement):
        args = [100 * 1024**3, 0, effects, 105]; args[index] = replacement
        with self.assertRaises(ValueError):
            m.capacity_data(*args)
    check("capacity_refuses_" + name, invalid_capacity)
for name, key, replacement in (("boolean_quota", "taskQuotaBytes", True), ("zero_quota", "taskQuotaBytes", 0),
        ("unsafe_quota", "taskQuotaBytes", 2**53), ("lower_floor", "minimumFreeBytes", 0),
        ("missing_safety", "safetyMarginBytes", 0), ("float_floor", "minimumFreeBytes", float(10 * 1024**3))):
    def invalid_effect(self, key=key, replacement=replacement):
        changed = dict(effects); changed[key] = replacement
        with self.assertRaisesRegex(ValueError, "UNCHANGED_PRODUCTION_FLOOR"):
            m.capacity_data(100 * 1024**3, 0, changed, 1)
    check("capacity_effect_refuses_" + name, invalid_effect)


def cli_defaults(self):
    args = m.arguments(["--repo", str(repo), "--manifest-sha256", manifest_sha])
    self.assertFalse(args.execute)
    self.assertFalse(args.pre_native_plan)
    self.assertIsNone(args.manager)
    self.assertIsNone(args.root)
    with self.assertRaisesRegex(ValueError, "NEW_EXACT_PACED_FINITE_SCOPE_REQUIRED"):
        m.native_intent(args, effects)
    args.native_selection = "one-new-approved-native-paced-capacity-v3"
    args.approval_launch_sha256 = manifest_sha
    args.approval_plan_sha256 = effects["workloadPlanSha256"]
    with self.assertRaisesRegex(ValueError, "NEW_EXACT_PACED_FINITE_SCOPE_REQUIRED"):
        m.native_intent(args, effects)
    args.execute = True
    self.assertIsNone(m.native_intent(args, effects))
    # Correct tripwire strings are still NOT human permission.
    self.assertFalse(manifest["nativeAllowanceGranted"])
    args.approval_launch_sha256 = "6c9979316924e44138ee9c42af1f925899ad52d969246ad206fe65a209a5baa3"
    with self.assertRaisesRegex(ValueError, "NEW_EXACT_PACED_FINITE_SCOPE_REQUIRED"):
        m.native_intent(args, effects)


check("default_source_only_and_old_r4_grant_not_transferable", cli_defaults)


def real_source_shape(self):
    tree = ast.parse(raw)
    methods = {node.name: node for node in tree.body if isinstance(node, ast.FunctionDef)}
    calls = [node for node in ast.walk(methods["execute"]) if isinstance(node, ast.Call)]
    task_calls = [node.func.attr for node in calls if isinstance(node.func, ast.Attribute)
        and isinstance(node.func.value, ast.Name) and node.func.value.id == "task"]
    for required in ("write", "preserve", "materialize", "record", "run"):
        self.assertIn(required, task_calls)
    self.assertEqual(task_calls.count("run"), 2)
    self.assertIn("source_admission", methods)
    self.assertNotIn("init", methods)
    self.assertNotIn("cleanup", methods)
    self.assertNotIn("shutil", m.__dict__)
    self.assertNotIn("paced_v2_actual_owned_storage", sys.modules)
    self.assertNotIn("sqlite3", sys.modules)
    self.assertEqual(audited, dict(nativeProcesses=0, sockets=0, sqlite=0, writeOpens=0))


check("real_managed_source_calls_present_not_native_executed", real_source_shape)



for name, replacement in (("boolean", True), ("zero", 0), ("lower", 1), ("larger", 8388608), ("float", 4194304.0)):
    def metadata_refused(self, replacement=replacement):
        value = dict(effects); value["metadataStoreQuotaBytesReserved"] = replacement
        with self.assertRaisesRegex(ValueError, "EXACT_NEW_STORE_METADATA_RESERVATION"):
            m.capacity_data(100 * 1024**3, 0, value, 105)
    check("metadata_reservation_refuses_" + name, metadata_refused)

for name, replacement in (("missing", None), ("lower", 0), ("boolean", True),
        ("float", float(effects["requiredFreeBytesBeforeOtherReservations"]))):
    def total_refused(self, replacement=replacement):
        value = dict(effects); value["requiredFreeBytesBeforeOtherReservations"] = replacement
        with self.assertRaisesRegex(ValueError, "FULL_SOURCE_RESOURCE_RESERVATION_MATCH"):
            m.capacity_data(100 * 1024**3, 0, value, 105)
    check("complete_reservation_refuses_" + name, total_refused)


def current_graphs(self):
    c = admitted["controls"]
    self.assertEqual((manifest["version"], effects["resourcePlanVersion"], effects["pacedCaptureVersion"]), (3, 2, 3))
    self.assertEqual(c["producer"].PARENT_SEAL, "38bb4557357dd42bcd7dedacb4b7ec2fc750d474e7f9c14045376b73b0739160")
    self.assertEqual(c["bundle"].PARENT_SOURCE, c["producer"].PARENT_SEAL)
    self.assertEqual(c["resource"].PARENT_SOURCE_SHA256, c["producer"].PARENT_SEAL)
    self.assertEqual(c["producer"].CHILD_SEAL, "d756740994aeb53ebeee47320d732583d96381dfa8c00e18a30f414e70a77027")
    self.assertEqual(c["captureValidator"].info()["controlSourceFilesRead"], 3)
    source = json.loads(inputs[m.PARENT])
    self.assertEqual((source["parentApplicationFiles"], source["parentPackageFiles"]), (146, 404))
    self.assertEqual(source["parentRole"]["profileVersion"], 2)
    self.assertEqual(source["captureLayout"]["pacedCaptureVersion"], 3)
    wanted = {m.SELF, "qualification/native_capacity_paced_parent_profile_v2.py",
        "qualification/native_capacity_paced_resource_plan_v2.py", "qualification/native_capacity_paced_profile_bundle_v2.py",
        "qualification/native_capacity_paced_outer_capture_data_v2.py"}
    self.assertTrue(wanted.issubset(row["path"]for row in manifest["pythonControls"]))
check("new_source_admission_binds_all_genuine_new_controls_and_complete_graphs", current_graphs)


def metadata_scope(self):
    expected = 11 * 1024**3 + effects["taskQuotaBytes"] + 4194304
    self.assertEqual(effects["requiredFreeBytesBeforeOtherReservations"], expected)
    value = m.capacity_data(expected, 0, effects, 1)
    self.assertEqual(value["metadataStoreQuotaBytesReserved"], 4194304)
    self.assertEqual(value["requiredBytes"], expected)
    with self.assertRaises(ValueError):
        m.capacity_data(expected - 1, 0, effects, 1)
check("metadata_is_reserved_before_any_store_or_task_effect", metadata_scope)


def capacity_overflow(self):
    with self.assertRaisesRegex(ValueError, "PRODUCTION_FLOOR_AND_ALL_STORE_RESERVATIONS"):
        m.capacity_data(2**53 - 1, 2**53 - 1, effects, 256)
check("all_store_addition_overflow_never_passes_safe_integer_capacity_data", capacity_overflow)


def old_paced_scope(self):
    args = m.arguments(["--repo", str(repo), "--manifest-sha256", manifest_sha, "--execute"])
    args.native_selection = "one-new-approved-native-paced-capacity-v2"
    args.approval_launch_sha256 = manifest_sha; args.approval_plan_sha256 = effects["workloadPlanSha256"]
    with self.assertRaisesRegex(ValueError, "NEW_EXACT_PACED_FINITE_SCOPE_REQUIRED"):
        m.native_intent(args, effects)
check("old_paced_scope_is_not_new_parent_v2_native_permission", old_paced_scope)


def old_manifest(self):
    previous = m.strict(m.read(repo / "qualification/capacity-native-paced-workload-v2.launch-inputs.json", 65536)[0])
    with self.assertRaisesRegex(ValueError, "SOURCE_DECLARATION_NOT_NATIVE_AUTHORITY"):
        validate(previous)
check("unchanged_prior_launch_declaration_cannot_be_used_for_new_graph", old_manifest)


def namespace_source(self):
    text = raw.decode("ascii")
    for expected in ("native-capacity-paced-supervisor-source-draft-v2", "native-capacity-paced-workload-source-draft-v2",
            "one-reviewed-native-capacity-paced-parent-v2"):
        self.assertIn(expected, text)
    for old in ("native-capacity-paced-supervisor-source-draft-v1", "native-capacity-paced-workload-source-draft-v1",
            "one-reviewed-native-capacity-paced-parent-v1"):
        self.assertNotIn(old, text)
check("actual_authored_native_branch_uses_only_distinct_new_parent_namespace", namespace_source)


def full_resource_source(self):
    self.assertIn('require(same(assembly["resourcePlan"], effects), "FULL_PROFILE_RESOURCE_AND_NATIVE_EFFECT_SCOPE")', raw.decode("ascii"))
    self.assertEqual(effects["privateBalanceEventsMaximum"], 12)
    self.assertEqual(effects["entryPlanBytesReserved"], 65536)
    self.assertEqual(effects["balanceOuterCaptureBytesReserved"], 15360)
    self.assertFalse(effects["balanceTimingObserved"])
    self.assertFalse(effects["nativeAllowanceGranted"])
check("real_branch_binds_complete_profile_resource_result_without_new_authority", full_resource_source)


if __name__ == "__main__":
    result = unittest.TextTestRunner(stream=io.StringIO(), verbosity=0).run(unittest.defaultTestLoader.loadTestsFromTestCase(Launcher))
    admitted["unchanged"]()
    stable = m.read(source_path)[0] == raw and m.read(repo / m.MANIFEST, 65536)[0] == manifest_raw
    success = result.wasSuccessful() and stable and not any(audited.values())
    print(json.dumps(dict(event="PACED_V2_MANAGED_LAUNCHER_ACTUAL_DATA_NOT_NATIVE", testsRun=result.testsRun,
        selectedCases=result.testsRun, failures=len(result.failures), errors=len(result.errors), skipped=len(result.skipped),
        successful=success, sourceAndInputsUnchanged=stable, applicationFilesRead=146, packageFilesExecuted=0,
        actualManagerImported=False, actualTaskCreated=False, privateRootCreated=False, nativeCommands=0,
        auditedEffects=audited, authority="NONE",
        failureDetails=[dict(test=str(test), diagnosticBytes=len(detail.encode()), diagnosticSha256=hashlib.sha256(detail.encode()).hexdigest()) for test, detail in result.failures + result.errors],
        firstFailureText=(result.failures + result.errors)[0][1][:4000] if result.failures or result.errors else None)), flush=True)
    raise SystemExit(0 if success else 1)
