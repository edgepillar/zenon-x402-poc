"""Current offered-load full resource planning: pure DATA, not native authority.

A fast lane can receive every global offer. Reserve its complete funded capacity
on EVERY lane; never divide the global calendar or lower samples to make a plan
fit. The manager must admit the real existing root and every other reservation.
"""
import hashlib
import json
import re

MIB=1048576
MINIMUM_FREE_BYTES=10*1024*MIB
SAFETY_MARGIN_BYTES=1024*MIB
METADATA_STORE_QUOTA_BYTES=4*MIB
ENTRY_CAPTURE_CAP=16*MIB
PROFILE_CAP=524288
ENTRY_PLAN_CAP=65536
PAYEE="z1qq3zyg3zyg3zyg3zyg3zyg3zyg3zyg3z3yw2mk"
PARENT_SOURCE_SHA256="6f4992bb133fb399f9f28e111bd2b993a88c412c4832b163a519a357abee3b7a"
CHILD_SOURCE_SHA256="92646a2cf5edf717a1d24468fa6277c48c4f59f43db5b6e607b6071acc79c2b2"
SOURCE_SELECTION_SHA256="618aec16af6144523c568fd2bb851ad7eeb780702f0377f4059df5c577304327"
PARENT_PROFILE_PRODUCER_SHA256="868b1391c9a926e19a3855c5878920df47987e88d33a025d3cc56f28132e937e"
LANE=re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}")
HASH=re.compile(r"[0-9a-f]{64}")

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
    """The complete current JS offered-plan input, with its exact finite bounds."""
    v=_plain(value)
    _fields(v,("offeredWorkloadVersion","laneIds","plan","recordingLimits","payeeAddress","commandBudgetMs","closeBudgetMs"),"OFFERED_WORKLOAD_FIELDS")
    require(type(v["offeredWorkloadVersion"])is int and v["offeredWorkloadVersion"]==2 and v["payeeAddress"]==PAYEE,"CURRENT_OFFERED_SELECTION")
    lanes=v["laneIds"]
    require(type(lanes)is list and 1<=len(lanes)<=16 and all(type(x)is str and LANE.fullmatch(x)for x in lanes)
        and len(set(lanes))==len(lanes),"COMPLETE_DISTINCT_LANES")
    p,r=v["plan"],v["recordingLimits"]
    _fields(p,("warmupCallsPerLane","measurementCallsPerLane","setupBudgetMs","measurementWindowMs","drainGraceMs",
        "maxLedgerTransactionsPerOperation","arrivalIntervalMs"),"FULL_OFFERED_PLAN_FIELDS")
    _fields(r,("maxSamplesPerPhase","maxInFlightPerPhase"),"OFFERED_RECORDING_LIMITS")
    _integer(v["commandBudgetMs"],1000,60000,"COMMAND_BUDGET")
    _integer(v["closeBudgetMs"],6000,15000,"CLOSE_BUDGET")
    _integer(p["warmupCallsPerLane"],0,255,"WARMUP_BOUND")
    _integer(p["measurementCallsPerLane"],1,256,"MEASUREMENT_BOUND")
    for name in("setupBudgetMs","measurementWindowMs","drainGraceMs"):_integer(p[name],1,60000,"SOURCE_TIME_BOUND")
    _integer(p["arrivalIntervalMs"],1,1000,"ARRIVAL_BOUND")
    _integer(p["maxLedgerTransactionsPerOperation"],1,8,"LEDGER_BOUND")
    _integer(r["maxSamplesPerPhase"],1,4096,"RECORDING_SAMPLE_BOUND")
    _integer(r["maxInFlightPerPhase"],1,64,"RECORDING_IN_FLIGHT_BOUND")
    offers=(p["measurementWindowMs"]+p["arrivalIntervalMs"]-1)//p["arrivalIntervalMs"]
    per_lane=p["warmupCallsPerLane"]+offers
    prefix=len(lanes)*(1+p["warmupCallsPerLane"])*p["maxLedgerTransactionsPerOperation"]
    required=max(prefix,offers*p["maxLedgerTransactionsPerOperation"],2*len(lanes))
    require(p["measurementCallsPerLane"]==offers and per_lane<=256
        and p["setupBudgetMs"]+p["measurementWindowMs"]+p["drainGraceMs"]+v["closeBudgetMs"]<=60000
        and r["maxSamplesPerPhase"]>=required and len(lanes)<=r["maxInFlightPerPhase"]<=r["maxSamplesPerPhase"],
        "COMPLETE_FINITE_OFFERED_PLAN")
    return v


def finite_source_plan(value):
    """Exact scalar/object agreement target for the actual JS PLAN_DATA primitive."""
    v=capture_plan(value);p=v["plan"];n=len(v["laneIds"]);offers=p["measurementCallsPerLane"]
    calls=p["warmupCallsPerLane"]+offers
    prefix=n*(1+p["warmupCallsPerLane"])*p["maxLedgerTransactionsPerOperation"]
    measured=offers*p["maxLedgerTransactionsPerOperation"]
    return dict(offeredPlanDataVersion=1,scope="FINITE_SOURCE_PLAN_NOT_NATIVE_OR_STORAGE_ADMISSION",
        adapterPlan=p,ownerPlan=dict(p,closeGraceMs=v["closeBudgetMs"]),recordingLimits=v["recordingLimits"],
        laneCount=n,commandBudgetMs=v["commandBudgetMs"],closeBudgetMs=v["closeBudgetMs"],
        globalScheduledOffers=offers,serviceCallReservationPerLane=calls,serviceCallReservationAllLanes=n*calls,
        syntheticFundingUnitsPerLane=2*calls,fundingOriginalsReserved=n,warmupOriginalsReserved=n*p["warmupCallsPerLane"],
        measuredOriginalsAtMost=offers,prefixLedgerSlotsReserved=prefix,measuredLedgerSlotsReserved=measured,
        requiredSamplesPerPhase=max(prefix,measured,2*n),balanceBarrierCallsReserved=3*n,childProcessesReserved=2*n,
        cooperativeWholePlanBudgetMs=p["setupBudgetMs"]+p["measurementWindowMs"]+p["drainGraceMs"]+v["closeBudgetMs"],
        laneShareAssumedEqual=False,unusedReservationsReplayed=False,queueCapacity=0,actualEffectsExecuted=False,
        sourceAndPackagesAuthenticated=False,storageAdmissionQualified=False,nativeAllowanceGranted=False,
        osDeadlineGuaranteed=False,offeredRateQualified=False,sustainableCapacityQualified=False,productionQualified=False,authority="NONE")


def resource_plan(value):
    """Conservative full-envelope reservation; never a measured allocation."""
    v=capture_plan(value);p=v["plan"];n=len(v["laneIds"]);finite=finite_source_plan(v)
    calls=finite["serviceCallReservationPerLane"];writers=12*calls+64
    # Current offered owners publish aggregate recordings, not paced/timer traces.
    # Reserve their wrappers and every independent raw writer/attribution/command
    # field. No historical paced field or fabricated timing capsule is charged.
    scalar=131072
    per_lane=1024*writers+384*264+32768+65536
    capture=scalar+n*per_lane
    requested=((capture+65535)//65536)*65536
    stdout=min(requested,ENTRY_CAPTURE_CAP);stderr=MIB
    # Existing shared roots can allow more output than this particular plan.
    # Task.run's stderr cap follows STORE policy, not the per-command stdout
    # override. Always reserve its full 1 MiB ceiling for BOTH commands.
    openssl_stdout=16384;openssl_stderr=MIB
    streams=stdout+stderr+openssl_stdout+openssl_stderr
    profiles=(2*n+1)*PROFILE_CAP
    native_files=n*32*MIB
    aliases=n*32768
    receipts=MIB
    quota=((profiles+ENTRY_PLAN_CAP+native_files+streams+aliases+receipts+MIB-1)//MIB)*MIB
    timeout=(finite["cooperativeWholePlanBudgetMs"]+v["commandBudgetMs"]+999)//1000+20
    fits=requested<=ENTRY_CAPTURE_CAP
    return dict(resourcePlanVersion=4,offeredCaptureVersion=3,parentProfileVersion=8,childProfileVersion=6,
        workloadInputVersion=2,workloadPlanSha256=hashlib.sha256(canonical_bytes(v)).hexdigest(),
        sourceSelectionSha256=SOURCE_SELECTION_SHA256,parentProfileProducerSha256=PARENT_PROFILE_PRODUCER_SHA256,
        parentSourceRowsSha256=PARENT_SOURCE_SHA256,childSourceRowsSha256=CHILD_SOURCE_SHA256,
        parentApplicationFiles=172,parentPackageFiles=404,parentSourceRows=576,
        childApplicationFiles=163,childPackageFiles=404,childSourceRows=567,
        laneCount=n,totalCallsPerLane=calls,globalScheduledOffers=p["measurementCallsPerLane"],
        globalMeasuredOriginalsMaximum=p["measurementCallsPerLane"],fundingOriginalsMaximum=n,
        warmupOriginalsMaximum=n*p["warmupCallsPerLane"],fundedServiceCallsReservedAllLanes=n*calls,
        laneShareAssumedEqual=False,unusedReservationsReplayed=False,queueCapacity=0,
        sourceWriterRowsMaximum=n*writers,sourceWriterRowsPerLaneMaximum=writers,
        privateWriterAttributionRowsMaximum=n*writers,payerCommandRowsPerLaneMaximum=264,
        privateScalarRecordingBytesReserved=scalar,captureBytesReservedBeforeEntryCap=capture,
        requestedNodeStdoutLimit=requested,nodeStdoutLimit=stdout,nodeStderrLimit=stderr,
        opensslStdoutLimit=openssl_stdout,opensslStderrLimit=openssl_stderr,commandStreamsBytesReserved=streams,
        entryCaptureMaximum=ENTRY_CAPTURE_CAP,captureReservationFitsEntryCap=fits,
        privateProfileBytesReserved=profiles,entryPlanBytesReserved=ENTRY_PLAN_CAP,nativeFileBytesReserved=native_files,
        independentTlsAliasesBytesReserved=aliases,receiptBytesReserved=receipts,taskQuotaBytes=quota,expectedPeakBytesReserved=quota,
        minimumFreeBytes=MINIMUM_FREE_BYTES,safetyMarginBytes=SAFETY_MARGIN_BYTES,
        metadataStoreQuotaBytesReserved=METADATA_STORE_QUOTA_BYTES,
        requiredFreeBytesBeforeOtherReservations=MINIMUM_FREE_BYTES+SAFETY_MARGIN_BYTES+quota+METADATA_STORE_QUOTA_BYTES,
        otherTasksReservationsIncluded=False,nodeTimeoutSeconds=timeout,opensslTimeoutSeconds=20,
        nodeParentCommandsMaximum=1,nodeChildProcessesMaximum=2*n,opensslCommandsMaximum=1,maximumRuns=1,
        loopbackTcpConnectionsMaximum=n*(174+calls+2),externalNetwork=False,
        sqliteNewPathsMaximum=4*n,sqliteWalOrShmAllowed=False,independentPinFilesMaximum=2*n,
        inMemoryEd25519KeysMaximum=3*n,transactionSignaturesMaximum=n,capabilitySignaturesMaximum=n*calls,
        providerSignaturesMaximum=n,nonceCandidatesPerWindowMaximum=4096,nonceCandidatesTotalReserved=65536*n,
        testTlsKeyPairsMaximum=1,sourceCopiesRequired=0,packageCopiesRequired=0,
        privateCaptureCopiesRequired=1,fullCaptureJsonReserializationRequired=False,captureHeapByteBoundEstablished=False,
        oldPacedOrTimerTraceFabricated=False,parentAndChildClockDomainsAligned=False,
        captureOverflowPolicy="UNKNOWN_PRESERVE_COMPLETE_RECEIPTS_NO_RETRY",automaticRetry=False,
        automaticSampleReduction=False,childCreatedFilesAutomaticAdoption=False,childCreatedFilesAutomaticDeletion=False,
        cleanupMayRemainHold=True,actualStorageAdmissionQualified=False,diskQuotaOsEnforced=False,nativeOsNetworkSandbox=False,
        effectsExecuted=False,nativeAllowanceGranted=False,authority="NONE")


def storage_policy(value):
    """Minimum required production limits, not permission to rewrite a root."""
    r=resource_plan(value);require(r["captureReservationFitsEntryCap"],"FULL_OFFERED_CAPTURE_EXCEEDS_ENTRY_CAP")
    return dict(min_free_bytes=MINIMUM_FREE_BYTES,safety_margin_bytes=SAFETY_MARGIN_BYTES,
        task_quota_bytes=r["taskQuotaBytes"],scratch_quota_bytes=r["taskQuotaBytes"],store_quota_bytes=r["taskQuotaBytes"],
        metadata_quota_bytes=METADATA_STORE_QUOTA_BYTES,max_tasks=1,max_objects=128,max_commands_per_task=2,
        max_output_bytes=r["nodeStdoutLimit"],abandoned_after_seconds=86400,unreferenced_after_seconds=1209600)


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
        closeBudgetMs=v["closeBudgetMs"])
    raw = canonical_bytes(out)
    require(len(raw) <= ENTRY_PLAN_CAP, "ENTRY_PLAN_BYTE_CAP")
    return dict(plan=out, planBytes=raw, planSha256=hashlib.sha256(raw).hexdigest(),
        planBytesCount=len(raw), profileReferencesAuthenticated=False, rootIndependenceAuthenticated=False,
        nativeExecuted=False, authority="NONE")
