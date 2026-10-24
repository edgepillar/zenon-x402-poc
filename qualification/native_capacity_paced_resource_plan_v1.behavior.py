"""Selected paced resource/entry DATA controls; no managed/native experiment.

Only the explicitly pinned planner is compiled from its actual source bytes.
All profile/root paths below are inert synthetic strings. No profile is opened,
no manager or application module is imported, no root or scratch is created.
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

repo = Path(__file__).absolute().parents[1]
path = repo / "qualification/native_capacity_paced_resource_plan_v1.py"
expected = os.environ.get("X402_PACED_RESOURCE_PLANNER_SHA256", "")
if (os.environ.get("X402_PACED_RESOURCE_DATA_SELECTION") != "paced-resource-entry-data-v1"
        or not (sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode)):
    raise ValueError("EXPLICIT_ISOLATED_RESOURCE_DATA_SELECTION")


def ident(s):
    return [s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode, s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns]


def read_source():
    for at in (path, *path.parents):
        if at.is_symlink():
            raise ValueError("RESOURCE_SOURCE_LINK")
    before = path.lstat()
    if not stat.S_ISREG(before.st_mode) or before.st_uid != os.getuid() or before.st_nlink != 1 or before.st_size > 65536:
        raise ValueError("RESOURCE_SOURCE_IDENTITY")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        if ident(os.fstat(stream.fileno())) != ident(before):
            raise ValueError("RESOURCE_SOURCE_OPEN")
        raw = stream.read(65537)
        if len(raw) != before.st_size or ident(os.fstat(stream.fileno())) != ident(before):
            raise ValueError("RESOURCE_SOURCE_READ")
    if ident(path.lstat()) != ident(before):
        raise ValueError("RESOURCE_SOURCE_CHANGED")
    return raw, ident(before)


raw, source_id = read_source()
if len(expected) != 64 or hashlib.sha256(raw).hexdigest() != expected:
    raise ValueError("RESOURCE_SOURCE_PIN")
spec = importlib.util.spec_from_file_location("actual_paced_resource_plan_v1", path)
m = importlib.util.module_from_spec(spec)
exec(spec.loader.source_to_code(raw, str(path)), m.__dict__)


def workload(lanes=1):
    return dict(pacedWorkloadVersion=1, laneIds=["lane.one"] if lanes == 1 else ["lane." + str(i) for i in range(lanes)],
        plan=dict(warmupCallsPerLane=1, measurementCallsPerLane=1, setupBudgetMs=1000,
            measurementWindowMs=1000, drainGraceMs=100, maxLedgerTransactionsPerOperation=1),
        recordingLimits=dict(maxSamplesPerPhase=64, maxInFlightPerPhase=max(1, lanes)),
        payeeAddress=m.PAYEE, commandBudgetMs=1000, closeBudgetMs=6000, pacing=dict(minimumStartGapMs=1))


def profiles(lanes=1):
    return [dict(laneId=name, payerProfile=dict(path="/synthetic/payer-" + str(i) + ".json",
        sha256=hashlib.sha256(("payer" + str(i)).encode()).hexdigest()),
        serviceProfile=dict(path="/synthetic/service-" + str(i) + ".json",
        sha256=hashlib.sha256(("service" + str(i)).encode()).hexdigest()))
        for i, name in enumerate(workload(lanes)["laneIds"])]


class Resources(unittest.TestCase):
    maxDiff = 400


def check(name, fn):
    def run(self):
        fn(self)
    run.__name__ = "test_" + name
    setattr(Resources, run.__name__, run)


def reject_workload(self, path_keys, replacement):
    value = workload()
    target = value
    for key in path_keys[:-1]:
        target = target[key]
    target[path_keys[-1]] = replacement
    for fn in (m.capture_plan, m.resource_plan, m.storage_policy):
        with self.assertRaises(ValueError):
            fn(value)


INVALID = json.loads("[[\"wrong_version\",[\"pacedWorkloadVersion\"],2],[\"boolean_version\",[\"pacedWorkloadVersion\"],true],[\"empty_lanes\",[\"laneIds\"],[]],[\"duplicate_lanes\",[\"laneIds\"],[\"lane.one\",\"lane.one\"]],[\"too_many_lanes\",[\"laneIds\"],[\"lane.0\",\"lane.1\",\"lane.2\",\"lane.3\",\"lane.4\",\"lane.5\",\"lane.6\",\"lane.7\",\"lane.8\",\"lane.9\",\"lane.10\",\"lane.11\",\"lane.12\",\"lane.13\",\"lane.14\",\"lane.15\",\"lane.16\"]],[\"unicode_lane\",[\"laneIds\"],[\"lane.\u00e9\"]],[\"empty_lane\",[\"laneIds\"],[\"\"]],[\"tuple_or_object_lanes\",[\"laneIds\"],{}],[\"different_payee\",[\"payeeAddress\"],\"z1not-the-public-fixture\"],[\"zero_samples\",[\"recordingLimits\",\"maxSamplesPerPhase\"],0],[\"extra_pacing_field\",[\"pacing\"],{\"minimumStartGapMs\":1,\"unlimited\":true}],[\"total_call_overflow\",[\"plan\",\"warmupCallsPerLane\"],255],[\"ledger_slot_overflow\",[\"plan\"],{\"warmupCallsPerLane\":3,\"measurementCallsPerLane\":1,\"setupBudgetMs\":1000,\"measurementWindowMs\":1000,\"drainGraceMs\":100,\"maxLedgerTransactionsPerOperation\":16}],[\"plan_warmupCallsPerLane_below\",[\"plan\",\"warmupCallsPerLane\"],-1],[\"plan_warmupCallsPerLane_above\",[\"plan\",\"warmupCallsPerLane\"],256],[\"plan_warmupCallsPerLane_boolean\",[\"plan\",\"warmupCallsPerLane\"],true],[\"plan_measurementCallsPerLane_below\",[\"plan\",\"measurementCallsPerLane\"],0],[\"plan_measurementCallsPerLane_above\",[\"plan\",\"measurementCallsPerLane\"],257],[\"plan_measurementCallsPerLane_boolean\",[\"plan\",\"measurementCallsPerLane\"],true],[\"plan_setupBudgetMs_below\",[\"plan\",\"setupBudgetMs\"],0],[\"plan_setupBudgetMs_above\",[\"plan\",\"setupBudgetMs\"],60001],[\"plan_setupBudgetMs_boolean\",[\"plan\",\"setupBudgetMs\"],true],[\"plan_measurementWindowMs_below\",[\"plan\",\"measurementWindowMs\"],0],[\"plan_measurementWindowMs_above\",[\"plan\",\"measurementWindowMs\"],60001],[\"plan_measurementWindowMs_boolean\",[\"plan\",\"measurementWindowMs\"],true],[\"plan_drainGraceMs_below\",[\"plan\",\"drainGraceMs\"],0],[\"plan_drainGraceMs_above\",[\"plan\",\"drainGraceMs\"],1001],[\"plan_drainGraceMs_boolean\",[\"plan\",\"drainGraceMs\"],true],[\"plan_maxLedgerTransactionsPerOperation_below\",[\"plan\",\"maxLedgerTransactionsPerOperation\"],0],[\"plan_maxLedgerTransactionsPerOperation_above\",[\"plan\",\"maxLedgerTransactionsPerOperation\"],17],[\"plan_maxLedgerTransactionsPerOperation_boolean\",[\"plan\",\"maxLedgerTransactionsPerOperation\"],true],[\"recordingLimits_maxSamplesPerPhase_below\",[\"recordingLimits\",\"maxSamplesPerPhase\"],0],[\"recordingLimits_maxSamplesPerPhase_above\",[\"recordingLimits\",\"maxSamplesPerPhase\"],4097],[\"recordingLimits_maxSamplesPerPhase_boolean\",[\"recordingLimits\",\"maxSamplesPerPhase\"],true],[\"recordingLimits_maxInFlightPerPhase_below\",[\"recordingLimits\",\"maxInFlightPerPhase\"],0],[\"recordingLimits_maxInFlightPerPhase_above\",[\"recordingLimits\",\"maxInFlightPerPhase\"],65],[\"recordingLimits_maxInFlightPerPhase_boolean\",[\"recordingLimits\",\"maxInFlightPerPhase\"],true],[\"commandBudgetMs_below\",[\"commandBudgetMs\"],999],[\"commandBudgetMs_above\",[\"commandBudgetMs\"],60001],[\"commandBudgetMs_boolean\",[\"commandBudgetMs\"],true],[\"closeBudgetMs_below\",[\"closeBudgetMs\"],5999],[\"closeBudgetMs_above\",[\"closeBudgetMs\"],15001],[\"closeBudgetMs_boolean\",[\"closeBudgetMs\"],true],[\"pacing_minimumStartGapMs_below\",[\"pacing\",\"minimumStartGapMs\"],0],[\"pacing_minimumStartGapMs_above\",[\"pacing\",\"minimumStartGapMs\"],1001],[\"pacing_minimumStartGapMs_boolean\",[\"pacing\",\"minimumStartGapMs\"],true]]")
for name, keys, replacement in INVALID:
    check("workload_refuses_" + name, lambda self, keys=keys, replacement=replacement: reject_workload(self, keys, replacement))


BAD_REFS = json.loads("[[\"missing_service\",[{\"laneId\":\"lane.one\",\"payerProfile\":{\"path\":\"/synthetic/payer.json\",\"sha256\":\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\"}}]],[\"reordered_lane\",[{\"laneId\":\"lane.other\",\"payerProfile\":{\"path\":\"/synthetic/payer.json\",\"sha256\":\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\"},\"serviceProfile\":{\"path\":\"/synthetic/service.json\",\"sha256\":\"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc\"}}]],[\"relative_path\",[{\"laneId\":\"lane.one\",\"payerProfile\":{\"path\":\"relative.json\",\"sha256\":\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\"},\"serviceProfile\":{\"path\":\"/synthetic/service.json\",\"sha256\":\"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc\"}}]],[\"traversal_path\",[{\"laneId\":\"lane.one\",\"payerProfile\":{\"path\":\"/one/../two.json\",\"sha256\":\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\"},\"serviceProfile\":{\"path\":\"/synthetic/service.json\",\"sha256\":\"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc\"}}]],[\"dot_path\",[{\"laneId\":\"lane.one\",\"payerProfile\":{\"path\":\"/one/./two.json\",\"sha256\":\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\"},\"serviceProfile\":{\"path\":\"/synthetic/service.json\",\"sha256\":\"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc\"}}]],[\"empty_component\",[{\"laneId\":\"lane.one\",\"payerProfile\":{\"path\":\"/one//two.json\",\"sha256\":\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\"},\"serviceProfile\":{\"path\":\"/synthetic/service.json\",\"sha256\":\"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc\"}}]],[\"trailing_slash\",[{\"laneId\":\"lane.one\",\"payerProfile\":{\"path\":\"/one/\",\"sha256\":\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\"},\"serviceProfile\":{\"path\":\"/synthetic/service.json\",\"sha256\":\"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc\"}}]],[\"root_as_profile\",[{\"laneId\":\"lane.one\",\"payerProfile\":{\"path\":\"/\",\"sha256\":\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\"},\"serviceProfile\":{\"path\":\"/synthetic/service.json\",\"sha256\":\"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc\"}}]],[\"same_path\",[{\"laneId\":\"lane.one\",\"payerProfile\":{\"path\":\"/synthetic/payer.json\",\"sha256\":\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\"},\"serviceProfile\":{\"path\":\"/synthetic/payer.json\",\"sha256\":\"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc\"}}]],[\"same_digest\",[{\"laneId\":\"lane.one\",\"payerProfile\":{\"path\":\"/synthetic/payer.json\",\"sha256\":\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\"},\"serviceProfile\":{\"path\":\"/synthetic/service.json\",\"sha256\":\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\"}}]],[\"uppercase_digest\",[{\"laneId\":\"lane.one\",\"payerProfile\":{\"path\":\"/synthetic/payer.json\",\"sha256\":\"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\"},\"serviceProfile\":{\"path\":\"/synthetic/service.json\",\"sha256\":\"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc\"}}]],[\"extra_ref_field\",[{\"laneId\":\"lane.one\",\"payerProfile\":{\"path\":\"/synthetic/payer.json\",\"sha256\":\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\",\"authenticated\":true},\"serviceProfile\":{\"path\":\"/synthetic/service.json\",\"sha256\":\"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc\"}}]],[\"control_path\",[{\"laneId\":\"lane.one\",\"payerProfile\":{\"path\":\"/one\\nprivate.json\",\"sha256\":\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\"},\"serviceProfile\":{\"path\":\"/synthetic/service.json\",\"sha256\":\"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc\"}}]],[\"unicode_path\",[{\"laneId\":\"lane.one\",\"payerProfile\":{\"path\":\"/one/\u00e9.json\",\"sha256\":\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\"},\"serviceProfile\":{\"path\":\"/synthetic/service.json\",\"sha256\":\"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc\"}}]]]")
for name, rows in BAD_REFS:
    def reject_ref(self, rows=rows):
        with self.assertRaises(ValueError):
            m.entry_plan(workload(), "a" * 64, rows)
    check("entry_refuses_" + name, reject_ref)


def event_ceilings(self):
    value = m.resource_plan(workload())
    self.assertEqual(value["privateCoreParentEventsMaximum"], 452)
    self.assertEqual(value["privatePacedEventsMaximum"], 257)
    self.assertEqual(value["uniqueRawTimingEventsMaximum"], 709)
    self.assertEqual(value["privateTimingBytesReserved"], 197888)
    self.assertEqual(value["captureBytesReservedBeforeEntryCap"], 618752)
    self.assertEqual(value["nodeStdoutLimit"], 655360)
    self.assertEqual(value["rawCoreTraceCopies"], 1)
    self.assertEqual(2 * 452 + 257 - value["uniqueRawTimingEventsMaximum"], 452)
check("counts_both_real_recorders_with_one_raw_core_trace", event_ceilings)


def stream_reservations(self):
    r = m.resource_plan(workload())
    self.assertEqual(r["nodeStderrLimit"], min(r["nodeStdoutLimit"], m.MIB))
    self.assertEqual(r["opensslStderrLimit"], min(r["nodeStdoutLimit"], m.MIB))
    self.assertEqual(r["commandStreamsBytesReserved"], r["nodeStdoutLimit"] + r["nodeStderrLimit"]
        + r["opensslStdoutLimit"] + r["opensslStderrLimit"])
    total = sum(r[k] for k in ("privateProfileBytesReserved", "nativeFileBytesReserved",
        "commandStreamsBytesReserved", "independentTlsAliasesBytesReserved", "receiptBytesReserved"))
    self.assertGreaterEqual(r["taskQuotaBytes"], total)
    self.assertLess(r["taskQuotaBytes"] - total, m.MIB)
    self.assertEqual(r["taskQuotaBytes"] % m.MIB, 0)
check("reserves_both_actual_managed_command_stderr_streams", stream_reservations)


def free_space_policy(self):
    r, p = m.resource_plan(workload()), m.storage_policy(workload())
    self.assertEqual(p["min_free_bytes"], 10 * 1024**3)
    self.assertEqual(p["safety_margin_bytes"], 1024**3)
    self.assertEqual(p["task_quota_bytes"], r["taskQuotaBytes"])
    self.assertEqual(p["scratch_quota_bytes"], p["store_quota_bytes"])
    self.assertEqual(r["requiredFreeBytesBeforeOtherReservations"], 11 * 1024**3 + r["taskQuotaBytes"])
    self.assertFalse(r["otherTasksReservationsIncluded"])
    self.assertEqual(p["max_commands_per_task"], 2)
    self.assertEqual(p["max_tasks"], 1)
check("keeps_ten_gib_floor_and_does_not_invent_other_reservation_checks", free_space_policy)


def pacing_timeout(self):
    a = workload(2); a["plan"]["measurementCallsPerLane"] = 10
    b = copy.deepcopy(a); b["pacing"]["minimumStartGapMs"] = 1000
    x, y = m.resource_plan(a), m.resource_plan(b)
    self.assertEqual(x["nodeTimeoutSeconds"], y["nodeTimeoutSeconds"])
    self.assertEqual(y["pacingAddedToNodeTimeoutMs"], 0)
    self.assertEqual(x["minimumSpanForAllRequestedMeasuredStartsMs"], 19)
    self.assertEqual(y["minimumSpanForAllRequestedMeasuredStartsMs"], 19000)
    self.assertFalse(y["allRequestedCallsGuaranteed"])
    self.assertNotEqual(x["workloadPlanSha256"], y["workloadPlanSha256"])
check("pacing_stays_inside_fixed_measurement_window_not_an_added_wait", pacing_timeout)


def too_large(self):
    v = workload(16); v["plan"].update(warmupCallsPerLane=0, measurementCallsPerLane=255)
    v["recordingLimits"]["maxSamplesPerPhase"] = 4096
    original = copy.deepcopy(v); r = m.resource_plan(v)
    self.assertEqual(r["uniqueRawTimingEventsMaximum"], 45061)
    self.assertGreater(r["requestedNodeStdoutLimit"], 16 * m.MIB)
    self.assertEqual(r["nodeStdoutLimit"], 16 * m.MIB)
    self.assertFalse(r["captureReservationFitsEntryCap"])
    self.assertFalse(r["managedStoragePolicyReady"])
    self.assertFalse(r["automaticSampleReduction"])
    self.assertEqual(v, original)
    with self.assertRaisesRegex(ValueError, "^PACED_CAPTURE_RESERVATION_EXCEEDS_ENTRY_CAP$"):
        m.storage_policy(v)
check("refuses_policy_for_oversized_capture_without_shrinking_or_retry", too_large)


def ceilings_scale(self):
    r = m.resource_plan(workload(16))
    self.assertEqual(r["privateProfileBytesReserved"], 33 * 524288)
    self.assertEqual(r["nativeFileBytesReserved"], 16 * 32 * m.MIB)
    self.assertEqual(r["nodeChildProcessesMaximum"], 32)
    self.assertEqual(r["sqliteNewPathsMaximum"], 64)
    self.assertEqual(r["independentPinFilesMaximum"], 32)
    self.assertEqual(r["nonceCandidatesTotalReserved"], 16 * 65536)
    self.assertTrue(r["captureReservationFitsEntryCap"])
check("sixteen_lane_reservations_keep_full_profiles_and_child_ceiling", ceilings_scale)


def no_authority(self):
    r = m.resource_plan(workload())
    self.assertNotEqual(r["parentSourceRowsSha256"], r["childSourceRowsSha256"])
    for key in ("effectsExecuted", "nativeAllowanceGranted", "automaticRetry", "automaticSampleReduction",
            "childCreatedFilesAutomaticAdoption", "childCreatedFilesAutomaticDeletion", "externalNetwork",
            "offeredRateQualified", "diskQuotaOsEnforced", "nativeOsNetworkSandbox", "captureHeapByteBoundEstablished"):
        self.assertIs(r[key], False)
    self.assertEqual(r["authority"], "NONE")
    self.assertEqual(r["sourceCopiesRequired"], r["packageCopiesRequired"])
    self.assertEqual(r["sourceCopiesRequired"], 0)
check("source_pins_and_effect_ceilings_do_not_grant_native_authority", no_authority)


def entry_exact(self):
    w, refs = workload(16), profiles(16)
    before = copy.deepcopy((w, refs))
    result = m.entry_plan(w, "a" * 64, refs)
    expected_plan = dict(context=dict(runId="a" * 64), plan=w["plan"], recordingLimits=w["recordingLimits"],
        laneProfiles=refs, payeeAddress=w["payeeAddress"], commandBudgetMs=w["commandBudgetMs"],
        closeBudgetMs=w["closeBudgetMs"], pacing=w["pacing"])
    expected_bytes = (json.dumps(expected_plan, sort_keys=True, separators=(",", ":"), ensure_ascii=True) + "\n").encode("ascii")
    self.assertEqual(result["plan"], expected_plan)
    self.assertEqual(result["planBytes"], expected_bytes)
    self.assertEqual(result["planSha256"], hashlib.sha256(expected_bytes).hexdigest())
    self.assertEqual(result["planBytesCount"], len(expected_bytes))
    self.assertLessEqual(len(expected_bytes), 65536)
    self.assertEqual((w, refs), before)
check("complete_entry_bytes_match_actual_native_entry_shape_without_io", entry_exact)


def detach(self):
    w, refs = workload(), profiles()
    result = m.entry_plan(w, "a" * 64, refs)
    w["plan"]["measurementCallsPerLane"] = 99
    refs[0]["payerProfile"]["path"] = "/different"
    self.assertEqual(result["plan"]["plan"]["measurementCallsPerLane"], 1)
    self.assertNotEqual(result["plan"]["laneProfiles"][0]["payerProfile"]["path"], "/different")
    self.assertIs(result["profileReferencesAuthenticated"], False)
    self.assertIs(result["rootIndependenceAuthenticated"], False)
    self.assertIs(result["nativeExecuted"], False)
check("entry_detaches_refs_but_never_authenticates_roots_or_profiles", detach)


def exact_tree(self):
    seen = []
    class Hooks(dict):
        def items(self):
            seen.append("items"); raise RuntimeError("must not run")
    with self.assertRaises(ValueError):
        m.capture_plan(Hooks(workload()))
    self.assertEqual(seen, [])
    for v in (float("nan"), float("inf"), 1.5, (), 2**53):
        w = workload(); w["plan"]["setupBudgetMs"] = v
        with self.assertRaises(ValueError):
            m.capture_plan(w)
check("rejects_subclasses_floats_and_unsafe_integers_without_hooks", exact_tree)


def run_binding(self):
    for run_id in ("", "A" * 64, "a" * 63, True, "a" * 65):
        with self.assertRaises(ValueError):
            m.entry_plan(workload(), run_id, profiles())
    with self.assertRaises(ValueError):
        m.entry_plan(workload(), "a" * 64, [])
check("entry_needs_independent_exact_run_and_complete_lanes", run_binding)


def entry_cap(self):
    refs = profiles(16)
    for i, row in enumerate(refs):
        row["payerProfile"]["path"] = "/" + "p" * 4080 + str(i)
        row["serviceProfile"]["path"] = "/" + "s" * 4080 + str(i)
    with self.assertRaisesRegex(ValueError, "^ENTRY_PLAN_BYTE_CAP$"):
        m.entry_plan(workload(16), "a" * 64, refs)
check("entry_bytes_respect_real_65536_cap_without_omitting_refs", entry_cap)


def capacity(self):
    w = workload(2); w["recordingLimits"]["maxInFlightPerPhase"] = 1
    with self.assertRaisesRegex(ValueError, "^ACTUAL_CORE_RECORDING_CAPACITY$"):
        m.capture_plan(w)
    w = workload(2); w["recordingLimits"].update(maxSamplesPerPhase=5, maxInFlightPerPhase=2)
    with self.assertRaises(ValueError):
        m.capture_plan(w)
check("keeps_core_lane_balance_and_ledger_recording_capacity", capacity)


def input_mutation(self):
    w = workload(); original = copy.deepcopy(w)
    a = m.capture_plan(w); a["pacing"]["minimumStartGapMs"] = 1000
    self.assertEqual(w, original)
    other_order = dict(reversed(list(w.items())))
    self.assertEqual(m.resource_plan(w)["workloadPlanSha256"], m.resource_plan(other_order)["workloadPlanSha256"])
check("canonical_binding_and_detached_plan_are_stable_without_input_mutation", input_mutation)


def no_files(self):
    self.assertEqual(read_source(), (raw, source_id))
    self.assertFalse(any(name.startswith(("sqlite3", "socket", "subprocess", "storage")) for name in sys.modules))
check("selected_source_unchanged_and_no_native_or_manager_modules_imported", no_files)


selected = unittest.defaultTestLoader.loadTestsFromTestCase(Resources)
expected_cases = selected.countTestCases()
buffer = io.StringIO()
result = unittest.TextTestRunner(stream=buffer).run(selected)
stable = read_source() == (raw, source_id)
out = dict(event="PACED_RESOURCE_ENTRY_ACTUAL_DATA_NOT_NATIVE", testsRun=result.testsRun,
    selectedCases=expected_cases, failures=len(result.failures), errors=len(result.errors), skipped=len(result.skipped),
    successful=result.wasSuccessful() and result.testsRun == expected_cases, plannerUnchanged=stable,
    privateRootsOpened=False, filesWritten=0, managerImported=False, nativeExecuted=False, authority="NONE")
if not result.wasSuccessful():
    out["privateFailureText"] = buffer.getvalue()
print(json.dumps(out, sort_keys=True))
raise SystemExit(0 if out["successful"] and stable else 1)
