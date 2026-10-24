"""Current independent Python paced-envelope DATA controls, no native effects.

Read the actual pinned checker and retained genuine-source fixture. No Node,
JavaScript, SDK, manager, SQL, key, signature, socket or child runs here.
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
        or os.environ.get("X402_PACED_ENVELOPE_PYTHON_DATA") != "paced-envelope-independent-python-v1"):
    raise ValueError("EXPLICIT_ISOLATED_PACED_PYTHON_SELECTION")
repo = Path(__file__).absolute().parents[1]
source_path = repo / "qualification/native_capacity_paced_timing_envelope_data_v1.py"
fixture_path = repo / "qualification/fixtures/capacity-paced-cross-language-v1.json"


def ident(s):
    return [s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode, s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns]


def read(path, maximum):
    for p in (path, *path.parents):
        if p.is_symlink():
            raise ValueError("INPUT_LINK")
    s = path.lstat()
    if not stat.S_ISREG(s.st_mode) or s.st_uid != os.getuid() or s.st_nlink != 1 or s.st_size > maximum:
        raise ValueError("INPUT_IDENTITY")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as f:
        if ident(os.fstat(f.fileno())) != ident(s):
            raise ValueError("INPUT_OPEN")
        raw = f.read(maximum + 1)
        if len(raw) != s.st_size or ident(os.fstat(f.fileno())) != ident(s):
            raise ValueError("INPUT_READ")
    if ident(path.lstat()) != ident(s):
        raise ValueError("INPUT_AFTER")
    return raw, ident(s)


raw, source_id = read(source_path, 131072)
fixture_raw, fixture_id = read(fixture_path, 262144)
if (hashlib.sha256(raw).hexdigest() != os.environ.get("X402_PACED_PYTHON_CHECKER_SHA256")
        or hashlib.sha256(fixture_raw).hexdigest() != "66fa3f34a7d55f53d1bbf8ad61edb036504ea77cd1d0d720b834c47fbba361b5"):
    raise ValueError("EXACT_SOURCE_AND_ACTUAL_FIXTURE_PINS")
spec = importlib.util.spec_from_file_location("actual_paced_envelope_data_v1", source_path)
m = importlib.util.module_from_spec(spec)
exec(spec.loader.source_to_code(raw, str(source_path)), m.__dict__)
data = json.loads(fixture_raw)
if data["kind"] != "GENUINE_PACED_SOURCE_SYNTHETIC_DATA_NOT_NATIVE_EVIDENCE":
    raise ValueError("EXPLICIT_SYNTHETIC_DATA_FIXTURE")
cases = data["cases"]


def validate(value):
    return m.validate_paced_timing_envelope_data(value["capsule"], value["report"], value["expected"])


class Paced(unittest.TestCase):
    maxDiff = 500


def check(name, fn):
    def run(self):
        fn(self)
    run.__name__ = "test_" + name
    setattr(Paced, run.__name__, run)


def positive(self, name):
    value = cases[name]; before = copy.deepcopy(value)
    result = validate(value)
    self.assertEqual(result["check"], value["capsule"]["check"])
    self.assertEqual(result["parentCheck"], value["capsule"]["parentCheck"])
    self.assertIsNot(result["check"], value["capsule"]["check"])
    self.assertIsNot(result["parentCheck"], value["capsule"]["parentCheck"])
    self.assertEqual(value, before)
    self.assertEqual(result["status"], "MATCHING_RECOMPUTED_PACED_V2_DATA")
    self.assertFalse(result["entireInputTreeCopied"])
    self.assertFalse(result["JavaScriptImportedOrReplayed"])
    self.assertEqual(result["authority"], "NONE")
for name in data["cleanScenarioNames"]:
    check("genuine_" + name + "_independently_matches_both_js_checks", lambda self, name=name: positive(self, name))


def setat(value, keys, replacement):
    for k in keys[:-1]:
        value = value[k]
    value[keys[-1]] = replacement


MUTATIONS = json.loads("[[\"wrong_capture_version\",[\"capsule\",\"pacedTimingCaptureVersion\"],1],[\"extra_layout_copy\",[\"capsule\",\"parentTimingData\"],{}],[\"changed_run\",[\"capsule\",\"context\",\"runId\"],\"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd\"],[\"wrong_parent_source\",[\"capsule\",\"context\",\"sourceRowsSha256\"],\"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd\"],[\"wrong_child_source\",[\"capsule\",\"context\",\"childSourceRowsSha256\"],\"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd\"],[\"unknown_envelope\",[\"capsule\",\"status\"],\"UNKNOWN_OR_MISMATCHED_PACED_TRACE\"],[\"parent_trace_unknown\",[\"capsule\",\"trace\",\"coreParentTimingTrace\",\"unknown\"],true],[\"paced_trace_unknown\",[\"capsule\",\"trace\",\"unknown\"],true],[\"wrong_raw_location\",[\"capsule\",\"parentTraceLocation\"],\"parentTimingData.trace\"],[\"wrong_pacing_model\",[\"report\",\"pacingModel\"],\"FIXED_OFFERED_RATE\"],[\"extra_report_field\",[\"report\",\"nativeProof\"],true],[\"wrong_report_plan\",[\"report\",\"core\",\"plan\",\"measurementCallsPerLane\"],3],[\"pending_source\",[\"report\",\"pendingSourceObservations\"],1],[\"pending_logical_operation\",[\"report\",\"core\",\"pendingOperations\"],1],[\"unknown_core\",[\"report\",\"core\",\"uncertainty\"],\"UNKNOWN\"],[\"wrong_returned_close\",[\"report\",\"core\",\"returnedCloses\"],1],[\"wrong_balance_count\",[\"report\",\"core\",\"balanceBarriersObserved\"],1],[\"unknown_window\",[\"report\",\"core\",\"windowOpenBarrierPending\"],true],[\"false_native_claim\",[\"report\",\"nativeEventsAuthenticated\"],true],[\"false_capacity_claim\",[\"report\",\"sustainableCapacityQualified\"],true],[\"fake_successful_distribution\",[\"report\",\"dispatchedCallRecording\",\"phases\",\"FUNDED_CALL\",\"successfulLatencyNanoseconds\",\"p95\"],\"999\"],[\"fake_terminal_distribution\",[\"report\",\"queueWaitRecording\",\"phases\",\"FUNDED_CALL\",\"terminalLatencyNanoseconds\",\"p50\"],\"999\"],[\"fake_queue_count\",[\"report\",\"queueWaitRecording\",\"phases\",\"FUNDED_CALL\",\"entered\"],1],[\"fake_parent_distribution\",[\"report\",\"core\",\"recording\",\"cohorts\",\"MEASUREMENT\",\"phases\",\"FUNDED_CALL\",\"terminalLatencyNanoseconds\",\"p99\"],\"999\"],[\"fake_parent_window\",[\"report\",\"core\",\"recording\",\"measurementNanoseconds\"],\"999\"],[\"fake_parent_peak\",[\"report\",\"core\",\"recording\",\"phases\",\"FUNDED_CALL\",\"peakInFlightDuringMeasurement\"],0],[\"fake_parent_js_check\",[\"capsule\",\"parentCheck\",\"observationsChecked\"],999],[\"fake_paced_js_check\",[\"capsule\",\"check\",\"sourceEntriesChecked\"],999],[\"timer_declaration_out_of_bound\",[\"report\",\"pacingTimersStarted\"],999],[\"raw_event_limit\",[\"capsule\",\"trace\",\"maximumEvents\"],999],[\"boolean_for_zero\",[\"report\",\"pendingQueuedCalls\"],false],[\"boolean_for_clock_count\",[\"capsule\",\"trace\",\"additionalClockReads\"],false],[\"wrong_parent_limit\",[\"capsule\",\"trace\",\"coreParentTimingTrace\",\"limits\",\"maxSamplesPerPhase\"],127],[\"wrong_expected_gap\",[\"expected\",\"minimumStartGapMs\"],1000],[\"duplicate_expected_lanes\",[\"expected\",\"laneIds\"],[\"lane.0\",\"lane.0\"]],[\"parent_child_same_source\",[\"expected\",\"parentSourceRowsSha256\"],\"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc\"],[\"unbounded_expected_samples\",[\"expected\",\"recordingLimits\",\"maxSamplesPerPhase\"],4097],[\"wrong_expected_lane_order\",[\"expected\",\"laneIds\"],[\"lane.1\",\"lane.0\"]],[\"missing_expectation\",[\"expected\",\"plan\"],{}],[\"false_parent_auth_claim\",[\"capsule\",\"parentCheck\",\"nativeEventsAuthenticated\"],true]]")
for name, path, replacement in MUTATIONS:
    def reject(self, path=path, replacement=replacement):
        v = copy.deepcopy(cases["full"]); setat(v, path, replacement)
        with self.assertRaises(ValueError):
            validate(v)
    check("refuses_" + name, reject)


def edit_event(self, kind, edit):
    v = copy.deepcopy(cases["full"])
    row = next(row for row in v["capsule"]["trace"]["events"] if row["kind"] == kind)
    edit(row)
    with self.assertRaises(ValueError):
        validate(v)
for name, kind, key, value in (
        ("fifo_dispatch", "DISPATCH", "request", 2), ("request_original_gap", "REQUEST", "ordinal", 1),
        ("terminal_outcome", "SOURCE_TERMINAL", "outcome", "REJECTED"),
        ("canonical_time", "WAIT_BEGIN", "atNs", "0001"),
        ("nanosecond_range", "DISPATCH", "atNs", str(2**128)),
        ("sequence", "REQUEST", "sequence", 2),
        ("wrong_source_bracket", "SOURCE_TERMINAL", "atNs", "999999999999999"),
        ("unknown_raw_event", "FINALIZE", "kind", "UNOBSERVABLE")):
    check("raw_event_refuses_" + name, lambda self, kind=kind, key=key, value=value:
        edit_event(self, kind, lambda row: row.__setitem__(key, value)))


def forged_both_checks(self):
    v = copy.deepcopy(cases["full"])
    v["report"]["sourceExecuteEntries"] += 1
    v["capsule"]["check"]["sourceEntriesChecked"] += 1
    v["report"]["core"]["recording"]["phases"]["FUNDED_CALL"]["enteredAcrossCohorts"] += 1
    v["capsule"]["parentCheck"]["observationsChecked"] += 1
    with self.assertRaises(ValueError):
        validate(v)
check("does_not_accept_coordinated_forged_report_and_both_supplied_js_checks", forged_both_checks)


def shifted_core(self):
    v = copy.deepcopy(cases["full"])
    for row in v["capsule"]["trace"]["coreParentTimingTrace"]["events"]:
        row["atNs"] = str(int(row["atNs"]) + 1000000000)
    with self.assertRaises(ValueError):
        validate(v)
check("cross_binds_logical_core_brackets_not_just_separate_parent_percentiles", shifted_core)


def forged_gap(self):
    v = copy.deepcopy(cases["full"])
    v["expected"]["minimumStartGapMs"] = v["report"]["minimumStartGapMs"] = v["capsule"]["trace"]["minimumStartGapMs"] = 1000
    with self.assertRaises(ValueError):
        validate(v)
check("recomputes_minimum_gap_even_when_all_supplied_gap_fields_agree", forged_gap)


def pending_withdrawal(self):
    v = copy.deepcopy(cases["withdrawal"])
    row = next(row for row in v["capsule"]["trace"]["events"] if row["kind"] == "WITHDRAW")
    row["recordedWait"] = not row["recordedWait"]
    with self.assertRaises(ValueError):
        validate(v)
check("withdrawal_state_requires_exact_recorded_wait_and_fifo", pending_withdrawal)


def empty_wait(self):
    self.assertEqual(cases["preWaitWithdrawal"]["report"]["queueWaitRecording"]["recordingState"], "EMPTY")
    self.assertEqual(validate(cases["preWaitWithdrawal"])["check"]["sourceEntriesChecked"], 0)
check("genuine_pre_wait_withdrawal_has_no_invented_wait_or_source_latency", empty_wait)


def post_stop(self):
    value = cases["postStopLedger"]
    result = validate(value)
    self.assertEqual(value["report"]["core"]["postStopLedgerRecording"]["phases"]["LEDGER_TRANSACTION"]["entered"], 1)
    self.assertFalse(result["postStopLedgerDurationSeriesRecomputed"])
    self.assertFalse(result["timerEventsIndependentlyRecomputed"])
    v = copy.deepcopy(value)
    v["report"]["core"]["postStopLedgerRecording"]["phases"]["LEDGER_TRANSACTION"]["terminalLatencyNanoseconds"]["samples"] = 2
    with self.assertRaises(ValueError):
        validate(v)
check("genuine_post_stop_ledger_is_bounded_declared_data_not_recomputed_time", post_stop)


def held(self):
    self.assertTrue(data["heldLateSnapshotUnchanged"])
    value = cases["heldAfterLateCompletion"]
    self.assertIsNone(value["capsule"]["check"]); self.assertIsNone(value["capsule"]["parentCheck"])
    with self.assertRaises(ValueError):
        validate(value)
    v = copy.deepcopy(value); v["capsule"]["status"] = "MATCHING_DECLARED_PACED_TRACE"
    v["capsule"]["check"] = copy.deepcopy(cases["full"]["capsule"]["check"])
    v["capsule"]["parentCheck"] = copy.deepcopy(cases["full"]["capsule"]["parentCheck"])
    with self.assertRaises(ValueError):
        validate(v)
check("late_completion_cannot_upgrade_the_genuine_finalized_held_capture", held)


def types(self):
    seen = []
    class Hook(dict):
        def items(self):
            seen.append("items"); raise RuntimeError("must not run")
    v = copy.deepcopy(cases["full"]); v["capsule"] = Hook(v["capsule"])
    with self.assertRaises(ValueError):
        validate(v)
    self.assertEqual(seen, [])
    for value in (1.0, float("nan"), float("inf"), 2**53):
        v = copy.deepcopy(cases["full"]); v["capsule"]["trace"]["additionalClockReads"] = value
        with self.assertRaises(ValueError):
            validate(v)
check("exact_builtins_reject_hooks_floats_and_unsafe_integers", types)


def bounds(self):
    v = copy.deepcopy(cases["full"]); v["capsule"]["trace"]["events"] = [None] * 30001
    with self.assertRaises(ValueError):
        validate(v)
    v = copy.deepcopy(cases["full"]); v["capsule"]["trace"]["extra"] = v["capsule"]
    with self.assertRaises(ValueError):
        validate(v)
check("bounded_walk_rejects_oversize_arrays_and_cycles_without_tree_copy", bounds)


def no_authority(self):
    value = validate(cases["sixteenLanes"])
    self.assertEqual(value["check"]["sourceEntriesChecked"], 48)
    for name in ("callerExpectationsAuthenticated", "nativeEventsAuthenticated", "nativeResourcesQualified",
            "sustainableCapacityQualified", "productionQualified"):
        self.assertIs(value[name], False)
    self.assertFalse(any(n.startswith(("sqlite3", "socket", "subprocess", "storage")) for n in sys.modules))
check("sixteen_lanes_do_not_turn_declarations_into_native_or_capacity_proof", no_authority)


def original_source(self):
    self.assertEqual(read(source_path, 131072), (raw, source_id))
    self.assertEqual(read(fixture_path, 262144), (fixture_raw, fixture_id))
check("source_and_retained_genuine_fixture_are_unchanged", original_source)


selected = unittest.defaultTestLoader.loadTestsFromTestCase(Paced)
count = selected.countTestCases()
buffer = io.StringIO()
result = unittest.TextTestRunner(stream=buffer).run(selected)
stable = read(source_path, 131072) == (raw, source_id) and read(fixture_path, 262144) == (fixture_raw, fixture_id)
out = dict(event="INDEPENDENT_PACED_ENVELOPE_ACTUAL_PYTHON_DATA", testsRun=result.testsRun, selectedCases=count,
    failures=len(result.failures), errors=len(result.errors), skipped=len(result.skipped), successful=result.wasSuccessful(),
    sourceAndFixtureUnchanged=stable, JavaScriptImportedOrReplayed=False, nativeExecuted=False, authority="NONE")
if not result.wasSuccessful():
    out["privateFailureText"] = buffer.getvalue()
print(json.dumps(out, sort_keys=True))
raise SystemExit(0 if result.wasSuccessful() and result.testsRun == count and stable else 1)
