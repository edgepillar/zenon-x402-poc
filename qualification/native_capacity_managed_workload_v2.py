"""P4 managed-workload V2 DATA planning and capture checks, not execution.

No filesystem, manager, application, SDK, SQL, clock, key, signature, nonce,
socket or process is entered here. All returned ceilings and receipt checks are
DATA, not native observations, permission or authentication. The actual managed
launcher must bind its real command receipts, source pins and owned task.
"""
import base64
import hashlib
import json
import math
import re

GRAPH_SHA = "c8e616b5d4a29261434ee3761f89b99ae5b5b73d6938381a65c427fe879d2aa8"
INVENTORY_SHA = "1b22c63b752d0295db771e63bda4638e81fe372b83c0b36d4a0d90fb2cc802a7"
PROFILE_SHA = "3918841bea76266f7571677135c01b1094a56de0667802e538ee8fd965309af1"
PAYEE = "z1qq3zyg3zyg3zyg3zyg3zyg3zyg3zyg3z3yw2mk"  # Public 20-byte fixture, not a wallet.
MIB = 1048576
FLOOR = 10 * 1024 * MIB
PARENT_CAPTURE_MAX = 16 * MIB
HASH = re.compile(r"[0-9a-f]{64}")
NS = re.compile(r"(?:0|[1-9][0-9]{0,38})")

def require(value, code):
    if not value:
        raise ValueError(code)

def plain(value, maximum_nodes=2000, maximum_array=1024, maximum_string=65536):
    nodes = 0
    def visit(v, depth):
        nonlocal nodes
        nodes += 1
        require(nodes <= maximum_nodes and depth <= 32, "BOUNDED_DATA_TREE")
        if type(v) is dict:
            require(len(v) <= 64 and all(type(k) is str for k in v), "EXACT_DATA_OBJECT")
            return {visit(k, depth+1): visit(item, depth+1) for k, item in v.items()}
        if type(v) is list:
            require(len(v) <= maximum_array, "BOUNDED_DATA_ARRAY")
            return [visit(item, depth+1) for item in v]
        if type(v) is str:
            require(len(v) <= maximum_string and v.isascii() and "\0" not in v, "BOUNDED_ASCII_DATA")
            return v
        if type(v) is int:
            require(-(2**53-1) <= v <= 2**53-1, "SAFE_INTEGER_DATA")
            return v
        require(v is None or type(v) is bool, "EXACT_DATA_TYPES")
        return v
    return visit(value, 0)

def fields(value, names, code):
    require(type(value) is dict and set(value) == set(names), code)

def integer(value, lower, upper, code):
    require(type(value) is int and lower <= value <= upper, code)

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("ascii")

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def pairs(items):
    out = {}
    for k, v in items:
        require(k not in out, "DUPLICATE_DATA_KEY"); out[k] = v
    return out

def decode(raw, maximum):
    require(type(raw) is bytes and 0 < len(raw) <= maximum, "BOUNDED_CAPTURE_BYTES")
    def invalid(_):
        raise ValueError("NON_INTEGER_OR_NONFINITE_DATA")
    try:
        return json.loads(raw.decode("ascii"), object_pairs_hook=pairs,
            parse_float=invalid, parse_constant=invalid)
    except (UnicodeError, json.JSONDecodeError, RecursionError):
        raise ValueError("INVALID_ASCII_CAPTURE") from None

def capture_plan(value):
    """Match the actual V2 adapter + async-core admission, without importing it."""
    v = plain(value)
    fields(v, ("workloadVersion", "laneIds", "plan", "recordingLimits", "payeeAddress",
        "commandBudgetMs", "closeBudgetMs"), "WORKLOAD_FIELDS")
    require(type(v["workloadVersion"]) is int and v["workloadVersion"] == 2 and v["payeeAddress"] == PAYEE,
        "SYNTHETIC_WORKLOAD_SELECTION")
    lanes = v["laneIds"]
    require(type(lanes) is list and 1 <= len(lanes) <= 16 and all(type(k) is str
        and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}", k) for k in lanes)
        and len(lanes) == len(set(lanes)), "BOUNDED_UNIQUE_LANES")
    p, r = v["plan"], v["recordingLimits"]
    fields(p, ("warmupCallsPerLane", "measurementCallsPerLane", "setupBudgetMs",
        "measurementWindowMs", "drainGraceMs", "maxLedgerTransactionsPerOperation"), "WORKLOAD_PLAN_FIELDS")
    fields(r, ("maxSamplesPerPhase", "maxInFlightPerPhase"), "RECORDING_LIMIT_FIELDS")
    integer(p["warmupCallsPerLane"], 0, 255, "WARMUP_BOUND")
    integer(p["measurementCallsPerLane"], 1, 256, "MEASUREMENT_CALL_BOUND")
    require(p["warmupCallsPerLane"] + p["measurementCallsPerLane"] <= 256, "TOTAL_CALL_BOUND")
    integer(p["setupBudgetMs"], 1, 60000, "SETUP_TIME_BOUND")
    integer(p["measurementWindowMs"], 1, 60000, "MEASUREMENT_TIME_BOUND")
    integer(p["drainGraceMs"], 1, 1000, "DRAIN_TIME_BOUND")
    integer(p["maxLedgerTransactionsPerOperation"], 1, 16, "LEDGER_START_BOUND")
    integer(r["maxSamplesPerPhase"], 1, 4096, "SAMPLE_BOUND")
    integer(r["maxInFlightPerPhase"], 1, 64, "IN_FLIGHT_BOUND")
    slots = (1+p["warmupCallsPerLane"]+p["measurementCallsPerLane"])*len(lanes)*p["maxLedgerTransactionsPerOperation"]
    require(r["maxInFlightPerPhase"] <= r["maxSamplesPerPhase"]
        and slots <= r["maxSamplesPerPhase"] and 3*len(lanes) <= r["maxSamplesPerPhase"]
        and len(lanes) <= r["maxInFlightPerPhase"], "ACTUAL_CORE_RECORDING_CAPACITY")
    integer(v["commandBudgetMs"], 1000, 60000, "PAIR_COMMAND_BUDGET")
    integer(v["closeBudgetMs"], 6000, 15000, "PAIR_CLOSE_BUDGET")
    return v

def resource_plan(value):
    """Finite reservation, NOT allocated bytes, OS quota or a native allowance."""
    v = capture_plan(value); p = v["plan"]; lanes = len(v["laneIds"])
    calls = p["warmupCallsPerLane"] + p["measurementCallsPerLane"]
    # Raw recorder traces, private child streams and per-command timing records
    # remain bounded by the real V2 entry. An overflow remains UNKNOWN, not a
    # silently smaller workload or an automatically repeated experiment.
    trace_rows = 12*calls+64
    possible_capture = 131072 + lanes*(512*trace_rows + 384*264 + 32768)
    stdout = min(PARENT_CAPTURE_MAX, ((possible_capture+65535)//65536)*65536)
    profiles = (2*lanes+1)*524288
    # Four SQLite files plus possible DELETE journals and two independent pin
    # files. This is a sampled aggregate allowance, not a per-file OS guarantee.
    native_files = lanes*32*MIB
    # Captures are promoted by rename, not duplicated. Account for both command
    # stderr reservations, private profiles, TLS copies and receipt overhead.
    quota = ((profiles+native_files+stdout+3*MIB+32768*lanes+MIB-1)//MIB)*MIB
    node_seconds = (p["setupBudgetMs"]+p["measurementWindowMs"]+p["drainGraceMs"]
        +v["closeBudgetMs"]+v["commandBudgetMs"]+999)//1000+20
    return dict(planVersion=2, workloadPlanSha256=sha(canonical(v)+b"\n"), sourceRowsSha256=GRAPH_SHA,
        laneCount=lanes, totalCallsPerLane=calls, warmupCallsMaximum=lanes*p["warmupCallsPerLane"],
        measuredCallsMaximum=lanes*p["measurementCallsPerLane"], nodeParentCommands=1,
        nodeChildProcessesMaximum=2*lanes, opensslCommands=1, maximumRuns=1,
        loopbackTcpConnectionsMaximum=lanes*(174+calls+2), externalNetwork=False,
        sqliteNewPathsMaximum=4*lanes, sqliteWalOrShmAllowed=False, independentPinFilesMaximum=2*lanes,
        inMemoryEd25519KeysMaximum=3*lanes, transactionSignaturesMaximum=lanes,
        capabilitySignaturesMaximum=lanes*calls, providerSignaturesMaximum=lanes,
        nonceCandidatesPerWindowMaximum=4096, nonceCandidatesPerLaneReserved=65536,
        nonceCandidatesTotalReserved=65536*lanes, testTlsKeyPairsMaximum=1,
        privateProfileBytesReserved=profiles, nodeStdoutLimit=stdout, nodeEntryCaptureMaximum=PARENT_CAPTURE_MAX,
        theoreticalCaptureMayExceedEntryCap=possible_capture>PARENT_CAPTURE_MAX,
        nativeFileBytesReserved=native_files, taskQuotaBytes=quota, expectedPeakBytes=quota,
        nodeTimeoutSeconds=node_seconds, opensslTimeoutSeconds=20, minimumFreeBytes=FLOOR,
        sourceCopiesRequired=0, packageCopiesRequired=0, automaticRetry=False,
        childCreatedFilesAutomaticAdoption=False, childCreatedFilesAutomaticDeletion=False,
        cleanupMayRemainHold=True, diskQuotaOsEnforced=False, nativeOsNetworkSandbox=False,
        effectsExecuted=False, authority="NONE")

def storage_policy(value):
    r = resource_plan(value); quota = r["taskQuotaBytes"]
    return dict(min_free_bytes=FLOOR, safety_margin_bytes=1024*MIB,
        task_quota_bytes=quota, scratch_quota_bytes=quota, store_quota_bytes=quota,
        metadata_quota_bytes=4*MIB, max_tasks=1, max_objects=128, max_commands_per_task=2,
        max_output_bytes=r["nodeStdoutLimit"], abandoned_after_seconds=86400, unreferenced_after_seconds=1209600)

def nanoseconds(v):
    require(type(v) is str and NS.fullmatch(v) and int(v)<2**128, "BOUNDED_MONOTONIC_DATA")
    return int(v)

def capture_stream(v, maximum):
    fields(v, ("bytes", "sha256", "base64"), "PRIVATE_STREAM_FIELDS")
    integer(v["bytes"], 0, maximum, "PRIVATE_STREAM_BOUND")
    require(type(v["sha256"]) is str and HASH.fullmatch(v["sha256"]) and type(v["base64"]) is str
        and len(v["base64"]) <= 4*((maximum+2)//3), "PRIVATE_STREAM_DATA")
    try:
        raw = base64.b64decode(v["base64"], validate=True)
    except ValueError:
        raise ValueError("PRIVATE_STREAM_BASE64") from None
    require(len(raw) == v["bytes"] and base64.b64encode(raw).decode("ascii") == v["base64"]
        and sha(raw) == v["sha256"], "PRIVATE_STREAM_DIGEST")
    return raw

def validate_capture_data(stdout, stderr, receipt, workload):
    """Check an actual command's DATA after capture; not native authentication.

    The real launcher must bind the exact owned manager receipt and command.
    Retain complete private bytes, including failures, before interpreting them.
    No rates, SQL latency, physical drain, sustained capacity or production
    qualification are inferred by this function.
    """
    plan = capture_plan(workload); bound = resource_plan(plan); lanes = len(plan["laneIds"])
    require(type(receipt) is dict and receipt.get("state") == "COMPLETE"
        and type(receipt.get("actual_exit")) is int and receipt["actual_exit"] == 0
        and receipt.get("output_complete") is True and "reason" in receipt and receipt["reason"] is None
        and "argv" in receipt and receipt["argv"] is None, "REAL_COMMAND_FAILURE_OR_UNKNOWN")
    integer(receipt.get("process_group"), 1, 2**31-1, "OWNED_COMMAND_GROUP_REQUIRED")
    integer(receipt.get("scratch_scan_retries"), 0, 2**53-1, "EXACT_CAPTURE_RETRY_COUNT")
    require(type(receipt.get("completed_at")) in (float,int) and math.isfinite(receipt["completed_at"])
        and 0 <= receipt["completed_at"] <= 2**53-1, "MANAGED_COMPLETION_OBSERVATION")
    require(type(stderr) is bytes and stderr == b"", "PARENT_STDERR_NOT_EMPTY")
    for name, raw in (("stdout", stdout), ("stderr", stderr)):
        slot = receipt.get(name)
        fields(slot, ("sha256", "bytes"), "MANAGED_STREAM_RECEIPT")
        require(type(raw) is bytes and slot["sha256"] == sha(raw) and type(slot["bytes"]) is int
            and slot["bytes"] == len(raw), "MANAGED_STREAM_CONTENT_BINDING")
    v = plain(decode(stdout, bound["nodeStdoutLimit"]), 1500000, 100000, 65536)
    fields(v, ("captureVersion", "kind", "sourceRowsSha256", "result", "evidence", "nativeResourcesQualified",
        "sustainableCapacityQualified", "chainAuthenticated", "productionQualified", "authority"), "PARENT_CAPTURE_FIELDS")
    require(type(v["captureVersion"]) is int and v["captureVersion"] == 2
        and v["kind"] == "PRIVATE_FULL_NATIVE_CAPACITY_COMPONENT_CAPTURE_NOT_PRODUCTION"
        and v["sourceRowsSha256"] == GRAPH_SHA and v["authority"] == "NONE"
        and all(v[k] is False for k in ("nativeResourcesQualified", "sustainableCapacityQualified",
            "chainAuthenticated", "productionQualified")), "PARENT_CAPTURE_NOT_PRODUCTION")
    result = v["result"]; core = result.get("core") if type(result) is dict else None
    require(type(core) is dict, "COMPONENT_OWNER_NOT_RETURNED")
    require(all(result.get(k) is False for k in ("sustainedCapacityQualified", "nativeEventsAuthenticated",
        "nativeResourcesQualified", "nativeOsNetworkSandbox", "productionQualified", "childClockDomainsMerged", "ledgerTimeInferredFromPromise"))
        and all(core.get(k) is False for k in ("nativeClockAuthenticated", "nativeResourcesQualified", "benchmarkQualified", "capacityQualified")),
        "COMPONENT_DATA_NOT_QUALIFICATION")
    for name in ("laneCount", "returnedCloses", "unknownCloses", "pendingCloses", "pendingOperations",
                 "pendingLedgerBoundaries", "pendingBalanceReads", "completedBalanceBarriers", "balanceReadAttempts"):
        integer(core.get(name), 0, 4096, "EXACT_OWNER_COUNTER")
    require(type(core) is dict and result.get("nativeCapacityWorkloadAdapterVersion") == 2
        and result.get("status") == "OBSERVED_COMPONENT_ONLY" and result.get("authority") == "NONE"
        and core.get("outcome") == "OBSERVED_OWNERS_RETURNED" and core.get("plan") == plan["plan"]
        and core.get("laneCount") == lanes and core.get("returnedCloses") == lanes
        and core.get("unknownCloses") == core.get("pendingCloses") == 0
        and core.get("pendingOperations") == core.get("pendingLedgerBoundaries") == core.get("pendingBalanceReads") == 0
        and core.get("balanceBarrierPending") is False and core.get("completedBalanceBarriers") == 3
        and core.get("balanceReadAttempts") == 3*lanes
        and core.get("balanceContract") == "GENUINE_PROMISE_FRESH_READ_NOT_SYNC_CACHE"
        and core.get("authority") == "NONE", "COMPONENT_OWNER_NOT_RETURNED")
    recording = core.get("recording")
    require(type(recording) is dict and recording.get("recordingState") == "COMPLETE"
        and recording.get("recordingIssue") is None and recording.get("pendingObservations") == 0
        and recording.get("capacityQualification") == "NOT_ESTABLISHED"
        and recording.get("sustainableThroughput") == "NOT_ESTABLISHED", "RECORDER_INCOMPLETE")
    duration = nanoseconds(recording.get("measurementNanoseconds"))
    balances = recording.get("ledgerBalanceChecks")
    require(type(balances) is dict and balances.get("samples") == 3*lanes and balances.get("mismatches") == 0, "BALANCE_BARRIER_MISMATCH")
    integer(balances.get("samples"), 0, 4096, "EXACT_BALANCE_COUNTER")
    integer(balances.get("mismatches"), 0, 4096, "EXACT_BALANCE_COUNTER")
    rows, evidence = result.get("lanes"), v["evidence"]
    require(type(rows) is list and type(evidence) is list and len(rows) == len(evidence) == lanes
        and all(type(r) is dict for r in rows+evidence)
        and [r.get("laneId") for r in rows] == [r.get("laneId") for r in evidence] == plan["laneIds"], "COMPLETE_LANE_EVIDENCE")
    completed = 0; child_count = 0; writer_rows = 0
    for row, ev in zip(rows, evidence):
        fields(ev, ("laneId", "pairSnapshot", "serviceWriterIntervals", "payerOperationTimings", "privateStreams"), "PRIVATE_LANE_EVIDENCE_FIELDS")
        for name in ("balanceReadsEntered", "pendingBalanceReads", "serviceWriterIntervals"):
            integer(row.get(name), 0, 4096, "EXACT_LANE_COUNTER")
        require(row.get("pairAcquisitionEntered") is True and row.get("balanceReadsEntered") == 3
            and row.get("pendingBalanceReads") == 0 and row.get("closeStatus") == "RETURNED"
            and row.get("held") is False and row.get("serviceWriterTraceBeforeCloseObserved") is True, "LANE_OWNER_UNKNOWN")
        pair = ev.get("pairSnapshot")
        fields(pair, ("phase", "held", "completed", "warmupReserved", "measuredReserved", "activeOperation", "referenceCandidates", "referenceWindows",
            "balancesObserved", "launchAttempts", "launchUnknown", "historicalCloseStatus", "children", "nativeQualified", "capacityQualified", "authority"), "PAIR_SNAPSHOT_FIELDS")
        require(type(pair) is dict and pair.get("phase") == "CLOSED" and pair.get("held") is False
            and pair.get("activeOperation") is False and pair.get("launchAttempts") == 2
            and pair.get("launchUnknown") is False and pair.get("historicalCloseStatus") == "CLOSED"
            and pair.get("nativeQualified") is False and pair.get("capacityQualified") is False
            and pair.get("authority") == "NONE", "REAL_PAIR_NOT_CLOSED")
        integer(pair.get("completed"), plan["plan"]["warmupCallsPerLane"], bound["totalCallsPerLane"], "COMPLETED_ORIGINAL_BOUND")
        integer(pair.get("referenceCandidates"), 1, 32768, "REFERENCE_CANDIDATE_BOUND")
        integer(pair.get("referenceWindows"), 1, 8, "REFERENCE_WINDOW_BOUND")
        require(type(pair.get("warmupReserved")) is int and pair["warmupReserved"] == plan["plan"]["warmupCallsPerLane"]
            and type(pair.get("measuredReserved")) is int
            and pair["measuredReserved"] == pair["completed"]-pair["warmupReserved"], "ORIGINAL_COHORT_COUNTS")
        completed += pair["completed"]
        children, streams = pair.get("children"), ev.get("privateStreams")
        require(type(children) is list and type(streams) is list and len(children) == len(streams) == 2
            and all(type(c) is dict and type(c.get("role")) is str for c in children+streams)
            and {c.get("role") for c in children} == {s.get("role") for s in streams} == {"PAYER", "SERVICE"}, "TWO_ACTUAL_ROLES_REQUIRED")
        for child in children:
            fields(child, ("role", "exited", "closed", "disconnected", "exitCode", "signal", "fault", "pending", "stdout", "stderr"), "CHILD_SNAPSHOT_FIELDS")
            require(all(child.get(k) is True for k in ("exited", "closed", "disconnected"))
                and type(child.get("exitCode")) is int and child["exitCode"] == 0
                and child.get("signal") is None and child.get("fault") is False
                and type(child.get("pending")) is int and child["pending"] == 0, "CHILD_EOF_OR_EXIT_UNKNOWN")
            child_count += 1
            raw = next(s for s in streams if s["role"] == child["role"])
            fields(raw, ("role", "stdout", "stderr"), "PRIVATE_ROLE_STREAM_FIELDS")
            for name, maximum in (("stdout", 1024), ("stderr", 8192)):
                captured = capture_stream(raw[name], maximum); facts = child.get(name)
                fields(facts, ("observedBytes", "retainedBytes", "overflow", "eof", "prefixSha256"), "CHILD_STREAM_FACT_FIELDS")
                integer(facts["observedBytes"], 0, maximum, "CHILD_STREAM_BYTE_COUNT")
                integer(facts["retainedBytes"], 0, maximum, "CHILD_STREAM_BYTE_COUNT")
                require(type(facts) is dict and facts.get("observedBytes") == facts.get("retainedBytes") == len(captured)
                    and facts.get("overflow") is False and facts.get("eof") is True
                    and facts.get("prefixSha256") == sha(captured), "CHILD_STREAM_NOT_COMPLETE")
        timings = ev.get("serviceWriterIntervals")
        require(type(timings) is list and 0 < len(timings) <= 12*bound["totalCallsPerLane"]+64
            and row.get("serviceWriterIntervals") == len(timings), "WRITER_TRACE_BOUND")
        previous = None
        for ordinal, item in enumerate(timings, 1):
            fields(item, ("ordinal", "commandClass", "changed", "beforeBeginNs", "afterBeginNs",
                "beforeCommitNs", "afterCommitNs", "bracketElapsedNs", "insideTransactionElapsedNs"), "WRITER_INTERVAL_FIELDS")
            ns = [nanoseconds(item[k]) for k in ("beforeBeginNs", "afterBeginNs", "beforeCommitNs", "afterCommitNs")]
            require(item["ordinal"] == ordinal and item["commandClass"] in ("CONTROL", "APPLICATION_ORIGINAL")
                and type(item["changed"]) is bool and ns == sorted(ns)
                and (previous is None or previous <= ns[0])
                and nanoseconds(item["bracketElapsedNs"]) == ns[3]-ns[0]
                and nanoseconds(item["insideTransactionElapsedNs"]) == ns[2]-ns[1], "WRITER_INTERVAL_ORDER")
            previous = ns[3]
        writer_rows += len(timings)
        commands = ev.get("payerOperationTimings")
        expected_kinds = ["INIT", "OPEN", "PREPARE", "COMMIT", "SUBMIT", "BIND"]+["EXECUTE"]*pair["completed"]+["CLOSE", "RELEASE_IPC"]
        require(type(commands) is list and len(commands) == len(expected_kinds) <= 264, "PAYER_LOCAL_TIMING_COUNT")
        last = None
        for ordinal, (command, kind) in enumerate(zip(commands, expected_kinds), 1):
            fields(command, ("sequence", "kind", "status", "startNs", "endNs", "lateAfterTimeout", "clockDomain", "timingKind"), "PAYER_LOCAL_TIMING_FIELDS")
            start, end = nanoseconds(command["startNs"]), nanoseconds(command["endNs"])
            expected_status = "OBSERVED_RETURNED_CLOSE" if kind == "CLOSE" else "RELEASING_IPC" if kind == "RELEASE_IPC" else "OBSERVED"
            require(type(command["sequence"]) is int and command["sequence"] == ordinal and command["kind"] == kind
                and command["status"] == expected_status and command["lateAfterTimeout"] is False
                and command["clockDomain"] == "PAYER_CHILD_LOCAL"
                and command["timingKind"] == "CHILD_LOCAL_MONOTONIC_OPERATION_NOT_SQL_LATENCY"
                and start <= end and (last is None or last <= start), "PAYER_LOCAL_TIMING_ORDER")
            last = end
    require(type(core.get("plannedCallsCompleted")) is bool
        and core["plannedCallsCompleted"] == (completed == lanes*bound["totalCallsPerLane"]), "PLANNED_CALL_COMPLETION_DATA")
    return dict(componentCaptureDataMatches=True, completedOriginalCalls=completed, childClosesObservedAsData=child_count,
        freshBalanceBarriersAsData=3, writerIntervalsAsData=writer_rows, measurementNanoseconds=str(duration),
        dataOnlyNotNativeAuthentication=True, nativeResourcesQualified=False, storageCleanupQualified=False,
        sustainableCapacityQualified=False, chainAuthenticated=False, productionQualified=False, authority="NONE")
