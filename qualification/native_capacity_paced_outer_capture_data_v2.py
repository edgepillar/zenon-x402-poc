"""Source-bound paced native v3 outer-capture DATA validation, not execution.

Load only three exact reviewed Python DATA controls. Never import JavaScript,
SDK, manager, SQL or a native application. Validate the ORIGINAL new outer-v3 layout;
do not flatten it into a relabeled unpaced R4 capture. Command/child/stream
receipts remain DATA until a real task-owned controller binds their origins.
"""
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import stat

CONTROL_PINS = (
    ("qualification/native_capacity_managed_workload_v3.py", "6d4e2d726bd600b84be387147ee7cd6555daa8b72b8940a8719861a1078b4567"),
    ("qualification/native_capacity_paced_resource_plan_v2.py", "599f19ae7989f3129a21dc0f5d173dcfc7af70817154222fa18d9783979de6ce"),
    ("qualification/native_capacity_paced_timing_envelope_data_v1.py", "96d332f0a3e56edf03db54e47a078535d01a5e0665a3bf29834f582039cc0a99"),
)
HASH = re.compile(r"[0-9a-f]{64}")
_TOKEN = object()


def require(value, code):
    if not value:
        raise ValueError(code)


def identity(s):
    return [str(v) for v in (s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode, s.st_nlink,
        s.st_size, s.st_mtime_ns, s.st_ctime_ns)]


def _read_source(path):
    for at in (path, *path.parents):
        require(not at.is_symlink(), "CONTROL_SOURCE_LINK")
    s = path.lstat()
    require(stat.S_ISREG(s.st_mode) and s.st_uid == os.getuid() and s.st_nlink == 1 and s.st_size <= 131072,
        "CONTROL_SOURCE_IDENTITY")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        require(identity(os.fstat(stream.fileno())) == identity(s), "CONTROL_SOURCE_OPEN")
        raw = stream.read(131073)
        require(len(raw) == s.st_size and identity(os.fstat(stream.fileno())) == identity(s), "CONTROL_SOURCE_READ")
    require(identity(path.lstat()) == identity(s), "CONTROL_SOURCE_AFTER")
    return raw


def prepare_from_source(repo):
    """Read/compile exact installed DATA controls once, never package/app code."""
    require(type(repo) is str and repo.startswith("/") and os.path.normpath(repo) == repo, "ABSOLUTE_CONTROL_ROOT")
    root = Path(repo)
    modules, pins = [], []
    for index, (name, digest) in enumerate(CONTROL_PINS):
        raw = _read_source(root / name)
        require(hashlib.sha256(raw).hexdigest() == digest, "EXACT_FROZEN_DATA_CONTROL")
        spec = importlib.util.spec_from_file_location("_paced_outer_v3_control_" + str(index), root / name)
        require(spec is not None and spec.loader is not None, "CONTROL_SOURCE_LOADER")
        value = importlib.util.module_from_spec(spec)
        # Compile verified bytes, never a cached bytecode variant or source rewrite.
        exec(spec.loader.source_to_code(raw, str(root / name)), value.__dict__)
        require(_read_source(root / name) == raw, "CONTROL_CHANGED_ON_LOAD")
        modules.append(value)
        pins.append(dict(path=name, bytes=len(raw), sha256=digest))
    return _Validator(_TOKEN, modules, pins)


def _frame(raw, maximum):
    """One compact ASCII object + LF, without a second full JSON serialization.

    Valid JSON string escapes are allowed; exact bytes are bound by the stream
    receipt, not re-created from normalized DATA. Duplicate/float/negative-zero
    values, noncompact framing and extra frames refuse before interpretation.
    """
    require(type(raw) is bytes and 1 < len(raw) <= maximum and raw[:1] == b"{" and raw[-1:] == b"\n",
        "BOUNDED_ONE_OBJECT_FRAME")
    quoted = escaped = False
    depth = 0
    for index, byte in enumerate(raw):
        if index == len(raw) - 1:
            break
        require(32 <= byte <= 126, "ASCII_COMPACT_FRAME")
        if quoted:
            if escaped:
                escaped = False
            elif byte == 92:
                escaped = True
            elif byte == 34:
                quoted = False
        elif byte == 34:
            quoted = True
        else:
            require(byte not in (9, 10, 13, 32), "COMPACT_FRAME_NO_OUTSIDE_WHITESPACE")
            if byte in (91, 123):
                depth += 1
                require(depth <= 32, "FRAME_DEPTH_BOUND")
            elif byte in (93, 125):
                depth -= 1
                require(depth >= 0, "FRAME_BRACKET_ORDER")
    require(not quoted and not escaped and depth == 0, "COMPLETE_JSON_FRAME")
    def pairs(items):
        out = {}
        for k, v in items:
            require(k not in out, "DUPLICATE_JSON_KEY")
            out[k] = v
        return out
    def number(value):
        require(value != "-0" and len(value) <= 17, "CANONICAL_SAFE_JSON_INTEGER")
        n = int(value)
        require(-(2**53 - 1) <= n <= 2**53 - 1, "SAFE_JSON_INTEGER")
        return n
    def invalid(_):
        raise ValueError("NON_INTEGER_OR_NONFINITE_JSON")
    try:
        value = json.loads(raw.decode("ascii"), object_pairs_hook=pairs, parse_int=number,
            parse_float=invalid, parse_constant=invalid)
    except (UnicodeError, json.JSONDecodeError, RecursionError):
        raise ValueError("INVALID_OUTER_CAPTURE_JSON") from None
    require(type(value) is dict, "OUTER_OBJECT_REQUIRED")
    return value


class _Validator:
    def __init__(self, token, modules, pins):
        require(token is _TOKEN, "SOURCE_PREPARATION_REQUIRED")
        self._old, self._resource, self._timing = modules
        self._pins = pins

    def info(self):
        return dict(controlSourceFilesRead=3, controlPins=[dict(p) for p in self._pins],
            verifiedSourceBytesCompiled=True, cachedBytecodeAccepted=False, sourceTransforms=0,
            SDKImported=False, managerImported=False, nativeExecuted=False, authority="NONE")

    def validate(self, stdout, stderr, receipt, workload, expected_run_id):
        """Check retained complete command DATA; no files or resources opened."""
        d, resource, timing = self._old, self._resource, self._timing
        plan = resource.capture_plan(workload)
        bound = resource.resource_plan(plan)
        require(bound["captureReservationFitsEntryCap"], "SELECTED_CAPTURE_RESERVATION_EXCEEDS_ENTRY_CAP")
        require(type(expected_run_id) is str and HASH.fullmatch(expected_run_id), "EXPECTED_RUN_ID")
        d.fields(receipt, ("state", "actual_exit", "process_group", "stdout", "stderr", "output_complete",
            "scratch_scan_retries", "reason", "completed_at", "argv"), "EXACT_MANAGER_RECEIPT_FIELDS")
        require(receipt["state"] == "COMPLETE" and type(receipt["actual_exit"]) is int and receipt["actual_exit"] == 0
            and receipt["output_complete"] is True and receipt["reason"] is None and receipt["argv"] is None,
            "COMMAND_FAILURE_OR_UNKNOWN")
        d.integer(receipt["process_group"], 1, 2**31 - 1, "OWNED_COMMAND_GROUP_DATA")
        d.integer(receipt["scratch_scan_retries"], 0, 2**53 - 1, "EXACT_SCAN_RETRY_COUNT")
        at = receipt["completed_at"]
        require(type(at) in (float, int) and 0 <= at <= 2**53 - 1 and math.isfinite(at), "FINITE_COMMAND_COMPLETION")
        require(type(stderr) is bytes and stderr == b"", "PARENT_STDERR_NOT_EMPTY")
        for name, raw in (("stdout", stdout), ("stderr", stderr)):
            slot = receipt[name]
            d.fields(slot, ("sha256", "bytes"), "EXACT_COMMAND_STREAM_RECEIPT")
            require(type(raw) is bytes and type(slot["bytes"]) is int and slot["bytes"] == len(raw)
                and type(slot["sha256"]) is str and HASH.fullmatch(slot["sha256"])
                and slot["sha256"] == hashlib.sha256(raw).hexdigest(), "COMPLETE_COMMAND_STREAM_BINDING")
        capture = _frame(stdout, bound["nodeStdoutLimit"])
        d.capture_tree_in_place(capture)
        d.fields(capture, ("pacedCaptureVersion", "kind", "sourceRowsSha256", "childSourceRowsSha256", "result",
            "pacedTimingData", "balanceBarrierData", "evidence", "nativeResourcesQualified", "sustainableCapacityQualified",
            "chainAuthenticated", "productionQualified", "authority"), "PACED_V3_OUTER_FIELDS")
        require(timing.same(capture["pacedCaptureVersion"], 3)
            and capture["kind"] == "PRIVATE_PACED_NATIVE_CAPACITY_COMPONENT_CAPTURE_NOT_PRODUCTION"
            and capture["sourceRowsSha256"] == resource.PARENT_SOURCE_SHA256
            and capture["childSourceRowsSha256"] == resource.CHILD_SOURCE_SHA256 == d.GRAPH_SHA
            and capture["authority"] == "NONE"
            and all(capture[k] is False for k in ("nativeResourcesQualified", "sustainableCapacityQualified",
                "chainAuthenticated", "productionQualified")), "V3_PARENT_CHILD_SOURCE_OR_AUTHORITY")
        result = capture["result"]
        d.fields(result, ("nativePacedCapacityWorkloadAdapterVersion", "status", "core", "balanceBarrierRecording", "pacing", "lanes",
            "parentClockDomain", "payerClockDomain", "ledgerClockDomain", "childClockDomainsMerged",
            "ledgerTimeInferredFromPromise", "writerTraceCovers", "parentAndServiceWindowsAligned",
            "writerBracketsClipped", "measurementWindowIsolationQualified", "sustainedCapacityQualified",
            "nativeEventsAuthenticated", "nativeResourcesQualified", "nativeOsNetworkSandbox", "productionQualified", "authority"),
            "EXACT_PACED_ADAPTER_REPORT")
        fixed = dict(nativePacedCapacityWorkloadAdapterVersion=2, status="OBSERVED_COMPONENT_ONLY",
            parentClockDomain="PARENT_BALANCE_BARRIER_INCLUDING_FINAL_WRITER_TRACE_NOT_SQL_OR_L1", payerClockDomain="PAYER_CHILD_LOCAL",
            ledgerClockDomain="SERVICE_CHILD_LOCAL", childClockDomainsMerged=False, ledgerTimeInferredFromPromise=False,
            writerTraceCovers="WHOLE_RUN_BRACKETS_CLASSIFIED_AGAINST_SEPARATE_SERVICE_CHILD_WINDOW",
            parentAndServiceWindowsAligned=False, writerBracketsClipped=False, measurementWindowIsolationQualified=False,
            sustainedCapacityQualified=False, nativeEventsAuthenticated=False, nativeResourcesQualified=False,
            nativeOsNetworkSandbox=False, productionQualified=False, authority="NONE")
        require(all(timing.same(result[k], value) for k, value in fixed.items()), "OUTER_ADAPTER_UNKNOWN_OR_AUTHORITY")
        require(timing.same(result["pacing"], dict(minimumStartGapMs=plan["pacing"]["minimumStartGapMs"],
            appliesTo="MEASUREMENT_ONLY", model="CLOSED_LOOP_MINIMUM_GAP_NO_CATCHUP_NOT_FIXED_OFFERED_RATE",
            coreLatencyIncludesPacingWait=True, sourceLatencyExcludesPacingWait=True)), "OUTER_PACING_BINDING")
        paced = result["core"]
        expected = dict(plan=plan["plan"], recordingLimits=plan["recordingLimits"], laneIds=plan["laneIds"],
            minimumStartGapMs=plan["pacing"]["minimumStartGapMs"], runId=expected_run_id,
            parentSourceRowsSha256=resource.PARENT_SOURCE_SHA256, childSourceRowsSha256=resource.CHILD_SOURCE_SHA256)
        checked = timing.validate_paced_timing_envelope_data(capture["pacedTimingData"], paced, expected)
        balance = self._balance(capture["balanceBarrierData"], result["balanceBarrierRecording"], expected,
            capture["pacedTimingData"]["trace"]["coreParentTimingTrace"], bound["nodeTimeoutSeconds"] * 10**9)
        core = paced["core"]
        rows, evidence = result["lanes"], capture["evidence"]
        lanes = len(plan["laneIds"])
        require(type(rows) is list and type(evidence) is list and len(rows) == len(evidence) == lanes
            and all(type(v) is dict for v in rows + evidence)
            and [r.get("laneId") for r in rows] == [r.get("laneId") for r in evidence] == plan["laneIds"],
            "COMPLETE_ORDERED_LANE_EVIDENCE")

        # The paced core counts logical originals, including WITHDRAW. Actual
        # child EXECUTE counts must instead follow DISPATCH on EACH lane.
        requests, dispatched = {}, [0] * lanes
        for event in capture["pacedTimingData"]["trace"]["events"]:
            if event["kind"] == "REQUEST":
                requests[event["request"]] = event["lane"]
            elif event["kind"] == "DISPATCH":
                dispatched[requests[event["request"]]] += 1
            elif event["kind"] == "SOURCE_TERMINAL":
                require(event["outcome"] == "SUCCEEDED", "NATIVE_PAIR_SOURCE_REJECTION_OR_UNKNOWN")
        completed = writer_count = 0
        for index, (row, ev) in enumerate(zip(rows, evidence)):
            count, writers = self._lane(row, ev, plan, bound, expected_run_id, dispatched[index], balance["laneMetrics"][index])
            completed += count
            writer_count += writers
        recording = core["recording"]
        expected_warm = lanes * plan["plan"]["warmupCallsPerLane"]
        for cohort, phase, amount in (("WARMUP", "FUNDING", lanes), ("WARMUP", "FUNDED_CALL", expected_warm),
                ("MEASUREMENT", "FUNDED_CALL", completed - expected_warm)):
            v = recording["cohorts"][cohort]["phases"][phase]
            d.integer(v["succeeded"], amount, amount, "SUCCESSFUL_ORIGINAL_COMPLETION_COUNTS")
        source = paced["dispatchedCallRecording"]["phases"]["FUNDED_CALL"]
        require(source["rejected"] == 0 and source["succeeded"] == sum(dispatched) == completed - expected_warm,
            "ACTUAL_DISPATCH_COUNTS_CROSS_LANES")
        # Do not equate plannedCallsCompleted with all SDK source entries:
        # logical pre-entry withdrawals may satisfy the former without entry.
        return dict(pacedOuterCaptureDataVersion=2, status="MATCHING_DECLARED_PACED_V3_OUTER_CAPTURE_DATA",
            completedSourceOriginalCalls=completed, dispatchedMeasuredSourceCalls=sum(dispatched),
            preEntryWithdrawals=paced["preEntryWithheld"], logicalPlannedCallsCompleted=core["plannedCallsCompleted"],
            allSourceOriginalsCompletedAsData=completed == lanes * bound["totalCallsPerLane"],
            childCloseRowsAsData=2 * lanes, writerIntervalsAsData=writer_count,
            parentTimingEventsAsData=checked["parentCheck"]["eventsChecked"],
            pacedTimingEventsAsData=checked["check"]["eventsChecked"],
            wholeParentPacedAndWriterDataRecomputed=True, originalPayerCommandSequenceMatched=True,
            completeCommandStreamsBoundAsData=True, singleRawParentTrace=True, oldR4EnvelopeRewritten=False,
            entireInputTreeCopied=False, fullJsonReserializedForFrameCheck=False,
            timerEventsIndependentlyRecomputed=False, postStopLedgerDurationSeriesRecomputed=False,
            balanceObservationBarrierSeriesRecomputed=True, balancePerLaneMetricsRecomputed=True,
            balanceParentBarrierOrderCrossCheckedAsData=True, balanceTimingEventsAsData=balance["events"],
            balanceObservationsAsData=balance["observations"], singleRawBalanceTrace=True,
            balanceSqlOrL1LatencyQualified=False, receiptsIndependentlyAuthenticated=False,
            nativeResourcesQualified=False, storageCleanupQualified=False, sustainableCapacityQualified=False,
            chainAuthenticated=False, productionQualified=False, authority="NONE")

    def _lane(self, row, ev, plan, bound, run_id, dispatched, balance_metric):
        d, timing = self._old, self._timing
        d.fields(row, ("laneId", "pairAcquisitionEntered", "balanceReadsEntered", "pendingBalanceReads",
            "balanceObservationBarrierNs", "timingPages", "serviceWriterTraceBeforeCloseObserved",
            "serviceWriterIntervals", "writerBracketNs", "insideWriterTransactionNs", "serviceChildWindowWriterTrace",
            "measurementUnknown", "closeStatus", "held"), "EXACT_PACED_LANE_REPORT")
        d.fields(ev, ("laneId", "pairSnapshot", "serviceWriterIntervals", "serviceWriterAttribution",
            "serviceMeasurementWindow", "payerOperationTimings", "privateStreams"), "EXACT_PRIVATE_LANE_EVIDENCE")
        fixed = dict(pairAcquisitionEntered=True, balanceReadsEntered=3, pendingBalanceReads=0,
            serviceWriterTraceBeforeCloseObserved=True, measurementUnknown=False, closeStatus="RETURNED", held=False)
        require(all(timing.same(row[k], v) for k, v in fixed.items()), "LANE_OWNER_UNKNOWN")
        require(timing.same(row["balanceObservationBarrierNs"], balance_metric), "RECOMPUTED_PER_LANE_BALANCE_BARRIER_METRIC")
        pair = ev["pairSnapshot"]
        d.fields(pair, ("phase", "held", "completed", "warmupReserved", "measuredReserved", "activeOperation",
            "referenceCandidates", "referenceWindows", "balancesObserved", "launchAttempts", "launchUnknown",
            "historicalCloseStatus", "children", "nativeQualified", "capacityQualified", "authority", "freshBalanceReads",
            "windowOpenEntered", "windowStopEntered", "windowOpenAcknowledged", "windowStopAcknowledged", "measurementUnknown"),
            "EXACT_PAIR_SNAPSHOT")
        fixed = dict(phase="CLOSED", held=False, activeOperation=False, launchAttempts=2, launchUnknown=False,
            historicalCloseStatus="CLOSED", nativeQualified=False, capacityQualified=False, authority="NONE",
            freshBalanceReads=3, balancesObserved=True, windowOpenEntered=True, windowStopEntered=True,
            windowOpenAcknowledged=True, windowStopAcknowledged=True, measurementUnknown=False,
            warmupReserved=plan["plan"]["warmupCallsPerLane"], measuredReserved=dispatched,
            completed=plan["plan"]["warmupCallsPerLane"] + dispatched)
        require(all(timing.same(pair[k], v) for k, v in fixed.items()), "ORIGINAL_PAIR_COUNTS_OR_CLOSE_UNKNOWN")
        d.integer(pair["referenceCandidates"], 1, 32768, "DECLARED_REFERENCE_CANDIDATES")
        d.integer(pair["referenceWindows"], 1, 8, "DECLARED_REFERENCE_WINDOWS")
        children, streams = pair["children"], ev["privateStreams"]
        require(type(children) is list and type(streams) is list and len(children) == len(streams) == 2
            and all(type(v) is dict and type(v.get("role")) is str for v in children + streams)
            and {v["role"] for v in children} == {v["role"] for v in streams} == {"PAYER", "SERVICE"}, "TWO_COMPLETE_CHILD_ROLES")
        for child in children:
            d.fields(child, ("role", "exited", "closed", "disconnected", "exitCode", "signal", "fault", "pending", "stdout", "stderr"),
                "EXACT_CHILD_SNAPSHOT")
            fixed = dict(exited=True, closed=True, disconnected=True, exitCode=0, signal=None, fault=False, pending=0)
            require(all(timing.same(child[k], v) for k, v in fixed.items()), "CHILD_EXIT_EOF_OR_COMMAND_UNKNOWN")
            raw = next(v for v in streams if v["role"] == child["role"])
            d.fields(raw, ("role", "stdout", "stderr"), "EXACT_ROLE_STREAMS")
            for name, maximum in (("stdout", 1024), ("stderr", 8192)):
                captured = d.capture_stream(raw[name], maximum)
                facts = child[name]
                d.fields(facts, ("observedBytes", "retainedBytes", "overflow", "eof", "prefixSha256"), "EXACT_CHILD_STREAM_FACTS")
                fixed = dict(observedBytes=len(captured), retainedBytes=len(captured), overflow=False,
                    eof=True, prefixSha256=hashlib.sha256(captured).hexdigest())
                require(all(timing.same(facts[k], v) for k, v in fixed.items()), "COMPLETE_CHILD_STREAM_BINDING")
        timings = ev["serviceWriterIntervals"]
        require(type(timings) is list and 0 < len(timings) <= 12 * bound["totalCallsPerLane"] + 64
            and timing.same(row["serviceWriterIntervals"], len(timings)), "COMPLETE_WRITER_INTERVAL_COUNT")
        previous = None
        for ordinal, item in enumerate(timings, 1):
            d.fields(item, ("ordinal", "commandClass", "changed", "beforeBeginNs", "afterBeginNs", "beforeCommitNs",
                "afterCommitNs", "bracketElapsedNs", "insideTransactionElapsedNs"), "EXACT_WRITER_INTERVAL")
            ns = [d.nanoseconds(item[k]) for k in ("beforeBeginNs", "afterBeginNs", "beforeCommitNs", "afterCommitNs")]
            require(timing.same(item["ordinal"], ordinal) and item["commandClass"] in ("CONTROL", "APPLICATION_ORIGINAL")
                and type(item["changed"]) is bool and ns == sorted(ns) and (previous is None or previous <= ns[0])
                and d.nanoseconds(item["bracketElapsedNs"]) == ns[3] - ns[0]
                and d.nanoseconds(item["insideTransactionElapsedNs"]) == ns[2] - ns[1], "WHOLE_WRITER_BRACKET_ORDER")
            previous = ns[3]
        # Genuine unchanged child-context arithmetic. Its original d756 seal is
        # neither rebound nor used to relabel the new parent's timing context.
        d.validate_window_trace_data(row, ev, pair, plan, run_id)
        commands = ev["payerOperationTimings"]
        kinds = ["INIT", "OPEN", "PREPARE", "COMMIT", "SUBMIT", "BIND"] + ["EXECUTE"] * pair["completed"] + ["CLOSE", "RELEASE_IPC"]
        require(type(commands) is list and len(commands) == len(kinds) <= 264, "COMPLETE_ORIGINAL_PAYER_SEQUENCE")
        previous = None
        for ordinal, (command, kind) in enumerate(zip(commands, kinds), 1):
            d.fields(command, ("sequence", "kind", "status", "startNs", "endNs", "lateAfterTimeout", "clockDomain", "timingKind"),
                "EXACT_PAYER_LOCAL_TIMING")
            start, end = d.nanoseconds(command["startNs"]), d.nanoseconds(command["endNs"])
            status = "OBSERVED_RETURNED_CLOSE" if kind == "CLOSE" else "RELEASING_IPC" if kind == "RELEASE_IPC" else "OBSERVED"
            fixed = dict(sequence=ordinal, kind=kind, status=status, lateAfterTimeout=False,
                clockDomain="PAYER_CHILD_LOCAL", timingKind="CHILD_LOCAL_MONOTONIC_OPERATION_NOT_SQL_LATENCY")
            require(all(timing.same(command[k], v) for k, v in fixed.items()) and start <= end
                and (previous is None or previous <= start), "ORIGINAL_PAYER_LOCAL_SEQUENCE")
            previous = end
        return pair["completed"], len(timings)

    def _balance(self, capsule, recording, expected, parent_trace, maximum):
        """Recompute raw balance DATA, never replay a recorder or source call."""
        d, t = self._old, self._timing
        barriers = ("AFTER_FUNDING", "AFTER_WARMUP", "AFTER_DRAIN")
        clock = "PARENT_BALANCE_BARRIER_INCLUDING_FINAL_WRITER_TRACE_NOT_SQL_OR_L1"
        context = dict(runId=expected["runId"], sourceRowsSha256=expected["parentSourceRowsSha256"], laneIds=expected["laneIds"])
        lanes = len(context["laneIds"])
        d.fields(capsule, ("balanceBarrierCaptureVersion", "trace", "check"), "EXACT_BALANCE_CAPSULE")
        require(t.same(capsule["balanceBarrierCaptureVersion"], 1), "BALANCE_CAPSULE_VERSION")
        trace = capsule["trace"]
        d.fields(trace, ("balanceBarrierEvidenceVersion", "context", "clockDomain", "issue", "events"), "EXACT_RAW_BALANCE_TRACE")
        require(t.same(trace["balanceBarrierEvidenceVersion"], 1) and t.same(trace["context"], context)
            and trace["clockDomain"] == clock and trace["issue"] is None, "BALANCE_CONTEXT_CLOCK_OR_ISSUE")
        events = trace["events"]
        require(type(events) is list and len(events) == 6 * lanes, "COMPLETE_THREE_BALANCE_BARRIERS_PER_LANE")
        stages, pending, per_lane = [0] * lanes, [None] * lanes, [[] for _ in range(lanes)]
        all_series = [[] for _ in barriers]
        starts, ends = [[] for _ in barriers], [[] for _ in barriers]
        previous = None
        for event in events:
            require(type(event) is dict and event.get("kind") in ("BEGIN", "END"), "RAW_BALANCE_EVENT_KIND")
            kind = event["kind"]
            d.fields(event, ("kind", "lane", "barrier", "atNs") if kind == "BEGIN"
                else ("kind", "lane", "barrier", "outcome", "atNs"), "EXACT_BALANCE_EVENT_FIELDS")
            lane = event["lane"]; d.integer(lane, 0, lanes - 1, "BALANCE_LANE_INDEX")
            require(type(event["barrier"]) is str and event["barrier"] in barriers, "BALANCE_BARRIER_NAME")
            stage = barriers.index(event["barrier"]); at = d.nanoseconds(event["atNs"])
            require(stage == stages[lane] and (previous is None or at >= previous), "BALANCE_EVENT_ORDER")
            previous = at
            if kind == "BEGIN":
                require(pending[lane] is None, "BALANCE_DUPLICATE_OR_OVERLAPPING_BEGIN")
                pending[lane] = at; starts[stage].append(at)
            else:
                require(event["outcome"] == "SUCCEEDED" and pending[lane] is not None
                    and pending[lane] <= at and at - pending[lane] <= maximum, "BALANCE_TERMINAL_UNKNOWN_OR_BOUND")
                elapsed = at - pending[lane]
                all_series[stage].append(elapsed); per_lane[lane].append(elapsed); ends[stage].append(at)
                pending[lane] = None; stages[lane] += 1
        require(all(stage == 3 and start is None for stage, start in zip(stages, pending)), "BALANCE_INCOMPLETE")
        totals = 3 * lanes
        rebuilt = dict(balanceBarrierTraceVersion=1, status="COMPLETE_DECLARED_BALANCE_BARRIER_DATA",
            laneCount=lanes, expectedBarriers=totals, entered=totals, settled=totals, pending=0,
            succeeded=totals, rejected=0, unknown=0, issue=None, clockDomain=clock,
            metrics={name: t.metric(values) for name, values in zip(barriers, all_series)},
            physicalEventsAuthenticated=False, nativeResourcesQualified=False, sustainableCapacityQualified=False,
            productionQualified=False, authority="NONE")
        require(t.same(recording, rebuilt), "ALL_BALANCE_RECORDING_FIELDS_RECOMPUTED")
        rebuilt_check = dict(balanceBarrierTraceDataVersion=1, status="MATCHING_DECLARED_BALANCE_BARRIER_TRACE_DATA",
            lanes=lanes, barriers=totals, eventsChecked=6 * lanes, rawSeriesRecomputed=True,
            nativeEventsAuthenticated=False, parentClockAuthenticated=False, sqlLatencyQualified=False,
            nativeResourcesQualified=False, sustainableCapacityQualified=False, productionQualified=False, authority="NONE")
        require(t.same(capsule["check"], rebuilt_check), "ALL_BALANCE_CHECK_FIELDS_RECOMPUTED")
        # Both traces are declared PARENT-clock DATA. Never compare these times
        # with payer/service-child times, align child windows or call them SQL.
        rows = parent_trace["events"]
        first = d.nanoseconds(rows[0]["atNs"]); final = d.nanoseconds(rows[-1]["atNs"])
        measurement = [d.nanoseconds(row["atNs"]) for row in rows if row["kind"] == "START_MEASUREMENT"]
        stopped = [d.nanoseconds(row["atNs"]) for row in rows if row["kind"] == "STOP_MEASUREMENT"]
        checks = [d.nanoseconds(row["atNs"]) for row in rows if row["kind"] == "BALANCE_CHECK"]
        require(len(measurement) == len(stopped) == 1 and len(checks) == totals, "COMPLETE_PARENT_BALANCE_BARRIER_CONTEXT")
        require(first <= min(starts[0]) and max(ends[0]) <= min(starts[1])
            and max(ends[1]) <= measurement[0] <= stopped[0] <= min(starts[2])
            and max(ends[2]) <= final, "PARENT_BALANCE_PHASE_ORDER")
        for stage in range(3):
            actual = checks[stage * lanes:(stage + 1) * lanes]
            require(all(end <= check for end, check in zip(ends[stage], actual)),
                "BALANCE_TERMINAL_MUST_PRECEDE_PARENT_CHECK")
            if stage < 2:
                require(max(actual) <= min(starts[stage + 1]), "PARENT_CHECK_MUST_PRECEDE_NEXT_BALANCE_BARRIER")
        return dict(laneMetrics=[t.metric(values) for values in per_lane], events=len(events), observations=totals)
