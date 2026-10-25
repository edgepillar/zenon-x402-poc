"""Pure DATA contracts for the seven-case native-stop managed SOURCE draft.

No files, tools, manager, JavaScript, keys or sockets are accessed. Supplied
receipts and identities are DATA, not independently authenticated provenance.
Neither a manifest, a selection marker nor a passing DATA case grants a run.
"""
import hashlib
import json
import posixpath
import re

SELF = "qualification/run-funding-post-native-stop-tls-v2-managed.local.py"
DATA = "qualification/funding_post_native_stop_tls_v2_managed_data.py"
MANIFEST = "qualification/funding-post-native-stop-tls-v2.managed-inputs.json"
INNER = "qualification/funding-post-native-stop-tls-v2.inputs.json"
INNER_SHA = "d6ffe79e2699758c5b2bde909c3d5255c17356836b208e2d1bbdfea789f10b91"
INNER_GATE = "qualification/funding_post_native_stop_tls_v2_source_data.py"
INNER_GATE_SHA = "53f46884e6141d4a9de9d06568c47b4ca810f5d8bfeb9c64f33a5d88e55309c4"
INNER_SEAL = "17bbf55bc2832b2049d797daabe14b3488e829198cfb4490290f6bbe7286d76b"
CAPACITY = "qualification/run-capacity-native-paced-timer-managed-v3.local.py"
COMMON = "qualification/run-capacity-native-workload-v3.local.py"
TLS = "qualification/funding_tls_current_gate.py"
FROZEN = (
    (CAPACITY, "5f3f6893559a9fdce3d7c19b9d729996a14f157822d1938bbad3ae25daeef22e"),
    (COMMON, "4e2e29c31ae10c661bd5599506cda87482d030fc328dbde1e3e1066db5dba9e6"),
    (TLS, "9777b8dca3c8c86e543c1f202c0cde248280ed3a108df4a688565ccf83132936"),
)
CONTROLS = tuple(sorted((SELF, DATA, *(name for name, _ in FROZEN))))
APPLICATION = (
    "src/service-credit-funding-post-native-https-transport.js",
    "src/service-credit-funding-post-native-response.js",
    "src/service-credit-native-client-close-owner.js",
    "src/service-credit-native-client-request-stop-owner.js",
    "src/service-credit-funding-post-readable-flow.js",
)
NATIVE_SELECTION = "one-new-approved-seven-case-funding-stop-tls-v2"
KIND = "FUNDING_STOP_TLS_V2_MANAGED_SOURCE_NOT_NATIVE_AUTHORITY"
NODE_SHA = "dbedff294bab84a0a86c04e15fbcbeb1c97ca10bef1b32b0634cd24b36f62100"
OPENSSL_SHA = "49db04c17e3a8c169ebc48a1149d78c165a86c04913203f46b2a14ce7f4a14fc"
STORAGE_SHA = "a4d82a72214c9698fda7ae363c38b2470c08da5e2e04c63ee9284e43f638f081"
CLI_SHA = "0bf13cdc1f25a6b31ab14cfb124908808ca7ddc89073ecbcd0263bef4d52238c"
HASH = re.compile(r"[0-9a-f]{64}")


def require(value, code):
    if not value:
        raise ValueError(code)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode("ascii")


def same(left, right):
    # JSON canonicalization distinguishes bool/int without recursive coercion.
    return canonical(left) == canonical(right)


def decode(raw, maximum=65536):
    require(type(raw) is bytes and 0 < len(raw) <= maximum and raw.isascii(), "BOUNDED_ASCII_JSON_DATA")
    def pairs(items):
        out = {}
        for key, value in items:
            require(key not in out, "DUPLICATE_JSON_DATA_KEY"); out[key] = value
        return out
    def invalid(_):
        raise ValueError("NON_INTEGER_JSON_DATA")
    def integer(text):
        require(len(text) <= 17 and text != "-0", "SAFE_JSON_INTEGER_DATA")
        value = int(text)
        require(-(2**53 - 1) <= value <= 2**53 - 1, "SAFE_JSON_INTEGER_DATA")
        return value
    return json.loads(raw, object_pairs_hook=pairs, parse_float=invalid, parse_constant=invalid, parse_int=integer)


def pin(name, raw):
    require(type(name) is str and type(raw) is bytes and 0 < len(raw) <= 262144, "BOUNDED_SOURCE_DATA")
    return dict(path=name, bytes=len(raw), LF=raw.count(b"\n"), sha256=hashlib.sha256(raw).hexdigest(),
        gitBlob=hashlib.sha1(b"blob " + str(len(raw)).encode("ascii") + b"\0" + raw).hexdigest())


def policy():
    return dict(min_free_bytes=10737418240, safety_margin_bytes=1073741824,
        task_quota_bytes=4194304, scratch_quota_bytes=4194304, store_quota_bytes=4194304,
        metadata_quota_bytes=4194304, max_tasks=1, max_objects=128, max_commands_per_task=2,
        max_output_bytes=65536, abandoned_after_seconds=86400, unreferenced_after_seconds=1209600)


def resources():
    return dict(taskQuotaBytes=4194304, expectedPeakBytes=4194304, minimumFreeBytes=10737418240,
        safetyMarginBytes=1073741824, metadataStoreQuotaBytesReserved=4194304,
        requiredFreeBytesBeforeOtherReservations=11819548672,
        opensslTimeoutSeconds=20, opensslStdoutLimit=16384, opensslStderrLimit=65536,
        nodeTimeoutSeconds=45, nodeStdoutLimit=65536, nodeStderrLimit=65536,
        maximumRuns=1, opensslCommands=1, nodeCommands=1, nodeChildren=0,
        selectedCases=7, loopbackListeners=2, loopbackConnections=8,
        allSiblingReservationsRequired=True, maximumReservationRoots=256,
        automaticRetry=False, initializeRoot=False, cleanupHistoricalData=False,
        nativeOsNetworkSandbox=False, SDK=False, SQLite=False, nonce=False,
        walletPaymentCapabilityProviderSigning=False, externalNetwork=False, fullDpGraph=False)


def validate_manifest(manifest, inputs, inner):
    require(type(manifest) is dict and set(manifest) == {"kind", "version", "sourceParent", "pythonControls",
        "innerSelection", "innerSourceRowsSha256", "effectsCeiling", "resources", "storagePolicy",
        "nativeSelection", "managedLauncherSourceAuthored", "managedLauncherNativeQualified", "nativeExecuted",
        "nativeAllowanceGranted", "nativeOsNetworkSandbox", "authority"}, "EXACT_MANAGED_MANIFEST_FIELDS")
    require(manifest["kind"] == KIND and type(manifest["version"]) is int and manifest["version"] == 2
        and type(manifest["sourceParent"]) is str and re.fullmatch(r"[0-9a-f]{40}", manifest["sourceParent"])
        and manifest["nativeSelection"] == NATIVE_SELECTION and manifest["managedLauncherSourceAuthored"] is True
        and all(manifest[name] is False for name in ("managedLauncherNativeQualified", "nativeExecuted",
            "nativeAllowanceGranted", "nativeOsNetworkSandbox")) and manifest["authority"] == "NONE", "SOURCE_IS_NOT_NATIVE_AUTHORITY")
    require(type(inputs) is dict and set(inputs) == set(CONTROLS + (INNER,)), "EXACT_MANAGED_SOURCE_SET")
    require(type(manifest["pythonControls"]) is list and len(manifest["pythonControls"]) == len(CONTROLS), "MANAGED_CONTROL_COUNT")
    for name, row in zip(CONTROLS, manifest["pythonControls"]):
        require(same(row, pin(name, inputs[name])), "EXACT_MANAGED_CONTROL_PIN")
    for name, digest in FROZEN:
        require(hashlib.sha256(inputs[name]).hexdigest() == digest, "UNCHANGED_FROZEN_MANAGED_CONTROL")
    require(hashlib.sha256(inputs[INNER]).hexdigest() == INNER_SHA
        and same(manifest["innerSelection"], pin(INNER, inputs[INNER]))
        and same(inner, decode(inputs[INNER])) and inner["sourceRowsSha256"] == INNER_SEAL
        and manifest["innerSourceRowsSha256"] == INNER_SEAL, "UNCHANGED_INNER_SEVEN_CASE_SELECTION")
    require(same(manifest["effectsCeiling"], inner["effectsCeiling"])
        and same(manifest["resources"], resources()) and same(manifest["storagePolicy"], policy()), "EXACT_FINITE_MANAGED_RESOURCES")
    return dict(kind="MANAGED_SOURCE_DATA_ADMITTED_NOT_NATIVE_EXECUTION", controlRows=len(CONTROLS),
        innerSourceRowsSha256=INNER_SEAL, nativeExecuted=False, storageAdmissionPerformed=False, authority="NONE")


def absolute(path):
    require(type(path) is str and path.startswith("/") and path != "/" and posixpath.normpath(path) == path
        and not any(c in path for c in ("\0", "\n", "\r", "\\", ",")), "CANONICAL_PRIVATE_PATH_DATA")
    return path


def command_plan(repo, node, scratch, application, entry, body):
    repo, node, scratch = map(absolute, (repo, node, scratch))
    require(node != repo and not node.startswith(repo + "/") and not repo.startswith(scratch + "/")
        and not scratch.startswith(repo + "/") and node != scratch and not node.startswith(scratch + "/"), "DISJOINT_NATIVE_PATH_DATA")
    parts = scratch.rsplit("/", 3)
    require(len(parts) == 4 and parts[0] and parts[1] == "tasks"
        and re.fullmatch(r"[0-9a-f]{32}", parts[2]) and parts[3] == "scratch", "OWNED_TASK_SCRATCH_PATH_DATA")
    require(type(application) is tuple and application == APPLICATION
        and entry == "qualification/funding-post-native-stop-tls-v2.selection.draft.mjs"
        and body == "qualification/funding-post-native-stop-tls-v2.behavior.draft.mjs", "EXACT_NODE_SOURCE_PATH_DATA")
    argv = [node, "--permission", "--no-addons", "--disallow-code-generation-from-strings",
        "--disable-proto=throw", "--unhandled-rejections=strict", "--test-reporter=tap"]
    argv += ["--allow-fs-read=" + repo + "/" + name for name in ("package.json", *application, entry, body)]
    argv += ["--allow-fs-read=" + scratch, repo + "/" + entry, scratch]
    return dict(argv=argv, cwd=repo, timeoutSeconds=45, stdoutLimit=65536,
        env=dict(PATH="/usr/bin:/bin", LANG="C", LC_ALL="C", TZ="UTC", NODE_DISABLE_COMPILE_CACHE="1",
            X402_FUNDING_STOP_TLS_V2_SELECTION="seven-real-loopback-stop-cases-only",
            X402_FUNDING_STOP_TLS_V2_NATIVE_MODE="one-fresh-reviewed-native-run-v2"),
        nodeChildren=0, nativeOsNetworkSandbox=False, authority="NONE")


def validate_receipt(stdout, stderr, receipt, stdout_limit, stderr_limit):
    require(type(stdout) is bytes and len(stdout) <= stdout_limit and type(stderr) is bytes
        and len(stderr) <= stderr_limit and type(receipt) is dict, "BOUNDED_COMPLETE_STREAM_DATA")
    require(receipt.get("state") == "COMPLETE" and receipt.get("output_complete") is True
        and type(receipt.get("actual_exit")) is int and receipt["actual_exit"] == 0
        and receipt.get("reason") is None, "ACTUAL_SUCCESS_AND_COMPLETE_EOF_DATA")
    require(type(receipt.get("process_group")) is int and receipt["process_group"] > 0
        and receipt.get("argv") is None, "OWNED_PRIVATE_COMMAND_RECEIPT_DATA")
    for label, raw in (("stdout", stdout), ("stderr", stderr)):
        row = receipt.get(label)
        require(type(row) is dict and set(row) == {"sha256", "bytes"} and type(row["bytes"]) is int
            and row["bytes"] == len(raw) and row["sha256"] == hashlib.sha256(raw).hexdigest(), "EXACT_COMPLETE_STREAM_REFERENCE_DATA")


def safe_count(value, maximum=8):
    return type(value) is int and 0 <= value <= maximum


def validate_native_capture(stdout, stderr, receipt, case_names):
    validate_receipt(stdout, stderr, receipt, 65536, 65536)
    require(stderr == b"" and stdout.isascii() and b"\r" not in stdout and stdout.endswith(b"\n"), "STRICT_NATIVE_TAP_STREAM_DATA")
    require(type(case_names) is tuple and len(case_names) == 7 and len(set(case_names)) == 7, "SEVEN_DECLARED_CASE_NAMES_DATA")
    lines = stdout.decode("ascii").splitlines()
    require(lines.count("TAP version 13") == 1 and lines.count("1..7") == 1
        and not any(re.search(r"^(?:\s*not ok\b|Bail out!)|^(?:ok|not ok)\s.*#\s*(?:SKIP|TODO)\b", line, re.I) for line in lines), "ONLY_SUCCESSFUL_SELECTED_TAP_DATA")
    oks = [line for line in lines if re.match(r"^ok\b", line)]
    require(oks == ["ok " + str(i + 1) + " - " + name for i, name in enumerate(case_names)], "EXACT_SEVEN_ORDERED_TAP_CASES_DATA")
    for label, count in (("tests", 7), ("suites", 0), ("pass", 7), ("fail", 0), ("cancelled", 0), ("skipped", 0), ("todo", 0)):
        require([line for line in lines if re.match(r"^# " + label + r"\b", line)] == ["# " + label + " " + str(count)], "EXACT_TAP_TOTALS_DATA")
    prefix = "# funding-stop-tls-v2 "
    footer = [line[len(prefix):] for line in lines if line.startswith(prefix)]
    require(len(footer) == 1 and not any(line.startswith("# funding-stop-tls-v2-failure ") for line in lines), "ONE_NATIVE_SUMMARY_NO_FAILURE_DATA")
    counts = decode(footer[0].encode("ascii"))
    require(type(counts) is dict and set(counts) == {"casesEntered", "casesCompleted", "observations", "connections",
        "tlsConnections", "silentConnections", "secureConnections", "requests", "tlsClientErrors", "httpsClosed", "tcpClosed",
        "cleanupDestroyedSockets", "allClientHandlesDrained", "actualLateSocketAssignmentsObserved",
        "unobservedLateSocketPathQualified", "nonclosingSocketQualified", "SDK", "SQLite", "nonce", "paymentSigning",
        "externalNetwork", "fullDpGraph", "nativeOsNetworkSandbox"}, "EXACT_NATIVE_SUMMARY_FIELDS_DATA")
    require(type(counts["casesEntered"]) is int and counts["casesEntered"] == 7
        and type(counts["casesCompleted"]) is int and counts["casesCompleted"] == 7
        and all(counts[name] is True for name in ("httpsClosed", "tcpClosed", "allClientHandlesDrained"))
        and type(counts["cleanupDestroyedSockets"]) is int and counts["cleanupDestroyedSockets"] == 0
        and all(counts[name] is False for name in ("unobservedLateSocketPathQualified", "nonclosingSocketQualified",
            "SDK", "SQLite", "nonce", "paymentSigning", "externalNetwork", "fullDpGraph", "nativeOsNetworkSandbox")), "HONEST_COMPLETE_CLOSE_BOUNDARY_DATA")
    require(all(safe_count(counts[name]) for name in ("connections", "tlsConnections", "silentConnections", "secureConnections",
        "requests", "tlsClientErrors", "actualLateSocketAssignmentsObserved"))
        and 4 <= counts["connections"] <= 8 and counts["silentConnections"] == 1
        and counts["connections"] == counts["tlsConnections"] + counts["silentConnections"]
        and all(3 <= counts[name] <= 5 for name in ("tlsConnections", "secureConnections", "requests"))
        and counts["requests"] <= counts["secureConnections"] <= counts["tlsConnections"], "FINITE_NATIVE_CONNECTION_COUNTS_DATA")
    rows = counts["observations"]
    require(type(rows) is list and len(rows) == 7, "SEVEN_OWNER_OBSERVATIONS_DATA")
    for i, row in enumerate(rows):
        require(type(row) is dict and set(row) == {"index", "requestStarts", "phase", "unknown", "socketAssignmentsObserved",
            "stoppedSocketAssignmentsObserved", "handshakeTimerStartAttempts", "requestClosesWithoutSocketObserved",
            "beforeStopHandshakeTimerStartAttempts", "beforeStopAuthenticatedTls", "authenticatedTlsHandshakes", "handlesDrained"}, "EXACT_OWNER_OBSERVATION_FIELDS_DATA")
        require(type(row["index"]) is int and row["index"] == i and type(row["requestStarts"]) is int
            and row["requestStarts"] == (0 if i == 6 else 1) and row["handlesDrained"] is True
            and row["phase"] == ("CLOSED" if i in (0, 6) else "CLOSE_UNKNOWN")
            and row["unknown"] is (i not in (0, 6)), "DRAINED_OR_UNKNOWN_OWNER_NOT_CLEANED_BY_FIXTURE_DATA")
        for name in ("socketAssignmentsObserved", "stoppedSocketAssignmentsObserved", "handshakeTimerStartAttempts",
                "requestClosesWithoutSocketObserved", "authenticatedTlsHandshakes"):
            require(safe_count(row[name], row["requestStarts"]), "BOUNDED_OWNER_PROGRESS_DATA")
        require(row["stoppedSocketAssignmentsObserved"] <= row["socketAssignmentsObserved"]
            and row["handshakeTimerStartAttempts"] <= row["socketAssignmentsObserved"] - row["stoppedSocketAssignmentsObserved"]
            and row["authenticatedTlsHandshakes"] <= row["handshakeTimerStartAttempts"], "STOP_GATE_PROGRESS_RELATION_DATA")
        for before, after in (("beforeStopHandshakeTimerStartAttempts", "handshakeTimerStartAttempts"),
                ("beforeStopAuthenticatedTls", "authenticatedTlsHandshakes")):
            require((row[before] is None if i in (0, 1, 6) else
                safe_count(row[before], 1) and row[before] == row[after]), "NO_NEW_HANDSHAKE_WORK_AFTER_STOP_DATA")
        if i == 0:
            require(row["socketAssignmentsObserved"] == row["handshakeTimerStartAttempts"] == row["authenticatedTlsHandshakes"] == 1
                and row["stoppedSocketAssignmentsObserved"] == 0, "CLEAN_BOUND_OBSERVATION_DATA")
        if i == 5:
            require(row["socketAssignmentsObserved"] == row["handshakeTimerStartAttempts"] == 1
                and row["authenticatedTlsHandshakes"] == 0, "GENUINE_PENDING_HANDSHAKE_OBSERVATION_DATA")
    require(counts["actualLateSocketAssignmentsObserved"] == sum(row["stoppedSocketAssignmentsObserved"] for row in rows), "ACTUAL_LATE_SOCKET_SUM_DATA")
    return dict(kind="SEVEN_CASE_COMPLETE_CAPTURE_DATA_VALIDATED_NOT_INDEPENDENT_PROVENANCE", counts=counts,
        unobservedLateSocketPathQualified=False, nonclosingSocketQualified=False,
        fullDpQualified=False, productionQualified=False, nativeOsNetworkSandbox=False, authority="NONE")


def closed_storage(closed, cleanup, store_id, task_id):
    require(all(type(value) is str and re.fullmatch(r"[0-9a-f]{32}", value) for value in (store_id, task_id))
        and type(closed) is dict and closed.get("schema") == "zenon-owned-task-storage/v2"
        and closed.get("store_id") == store_id and closed.get("id") == task_id and closed.get("state") == "CLOSED"
        and closed.get("outcome") in ("SUCCESS", "FAILURE"), "ACTUAL_OWNED_TASK_CLOSURE_DATA")
    require(type(cleanup) is dict and set(cleanup) == {"mode", "tasks", "objects"}
        and cleanup["mode"] == "APPLY_OWNED_ONLY" and cleanup["objects"] == []
        and type(cleanup["tasks"]) is list and len(cleanup["tasks"]) == 1
        and type(cleanup["tasks"][0]) is dict and cleanup["tasks"][0].get("id") == task_id
        and cleanup["tasks"][0].get("decision") in ("CLEANED", "ALREADY_CLEAN", "HOLD"), "SEPARATE_EXACT_OWNED_CLEANUP_DATA")
    commands = closed.get("commands")
    require(type(commands) is list and 1 <= len(commands) <= 2
        and all(type(name) is str and re.fullmatch(r"command-[0-9a-f]{32}", name) for name in commands)
        and len(set(commands)) == len(commands), "EXACT_OWNED_COMMAND_CARDINALITY_DATA")
    decision = cleanup["tasks"][0]["decision"]
    if decision in ("CLEANED", "ALREADY_CLEAN"):
        require(all(closed.get(name) == {} for name in ("scratch_files", "scratch_dirs", "file_roles")), "CLEANUP_NOT_INFERRED_FROM_CLOSED_DATA")
    return dict(taskClosed=True, taskOutcome=closed["outcome"], storageDecision=decision,
        cleanupQualified=decision in ("CLEANED", "ALREADY_CLEAN"), componentSuccessNotInferred=True,
        historicalCleanupPerformed=False, authority="NONE")
