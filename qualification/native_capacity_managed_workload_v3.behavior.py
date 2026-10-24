"""Selected DATA-only tests for the genuine P4 managed controls.

All capture/receipt/identity examples below are synthetic in-memory declarations,
not native observations. No namespace, SDK/SQL substitute, manager, private root,
key, signature, nonce search, socket, child process or task scratch is entered.
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

PINS = {"qualification/native_capacity_managed_workload_v3.py": "6d4e2d726bd600b84be387147ee7cd6555daa8b72b8940a8719861a1078b4567",
    "qualification/fixtures/capacity-parent-timing-source-data-v1.json": "0df8819b72d0fce70581116102a21d11726c5f264403cfff0537323dfb1031c1"}
repo = Path(__file__).absolute().parents[1]
def identity(s):
    return [s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
def read(p):
    for at in (p,*p.parents):
        if at.is_symlink():raise ValueError("DATA_TEST_SOURCE_LINK")
    before = p.lstat(); ident = identity(before)
    if not stat.S_ISREG(before.st_mode) or before.st_uid != os.getuid() or before.st_nlink != 1 or before.st_size > 65536:
        raise ValueError("DATA_TEST_SOURCE_IDENTITY")
    with os.fdopen(os.open(p,os.O_RDONLY|os.O_NOFOLLOW),"rb") as stream:
        if identity(os.fstat(stream.fileno())) != ident:raise ValueError("DATA_TEST_SOURCE_OPEN")
        raw = stream.read(65537)
        if len(raw) != before.st_size or identity(os.fstat(stream.fileno())) != ident:raise ValueError("DATA_TEST_SOURCE_READ")
    if identity(p.lstat()) != ident:raise ValueError("DATA_TEST_SOURCE_AFTER")
    return raw,ident
if not(sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode):raise ValueError("ISOLATED_DATA_TEST_REQUIRED")
sources = {name:read(repo/name) for name in PINS}
if any(hashlib.sha256(raw).hexdigest()!=PINS[name] for name,(raw,_) in sources.items()):raise ValueError("DATA_TEST_SOURCE_PIN")
def load(name,label):
    spec = importlib.util.spec_from_file_location(label,repo/name)
    value = importlib.util.module_from_spec(spec);sys.modules[label]=value;spec.loader.exec_module(value);return value
d = load("qualification/native_capacity_managed_workload_v3.py","capacity_managed_v3_tests_data")
WORK = d.capture_plan(json.loads("{\"workloadVersion\":3,\"laneIds\":[\"lane.one\",\"lane.two\"],\"plan\":{\"warmupCallsPerLane\":1,\"measurementCallsPerLane\":4,\"setupBudgetMs\":30000,\"measurementWindowMs\":1000,\"drainGraceMs\":1000,\"maxLedgerTransactionsPerOperation\":3},\"recordingLimits\":{\"maxSamplesPerPhase\":128,\"maxInFlightPerPhase\":4},\"payeeAddress\":\"z1qq3zyg3zyg3zyg3zyg3zyg3zyg3zyg3z3yw2mk\",\"commandBudgetMs\":10000,\"closeBudgetMs\":10000}"))
RUN_ID = "ab"*32
FIXTURE=json.loads(sources["qualification/fixtures/capacity-parent-timing-source-data-v1.json"][0])
if FIXTURE["kind"]!="SYNTHETIC_SOURCE_RECORDER_DATA_NOT_NATIVE_EVIDENCE"or FIXTURE["authority"]!="NONE":raise ValueError("SYNTHETIC_DATA_FIXTURE_ONLY")
def clone(v):return copy.deepcopy(v)
def assign(value,path,replacement):
    for key in path[:-1]:value=value[key]
    value[path[-1]]=replacement
class Selected(unittest.TestCase):pass
def check(name,fn):
    def method(self):fn(self)
    method.__name__="test_"+name;setattr(Selected,method.__name__,method)
def reject_plan(name,edit):
    def run(self):
        v=clone(WORK);edit(v)
        with self.assertRaises(ValueError):d.capture_plan(v)
    check("plan_rejects_"+name,run)

def reservation(self):
    b=d.resource_plan(WORK);p=d.storage_policy(WORK)
    self.assertEqual(b["laneCount"],2);self.assertEqual(b["maximumRuns"],1)
    self.assertEqual(b["nodeParentCommands"],1);self.assertEqual(b["nodeChildProcessesMaximum"],4)
    self.assertEqual(b["opensslCommands"],1);self.assertEqual(b["loopbackTcpConnectionsMaximum"],362)
    self.assertEqual(b["sqliteNewPathsMaximum"],8);self.assertEqual(b["independentPinFilesMaximum"],4)
    self.assertEqual((b["inMemoryEd25519KeysMaximum"],b["transactionSignaturesMaximum"],b["capabilitySignaturesMaximum"],b["providerSignaturesMaximum"]),(6,2,10,2))
    self.assertEqual(b["nonceCandidatesTotalReserved"],131072)
    self.assertEqual(b["taskQuotaBytes"],p["task_quota_bytes"])
    self.assertEqual(b["expectedPeakBytes"],b["taskQuotaBytes"])
    self.assertEqual(b["minimumFreeBytes"],10*1024**3)
    self.assertEqual(p["max_tasks"],1);self.assertEqual(p["max_commands_per_task"],2)
    self.assertEqual(b["sourceCopiesRequired"],0);self.assertEqual(b["packageCopiesRequired"],0)
    for k in ("effectsExecuted","nativeOsNetworkSandbox","diskQuotaOsEnforced","automaticRetry",
            "childCreatedFilesAutomaticAdoption","childCreatedFilesAutomaticDeletion"):
        self.assertIs(b[k],False)
    self.assertEqual(b["authority"],"NONE");self.assertIs(b["cleanupMayRemainHold"],True)
check("exact_two_lane_effect_reservations_are_data_not_permission",reservation)
def detached(self):
    v=clone(WORK);before=clone(v);captured=d.capture_plan(v);d.resource_plan(v)
    self.assertEqual(v,before);v["plan"]["measurementCallsPerLane"]=1
    self.assertNotEqual(v,captured)
check("plan_capture_detaches_without_mutating_input",detached)
def lanes16(self):
    v=clone(WORK);v["laneIds"]=["lane."+str(i) for i in range(16)]
    v["recordingLimits"]={"maxSamplesPerPhase":4096,"maxInFlightPerPhase":16}
    v["plan"].update(warmupCallsPerLane=0,measurementCallsPerLane=84)
    b=d.resource_plan(v)
    self.assertEqual(b["nodeChildProcessesMaximum"],32)
    self.assertEqual(b["nonceCandidatesTotalReserved"],1048576)
    self.assertLessEqual(b["nodeStdoutLimit"],16*d.MIB)
    self.assertEqual(b["maximumRuns"],1);self.assertGreater(b["taskQuotaBytes"],0)
check("all_sixteen_real_lane_slots_are_planned_without_execution",lanes16)
def limit256(self):
    v=clone(WORK);v["laneIds"]=["lane.one"];v["plan"].update(warmupCallsPerLane=0,
        measurementCallsPerLane=256,maxLedgerTransactionsPerOperation=1)
    v["recordingLimits"]={"maxSamplesPerPhase":4096,"maxInFlightPerPhase":1}
    self.assertEqual(d.resource_plan(v)["totalCallsPerLane"],256)
check("full_256_call_single_lane_range_matches_real_adapter",limit256)

reject_plan("unknown_field",lambda v:v.update(execute=True))
reject_plan("wrong_version_type",lambda v:v.update(workloadVersion=True))
reject_plan("non_fixture_payee",lambda v:v.update(payeeAddress="z1"+"q"*38))
reject_plan("empty_lanes",lambda v:v.update(laneIds=[]))
reject_plan("seventeen_lanes",lambda v:v.update(laneIds=["lane."+str(i)for i in range(17)]))
reject_plan("duplicate_lanes",lambda v:v.update(laneIds=["lane.same","lane.same"]))
reject_plan("path_in_lane",lambda v:v.update(laneIds=["lane/escape"]))
reject_plan("hooked_container",lambda v:v.update(laneIds=tuple(v["laneIds"])))
reject_plan("negative_warmup",lambda v:v["plan"].update(warmupCallsPerLane=-1))
reject_plan("zero_measurement",lambda v:v["plan"].update(measurementCallsPerLane=0))
reject_plan("too_many_total_originals",lambda v:v["plan"].update(warmupCallsPerLane=255,measurementCallsPerLane=2))
reject_plan("boolean_call_count",lambda v:v["plan"].update(measurementCallsPerLane=True))
reject_plan("float_window",lambda v:v["plan"].update(measurementWindowMs=1.0))
reject_plan("long_setup",lambda v:v["plan"].update(setupBudgetMs=60001))
reject_plan("long_measurement",lambda v:v["plan"].update(measurementWindowMs=60001))
reject_plan("long_drain",lambda v:v["plan"].update(drainGraceMs=1001))
reject_plan("unbounded_ledger_starts",lambda v:v["plan"].update(maxLedgerTransactionsPerOperation=17))
reject_plan("insufficient_sample_capacity",lambda v:v["recordingLimits"].update(maxSamplesPerPhase=3))
reject_plan("insufficient_in_flight_capacity",lambda v:v["recordingLimits"].update(maxInFlightPerPhase=1))
reject_plan("too_many_recording_samples",lambda v:v["recordingLimits"].update(maxSamplesPerPhase=4097))
reject_plan("short_pair_command_budget",lambda v:v.update(commandBudgetMs=999))
reject_plan("short_pair_close_budget",lambda v:v.update(closeBudgetMs=5999))
reject_plan("long_pair_close_budget",lambda v:v.update(closeBudgetMs=15001))
def no_hooks(self):
    calls=[]
    class Hooked(dict):
        def items(self):calls.append("items");raise RuntimeError("MUST_NOT_RUN")
    with self.assertRaises(ValueError):d.capture_plan(Hooked(WORK))
    self.assertEqual(calls,[])
check("source_data_never_coerces_subclasses_or_calls_hooks",no_hooks)

EMPTY=d.sha(b"")
def facts():
    return dict(observedBytes=0,retainedBytes=0,overflow=False,eof=True,prefixSha256=EMPTY)
def stream():
    return dict(bytes=0,sha256=EMPTY,base64="")
def reference_summary(values):
    if not values:return dict(samples=0,min=None,p50=None,p95=None,p99=None,max=None)
    ordered=sorted(values)
    # Test reference uses a different nearest-rank integer spelling, not d.metric_summary.
    return dict(samples=len(ordered),min=str(ordered[0]),p50=str(ordered[(len(ordered)*50-1)//100]),
        p95=str(ordered[(len(ordered)*95-1)//100]),p99=str(ordered[(len(ordered)*99-1)//100]),max=str(ordered[-1]))
def reference_class(before,after,start,stop):
    if any(v==edge for v in(before,after)for edge in(start,stop)):return "TOUCHES_BOUNDARY"
    if after<start:return "BEFORE"
    if before>stop:return "AFTER"
    if start<before and after<stop:return "INSIDE"
    if before<start and after>stop:return "CROSSES_BOTH"
    return "CROSSES_OPEN"if before<start else"CROSSES_STOP"
CLASSES=("BEFORE","CROSSES_OPEN","INSIDE","CROSSES_STOP","CROSSES_BOTH","AFTER","TOUCHES_BOUNDARY")
def summary_trace(intervals,attribution,completed):
    groups={c:{k:[]for k in CLASSES}for c in("CONTROL","WARMUP","MEASUREMENT")}
    for raw,item in zip(intervals,attribution):groups[item["cohort"]][item["windowClass"]].append(raw)
    cohorts={}
    for c in groups:
        cohorts[c]={}
        for k,rows in groups[c].items():
            cohorts[c][k]=dict(writerIntervals=len(rows),changedIntervals=sum(r["changed"]for r in rows),
                metricsStatus="WHOLE_DECLARED_BRACKETS_NOT_PURE_SQL"if rows else"NO_MATCHED_SAMPLES",
                writerBracketNs=reference_summary([int(r["bracketElapsedNs"])for r in rows]),
                insideWriterTransactionNs=reference_summary([int(r["insideTransactionElapsedNs"])for r in rows]))
    return dict(capacityWindowWriterTraceDataVersion=1,status="COMPLETE_DECLARED_WINDOW_TRACE_DATA",reason=None,pagesAccepted=1,
        acceptedIntervals=len(intervals),declaredIntervals=len(intervals),cohortTraceStatus="COMPLETE_DECLARED_TRACE_DATA",
        matchedCompletedOriginals=completed,clockDomain="SERVICE_CHILD_LOCAL",declaredWindowElapsedNs="1000",cohorts=cohorts,
        boundaryEqualityPolicy="CONTACTS_SEPARATE_NO_SUB_NANOSECOND_ORDER_INFERRED",wholeIntervalsNotClipped=True,
        rawIdentifiersIncluded=False,parentAndChildClocksSubtracted=False,nativeEventsAuthenticated=False,
        nativeResourcesQualified=False,measurementWindowIsolationQualified=False,pureSqlLatencyQualified=False,
        sustainableCapacityQualified=False,authority="NONE")
def declaration(completed=5):
    row_list=[];evidence=[]
    for lane in WORK["laneIds"]:
        children=[dict(role=role,exited=True,closed=True,disconnected=True,exitCode=0,signal=None,fault=False,pending=0,
            stdout=facts(),stderr=facts())for role in("PAYER","SERVICE")]
        intervals=[];attribution=[]
        specs=[("CONTROL",None,100,3),("WARMUP",0,200,3)]+[
            ("MEASUREMENT",i,1100+100*i,5+i)for i in range(completed-1)]+[("CONTROL",None,2200,3)]
        for ordinal,(cohort,index,before,duration)in enumerate(specs,1):
            raw=dict(ordinal=ordinal,commandClass="CONTROL"if cohort=="CONTROL"else"APPLICATION_ORIGINAL",changed=True,
                beforeBeginNs=str(before),afterBeginNs=str(before+1),beforeCommitNs=str(before+duration-1),
                afterCommitNs=str(before+duration),bracketElapsedNs=str(duration),insideTransactionElapsedNs=str(duration-2))
            intervals.append(raw)
            binding=None if cohort=="CONTROL"else hashlib.sha256(("native-capacity-original-v1\0"+RUN_ID+"\0"+lane+"\0"+cohort+"\0"+str(index)).encode()).hexdigest()
            attribution.append(dict(ordinal=ordinal,cohort=cohort,originalOrdinal=index,windowClass=reference_class(before,before+duration,1000,2000),
                changed=True,bracketElapsedNs=str(duration),insideTransactionElapsedNs=str(duration-2),originalCommandDigest=binding))
        clock_reads=2+sum(int(r[k])<2000 for r in intervals for k in("beforeBeginNs","afterBeginNs","beforeCommitNs","afterCommitNs"))
        window=dict(windowVersion=1,context=dict(runId=RUN_ID,laneId=lane,sourceRowsSha256=d.GRAPH_SHA),clockDomain="SERVICE_CHILD_LOCAL",
            phase="STOPPED",startNs="1000",stopNs="2000",stopCause="PARENT_STOP",unknown=False,clockReads=clock_reads)
        kinds=["INIT","OPEN","PREPARE","COMMIT","SUBMIT","BIND"]+["EXECUTE"]*completed+["CLOSE","RELEASE_IPC"]
        commands=[dict(sequence=i,kind=kind,status="OBSERVED_RETURNED_CLOSE"if kind=="CLOSE"else"RELEASING_IPC"if kind=="RELEASE_IPC"else"OBSERVED",
            startNs=str(i*10),endNs=str(i*10+1),lateAfterTimeout=False,clockDomain="PAYER_CHILD_LOCAL",
            timingKind="CHILD_LOCAL_MONOTONIC_OPERATION_NOT_SQL_LATENCY")for i,kind in enumerate(kinds,1)]
        row_list.append(dict(laneId=lane,pairAcquisitionEntered=True,balanceReadsEntered=3,pendingBalanceReads=0,timingPages=1,
            closeStatus="RETURNED",held=False,measurementUnknown=False,serviceWriterTraceBeforeCloseObserved=True,serviceWriterIntervals=len(intervals),
            writerBracketNs=reference_summary([int(r["bracketElapsedNs"])for r in intervals]),
            insideWriterTransactionNs=reference_summary([int(r["insideTransactionElapsedNs"])for r in intervals]),
            serviceChildWindowWriterTrace=summary_trace(intervals,attribution,completed)))
        evidence.append(dict(laneId=lane,pairSnapshot=dict(phase="CLOSED",held=False,completed=completed,warmupReserved=1,
            measuredReserved=completed-1,freshBalanceReads=3,windowOpenEntered=True,windowStopEntered=True,
            windowOpenAcknowledged=True,windowStopAcknowledged=True,measurementUnknown=False,activeOperation=False,referenceCandidates=1,referenceWindows=1,
            balancesObserved=True,launchAttempts=2,launchUnknown=False,historicalCloseStatus="CLOSED",children=children,
            nativeQualified=False,capacityQualified=False,authority="NONE"),serviceWriterIntervals=intervals,serviceWriterAttribution=attribution,
            serviceMeasurementWindow=window,payerOperationTimings=commands,
            privateStreams=[dict(role=role,stdout=stream(),stderr=stream())for role in("PAYER","SERVICE")]))
    parent=clone(FIXTURE["scenarios"]["full"if completed==5 else"partial"])
    if parent["completedOriginalCallsPerLane"]!=completed:raise ValueError("DECLARED_FIXTURE_COMPLETION_SELECTION")
    core=dict(capacityWorkloadOwnerVersion=3,scope="TRUSTED_WINDOWED_ASYNC_SOURCE_LANES_NOT_NATIVE_QUALIFICATION",
        outcome="OBSERVED_OWNERS_RETURNED",plan=clone(WORK["plan"]),laneCount=2,returnedCloses=2,unknownCloses=0,pendingCloses=0,
        pendingOperations=0,pendingLedgerBoundaries=0,pendingBalanceReads=0,balanceBarrierPending=False,
        completedBalanceBarriers=3,balanceReadAttempts=6,balanceContract="GENUINE_PROMISE_FRESH_READ_NOT_SYNC_CACHE",
        pendingWindowStarts=0,pendingWindowStops=0,windowOpenBarrierPending=False,windowStartsObserved=2,windowStopsObserved=2,
        windowHandoffContract="GENUINE_PROMISE_SERVICE_CHILD_MARKERS_NOT_PARENT_CLOCK_ALIGNMENT",
        measurementWindowIsolationQualified=False,measurementStatus="OBSERVED_COMPONENT_ONLY",uncertainty=None,
        authority="NONE",nativeClockAuthenticated=False,nativeResourcesQualified=False,benchmarkQualified=False,capacityQualified=False,
        plannedCallsCompleted=completed==5,recording=parent["recording"])
    result=dict(nativeCapacityWorkloadAdapterVersion=3,status="OBSERVED_COMPONENT_ONLY",core=core,lanes=row_list,
        sustainedCapacityQualified=False,nativeEventsAuthenticated=False,nativeResourcesQualified=False,nativeOsNetworkSandbox=False,
        productionQualified=False,childClockDomainsMerged=False,ledgerTimeInferredFromPromise=False,authority="NONE",
        parentClockDomain="PARENT_MONOTONIC_IPC_ROUNDTRIP_NOT_CHILD_OR_SQL_LATENCY",payerClockDomain="PAYER_CHILD_LOCAL",ledgerClockDomain="SERVICE_CHILD_LOCAL",
        writerTraceCovers="WHOLE_RUN_BRACKETS_CLASSIFIED_AGAINST_SEPARATE_SERVICE_CHILD_WINDOW",
        parentAndServiceWindowsAligned=False,writerBracketsClipped=False,measurementWindowIsolationQualified=False)
    return dict(captureVersion=3,kind="PRIVATE_FULL_NATIVE_CAPACITY_COMPONENT_CAPTURE_NOT_PRODUCTION",
        parentTimingData=dict(parentTimingCaptureVersion=1,context=dict(runId=RUN_ID,sourceRowsSha256=d.GRAPH_SHA,laneIds=clone(WORK["laneIds"])),
            trace=parent["trace"],check=parent["recomputed"],status="MATCHING_DECLARED_PARENT_TRACE"),
        sourceRowsSha256=d.GRAPH_SHA,result=result,evidence=evidence,nativeResourcesQualified=False,
        sustainableCapacityQualified=False,chainAuthenticated=False,productionQualified=False,authority="NONE")

def capture(value,stderr=b""):
    raw=d.canonical(value)+b"\n"
    receipt=dict(state="COMPLETE",actual_exit=0,output_complete=True,reason=None,argv=None,process_group=12345,
        scratch_scan_retries=0,completed_at=1000.0,stdout=dict(sha256=d.sha(raw),bytes=len(raw)),
        stderr=dict(sha256=d.sha(stderr),bytes=len(stderr)))
    return raw,stderr,receipt
def validate(value,edit_receipt=None,stderr=b""):
    raw,err,receipt=capture(value,stderr)
    if edit_receipt is not None:edit_receipt(receipt)
    return d.validate_capture_data(raw,err,receipt,WORK,RUN_ID)
def matches(self,completed):
    result=validate(declaration(completed))
    self.assertEqual(result["completedOriginalCalls"],2*completed)
    self.assertEqual(result["childClosesObservedAsData"],4)
    self.assertIs(result["dataOnlyNotNativeAuthentication"],True)
    self.assertIs(result["parentPhaseMetricsIndependentlyRecomputed"],True)
    for field in ("nativeResourcesQualified","storageCleanupQualified","sustainableCapacityQualified","chainAuthenticated","productionQualified"):
        self.assertIs(result[field],False)
check("synthetic_complete_capture_stays_data_not_native_proof",lambda self:matches(self,5))
check("window_stop_preserves_partial_original_counts_without_replacement",lambda self:matches(self,2))
def no_clock_merge(self):
    v=declaration();ev=v["evidence"][0];shift=10**30
    for raw in ev["serviceWriterIntervals"]:
        for k in("beforeBeginNs","afterBeginNs","beforeCommitNs","afterCommitNs"):raw[k]=str(int(raw[k])+shift)
    for k in("startNs","stopNs"):ev["serviceMeasurementWindow"][k]=str(int(ev["serviceMeasurementWindow"][k])+shift)
    self.assertIs(validate(v)["componentCaptureDataMatches"],True)
check("child_local_clocks_are_not_cross_subtracted_or_merged",no_clock_merge)

def reject_capture(name,edit):
    def run(self):
        value=declaration();edit(value)
        with self.assertRaises(ValueError):validate(value)
    check("capture_rejects_"+name,run)
def reject_receipt(name,edit):
    def run(self):
        with self.assertRaises(ValueError):validate(declaration(),edit_receipt=edit)
    check("receipt_rejects_"+name,run)
reject_receipt("failed_exit",lambda r:r.update(actual_exit=1))
reject_receipt("boolean_exit",lambda r:r.update(actual_exit=False))
reject_receipt("unknown_stream_completion",lambda r:r.update(output_complete=False))
reject_receipt("unknown_capture_state",lambda r:r.update(state="STREAMS_UNKNOWN"))
reject_receipt("resource_reason",lambda r:r.update(reason="TIMEOUT"))
reject_receipt("missing_reason",lambda r:r.pop("reason"))
reject_receipt("missing_process_group",lambda r:r.pop("process_group"))
reject_receipt("boolean_process_group",lambda r:r.update(process_group=True))
reject_receipt("false_capture_byte_count",lambda r:r["stdout"].update(bytes=False))
reject_receipt("wrong_capture_digest",lambda r:r["stdout"].update(sha256="0"*64))
reject_receipt("nonfinite_completion",lambda r:r.update(completed_at=float("nan")))
reject_capture("wrong_graph",lambda v:v.update(sourceRowsSha256="0"*64))
reject_capture("unexpected_root_field",lambda v:v.update(nativeAuthority=True))
reject_capture("production_claim",lambda v:v.update(productionQualified=True))
reject_capture("native_adapter_qualification_claim",lambda v:v["result"].update(nativeResourcesQualified=True))
reject_capture("native_core_qualification_claim",lambda v:v["result"]["core"].update(benchmarkQualified=True))
reject_capture("owner_uncertainty",lambda v:v["result"]["core"].update(outcome="HELD_UNKNOWN"))
reject_capture("missing_balance_barrier",lambda v:v["result"]["core"].update(completedBalanceBarriers=2))
reject_capture("sync_cache_contract",lambda v:v["result"]["core"].update(balanceContract="CACHED"))
reject_capture("pending_balance",lambda v:v["result"]["core"].update(pendingBalanceReads=1))
reject_capture("boolean_zero_counter",lambda v:v["result"]["core"].update(pendingOperations=False))
reject_capture("incomplete_recording",lambda v:v["result"]["core"]["recording"].update(recordingState="INCOMPLETE"))
reject_capture("mismatched_balance",lambda v:v["result"]["core"]["recording"]["ledgerBalanceChecks"].update(mismatches=1))
reject_capture("boolean_balance_mismatch_count",lambda v:v["result"]["core"]["recording"]["ledgerBalanceChecks"].update(mismatches=False))
reject_capture("wrong_lane",lambda v:v["evidence"][1].update(laneId="lane.other"))
reject_capture("missing_lane",lambda v:v["evidence"].pop())
reject_capture("incomplete_final_trace",lambda v:v["result"]["lanes"][0].update(serviceWriterTraceBeforeCloseObserved=False))
reject_capture("unknown_pair_launch",lambda v:v["evidence"][0]["pairSnapshot"].update(launchUnknown=True))
reject_capture("pair_not_closed",lambda v:v["evidence"][0]["pairSnapshot"].update(phase="HELD"))
reject_capture("reference_budget_overflow",lambda v:v["evidence"][0]["pairSnapshot"].update(referenceCandidates=32769))
reject_capture("wrong_original_cohort_count",lambda v:v["evidence"][0]["pairSnapshot"].update(measuredReserved=3))
reject_capture("missing_ipc_disconnect",lambda v:v["evidence"][0]["pairSnapshot"]["children"][0].update(disconnected=False))
reject_capture("child_failed_exit",lambda v:v["evidence"][0]["pairSnapshot"]["children"][0].update(exitCode=1))
reject_capture("boolean_child_exit",lambda v:v["evidence"][0]["pairSnapshot"]["children"][0].update(exitCode=False))
reject_capture("child_pending_command",lambda v:v["evidence"][0]["pairSnapshot"]["children"][0].update(pending=1))
reject_capture("child_missing_eof",lambda v:v["evidence"][0]["pairSnapshot"]["children"][0]["stdout"].update(eof=False))
reject_capture("child_stream_overflow",lambda v:v["evidence"][0]["pairSnapshot"]["children"][0]["stdout"].update(overflow=True))
reject_capture("boolean_child_stream_byte_count",lambda v:v["evidence"][0]["pairSnapshot"]["children"][0]["stdout"].update(observedBytes=False))
reject_capture("wrong_child_stream_digest",lambda v:v["evidence"][0]["privateStreams"][0]["stdout"].update(sha256="0"*64))
reject_capture("empty_writer_trace",lambda v:v["evidence"][0].update(serviceWriterIntervals=[]))
reject_capture("writer_clock_reversal",lambda v:v["evidence"][0]["serviceWriterIntervals"][0].update(afterCommitNs="99"))
reject_capture("writer_elapsed_mismatch",lambda v:v["evidence"][0]["serviceWriterIntervals"][0].update(bracketElapsedNs="9"))
reject_capture("writer_private_operation_field",lambda v:v["evidence"][0]["serviceWriterIntervals"][0].update(operation="private-id"))
reject_capture("payer_missing_close_timing",lambda v:v["evidence"][0]["payerOperationTimings"].pop())
reject_capture("payer_late_timeout_response",lambda v:v["evidence"][0]["payerOperationTimings"][0].update(lateAfterTimeout=True))
reject_capture("payer_wrong_sequence",lambda v:v["evidence"][0]["payerOperationTimings"][0].update(sequence=9))
reject_capture("payer_clock_reversal",lambda v:v["evidence"][0]["payerOperationTimings"][0].update(endNs="0"))
reject_capture("payer_wrong_clock_domain",lambda v:v["evidence"][0]["payerOperationTimings"][0].update(clockDomain="PARENT"))
reject_capture("payer_wrong_close_status",lambda v:v["evidence"][0]["payerOperationTimings"][-2].update(status="OBSERVED"))
reject_capture("falsely_complete_plan",lambda v:v["result"]["core"].update(plannedCallsCompleted=False))
def parent_stderr(self):
    with self.assertRaises(ValueError):validate(declaration(),stderr=b"UNKNOWN\n")
check("uninterpreted_parent_failure_stderr_is_not_success",parent_stderr)
def private_base64(self):
    for raw in (b'{"v":1,"v":2}',b'{"v":NaN}',b'{"v":1.0}'):
        with self.assertRaises(ValueError):d.decode(raw,65536)
check("strict_capture_json_rejects_duplicate_keys_floats_and_nan",private_base64)

def storage_state(decision):
    return dict(id="b"*32,store_id="a"*32,state="CLOSED",outcome="SUCCESS"),dict(mode="APPLY_OWNED_ONLY",
        tasks=[dict(id="b"*32,decision=decision)],objects=[])
def storage_hold(self):
    closed,cleanup=storage_state("HOLD");result=d.closed_storage_data(closed,cleanup,"a"*32,"b"*32)
    self.assertIs(result["taskClosed"],True);self.assertEqual(result["storageDecision"],"HOLD")
    self.assertIs(result["storageCleanupQualified"],False);self.assertIs(result["nativeResourcesQualified"],False)
    self.assertIs(result["childCreatedFilesAdopted"],False);self.assertIs(result["historicalCleanupPerformed"],False)
check("closed_successful_task_does_not_upgrade_storage_hold",storage_hold)
def scoped_cleanup(self):
    for decision in ("CLEANED","ALREADY_CLEAN"):
        closed,cleanup=storage_state(decision)
        self.assertIs(d.closed_storage_data(closed,cleanup,"a"*32,"b"*32)["nativeResourcesQualified"],False)
check("even_owned_cleanup_receipts_are_not_native_or_historical_authority",scoped_cleanup)
def wrong_storage(self):
    for edit in (lambda c,k:c.update(outcome="FAILURE"),lambda c,k:c.update(state="OPEN"),
                 lambda c,k:k["tasks"][0].update(id="c"*32),lambda c,k:k.update(objects=[{}]),
                 lambda c,k:k["tasks"][0].update(decision="UNKNOWN")):
        c,k=storage_state("HOLD");edit(c,k)
        with self.assertRaises(ValueError):d.closed_storage_data(c,k,"a"*32,"b"*32)
check("foreign_unknown_failed_or_unclosed_storage_is_refused",wrong_storage)


def new_bounds(self):
    value=d.resource_plan(WORK)
    self.assertEqual(value["windowMarkerCommandsMaximum"],4)
    self.assertEqual(value["serviceWriterRowsMaximum"],248)
    self.assertEqual(value["serviceChildClockReadsMaximum"],996)
    self.assertEqual(value["ipcTicketsMaximumPerChild"],5)
    self.assertEqual(value["nodeStdoutLimit"],1048576)
    self.assertEqual(value["privateParentTimingEventsMaximum"],900)
    self.assertEqual(value["privateParentTimingBytesReserved"],238592)
    self.assertEqual(value["parentTimingSourceClockReadsAdditional"],0)
    self.assertEqual(value["taskQuotaBytes"],71*1048576)
    self.assertIs(value["captureJsonTreeCopyRequired"],False)
    self.assertIs(value["captureHeapByteBoundEstablished"],False)
check("new_private_attribution_and_marker_capture_budget_is_explicit",new_bounds)
def oversize_capture(self):
    v=clone(WORK);v["laneIds"]=["lane."+str(i)for i in range(16)]
    v["plan"].update(warmupCallsPerLane=0,measurementCallsPerLane=255,maxLedgerTransactionsPerOperation=1)
    v["recordingLimits"].update(maxSamplesPerPhase=4096,maxInFlightPerPhase=16)
    b=d.resource_plan(v)
    self.assertIs(b["theoreticalCaptureMayExceedEntryCap"],True)
    self.assertEqual(d.capture_plan(v)["plan"]["measurementCallsPerLane"],255)
    self.assertGreater(b["logicalFullCaptureBytesMaximum"],b["nodeEntryCaptureMaximum"])
check("oversize_source_plan_remains_visible_and_is_not_silently_shrunk",oversize_capture)
def concrete_percentiles(self):
    s=d.metric_summary([3,3,5,6,7,8,3])
    self.assertEqual(s,dict(samples=7,min="3",p50="5",p95="8",p99="8",max="8"))
    result=validate(declaration())
    self.assertIs(result["writerWindowAndCohortDataRecomputed"],True)
check("actual_controller_recomputes_fixed_known_whole_bracket_percentiles",concrete_percentiles)
def rank_contacts(self):
    for before,after,kind in ((10,90,"BEFORE"),(90,110,"CROSSES_OPEN"),(110,190,"INSIDE"),
        (190,210,"CROSSES_STOP"),(90,210,"CROSSES_BOTH"),(210,220,"AFTER"),(100,110,"TOUCHES_BOUNDARY"),
        (90,100,"TOUCHES_BOUNDARY"),(200,210,"TOUCHES_BOUNDARY"),(100,200,"TOUCHES_BOUNDARY")):
        self.assertEqual(d.classify_window(before,after,100,200),kind)
check("same_child_boundary_contacts_never_invent_event_order",rank_contacts)
def metric_hooks(self):
    hooks=[]
    class H:
        def __lt__(self,other):hooks.append(1);raise RuntimeError("unreachable")
    for value in ([H()],[True],[1.0],[-1],[2**128],tuple([1])):
        with self.assertRaises(ValueError):d.metric_summary(value)
    with self.assertRaises(ValueError):d.classify_window(H(),1,2,3)
    self.assertEqual(hooks,[])
check("metric_helpers_refuse_coercion_comparison_hooks_and_unbounded_values",metric_hooks)
def expected_run(self):
    raw,err,receipt=capture(declaration())
    for run_id in ("cd"*32,None,True):
        with self.assertRaises(ValueError):d.validate_capture_data(raw,err,receipt,WORK,run_id)
check("fresh_manager_run_id_is_independent_of_returned_capture_context",expected_run)
def exact_frame(self):
    raw,err,receipt=capture(declaration())
    for malformed in (b" "+raw,raw+b"\n",raw[:-1]):
        r=clone(receipt);r["stdout"]=dict(sha256=d.sha(malformed),bytes=len(malformed))
        with self.assertRaises(ValueError):d.validate_capture_data(malformed,err,r,WORK,RUN_ID)
check("one_complete_exact_json_frame_does_not_accept_prefix_or_missing_newline",exact_frame)
def malformed_storage(self):
    closed,cleanup=storage_state("HOLD")
    for value in (None,True,1,["not-a-task"]):
        changed=clone(cleanup);changed["tasks"]=[value]
        with self.assertRaises(ValueError):d.closed_storage_data(closed,changed,"a"*32,"b"*32)
    with self.assertRaises(ValueError):d.closed_storage_data(closed,cleanup,"wrong","b"*32)
check("storage_receipt_data_cannot_enter_unknown_nested_task_types",malformed_storage)

reject_capture("pending_window_open",lambda v:v["result"]["core"].update(pendingWindowStarts=1))
reject_capture("pending_window_stop",lambda v:v["result"]["core"].update(pendingWindowStops=1))
reject_capture("window_barrier_still_pending",lambda v:v["result"]["core"].update(windowOpenBarrierPending=True))
reject_capture("missing_stop_ack",lambda v:v["result"]["core"].update(windowStopsObserved=1))
reject_capture("wrong_core_version",lambda v:v["result"]["core"].update(capacityWorkloadOwnerVersion=2))
reject_capture("old_core_scope",lambda v:v["result"]["core"].update(scope="TRUSTED_ASYNC_SOURCE_LANES_NOT_NATIVE_QUALIFICATION"))
reject_capture("core_plan_boolean_coercion",lambda v:v["result"]["core"]["plan"].update(warmupCallsPerLane=True))
reject_capture("source_measured_unknown",lambda v:v["result"]["lanes"][0].update(measurementUnknown=True))
reject_capture("source_pair_measured_unknown",lambda v:v["evidence"][0]["pairSnapshot"].update(measurementUnknown=True))
reject_capture("pair_missing_open_ack",lambda v:v["evidence"][0]["pairSnapshot"].update(windowOpenAcknowledged=False))
reject_capture("pair_missing_fresh_balance",lambda v:v["evidence"][0]["pairSnapshot"].update(freshBalanceReads=2))
reject_capture("public_window_alignment_claim",lambda v:v["result"].update(parentAndServiceWindowsAligned=True))
reject_capture("bracket_clipping_claim",lambda v:v["result"].update(writerBracketsClipped=True))
reject_capture("window_native_qualification_claim",lambda v:v["result"].update(measurementWindowIsolationQualified=True))
reject_capture("old_capture_version",lambda v:v.update(captureVersion=2))
reject_capture("zero_parent_window",lambda v:v["result"]["core"]["recording"].update(measurementNanoseconds="0"))
reject_capture("missing_attribution",lambda v:v["evidence"][0].pop("serviceWriterAttribution"))
reject_capture("short_attribution",lambda v:v["evidence"][0]["serviceWriterAttribution"].pop())
reject_capture("foreign_service_window_run",lambda v:v["evidence"][0]["serviceMeasurementWindow"]["context"].update(runId="cd"*32))
reject_capture("foreign_service_window_lane",lambda v:v["evidence"][0]["serviceMeasurementWindow"]["context"].update(laneId="foreign"))
reject_capture("foreign_service_window_source",lambda v:v["evidence"][0]["serviceMeasurementWindow"]["context"].update(sourceRowsSha256="0"*64))
reject_capture("parent_clock_in_service_window",lambda v:v["evidence"][0]["serviceMeasurementWindow"].update(clockDomain="PARENT"))
reject_capture("source_window_unknown",lambda v:v["evidence"][0]["serviceMeasurementWindow"].update(unknown=True))
reject_capture("source_window_open_only",lambda v:v["evidence"][0]["serviceMeasurementWindow"].update(phase="OPEN"))
reject_capture("owner_close_fallback_is_not_stop",lambda v:v["evidence"][0]["serviceMeasurementWindow"].update(stopCause="OWNER_CLOSE_FALLBACK"))
reject_capture("service_window_clock_counter_false",lambda v:v["evidence"][0]["serviceMeasurementWindow"].update(clockReads=2))
reject_capture("wrong_original_digest",lambda v:v["evidence"][0]["serviceWriterAttribution"][1].update(originalCommandDigest="0"*64))
reject_capture("foreign_original_ordinal",lambda v:v["evidence"][0]["serviceWriterAttribution"][1].update(originalOrdinal=1))
reject_capture("false_control_digest",lambda v:v["evidence"][0]["serviceWriterAttribution"][0].update(originalCommandDigest="f"*64))
reject_capture("wrong_window_class",lambda v:v["evidence"][0]["serviceWriterAttribution"][2].update(windowClass="AFTER"))
reject_capture("clipped_private_elapsed",lambda v:v["evidence"][0]["serviceWriterAttribution"][2].update(bracketElapsedNs="1"))
reject_capture("false_changed_bit",lambda v:v["evidence"][0]["serviceWriterAttribution"][2].update(changed=False))
reject_capture("missing_completed_original_recording",lambda v:v["result"]["core"]["recording"]["cohorts"]["MEASUREMENT"]["phases"]["FUNDED_CALL"].update(succeeded=7))
reject_capture("false_total_writer_percentile",lambda v:v["result"]["lanes"][0]["writerBracketNs"].update(p50="99"))
reject_capture("false_group_writer_percentile",lambda v:v["result"]["lanes"][0]["serviceChildWindowWriterTrace"]["cohorts"]["MEASUREMENT"]["INSIDE"]["writerBracketNs"].update(p50="99"))
reject_capture("false_group_inside_percentile",lambda v:v["result"]["lanes"][0]["serviceChildWindowWriterTrace"]["cohorts"]["MEASUREMENT"]["INSIDE"]["insideWriterTransactionNs"].update(p99="99"))
reject_capture("false_group_sample_count",lambda v:v["result"]["lanes"][0]["serviceChildWindowWriterTrace"]["cohorts"]["MEASUREMENT"]["INSIDE"].update(writerIntervals=3))
reject_capture("false_group_changed_count",lambda v:v["result"]["lanes"][0]["serviceChildWindowWriterTrace"]["cohorts"]["MEASUREMENT"]["INSIDE"].update(changedIntervals=3))
reject_capture("incomplete_window_summary",lambda v:v["result"]["lanes"][0]["serviceChildWindowWriterTrace"].update(status="INCOMPLETE_DECLARED_WINDOW_TRACE_DATA"))
reject_capture("false_window_elapsed",lambda v:v["result"]["lanes"][0]["serviceChildWindowWriterTrace"].update(declaredWindowElapsedNs="1"))
reject_capture("private_id_in_summary",lambda v:v["result"]["lanes"][0]["serviceChildWindowWriterTrace"].update(rawIdentifiersIncluded=True))



def parent_capsule(completed=5):
    v=declaration(completed)
    return v["parentTimingData"],v["result"]["core"]["recording"]
def reject_parent(name,edit):
    def run(self):
        capsule,recording=parent_capsule();edit(capsule,recording)
        with self.assertRaises(ValueError):d.validate_parent_timing_data(capsule,recording,WORK,RUN_ID)
    check("parent_trace_rejects_"+name,run)
def cross_language(self):
    for completed in(5,2):
        capsule,recording=parent_capsule(completed)
        value=d.validate_parent_timing_data(capsule,recording,WORK,RUN_ID)
        self.assertEqual(value,capsule["check"])
        self.assertEqual(value["observationsChecked"],2+2*completed)
        self.assertIs(value["allPhaseSummariesRecomputed"],True)
        self.assertIs(value["nativeEventsAuthenticated"],False)
        self.assertEqual(value["authority"],"NONE")
    _,partial=parent_capsule(2)
    self.assertEqual(partial["phases"]["FUNDED_CALL"]["successfulWindowCompletionRatio"]["numerator"],"0")
check("independent_python_matches_genuine_core_and_js_checker_for_full_and_spillout_data",cross_language)
reject_parent("foreign_run",lambda c,r:c["context"].update(runId="cd"*32))
reject_parent("foreign_source",lambda c,r:c["context"].update(sourceRowsSha256="0"*64))
reject_parent("reordered_lanes",lambda c,r:c["context"]["laneIds"].reverse())
reject_parent("missing_context",lambda c,r:c.pop("context"))
reject_parent("unknown_check",lambda c,r:c.update(status="UNKNOWN_OR_MISMATCHED_PARENT_TRACE"))
reject_parent("null_trace",lambda c,r:c.update(trace=None))
reject_parent("null_entry_check",lambda c,r:c.update(check=None))
reject_parent("boolean_version",lambda c,r:c.update(parentTimingCaptureVersion=True))
reject_parent("extra_capture_field",lambda c,r:c.update(payment="forbidden"))
reject_parent("unknown_trace",lambda c,r:c["trace"].update(unknown=True))
reject_parent("foreign_clock",lambda c,r:c["trace"].update(clockDomain="SERVICE_CHILD_LOCAL"))
reject_parent("changed_limits",lambda c,r:c["trace"]["limits"].update(maxSamplesPerPhase=129))
reject_parent("expanded_event_limit",lambda c,r:c["trace"].update(maximumEvents=901))
reject_parent("empty_events",lambda c,r:c["trace"].update(events=[]))
reject_parent("missing_finish",lambda c,r:c["trace"]["events"].pop(3))
reject_parent("boolean_sequence",lambda c,r:c["trace"]["events"][0].update(sequence=True))
reject_parent("bad_sequence",lambda c,r:c["trace"]["events"][0].update(sequence=2))
reject_parent("repeated_boundary",lambda c,r:c["trace"]["events"][-1].update(kind="START_MEASUREMENT"))
reject_parent("reordered_events",lambda c,r:c["trace"]["events"].reverse())
reject_parent("unbounded_timestamp",lambda c,r:c["trace"]["events"][0].update(atNs=str(2**128)))
reject_parent("noncanonical_timestamp",lambda c,r:c["trace"]["events"][0].update(atNs="01"))
reject_parent("extra_event_field",lambda c,r:c["trace"]["events"][0].update(requestId="not-allowed"))
reject_parent("native_claim",lambda c,r:c["trace"].update(nativeEventsAuthenticated=True))
reject_parent("raw_ids_claim",lambda c,r:c["trace"].update(rawIdentifiersIncluded=True))
reject_parent("post_stop_claim",lambda c,r:c["trace"].update(postStopLedgerTraceIncluded=True))
reject_parent("recording_version_coercion",lambda c,r:r.update(capacityWindowRecorderVersion=True))
reject_parent("recording_extra",lambda c,r:r.update(productionQualified=True))
reject_parent("measurement_time",lambda c,r:r.update(measurementNanoseconds="1"))
reject_parent("funding_percentile",lambda c,r:r["cohorts"]["WARMUP"]["phases"]["FUNDING"]["successfulLatencyNanoseconds"].update(p99="999"))
reject_parent("call_percentile",lambda c,r:r["cohorts"]["MEASUREMENT"]["phases"]["FUNDED_CALL"]["terminalLatencyNanoseconds"].update(p50="999"))
reject_parent("counter_coercion",lambda c,r:r.update(refusedStarts=False))
reject_parent("ratio_denominator",lambda c,r:r["phases"]["FUNDED_CALL"]["successfulWindowCompletionRatio"].update(denominator="1"))
reject_parent("ratio_numerator",lambda c,r:r["phases"]["FUNDED_CALL"]["successfulWindowCompletionRatio"].update(numerator="1"))
reject_parent("balance_stage",lambda c,r:r["ledgerBalanceChecks"]["stages"]["DRAINING"].update(samples=0))
reject_parent("entry_check_counter",lambda c,r:c["check"].update(observationsChecked=0))
reject_parent("entry_check_boolean",lambda c,r:c["check"].update(parentTimingTraceDataVersion=True))
reject_parent("entry_check_extra",lambda c,r:c["check"].update(retryAllowed=True))
def no_parent_hooks(self):
    hooks=[]
    class Hooked(dict):
        def items(self):hooks.append(1);raise RuntimeError("MUST_NOT_EXECUTE")
    capsule,recording=parent_capsule()
    capsule["trace"]["events"][0]=Hooked(capsule["trace"]["events"][0])
    with self.assertRaises(ValueError):d.validate_parent_timing_data(capsule,recording,WORK,RUN_ID)
    self.assertEqual(hooks,[])
check("parent_trace_does_not_execute_subclass_hooks",no_parent_hooks)
def bytes_reserved(self):
    b=d.resource_plan(WORK)
    self.assertEqual(b["logicalFullCaptureBytesMaximum"],1022976)
    self.assertLessEqual(b["logicalFullCaptureBytesMaximum"],b["nodeStdoutLimit"])
    self.assertEqual(b["parentTimingWrapperBytesReserved"],8192)
    self.assertEqual(b["parentTimingBytesPerEventReserved"],256)
    self.assertIs(b["parentTimingCheckInsideActualEntrySourceAuthored"],True)
    self.assertIs(b["effectsExecuted"],False)
check("parent_capture_reservation_covers_full_trace_without_silent_workload_reduction",bytes_reserved)

if __name__=="__main__":
    output=io.StringIO()
    result=unittest.TextTestRunner(stream=output,verbosity=0).run(unittest.defaultTestLoader.loadTestsFromTestCase(Selected))
    unchanged=all(read(repo/name)==pair for name,pair in sources.items())
    print(json.dumps(dict(event="P4_MANAGED_WORKLOAD_V3_SELECTED_DATA_NOT_EXECUTION",testsRun=result.testsRun,
        failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),successful=result.wasSuccessful()and unchanged,
        sourcePins=PINS,sourcePinsUnchanged=unchanged,syntheticCaptureDataOnly=True,
        nativeExecuted=False,managerImported=False,privateRootsOpened=False,SDK=False,SQLite=False,keys=False,
        signatures=False,nonceSearch=False,sockets=False,nativeChildren=False,qualificationScratchCreated=False,authority="NONE")),flush=True)
    if not result.wasSuccessful():sys.stderr.write(output.getvalue())
    sys.exit(0 if result.wasSuccessful()and unchanged else 1)

