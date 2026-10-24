"""Paced parent V2 / outer capture V3 resource and entry planning: pure DATA.

The future managed controller consumes these complete plans. No storage manager,
filesystem, clock, SDK, SQL, key, signature, nonce, socket or child is entered.
Reservations are conservative policy inputs, not measured usage or OS quotas.
A plan never grants native authority or changes the frozen unpaced R4 lane.
"""
import hashlib
import json
import re

MIB = 1048576
MINIMUM_FREE_BYTES = 10 * 1024 * MIB
SAFETY_MARGIN_BYTES = 1024 * MIB
ENTRY_CAPTURE_CAP = 16 * MIB
PROFILE_CAP = 524288
ENTRY_PLAN_CAP = 65536
PAYEE = "z1qq3zyg3zyg3zyg3zyg3zyg3zyg3zyg3z3yw2mk"
PARENT_SOURCE_SHA256 = "38bb4557357dd42bcd7dedacb4b7ec2fc750d474e7f9c14045376b73b0739160"
CHILD_SOURCE_SHA256 = "d756740994aeb53ebeee47320d732583d96381dfa8c00e18a30f414e70a77027"
SOURCE_SELECTION_SHA256 = "b7fd574d4959738215f61e3a96c7d2de62eeda833b1484696a6a299bcb6c966b"
PARENT_PROFILE_PRODUCER_SHA256 = "20888e7480166916343a49715ec8bf30bc789036719ad0a36c8206a110de8850"
BALANCE_RECORDER_SOURCE_SHA256 = "235f5ff9b0b128a393244a545e6d5f83ffb3c8335e358efcc294968d562260e9"
BALANCE_CLOCK_DOMAIN = "PARENT_BALANCE_BARRIER_INCLUDING_FINAL_WRITER_TRACE_NOT_SQL_OR_L1"
METADATA_STORE_QUOTA_BYTES = 4 * MIB
BALANCE_EVENT_BYTES_RESERVED = 256
BALANCE_TRACE_WRAPPER_BYTES_RESERVED = 4096
BALANCE_CONTEXT_LANE_BYTES_RESERVED = 256
BALANCE_SCALAR_RECORDING_BYTES_RESERVED = 4096
BALANCE_DATA_CHECK_BYTES_RESERVED = 2048
BALANCE_LANE_METRIC_BYTES_RESERVED = 768
LANE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}")
HASH = re.compile(r"[0-9a-f]{64}")


def require(value, code):
    if not value:
        raise ValueError(code)


def _plain(value):
    """Detach exact bounded built-ins only, without coercion or user hooks."""
    nodes = 0
    def visit(v, depth):
        nonlocal nodes
        nodes += 1
        require(nodes <= 4096 and depth <= 8, "BOUNDED_PLAN_TREE")
        if type(v) is dict:
            require(len(v) <= 32 and all(type(k) is str for k in v), "EXACT_PLAN_OBJECT")
            return {visit(k, depth + 1): visit(item, depth + 1) for k, item in v.items()}
        if type(v) is list:
            require(len(v) <= 64, "BOUNDED_PLAN_ARRAY")
            return [visit(item, depth + 1) for item in v]
        if type(v) is str:
            require(len(v) <= 4096 and all(32 <= ord(c) <= 126 for c in v), "PRINTABLE_PLAN_STRING")
            return v
        if type(v) is int:
            require(-(2**53 - 1) <= v <= 2**53 - 1, "SAFE_PLAN_INTEGER")
            return v
        require(v is None or type(v) is bool, "EXACT_PLAN_TYPES")
        return v
    return visit(value, 0)


def _fields(value, names, code):
    require(type(value) is dict and set(value) == set(names), code)


def _integer(value, low, high, code):
    require(type(value) is int and low <= value <= high, code)


def canonical_bytes(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("ascii") + b"\n"


def capture_plan(value):
    """Keep the unchanged workload-format v1 limits, not the old parent graph.

    Parent profile/outer capture versions are separate from this input format.
    No adapter, child or application module is imported or executed.
    """
    v = _plain(value)
    _fields(v, ("pacedWorkloadVersion", "laneIds", "plan", "recordingLimits",
        "payeeAddress", "commandBudgetMs", "closeBudgetMs", "pacing"), "PACED_WORKLOAD_FIELDS")
    require(type(v["pacedWorkloadVersion"]) is int and v["pacedWorkloadVersion"] == 1
        and v["payeeAddress"] == PAYEE, "EXPLICIT_SYNTHETIC_PACED_SELECTION")
    lanes = v["laneIds"]
    require(type(lanes) is list and 1 <= len(lanes) <= 16
        and all(type(k) is str and LANE.fullmatch(k) for k in lanes)
        and len(set(lanes)) == len(lanes), "BOUNDED_UNIQUE_LANES")
    p, r = v["plan"], v["recordingLimits"]
    _fields(p, ("warmupCallsPerLane", "measurementCallsPerLane", "setupBudgetMs",
        "measurementWindowMs", "drainGraceMs", "maxLedgerTransactionsPerOperation"), "PACED_PLAN_FIELDS")
    _fields(r, ("maxSamplesPerPhase", "maxInFlightPerPhase"), "RECORDING_LIMIT_FIELDS")
    _fields(v["pacing"], ("minimumStartGapMs",), "PACING_FIELDS")
    _integer(p["warmupCallsPerLane"], 0, 255, "WARMUP_BOUND")
    _integer(p["measurementCallsPerLane"], 1, 256, "MEASURED_CALL_BOUND")
    require(p["warmupCallsPerLane"] + p["measurementCallsPerLane"] <= 256, "TOTAL_CALL_BOUND")
    _integer(p["setupBudgetMs"], 1, 60000, "SETUP_TIME_BOUND")
    _integer(p["measurementWindowMs"], 1, 60000, "MEASUREMENT_TIME_BOUND")
    _integer(p["drainGraceMs"], 1, 1000, "DRAIN_TIME_BOUND")
    _integer(p["maxLedgerTransactionsPerOperation"], 1, 16, "LEDGER_START_BOUND")
    _integer(r["maxSamplesPerPhase"], 1, 4096, "SAMPLE_BOUND")
    _integer(r["maxInFlightPerPhase"], 1, 64, "IN_FLIGHT_BOUND")
    _integer(v["pacing"]["minimumStartGapMs"], 1, 1000, "PACING_GAP_BOUND")
    slots = (1 + p["warmupCallsPerLane"] + p["measurementCallsPerLane"]) * len(lanes) * p["maxLedgerTransactionsPerOperation"]
    require(r["maxInFlightPerPhase"] <= r["maxSamplesPerPhase"]
        and len(lanes) <= r["maxInFlightPerPhase"] and 3 * len(lanes) <= r["maxSamplesPerPhase"]
        and slots <= r["maxSamplesPerPhase"], "ACTUAL_CORE_RECORDING_CAPACITY")
    _integer(v["commandBudgetMs"], 1000, 60000, "PAIR_COMMAND_BUDGET")
    _integer(v["closeBudgetMs"], 6000, 15000, "PAIR_CLOSE_BUDGET")
    return v


def resource_plan(value):
    """Account for the complete outer-v3 capture and both managed command streams.

    Event ceilings follow the actual private recorders. Byte allowances are
    conservative reservations, not proofs of serialized size or peak heap.
    Overflow is UNKNOWN; no event/sample is dropped and no retry is authorized.
    """
    v = capture_plan(value)
    p, limits, lanes = v["plan"], v["recordingLimits"], len(v["laneIds"])
    calls = p["warmupCallsPerLane"] + p["measurementCallsPerLane"]
    writer_rows = 12 * calls + 64
    core_events = 7 * limits["maxSamplesPerPhase"] + 4
    paced_events = 4 * limits["maxSamplesPerPhase"] + 1
    core_and_paced_events = core_events + paced_events
    balance_observations = 3 * lanes
    balance_events = 2 * balance_observations
    unique_events = core_and_paced_events + balance_events
    core_and_paced_timing_bytes = 16384 + 256 * core_and_paced_events
    # These are separate real outer-v3 fields: raw trace once, scalar recording
    # once, DATA-check summary once, plus the existing per-lane barrier metric.
    # The BEGIN/END timestamps are already-observed callback values. Reserving
    # their bytes must not add a clock read, a balance call or a source replay.
    balance_trace_bytes = (BALANCE_TRACE_WRAPPER_BYTES_RESERVED
        + BALANCE_CONTEXT_LANE_BYTES_RESERVED * lanes + BALANCE_EVENT_BYTES_RESERVED * balance_events)
    balance_scalar_bytes = BALANCE_SCALAR_RECORDING_BYTES_RESERVED
    balance_check_bytes = BALANCE_DATA_CHECK_BYTES_RESERVED
    balance_lane_bytes = BALANCE_LANE_METRIC_BYTES_RESERVED * lanes
    balance_bytes = balance_trace_bytes + balance_scalar_bytes + balance_check_bytes + balance_lane_bytes
    timing_bytes = core_and_paced_timing_bytes + balance_trace_bytes
    capture_bytes = (131072 + lanes * (1024 * writer_rows + 384 * 264 + 32768 + 65536)
        + core_and_paced_timing_bytes + balance_bytes)
    requested_stdout = ((capture_bytes + 65535) // 65536) * 65536
    stdout = min(ENTRY_CAPTURE_CAP, requested_stdout)
    # The actual approved Task.run caps stderr separately at min(policy max, 1 MiB).
    # Preserve both OpenSSL and Node output allowances, not only clean stdout.
    node_stderr = min(stdout, MIB)
    openssl_stdout, openssl_stderr = 16384, min(stdout, MIB)
    command_streams = stdout + node_stderr + openssl_stdout + openssl_stderr
    profiles = (2 * lanes + 1) * PROFILE_CAP
    native_files, tls_aliases, receipts = 32 * MIB * lanes, 32768 * lanes, MIB
    quota = ((profiles + ENTRY_PLAN_CAP + native_files + command_streams + tls_aliases + receipts + MIB - 1) // MIB) * MIB
    timeout = (p["setupBudgetMs"] + p["measurementWindowMs"] + p["drainGraceMs"]
        + v["closeBudgetMs"] + v["commandBudgetMs"] + 999) // 1000 + 20
    fits = requested_stdout <= ENTRY_CAPTURE_CAP
    return dict(resourcePlanVersion=2, pacedCaptureVersion=3, parentProfileVersion=2, workloadInputVersion=1,
        workloadPlanSha256=hashlib.sha256(canonical_bytes(v)).hexdigest(),
        sourceSelectionSha256=SOURCE_SELECTION_SHA256, parentSourceRowsSha256=PARENT_SOURCE_SHA256,
        parentApplicationFiles=146, parentPackageFiles=404, childApplicationFiles=139, childPackageFiles=404,
        parentProfileProducerSha256=PARENT_PROFILE_PRODUCER_SHA256, balanceRecorderSourceSha256=BALANCE_RECORDER_SOURCE_SHA256,
        childSourceRowsSha256=CHILD_SOURCE_SHA256, laneCount=lanes, totalCallsPerLane=calls,
        measuredCallsRequested=lanes * p["measurementCallsPerLane"],
        minimumSpanForAllRequestedMeasuredStartsMs=max(0, lanes * p["measurementCallsPerLane"] - 1) * v["pacing"]["minimumStartGapMs"],
        allRequestedCallsGuaranteed=False, offeredRateQualified=False,
        privateCoreParentEventsMaximum=core_events, privatePacedEventsMaximum=paced_events,
        privateBalanceObservationsMaximum=balance_observations, privateBalanceEventsMaximum=balance_events,
        uniqueRawTimingEventsMaximum=unique_events, rawCoreTraceCopies=1,
        privateCoreAndPacedTimingBytesReserved=core_and_paced_timing_bytes,
        privateBalanceTraceBytesReserved=balance_trace_bytes, balanceEventBytesReserved=BALANCE_EVENT_BYTES_RESERVED,
        balanceTraceWrapperBytesReserved=BALANCE_TRACE_WRAPPER_BYTES_RESERVED,
        balanceContextLaneBytesReserved=BALANCE_CONTEXT_LANE_BYTES_RESERVED,
        balanceScalarRecordingBytesReserved=balance_scalar_bytes, balanceDataCheckBytesReserved=balance_check_bytes,
        balanceLaneMetricsBytesReserved=balance_lane_bytes, balanceLaneMetricBytesPerLaneReserved=BALANCE_LANE_METRIC_BYTES_RESERVED,
        balanceOuterCaptureBytesReserved=balance_bytes, rawBalanceTraceCopies=1, scalarBalanceRecordingCopies=1,
        balanceDataCheckCopies=1, balanceLaneMetricCopiesPerLane=1, balanceClockDomain=BALANCE_CLOCK_DOMAIN,
        balanceClockReadsAdditional=0, balanceStoreCallsAdditional=0, balanceTimingObserved=False,
        balanceSqlOrL1LatencyQualified=False,
        privateTimingBytesReserved=timing_bytes, timingBytesPerEventReserved=256,
        timingWrapperBytesReserved=16384, timingClockReadsAdditional=0,
        captureBytesReservedBeforeEntryCap=capture_bytes, requestedNodeStdoutLimit=requested_stdout,
        nodeStdoutLimit=stdout, nodeStderrLimit=node_stderr,
        opensslStdoutLimit=openssl_stdout, opensslStderrLimit=openssl_stderr,
        commandStreamsBytesReserved=command_streams, entryCaptureMaximum=ENTRY_CAPTURE_CAP,
        captureReservationFitsEntryCap=fits, managedStoragePolicyReady=fits,
        captureOverflowPolicy="UNKNOWN_PRESERVE_COMPLETE_RECEIPTS_NO_RETRY",
        privateProfileBytesReserved=profiles, entryPlanBytesReserved=ENTRY_PLAN_CAP, nativeFileBytesReserved=native_files,
        independentTlsAliasesBytesReserved=tls_aliases, receiptBytesReserved=receipts,
        taskQuotaBytes=quota, expectedPeakBytesReserved=quota,
        minimumFreeBytes=MINIMUM_FREE_BYTES, safetyMarginBytes=SAFETY_MARGIN_BYTES,
        metadataStoreQuotaBytesReserved=METADATA_STORE_QUOTA_BYTES,
        requiredFreeBytesBeforeOtherReservations=MINIMUM_FREE_BYTES + SAFETY_MARGIN_BYTES + quota + METADATA_STORE_QUOTA_BYTES,
        otherTasksReservationsIncluded=False, nodeTimeoutSeconds=timeout,
        pacingAddedToNodeTimeoutMs=0, opensslTimeoutSeconds=20,
        nodeParentCommandsMaximum=1, nodeChildProcessesMaximum=2 * lanes,
        opensslCommandsMaximum=1, maximumRuns=1,
        loopbackTcpConnectionsMaximum=lanes * (174 + calls + 2), externalNetwork=False,
        sqliteNewPathsMaximum=4 * lanes, sqliteWalOrShmAllowed=False, independentPinFilesMaximum=2 * lanes,
        inMemoryEd25519KeysMaximum=3 * lanes, transactionSignaturesMaximum=lanes,
        capabilitySignaturesMaximum=lanes * calls, providerSignaturesMaximum=lanes,
        nonceCandidatesPerWindowMaximum=4096, nonceCandidatesTotalReserved=65536 * lanes,
        testTlsKeyPairsMaximum=1, sourceCopiesRequired=0, packageCopiesRequired=0,
        captureHeapByteBoundEstablished=False, diskQuotaOsEnforced=False, nativeOsNetworkSandbox=False,
        automaticRetry=False, automaticSampleReduction=False, childCreatedFilesAutomaticAdoption=False,
        childCreatedFilesAutomaticDeletion=False, cleanupMayRemainHold=True, effectsExecuted=False,
        nativeAllowanceGranted=False, authority="NONE")


def storage_policy(value):
    """Proposed NEW-root policy only; never open, initialize or alter a store."""
    r = resource_plan(value)
    require(r["captureReservationFitsEntryCap"], "PACED_CAPTURE_RESERVATION_EXCEEDS_ENTRY_CAP")
    return dict(min_free_bytes=MINIMUM_FREE_BYTES, safety_margin_bytes=SAFETY_MARGIN_BYTES,
        task_quota_bytes=r["taskQuotaBytes"], scratch_quota_bytes=r["taskQuotaBytes"],
        store_quota_bytes=r["taskQuotaBytes"], metadata_quota_bytes=r["metadataStoreQuotaBytesReserved"],
        max_tasks=1, max_objects=128, max_commands_per_task=2, max_output_bytes=r["nodeStdoutLimit"],
        abandoned_after_seconds=86400, unreferenced_after_seconds=1209600)


def entry_plan(value, run_id, lane_profiles):
    """Create the actual entry's canonical plan BYTES IN MEMORY, not admission.

    Exact references must later be authenticated against the complete profiles
    and independent owned roots. Distinct strings are not inode/lease evidence.
    """
    v = capture_plan(value)
    require(type(run_id) is str and HASH.fullmatch(run_id), "INDEPENDENT_RUN_ID")
    rows = _plain(lane_profiles)
    require(type(rows) is list and len(rows) == len(v["laneIds"]), "COMPLETE_ENTRY_LANES")
    paths, digests = set(), set()
    for index, row in enumerate(rows):
        _fields(row, ("laneId", "payerProfile", "serviceProfile"), "ENTRY_LANE_FIELDS")
        require(row["laneId"] == v["laneIds"][index], "ORDERED_ENTRY_LANE_BINDING")
        for key in ("payerProfile", "serviceProfile"):
            ref = row[key]
            _fields(ref, ("path", "sha256"), "EXACT_PROFILE_REFERENCE")
            path, digest = ref["path"], ref["sha256"]
            require(type(path) is str and path.startswith("/") and len(path) > 1
                and all(part not in ("", ".", "..") for part in path[1:].split("/")),
                "CANONICAL_ABSOLUTE_PROFILE_PATH")
            require(type(digest) is str and HASH.fullmatch(digest), "EXACT_PROFILE_DIGEST")
            require(path not in paths and digest not in digests, "DISTINCT_PROFILE_REFERENCES")
            paths.add(path); digests.add(digest)
    out = dict(context=dict(runId=run_id), plan=v["plan"], recordingLimits=v["recordingLimits"],
        laneProfiles=rows, payeeAddress=v["payeeAddress"], commandBudgetMs=v["commandBudgetMs"],
        closeBudgetMs=v["closeBudgetMs"], pacing=v["pacing"])
    raw = canonical_bytes(out)
    require(len(raw) <= ENTRY_PLAN_CAP, "ENTRY_PLAN_BYTE_CAP")
    return dict(plan=out, planBytes=raw, planSha256=hashlib.sha256(raw).hexdigest(),
        planBytesCount=len(raw), profileReferencesAuthenticated=False, rootIndependenceAuthenticated=False,
        nativeExecuted=False, authority="NONE")
