"""Independent paced-envelope v2 arithmetic: DATA only, no native entry.

Reconstruct every genuine parent, queue and source-recorder summary directly
from the single raw capsule. Never import/replay JavaScript, forge an old R4
envelope, replace its context or copy the complete capture tree. Caller source
and run expectations remain declarations, not native authentication.
"""
import re

HASH = re.compile(r"[0-9a-f]{64}")
LANE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}")
NS = re.compile(r"(?:0|[1-9][0-9]{0,38})")
PHASES = ("FUNDING", "FUNDED_CALL", "LEDGER_TRANSACTION")
BASE_FIELDS = ("capacityRecorderVersion", "scope", "clock", "percentileMethod", "recordingState",
    "recordingIssue", "stopReason", "limits", "refusedStarts", "pendingObservations", "observedSpanNanoseconds",
    "phases", "ledgerBalanceChecks", "capacityQualification", "ledgerCorrectness", "authenticatedExecution",
    "liveOrProduction", "authority")


def require(value, code):
    if not value:
        raise ValueError(code)


def fields(value, names, code):
    require(type(value) is dict and set(value) == set(names), code)


def integer(value, lower, upper, code):
    require(type(value) is int and lower <= value <= upper, code)


def nanoseconds(value):
    require(type(value) is str and NS.fullmatch(value) and int(value) < 2**128, "CANONICAL_BOUNDED_NANOSECONDS")
    return int(value)


def same(actual, expected):
    """Strict structural equality, without serializing/copying the JSON tree."""
    if type(actual) is not type(expected):
        return False
    if type(expected) is dict:
        return actual.keys() == expected.keys() and all(same(actual[k], v) for k, v in expected.items())
    if type(expected) is list:
        return len(actual) == len(expected) and all(same(a, b) for a, b in zip(actual, expected))
    return actual == expected


def bounded(value):
    nodes = 0
    def visit(v, depth):
        nonlocal nodes
        nodes += 1
        require(nodes <= 1000000 and depth <= 32, "BOUNDED_CAPTURE_TREE")
        if v is None or type(v) is bool:
            return
        if type(v) is int:
            integer(v, -(2**53 - 1), 2**53 - 1, "SAFE_CAPTURE_INTEGER")
            return
        if type(v) is str:
            require(len(v) <= 65536 and all(32 <= ord(c) <= 126 for c in v), "BOUNDED_ASCII_CAPTURE")
            return
        if type(v) is list:
            require(len(v) <= 30000, "BOUNDED_CAPTURE_ARRAY")
            for item in v:
                visit(item, depth + 1)
            return
        require(type(v) is dict and len(v) <= 64, "EXACT_CAPTURE_OBJECT")
        for key, item in v.items():
            require(type(key) is str and 1 <= len(key) <= 256 and all(32 <= ord(c) <= 126 for c in key),
                "EXACT_CAPTURE_KEY")
            visit(item, depth + 1)
    visit(value, 0)


def metric(values):
    if not values:
        return dict(samples=0, min=None, p50=None, p95=None, p99=None, max=None)
    ordered = sorted(values)
    def rank(p):
        return str(ordered[(len(ordered) * p - 1) // 100])
    return dict(samples=len(ordered), min=str(ordered[0]), p50=rank(50), p95=rank(95),
        p99=rank(99), max=str(ordered[-1]))


def series():
    return dict(entered=0, settled=0, active=0, peak=0, succeeded=0, rejected=0,
        all=[], success=None, first=None, last=None)


def touch(s, at):
    if s["first"] is None:
        s["first"] = at
    s["last"] = at


def begin(s, at):
    s["entered"] += 1
    s["active"] += 1
    s["peak"] = max(s["peak"], s["active"])
    touch(s, at)


def terminal(s, start, at, outcome):
    require(at >= start and s["active"] > 0, "SERIES_TERMINAL_ORDER")
    elapsed = at - start
    if outcome == "REJECTED" and s["success"] is None:
        s["success"] = s["all"].copy()
    elif outcome == "SUCCEEDED" and s["success"] is not None:
        s["success"].append(elapsed)
    s["all"].append(elapsed)
    s["settled"] += 1
    s["active"] -= 1
    s["succeeded" if outcome == "SUCCEEDED" else "rejected"] += 1
    touch(s, at)


def phase(s):
    all_values = metric(s["all"])
    successes = all_values if s["success"] is None else metric(s["success"])
    return dict(entered=s["entered"], settled=s["settled"], pending=s["active"], succeeded=s["succeeded"],
        rejected=s["rejected"], unknown=0, peakInFlight=s["peak"],
        nonSuccessFraction=dict(numerator=s["rejected"], denominator=s["settled"]) if s["settled"] else None,
        terminalLatencyNanoseconds=all_values, successfulLatencyNanoseconds=successes)


def base_report(s, limits):
    return dict(capacityRecorderVersion=1, scope="CALLER_DECLARED_OBSERVATIONS_ONLY",
        clock="CALLER_SUPPLIED_MONOTONIC_NANOSECONDS", percentileMethod="NEAREST_RANK",
        recordingState="COMPLETE" if s["entered"] else "EMPTY", recordingIssue=None, stopReason=None,
        limits=limits, refusedStarts=0, pendingObservations=0,
        observedSpanNanoseconds=None if s["first"] is None else str(s["last"] - s["first"]),
        phases=dict(FUNDING=phase(series()), FUNDED_CALL=phase(s), LEDGER_TRANSACTION=phase(series())),
        ledgerBalanceChecks=dict(samples=0, mismatches=0, result="NOT_RECORDED"),
        capacityQualification="NOT_ESTABLISHED", ledgerCorrectness="NOT_ESTABLISHED",
        authenticatedExecution=False, liveOrProduction=False, authority="NONE")


def declared_post_stop(value, limits):
    fields(value, BASE_FIELDS, "POST_STOP_FIELDS")
    flags = dict(capacityRecorderVersion=1, scope="CALLER_DECLARED_OBSERVATIONS_ONLY",
        clock="CALLER_SUPPLIED_MONOTONIC_NANOSECONDS", percentileMethod="NEAREST_RANK",
        recordingIssue=None, stopReason=None, limits=limits, refusedStarts=0, pendingObservations=0,
        ledgerBalanceChecks=dict(samples=0, mismatches=0, result="NOT_RECORDED"),
        capacityQualification="NOT_ESTABLISHED", ledgerCorrectness="NOT_ESTABLISHED",
        authenticatedExecution=False, liveOrProduction=False, authority="NONE")
    require(all(same(value[k], v) for k, v in flags.items()), "POST_STOP_DECLARATION")
    groups = value["phases"]
    fields(groups, PHASES, "POST_STOP_PHASES")
    require(same(groups["FUNDING"], phase(series())) and same(groups["FUNDED_CALL"], phase(series())),
        "POST_STOP_ONLY_LEDGER")
    q = groups["LEDGER_TRANSACTION"]
    fields(q, tuple(phase(series())), "POST_STOP_LEDGER_FIELDS")
    for name in ("entered", "succeeded", "rejected"):
        integer(q[name], 0, limits["maxSamplesPerPhase"] if name == "entered" else q["entered"], "POST_STOP_COUNT")
    integer(q["peakInFlight"], 1 if q["entered"] else 0, min(q["entered"], limits["maxInFlightPerPhase"]), "POST_STOP_PEAK")
    require(same(q["settled"], q["entered"]) and same(q["pending"], 0) and same(q["unknown"], 0)
        and q["succeeded"] + q["rejected"] == q["entered"], "POST_STOP_OUTCOMES")
    require(same(q["nonSuccessFraction"], dict(numerator=q["rejected"], denominator=q["entered"]) if q["entered"] else None),
        "POST_STOP_FRACTION")
    span = nanoseconds(value["observedSpanNanoseconds"]) if q["entered"] else None
    require(same(value["recordingState"], "COMPLETE" if q["entered"] else "EMPTY")
        and (q["entered"] or value["observedSpanNanoseconds"] is None), "POST_STOP_SPAN")
    for name, count in (("terminalLatencyNanoseconds", q["entered"]), ("successfulLatencyNanoseconds", q["succeeded"])):
        h = q[name]
        fields(h, ("samples", "min", "p50", "p95", "p99", "max"), "POST_STOP_METRIC_FIELDS")
        require(same(h["samples"], count), "POST_STOP_METRIC_COUNT")
        if not count:
            require(same(h, metric([])), "POST_STOP_EMPTY_METRIC")
        else:
            values = [nanoseconds(h[k]) for k in ("min", "p50", "p95", "p99", "max")]
            require(values == sorted(values) and values[-1] <= span, "POST_STOP_DECLARED_METRIC_BOUND")
    return q["entered"]


def parent_trace_data(trace, recording, expected_limits):
    """New raw-trace API; no R4 context envelope is constructed or rewritten."""
    fields(trace,("parentTimingTraceVersion","scope","clockDomain","limits","unknown","maximumEvents","events",
        "rawIdentifiersIncluded","postStopLedgerTraceIncluded","nativeEventsAuthenticated","nativeResourcesQualified",
        "sustainableCapacityQualified","authority"),"PARENT_TRACE_FIELDS")
    integer(trace["parentTimingTraceVersion"],1,1,"PARENT_TRACE_VERSION")
    require(trace["scope"]=="PRIVATE_PARENT_RECORDER_EVENTS_NOT_NATIVE_AUTHENTICATION"
        and trace["clockDomain"]=="PARENT_MONOTONIC_RECORDER_EVENT_ORDER" and trace["unknown"]is False
        and all(trace[k]is False for k in("rawIdentifiersIncluded","postStopLedgerTraceIncluded",
            "nativeEventsAuthenticated","nativeResourcesQualified","sustainableCapacityQualified"))
        and trace["authority"]=="NONE","PARENT_TRACE_UNKNOWN_OR_AUTHORITY")
    limits=trace["limits"];fields(limits,("maxSamplesPerPhase","maxInFlightPerPhase"),"PARENT_LIMIT_FIELDS")
    integer(limits["maxSamplesPerPhase"],1,4096,"PARENT_SAMPLE_BOUND");integer(limits["maxInFlightPerPhase"],1,64,"PARENT_IN_FLIGHT_BOUND")
    require(limits["maxInFlightPerPhase"]<=limits["maxSamplesPerPhase"]
        and same(limits,expected_limits),"PARENT_PLAN_LIMIT_BINDING")
    integer(trace["maximumEvents"],7*limits["maxSamplesPerPhase"]+4,7*limits["maxSamplesPerPhase"]+4,"PARENT_EVENT_BOUND")
    rows=trace["events"];require(type(rows)is list and 1<=len(rows)<=trace["maximumEvents"],"PARENT_EVENT_ARRAY")
    phases=("FUNDING","FUNDED_CALL","LEDGER_TRANSACTION");cohort_names=("WARMUP","MEASUREMENT")
    def count():return dict(settled=0,succeeded=0,rejected=0,unknown=0)
    lanes={name:dict(entered=0,active=0,peak=0,windowPeak=0,warmupActive=0,measuredActive=0,warmupAtStart=0,
        warmupAtStop=0,measuredAtStop=0,warmupInside=count(),measuredInside=count(),warmupAfter=count(),measuredAfter=count())for name in phases}
    cohorts={name:dict(phases={phase:dict(entered=0,settled=0,succeeded=0,rejected=0,active=0,peak=0,
        all=[],success=[])for phase in phases},first=None,last=None,balances=0)for name in cohort_names}
    stages={name:dict(samples=0,mismatches=0)for name in("WARMUP","MEASURING","DRAINING")}
    stage="CREATED";run_start=warmup_start=start=stop=ended=previous=None;observation=balance_checks=0;active={}
    def tick(meta,at):
        if meta["first"]is None:meta["first"]=at
        meta["last"]=at
    for index,row in enumerate(rows):
        require(type(row)is dict,"PARENT_EVENT_OBJECT")
        integer(row.get("sequence"),index+1,index+1,"PARENT_EVENT_SEQUENCE");require(ended is None,"PARENT_EVENT_AFTER_FINALIZE")
        at=nanoseconds(row.get("atNs"));kind=row.get("kind")
        require(previous is None or previous<=at,"PARENT_EVENT_CLOCK_ORDER");previous=at
        if kind=="START_WARMUP":
            fields(row,("sequence","kind","atNs"),"PARENT_BOUNDARY_FIELDS");require(stage=="CREATED","PARENT_WARMUP_ORDER")
            warmup_start=run_start=at;stage="WARMUP"
        elif kind=="START_MEASUREMENT":
            fields(row,("sequence","kind","atNs"),"PARENT_BOUNDARY_FIELDS");require(stage in("CREATED","WARMUP"),"PARENT_START_ORDER")
            if run_start is None:run_start=at
            start=at;stage="MEASURING"
            for lane in lanes.values():lane["warmupAtStart"]=lane["warmupActive"];lane["windowPeak"]=lane["active"]
        elif kind=="STOP_MEASUREMENT":
            fields(row,("sequence","kind","atNs"),"PARENT_BOUNDARY_FIELDS");require(stage=="MEASURING"and at>start,"PARENT_STOP_ORDER")
            stop=at;stage="DRAINING"
            for lane in lanes.values():lane["warmupAtStop"]=lane["warmupActive"];lane["measuredAtStop"]=lane["measuredActive"]
        elif kind=="BEGIN":
            fields(row,("sequence","kind","observation","phase","cohort","atNs"),"PARENT_BEGIN_FIELDS")
            cohort="WARMUP"if stage=="WARMUP"else"MEASUREMENT"
            require(stage in("WARMUP","MEASURING")and type(row["phase"])is str and row["phase"]in phases
                and row["cohort"]==cohort,"PARENT_BEGIN_COHORT")
            integer(row["observation"],observation+1,observation+1,"PARENT_BEGIN_ORDINAL")
            lane=lanes[row["phase"]];group=cohorts[cohort]["phases"][row["phase"]]
            require(lane["entered"]<limits["maxSamplesPerPhase"]and lane["active"]<limits["maxInFlightPerPhase"],"PARENT_PHASE_CAPACITY")
            observation+=1;lane["entered"]+=1;lane["active"]+=1;group["entered"]+=1;group["active"]+=1
            lane["warmupActive"if cohort=="WARMUP"else"measuredActive"]+=1
            lane["peak"]=max(lane["peak"],lane["active"]);group["peak"]=max(group["peak"],group["active"])
            if stage=="MEASURING":lane["windowPeak"]=max(lane["windowPeak"],lane["active"])
            tick(cohorts[cohort],at);active[observation]=dict(at=at,phase=row["phase"],cohort=cohort)
        elif kind=="FINISH":
            fields(row,("sequence","kind","observation","outcome","atNs"),"PARENT_FINISH_FIELDS")
            integer(row["observation"],1,3*limits["maxSamplesPerPhase"],"PARENT_FINISH_ORDINAL")
            require(row["observation"]in active and row["outcome"]in("SUCCEEDED","REJECTED"),"PARENT_FINISH_UNKNOWN_OR_DUPLICATE")
            begun=active.pop(row["observation"]);lane=lanes[begun["phase"]];meta=cohorts[begun["cohort"]];group=meta["phases"][begun["phase"]]
            lane["active"]-=1;group["active"]-=1;group["settled"]+=1;lane["warmupActive"if begun["cohort"]=="WARMUP"else"measuredActive"]-=1
            elapsed=at-begun["at"];group["all"].append(elapsed)
            if row["outcome"]=="SUCCEEDED":group["succeeded"]+=1;group["success"].append(elapsed)
            else:group["rejected"]+=1
            tick(meta,at)
            if stage in("MEASURING","DRAINING"):
                key=("warmup"if begun["cohort"]=="WARMUP"else"measured")+("Inside"if stage=="MEASURING"else"After")
                lane[key]["settled"]+=1;lane[key]["succeeded"if row["outcome"]=="SUCCEEDED"else"rejected"]+=1
        elif kind=="BALANCE_CHECK":
            fields(row,("sequence","kind","matches","atNs"),"PARENT_BALANCE_FIELDS")
            require(stage in stages and row["matches"]is True and balance_checks<limits["maxSamplesPerPhase"],"PARENT_BALANCE_UNKNOWN")
            balance_checks+=1;stages[stage]["samples"]+=1;cohorts["WARMUP"if stage=="WARMUP"else"MEASUREMENT"]["balances"]+=1
        elif kind=="FINALIZE":
            fields(row,("sequence","kind","atNs"),"PARENT_BOUNDARY_FIELDS")
            require(stage=="DRAINING"and not active and index==len(rows)-1,"PARENT_FINALIZATION_PENDING_OR_ORDER");ended=at
        else:raise ValueError("PARENT_EVENT_KIND")
    require(ended is not None and start is not None and stop is not None,"PARENT_COMPLETE_WINDOW")
    def metric(values):
        if not values:return dict(samples=0,min=None,p50=None,p95=None,p99=None,max=None)
        ordered=sorted(values)
        def rank(p):return str(ordered[(len(ordered)*p-1)//100])
        return dict(samples=len(ordered),min=str(ordered[0]),p50=rank(50),p95=rank(95),p99=rank(99),max=str(ordered[-1]))
    summaries={};phase_summaries={}
    for cohort in cohort_names:
        meta=cohorts[cohort];entries=0;phase_rows={}
        for name in phases:
            g=meta["phases"][name];entries+=g["entered"]
            phase_rows[name]=dict(entered=g["entered"],settled=g["settled"],pending=0,succeeded=g["succeeded"],rejected=g["rejected"],unknown=0,
                peakInFlight=g["peak"],nonSuccessFraction=None if g["settled"]==0 else dict(numerator=g["rejected"],denominator=g["settled"]),
                terminalLatencyNanoseconds=metric(g["all"]),successfulLatencyNanoseconds=metric(g["success"]))
        summaries[cohort]=dict(capacityRecorderVersion=1,scope="CALLER_DECLARED_OBSERVATIONS_ONLY",clock="CALLER_SUPPLIED_MONOTONIC_NANOSECONDS",
            percentileMethod="NEAREST_RANK",recordingState="EMPTY"if entries==0 else"COMPLETE",recordingIssue=None,stopReason=None,limits=limits,
            refusedStarts=0,pendingObservations=0,observedSpanNanoseconds=None if meta["first"]is None else str(meta["last"]-meta["first"]),phases=phase_rows,
            ledgerBalanceChecks=dict(samples=meta["balances"],mismatches=0,result="NOT_RECORDED"if meta["balances"]==0 else"MATCHES_CALLER_DECLARED_EXPECTATIONS"),
            capacityQualification="NOT_ESTABLISHED",ledgerCorrectness="NOT_ESTABLISHED",authenticatedExecution=False,liveOrProduction=False,authority="NONE")
    for name in phases:
        lane=lanes[name];measured=cohorts["MEASUREMENT"]["phases"][name]
        rate="NO_MEASUREMENT_STARTS"if measured["entered"]==0 else"OBSERVED_WINDOW_RATIO_ONLY"
        phase_summaries[name]=dict(enteredAcrossCohorts=lane["entered"],peakInFlightAcrossCohorts=lane["peak"],peakInFlightDuringMeasurement=lane["windowPeak"],
            warmupInFlightAtStart=lane["warmupAtStart"],warmupInFlightAtStop=lane["warmupAtStop"],measurementInFlightAtStop=lane["measuredAtStop"],
            warmupTerminalsDuringMeasurement=lane["warmupInside"],measurementTerminalsDuringMeasurement=lane["measuredInside"],
            warmupTerminalsAfterMeasurement=lane["warmupAfter"],measurementTerminalsAfterMeasurement=lane["measuredAfter"],
            successfulWindowCompletionRatio=None if rate=="NO_MEASUREMENT_STARTS"else dict(numerator=str(lane["measuredInside"]["succeeded"]*10**9),
                denominator=str(stop-start),unit="CALLER_OBSERVED_SUCCESSFUL_COMPLETIONS_PER_SECOND"),rateStatus=rate)
    expected=dict(capacityWindowRecorderVersion=1,scope="CALLER_DECLARED_BOUNDARIES_NOT_BENCHMARK_EXECUTION",boundaryOrder="EXPLICIT_CALL_ORDER_ON_NONDECREASING_TIMESTAMPS",
        recordingState="EMPTY"if observation==0 else"COMPLETE",recordingIssue=None,stopReason=None,limits=limits,refusedStarts=0,pendingObservations=0,
        warmupNanoseconds=None if warmup_start is None else str(start-warmup_start),measurementNanoseconds=str(stop-start),drainNanoseconds=str(ended-stop),
        runNanoseconds=str(ended-run_start),phases=phase_summaries,cohorts=summaries,
        ledgerBalanceChecks=dict(samples=balance_checks,mismatches=0,stages=stages,expectedBalances="CALLER_DECLARED_NOT_AUTHENTICATED"),
        capacityQualification="NOT_ESTABLISHED",sustainableThroughput="NOT_ESTABLISHED",nativeClockAuthenticated=False,physicalDrainQualified=False,liveOrProduction=False,authority="NONE")
    require(type(recording)is dict and same(recording,expected),"PARENT_ALL_RECORDER_FIELDS_MISMATCH")
    result=dict(parentTimingTraceDataVersion=1,status="COMPLETE_MATCHING_DECLARED_PARENT_TRACE_DATA",eventsChecked=len(rows),observationsChecked=observation,
        measurementNanoseconds=str(stop-start),allPhaseSummariesRecomputed=True,rawIdentifiersIncluded=False,parentAndChildClocksSubtracted=False,
        postStopLedgerTraceQualified=False,nativeEventsAuthenticated=False,nativeResourcesQualified=False,sustainableCapacityQualified=False,authority="NONE")
    return result


def validate_paced_timing_envelope_data(capsule, report, expected):
    """Check v2 single-copy timing DATA against INDEPENDENT caller expectations.

    Not a full native command/child/writer validator, receipt authenticator or
    timing benchmark. Unknown/HELD/mismatched capsules refuse, never upgrade.
    Timer events and post-stop duration series remain declared, not recomputed.
    """
    bounded(dict(capsule=capsule, report=report, expected=expected))
    fields(expected, ("plan", "recordingLimits", "laneIds", "minimumStartGapMs", "runId",
        "parentSourceRowsSha256", "childSourceRowsSha256"), "INDEPENDENT_EXPECTATION_FIELDS")
    for key in ("runId", "parentSourceRowsSha256", "childSourceRowsSha256"):
        require(type(expected[key]) is str and HASH.fullmatch(expected[key]), "EXPECTED_RUN_SOURCE_DIGEST")
    require(expected["parentSourceRowsSha256"] != expected["childSourceRowsSha256"], "DISTINCT_PARENT_CHILD_SOURCE")
    ids = expected["laneIds"]
    require(type(ids) is list and 1 <= len(ids) <= 16 and all(type(k) is str and LANE.fullmatch(k) for k in ids)
        and len(set(ids)) == len(ids), "INDEPENDENT_LANES")
    count = len(ids)
    plan, limits, gap = expected["plan"], expected["recordingLimits"], expected["minimumStartGapMs"]
    fields(plan, ("warmupCallsPerLane", "measurementCallsPerLane", "setupBudgetMs", "measurementWindowMs",
        "drainGraceMs", "maxLedgerTransactionsPerOperation"), "INDEPENDENT_PLAN_FIELDS")
    fields(limits, ("maxSamplesPerPhase", "maxInFlightPerPhase"), "INDEPENDENT_LIMIT_FIELDS")
    for key, low, high in (("warmupCallsPerLane", 0, 256), ("measurementCallsPerLane", 1, 256),
            ("setupBudgetMs", 1, 60000), ("measurementWindowMs", 1, 60000), ("drainGraceMs", 1, 1000),
            ("maxLedgerTransactionsPerOperation", 1, 16)):
        integer(plan[key], low, high, "INDEPENDENT_PLAN_BOUND")
    integer(limits["maxSamplesPerPhase"], 1, 4096, "INDEPENDENT_SAMPLE_BOUND")
    integer(limits["maxInFlightPerPhase"], 1, 64, "INDEPENDENT_IN_FLIGHT_BOUND")
    integer(gap, 1, 1000, "INDEPENDENT_GAP_BOUND")
    require(limits["maxInFlightPerPhase"] <= limits["maxSamplesPerPhase"]
        and count <= limits["maxInFlightPerPhase"] and 3 * count <= limits["maxSamplesPerPhase"]
        and (1 + plan["warmupCallsPerLane"] + plan["measurementCallsPerLane"]) * count
            * plan["maxLedgerTransactionsPerOperation"] <= limits["maxSamplesPerPhase"], "INDEPENDENT_RECORDING_CAPACITY")
    fields(capsule, ("pacedTimingCaptureVersion", "context", "trace", "check", "parentCheck", "parentTraceLocation", "status"),
        "EXACT_V2_ENVELOPE")
    require(same(capsule["pacedTimingCaptureVersion"], 2)
        and capsule["parentTraceLocation"] == "trace.coreParentTimingTrace"
        and capsule["status"] == "MATCHING_DECLARED_PACED_TRACE", "V2_UNKNOWN_OR_WRONG_LAYOUT")
    context = dict(runId=expected["runId"], sourceRowsSha256=expected["parentSourceRowsSha256"],
        childSourceRowsSha256=expected["childSourceRowsSha256"], laneIds=ids)
    require(same(capsule["context"], context), "INDEPENDENT_RUN_SOURCE_LANE_BINDING")
    t, r = capsule["trace"], report
    fields(t, ("pacedTimingTraceVersion", "scope", "clockDomain", "limits", "laneCount", "minimumStartGapMs",
        "maximumEvents", "unknown", "events", "coreParentTimingTrace", "rawIdentifiersIncluded",
        "additionalClockReads", "nativeEventsAuthenticated", "nativeResourcesQualified", "sustainableCapacityQualified", "authority"),
        "PACED_TRACE_FIELDS")
    flags = dict(pacedTimingTraceVersion=1, scope="PRIVATE_PACED_PARENT_SOURCE_DATA_NOT_NATIVE_AUTHENTICATION",
        clockDomain="PARENT_MONOTONIC_SHARED_WITH_CORE_NOT_CHILD_OR_SQL", limits=limits, laneCount=count,
        minimumStartGapMs=gap, maximumEvents=4 * limits["maxSamplesPerPhase"] + 1, unknown=False,
        rawIdentifiersIncluded=False, additionalClockReads=0, nativeEventsAuthenticated=False,
        nativeResourcesQualified=False, sustainableCapacityQualified=False, authority="NONE")
    require(all(same(t[k], v) for k, v in flags.items()), "PACED_TRACE_CONTEXT_OR_UNKNOWN")
    fields(r, ("pacedCapacityWorkloadOwnerVersion", "scope", "outcome", "issue", "minimumStartGapMs", "pacingAppliesTo",
        "pacingModel", "requestedMeasuredCalls", "sourceExecuteEntries", "preEntryWithheld", "pendingQueuedCalls",
        "pendingSourceObservations", "peakQueuedCalls", "pacingTimersStarted", "maximumLivePacingTimers",
        "coreLatenciesIncludePacingWait", "sourceLatencyExcludesPacingWait", "queueWaitRecording", "dispatchedCallRecording",
        "core", "nativeEventsAuthenticated", "nativeResourcesQualified", "fixedOfferedRateQualified",
        "sustainableCapacityQualified", "productionQualified", "authority"), "PACED_REPORT_FIELDS")
    flags = dict(pacedCapacityWorkloadOwnerVersion=1, scope="TRUSTED_PACED_SOURCE_LANES_NOT_NATIVE_QUALIFICATION",
        outcome="OBSERVED_OWNERS_RETURNED", issue=None, minimumStartGapMs=gap, pacingAppliesTo="MEASUREMENT_ONLY",
        pacingModel="CLOSED_LOOP_MINIMUM_GAP_NO_CATCHUP_NOT_FIXED_OFFERED_RATE", pendingQueuedCalls=0,
        pendingSourceObservations=0, maximumLivePacingTimers=1, coreLatenciesIncludePacingWait=True,
        sourceLatencyExcludesPacingWait=True, nativeEventsAuthenticated=False, nativeResourcesQualified=False,
        fixedOfferedRateQualified=False, sustainableCapacityQualified=False, productionQualified=False, authority="NONE")
    require(all(same(r[k], v) for k, v in flags.items()), "PACED_REPORT_UNKNOWN_OR_AUTHORITY")
    for key in ("requestedMeasuredCalls", "sourceExecuteEntries", "preEntryWithheld"):
        integer(r[key], 0, limits["maxSamplesPerPhase"], "PACED_REPORT_COUNTER")
    integer(r["peakQueuedCalls"], 0, count, "PACED_QUEUE_PEAK")
    integer(r["pacingTimersStarted"], 0, r["requestedMeasuredCalls"], "DECLARED_TIMER_BOUND")
    core = r["core"]
    fields(core, ("capacityWorkloadOwnerVersion", "scope", "outcome", "reason", "uncertainty", "measurementStatus", "plan",
        "plannedCallsCompleted", "laneCount", "pendingOperations", "pendingLedgerBoundaries", "returnedCloses",
        "unknownCloses", "pendingCloses", "balanceBarriersObserved", "pendingBalanceReads", "balanceBarrierPending",
        "balanceReadAttempts", "completedBalanceBarriers", "pendingWindowStarts", "pendingWindowStops",
        "windowOpenBarrierPending", "windowStartsObserved", "windowStopsObserved", "windowHandoffContract",
        "measurementWindowIsolationQualified", "balanceContract", "recording", "postStopLedgerRecording",
        "ledgerBoundariesStarted", "nativeClockAuthenticated", "nativeResourcesQualified", "benchmarkQualified",
        "capacityQualified", "authority"), "INNER_CORE_FIELDS")
    flags = dict(capacityWorkloadOwnerVersion=3, scope="TRUSTED_WINDOWED_ASYNC_SOURCE_LANES_NOT_NATIVE_QUALIFICATION",
        outcome="OBSERVED_OWNERS_RETURNED", uncertainty=None, measurementStatus="OBSERVED_COMPONENT_ONLY",
        plan=plan, laneCount=count, returnedCloses=count, unknownCloses=0, pendingCloses=0, pendingOperations=0,
        pendingLedgerBoundaries=0, pendingBalanceReads=0, balanceBarrierPending=False, balanceReadAttempts=3 * count,
        completedBalanceBarriers=3, pendingWindowStarts=0, pendingWindowStops=0, windowOpenBarrierPending=False,
        windowStartsObserved=count, windowStopsObserved=count,
        windowHandoffContract="GENUINE_PROMISE_SERVICE_CHILD_MARKERS_NOT_PARENT_CLOCK_ALIGNMENT",
        balanceContract="GENUINE_PROMISE_FRESH_READ_NOT_SYNC_CACHE", measurementWindowIsolationQualified=False,
        nativeClockAuthenticated=False, nativeResourcesQualified=False, benchmarkQualified=False, capacityQualified=False, authority="NONE")
    require(all(same(core[k], v) for k, v in flags.items())
        and core["reason"] in ("PLAN_COMPLETE", "MANUAL_MEASUREMENT_STOP", "MEASUREMENT_WINDOW_ELAPSED"), "INNER_CORE_UNKNOWN_OR_PLAN")
    parent = parent_trace_data(t["coreParentTimingTrace"], core["recording"], limits)
    require(same(capsule["parentCheck"], parent), "PARENT_CHECK_NOT_INDEPENDENTLY_MATCHED")
    require(same(core["balanceBarriersObserved"], core["recording"]["ledgerBalanceChecks"]["samples"]), "INNER_BALANCE_COUNTER")
    integer(core["ledgerBoundariesStarted"], 0, limits["maxSamplesPerPhase"], "INNER_LEDGER_COUNTER")
    post = declared_post_stop(core["postStopLedgerRecording"], limits)
    require(core["ledgerBoundariesStarted"] == core["recording"]["phases"]["LEDGER_TRANSACTION"]["enteredAcrossCohorts"] + post,
        "POST_STOP_LEDGER_COUNT_CORRELATION")

    core_begins, core_finishes, measured = [], {}, set()
    for row in t["coreParentTimingTrace"]["events"]:
        if row["kind"] == "BEGIN" and row["phase"] == "FUNDED_CALL" and row["cohort"] == "MEASUREMENT":
            core_begins.append(row); measured.add(row["observation"])
        elif row["kind"] == "FINISH" and row["observation"] in measured:
            core_finishes[row["observation"]] = row
    rows = t["events"]
    require(type(rows) is list and 1 <= len(rows) <= t["maximumEvents"], "PACED_EVENT_ARRAY")
    requests, occupied, ordinals, fifo = {}, {}, {}, []
    wait, source = series(), series()
    previous = last_start = None
    entries = withdrawn = peak = 0
    finalized = False
    def request(value):
        integer(value, 1, 4096, "PACED_REQUEST_ID")
        require(value in requests, "PACED_REQUEST_MISSING")
        return requests[value]
    for index, row in enumerate(rows):
        require(type(row) is dict and not finalized, "PACED_EVENT_AFTER_FINALIZE")
        integer(row.get("sequence"), index + 1, index + 1, "PACED_EVENT_SEQUENCE")
        at = None
        if "atNs" in row:
            at = nanoseconds(row["atNs"])
            require(previous is None or previous <= at, "PACED_CLOCK_ORDER")
            previous = at
        kind = row.get("kind")
        if kind == "REQUEST":
            fields(row, ("sequence", "kind", "request", "lane", "ordinal"), "PACED_REQUEST_FIELDS")
            integer(row["request"], len(requests) + 1, len(requests) + 1, "PACED_REQUEST_ORDER")
            integer(row["lane"], 0, count - 1, "PACED_LANE")
            integer(row["ordinal"], 0, plan["measurementCallsPerLane"] - 1, "PACED_ORIGINAL_ORDINAL")
            require(len(requests) < limits["maxSamplesPerPhase"] and row["lane"] not in occupied
                and row["ordinal"] == ordinals.get(row["lane"], 0) and row["request"] <= len(core_begins), "PACED_NONOVERLAP_AND_ORIGINAL")
            original = core_begins[row["request"] - 1]
            require(original["observation"] in core_finishes, "CORE_LOGICAL_FINISH_MISSING")
            finish = core_finishes[original["observation"]]
            requests[row["request"]] = dict(state="RESERVED", lane=row["lane"], begin=nanoseconds(original["atNs"]),
                finish=nanoseconds(finish["atNs"]), outcome=finish["outcome"])
            occupied[row["lane"]] = row["request"]
            ordinals[row["lane"]] = row["ordinal"] + 1
            fifo.append(row["request"]); require(len(fifo) <= count, "PACED_QUEUE_BOUND")
            peak = max(peak, len(fifo))
        elif kind == "WAIT_BEGIN":
            fields(row, ("sequence", "kind", "request", "atNs"), "WAIT_BEGIN_FIELDS")
            item = request(row["request"])
            require(item["state"] == "RESERVED" and item["begin"] <= at <= item["finish"], "WAIT_LOGICAL_BRACKET")
            item["state"] = "WAITING"; item["waitAt"] = at; begin(wait, at)
        elif kind == "DISPATCH":
            fields(row, ("sequence", "kind", "request", "atNs"), "DISPATCH_FIELDS")
            item = request(row["request"])
            require(item["state"] == "WAITING" and fifo and fifo.pop(0) == row["request"]
                and item["begin"] <= at <= item["finish"]
                and (last_start is None or at - last_start >= gap * 1000000), "FIFO_GAP_OR_DISPATCH_BRACKET")
            last_start = at; terminal(wait, item["waitAt"], at, "SUCCEEDED"); begin(source, at)
            item["sourceAt"] = at; item["state"] = "ENTERED"; entries += 1
        elif kind == "SOURCE_TERMINAL":
            fields(row, ("sequence", "kind", "request", "outcome", "atNs"), "SOURCE_TERMINAL_FIELDS")
            item = request(row["request"])
            require(item["state"] == "ENTERED" and row["outcome"] in ("SUCCEEDED", "REJECTED")
                and row["outcome"] == item["outcome"] and item["sourceAt"] <= at <= item["finish"], "SOURCE_TERMINAL_BRACKET")
            terminal(source, item["sourceAt"], at, row["outcome"])
            item["state"] = "DONE"; occupied.pop(item["lane"])
        elif kind == "WITHDRAW":
            fields(row, ("sequence", "kind", "request", "recordedWait", "atNs"), "WITHDRAW_FIELDS")
            item = request(row["request"])
            require(item["state"] in ("RESERVED", "WAITING") and type(row["recordedWait"]) is bool
                and row["recordedWait"] == (item["state"] == "WAITING") and fifo and fifo.pop(0) == row["request"]
                and item["begin"] <= at <= item["finish"] and item["outcome"] == "REJECTED", "WITHDRAW_FIFO_OR_BRACKET")
            if row["recordedWait"]:
                terminal(wait, item["waitAt"], at, "REJECTED")
            item["state"] = "WITHHELD"; occupied.pop(item["lane"]); withdrawn += 1
        else:
            fields(row, ("sequence", "kind"), "PACED_FINALIZE_FIELDS")
            require(kind == "FINALIZE" and index == len(rows) - 1, "PACED_FINALIZE_ORDER")
            finalized = True
    require(finalized and not fifo and not occupied and wait["active"] == source["active"] == 0
        and len(core_begins) == len(requests) == r["requestedMeasuredCalls"] and entries == r["sourceExecuteEntries"]
        and withdrawn == r["preEntryWithheld"] and peak == r["peakQueuedCalls"], "PACED_TERMINAL_COUNTERS")
    require(same(core["plannedCallsCompleted"], all(ordinals.get(i, 0) == plan["measurementCallsPerLane"] for i in range(count))),
        "PLANNED_CALLS_CORRELATION")
    require(same(r["queueWaitRecording"], base_report(wait, limits))
        and same(r["dispatchedCallRecording"], base_report(source, limits)), "ALL_QUEUE_SOURCE_RECORDER_FIELDS_MISMATCH")
    check = dict(pacedTimingTraceDataVersion=1, status="COMPLETE_MATCHING_DECLARED_PACED_TIMING_DATA",
        eventsChecked=len(rows), requestsChecked=len(requests), sourceEntriesChecked=entries, preEntryWithdrawalsChecked=withdrawn,
        queueAndSourceRecordersRecomputed=True, coreParentRecorderIndependentlyChecked=True, coreLogicalFundedCallsCrossBound=True,
        timerEventsIndependentlyRecomputed=False, postStopLedgerDurationSeriesRecomputed=False,
        callerExpectationsAuthenticated=False, runOrNativeSourceContextAuthenticated=False, nativeEventsAuthenticated=False,
        nativeResourcesQualified=False, sustainableCapacityQualified=False, authority="NONE")
    require(same(capsule["check"], check), "PACED_CHECK_NOT_INDEPENDENTLY_MATCHED")
    return dict(pacedEnvelopeDataVersion=1, status="MATCHING_RECOMPUTED_PACED_V2_DATA",
        check=check, parentCheck=parent, entireInputTreeCopied=False, JavaScriptImportedOrReplayed=False,
        timerEventsIndependentlyRecomputed=False, postStopLedgerDurationSeriesRecomputed=False,
        callerExpectationsAuthenticated=False, nativeEventsAuthenticated=False, nativeResourcesQualified=False,
        sustainableCapacityQualified=False, productionQualified=False, authority="NONE")
