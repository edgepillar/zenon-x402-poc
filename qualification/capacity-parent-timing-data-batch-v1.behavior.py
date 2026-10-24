"""Selected offline DATA tests for the actual bounded batch CLI.

Existing fixture/receipt declarations are explicitly synthetic, not observations
of an application, manager, store or network. Two Python-only CLI smoke commands
use pipes, no scratch. This suite never runs the existing 175-case test suite.
"""
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import unittest

PINS = {
    "qualification/check-capacity-parent-timing-data-batch-v1.py": "662a7a64d22e63d740bf28df5416d7a955e7665df8fc517939e9fe447b711be7",
    "qualification/native_capacity_managed_workload_v3.py": "6d4e2d726bd600b84be387147ee7cd6555daa8b72b8940a8719861a1078b4567",
    "qualification/native_capacity_managed_workload_v3.behavior.py": "c300550075b653010db480fb54febf41870f29817799bb60f4378c6e3c699bef",
    "qualification/fixtures/capacity-parent-timing-source-data-v1.json": "0df8819b72d0fce70581116102a21d11726c5f264403cfff0537323dfb1031c1",
}
repo = Path(__file__).absolute().parents[1]
if not (sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode
        and sys.version.split()[0] == "3.12.14"):
    raise ValueError("ISOLATED_PINNED_PYTHON_REQUIRED")

def identity(s):
    return (s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode, s.st_nlink,
        s.st_size, s.st_mtime_ns, s.st_ctime_ns)

def read(path):
    for at in (path, *path.parents):
        if at.is_symlink(): raise ValueError("SOURCE_LINK")
    before = identity(path.lstat())
    if not stat.S_ISREG(before[4]) or before[2] != os.getuid() or before[5] != 1 or not 0 < before[6] <= 65536:
        raise ValueError("SOURCE_IDENTITY")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        if identity(os.fstat(stream.fileno())) != before: raise ValueError("SOURCE_OPEN")
        raw = stream.read(65537)
        if len(raw) != before[6] or identity(os.fstat(stream.fileno())) != before: raise ValueError("SOURCE_READ")
    if identity(path.lstat()) != before: raise ValueError("SOURCE_AFTER")
    return raw, before

sources = {name: read(repo / name) for name in PINS}
if any(hashlib.sha256(raw).hexdigest() != PINS[name] for name, (raw, _) in sources.items()):
    raise ValueError("SOURCE_PIN")

def load(name, label):
    spec = importlib.util.spec_from_file_location(label, repo / name)
    value = importlib.util.module_from_spec(spec)
    sys.modules[label] = value
    spec.loader.exec_module(value)
    return value

b = load("qualification/check-capacity-parent-timing-data-batch-v1.py", "capacity_parent_batch_selected_data")
f = load("qualification/native_capacity_managed_workload_v3.behavior.py", "capacity_parent_batch_fixture_builder")

def clone(value): return copy.deepcopy(value)
def frame(value):
    return json.dumps(value, separators=(",", ":"), ensure_ascii=True, allow_nan=False).encode("ascii") + b"\n"

def parent_packet(completed=5):
    capsule, recording = f.parent_capsule(completed)
    return dict(parentTimingData=capsule, recording=recording)

def capture_packet(completed=5, insertion_order=False):
    value = f.declaration(completed)
    raw, _, receipt = f.capture(value)
    if insertion_order:
        raw = frame(value)
        receipt["stdout"] = dict(sha256=hashlib.sha256(raw).hexdigest(), bytes=len(raw))
    # Preserve the exact order of the original capture frame, not a sorted
    # envelope or a reconstructed guessed source declaration.
    return dict(capture=json.loads(raw), receipt=receipt)

def header(count=1, budget=b.MAX_PAYLOAD_BYTES):
    return dict(batchVersion=1, kind="PARENT_TIMING_DATA_BATCH_EXPECTATIONS_V1", inputBudgetBytes=budget,
        expectations=[dict(expectedRunId=f.RUN_ID, sourceRowsSha256=b.SOURCE_SHA,
            workload=clone(f.WORK)) for _ in range(count)])

def batch(packets, expectations=None):
    return frame(header(len(packets)) if expectations is None else expectations) + b"".join(frame(p) for p in packets)

def invoke(raw, mode="--check-parent", source=None, sink=None, args=None):
    src = io.BytesIO(raw) if source is None else source
    dst = io.BytesIO() if sink is None else sink
    code = b.main([mode] if args is None else args, src, dst)
    output = dst.getvalue()
    rows = [json.loads(line) for line in output.splitlines()] if type(output) is bytes else []
    return code, rows, output

def rejected(self, raw, mode="--check-parent", count=0):
    code, rows, output = invoke(raw, mode)
    self.assertEqual(code, 2)
    self.assertEqual(rows[-1]["kind"], "PARENT_DATA_BATCH_REJECTED")
    self.assertEqual(rows[-1]["completedCaseResults"], count)
    self.assertIs(rows[-1]["batchComplete"], False)
    self.assertNotIn("PARENT_DATA_BATCH_COMPLETE", [r["kind"] for r in rows])
    self.assertLessEqual(len(output), b.MAX_OUTPUT_BYTES)
    self.assertEqual(rows[-1]["authority"], "NONE")

class Selected(unittest.TestCase): pass
def check(name, fn):
    def method(self): fn(self)
    method.__name__ = "test_" + name
    setattr(Selected, method.__name__, method)

def positive(self, mode, completions):
    packets = [(parent_packet(c) if mode == "--check-parent" else capture_packet(c)) for c in completions]
    raw = batch(packets)
    before = clone(packets)
    code, rows, output = invoke(raw, mode)
    self.assertEqual(code, 0)
    self.assertEqual(len(rows), len(packets) + 1)
    summary = rows[-1]
    self.assertEqual(summary["kind"], "PARENT_DATA_BATCH_COMPLETE")
    self.assertEqual(summary["cases"], len(packets))
    self.assertEqual(summary["inputBytes"], len(raw))
    self.assertEqual(summary["peakInputFrameBytes"], max(len(frame(p)) for p in packets))
    self.assertEqual(summary["retainedEarlierInputFrames"], 0)
    self.assertEqual(summary["sourceControlReads"], 1)
    self.assertEqual(b._source_reads, 1)
    for i, (row, completed) in enumerate(zip(rows, completions), 1):
        self.assertEqual(row["case"], i)
        self.assertIs(row["callerExpectedContextAuthenticated"], False)
        self.assertIs(row["nativeEventsAuthenticated"], False)
        self.assertEqual(row["authority"], "NONE")
        if mode == "--check-parent":
            self.assertEqual(row["scope"], "PARENT_RECORDING_DATA_ONLY")
            self.assertEqual(row["result"]["observationsChecked"], 2 + 2 * completed)
        else:
            self.assertEqual(row["scope"], "FULL_CAPTURE_AND_RECEIPT_DATA_ONLY")
            self.assertEqual(row["result"]["completedOriginalCalls"], 2 * completed)
    for key in ("nativeExecution", "nativeResourcesQualified", "storageCleanupQualified", "sustainableCapacityQualified"):
        self.assertIs(summary[key], False)
    self.assertEqual(packets, before)
    self.assertLessEqual(len(output), b.MAX_OUTPUT_BYTES)
    self.assertNotIn(f.RUN_ID.encode("ascii"), output)
    self.assertNotIn(b'"atNs"', output)

for mode, label in (("--check-parent", "parent"), ("--check-capture", "capture")):
    for completions, suffix in (((5,), "full"), ((2,), "partial"), ((5, 2) * 4, "eight_mixed")):
        check(label + "_matches_" + suffix, lambda self, m=mode, c=completions: positive(self, m, c))

def reject_header(name, edit):
    def run(self):
        h = header(); edit(h)
        rejected(self, batch([parent_packet()], h))
    check("header_rejects_" + name, run)

reject_header("extra_field", lambda v: v.update(execute=True))
reject_header("missing_field", lambda v: v.pop("expectations"))
reject_header("boolean_version", lambda v: v.update(batchVersion=True))
reject_header("unknown_kind", lambda v: v.update(kind="UNKNOWN"))
reject_header("zero_budget", lambda v: v.update(inputBudgetBytes=0))
reject_header("boolean_budget", lambda v: v.update(inputBudgetBytes=True))
reject_header("float_budget", lambda v: v.update(inputBudgetBytes=1.0))
reject_header("over_budget", lambda v: v.update(inputBudgetBytes=b.MAX_PAYLOAD_BYTES + 1))
reject_header("no_expectations", lambda v: v.update(expectations=[]))
reject_header("nine_expectations", lambda v: v.update(expectations=header(9)["expectations"]))
reject_header("missing_expected_run", lambda v: v["expectations"][0].pop("expectedRunId"))
reject_header("different_expected_run", lambda v: v["expectations"][0].update(expectedRunId="cd" * 32))
reject_header("invalid_expected_run", lambda v: v["expectations"][0].update(expectedRunId="PRIVATE_SENTINEL_DO_NOT_ECHO"))
reject_header("wrong_source", lambda v: v["expectations"][0].update(sourceRowsSha256="0" * 64))
reject_header("extra_expectation", lambda v: v["expectations"][0].update(inferContext=True))
reject_header("reversed_lane_order", lambda v: v["expectations"][0]["workload"]["laneIds"].reverse())
reject_header("wrong_recording_limits", lambda v: v["expectations"][0]["workload"]["recordingLimits"].update(maxSamplesPerPhase=127))
reject_header("non_fixture_workload", lambda v: v["expectations"][0]["workload"].update(payeeAddress="PRIVATE_SENTINEL_DO_NOT_ECHO"))
reject_header("boolean_plan_count", lambda v: v["expectations"][0]["workload"]["plan"].update(measurementCallsPerLane=True))

def reject_parent(name, edit):
    def run(self):
        packet = parent_packet(); edit(packet)
        rejected(self, batch([packet]))
    check("parent_rejects_" + name, run)

reject_parent("extra_packet_field", lambda v: v.update(approved=True))
reject_parent("missing_recording", lambda v: v.pop("recording"))
reject_parent("unknown_status", lambda v: v["parentTimingData"].update(status="UNKNOWN"))
reject_parent("foreign_run", lambda v: v["parentTimingData"]["context"].update(runId="ef" * 32))
reject_parent("foreign_graph", lambda v: v["parentTimingData"]["context"].update(sourceRowsSha256="0" * 64))
reject_parent("missing_finalization", lambda v: v["parentTimingData"]["trace"]["events"].pop())
reject_parent("recording_counter", lambda v: v["recording"].update(pendingObservations=1))
reject_parent("boolean_recording", lambda v: v["recording"].update(capacityWindowRecorderVersion=True))
reject_parent("entry_check_only", lambda v: v["parentTimingData"]["check"].update(eventsChecked=0))
reject_parent("float_trace", lambda v: v["parentTimingData"]["trace"]["events"][0].update(sequence=1.0))
reject_parent("claimed_authority", lambda v: v["parentTimingData"]["trace"].update(authority="PRODUCTION"))

def reject_capture(name, edit):
    def run(self):
        packet = capture_packet(); before = frame(packet["capture"]); edit(packet)
        if "capture" in packet and frame(packet["capture"]) != before:
            raw = frame(packet["capture"])
            packet["receipt"]["stdout"] = dict(sha256=hashlib.sha256(raw).hexdigest(), bytes=len(raw))
        rejected(self, batch([packet]), "--check-capture")
    check("capture_rejects_" + name, run)

reject_capture("extra_packet_field", lambda v: v.update(nativeQualified=True))
reject_capture("missing_receipt", lambda v: v.pop("receipt"))
reject_capture("unknown_receipt", lambda v: v["receipt"].update(state="UNKNOWN"))
reject_capture("nonzero_exit", lambda v: v["receipt"].update(actual_exit=1))
reject_capture("boolean_exit", lambda v: v["receipt"].update(actual_exit=False))
reject_capture("incomplete_output", lambda v: v["receipt"].update(output_complete=False))
reject_capture("reason_present", lambda v: v["receipt"].update(reason="PRIVATE_SENTINEL_DO_NOT_ECHO"))
reject_capture("wrong_digest", lambda v: v["receipt"]["stdout"].update(sha256="0" * 64))
reject_capture("wrong_size", lambda v: v["receipt"]["stdout"].update(bytes=1))
reject_capture("nonempty_stderr_receipt", lambda v: v["receipt"].update(stderr=dict(bytes=1, sha256=hashlib.sha256(b"x").hexdigest())))
reject_capture("full_capture_unknown", lambda v: v["capture"]["result"].update(status="UNKNOWN"))
reject_capture("float_completion_boolean", lambda v: v["receipt"].update(completed_at=True))
reject_capture("oversized_receipt_tree", lambda v: v["receipt"].update(extra=[0] * 1025))
reject_capture("oversized_receipt_integer", lambda v: v["receipt"].update(extra=2 ** 128))

def order_positive(self):
    packet = capture_packet(insertion_order=True)
    code, rows, _ = invoke(batch([packet]), "--check-capture")
    self.assertEqual(code, 0); self.assertEqual(rows[-1]["cases"], 1)
check("capture_preserves_non_sorted_original_inner_key_order", order_positive)

def order_negative(self):
    packet = capture_packet()
    packet["capture"] = dict(reversed(list(packet["capture"].items())))
    rejected(self, batch([packet]), "--check-capture")
check("capture_reordering_without_new_matching_digest_refuses", order_negative)

def parent_scope(self):
    h = header(); h["expectations"][0]["workload"]["plan"]["measurementCallsPerLane"] = 3
    code, rows, _ = invoke(batch([parent_packet()], h))
    self.assertEqual(code, 0)
    self.assertEqual(rows[0]["scope"], "PARENT_RECORDING_DATA_ONLY")
    self.assertNotIn("componentCaptureDataMatches", rows[0]["result"])
check("parent_only_scope_does_not_claim_whole_workload_validation", parent_scope)

def full_scope(self):
    h = header(); h["expectations"][0]["workload"]["plan"]["measurementCallsPerLane"] = 3
    rejected(self, batch([capture_packet()], h), "--check-capture")
check("full_capture_binds_independent_whole_workload", full_scope)

def per_case_context(self):
    a, c = parent_packet(), parent_packet(2); h = header(2)
    c["parentTimingData"]["context"]["runId"] = "cd" * 32
    h["expectations"][1]["expectedRunId"] = "cd" * 32
    code, rows, _ = invoke(batch([a, c], h))
    self.assertEqual(code, 0); self.assertEqual(rows[-1]["cases"], 2)
check("separate_expected_context_is_bound_for_each_case", per_case_context)

def input_privacy(self):
    h = header(); h["expectations"][0]["expectedRunId"] = "PRIVATE_SENTINEL_DO_NOT_ECHO"
    code, _, output = invoke(batch([parent_packet()], h))
    self.assertEqual(code, 2); self.assertNotIn(b"PRIVATE_SENTINEL", output)
check("rejection_never_echoes_private_input_or_exception", input_privacy)

def insufficient(self):
    p = parent_packet(); rejected(self, batch([p], header(budget=len(frame(p)) - 1)))
check("aggregate_payload_budget_is_exact_no_truncation", insufficient)
def second_case(self):
    p = parent_packet(); raw = batch([p, p], header(2, len(frame(p))))
    rejected(self, raw, count=1)
check("budget_exhaustion_after_matching_prefix_withholds_completion", second_case)
def missing_case(self): rejected(self, batch([parent_packet()], header(2)), count=1)
check("missing_case_after_matching_prefix_withholds_completion", missing_case)

for suffix, extra in (("whitespace", b" "), ("newline", b"\n"), ("extra_frame", b"{}\n")):
    check("trailing_" + suffix + "_withholds_completion",
        lambda self, tail=extra: rejected(self, batch([parent_packet()]) + tail, count=1))

for suffix, edit in (
    ("duplicate_key", lambda raw: raw.replace(b'{"batchVersion":1,', b'{"batchVersion":1,"batchVersion":1,', 1)),
    ("spaces", lambda raw: raw.replace(b'{"batchVersion":1,', b'{"batchVersion": 1,', 1)),
    ("nonfinite", lambda raw: raw.replace(b'"batchVersion":1,', b'"batchVersion":NaN,', 1)),
    ("infinite", lambda raw: raw.replace(b'"batchVersion":1,', b'"batchVersion":1e9999,', 1)),
    ("non_ascii", lambda raw: b'\xff' + raw),
    ("missing_final_newline", lambda raw: raw[:-1]),
    ("oversized_header", lambda raw: b"x" * (b.MAX_HEADER_BYTES + 1) + b"\n" + raw),
    ("boolean_header_root", lambda raw: b"true\n" + raw.split(b"\n", 1)[1]),
):
    check("framing_rejects_" + suffix, lambda self, transform=edit: rejected(self, transform(batch([parent_packet()]))))

def payload_duplicate(self):
    raw = batch([parent_packet()]).replace(b'{"parentTimingData":', b'{"recording":null,"parentTimingData":', 1)
    rejected(self, raw)
check("payload_duplicate_keys_reject_without_echo", payload_duplicate)
def excessive_depth(self):
    rejected(self, frame(header()) + b'{"parentTimingData":' + b"[" * 40 + b"0" + b"]" * 40 + b',"recording":{}}\n')
check("payload_nesting_refuses", excessive_depth)

for args in ([], ["--execute"], ["--check-parent", "PRIVATE_SENTINEL_DO_NOT_ECHO"], ["--infer-context"], ["--check-capture", "--check-parent"]):
    def no_authority(self, args=args):
        code, rows, raw = invoke(b"", args=args)
        self.assertEqual(code, 2); self.assertEqual(rows[-1]["kind"], "PARENT_DATA_BATCH_REJECTED")
        self.assertNotIn(b"PRIVATE_SENTINEL", raw)
    check("arguments_reject_" + str(len(Selected.__dict__)), no_authority)

def description(self):
    class Unreadable:
        def readline(self, _): raise AssertionError("DESCRIBE_MUST_NOT_READ")
        def read(self, _): raise AssertionError("DESCRIBE_MUST_NOT_READ")
    code, rows, _ = invoke(b"", args=["--describe"], source=Unreadable())
    self.assertEqual(code, 0); self.assertEqual(len(rows), 1)
    self.assertEqual(rows[0]["maximumCases"], 8)
    self.assertIs(rows[0]["inputPathsAccepted"], False)
check("description_verifies_control_but_never_reads_input", description)

def prefix_output(self):
    class PrefixAware(io.BytesIO):
        def __init__(self, raw, sink): super().__init__(raw); self.sink = sink; self.calls = 0
        def readline(self, size):
            self.calls += 1
            if self.calls == 3:
                observed = self.sink.getvalue()
                if b"MATCHING_PARENT_TIMING_DATA" not in observed or b"PARENT_DATA_BATCH_COMPLETE" in observed:
                    raise AssertionError("CASE_NOT_STREAMED_OR_COMPLETED_EARLY")
            return super().readline(size)
        def read(self, size):
            if b"PARENT_DATA_BATCH_COMPLETE" in self.sink.getvalue(): raise AssertionError("EARLY_COMPLETE")
            return super().read(size)
    out = io.BytesIO(); src = PrefixAware(batch([parent_packet(), parent_packet(2)]), out)
    code, rows, _ = invoke(b"", source=src, sink=out)
    self.assertEqual(code, 0); self.assertEqual(rows[-1]["cases"], 2)
    self.assertFalse(src.closed); self.assertFalse(out.closed)
check("cases_stream_before_next_read_completion_only_after_eof_borrowed_streams_remain_open", prefix_output)

def binary_only(self):
    code, rows, _ = invoke(b"", source=io.StringIO("{}\n"))
    self.assertEqual(code, 2); self.assertEqual(rows[-1]["kind"], "PARENT_DATA_BATCH_REJECTED")
check("text_input_stream_is_not_coerced", binary_only)

def read_failure(self):
    class Fault:
        def readline(self, _): raise OSError("PRIVATE_SENTINEL_DO_NOT_ECHO")
    code, rows, output = invoke(b"", source=Fault())
    self.assertEqual(code, 2); self.assertEqual(rows[-1]["kind"], "PARENT_DATA_BATCH_REJECTED")
    self.assertNotIn(b"PRIVATE_SENTINEL", output)
check("read_failure_is_generic_and_has_no_success", read_failure)

def oversized_input_guard(self):
    class Counted(io.BytesIO):
        def __init__(self, raw): super().__init__(raw); self.sizes = []
        def readline(self, size): self.sizes.append(size); return super().readline(size)
    p = parent_packet(); h = header(budget=len(frame(p)) - 1)
    src = Counted(batch([p], h))
    code, _, _ = invoke(b"", source=src)
    self.assertEqual(code, 2)
    self.assertEqual(src.sizes, [b.MAX_HEADER_BYTES + 1, len(frame(p))])
check("bounded_reads_use_only_one_overflow_detection_byte", oversized_input_guard)

def final_flush_failure(self):
    class Fault(io.BytesIO):
        calls = 0
        def flush(self):
            self.calls += 1
            return True if self.calls == 2 else None
    code, rows, _ = invoke(batch([parent_packet()]), sink=Fault())
    self.assertEqual(code, 2)
    self.assertEqual(rows[-1]["kind"], "PARENT_DATA_BATCH_REJECTED")
    self.assertIs(rows[-1]["batchComplete"], False)
check("completion_output_without_successful_flush_and_zero_exit_is_not_success", final_flush_failure)

for failure in ("short", "raise", "flush"):
    def bad_output(self, failure=failure):
        class Fault(io.BytesIO):
            def write(self, raw):
                if failure == "raise": raise OSError("PRIVATE_SENTINEL_DO_NOT_ECHO")
                if failure == "short": return 0
                return super().write(raw)
            def flush(self): return True if failure == "flush" else None
        code, _, output = invoke(batch([parent_packet()]), sink=Fault())
        self.assertEqual(code, 2)
        self.assertNotIn(b"PARENT_DATA_BATCH_COMPLETE", output)
        self.assertNotIn(b"PRIVATE_SENTINEL", output)
    check("output_failure_" + failure + "_never_succeeds", bad_output)

smokes = []
def cli_smoke(self, mode):
    packet = parent_packet(2) if mode == "--check-parent" else capture_packet(2)
    raw = batch([packet])
    process = subprocess.run([sys.executable, "-I", "-B", "-S", str(repo / next(iter(PINS))), mode],
        input=raw, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10, check=False,
        env={"PATH": "/usr/bin:/bin", "LC_ALL": "C", "PYTHONDONTWRITEBYTECODE": "1"}, cwd=repo)
    self.assertLessEqual(len(process.stdout), b.MAX_OUTPUT_BYTES)
    self.assertEqual(process.returncode, 0); self.assertEqual(process.stderr, b"")
    rows = [json.loads(line) for line in process.stdout.splitlines()]
    self.assertEqual(rows[-1]["kind"], "PARENT_DATA_BATCH_COMPLETE")
    self.assertEqual(rows[-1]["sourceControlReads"], 1)
    smokes.append(dict(mode=mode, exit=process.returncode, inputBytes=len(raw), stdoutBytes=len(process.stdout),
        stdoutSha256=hashlib.sha256(process.stdout).hexdigest(), stderrBytes=0, syntheticDataOnly=True))
check("actual_python_cli_parent_pipe_smoke", lambda self: cli_smoke(self, "--check-parent"))
check("actual_python_cli_capture_pipe_smoke", lambda self: cli_smoke(self, "--check-capture"))

if __name__ == "__main__":
    output = io.StringIO()
    result = unittest.TextTestRunner(stream=output, verbosity=0).run(unittest.defaultTestLoader.loadTestsFromTestCase(Selected))
    unchanged = all(read(repo / name) == pair for name, pair in sources.items())
    print(json.dumps(dict(event="PARENT_TIMING_OFFLINE_BATCH_SELECTED_DATA", testsRun=result.testsRun,
        failures=len(result.failures), errors=len(result.errors), skipped=len(result.skipped),
        successful=result.wasSuccessful() and unchanged and len(smokes) == 2, sourcePins=PINS,
        sourcePinsUnchanged=unchanged, pythonOnlyCliSmokes=smokes, existing175CaseSuiteExecuted=False,
        sourceControlReadsInTestProcess=b._source_reads, syntheticCaptureDataOnly=True,
        nativeExecuted=False, managerImported=False, privateRootsOpened=False, SDK=False, SQLite=False,
        keys=False, signatures=False, nonceSearch=False, sockets=False, nativeChildren=False,
        qualificationScratchCreated=False, authority="NONE")), flush=True)
    if not result.wasSuccessful(): sys.stderr.write(output.getvalue())
    sys.exit(0 if result.wasSuccessful() and unchanged and len(smokes) == 2 else 1)
