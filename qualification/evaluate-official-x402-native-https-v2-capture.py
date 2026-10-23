"""Read-only audit of one preserved native HTTPS v2 capture.

No Node, OpenSSL, sockets, subprocesses, storage-manager imports or mutations.
The original launcher/task outcome remains unchanged. This evaluator separates
native test results from a launcher's TAP-only classification mistake.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys

RAW_SHA = "5de2539bc896f4ebcd9d59fb174468b3a03503a894a511ba87eefa98edf38fe3"
EMPTY_SHA = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
SOURCE_COMMIT = "6bf0c1b80cad61c1c1e7ec17453f773414b25bd6"
SOURCE_SEAL = "7f96ec3a80d5f507dd30c1171613f73974790a3255e28438e75cdcc05fa6829b"
LAUNCHER_SHA = "7425233377f561ae1d9a0b7ab16fb55bba20dfe1bba9495a4fbb122f28c6950b"
NAMES = [
    "native HTTPS original pending request resumes once and replays acknowledgement without another settle",
    "native HTTPS pending budget stays exhausted without a new first settlement",
    "native HTTPS changed context is refused while its original pending continuation survives",
]
SCENARIOS = [
    "NATIVE_PENDING_SUCCESS_EXACT_REPLAY",
    "NATIVE_PENDING_EXHAUSTED_ORIGINAL_RETAINED",
    "NATIVE_CHANGED_CONTEXT_ORIGINAL_CONTINUATION_RETAINED",
]


def need(value, code):
    if not value:
        raise ValueError(code)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def read(path, cap=262144):
    path = Path(path)
    for p in [path] + list(path.parents):
        need(not stat.S_ISLNK(p.lstat().st_mode), "LINK")
    s = path.lstat()
    need(stat.S_ISREG(s.st_mode) and s.st_nlink == 1 and s.st_uid == os.getuid()
         and s.st_size <= cap, "FILE")
    pin = (s.st_dev, s.st_ino, s.st_uid, s.st_mode, s.st_nlink,
           s.st_size, s.st_mtime_ns, s.st_ctime_ns)
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        raw = stream.read(cap + 1)
        after = os.fstat(stream.fileno())
    final = path.lstat()
    for s in (after, final):
        need((s.st_dev, s.st_ino, s.st_uid, s.st_mode, s.st_nlink,
              s.st_size, s.st_mtime_ns, s.st_ctime_ns) == pin, "IDENTITY")
    need(len(raw) == s.st_size, "LENGTH")
    return raw


def load(path, cap=262144):
    return json.loads(read(path, cap))


def capture(raw):
    need(len(raw) == 3869 and digest(raw) == RAW_SHA, "EXACT_CAPTURE")
    lines = raw.decode("utf-8").splitlines()
    check = chr(0x2714) + " "
    info = chr(0x2139) + " "
    success = [line for line in lines if line.startswith(check)]
    names = [re.sub(r" \([0-9]+(?:\.[0-9]+)?ms\)$", "", line[len(check):])
             for line in success]
    need(names == NAMES, "SELECTED_RESULTS")
    summaries = {}
    diagnostics = []
    for line in lines:
        if line.startswith(info + "{"):
            diagnostics.append(json.loads(line[len(info):]))
        elif line.startswith(info):
            key, value = line[len(info):].split(" ", 1)
            need(key not in summaries, "DUPLICATE_SUMMARY")
            summaries[key] = value
        elif not (line.startswith(check) or line.startswith("# pinned-native-https-v2-namespace ")):
            raise ValueError("UNRECOGNIZED_LINE")
    need(set(summaries) == {"tests", "suites", "pass", "fail", "cancelled", "skipped", "todo", "duration_ms"},
         "SUMMARY_FIELDS")
    need({k: summaries[k] for k in summaries if k != "duration_ms"} ==
         {"tests": "3", "suites": "0", "pass": "3", "fail": "0",
          "cancelled": "0", "skipped": "0", "todo": "0"}, "SUMMARY_COUNTS")
    need(re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", summaries["duration_ms"]), "DURATION")
    markers = [json.loads(line.split("# pinned-native-https-v2-namespace ", 1)[1])
               for line in lines if line.startswith("# pinned-native-https-v2-namespace ")]
    need(len(markers) == 1, "NAMESPACE_MARKER")
    namespace = markers[0]
    expected_namespace = {
        "profileKind": "OFFICIAL_X402_NATIVE_HTTPS_THREE_CASE_PINNED_NODE24_V2",
        "expectedCases": 3, "profileVersion": 2, "sourceRowsSha256": SOURCE_SEAL,
        "inputsVerifiedBeforeFixture": 36, "declaredSourceBytes": 701939,
        "resolveCalls": 98, "bareImportOverrideHits": 3, "declaredFilesResolved": 32,
        "sourceTransforms": 0, "ordinaryInstalledNamespaceQualified": False,
        "noNetworkOrOsSandboxClaim": True,
    }
    need(namespace == expected_namespace, "NAMESPACE_FACTS")
    need(len(diagnostics) == 3 and [d["scenario"] for d in diagnostics] == SCENARIOS,
         "DIAGNOSTIC_SCENARIOS")
    for d, expected_count in zip(diagnostics, [7, 11, 15]):
        need(d["kind"] == "OFFICIAL_X402_NATIVE_HTTPS_COMPOSITION_V2" and d["version"] == 2
             and d["coreVersion"] == "2.23.0" and d["zodVersion"] == "3.25.76"
             and d["nativeConnectionAttemptsTotal"] == d["authenticatedTlsHandshakesTotal"] == expected_count
             and d["tls"] == "TLSv1.3" and d["alpn"] == "http/1.1"
             and d["nativeClosePhase"] == "CLOSED", "NATIVE_FACTS")
        for key in ["actualNativeServerFactory", "actualIngressOwner", "actualOfficialServerAndClient",
                    "loopbackOnly", "serviceSessionDeclaredOnly", "originalPaymentHeaderAndTupleRetained"]:
            need(d[key] is True, "FACT_TRUE")
        for key in ["serviceCalls", "trackedSockets", "trackedRequests", "trackedHandlers", "ownedTimers",
                    "sql", "capabilityKeys", "capabilitySignatures", "walletKeys", "paymentSignatures",
                    "nonceSearch", "realPrepare", "payments"]:
            need(d[key] == 0, "ZERO_FACT")
        need(d["applicationFactoryExecuted"] is False
             and d["sdkRequestCalls"] == 2 and d["creatorCalls"] == d["verifierCalls"]
             == d["firstSettlementCalls"] == d["observerCalls"] == d["tlsFixtureKeyPairs"] == 1,
             "CALL_COUNTS")
        need(d["serviceDelivery"] == d["v6ApplicationIntegration"] == d["fullP1"] == "NOT_ESTABLISHED",
             "EVIDENCE_LIMITS")
    return {"testNames": names, "counts": {k: int(v) for k, v in summaries.items() if k != "duration_ms"},
            "durationMs": float(summaries["duration_ms"]), "namespace": namespace,
            "diagnostics": diagnostics, "reporter": "Node built-in Spec, not TAP"}


def audit(root, identifier, repo):
    need(re.fullmatch(r"[0-9a-f]{32}", identifier), "TASK")
    store = load(root / "storage.json", 4096)
    task_path = root / "tasks" / identifier
    task_before = read(task_path / "task.json")
    task = json.loads(task_before)
    need(task["store_id"] == store["id"] and task["id"] == identifier
         and task["state"] == "CLOSED" and task["outcome"] == "FAILURE"
         and task["quota_bytes"] == 2097152 and len(task["commands"]) == 2
         and not (task_path / "scratch").exists(), "ORIGINAL_TASK_STATE")
    object_cache = {}

    def object_bytes(value):
        need(value in task["object_refs"] and re.fullmatch(r"[0-9a-f]{64}", value), "TASK_OBJECT_REF")
        if value in object_cache:
            return object_cache[value]
        path = root / "objects" / value
        raw = read(path)
        ledger = load(root / "object-records" / (value + ".json"), 8192)
        owner = load(root / "tasks" / ledger["created_by"] / "task.json")
        s = path.lstat()
        need(digest(raw) == value and ledger["sha256"] == value
             and ledger["bytes"] == len(raw) and ledger["identity"] == [s.st_dev, s.st_ino]
             and ledger["store_id"] == store["id"] and owner["store_id"] == store["id"]
             and owner["state"] == "CLOSED" and value in owner["object_refs"]
             and stat.S_IMODE(s.st_mode) == 0o400, "CAS_OWNERSHIP")
        object_cache[value] = raw
        return raw

    original = load(task_path / "evidence" / "qualification.json")
    need(original["status"] == "NATIVE_HTTPS_V2_FAILED_OR_INCOMPLETE"
         and original["diagnostics"] == [] and original["sourceCommit"] == SOURCE_COMMIT
         and original["sourceRowsSha256"] == SOURCE_SEAL, "ORIGINAL_CLASSIFICATION")
    commands = [load(task_path / "evidence" / (name + ".json")) for name in task["commands"]]
    need(commands == [original["openssl"], original["node"]], "COMMAND_BINDING")
    for command in commands:
        need(command["state"] == "COMPLETE" and command["actual_exit"] == 0
             and command["output_complete"] is True and command["reason"] is None
             and command["scratch_scan_retries"] == 0, "COMMAND_RESULT")
        for stream in ("stdout", "stderr"):
            need(len(object_bytes(command[stream]["sha256"])) == command[stream]["bytes"], "STREAM")
    need(commands[0]["stdout"] == {"bytes": 0, "sha256": EMPTY_SHA}
         and commands[0]["stderr"]["bytes"] == 387
         and commands[1]["stdout"] == {"bytes": 3869, "sha256": RAW_SHA}
         and commands[1]["stderr"] == {"bytes": 0, "sha256": EMPTY_SHA}, "EXACT_STREAMS")
    evaluated = capture(object_bytes(RAW_SHA))
    startup = load(task_path / "evidence" / "node-startup.json")
    need(startup["argv"] == commands[1]["argv"] and startup["expectedCases"] == 3
         and startup["maximumConnections"] == 16 and startup["NodeChildren"] == 0, "STARTUP")
    env = startup["environment"]
    profile_raw = object_bytes(env["X402_NATIVE_HTTPS_V2_PROFILE_SHA256"])
    profile = json.loads(profile_raw)
    need(profile["sourceRowsSha256"] == SOURCE_SEAL and len(profile["inputs"]) == 36, "PROFILE")
    need(digest(read(repo / "qualification/run-official-x402-native-https-v2.local.py")) == LAUNCHER_SHA,
         "LAUNCHER_UNCHANGED")
    object_bytes(LAUNCHER_SHA)
    manifest = load(repo / "qualification/official-x402-native-https-pending-v2.inputs.json")
    reference_pin = manifest["packageInputsReference"]
    reference_raw = read(repo / reference_pin["path"])
    need(digest(reference_raw) == reference_pin["sha256"], "PACKAGE_REFERENCE")
    reference = json.loads(reference_raw)
    public_rows = manifest["applicationInputs"] + [
        p for p in reference["sourceGraph"] if p["path"].startswith(("@x402/core/", "zod/"))]
    public_rows = [dict(p, path=("packages/" if p["path"].startswith(("@x402/core/", "zod/"))
                                else "app/") + p["path"]) for p in public_rows]
    public_rows.sort(key=lambda p: p["path"])
    need(len(public_rows) == 36
         and digest(json.dumps(public_rows, sort_keys=True, separators=(",", ":")).encode()) == SOURCE_SEAL,
         "PUBLIC_SOURCE_ROWS")
    lookup = {p["path"]: p for p in public_rows}
    for p in profile["inputs"]:
        public = lookup[p["logicalPath"]]
        raw = object_bytes(p["sha256"])
        need(p["sha256"] == public["sha256"] and len(raw) == p["bytes"] == public["bytes"]
             and raw.count(b"\n") == public["LF"]
             and hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()
             == public["gitBlob"], "RETAINED_SOURCE")
    need(load(task_path / "evidence" / "cleanup.json")["tasks"] ==
         [{"id": identifier, "decision": "CLEANED", "bytes": 0}], "OWNED_CLEANUP")
    need(read(task_path / "task.json") == task_before, "TASK_RECORD_NOT_MODIFIED")
    return dict(evaluated,
                kind="PRESERVED_NATIVE_HTTPS_V2_CAPTURE_INDEPENDENT_READ_ONLY_AUDIT",
                sourceCommit=SOURCE_COMMIT, sourceRowsSha256=SOURCE_SEAL,
                originalManagedTaskOutcome="FAILURE", originalClassificationPreserved=True,
                independentInterpretation="THREE_NATIVE_TESTS_PASS_REPORTER_CLASSIFIER_BUG",
                actualNodeExit=0, actualOpenSSLExit=0, completeStdoutAndStderr=True,
                sourceObjectsVerified=36, NodeCommandsAdded=0, OpenSSLCommandsAdded=0,
                SDKImportsAdded=0, socketsAdded=0, tasksAdded=0, writesAdded=0,
                stdout={"bytes": 3869, "sha256": RAW_SHA,
                        "contentBase64": base64.b64encode(object_bytes(RAW_SHA)).decode()},
                stderr={"bytes": 0, "sha256": EMPTY_SHA})


if __name__ == "__main__":
    need(len(sys.argv) == 4, "ARGUMENTS")
    result = audit(Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3]))
    print(json.dumps(result, sort_keys=True, separators=(",", ":")), flush=True)

