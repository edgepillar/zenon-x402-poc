"""Selected full paced outer-contract DATA controls; no native application.

Genuine source timing/window/cohort output is retained in the fixture. Pair,
child-exit and receipt facts are explicitly synthetic DATA declarations.
Neither the native adapter nor a fake native namespace/SDK is executed.
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
        or os.environ.get("X402_PACED_OUTER_PYTHON_DATA") != "paced-outer-contract-python-v1"):
    raise ValueError("EXPLICIT_ISOLATED_OUTER_DATA_SELECTION")
repo = Path(__file__).absolute().parents[1]
source_path = repo / "qualification/native_capacity_paced_outer_capture_data_v1.py"
fixture_path = repo / "qualification/fixtures/capacity-paced-outer-contract-v1.json"


def identity(s):
    return [s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode, s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns]


def read(path, maximum):
    for at in (path, *path.parents):
        if at.is_symlink():
            raise ValueError("SOURCE_LINK")
    before = path.lstat()
    if not stat.S_ISREG(before.st_mode) or before.st_uid != os.getuid() or before.st_nlink != 1 or before.st_size > maximum:
        raise ValueError("SOURCE_IDENTITY")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as f:
        if identity(os.fstat(f.fileno())) != identity(before):
            raise ValueError("SOURCE_OPEN")
        raw = f.read(maximum + 1)
        if len(raw) != before.st_size or identity(os.fstat(f.fileno())) != identity(before):
            raise ValueError("SOURCE_READ")
    if identity(path.lstat()) != identity(before):
        raise ValueError("SOURCE_AFTER")
    return raw, identity(before)


raw, source_id = read(source_path, 131072)
fixture_raw, fixture_id = read(fixture_path, 262144)
if (hashlib.sha256(raw).hexdigest() != os.environ.get("X402_PACED_OUTER_SOURCE_SHA256")
        or hashlib.sha256(fixture_raw).hexdigest() != "ee28f98bc0ecff728e1f7dbe11170796ed789c0c0dc1ebb37d58829d6b70e712"):
    raise ValueError("PINNED_ACTUAL_OUTER_SOURCE_AND_FIXTURE")
spec = importlib.util.spec_from_file_location("actual_paced_outer_capture_data_v1", source_path)
m = importlib.util.module_from_spec(spec)
exec(spec.loader.source_to_code(raw, str(source_path)), m.__dict__)
validator = m.prepare_from_source(str(repo))
control_inputs = {name: read(repo / name, 131072) for name, digest in m.CONTROL_PINS}
fixture = json.loads(fixture_raw)
if (fixture["kind"] != "SYNTHETIC_OUTER_V2_CONTRACT_DATA_NOT_NATIVE_CAPTURE"
        or fixture["pairChildAndReceiptFactsSynthetic"] is not True or fixture["nativeAdapterExecuted"] is not False):
    raise ValueError("SYNTHETIC_PAIR_AND_RECEIPT_FACTS_REQUIRED")
cases = fixture["cases"]


def frame_bytes(value):
    return (json.dumps(value, separators=(",", ":"), ensure_ascii=True) + "\n").encode("ascii")


def receipt(raw, stderr=b""):
    return dict(state="COMPLETE", actual_exit=0, process_group=12345, output_complete=True, scratch_scan_retries=0,
        reason=None, completed_at=1000.0, argv=None, stdout=dict(bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest()),
        stderr=dict(bytes=len(stderr), sha256=hashlib.sha256(stderr).hexdigest()))


def validate(value=None, edit_receipt=None, raw_frame=None, stderr=b""):
    value = cases["full"] if value is None else value
    raw_frame = frame_bytes(value["frame"]) if raw_frame is None else raw_frame
    r = receipt(raw_frame, stderr)
    if edit_receipt:
        edit_receipt(r)
    return validator.validate(raw_frame, stderr, r, value["workload"], value["runId"])


class Outer(unittest.TestCase):
    maxDiff = 400


def check(name, fn):
    def run(self):
        fn(self)
    run.__name__ = "test_" + name
    setattr(Outer, run.__name__, run)


def assign(value, keys, replacement):
    for key in keys[:-1]:
        value = value[key]
    value[keys[-1]] = replacement


def positive(self, name):
    value = cases[name]; before = copy.deepcopy(value)
    result = validate(value)
    expected_calls = {"full": 6, "withdrawal": 1, "preWaitWithdrawal": 2}[name]
    self.assertEqual(result["completedSourceOriginalCalls"], expected_calls)
    self.assertEqual(result["childCloseRowsAsData"], 4)
    self.assertTrue(result["wholeParentPacedAndWriterDataRecomputed"])
    self.assertEqual(result["authority"], "NONE")
    self.assertEqual(value, before)
    for key in ("receiptsIndependentlyAuthenticated", "nativeResourcesQualified", "storageCleanupQualified",
            "sustainableCapacityQualified", "chainAuthenticated", "productionQualified", "balanceRoundTripSeriesRecomputed"):
        self.assertIs(result[key], False)
for name in cases:
    check("genuine_components_and_declared_outer_" + name, lambda self, name=name: positive(self, name))


FRAME_MUTATIONS = json.loads("[[\"old_envelope_version\",[\"pacedCaptureVersion\"],1],[\"wrong_parent_graph\",[\"sourceRowsSha256\"],\"0000000000000000000000000000000000000000000000000000000000000000\"],[\"wrong_child_graph\",[\"childSourceRowsSha256\"],\"0000000000000000000000000000000000000000000000000000000000000000\"],[\"extra_root_field\",[\"parentTimingData\"],{}],[\"native_claim\",[\"nativeResourcesQualified\"],true],[\"production_claim\",[\"productionQualified\"],true],[\"adapter_version\",[\"result\",\"nativePacedCapacityWorkloadAdapterVersion\"],3],[\"adapter_held\",[\"result\",\"status\"],\"HELD_UNKNOWN\"],[\"old_flattened_core\",[\"result\",\"core\"],{}],[\"pacing_gap\",[\"result\",\"pacing\",\"minimumStartGapMs\"],1000],[\"child_clock_merge\",[\"result\",\"childClockDomainsMerged\"],true],[\"clipped_writer_brackets\",[\"result\",\"writerBracketsClipped\"],true],[\"false_window_isolation\",[\"result\",\"measurementWindowIsolationQualified\"],true],[\"unexpected_lane_field\",[\"result\",\"lanes\",0,\"proof\"],true],[\"pending_balance\",[\"result\",\"lanes\",0,\"pendingBalanceReads\"],1],[\"boolean_balance_counter\",[\"result\",\"lanes\",0,\"pendingBalanceReads\"],false],[\"wrong_balance_samples\",[\"result\",\"lanes\",0,\"balanceObservationRoundTripNs\",\"samples\"],2],[\"excess_balance_span\",[\"result\",\"lanes\",0,\"balanceObservationRoundTripNs\",\"max\"],\"999999999999999999999999999\"],[\"missing_final_writer_barrier\",[\"result\",\"lanes\",0,\"serviceWriterTraceBeforeCloseObserved\"],false],[\"pending_pair\",[\"evidence\",0,\"pairSnapshot\",\"activeOperation\"],true],[\"pair_held\",[\"evidence\",0,\"pairSnapshot\",\"held\"],true],[\"wrong_pair_completed\",[\"evidence\",0,\"pairSnapshot\",\"completed\"],4],[\"wrong_pair_warmup\",[\"evidence\",0,\"pairSnapshot\",\"warmupReserved\"],0],[\"wrong_pair_dispatch_count\",[\"evidence\",0,\"pairSnapshot\",\"measuredReserved\"],1],[\"unknown_launch\",[\"evidence\",0,\"pairSnapshot\",\"launchUnknown\"],true],[\"reference_candidate_overflow\",[\"evidence\",0,\"pairSnapshot\",\"referenceCandidates\"],32769],[\"reference_window_overflow\",[\"evidence\",0,\"pairSnapshot\",\"referenceWindows\"],9],[\"unknown_service_window\",[\"evidence\",0,\"serviceMeasurementWindow\",\"unknown\"],true],[\"wrong_service_window_source\",[\"evidence\",0,\"serviceMeasurementWindow\",\"context\",\"sourceRowsSha256\"],\"0000000000000000000000000000000000000000000000000000000000000000\"],[\"wrong_service_window_run\",[\"evidence\",0,\"serviceMeasurementWindow\",\"context\",\"runId\"],\"0000000000000000000000000000000000000000000000000000000000000000\"],[\"wrong_service_window_lane\",[\"evidence\",0,\"serviceMeasurementWindow\",\"context\",\"laneId\"],\"other\"],[\"service_clock_read_mismatch\",[\"evidence\",0,\"serviceMeasurementWindow\",\"clockReads\"],2],[\"bad_writer_ordinal\",[\"evidence\",0,\"serviceWriterIntervals\",0,\"ordinal\"],true],[\"bad_writer_duration\",[\"evidence\",0,\"serviceWriterIntervals\",0,\"bracketElapsedNs\"],\"99\"],[\"bad_writer_inside\",[\"evidence\",0,\"serviceWriterIntervals\",0,\"insideTransactionElapsedNs\"],\"99\"],[\"wrong_attributed_original\",[\"evidence\",0,\"serviceWriterAttribution\",1,\"originalCommandDigest\"],\"0000000000000000000000000000000000000000000000000000000000000000\"],[\"wrong_writer_window_class\",[\"evidence\",0,\"serviceWriterAttribution\",0,\"windowClass\"],\"INSIDE\"],[\"wrong_writer_group_metric\",[\"result\",\"lanes\",0,\"writerBracketNs\",\"p95\"],\"99\"],[\"wrong_window_declared_span\",[\"result\",\"lanes\",0,\"serviceChildWindowWriterTrace\",\"declaredWindowElapsedNs\"],\"99\"],[\"wrong_child_role\",[\"evidence\",0,\"pairSnapshot\",\"children\",0,\"role\"],\"OTHER\"],[\"missing_child_disconnect\",[\"evidence\",0,\"pairSnapshot\",\"children\",0,\"disconnected\"],false],[\"missing_child_close\",[\"evidence\",0,\"pairSnapshot\",\"children\",0,\"closed\"],false],[\"child_exit_unknown\",[\"evidence\",0,\"pairSnapshot\",\"children\",0,\"exitCode\"],null],[\"child_exit_boolean\",[\"evidence\",0,\"pairSnapshot\",\"children\",0,\"exitCode\"],false],[\"child_pending\",[\"evidence\",0,\"pairSnapshot\",\"children\",0,\"pending\"],1],[\"child_missing_eof\",[\"evidence\",0,\"pairSnapshot\",\"children\",0,\"stdout\",\"eof\"],false],[\"child_overflow\",[\"evidence\",0,\"pairSnapshot\",\"children\",0,\"stdout\",\"overflow\"],true],[\"child_byte_boolean\",[\"evidence\",0,\"pairSnapshot\",\"children\",0,\"stdout\",\"observedBytes\"],false],[\"child_prefix_mismatch\",[\"evidence\",0,\"pairSnapshot\",\"children\",0,\"stdout\",\"prefixSha256\"],\"0000000000000000000000000000000000000000000000000000000000000000\"],[\"private_stream_digest\",[\"evidence\",0,\"privateStreams\",0,\"stdout\",\"sha256\"],\"0000000000000000000000000000000000000000000000000000000000000000\"],[\"private_stream_base64\",[\"evidence\",0,\"privateStreams\",0,\"stdout\",\"base64\"],\"!!\"],[\"wrong_original_payer_command\",[\"evidence\",0,\"payerOperationTimings\",6,\"kind\"],\"PREPARE\"],[\"late_original_payer_command\",[\"evidence\",0,\"payerOperationTimings\",0,\"lateAfterTimeout\"],true],[\"payer_clock_merge\",[\"evidence\",0,\"payerOperationTimings\",0,\"clockDomain\"],\"PARENT\"],[\"payer_time_reversal\",[\"evidence\",0,\"payerOperationTimings\",0,\"endNs\"],\"0\"],[\"wrong_timing_context\",[\"pacedTimingData\",\"context\",\"runId\"],\"0000000000000000000000000000000000000000000000000000000000000000\"],[\"timing_held\",[\"pacedTimingData\",\"status\"],\"UNKNOWN_OR_MISMATCHED_PACED_TRACE\"]]")
for name, path, replacement in FRAME_MUTATIONS:
    def reject(self, path=path, replacement=replacement):
        value = copy.deepcopy(cases["full"]); assign(value["frame"], path, replacement)
        with self.assertRaises(ValueError):
            validate(value)
    check("frame_refuses_" + name, reject)


RECEIPT_MUTATIONS = json.loads("[[\"failed\",[\"actual_exit\"],1],[\"boolean_exit\",[\"actual_exit\"],false],[\"unknown_exit\",[\"actual_exit\"],null],[\"state\",[\"state\"],\"STREAMS_UNKNOWN\"],[\"incomplete\",[\"output_complete\"],false],[\"timeout\",[\"reason\"],\"TIMEOUT\"],[\"argv_retained\",[\"argv\"],[\"private\"]],[\"missing_pgid\",[\"process_group\"],null],[\"boolean_pgid\",[\"process_group\"],true],[\"retry_boolean\",[\"scratch_scan_retries\"],false],[\"completed_boolean\",[\"completed_at\"],false],[\"wrong_stdout_count\",[\"stdout\",\"bytes\"],1],[\"wrong_stdout_digest\",[\"stdout\",\"sha256\"],\"0000000000000000000000000000000000000000000000000000000000000000\"],[\"stderr_boolean\",[\"stderr\",\"bytes\"],false],[\"extra_receipt\",[\"unreviewed\"],true]]")
for name, path, replacement in RECEIPT_MUTATIONS:
    def reject(self, path=path, replacement=replacement):
        with self.assertRaises(ValueError):
            validate(edit_receipt=lambda r: assign(r, path, replacement))
    check("receipt_refuses_" + name, reject)


def logical_withdrawal(self):
    r = validate(cases["withdrawal"])
    self.assertTrue(r["logicalPlannedCallsCompleted"])
    self.assertFalse(r["allSourceOriginalsCompletedAsData"])
    self.assertEqual((r["dispatchedMeasuredSourceCalls"], r["preEntryWithdrawals"]), (1, 1))
check("logical_completion_does_not_fabricate_a_withdrawn_child_execute", logical_withdrawal)


def lane_swap(self):
    value = copy.deepcopy(cases["full"])
    for index, change in enumerate((1, -1)):
        pair = value["frame"]["evidence"][index]["pairSnapshot"]
        pair["completed"] += change; pair["measuredReserved"] += change
    self.assertEqual(sum(e["pairSnapshot"]["completed"] for e in value["frame"]["evidence"]), 6)
    with self.assertRaises(ValueError):
        validate(value)
check("unchanged_global_totals_cannot_hide_wrong_per_lane_source_counts", lane_swap)


def separate_clocks(self):
    value = copy.deepcopy(cases["full"]); shift = 10**30
    for ev in value["frame"]["evidence"]:
        for row in ev["serviceWriterIntervals"]:
            for key in ("beforeBeginNs", "afterBeginNs", "beforeCommitNs", "afterCommitNs"):
                row[key] = str(int(row[key]) + shift)
        for key in ("startNs", "stopNs"):
            ev["serviceMeasurementWindow"][key] = str(int(ev["serviceMeasurementWindow"][key]) + shift)
        for row in ev["payerOperationTimings"]:
            row["startNs"] = str(int(row["startNs"]) + 2 * shift)
            row["endNs"] = str(int(row["endNs"]) + 2 * shift)
    self.assertTrue(validate(value)["wholeParentPacedAndWriterDataRecomputed"])
check("child_clocks_are_not_merged_or_subtracted_from_parent", separate_clocks)


def frame_shapes(self):
    base = frame_bytes(cases["full"]["frame"])
    for data in (b" " + base, base + base, base[:-1], base + b"\n", b"[]\n", b"{} trailing\n",
            base.replace(b":2,", b":2.0,", 1), base.replace(b":0,", b":-0,", 1),
            base.replace(b":false,", b":NaN,", 1), base.replace(b":false,", b":Infinity,", 1)):
        with self.assertRaises(ValueError):
            validate(raw_frame=data)
check("one_exact_compact_frame_rejects_extra_frames_floats_and_negative_zero", frame_shapes)


def duplicate_keys(self):
    for raw in (b'{"a":1,"a":2}\n', b'{"a":1,"\\u0061":2}\n'):
        with self.assertRaisesRegex(ValueError, "DUPLICATE_JSON_KEY"):
            m._frame(raw, 4096)
check("decoded_duplicate_keys_refuse_even_with_different_escapes", duplicate_keys)


def lexical(self):
    self.assertEqual(m._frame(b'{"a":"space and \\\"quote\\\""}\n', 4096), {"a": 'space and "quote"'})
    value = frame_bytes(cases["full"]["frame"]).replace(b'"authority"', b'"\\u0061uthority"', 1)
    self.assertEqual(validate(raw_frame=value)["status"], "MATCHING_DECLARED_PACED_V2_OUTER_CAPTURE_DATA")
check("string_escapes_do_not_require_full_json_reserialization", lexical)


def stream_binding(self):
    data = frame_bytes(cases["full"]["frame"]); r = receipt(data); changed = data.replace(b'"NONE"', b'"none"', 1)
    with self.assertRaisesRegex(ValueError, "COMPLETE_COMMAND_STREAM_BINDING"):
        validator.validate(changed, b"", r, cases["full"]["workload"], cases["full"]["runId"])
    with self.assertRaises(ValueError):
        validate(stderr=b"preserved diagnostic")
check("raw_receipt_digest_and_nonempty_stderr_cannot_be_repaired_by_data_match", stream_binding)


def child_streams(self):
    value = copy.deepcopy(cases["full"])
    s = value["frame"]["evidence"][0]["privateStreams"][0]["stdout"]
    s.update(bytes=1, sha256=hashlib.sha256(b"x").hexdigest(), base64="eA==")
    with self.assertRaises(ValueError):
        validate(value)
check("child_stream_facts_bind_complete_private_bytes_not_only_one_digest", child_streams)


def missing(self):
    for edit in (lambda v: v["frame"]["evidence"].pop(),
            lambda v: v["frame"]["evidence"][0]["privateStreams"].pop(),
            lambda v: v["frame"]["evidence"][0]["payerOperationTimings"].pop(),
            lambda v: v["frame"]["evidence"][0]["serviceWriterIntervals"].pop(),
            lambda v: v["frame"]["evidence"][0]["serviceWriterAttribution"].pop()):
        value = copy.deepcopy(cases["full"]); edit(value)
        with self.assertRaises(ValueError):
            validate(value)
check("missing_lane_stream_original_command_or_writer_rows_refuse", missing)


def completion(self):
    for at in (float("nan"), float("inf"), -1, 2**100000):
        with self.assertRaises(ValueError):
            validate(edit_receipt=lambda r, at=at: r.update(completed_at=at))
check("completion_observation_rejects_nonfinite_and_oversized_values_without_overflow", completion)


def source_info(self):
    info = validator.info()
    self.assertEqual(info["controlSourceFilesRead"], 3)
    self.assertTrue(info["verifiedSourceBytesCompiled"])
    self.assertFalse(info["cachedBytecodeAccepted"])
    self.assertFalse(info["SDKImported"]); self.assertFalse(info["managerImported"])
    for root in ("relative", None, 123):
        with self.assertRaises(ValueError):
            m.prepare_from_source(root)
check("genuine_exact_control_sources_loaded_without_package_or_cached_variants", source_info)


def preserved(self):
    self.assertEqual(read(source_path, 131072), (raw, source_id))
    self.assertEqual(read(fixture_path, 262144), (fixture_raw, fixture_id))
    for name, pair in control_inputs.items():
        self.assertEqual(read(repo / name, 131072), pair)
    self.assertFalse(any(n.startswith(("sqlite3", "socket", "subprocess", "storage")) for n in sys.modules))
check("source_and_genuine_frozen_helpers_preserved_without_native_imports", preserved)


selected = unittest.defaultTestLoader.loadTestsFromTestCase(Outer)
count = selected.countTestCases()
buffer = io.StringIO()
result = unittest.TextTestRunner(stream=buffer).run(selected)
stable = read(source_path, 131072) == (raw, source_id) and read(fixture_path, 262144) == (fixture_raw, fixture_id)
out = dict(event="PACED_V2_OUTER_CONTRACT_ACTUAL_PYTHON_DATA", testsRun=result.testsRun, selectedCases=count,
    failures=len(result.failures), errors=len(result.errors), skipped=len(result.skipped), successful=result.wasSuccessful(),
    sourceAndFixtureUnchanged=stable, actualNativeAdapterExecuted=False, pairAndReceiptFactsSynthetic=True,
    managerImported=False, nativeExecuted=False, authority="NONE")
if not result.wasSuccessful():
    out["privateFailureText"] = buffer.getvalue()
print(json.dumps(out, sort_keys=True))
raise SystemExit(0 if result.wasSuccessful() and result.testsRun == count and stable else 1)
