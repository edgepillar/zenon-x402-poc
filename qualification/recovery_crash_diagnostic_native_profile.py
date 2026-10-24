"""V2 full-child extension and read-only profile construction.

The frozen 130 application / 404 package inputs remain mandatory. No native
command, SDK import, SQL, signature, nonce search, socket or scratch is created
here. Caller-pinned base helpers provide framing only; no legacy namespace is
translated into a new one or accepted under old counts. Private physical URLs
and identities are never a public result or execution authority.
"""
import json
import os
from pathlib import Path
import re

KIND = "OFFICIAL_ISSUED_FULL_GRAPH_CRASH_PAIR_NODE24_V2"
EXTENSION = "qualification/recovery-crash-full-graph-v2.source-inputs.json"
EXTENSION_SHA = "2ff9eb3ff68ea63013e25a253e436f8f8e620c858562463083f5e34379a663ba"
ENTRY = "app/qualification/recovery-crash-committed-intent-v2.child.draft.mjs"
PRELOAD = "app/qualification/recovery-crash-full-namespace-v2.preload.draft.mjs"
DIAGNOSTIC = "app/src/native-qualification-operation-diagnostics.js"
SOURCE_SEAL = "df9b5bf8f89618c7aa13baf2f84c25f14c851d0f0320b4caa210526b709a90f7"
SOURCE_BYTES = 4922826
APP_FILES, PACKAGE_FILES = 134, 404
MAX_PROFILE_BYTES, PARENT_STDOUT_LIMIT = 524288, 524288
EXTENSION_FIELDS = {
    "sourceSelectionVersion", "kind", "profileKind", "sourceParent", "runtime", "entry", "preload",
    "frozenInventory", "baselineManifest", "frozenApplicationInputsPreserved", "frozenPackageInputsPreserved",
    "additionalApplicationInputs", "additionalBareBindings", "applicationFiles", "packageFiles",
    "sourceRowsSha256", "declaredSourceBytes", "effectAuthority", "nativeExecuted", "nativeCrashQualified",
    "ordinaryInstalledNamespaceQualified", "sourceTransforms", "nativeBuiltinAliases", "nativeOsNetworkSandbox",
}


def capture_extension(base, extension_raw, inventory_raw, baseline_raw):
    require = base.require
    require(type(extension_raw) is bytes and base.sha(extension_raw) == EXTENSION_SHA, "V2_EXTENSION_BYTES")
    selected = base.capture_inventory(inventory_raw, baseline_raw)
    extension = base.decode_json(extension_raw, 65536)
    require(type(extension) is dict and set(extension) == EXTENSION_FIELDS, "V2_EXTENSION_FIELDS")
    require(type(extension["sourceSelectionVersion"]) is int and extension["sourceSelectionVersion"] == 2
        and extension["kind"] == "FULL_ISSUED_CRASH_PAIR_V2_NAMESPACE_EXTENSION_NOT_EXECUTION"
        and extension["profileKind"] == KIND and extension["runtime"] == dict(node="24.19.0", platform="darwin", arch="arm64")
        and extension["entry"] == ENTRY and extension["preload"] == PRELOAD
        and type(extension["sourceParent"]) is str and re.fullmatch(r"[0-9a-f]{40}", extension["sourceParent"]), "V2_SELECTION")
    require(extension["effectAuthority"] == "NONE" and all(extension[k] is False for k in
        ("nativeExecuted", "nativeCrashQualified", "ordinaryInstalledNamespaceQualified",
         "sourceTransforms", "nativeBuiltinAliases", "nativeOsNetworkSandbox")), "V2_NO_EXECUTION_CLAIM")
    for name, wanted in (("frozenApplicationInputsPreserved", 130), ("frozenPackageInputsPreserved", 404),
                         ("applicationFiles", APP_FILES), ("packageFiles", PACKAGE_FILES), ("declaredSourceBytes", SOURCE_BYTES)):
        require(type(extension[name]) is int and extension[name] == wanted, "V2_EXACT_COUNTS")
    additions = base._rows(extension["additionalApplicationInputs"], "app/", 4)
    full = "app/" + base.INVENTORY
    require(set(additions) == {ENTRY, PRELOAD, DIAGNOSTIC, full}
        and extension["frozenInventory"] == additions[full] == base.pin(full, inventory_raw)
        and extension["baselineManifest"] == base.pin("app/" + base.BASELINE, baseline_raw), "V2_FROZEN_MANIFESTS")
    previous = {r["path"]: r for r in selected["rows"]}
    require(not set(previous).intersection(additions), "NO_OVERWRITE_OR_RENAMED_SOURCE")
    rows = sorted([*selected["rows"], *additions.values()], key=lambda r: r["path"])
    require(len(rows) == 538 and sum(r["bytes"] for r in rows) == SOURCE_BYTES <= base.MAX_SOURCE_BYTES
        and extension["sourceRowsSha256"] == base.sha(base.canonical(rows)) == SOURCE_SEAL, "V2_WHOLE_SOURCE_SEAL")
    extra_edges = [
        dict(parent=ENTRY, specifier="@noble/ed25519", target="packages/@noble/ed25519/index.js"),
        dict(parent=ENTRY, specifier="@noble/hashes/sha2", target="packages/@noble/hashes/esm/sha2.js"),
    ]
    require(extension["additionalBareBindings"] == extra_edges, "V2_EXACT_ADDITIONAL_BARE_EDGES")
    edges = selected["bareBindings"] + extra_edges
    require(len(edges) == 12 and len({(e["parent"], e["specifier"]) for e in edges}) == 12, "V2_NO_EDGE_ALIAS")
    return dict(rows=rows, controlInputs=selected["controlInputs"], bareBindings=edges,
        sourceRowsSha256=SOURCE_SEAL, sourceBytes=SOURCE_BYTES, authority="NONE", effectsExecuted=False)


def plan_private_profile(base, extension_raw, inventory_raw, baseline_raw, captures, application_root, package_root):
    selected = capture_extension(base, extension_raw, inventory_raw, baseline_raw)
    inputs, indexed = base._captured_inputs(selected["rows"], captures, base._absolute(application_root), base._absolute(package_root))
    bindings = [dict(parentURL=indexed[e["parent"]]["url"], specifier=e["specifier"], targetURL=indexed[e["target"]]["url"])
        for e in selected["bareBindings"]]
    value = dict(profileVersion=2, profileKind=KIND, runtime=dict(node="24.19.0", platform="darwin", arch="arm64"),
        entryURL=indexed[ENTRY]["url"], inputs=inputs, bareBindings=bindings, allowedBuiltins=base.BUILTINS,
        sourceRowsSha256=SOURCE_SEAL, sourceTransform=False, ordinaryInstalledNamespace=False,
        baselineManifestSha256=base.BASELINE_SHA, baselineCrashInventorySha256=base.INVENTORY_SHA)
    raw = base.canonical(value) + b"\n"
    base.require(len(raw) <= MAX_PROFILE_BYTES, "V2_PRIVATE_PROFILE_SIZE")
    return dict(profileBytes=raw, profileSha256=base.sha(raw), profileBytesCount=len(raw), sourceRowsSha256=SOURCE_SEAL,
        sourceBytes=SOURCE_BYTES, applicationFiles=APP_FILES, packageFiles=PACKAGE_FILES,
        capturedIdentitiesAuthenticated=False, existingSourcesRecopied=False, effectsExecuted=False, authority="NONE")


def build_profile(base, application_root, package_root, extension_raw, inventory_raw, baseline_raw):
    selected = capture_extension(base, extension_raw, inventory_raw, baseline_raw)
    app, app_id = base._root(application_root); packages, packages_id = base._root(package_root)
    captures, versions = [], {}
    for row in selected["rows"]:
        name = row["path"]; is_app = name.startswith("app/")
        raw, ident = base.read_owned(app / name[4:] if is_app else packages / name[9:])
        base.require(base.pin(name, raw) == row, "ACTUAL_V2_SOURCE_OR_PACKAGE_PIN")
        if name in base.VERSIONS:
            versions[name] = json.loads(raw.decode("utf8"), object_pairs_hook=base._pairs).get("version")
        captures.append(dict(logicalPath=name, url=base.source_url(application_root if is_app else package_root,
            name[4:] if is_app else name[9:]), bytes=row["bytes"], LF=row["LF"], sha256=row["sha256"],
            gitBlob=row["gitBlob"], identity=ident))
    base.require(versions == base.VERSIONS, "ACTUAL_V2_PACKAGE_VERSIONS")
    for row in selected["controlInputs"]:
        raw, _ = base.read_owned(app / row["path"][4:])
        base.require(base.pin(row["path"], raw) == row, "ACTUAL_FROZEN_CONTROL_PIN")
    base.require(base.identity(app.lstat()) == app_id and base.identity(packages.lstat()) == packages_id, "V2_SOURCE_ROOT_CHANGED")
    result = plan_private_profile(base, extension_raw, inventory_raw, baseline_raw, captures, application_root, package_root)
    result["capturedIdentitiesAuthenticated"] = True  # Read guards, not native execution authority.
    return result


def validate_namespace(base, value, mode):
    base.require(type(mode) is str and mode in ("seed", "recover"), "V2_NAMESPACE_MODE")
    names = ("profileKind", "profileVersion", "mode", "sourceRowsSha256", "applicationFiles", "packageFiles",
        "inputsVerifiedBeforeCase", "declaredSourceBytes", "baselineApplication117Preserved", "baselinePackages404Preserved",
        "baselineCrashApplication130Preserved", "resolveCalls", "bareImportOverrideHits", "declaredFilesResolved",
        "sourceTransforms", "nativeBuiltinAliases", "ordinaryInstalledNamespaceQualified", "nativeOsNetworkSandbox")
    base._fields(value, names, "V2_NAMESPACE_FIELDS")
    for name in ("profileVersion", "applicationFiles", "packageFiles", "inputsVerifiedBeforeCase", "declaredSourceBytes",
                 "resolveCalls", "bareImportOverrideHits", "declaredFilesResolved", "sourceTransforms", "nativeBuiltinAliases"):
        base.require(type(value[name]) is int, "V2_NAMESPACE_INTEGER")
    base.require(value["profileKind"] == KIND and value["profileVersion"] == 2 and value["mode"] == mode
        and value["sourceRowsSha256"] == SOURCE_SEAL and value["applicationFiles"] == APP_FILES
        and value["packageFiles"] == PACKAGE_FILES and value["inputsVerifiedBeforeCase"] == 538
        and value["declaredSourceBytes"] == SOURCE_BYTES and value["baselineApplication117Preserved"] is True
        and value["baselinePackages404Preserved"] is True and value["baselineCrashApplication130Preserved"] is True
        and value["sourceTransforms"] == value["nativeBuiltinAliases"] == 0
        and value["ordinaryInstalledNamespaceQualified"] is False and value["nativeOsNetworkSandbox"] is False,
        "V2_NAMESPACE_COMPLETE_SOURCE_BINDING")
    base.require(0 <= value["bareImportOverrideHits"] <= value["resolveCalls"] <= 8192
        and 0 <= value["declaredFilesResolved"] <= 538, "V2_NAMESPACE_COUNTER_BOUND")


def validate_native_capture(base, stdout, stderr, receipt):
    """Strict DATA parser; a fabricated transcript/receipt is NOT native proof.

    Only a source-pinned managed command's actual complete receipt may be used
    as execution evidence. Return a sanitized summary, never original witnesses.
    Raw child bytes and independent originals remain in the ONE private stdout
    CAS object, without a second capture file/ZIP or fabricated EOF.
    """
    require, sha, canonical, HASH = base.require, base.sha, base.canonical, base.HASH
    _fields, _private_json, _capture_blob, _effects = base._fields, base._private_json, base._capture_blob, base._effects
    def _namespace(value, mode):
        return validate_namespace(base, value, mode)
    require(type(stdout) is bytes and type(stderr) is bytes and 0 < len(stdout) <= PARENT_STDOUT_LIMIT
        and len(stderr) <= 8192 and stdout.endswith(b"\n") and stdout.count(b"\n") == 1, "PAIR_CAPTURE_FRAME")
    require(type(receipt) is dict and receipt.get("state") == "COMPLETE" and receipt.get("output_complete") is True
        and type(receipt.get("actual_exit")) is int and receipt["actual_exit"] == 0, "PAIR_ACTUAL_COMMAND_OUTCOME")
    for name, raw in (("stdout", stdout), ("stderr", stderr)):
        item = receipt.get(name)
        require(type(item) is dict and type(item.get("bytes")) is int and item["bytes"] == len(raw)
            and item.get("sha256") == sha(raw), "PAIR_ACTUAL_STREAM_RECEIPT")
    result = _private_json(stdout, PARENT_STDOUT_LIMIT)
    _fields(result, ("captureVersion", "kind", "status", "sourceRowsSha256", "protocol", "seed", "recovery",
        "seedEvidence", "recoveryEvidence", "privateFundingWitness", "privateOriginalWitness",
        "selectedApplicationCrashQualified", "physicalDurabilityQualified", "authority"), "PAIR_CAPTURE_FIELDS")
    require(type(result["captureVersion"]) is int and result["captureVersion"] == 1
        and result["kind"] == "OWNED_ISSUED_CRASH_PAIR_PRIVATE_CAPTURE_NOT_PRODUCTION"
        and result["status"] == "OBSERVED_PROCESS_PAIR_PROTOCOL_COMPLETE" and result["sourceRowsSha256"] == SOURCE_SEAL
        and result["selectedApplicationCrashQualified"] is False and result["physicalDurabilityQualified"] is False
        and result["authority"] == "NONE", "PAIR_COMPLETE_NOT_PRODUCTION")
    expected_protocol = dict(protocolVersion=2, phase="DECLARED_PROTOCOL_COMPLETE", killRequested=True, killAccepted=True,
        seedClosed=True, fundingOriginalFixedBeforeSubmission=True, recoveryAuthorized=True, recoveryClosed=True,
        independentOriginalFixedBeforeDispatch=True, originalCheckpointRetained=True, nativeEventsAuthenticated=False,
        nativeCrashQualified=False, physicalDurabilityQualified=False, payerOwnerCloseOutcome="CHILD_UNKNOWN",
        authority="NONE", mayDispatchService=False, maySignPayment=False, deliveryConfirmed=False)
    require(type(result["protocol"]) is dict and canonical(result["protocol"]) == canonical(expected_protocol),
        "PAIR_PROTOCOL_UNKNOWN_RETAINED")
    pids = []
    for name, mode, seed in (("seed", "seed", True), ("recovery", "recover", False)):
        child = result[name]
        _fields(child, ("pid", "code", "signal", "stdoutComplete", "stderrComplete", "ipcClosed", "fault", "killSent",
            "stdout", "stderr"), "PAIR_CHILD_FIELDS")
        require(type(child["pid"]) is int and 0 < child["pid"] <= 2147483647 and child["pid"] not in pids, "PAIR_DISTINCT_OWNED_PIDS")
        pids.append(child["pid"])
        require(child["stdoutComplete"] is True and child["stderrComplete"] is True and child["ipcClosed"] is True
            and child["fault"] is False and child["killSent"] is seed, "PAIR_CHILD_EOF_AND_SIGNAL")
        require((child["code"] is None and child["signal"] == "SIGKILL") if seed
            else (type(child["code"]) is int and child["code"] == 0 and child["signal"] is None), "PAIR_CHILD_TERMINATION")
        output = _capture_blob(child["stdout"], 65536)
        _capture_blob(child["stderr"], 8192)
        evidence = result[name + "Evidence"]
        _fields(evidence, ("namespace", "effects"), "PAIR_CHILD_EVIDENCE")
        _namespace(evidence["namespace"], mode); _effects(evidence["effects"], seed)
        prefix = b"# pinned-recovery-crash-namespace-v2-admitted "
        lines = [line[len(prefix):] for line in output.splitlines() if line.startswith(prefix)]
        require(len(lines) == 1, "PAIR_CHILD_ADMISSION_CAPTURE")
        _namespace(_private_json(lines[0], 8192), mode)
    funding_raw = _capture_blob(result["privateFundingWitness"], 32768)
    original_raw = _capture_blob(result["privateOriginalWitness"], 65536)
    funding, bundle = _private_json(funding_raw, 32768), _private_json(original_raw, 65536)
    _fields(funding, ("witnessVersion", "fundingResourceUrl", "serviceResourceUrl", "transactionHash", "paymentRequiredHeader",
        "paymentSignatureHeader", "serializedCheckpoint", "checkpointPins", "nowEpochMs"), "PAIR_FUNDING_ORIGINAL_FIELDS")
    _fields(bundle, ("funding", "service"), "PAIR_ORIGINAL_BUNDLE")
    service = bundle["service"]
    _fields(service, ("witnessVersion", "grantId", "requestId", "originalRequestJson", "authorizationHeader",
        "fundingWitnessSha256", "payerIdentity", "backendIdentity"), "PAIR_SERVICE_ORIGINAL_FIELDS")
    require(type(funding["witnessVersion"]) is int and funding["witnessVersion"] == 2
        and type(service["witnessVersion"]) is int and service["witnessVersion"] == 2
        and canonical(bundle["funding"]) == canonical(funding) and service["fundingWitnessSha256"] == sha(funding_raw),
        "PAIR_INDEPENDENT_ORIGINAL_BINDING")
    require(type(funding["transactionHash"]) is str and HASH.fullmatch(funding["transactionHash"]) is not None
        and type(funding["nowEpochMs"]) is int and funding["nowEpochMs"] > 0, "PAIR_ORIGINAL_SCALARS")
    for field in ("grantId", "requestId"):
        require(type(service[field]) is str and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}", service[field]) is not None,
            "PAIR_SELECTED_ORIGINAL_ID")
    for field in ("payerIdentity", "backendIdentity"):
        require(type(service[field]) is list and len(service[field]) == 6
            and all(type(v) is str and re.fullmatch(r"[0-9]{1,24}", v) is not None for v in service[field]), "PAIR_PRINCIPAL_IDENTITIES")
    require(type(service["originalRequestJson"]) is str and 0 < len(service["originalRequestJson"]) <= 4096
        and type(service["authorizationHeader"]) is str and service["authorizationHeader"].startswith("ServiceCredit ")
        and len(service["authorizationHeader"]) <= 1024, "PAIR_ORIGINAL_REQUEST_CAPTURE")
    return dict(selectedCutpoint="LOCAL_OWNED_PROCESS_PAIR_OBSERVED", applicationFiles=APP_FILES, packageFiles=PACKAGE_FILES,
        sourceRowsSha256=SOURCE_SEAL, sourceBytesReadOnly=SOURCE_BYTES, childProcesses=2, seedSignal="SIGKILL",
        completeChildStreams=True, independentOriginalsRetained=True, noRecoveryDispatchOrSigning=True,
        payerOwnerCloseOutcome="CHILD_UNKNOWN", nativeCrashFullP2Qualified=False, physicalDurabilityQualified=False,
        nativeCleanupQualified=False, serviceDelivery="NOT_ESTABLISHED", authority="NONE", productionQualified=False)


def observe_failed_capture(base, stdout, stderr, receipt):
    """Bounded failure DATA only. Never export raw error text or original data.

    The caller must bind the actual receipt to this pinned managed command.
    Fabricated DATA is not native proof. Missing/partial diagnostics stay None.
    This does not admit a failed process pair as a successful crash cutpoint.
    """
    try:
        base.require(type(stdout) is bytes and type(stderr) is bytes and 0 < len(stdout) <= PARENT_STDOUT_LIMIT
            and len(stderr) <= 8192 and stdout.endswith(b"\n") and stdout.count(b"\n") == 1, "FAILED_CAPTURE_FRAME")
        base.require(type(receipt) is dict and receipt.get("state") == "COMPLETE" and receipt.get("output_complete") is True
            and type(receipt.get("actual_exit")) is int and receipt["actual_exit"] != 0, "FAILED_ACTUAL_OUTCOME")
        for name, raw in (("stdout", stdout), ("stderr", stderr)):
            row = receipt.get(name)
            base.require(type(row) is dict and type(row.get("bytes")) is int and row["bytes"] == len(raw)
                and row.get("sha256") == base.sha(raw), "FAILED_STREAM_RECEIPT")
        value = base._private_json(stdout, PARENT_STDOUT_LIMIT)
        base.require(type(value) is dict and type(value.get("captureVersion")) is int and value["captureVersion"] == 1
            and value.get("kind") == "OWNED_ISSUED_CRASH_PAIR_PRIVATE_CAPTURE_NOT_PRODUCTION"
            and value.get("sourceRowsSha256") == SOURCE_SEAL
            and value.get("status") == "FAILED_OR_UNKNOWN_PRESERVE_EVIDENCE", "FAILED_PINNED_PAIR")
        found = []
        for role in ("seed", "recovery"):
            child = value.get(role)
            if child is None:
                continue
            base.require(type(child) is dict and child.get("stderrComplete") is True, "FAILED_CHILD_STREAM")
            raw = base._capture_blob(child["stderr"], 8192)
            prefix = b"# x402-native-operation-failure "
            lines = [line[len(prefix):] for line in raw.splitlines() if line.startswith(prefix)]
            base.require(len(lines) <= 1, "NO_DUPLICATE_FAILURE_DIAGNOSTIC")
            if not lines:
                continue
            data = base._private_json(lines[0], 4096)
            base._fields(data, ("diagnosticVersion", "kind", "stagesEntered", "lastStage", "lastReturnedPhase",
                "failed", "safeErrorCode", "measurementUnknown", "authority"), "SAFE_DIAGNOSTIC_FIELDS")
            stages = {
                "BOOT", "WAIT_PARENT_INPUT", "LOAD_SEED_MODULES", "READ_TEST_TLS", "RESERVE_APPLICATION_PORT",
                "CREATE_SYNTHETIC_IDENTITIES", "CREATE_GRANT_OPERATOR", "START_RPC_PEER", "CONSTRUCT_APPLICATION",
                "START_APPLICATION", "READ_UNPAID_CHALLENGE", "BIND_CHALLENGE_AND_REFERENCE", "CREATE_EMPTY_V6",
                "CLOSE_EMPTY_V6", "OPEN_PAYER_CLIENT", "PREPARE_ORIGINAL_FUNDING", "RETAIN_FUNDING_PINS",
                "FIX_FUNDING_WITNESS_WITH_PARENT", "COMMIT_ORIGINAL_FUNDING", "SUBMIT_ORIGINAL_FUNDING",
                "OBSERVE_FIRST_PENDING", "OBSERVE_SECOND_PENDING", "ACTIVATE_PRIMARY_GRANT", "ACTIVATE_FOREIGN_GRANT",
                "INITIALIZE_DURABLE_EXECUTION", "ADMIT_PRIMARY_GRANT", "HANDOFF_TO_SERVICE", "CREATE_SERVICE_ORIGINALS",
                "CHECK_FOREIGN_GRANT_REFUSAL", "RETAIN_SERVICE_PINS", "READ_BEFORE_DISPATCH",
                "FIX_SERVICE_WITNESS_WITH_PARENT", "SUBMIT_SERVICE_ORIGINAL", "READ_COMMITTED_CUTPOINT",
                "SEND_COMMITTED_CUTPOINT", "WAIT_SELECTED_SIGKILL", "CAPTURE_RECOVERY_ORIGINALS",
                "READ_BEFORE_RECOVERY", "LOAD_RECOVERY_MODULES", "OPEN_EXISTING_BACKEND", "OPEN_RECOVERY_READER",
                "READ_RECOVERY_CHECKPOINT", "READ_RECOVERY_BACKEND_STATE", "CLOSE_RECOVERY_READER",
                "CLOSE_RECOVERY_BACKEND", "READ_AFTER_RECOVERY", "SEND_RECOVERED_ORIGINAL", "DISCONNECT_RECOVERY_IPC",
            }
            phases = {"LISTENING", "AWAITING_INDEPENDENT_PINS", "LOCAL_STORE_READBACK_MATCHED", "FUNDING_INTAKE_BOUND",
                "SUBMISSION_OUTCOME_UNKNOWN", "FUNDING_INTAKE_REJECTED", "FUNDING_INTAKE_CONFLICT",
                "PENDING", "SETTLED", "EXHAUSTED", "SERVICE_CLIENT_OPEN_ORIGINAL_RESTORED", "UNAVAILABLE"}
            codes = {"ERR_ASSERTION", "ERR_ACCESS_DENIED", "ERR_INVALID_ARG_TYPE", "ERR_INVALID_ARG_VALUE",
                "ABORT_ERR", "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EADDRINUSE",
                "zenon_native_funding_service_client_operation_unavailable",
                "zenon_native_funding_service_client_funding_unavailable",
                "zenon_native_funding_service_client_close_unknown", "issued_funding_post_application_binding_rejected", "OTHER"}
            base.require(type(data["diagnosticVersion"]) is int and data["diagnosticVersion"] == 1
                and data["kind"] == "PINNED_SOURCE_OPERATION_CURSOR_NOT_NATIVE_AUTHENTICATION" and data["authority"] == "NONE"
                and type(data["stagesEntered"]) is int and 1 <= data["stagesEntered"] <= 128
                and type(data["lastStage"]) is str and data["lastStage"] in stages
                and (data["lastReturnedPhase"] is None or type(data["lastReturnedPhase"]) is str and data["lastReturnedPhase"] in phases)
                and data["failed"] is True and type(data["safeErrorCode"]) is str and data["safeErrorCode"] in codes
                and type(data["measurementUnknown"]) is bool, "SAFE_DIAGNOSTIC_VALUES")
            found.append(dict(role=role, diagnostic=data))
        if len(found) != 1:
            return None
        return dict(kind="FAILED_PINNED_SOURCE_CURSOR_NOT_SUCCESS_OR_NATIVE_AUTHENTICATION",
            sourceRowsSha256=SOURCE_SEAL, **found[0], nativeCrashQualified=False, nativeEventsAuthenticated=False, authority="NONE")
    except (ValueError, KeyError, TypeError, RecursionError):
        return None

