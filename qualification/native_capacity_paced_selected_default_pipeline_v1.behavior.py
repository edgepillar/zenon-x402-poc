"""Exact selected-default managed source pipeline; no managed/native effects.

The genuine launcher admits all pinned controls and the actual 550-source
profile planner. Only synthetic role/task/CAS DTOs and complete IN-MEMORY bytes
are composed. The native execute/preflight branches are never called.
"""
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

if (not (sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode)
        or os.environ.get("X402_PACED_MANAGED_PIPELINE_DATA") != "paced-parent-v2-selected-default-source-pipeline-v1"):
    raise ValueError("EXPLICIT_ISOLATED_REAL_MANAGED_SOURCE_PIPELINE")
repo = Path(__file__).absolute().parents[1]
node, packages = Path(os.environ["X402_EXISTING_NODE"]), Path(os.environ["X402_EXISTING_PACKAGES"])
source_path = repo / "qualification/run-capacity-native-paced-workload-v2.local.py"
audited = dict(nativeProcesses=0, sockets=0, sqlite=0, writeOpens=0)
reads = dict(nodeReadOpens=0, packageReadOpens=0)


def audit(event, args):
    if event in ("subprocess.Popen", "os.system", "os.fork", "os.posix_spawn"):
        audited["nativeProcesses"] += 1
        raise AssertionError("NO_NATIVE_PROCESS_IN_MANAGED_PIPELINE_DATA")
    if event.startswith("socket."):
        audited["sockets"] += 1
        raise AssertionError("NO_SOCKET_IN_MANAGED_PIPELINE_DATA")
    if event == "sqlite3.connect":
        audited["sqlite"] += 1
        raise AssertionError("NO_SQLITE_IN_MANAGED_PIPELINE_DATA")
    if event == "open":
        if type(args[2]) is int and args[2] & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC):
            audited["writeOpens"] += 1
            raise AssertionError("NO_WRITE_OPEN_IN_MANAGED_PIPELINE_DATA")
        if type(args[0]) is str:
            if args[0] == str(node):
                reads["nodeReadOpens"] += 1
            if args[0].startswith(str(packages) + "/"):
                reads["packageReadOpens"] += 1


sys.addaudithook(audit)
for at in (source_path, *source_path.parents):
    if at.is_symlink():
        raise ValueError("LAUNCHER_SOURCE_LINK")
s = source_path.lstat()
if not stat.S_ISREG(s.st_mode) or s.st_uid != os.getuid() or s.st_nlink != 1 or s.st_size > 65536:
    raise ValueError("LAUNCHER_SOURCE_IDENTITY")
with os.fdopen(os.open(source_path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
    raw = stream.read(65537)
if len(raw) != s.st_size or hashlib.sha256(raw).hexdigest() != os.environ.get("X402_PACED_LAUNCHER_SOURCE_SHA256"):
    raise ValueError("EXACT_NEW_LAUNCHER_SOURCE_PIN")
spec = importlib.util.spec_from_file_location("actual_selected_default_managed_source_pipeline_driver", source_path)
m = importlib.util.module_from_spec(spec); sys.modules[spec.name] = m
exec(spec.loader.source_to_code(raw, str(source_path)), m.__dict__)
before = m.read(source_path)
if before[0] != raw:
    raise ValueError("LAUNCHER_CHANGED_BEFORE_PIPELINE")
manifest_raw = m.read(repo / m.MANIFEST, 65536)[0]
manifest_sha = hashlib.sha256(manifest_raw).hexdigest()
if manifest_sha != os.environ.get("X402_PACED_LAUNCHER_MANIFEST_SHA256"):
    raise ValueError("EXACT_NEW_LAUNCHER_MANIFEST")
admitted = m.source_admission(repo, manifest_sha)
c = admitted["controls"]
planner = c["producer"].build_source_context(repo, str(packages), str(node))
info = planner.info()
if info["sourceFilesRead"] != 550 or reads != dict(nodeReadOpens=1, packageReadOpens=404):
    raise ValueError("ONE_WHOLE_SOURCE_CONTEXT_REQUIRED")
workload = admitted["workload"]; run_id = "2" * 64
store = "/synthetic-new-managed-pipeline"
scratch = store + "/tasks/" + "5" * 32 + "/scratch"
parent_root = dict(path=scratch, identity=["1", "100", str(os.getuid()), str(os.getgid()), "16832"])
children = []
for ordinal, lane_id in enumerate(workload["laneIds"], 1):
    for offset, role in enumerate(("PAYER", "SERVICE")):
        root = dict(path=scratch + "/lanes/" + format(ordinal, "02d") + "/" + role.lower(),
            identity=["1", str(100 + 2 * ordinal + offset), str(os.getuid()), str(os.getgid()), "16832"])
        result = planner.plan_child(role, dict(runId=run_id, laneId=lane_id), root)
        full = json.loads(result["profileBytes"]); digest = result["profileSha256"]
        children.append(dict(reference=dict(role=role, laneId=lane_id, path=store + "/objects/" + digest,
            sha256=digest, entryURL=full["entryURL"], preloaderURL=full["preloaderURL"],
            rootPath=root["path"], rootIdentity=root["identity"]), profileBytes=result["profileBytes"]))
assembly = c["bundle"].assemble(planner, c["resource"], workload, run_id, parent_root, children)
parent = json.loads(assembly["parentProfile"]["profileBytes"])
source_fixture_path = repo / "qualification/fixtures/capacity-paced-selected-default-v1.json"
fixture_before = m.read(source_fixture_path)
if hashlib.sha256(fixture_before[0]).hexdigest() != "e2fc710aa36a0a9c4f8f6bbd0974013fd4ad16a1ffe832b6e3ca0e4693b53863":
    raise ValueError("EXACT_SOURCE_FIXTURE_DATA")
fixture_wrapper = json.loads(fixture_before[0]); fixture = fixture_wrapper["selected"]
generic_path = repo / "qualification/fixtures/capacity-paced-outer-contract-v2.json"
generic_before = m.read(generic_path)
if hashlib.sha256(generic_before[0]).hexdigest() != "56803811c511fa15b5e64fe95e0ccd09a656fee3954e899c11481abb247d0da9":
    raise ValueError("PRESERVED_GENERIC_FIXTURE_DATA")
generic = json.loads(generic_before[0])["cases"]["full"]


def frame_bytes(value):
    return (json.dumps(value, separators=(",", ":"), ensure_ascii=True) + "\n").encode("ascii")


def receipt(raw):
    return dict(state="COMPLETE", actual_exit=0, process_group=12345, output_complete=True, scratch_scan_retries=0,
        reason=None, completed_at=1000.0, argv=None, stdout=dict(bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest()),
        stderr=dict(bytes=0, sha256=hashlib.sha256(b"").hexdigest()))


class Pipeline(unittest.TestCase):
    maxDiff = 400


def check(name, fn):
    def run(self):
        fn(self)
    run.__name__ = "test_" + name
    setattr(Pipeline, run.__name__, run)


def complete_profiles(self):
    self.assertEqual((parent["profileVersion"], len(parent["inputs"])), (2, 550))
    self.assertEqual(parent["childProfiles"], [row["reference"] for row in children])
    self.assertEqual(len(children), 4)
    for child in children:
        value = json.loads(child["profileBytes"])
        self.assertEqual((value["profileVersion"], len(value["inputs"])), (3, 543))
    self.assertEqual(assembly["summary"]["completePrivateProfileBytes"],
        sum(len(row["profileBytes"])for row in children) + len(assembly["parentProfile"]["profileBytes"]))
check("genuine_driver_controls_compose_all_five_complete_profiles", complete_profiles)


def exact_default(self):
    plan = assembly["entryPlan"]["plan"]
    self.assertEqual(workload["laneIds"], ["lane.one", "lane.two"])
    self.assertEqual(workload["plan"]["warmupCallsPerLane"], 1)
    self.assertEqual(workload["plan"]["measurementCallsPerLane"], 4)
    self.assertEqual(plan["plan"], workload["plan"])
    self.assertEqual(plan["recordingLimits"], workload["recordingLimits"])
    self.assertEqual(plan["pacing"], workload["pacing"])
    self.assertEqual(plan["context"], dict(runId=run_id))
    self.assertEqual([row["laneId"]for row in plan["laneProfiles"]], workload["laneIds"])
check("actual_source_default_workload_and_context_reach_full_entry_plan", exact_default)


def exact_resource(self):
    self.assertTrue(m.same(assembly["resourcePlan"], admitted["effects"]))
    self.assertEqual(assembly["resourcePlan"]["pacedCaptureVersion"], 3)
    self.assertEqual(assembly["resourcePlan"]["metadataStoreQuotaBytesReserved"], 4194304)
    self.assertTrue(assembly["summary"]["completePrivateProfilesFitReservedBytes"])
    self.assertTrue(assembly["summary"]["completeEntryFitsReservedBytes"])
    self.assertEqual(assembly["resourcePlan"]["workloadPlanSha256"],
        hashlib.sha256(admitted["inputs"][m.PLAN][0]).hexdigest())
check("profile_resource_entry_and_full_declared_effects_are_one_selection", exact_resource)


def exact_validator(self):
    pins = c["captureValidator"].info()["controlPins"]
    self.assertEqual([p["path"]for p in pins], [
        "qualification/native_capacity_managed_workload_v3.py",
        "qualification/native_capacity_paced_resource_plan_v2.py",
        "qualification/native_capacity_paced_timing_envelope_data_v1.py"])
    self.assertEqual(pins[1]["sha256"], "599f19ae7989f3129a21dc0f5d173dcfc7af70817154222fa18d9783979de6ce")
    self.assertFalse(c["captureValidator"].info()["nativeExecuted"])
check("real_loader_prepares_distinct_full_outer_v3_validator", exact_validator)


_full_checked = None


def full_checked():
    global _full_checked
    if _full_checked is None:
        raw = frame_bytes(fixture["frame"])
        _full_checked = c["captureValidator"].validate(raw, b"", receipt(raw), workload,
            assembly["entryPlan"]["plan"]["context"]["runId"])
    return _full_checked


def selected_fixture_data(self):
    self.assertTrue(m.same(fixture["workload"], workload))
    self.assertEqual(fixture["runId"], assembly["entryPlan"]["plan"]["context"]["runId"])
    result = full_checked()
    self.assertEqual(result["status"], "MATCHING_DECLARED_PACED_V3_OUTER_CAPTURE_DATA")
    self.assertTrue(result["balanceObservationBarrierSeriesRecomputed"])
    self.assertFalse(result["nativeResourcesQualified"])
    self.assertEqual(result["authority"], "NONE")
check("actual_selected_four_call_frame_passes_real_driver_loaded_full_validator", selected_fixture_data)


def smaller_generic_rejected(self):
    raw = frame_bytes(generic["frame"])
    self.assertNotEqual(generic["workload"], workload)
    with self.assertRaises(ValueError):
        c["captureValidator"].validate(raw, b"", receipt(raw), workload, generic["runId"])
check("preserved_smaller_generic_fixture_still_cannot_qualify_full_default", smaller_generic_rejected)


def smaller_call_count(self):
    selected = copy.deepcopy(workload); selected["plan"]["measurementCallsPerLane"] = 2
    raw = frame_bytes(fixture["frame"])
    with self.assertRaises(ValueError):
        c["captureValidator"].validate(raw, b"", receipt(raw), selected, fixture["runId"])
check("complete_four_call_frame_cannot_be_reclassified_as_a_smaller_plan", smaller_call_count)


def no_native_mode(self):
    args = m.arguments(["--repo", str(repo), "--manifest-sha256", manifest_sha])
    self.assertFalse(args.execute); self.assertFalse(args.pre_native_plan)
    self.assertIsNone(args.manager); self.assertIsNone(args.root)
    self.assertNotIn("paced_v2_actual_owned_storage", sys.modules)
    self.assertNotIn("sqlite3", sys.modules)
    self.assertFalse(info["privateRootsOpened"]); self.assertFalse(info["profilesWritten"])
    self.assertEqual(audited, dict(nativeProcesses=0, sockets=0, sqlite=0, writeOpens=0))
check("source_pipeline_never_enters_real_store_native_or_preflight_branch", no_native_mode)


def reads_shared(self):
    self.assertEqual(reads, dict(nodeReadOpens=1, packageReadOpens=404))
    self.assertEqual(info["sourceOrPackageTreeCopies"], 0)
    self.assertFalse(assembly["summary"]["physicalRootsAuthenticated"])
    self.assertFalse(assembly["summary"]["profilesWritten"])
    self.assertEqual(parent["sourceRowsSha256"], c["producer"].PARENT_SEAL)
check("all_role_profiles_reuse_one_actual_whole_source_context", reads_shared)



def exact_fixture_selection(self):
    self.assertEqual(fixture_wrapper["kind"], "SYNTHETIC_EXACT_SELECTED_DEFAULT_OUTER_V3_SOURCE_DATA_NOT_NATIVE_CAPTURE")
    self.assertEqual(fixture_wrapper["workloadPlanSha256"], hashlib.sha256(admitted["inputs"][m.PLAN][0]).hexdigest())
    self.assertTrue(fixture_wrapper["fullSelectedDefaultPlanPreserved"])
    self.assertTrue(fixture_wrapper["sourceOwnerWriterAndBalanceHelpersGenuine"])
    self.assertTrue(fixture_wrapper["pairChildAndReceiptFactsSynthetic"])
    for name in ("nativeAdapterExecuted", "SDK", "SQLite", "keys", "signatures", "nonceSearch",
            "sockets", "hostTimers", "nativeChildren"):
        self.assertIs(fixture_wrapper[name], False)
check("fresh_fixture_is_the_exact_real_source_admitted_default_not_native_evidence", exact_fixture_selection)


def complete_original_counts(self):
    result = full_checked()
    self.assertEqual(result["completedSourceOriginalCalls"], 10)
    self.assertEqual(result["dispatchedMeasuredSourceCalls"], 8)
    self.assertEqual(result["preEntryWithdrawals"], 0)
    self.assertTrue(result["allSourceOriginalsCompletedAsData"])
    self.assertEqual(result["childCloseRowsAsData"], 4)
    self.assertEqual(result["writerIntervalsAsData"], 14)
    self.assertEqual(result["balanceObservationsAsData"], 6)
    self.assertEqual(result["balanceTimingEventsAsData"], 12)
    for row in fixture["frame"]["evidence"]:
        commands = row["payerOperationTimings"]
        self.assertEqual(sum(c["kind"]=="EXECUTE"for c in commands), 5)
        self.assertEqual(len(commands), 13)
check("all_ten_originals_eight_measured_calls_and_full_writer_sequence_match", complete_original_counts)


def complete_frame_reservation(self):
    raw = frame_bytes(fixture["frame"])
    self.assertLessEqual(len(raw), admitted["effects"]["nodeStdoutLimit"])
    self.assertEqual(fixture["frame"]["sourceRowsSha256"], parent["sourceRowsSha256"])
    self.assertEqual(fixture["frame"]["childSourceRowsSha256"], parent["childSourceRowsSha256"])
    self.assertEqual(fixture["frame"]["balanceBarrierData"]["trace"]["context"]["laneIds"], workload["laneIds"])
check("whole_selected_frame_and_private_profiles_share_source_lane_context_and_cap", complete_frame_reservation)


def independent_run(self):
    raw = frame_bytes(fixture["frame"])
    with self.assertRaises(ValueError):
        c["captureValidator"].validate(raw, b"", receipt(raw), workload, "3"*64)
check("matching_source_and_plan_do_not_hide_a_foreign_expected_run", independent_run)


def independent_child_clocks(self):
    value = copy.deepcopy(fixture); shift = 10**30
    for row in value["frame"]["evidence"]:
        for interval in row["serviceWriterIntervals"]:
            for name in ("beforeBeginNs", "afterBeginNs", "beforeCommitNs", "afterCommitNs"):
                interval[name] = str(int(interval[name]) + shift)
        for name in ("startNs", "stopNs"):
            row["serviceMeasurementWindow"][name] = str(int(row["serviceMeasurementWindow"][name]) + shift)
        for command in row["payerOperationTimings"]:
            command["startNs"] = str(int(command["startNs"]) + 2*shift)
            command["endNs"] = str(int(command["endNs"]) + 2*shift)
    raw = frame_bytes(value["frame"])
    checked = c["captureValidator"].validate(raw, b"", receipt(raw), workload, run_id)
    self.assertTrue(checked["wholeParentPacedAndWriterDataRecomputed"])
    self.assertTrue(checked["balanceObservationBarrierSeriesRecomputed"])
    self.assertFalse(checked["balanceSqlOrL1LatencyQualified"])
check("full_default_child_clocks_remain_separate_from_parent_balance_clocks", independent_child_clocks)


def source_not_replayed(self):
    previous = copy.deepcopy(fixture); first = full_checked()
    self.assertIs(full_checked(), first)
    self.assertEqual(fixture, previous)
    self.assertEqual(reads, dict(nodeReadOpens=1, packageReadOpens=404))
    self.assertEqual(audited, dict(nativeProcesses=0, sockets=0, sqlite=0, writeOpens=0))
    self.assertFalse(first["receiptsIndependentlyAuthenticated"])
    self.assertFalse(first["sustainableCapacityQualified"])
check("independent_arithmetic_does_not_replay_source_import_native_or_mutate_input", source_not_replayed)


if __name__ == "__main__":
    result = unittest.TextTestRunner(stream=io.StringIO(), verbosity=0).run(unittest.defaultTestLoader.loadTestsFromTestCase(Pipeline))
    admitted["unchanged"]()
    m.recheck_profile_sources(parent, c["common"], node)
    stable = m.read(source_path) == before and m.read(source_fixture_path) == fixture_before and m.read(generic_path) == generic_before
    success = (result.wasSuccessful() and stable and not any(audited.values())
        and reads == dict(nodeReadOpens=1, packageReadOpens=404))
    problems = result.failures + result.errors
    print(json.dumps(dict(event="EXACT_SELECTED_DEFAULT_REAL_MANAGED_SOURCE_PIPELINE_DATA_NOT_NATIVE",
        testsRun=result.testsRun, selectedCases=result.testsRun, failures=len(result.failures), errors=len(result.errors),
        skipped=len(result.skipped), successful=success, sourceAndInputsUnchanged=stable,
        sourceContext=info, actualReadObservations=reads, fullDefaultWorkloadBoundInMemory=True,
        genericSmallerFixtureQualifiedAsDefault=False, positiveSelectedDefaultSourceDataQualified=success,
        selectedDefaultOuterValidationAsData=full_checked() if success else None, bindingSummary=assembly["summary"],
        managerImported=False, nativeExecuteOrPreflightEntered=False, profilesWritten=False, auditedEffects=audited,
        failureNames=[str(test)for test,detail in problems], firstFailureText=problems[0][1][:4000]if problems else None,
        authority="NONE")), flush=True)
    raise SystemExit(0 if success else 1)
