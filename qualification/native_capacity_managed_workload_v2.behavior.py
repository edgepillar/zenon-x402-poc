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

PINS = {
    "qualification/native_capacity_managed_workload_v2.py": "28f3c6efb23e2531406ec93dbeb3ef96c391f75a312d53d99b8464e631218e42",
    "qualification/run-capacity-native-workload-v2.local.py": "6f05fb04847f03ebbe294bf202f1d7370cbf91899553505228e2b196e778e42d",
    "qualification/capacity-native-workload-v2.plan.json": "4806f98a4dfbfcc01c6365ce271319f172f2b23534026990bc2e783434506b2b",
}
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
d = load("qualification/native_capacity_managed_workload_v2.py","capacity_managed_v2_tests_data")
l = load("qualification/run-capacity-native-workload-v2.local.py","capacity_managed_v2_tests_control")
WORK = d.capture_plan(d.decode(sources["qualification/capacity-native-workload-v2.plan.json"][0],65536))
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
def declaration(completed=5):
    row_list=[];evidence=[]
    for lane in WORK["laneIds"]:
        children=[dict(role=role,exited=True,closed=True,disconnected=True,exitCode=0,signal=None,fault=False,pending=0,
            stdout=facts(),stderr=facts())for role in ("PAYER","SERVICE")]
        intervals=[dict(ordinal=1,commandClass="CONTROL",changed=True,beforeBeginNs="100",afterBeginNs="101",
            beforeCommitNs="102",afterCommitNs="103",bracketElapsedNs="3",insideTransactionElapsedNs="1")]
        kinds=["INIT","OPEN","PREPARE","COMMIT","SUBMIT","BIND"]+["EXECUTE"]*completed+["CLOSE","RELEASE_IPC"]
        commands=[dict(sequence=i,kind=kind,status="OBSERVED_RETURNED_CLOSE"if kind=="CLOSE"else"RELEASING_IPC"if kind=="RELEASE_IPC"else"OBSERVED",
            startNs=str(i*10),endNs=str(i*10+1),lateAfterTimeout=False,clockDomain="PAYER_CHILD_LOCAL",
            timingKind="CHILD_LOCAL_MONOTONIC_OPERATION_NOT_SQL_LATENCY")for i,kind in enumerate(kinds,1)]
        row_list.append(dict(laneId=lane,pairAcquisitionEntered=True,balanceReadsEntered=3,pendingBalanceReads=0,
            closeStatus="RETURNED",held=False,serviceWriterTraceBeforeCloseObserved=True,serviceWriterIntervals=1))
        evidence.append(dict(laneId=lane,pairSnapshot=dict(phase="CLOSED",held=False,completed=completed,warmupReserved=1,
            measuredReserved=completed-1,activeOperation=False,referenceCandidates=1,referenceWindows=1,
            balancesObserved=True,launchAttempts=2,launchUnknown=False,historicalCloseStatus="CLOSED",children=children,
            nativeQualified=False,capacityQualified=False,authority="NONE"),serviceWriterIntervals=intervals,
            payerOperationTimings=commands,privateStreams=[dict(role=role,stdout=stream(),stderr=stream())for role in ("PAYER","SERVICE")]))
    core=dict(outcome="OBSERVED_OWNERS_RETURNED",plan=clone(WORK["plan"]),laneCount=2,returnedCloses=2,unknownCloses=0,pendingCloses=0,
        pendingOperations=0,pendingLedgerBoundaries=0,pendingBalanceReads=0,balanceBarrierPending=False,
        completedBalanceBarriers=3,balanceReadAttempts=6,balanceContract="GENUINE_PROMISE_FRESH_READ_NOT_SYNC_CACHE",
        authority="NONE",nativeClockAuthenticated=False,nativeResourcesQualified=False,benchmarkQualified=False,capacityQualified=False,
        plannedCallsCompleted=completed==5,recording=dict(recordingState="COMPLETE",recordingIssue=None,pendingObservations=0,
            capacityQualification="NOT_ESTABLISHED",sustainableThroughput="NOT_ESTABLISHED",measurementNanoseconds="1000000",
            ledgerBalanceChecks=dict(samples=6,mismatches=0)))
    result=dict(nativeCapacityWorkloadAdapterVersion=2,status="OBSERVED_COMPONENT_ONLY",core=core,lanes=row_list,
        sustainedCapacityQualified=False,nativeEventsAuthenticated=False,nativeResourcesQualified=False,nativeOsNetworkSandbox=False,
        productionQualified=False,childClockDomainsMerged=False,ledgerTimeInferredFromPromise=False,authority="NONE")
    return dict(captureVersion=2,kind="PRIVATE_FULL_NATIVE_CAPACITY_COMPONENT_CAPTURE_NOT_PRODUCTION",
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
    return d.validate_capture_data(raw,err,receipt,WORK)
def matches(self,completed):
    result=validate(declaration(completed))
    self.assertEqual(result["completedOriginalCalls"],2*completed)
    self.assertEqual(result["childClosesObservedAsData"],4)
    self.assertIs(result["dataOnlyNotNativeAuthentication"],True)
    for field in ("nativeResourcesQualified","storageCleanupQualified","sustainableCapacityQualified","chainAuthenticated","productionQualified"):
        self.assertIs(result[field],False)
check("synthetic_complete_capture_stays_data_not_native_proof",lambda self:matches(self,5))
check("window_stop_preserves_partial_original_counts_without_replacement",lambda self:matches(self,2))
def no_clock_merge(self):
    v=declaration();i=v["evidence"][0]["serviceWriterIntervals"][0]
    start=10**30
    i.update(beforeBeginNs=str(start),afterBeginNs=str(start+1),beforeCommitNs=str(start+2),afterCommitNs=str(start+3))
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
    closed,cleanup=storage_state("HOLD");result=l.closed_storage_data(closed,cleanup,"a"*32,"b"*32)
    self.assertIs(result["taskClosed"],True);self.assertEqual(result["storageDecision"],"HOLD")
    self.assertIs(result["storageCleanupQualified"],False);self.assertIs(result["nativeResourcesQualified"],False)
    self.assertIs(result["childCreatedFilesAdopted"],False);self.assertIs(result["historicalCleanupPerformed"],False)
check("closed_successful_task_does_not_upgrade_storage_hold",storage_hold)
def scoped_cleanup(self):
    for decision in ("CLEANED","ALREADY_CLEAN"):
        closed,cleanup=storage_state(decision)
        self.assertIs(l.closed_storage_data(closed,cleanup,"a"*32,"b"*32)["nativeResourcesQualified"],False)
check("even_owned_cleanup_receipts_are_not_native_or_historical_authority",scoped_cleanup)
def wrong_storage(self):
    for edit in (lambda c,k:c.update(outcome="FAILURE"),lambda c,k:c.update(state="OPEN"),
                 lambda c,k:k["tasks"][0].update(id="c"*32),lambda c,k:k.update(objects=[{}]),
                 lambda c,k:k["tasks"][0].update(decision="UNKNOWN")):
        c,k=storage_state("HOLD");edit(c,k)
        with self.assertRaises(ValueError):l.closed_storage_data(c,k,"a"*32,"b"*32)
check("foreign_unknown_failed_or_unclosed_storage_is_refused",wrong_storage)

if __name__=="__main__":
    output=io.StringIO()
    result=unittest.TextTestRunner(stream=output,verbosity=0).run(unittest.defaultTestLoader.loadTestsFromTestCase(Selected))
    unchanged=all(read(repo/name)==pair for name,pair in sources.items())
    print(json.dumps(dict(event="P4_MANAGED_WORKLOAD_V2_SELECTED_DATA_NOT_EXECUTION",testsRun=result.testsRun,
        failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),successful=result.wasSuccessful()and unchanged,
        sourcePins=PINS,sourcePinsUnchanged=unchanged,syntheticCaptureDataOnly=True,
        nativeExecuted=False,managerImported=False,privateRootsOpened=False,SDK=False,SQLite=False,keys=False,
        signatures=False,nonceSearch=False,sockets=False,nativeChildren=False,qualificationScratchCreated=False,authority="NONE")),flush=True)
    if not result.wasSuccessful():sys.stderr.write(output.getvalue())
    sys.exit(0 if result.wasSuccessful()and unchanged else 1)
