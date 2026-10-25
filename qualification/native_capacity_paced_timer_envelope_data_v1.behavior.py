"""Independent Python timer-envelope DATA controls, no native effects.

Read the actual pinned checker and the owned parent's complete in-memory stream
from the genuine JavaScript DATA producer. Python never imports/replays JS, opens
a fixture file or enters SDK, manager, SQL, keys, signatures, sockets or children.
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
        or os.environ.get("X402_PACED_TIMER_ENVELOPE_PYTHON_DATA") != "paced-timer-envelope-independent-python-v1"):
    raise ValueError("EXPLICIT_ISOLATED_PACED_PYTHON_SELECTION")
repo = Path(__file__).absolute().parents[1]
source_path = repo / "qualification/native_capacity_paced_timer_envelope_data_v1.py"
FIXTURE_CAP = 8 * 1048576
audited = dict(nativeProcesses=0, sockets=0, sqlite=0, writeOpens=0)
def audit(event, args):
    if event in ("subprocess.Popen", "os.system", "os.fork", "os.posix_spawn"):
        audited["nativeProcesses"] += 1; raise AssertionError("NO_PROCESS_IN_TIMER_PYTHON_DATA")
    if event.startswith("socket."):
        audited["sockets"] += 1; raise AssertionError("NO_SOCKET_IN_TIMER_PYTHON_DATA")
    if event == "sqlite3.connect":
        audited["sqlite"] += 1; raise AssertionError("NO_SQLITE_IN_TIMER_PYTHON_DATA")
    if event == "open" and type(args[2]) is int and args[2] & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC):
        audited["writeOpens"] += 1; raise AssertionError("NO_WRITE_IN_TIMER_PYTHON_DATA")
sys.addaudithook(audit)
maximum_observation = None


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
fixture_raw = sys.stdin.buffer.read(FIXTURE_CAP + 1)
if not (0 < len(fixture_raw) <= FIXTURE_CAP and fixture_raw.isascii()
        and fixture_raw.endswith(b"\n") and fixture_raw.count(b"\n") == 1):
    raise ValueError("BOUNDED_ONE_COMPLETE_FIXTURE_STREAM")
if (hashlib.sha256(raw).hexdigest() != os.environ.get("X402_PACED_TIMER_PYTHON_CHECKER_SHA256")
        or hashlib.sha256(fixture_raw).hexdigest() != os.environ.get("X402_PACED_TIMER_FIXTURE_SHA256")):
    raise ValueError("EXACT_SOURCE_AND_ACTUAL_FIXTURE_PINS")
spec = importlib.util.spec_from_file_location("actual_paced_timer_envelope_data_v1", source_path)
m = importlib.util.module_from_spec(spec)
exec(spec.loader.source_to_code(raw, str(source_path)), m.__dict__)
def json_pairs(items):
    result = {}
    for key, value in items:
        if key in result: raise ValueError("DUPLICATE_FIXTURE_KEY")
        result[key] = value
    return result
def json_int(value):
    if value == "-0" or len(value) > 17 or abs(int(value)) > 2**53-1:
        raise ValueError("FIXTURE_SAFE_INTEGER")
    return int(value)
def no_float(_value):
    raise ValueError("FIXTURE_INTEGER_ONLY")
data = json.loads(fixture_raw, object_pairs_hook=json_pairs, parse_int=json_int,
    parse_float=no_float, parse_constant=no_float)
if data["kind"] != "GENUINE_PACED_TIMER_SOURCE_SYNTHETIC_DATA_NOT_NATIVE_EVIDENCE":
    raise ValueError("EXPLICIT_SYNTHETIC_DATA_FIXTURE")
cases = data["cases"]


def validate(value):
    return m.validate_paced_timer_envelope_data(value["capsule"], value["report"], value["expected"])


class Paced(unittest.TestCase):
    maxDiff = 500


def check(name, fn):
    def run(self):
        fn(self)
    run.__name__ = "test_" + name
    setattr(Paced, run.__name__, run)


def fingerprint(value):
    # Hash a complete canonical encoding incrementally; no second multi-MiB
    # expected input copy or joined JSON buffer just to test non-mutation.
    digest, size = hashlib.sha256(), 0
    for part in json.JSONEncoder(sort_keys=True, separators=(",", ":"), ensure_ascii=True).iterencode(value):
        raw_part = part.encode("ascii"); digest.update(raw_part); size += len(raw_part)
    return dict(bytes=size, sha256=digest.hexdigest())


def positive(self, name):
    global maximum_observation
    value = cases[name]
    before = fingerprint(value) if name == "maximumCalls" else copy.deepcopy(value)
    result = validate(value)
    self.assertEqual(result["check"], value["capsule"]["check"])
    self.assertEqual(result["parentCheck"], value["capsule"]["parentCheck"])
    self.assertIsNot(result["check"], value["capsule"]["check"])
    self.assertIsNot(result["parentCheck"], value["capsule"]["parentCheck"])
    self.assertEqual(fingerprint(value) if name == "maximumCalls" else value, before)
    if name == "maximumCalls":
        self.assertEqual(result["check"]["pacedCheck"]["sourceEntriesChecked"], 4080)
        self.assertEqual(result["check"]["eventsChecked"], 12238)
        maximum_observation = dict(sourceEntries=4080, timerRows=12238,
            parentRows=result["parentCheck"]["eventsChecked"], pacedRows=result["check"]["pacedEventsCrossChecked"],
            canonicalInputBytes=before["bytes"], allRawRowsRetained=True, fullInputTreeCopiedForCheck=False)
    self.assertEqual(result["status"], "MATCHING_RECOMPUTED_PACED_TIMER_V1_DATA")
    self.assertFalse(result["entireInputTreeCopied"])
    self.assertFalse(result["JavaScriptImportedOrReplayed"])
    self.assertEqual(result["authority"], "NONE")
for name in data["cleanScenarioNames"]:
    check("genuine_" + name + "_independently_matches_both_js_checks", lambda self, name=name: positive(self, name))


def setat(value, keys, replacement):
    for k in keys[:-1]:
        value = value[k]
    value[keys[-1]] = replacement


MUTATIONS = json.loads("[[\"wrong_capture_version\",[\"capsule\",\"pacedTimerCaptureVersion\"],2],[\"extra_layout_copy\",[\"capsule\",\"parentTimingData\"],{}],[\"changed_run\",[\"capsule\",\"context\",\"runId\"],\"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd\"],[\"wrong_parent_source\",[\"capsule\",\"context\",\"sourceRowsSha256\"],\"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd\"],[\"wrong_child_source\",[\"capsule\",\"context\",\"childSourceRowsSha256\"],\"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd\"],[\"unknown_envelope\",[\"capsule\",\"status\"],\"UNKNOWN_OR_MISMATCHED_PACED_TIMER_TRACE\"],[\"parent_trace_unknown\",[\"capsule\",\"trace\",\"coreParentTimingTrace\",\"unknown\"],true],[\"paced_trace_unknown\",[\"capsule\",\"trace\",\"unknown\"],true],[\"wrong_raw_location\",[\"capsule\",\"parentTraceLocation\"],\"parentTimingData.trace\"],[\"wrong_pacing_model\",[\"report\",\"pacingModel\"],\"FIXED_OFFERED_RATE\"],[\"extra_report_field\",[\"report\",\"nativeProof\"],true],[\"wrong_report_plan\",[\"report\",\"core\",\"plan\",\"measurementCallsPerLane\"],3],[\"pending_source\",[\"report\",\"pendingSourceObservations\"],1],[\"pending_logical_operation\",[\"report\",\"core\",\"pendingOperations\"],1],[\"unknown_core\",[\"report\",\"core\",\"uncertainty\"],\"UNKNOWN\"],[\"wrong_returned_close\",[\"report\",\"core\",\"returnedCloses\"],1],[\"wrong_balance_count\",[\"report\",\"core\",\"balanceBarriersObserved\"],1],[\"unknown_window\",[\"report\",\"core\",\"windowOpenBarrierPending\"],true],[\"false_native_claim\",[\"report\",\"nativeEventsAuthenticated\"],true],[\"false_capacity_claim\",[\"report\",\"sustainableCapacityQualified\"],true],[\"fake_successful_distribution\",[\"report\",\"dispatchedCallRecording\",\"phases\",\"FUNDED_CALL\",\"successfulLatencyNanoseconds\",\"p95\"],\"999\"],[\"fake_terminal_distribution\",[\"report\",\"queueWaitRecording\",\"phases\",\"FUNDED_CALL\",\"terminalLatencyNanoseconds\",\"p50\"],\"999\"],[\"fake_queue_count\",[\"report\",\"queueWaitRecording\",\"phases\",\"FUNDED_CALL\",\"entered\"],1],[\"fake_parent_distribution\",[\"report\",\"core\",\"recording\",\"cohorts\",\"MEASUREMENT\",\"phases\",\"FUNDED_CALL\",\"terminalLatencyNanoseconds\",\"p99\"],\"999\"],[\"fake_parent_window\",[\"report\",\"core\",\"recording\",\"measurementNanoseconds\"],\"999\"],[\"fake_parent_peak\",[\"report\",\"core\",\"recording\",\"phases\",\"FUNDED_CALL\",\"peakInFlightDuringMeasurement\"],0],[\"fake_parent_js_check\",[\"capsule\",\"parentCheck\",\"observationsChecked\"],999],[\"fake_paced_js_check\",[\"capsule\",\"check\",\"pacedCheck\",\"sourceEntriesChecked\"],999],[\"timer_declaration_out_of_bound\",[\"report\",\"pacingTimersStarted\"],999],[\"raw_event_limit\",[\"capsule\",\"trace\",\"maximumEvents\"],999],[\"boolean_for_zero\",[\"report\",\"pendingQueuedCalls\"],false],[\"boolean_for_clock_count\",[\"capsule\",\"trace\",\"additionalClockReads\"],false],[\"wrong_parent_limit\",[\"capsule\",\"trace\",\"coreParentTimingTrace\",\"limits\",\"maxSamplesPerPhase\"],127],[\"wrong_expected_gap\",[\"expected\",\"minimumStartGapMs\"],1000],[\"duplicate_expected_lanes\",[\"expected\",\"laneIds\"],[\"lane.0\",\"lane.0\"]],[\"parent_child_same_source\",[\"expected\",\"parentSourceRowsSha256\"],\"d756740994aeb53ebeee47320d732583d96381dfa8c00e18a30f414e70a77027\"],[\"unbounded_expected_samples\",[\"expected\",\"recordingLimits\",\"maxSamplesPerPhase\"],4097],[\"wrong_expected_lane_order\",[\"expected\",\"laneIds\"],[\"lane.1\",\"lane.0\"]],[\"missing_expectation\",[\"expected\",\"plan\"],{}],[\"false_parent_auth_claim\",[\"capsule\",\"parentCheck\",\"nativeEventsAuthenticated\"],true],[\"timer_unknown\",[\"capsule\",\"timerTrace\",\"unknown\"],true],[\"timer_raw_token_claim\",[\"capsule\",\"timerTrace\",\"rawTokensIncluded\"],true],[\"timer_false_physical_absence\",[\"capsule\",\"timerTrace\",\"physicalTimerAbsenceQualified\"],true],[\"timer_extra_clock_read\",[\"capsule\",\"timerTrace\",\"additionalClockReads\"],1],[\"timer_boolean_for_clock_zero\",[\"capsule\",\"timerTrace\",\"additionalClockReads\"],false],[\"timer_wrong_hard_bound\",[\"capsule\",\"timerTrace\",\"maximumEvents\"],514],[\"timer_wrong_lane_count\",[\"capsule\",\"timerTrace\",\"laneCount\"],1],[\"timer_wrong_gap\",[\"capsule\",\"timerTrace\",\"minimumStartGapMs\"],1],[\"timer_wrong_scope\",[\"capsule\",\"timerTrace\",\"scope\"],\"PHYSICAL_TIMER_PROOF\"],[\"timer_wrong_clock\",[\"capsule\",\"timerTrace\",\"clockDomain\"],\"SQL_CLOCK\"],[\"timer_wrong_limit\",[\"capsule\",\"timerTrace\",\"limits\",\"maxSamplesPerPhase\"],127],[\"timer_omitted_recompute\",[\"capsule\",\"check\",\"timerEventsIndependentlyRecomputed\"],false],[\"timer_fake_arms_summary\",[\"capsule\",\"check\",\"armAttemptsChecked\"],999],[\"timer_fake_fire_summary\",[\"capsule\",\"check\",\"timerFiresChecked\"],999],[\"timer_fake_cancel_summary\",[\"capsule\",\"check\",\"cancelReturnsChecked\"],999],[\"timer_fake_max_live_summary\",[\"capsule\",\"check\",\"maximumLiveTimersObservedAsData\"],2],[\"timer_fake_multiple_paced_passes\",[\"capsule\",\"check\",\"pacedAndParentArithmeticPasses\"],2],[\"timer_false_native_check\",[\"capsule\",\"check\",\"nativeEventsAuthenticated\"],true],[\"timer_false_physical_check\",[\"capsule\",\"check\",\"physicalTimerAbsenceQualified\"],true],[\"timer_wrong_check_authority\",[\"capsule\",\"check\",\"authority\"],\"NATIVE\"],[\"timer_check_missing_paced\",[\"capsule\",\"check\",\"pacedCheck\"],null],[\"timer_check_null_parent\",[\"capsule\",\"parentCheck\"],null]]")
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
    v["capsule"]["check"]["pacedCheck"]["sourceEntriesChecked"] += 1
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
    v["expected"]["minimumStartGapMs"] = v["report"]["minimumStartGapMs"] = v["capsule"]["trace"]["minimumStartGapMs"] = v["capsule"]["timerTrace"]["minimumStartGapMs"] = 1000
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
    self.assertEqual(validate(cases["preWaitWithdrawal"])["check"]["pacedCheck"]["sourceEntriesChecked"], 0)
check("genuine_pre_wait_withdrawal_has_no_invented_wait_or_source_latency", empty_wait)


def post_stop(self):
    value = cases["postStopLedger"]
    result = validate(value)
    self.assertEqual(value["report"]["core"]["postStopLedgerRecording"]["phases"]["LEDGER_TRANSACTION"]["entered"], 1)
    self.assertFalse(result["postStopLedgerDurationSeriesRecomputed"])
    self.assertTrue(result["timerEventsIndependentlyRecomputed"])
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
    v = copy.deepcopy(value); v["capsule"]["status"] = "MATCHING_DECLARED_PACED_TIMER_TRACE"
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
    self.assertEqual(value["check"]["pacedCheck"]["sourceEntriesChecked"], 48)
    for name in ("callerExpectationsAuthenticated", "nativeEventsAuthenticated", "nativeResourcesQualified",
            "sustainableCapacityQualified", "productionQualified"):
        self.assertIs(value[name], False)
    self.assertFalse(any(n.startswith(("sqlite3", "socket", "subprocess", "storage")) for n in sys.modules))
check("sixteen_lanes_do_not_turn_declarations_into_native_or_capacity_proof", no_authority)


def original_source(self):
    self.assertEqual(read(source_path, 131072), (raw, source_id))
    self.assertEqual(hashlib.sha256(fixture_raw).hexdigest(), os.environ["X402_PACED_TIMER_FIXTURE_SHA256"])
check("source_and_complete_owned_fixture_stream_are_unchanged", original_source)




def timer_row_edit(self, scenario, kind, edit):
    v = copy.deepcopy(cases[scenario])
    row = next(row for row in v["capsule"]["timerTrace"]["events"] if row["kind"] == kind)
    edit(row)
    with self.assertRaises(ValueError):
        validate(v)
for name, scenario, kind, key, value in (
        ("arm_ordinal", "full", "ARM", "timer", 2),
        ("arm_sequence", "full", "ARM", "sequence", 2),
        ("arm_pre_dispatch_anchor", "full", "ARM", "pacedSequence", 0),
        ("arm_due_not_last_dispatch", "full", "ARM", "dueNs", "999999999999"),
        ("arm_noncanonical_ns", "full", "ARM", "atNs", "01"),
        ("arm_out_of_range_ns", "full", "ARM", "atNs", str(2**128)),
        ("arm_string_delay", "full", "ARM", "delayMs", "5"),
        ("arm_boolean_delay", "full", "ARM", "delayMs", True),
        ("arm_wrong_ceil_delay", "full", "ARM", "delayMs", 1),
        ("armed_wrong_ordinal", "full", "ARMED", "timer", 2),
        ("armed_before_previous_anchor", "full", "ARMED", "pacedSequence", 0),
        ("fire_before_due", "full", "FIRE", "atNs", "0"),
        ("fire_unregistered_timer", "full", "FIRE", "timer", 999),
        ("fire_boolean_anchor", "full", "FIRE", "pacedSequence", False),
        ("cancel_uncertain_return", "withdrawal", "CANCEL", "returned", False),
        ("cancel_integer_return", "withdrawal", "CANCEL", "returned", 1),
        ("cancel_no_such_timer", "withdrawal", "CANCEL", "timer", 999),
        ("finalize_partial_anchor", "full", "FINALIZE", "pacedSequence", 0),
        ("diagnostic_not_clean", "full", "ARMED", "kind", "EARLY_FIRE"),
        ("extra_private_token", "full", "ARM", "token", "NOT_ALLOWED")):
    check("timer_event_refuses_" + name, lambda self, scenario=scenario, kind=kind, key=key, value=value:
        timer_row_edit(self, scenario, kind, lambda row: row.__setitem__(key, value)))


def coupled_timer_summary(self):
    v = copy.deepcopy(cases["full"])
    v["report"]["pacingTimersStarted"] -= 1
    for key in ("armAttemptsChecked", "timersStartedChecked", "timerFiresChecked"):
        v["capsule"]["check"][key] -= 1
    with self.assertRaises(ValueError):
        validate(v)
check("coordinated_report_and_supplied_timer_summary_cannot_replace_raw_reconstruction", coupled_timer_summary)


def fire_observation_binding(self):
    v = copy.deepcopy(cases["full"])
    row = next(row for row in v["capsule"]["timerTrace"]["events"] if row["kind"] == "FIRE")
    row["atNs"] = str(int(row["atNs"]) + 1)
    with self.assertRaises(ValueError):
        validate(v)
check("late_but_changed_fire_must_match_exact_original_dispatch_not_only_due", fire_observation_binding)


def remove_armed(self):
    v = copy.deepcopy(cases["full"])
    rows = v["capsule"]["timerTrace"]["events"]
    rows.pop(next(i for i, row in enumerate(rows) if row["kind"] == "ARMED"))
    for i, row in enumerate(rows, 1): row["sequence"] = i
    v["capsule"]["check"]["eventsChecked"] -= 1
    with self.assertRaises(ValueError):
        validate(v)
check("omitting_registration_and_repairing_sequence_or_count_does_not_hide_unarmed_fire", remove_armed)


def no_timer(self):
    result = validate(cases["noTimer"])
    self.assertEqual(result["check"]["timersStartedChecked"], 0)
    self.assertEqual(result["check"]["eventsChecked"], 1)
    self.assertEqual(result["check"]["maximumLiveTimersObservedAsData"], 0)
    self.assertFalse(result["physicalTimerAbsenceQualified"])
check("real_final_only_trace_matches_empty_timer_arithmetic_not_physical_absence", no_timer)


def one_pass(self):
    value = cases["full"]
    original = m.parent_trace_data
    calls = []
    def observe(*args):
        calls.append(args[0])
        return original(*args)
    m.parent_trace_data = observe
    try:
        result = validate(value)
    finally:
        m.parent_trace_data = original
    self.assertEqual(len(calls), 1)
    self.assertIs(calls[0], value["capsule"]["trace"]["coreParentTimingTrace"])
    self.assertEqual(result["pacedAndParentArithmeticPasses"], 1)
check("actual_single_parent_pass_uses_original_trace_without_old_envelope_facade", one_pass)


def old_layout(self):
    v = copy.deepcopy(cases["full"])
    v["capsule"]["pacedTimingCaptureVersion"] = 2
    del v["capsule"]["pacedTimerCaptureVersion"]
    with self.assertRaises(ValueError): validate(v)
check("old_paced_v2_layout_is_not_relabelled_or_accepted", old_layout)


def unknown_scenarios(self):
    self.assertEqual(set(data["unknownScenarioNames"]), {"earlyFireUnknown", "registrationUnknown",
        "cancelUnknown", "heldAfterLateCompletion"})
    for name in data["unknownScenarioNames"]:
        value = cases[name]
        self.assertIsNone(value["capsule"]["check"])
        self.assertIsNone(value["capsule"]["parentCheck"])
        with self.assertRaises(ValueError): validate(value)
    self.assertTrue(any(row["kind"] == "EARLY_FIRE" for row in cases["earlyFireUnknown"]["capsule"]["timerTrace"]["events"]))
    self.assertTrue(any(row["kind"] == "REFUSED" for row in cases["registrationUnknown"]["capsule"]["timerTrace"]["events"]))
check("all_genuine_unknown_timer_and_late_source_cases_refuse_without_partial_upgrade", unknown_scenarios)


def timer_bound(self):
    v = copy.deepcopy(cases["full"]); v["capsule"]["timerTrace"]["events"] = [None] * 30001
    with self.assertRaises(ValueError): validate(v)
    self.assertEqual(audited, dict(nativeProcesses=0, sockets=0, sqlite=0, writeOpens=0))
check("full_timer_array_is_bounded_and_no_effectful_runtime_was_entered", timer_bound)


selected = unittest.defaultTestLoader.loadTestsFromTestCase(Paced)
count = selected.countTestCases()
buffer = io.StringIO()
result = unittest.TextTestRunner(stream=buffer).run(selected)
stable = read(source_path, 131072) == (raw, source_id) and hashlib.sha256(fixture_raw).hexdigest() == os.environ["X402_PACED_TIMER_FIXTURE_SHA256"]
out = dict(event="INDEPENDENT_PACED_TIMER_ENVELOPE_ACTUAL_PYTHON_DATA", testsRun=result.testsRun, selectedCases=count,
    failures=len(result.failures), errors=len(result.errors), skipped=len(result.skipped), successful=result.wasSuccessful(),
    sourceAndFixtureUnchanged=stable, JavaScriptImportedOrReplayed=False, nativeExecuted=False,
    sourceCheckerSha256=hashlib.sha256(raw).hexdigest(), fixtureInputBytes=len(fixture_raw),
    fixtureInputSha256=hashlib.sha256(fixture_raw).hexdigest(), cleanSourceScenarios=len(data["cleanScenarioNames"]),
    unknownSourceScenarios=len(data["unknownScenarioNames"]), maximumScenario=maximum_observation,
    fixtureFilesWritten=0, auditedEffects=audited, authority="NONE")
if not result.wasSuccessful():
    out["privateFailureText"] = buffer.getvalue()
print(json.dumps(out, sort_keys=True))
raise SystemExit(0 if result.wasSuccessful() and result.testsRun == count and stable else 1)
