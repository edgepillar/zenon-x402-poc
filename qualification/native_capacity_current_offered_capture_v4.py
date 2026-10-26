"""Current packed offered V3 original outer capture DATA checks, never native proof.

One compact original frame is parsed once. Preserve every manager/child stream
before interpretation. Recompute current child writer attribution, original
command order and window metrics; do not import or relabel a paced/R4 envelope.
No process, SDK, SQL, filesystem, signing, nonce search or network runs here.
"""
import base64
import hashlib
import json
import math
import re

GRAPH_SHA="92646a2cf5edf717a1d24468fa6277c48c4f59f43db5b6e607b6071acc79c2b2"
PARENT_SHA="9c9681a1229d69824c4859c1bf9a57498bc5ed9a24755c63280e6b4b528bea5d"
HASH=re.compile(r"[0-9a-f]{64}")
NS=re.compile(r"(?:0|[1-9][0-9]{0,38})")
COHORTS=("CONTROL","WARMUP","MEASUREMENT")
WINDOW_CLASSES=("BEFORE","CROSSES_OPEN","INSIDE","CROSSES_STOP","CROSSES_BOTH","AFTER","TOUCHES_BOUNDARY")

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


def same(left, right):
    """Resource outputs exceed the workload parser's 32-field object limit."""
    pending = [(left, right, 0)]; count = 0
    while pending:
        a, b, depth = pending.pop(); count += 1
        require(count <= 16384 and depth <= 16, "BOUNDED_RESOURCE_COMPARISON")
        if type(a) is not type(b):
            return False
        if type(a) is dict:
            if len(a) > 512 or set(a) != set(b) or not all(type(k) is str for k in a):
                return False
            pending.extend((a[k], b[k], depth + 1) for k in a)
        elif type(a) is list:
            if len(a) > 1024 or len(a) != len(b):
                return False
            pending.extend((v, w, depth + 1) for v, w in zip(a, b))
        elif type(a) is str:
            if len(a) > 4096 or a != b:
                return False
        elif type(a) not in (int, bool) and a is not None:
            raise ValueError("EXACT_RESOURCE_DATA_TYPES")
        elif a != b:
            return False
    return True



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


def capture_tree_in_place(value):
    """Strict builtin DATA traversal, with no second object-graph copy."""
    nodes = 0
    def visit(v, depth):
        nonlocal nodes
        nodes += 1
        require(nodes <= 1500000 and depth <= 32, "BOUNDED_CAPTURE_TREE")
        if type(v) is dict:
            require(len(v) <= 64 and all(type(k) is str for k in v), "EXACT_CAPTURE_OBJECT")
            for key, item in v.items():
                visit(key, depth+1); visit(item, depth+1)
        elif type(v) is list:
            require(len(v) <= 100000, "BOUNDED_CAPTURE_ARRAY")
            for item in v: visit(item, depth+1)
        elif type(v) is str:
            require(len(v) <= 65536 and v.isascii() and "\0" not in v, "BOUNDED_CAPTURE_ASCII")
        elif type(v) is int:
            require(-(2**53-1) <= v <= 2**53-1, "CAPTURE_SAFE_INTEGER")
        else:
            require(v is None or type(v) is bool, "EXACT_CAPTURE_TYPES")
    visit(value, 0)

def closed_storage_data(closed, cleanup, store_id, task_id):
    require(type(store_id)is str and re.fullmatch(r"[0-9a-f]{32}",store_id)
        and type(task_id)is str and re.fullmatch(r"[0-9a-f]{32}",task_id),"EXPECTED_PRIVATE_STORE_AND_TASK_IDS")
    require(type(closed) is dict and all(type(closed.get(k))is str for k in("id","store_id","state","outcome"))
        and closed.get("id") == task_id and closed.get("store_id") == store_id
        and closed.get("state") == "CLOSED" and closed.get("outcome") == "SUCCESS", "OWNED_TASK_CLOSE_FAILURE_OR_UNKNOWN")
    require(type(cleanup) is dict and type(cleanup.get("mode"))is str and cleanup.get("mode") == "APPLY_OWNED_ONLY"
        and type(cleanup.get("tasks")) is list and len(cleanup["tasks"]) == 1
        and type(cleanup["tasks"][0])is dict and type(cleanup["tasks"][0].get("id"))is str
        and cleanup["tasks"][0].get("id") == task_id and type(cleanup.get("objects"))is list
        and len(cleanup["objects"])==0, "SCOPED_OWNED_CLEANUP_RECEIPT")
    decision = cleanup["tasks"][0].get("decision")
    require(type(decision)is str and decision in ("HOLD","CLEANED","ALREADY_CLEAN"), "STORAGE_CLEANUP_UNKNOWN")
    return dict(taskClosed=True,storageDecision=decision,storageCleanupQualified=False,
        childCreatedFilesAdopted=False,historicalCleanupPerformed=False,nativeResourcesQualified=False,authority="NONE")



def metric_summary(values):
    require(type(values)is list and len(values)<=3136 and all(type(v)is int and 0<=v<2**128 for v in values),"BOUNDED_METRIC_VALUES")
    if not values:
        return dict(samples=0,min=None,p50=None,p95=None,p99=None,max=None)
    ordered = sorted(values)
    def rank(percent):
        return str(ordered[(len(ordered)*percent+99)//100-1])
    return dict(samples=len(values),min=str(ordered[0]),p50=rank(50),p95=rank(95),p99=rank(99),max=str(ordered[-1]))

def require_metric(actual, values):
    fields(actual, ("samples","min","p50","p95","p99","max"), "EXACT_METRIC_FIELDS")
    integer(actual["samples"],0,3136,"METRIC_SAMPLE_COUNT")
    require(actual == metric_summary(values), "WHOLE_BRACKET_PERCENTILE_MISMATCH")

def classify_window(before, after, start, stop):
    # Match the actual SOURCE helper, including conservative equal endpoints.
    require(all(type(v)is int and 0<=v<2**128 for v in(before,after,start,stop)) and before<=after and start<stop,"BOUNDED_SAME_CLOCK_INTERVAL")
    if before in (start,stop) or after in (start,stop): return "TOUCHES_BOUNDARY"
    if after < start: return "BEFORE"
    if before > stop: return "AFTER"
    if before < start and after > stop: return "CROSSES_BOTH"
    if before < start: return "CROSSES_OPEN"
    if after > stop: return "CROSSES_STOP"
    return "INSIDE"

def validate_window_trace_data(row, evidence, pair, workload, expected_run_id):
    """Independently recompute private writer/attribution DATA, not native proof."""
    plan=workload["plan"]; total=plan["warmupCallsPerLane"]+plan["measurementCallsPerLane"]
    window=evidence["serviceMeasurementWindow"]
    fields(window,("windowVersion","context","clockDomain","phase","startNs","stopNs","stopCause","unknown","clockReads"),"PRIVATE_SERVICE_WINDOW_FIELDS")
    context=window["context"]; fields(context,("runId","laneId","sourceRowsSha256"),"PRIVATE_SERVICE_WINDOW_CONTEXT")
    require(context == dict(runId=expected_run_id,laneId=row["laneId"],sourceRowsSha256=GRAPH_SHA),
        "FRESH_RUN_LANE_AND_SOURCE_WINDOW_BINDING")
    integer(window["windowVersion"],1,1,"WINDOW_VERSION"); integer(window["clockReads"],2,4*(12*total+64)+2,"WINDOW_SOURCE_CLOCK_READ_BOUND")
    start,stop=nanoseconds(window["startNs"]),nanoseconds(window["stopNs"])
    require(window["clockDomain"]=="SERVICE_CHILD_LOCAL" and window["phase"]=="STOPPED" and window["stopCause"]=="PARENT_STOP"
        and window["unknown"]is False and start<stop,"WINDOW_OPEN_STOP_UNKNOWN")
    require(row.get("measurementUnknown")is False,"MEASUREMENT_MUST_NOT_UPGRADE_UNKNOWN")
    intervals=evidence["serviceWriterIntervals"]; attribution=evidence["serviceWriterAttribution"]
    require(type(attribution)is list and len(attribution)==len(intervals),"PRIVATE_WRITER_ATTRIBUTION_REQUIRED")
    # The real window owner reads only four writer hooks plus OPEN/STOP.
    # Equal-nanosecond event order is unknown, so retain a conservative range.
    before_stop=sum(nanoseconds(raw[k])<stop for raw in intervals for k in("beforeBeginNs","afterBeginNs","beforeCommitNs","afterCommitNs"))
    through_stop=sum(nanoseconds(raw[k])<=stop for raw in intervals for k in("beforeBeginNs","afterBeginNs","beforeCommitNs","afterCommitNs"))
    require(2+before_stop<=window["clockReads"]<=2+through_stop,"COMPLETE_WRITER_CLOCK_READ_CORRELATION")
    groups={name:{kind:dict(bracket=[],inside=[],changed=0)for kind in WINDOW_CLASSES}for name in COHORTS}
    originals={"WARMUP":0,"MEASUREMENT":0}; last_rank=-1; closed=False
    for ordinal,(raw,item)in enumerate(zip(intervals,attribution),1):
        fields(item,("ordinal","cohort","originalOrdinal","windowClass","changed","bracketElapsedNs","insideTransactionElapsedNs",
            "originalCommandDigest"),"PRIVATE_WRITER_ATTRIBUTION_FIELDS")
        integer(item["ordinal"],ordinal,ordinal,"WRITER_ATTRIBUTION_ORDINAL")
        require(type(item["cohort"])is str and item["cohort"]in COHORTS,"WRITER_ATTRIBUTION_COHORT")
        cohort=item["cohort"]
        if cohort=="CONTROL":
            require(raw["commandClass"]=="CONTROL" and item["originalOrdinal"]is None and item["originalCommandDigest"]is None,
                "CONTROL_CANNOT_INVENT_ORIGINAL")
            if last_rank>=0: closed=True
        else:
            completed=pair["warmupReserved"]if cohort=="WARMUP"else pair["measuredReserved"]
            integer(item["originalOrdinal"],0,completed-1,"UNOBSERVED_ORIGINAL_ORDINAL")
            request=sha(("native-capacity-original-v1\0"+expected_run_id+"\0"+row["laneId"]+"\0"+cohort+"\0"+str(item["originalOrdinal"])).encode("ascii"))
            require(type(item["originalCommandDigest"])is str and HASH.fullmatch(item["originalCommandDigest"])
                and item["originalCommandDigest"]==request and raw["commandClass"]=="APPLICATION_ORIGINAL",
                "EXACT_ORIGINAL_COMMAND_BINDING")
            rank=item["originalOrdinal"]+(plan["warmupCallsPerLane"]if cohort=="MEASUREMENT"else 0)
            require(last_rank<=rank<=last_rank+1 and not(rank==last_rank and closed),"ORIGINAL_TRACE_ORDER_OR_REOPEN")
            if rank!=last_rank: originals[cohort]+=1; last_rank=rank; closed=False
        before,after=nanoseconds(raw["beforeBeginNs"]),nanoseconds(raw["afterCommitNs"])
        kind=classify_window(before,after,start,stop)
        require(item["windowClass"]==kind and type(item["changed"])is bool and item["changed"]is raw["changed"]
            and item["bracketElapsedNs"]==raw["bracketElapsedNs"]
            and item["insideTransactionElapsedNs"]==raw["insideTransactionElapsedNs"],"WHOLE_WRITER_ROW_CORRELATION")
        group=groups[cohort][kind]; group["bracket"].append(nanoseconds(raw["bracketElapsedNs"]))
        group["inside"].append(nanoseconds(raw["insideTransactionElapsedNs"]))
        if raw["changed"]:group["changed"]+=1
    require(originals==dict(WARMUP=pair["warmupReserved"],MEASUREMENT=pair["measuredReserved"]),"COMPLETED_ORIGINAL_TRACE_MISSING")
    trace=row.get("serviceChildWindowWriterTrace")
    fields(trace,("capacityWindowWriterTraceDataVersion","status","reason","pagesAccepted","acceptedIntervals","declaredIntervals",
        "cohortTraceStatus","matchedCompletedOriginals","clockDomain","declaredWindowElapsedNs","cohorts","boundaryEqualityPolicy",
        "wholeIntervalsNotClipped","rawIdentifiersIncluded","parentAndChildClocksSubtracted","nativeEventsAuthenticated",
        "nativeResourcesQualified","measurementWindowIsolationQualified","pureSqlLatencyQualified","sustainableCapacityQualified","authority"),"WINDOW_TRACE_SUMMARY_FIELDS")
    pages=(len(intervals)+63)//64
    for name,value in (("capacityWindowWriterTraceDataVersion",1),("pagesAccepted",pages),("acceptedIntervals",len(intervals)),
        ("declaredIntervals",len(intervals)),("matchedCompletedOriginals",pair["completed"])):
        integer(trace[name],value,value,"EXACT_WINDOW_TRACE_COUNTER")
    integer(row.get("timingPages"),pages,pages,"EXACT_WINDOW_PAGE_COUNT")
    require(trace["status"]=="COMPLETE_DECLARED_WINDOW_TRACE_DATA" and trace["reason"]is None
        and trace["cohortTraceStatus"]=="COMPLETE_DECLARED_TRACE_DATA" and trace["clockDomain"]=="SERVICE_CHILD_LOCAL"
        and trace["declaredWindowElapsedNs"]==str(stop-start) and trace["wholeIntervalsNotClipped"]is True
        and trace["boundaryEqualityPolicy"]=="CONTACTS_SEPARATE_NO_SUB_NANOSECOND_ORDER_INFERRED"
        and all(trace[k]is False for k in("rawIdentifiersIncluded","parentAndChildClocksSubtracted","nativeEventsAuthenticated",
            "nativeResourcesQualified","measurementWindowIsolationQualified","pureSqlLatencyQualified","sustainableCapacityQualified"))
        and trace["authority"]=="NONE","WINDOW_SUMMARY_NOT_NATIVE_AUTHORITY")
    fields(trace["cohorts"],COHORTS,"EXACT_WINDOW_COHORTS")
    for cohort in COHORTS:
        fields(trace["cohorts"][cohort],WINDOW_CLASSES,"EXACT_WINDOW_CLASSES")
        for kind in WINDOW_CLASSES:
            actual=trace["cohorts"][cohort][kind]; sample=groups[cohort][kind]
            fields(actual,("writerIntervals","changedIntervals","metricsStatus","writerBracketNs","insideWriterTransactionNs"),"WINDOW_GROUP_FIELDS")
            integer(actual["writerIntervals"],len(sample["bracket"]),len(sample["bracket"]),"EXACT_WINDOW_SAMPLE_COUNT")
            integer(actual["changedIntervals"],sample["changed"],sample["changed"],"EXACT_WINDOW_CHANGED_COUNT")
            require(actual["metricsStatus"]==("WHOLE_DECLARED_BRACKETS_NOT_PURE_SQL"if sample["bracket"]else"NO_MATCHED_SAMPLES"),"WINDOW_METRIC_STATUS")
            require_metric(actual["writerBracketNs"],sample["bracket"]); require_metric(actual["insideWriterTransactionNs"],sample["inside"])
    require_metric(row.get("writerBracketNs"),[nanoseconds(r["bracketElapsedNs"])for r in intervals])
    require_metric(row.get("insideWriterTransactionNs"),[nanoseconds(r["insideTransactionElapsedNs"])for r in intervals])
    return dict(writerWindowDataMatches=True,originalBindingsRecomputed=True,nativeEventsAuthenticated=False,authority="NONE")



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



def validate_metric(value,samples=None):
    fields(value,("samples","min","p50","p95","p99","max"),"EXACT_AGGREGATE_METRIC")
    integer(value["samples"],0,4096,"BOUNDED_AGGREGATE_SAMPLES")
    if samples is not None:integer(value["samples"],samples,samples,"EXACT_AGGREGATE_SAMPLE_COUNT")
    values=[value[k]for k in("min","p50","p95","p99","max")]
    if value["samples"]==0:require(all(x is None for x in values),"EMPTY_METRIC_HAS_NO_DURATION")
    else:
        ns=[nanoseconds(x)for x in values];require(ns==sorted(ns),"ORDERED_AGGREGATE_METRIC")
    return value


def validate_recording(value,expected=None,limits=None):
    """The exact clean recorder-v1 wire contract, not raw timing proof.

    Python bool/int equality must never normalize recorder versions, counters,
    rational denominators or owner facts. Scalar summaries remain declarations.
    """
    fields(value,("capacityRecorderVersion","scope","clock","percentileMethod","recordingState","recordingIssue",
        "stopReason","limits","refusedStarts","pendingObservations","observedSpanNanoseconds","phases",
        "ledgerBalanceChecks","capacityQualification","ledgerCorrectness","authenticatedExecution","liveOrProduction","authority"),
        "EXACT_SOURCE_RECORDER_V1_FIELDS")
    fixed=dict(capacityRecorderVersion=1,scope="CALLER_DECLARED_OBSERVATIONS_ONLY",
        clock="CALLER_SUPPLIED_MONOTONIC_NANOSECONDS",percentileMethod="NEAREST_RANK",recordingIssue=None,stopReason=None,
        capacityQualification="NOT_ESTABLISHED",ledgerCorrectness="NOT_ESTABLISHED",
        authenticatedExecution=False,liveOrProduction=False,authority="NONE")
    require(all(same(value[k],v)for k,v in fixed.items()),"EXACT_CLEAN_RECORDER_SCHEMA_AND_AUTHORITY")
    integer(value["pendingObservations"],0,0,"EXACT_ZERO_PENDING_OBSERVATIONS")
    integer(value["refusedStarts"],0,0,"EXACT_ZERO_REFUSED_STARTS")
    bound=value["limits"];fields(bound,("maxSamplesPerPhase","maxInFlightPerPhase"),"EXACT_SOURCE_RECORDER_LIMITS")
    integer(bound["maxSamplesPerPhase"],1,4096,"EXACT_SOURCE_SAMPLE_LIMIT")
    integer(bound["maxInFlightPerPhase"],1,64,"EXACT_SOURCE_IN_FLIGHT_LIMIT")
    require(bound["maxInFlightPerPhase"]<=bound["maxSamplesPerPhase"],"SOURCE_RECORDER_LIMIT_ORDER")
    if limits is not None:require(same(bound,limits),"RECORDER_LIMITS_MATCH_ORIGINAL_WORKLOAD")
    phases=value["phases"];fields(phases,("FUNDING","FUNDED_CALL","LEDGER_TRANSACTION"),"ALL_RECORDED_PHASES")
    total=0
    for name,row in phases.items():
        fields(row,("entered","settled","pending","succeeded","rejected","unknown","peakInFlight","nonSuccessFraction",
            "terminalLatencyNanoseconds","successfulLatencyNanoseconds"),"EXACT_SOURCE_PHASE_FIELDS")
        for key in("entered","settled","pending","succeeded","rejected","unknown"):
            integer(row[key],0,bound["maxSamplesPerPhase"],"EXACT_PHASE_COUNTER")
        require(row["entered"]==row["settled"]==row["succeeded"] and row["pending"]==row["rejected"]==row["unknown"]==0,
            "COMPLETE_SUCCESSFUL_PHASE_DATA")
        integer(row["peakInFlight"],0 if row["entered"]==0 else 1,
            min(row["entered"],bound["maxInFlightPerPhase"]),"SOURCE_PHASE_PEAK_CONSISTENCY")
        fraction=None if row["settled"]==0 else dict(numerator=0,denominator=row["settled"])
        require(same(row["nonSuccessFraction"],fraction),"EXACT_SUCCESS_DENOMINATOR_NOT_BOOLEAN_ALIAS")
        if expected is not None and name in expected:
            integer(row["entered"],expected[name],expected[name],"CROSS_CHECKED_PHASE_COMPLETIONS")
        validate_metric(row["terminalLatencyNanoseconds"],row["settled"])
        validate_metric(row["successfulLatencyNanoseconds"],row["succeeded"])
        require(same(row["terminalLatencyNanoseconds"],row["successfulLatencyNanoseconds"]),
            "ALL_SUCCESSFUL_SERIES_MUST_MATCH")
        total+=row["entered"]
    require(same(value["recordingState"],"COMPLETE"if total else"EMPTY"),"SOURCE_RECORDER_STATE_MATCHES_ENTRIES")
    if total:
        span=nanoseconds(value["observedSpanNanoseconds"])
        require(all(row["entered"]==0 or nanoseconds(row["terminalLatencyNanoseconds"]["max"])<=span
            for row in phases.values()),"DECLARED_LATENCY_WITHIN_DECLARED_RECORDER_SPAN")
    else:
        # Balance checks do not tick this recorder's monotonic observation clock.
        require(value["observedSpanNanoseconds"]is None,"EMPTY_SOURCE_RECORDER_HAS_NO_TIME_OBSERVATION")
    balances=value["ledgerBalanceChecks"]
    fields(balances,("samples","mismatches","result"),"EXACT_BALANCE_CHECK_SUMMARY")
    integer(balances["samples"],0,bound["maxSamplesPerPhase"],"EXACT_BALANCE_SAMPLE_COUNT")
    integer(balances["mismatches"],0,0,"EXACT_ZERO_BALANCE_MISMATCHES")
    expected_result="NOT_RECORDED"if balances["samples"]==0 else"MATCHES_CALLER_DECLARED_EXPECTATIONS"
    require(same(balances["result"],expected_result),"BALANCE_RESULT_MATCHES_DECLARED_SAMPLES")


def validate_lane(row, ev, plan, bound, run_id, dispatched):
    fields(row, ("laneId", "pairAcquisitionEntered", "balanceReadsEntered", "pendingBalanceReads",
        "balanceObservationRoundTripNs", "timingPages", "serviceWriterTraceBeforeCloseObserved",
        "serviceWriterIntervals", "writerBracketNs", "insideWriterTransactionNs", "serviceChildWindowWriterTrace",
        "measurementUnknown", "closeStatus", "held"), "EXACT_PACED_LANE_REPORT")
    fields(ev, ("laneId", "pairSnapshot", "serviceWriterIntervals", "serviceWriterAttribution",
        "serviceMeasurementWindow", "payerOperationTimings", "privateStreams"), "EXACT_PRIVATE_LANE_EVIDENCE")
    fixed = dict(pairAcquisitionEntered=True, balanceReadsEntered=3, pendingBalanceReads=0,
        serviceWriterTraceBeforeCloseObserved=True, measurementUnknown=False, closeStatus="RETURNED", held=False)
    require(all(same(row[k], v) for k, v in fixed.items()), "LANE_OWNER_UNKNOWN")
    validate_metric(row["balanceObservationRoundTripNs"],3)
    pair = ev["pairSnapshot"]
    fields(pair, ("phase", "held", "completed", "warmupReserved", "measuredReserved", "activeOperation",
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
    require(all(same(pair[k], v) for k, v in fixed.items()), "ORIGINAL_PAIR_COUNTS_OR_CLOSE_UNKNOWN")
    integer(pair["referenceCandidates"], 1, 32768, "DECLARED_REFERENCE_CANDIDATES")
    integer(pair["referenceWindows"], 1, 8, "DECLARED_REFERENCE_WINDOWS")
    children, streams = pair["children"], ev["privateStreams"]
    require(type(children) is list and type(streams) is list and len(children) == len(streams) == 2
        and all(type(v) is dict and type(v.get("role")) is str for v in children + streams)
        and {v["role"] for v in children} == {v["role"] for v in streams} == {"PAYER", "SERVICE"}, "TWO_COMPLETE_CHILD_ROLES")
    for child in children:
        fields(child, ("role", "exited", "closed", "disconnected", "exitCode", "signal", "fault", "pending", "stdout", "stderr"),
            "EXACT_CHILD_SNAPSHOT")
        fixed = dict(exited=True, closed=True, disconnected=True, exitCode=0, signal=None, fault=False, pending=0)
        require(all(same(child[k], v) for k, v in fixed.items()), "CHILD_EXIT_EOF_OR_COMMAND_UNKNOWN")
        raw = next(v for v in streams if v["role"] == child["role"])
        fields(raw, ("role", "stdout", "stderr"), "EXACT_ROLE_STREAMS")
        for name, maximum in (("stdout", 1024), ("stderr", 8192)):
            captured = capture_stream(raw[name], maximum)
            facts = child[name]
            fields(facts, ("observedBytes", "retainedBytes", "overflow", "eof", "prefixSha256"), "EXACT_CHILD_STREAM_FACTS")
            fixed = dict(observedBytes=len(captured), retainedBytes=len(captured), overflow=False,
                eof=True, prefixSha256=hashlib.sha256(captured).hexdigest())
            require(all(same(facts[k], v) for k, v in fixed.items()), "COMPLETE_CHILD_STREAM_BINDING")
    timings = ev["serviceWriterIntervals"]
    require(type(timings) is list and 0 < len(timings) <= 12 * bound["totalCallsPerLane"] + 64
        and same(row["serviceWriterIntervals"], len(timings)), "COMPLETE_WRITER_INTERVAL_COUNT")
    previous = None
    for ordinal, item in enumerate(timings, 1):
        fields(item, ("ordinal", "commandClass", "changed", "beforeBeginNs", "afterBeginNs", "beforeCommitNs",
            "afterCommitNs", "bracketElapsedNs", "insideTransactionElapsedNs"), "EXACT_WRITER_INTERVAL")
        ns = [nanoseconds(item[k]) for k in ("beforeBeginNs", "afterBeginNs", "beforeCommitNs", "afterCommitNs")]
        require(same(item["ordinal"], ordinal) and item["commandClass"] in ("CONTROL", "APPLICATION_ORIGINAL")
            and type(item["changed"]) is bool and ns == sorted(ns) and (previous is None or previous <= ns[0])
            and nanoseconds(item["bracketElapsedNs"]) == ns[3] - ns[0]
            and nanoseconds(item["insideTransactionElapsedNs"]) == ns[2] - ns[1], "WHOLE_WRITER_BRACKET_ORDER")
        previous = ns[3]
    # Recompute the actual current V4 child window context, never an old R4 envelope.
    validate_window_trace_data(row, ev, pair, plan, run_id)
    commands = ev["payerOperationTimings"]
    kinds = ["INIT", "OPEN", "PREPARE", "COMMIT", "SUBMIT", "BIND"] + ["EXECUTE"] * pair["completed"] + ["CLOSE", "RELEASE_IPC"]
    require(type(commands) is list and len(commands) == len(kinds) <= 264, "COMPLETE_ORIGINAL_PAYER_SEQUENCE")
    previous = None
    for ordinal, (command, kind) in enumerate(zip(commands, kinds), 1):
        fields(command, ("sequence", "kind", "status", "startNs", "endNs", "lateAfterTimeout", "clockDomain", "timingKind"),
            "EXACT_PAYER_LOCAL_TIMING")
        start, end = nanoseconds(command["startNs"]), nanoseconds(command["endNs"])
        status = "OBSERVED_RETURNED_CLOSE" if kind == "CLOSE" else "RELEASING_IPC" if kind == "RELEASE_IPC" else "OBSERVED"
        fixed = dict(sequence=ordinal, kind=kind, status=status, lateAfterTimeout=False,
            clockDomain="PAYER_CHILD_LOCAL", timingKind="CHILD_LOCAL_MONOTONIC_OPERATION_NOT_SQL_LATENCY")
        require(all(same(command[k], v) for k, v in fixed.items()) and start <= end
            and (previous is None or previous <= start), "ORIGINAL_PAYER_LOCAL_SEQUENCE")
        previous = end
    return pair["completed"], len(timings)


def validate(resource,stdout,stderr,receipt,workload,expected_run_id):
    """Bind the complete original outer bytes to declared managed receipt DATA."""
    plan=resource.capture_plan(workload);bound=resource.resource_plan(plan);n=len(plan["laneIds"])
    require(type(expected_run_id)is str and HASH.fullmatch(expected_run_id),"EXPECTED_CURRENT_RUN_ID")
    fields(receipt,("state","actual_exit","process_group","stdout","stderr","output_complete","scratch_scan_retries","reason","completed_at","argv"),"EXACT_ORIGINAL_MANAGER_RECEIPT")
    require(receipt["state"]=="COMPLETE" and type(receipt["actual_exit"])is int and receipt["actual_exit"]==0
        and receipt["output_complete"]is True and receipt["reason"]is None and receipt["argv"]is None,"COMMAND_FAILURE_OR_UNKNOWN")
    integer(receipt["process_group"],1,2**31-1,"OWNED_PROCESS_GROUP_DATA")
    integer(receipt["scratch_scan_retries"],0,2**53-1,"RECORDED_CAPTURE_SCAN_RETRIES")
    at=receipt["completed_at"]
    require(type(at)in(float,int)and math.isfinite(at)and 0<=at<=2**53-1,"FINITE_COMMAND_COMPLETION")
    require(type(stderr)is bytes and stderr==b"","PARENT_STDERR_UNKNOWN")
    for name,raw in(("stdout",stdout),("stderr",stderr)):
        fields(receipt[name],("sha256","bytes"),"COMPLETE_MANAGER_STREAM_FIELDS")
        require(type(raw)is bytes and type(receipt[name]["bytes"])is int and len(raw)==receipt[name]["bytes"]
            and sha(raw)==receipt[name]["sha256"],"ORIGINAL_COMPLETE_COMMAND_STREAM_BINDING")
    v=_frame(stdout,bound["nodeStdoutLimit"]);capture_tree_in_place(v)
    fields(v,("offeredCaptureVersion","kind","sourceRowsSha256","childSourceRowsSha256","result","finiteSourcePlan",
        "wholeWindowObserved","evidence","arrivalModel","parentAndServiceWindowsAligned","nativeEventsAuthenticated",
        "nativeResourcesQualified","sustainableCapacityQualified","chainAuthenticated","productionQualified","authority"),"CURRENT_ORIGINAL_OFFERED_OUTER_LAYOUT")
    require(type(v["offeredCaptureVersion"])is int and v["offeredCaptureVersion"]==3
        and v["kind"]=="PRIVATE_CURRENT_OFFERED_NATIVE_CAPACITY_COMPONENT_CAPTURE_NOT_PRODUCTION"
        and v["sourceRowsSha256"]==PARENT_SHA and v["childSourceRowsSha256"]==GRAPH_SHA
        and v["wholeWindowObserved"]is True and v["arrivalModel"]=="FIXED_NOMINAL_CALENDAR_NO_QUEUE_OR_CATCHUP"
        and v["authority"]=="NONE" and all(v[k]is False for k in("parentAndServiceWindowsAligned",
            "nativeEventsAuthenticated","nativeResourcesQualified","sustainableCapacityQualified","chainAuthenticated","productionQualified")),
        "CURRENT_ENVELOPE_NOT_NATIVE_OR_PRODUCTION_AUTHORITY")
    require(same(v["finiteSourcePlan"],resource.finite_source_plan(plan)),"ENTIRE_ACTUAL_FINITE_OFFERED_PLAN")
    result=v["result"]
    fields(result,("nativeOfferedCapacityWorkloadAdapterVersion","status","core","arrivalModel","globalScheduledOffers",
        "perLaneFundedServiceCallCapacity","fundingIsSyntheticAndNotEconomicAcceptance","lanes","parentClockDomain","payerClockDomain",
        "ledgerClockDomain","childClockDomainsMerged","ledgerTimeInferredFromPromise","writerTraceCovers","parentAndServiceWindowsAligned",
        "writerBracketsClipped","measurementWindowIsolationQualified","sustainedCapacityQualified","nativeEventsAuthenticated",
        "nativeResourcesQualified","nativeOsNetworkSandbox","productionQualified","authority"),"COMPLETE_CURRENT_ADAPTER_REPORT")
    fixed=dict(nativeOfferedCapacityWorkloadAdapterVersion=6,status="OBSERVED_COMPONENT_ONLY",
        arrivalModel="FIXED_NOMINAL_CALENDAR_NO_QUEUE_OR_CATCHUP",globalScheduledOffers=bound["globalScheduledOffers"],
        perLaneFundedServiceCallCapacity=bound["totalCallsPerLane"],fundingIsSyntheticAndNotEconomicAcceptance=True,
        parentClockDomain="PARENT_MONOTONIC_IPC_ROUNDTRIP_NOT_CHILD_OR_SQL_LATENCY",payerClockDomain="PAYER_CHILD_LOCAL",
        ledgerClockDomain="SERVICE_CHILD_LOCAL",childClockDomainsMerged=False,ledgerTimeInferredFromPromise=False,
        writerTraceCovers="WHOLE_RUN_BRACKETS_CLASSIFIED_AGAINST_SEPARATE_SERVICE_CHILD_WINDOW",parentAndServiceWindowsAligned=False,
        writerBracketsClipped=False,measurementWindowIsolationQualified=False,sustainedCapacityQualified=False,
        nativeEventsAuthenticated=False,nativeResourcesQualified=False,nativeOsNetworkSandbox=False,productionQualified=False,authority="NONE")
    require(all(same(result[k],value)for k,value in fixed.items()),"CURRENT_ADAPTER_UNKNOWN_OR_AUTHORITY")
    core=result["core"];require(type(core)is dict,"CURRENT_FUNDED_OWNER_REPORT")
    core_fixed=dict(offeredWorkloadOwnerVersion=1,scope="TRUSTED_FUNDED_SOURCE_OWNERS_NOT_NATIVE_QUALIFICATION",
        outcome="OBSERVED_SOURCE_OWNERS_RETURNED",issue=None,stopReason="MEASUREMENT_FINISHED",fundingEntries=n,warmupEntries=n*plan["plan"]["warmupCallsPerLane"],
        fundingBalanceChecks=n,pendingPrefixOriginals=0,pendingPrefixLedger=0,pendingFundingBalanceReads=0,pendingOwnerCloses=0,
        measurementPending=False,sourceOwnersCloseRequested=True,actualResourceLifetime="CAPTURED_SOURCE_OWNERS",
        automaticRetry=False,replacement=False,nativeResourcesQualified=False,sustainedCapacityQualified=False,productionQualified=False,authority="NONE")
    require(all(k in core and same(core[k],value)for k,value in core_fixed.items())
        and same(core.get("plan"),dict(plan["plan"],closeGraceMs=plan["closeBudgetMs"])),"CURRENT_PREFIX_OWNER_COUNTS_OR_CLOSE_UNKNOWN")
    require(type(core.get("lanes"))is list and len(core["lanes"])==n and all(type(row)is dict and
        same(row,dict(funded=True,warmupCompleted=plan["plan"]["warmupCallsPerLane"],closeEntered=True,closeOutcome="RETURNED"))for row in core["lanes"]),
        "COMPLETE_PREFIX_LANE_OWNERS")
    measure=core.get("offeredMeasurement");require(type(measure)is dict,"ACTUAL_OFFERED_MEASUREMENT")
    fixed_measure=dict(offeredWindowOwnerVersion=1,scope="TRUSTED_SOURCE_MEASUREMENT_NOT_NATIVE_QUALIFICATION",
        outcome="OBSERVED_SOURCES_SETTLED",issue=None,stopReason="WINDOW_EXPIRED",laneCount=n,
        scheduledSlots=bound["globalScheduledOffers"],withdrawnSlots=0,pendingOriginalOperations=0,
        pendingLedgerObservations=0,pendingControlObservations=0,queueCapacity=0,opensObserved=n,stopsObserved=n,balanceChecks=2*n,
        borrowedResourcesClosed=False,clockAuthenticated=False,fixedOfferedRateQualified=False,sustainableCapacityQualified=False,
        nativeResourcesQualified=False,productionQualified=False,authority="NONE")
    require(all(k in measure and same(measure[k],value)for k,value in fixed_measure.items()),"OFFERED_CALENDAR_OR_DRAIN_UNKNOWN")
    inner_plan=measure.get("plan")
    fields(inner_plan,("setupBudgetMs","measurementWindowMs","arrivalIntervalMs","drainGraceMs","maxLedgerTransactionsPerOperation"),"ACTUAL_INNER_OFFERED_PLAN")
    integer(inner_plan["setupBudgetMs"],1,plan["plan"]["setupBudgetMs"],"REMAINING_ORIGINAL_SETUP_BUDGET")
    require(all(same(inner_plan[k],plan["plan"][k])for k in inner_plan if k!="setupBudgetMs"),"ORIGINAL_MEASUREMENT_PLAN_CONTEXT")
    for k in("sourceEntries","busyRejectedOffers","schedulerMissedSlots","evaluatedOffers"):integer(measure.get(k),0,bound["globalScheduledOffers"],"EXACT_OFFERED_SLOT_COUNTER")
    require(measure["scheduledSlots"]==measure["sourceEntries"]+measure["busyRejectedOffers"]+measure["schedulerMissedSlots"]
        and measure["evaluatedOffers"]==measure["sourceEntries"]+measure["busyRejectedOffers"],"WHOLE_GLOBAL_SLOT_CONSERVATION")
    start,end=nanoseconds(measure.get("measurementStartNanoseconds")),nanoseconds(measure.get("measurementEndNanoseconds"))
    require(end-start==plan["plan"]["measurementWindowMs"]*1000000
        and measure.get("nominalIntervalNanoseconds")==str(plan["plan"]["arrivalIntervalMs"]*1000000)
        and nanoseconds(measure.get("admissionStoppedNanoseconds"))>=end,"FIXED_PARENT_WINDOW_NOT_CHILD_ALIGNMENT")
    rows,evidence=result["lanes"],v["evidence"]
    require(type(rows)is list and type(evidence)is list and len(rows)==len(evidence)==n
        and all(type(row)is dict for row in rows+evidence)and [row.get("laneId")for row in rows]==[row.get("laneId")for row in evidence]==plan["laneIds"],
        "COMPLETE_ORDERED_CURRENT_LANE_EVIDENCE")
    completed=writers=measured=0
    for row,ev in zip(rows,evidence):
        count=ev.get("pairSnapshot",{}).get("measuredReserved");integer(count,0,bound["globalScheduledOffers"],"PER_LANE_ACTUAL_GLOBAL_OFFER_DISPATCH")
        done,seen=validate_lane(row,ev,plan,bound,expected_run_id,count);completed+=done;writers+=seen;measured+=count
    require(measured==measure["sourceEntries"],"GLOBAL_DISPATCH_EQUALS_SUM_OF_REAL_LANE_ORIGINALS")
    validate_recording(core.get("prefixRecording"),{"FUNDING":n,"FUNDED_CALL":n*plan["plan"]["warmupCallsPerLane"]},plan["recordingLimits"])
    validate_recording(core.get("postStopPrefixLedgerRecording"),{"FUNDING":0,"FUNDED_CALL":0},plan["recordingLimits"])
    validate_recording(measure.get("dispatchedCallRecording"),{"FUNDING":0,"FUNDED_CALL":measured},plan["recordingLimits"])
    validate_recording(measure.get("sourceStartDelayRecording"),{"FUNDING":0,"FUNDED_CALL":measured,"LEDGER_TRANSACTION":0},plan["recordingLimits"])
    validate_recording(measure.get("postStopLedgerRecording"),{"FUNDING":0,"FUNDED_CALL":0},plan["recordingLimits"])
    return dict(currentOfferedCaptureDataVersion=3,status="MATCHING_DECLARED_CURRENT_OFFERED_OUTER_DATA",
        completedOriginalCalls=completed,dispatchedGlobalMeasuredOriginals=measured,busyRejectedOffers=measure["busyRejectedOffers"],
        schedulerMissedSlots=measure["schedulerMissedSlots"],fundedReservationsAreNotDispatches=True,
        childCloseRowsAsData=2*n,writerIntervalsAsData=writers,currentChildWindowAndWriterArithmeticRecomputed=True,
        originalPayerCommandSequenceMatched=True,completeOriginalCommandAndChildStreamsBoundAsData=True,
        aggregatesCheckedWithoutUnavailableRawTimingProof=True,fullCaptureJsonReserialized=False,entireInputTreeCopied=False,
        parentAndChildClockDomainsAligned=False,receiptsIndependentlyAuthenticated=False,nativeResourcesQualified=False,
        storageCleanupQualified=False,sustainableCapacityQualified=False,chainAuthenticated=False,productionQualified=False,authority="NONE")
