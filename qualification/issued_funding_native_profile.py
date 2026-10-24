"""Read-only admission for ONE actual issued-native vertical case.

No JS/package import, TLS, SQL, signer, nonce, child process or task creation.
The unchanged earlier read-only file guards are reused by exact source pin.
Private file URLs/physical identities stay in memory, never in public reports.
The complete existing source graph is read, NOT recopied into task scratch.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat

KIND = "OFFICIAL_ISSUED_FUNDING_NATIVE_VERTICAL_ONE_CASE_NODE24_V1"
MANIFEST_KIND = "ACTUAL_ISSUED_NATIVE_VERTICAL_INPUTS_NOT_EXECUTION"
ENTRY = "app/qualification/issued-funding-post-native-vertical.case.draft.mjs"
PRELOAD = "app/qualification/issued-funding-post-native-vertical.preload.draft.mjs"
BASE = "qualification/dynamic-plasma-full-native-loopback-profile.draft.py"
BASE_SHA = "3d207079758c864f0d5a767f4e2f2b2ec1c86416405bfc2f28897baf086999ea"
APP_FILES, PACKAGE_FILES = 117, 404
MAX_SOURCE_BYTES, MAX_PROFILE_BYTES = 6291456, 524288
FIELDS = {"path", "bytes", "LF", "sha256", "gitBlob"}
VERSIONS = {
    "packages/@x402/core/package.json": "2.23.0", "packages/zod/package.json": "3.25.76",
    "packages/znn-typescript-sdk/package.json": "1.0.5", "packages/@noble/ed25519/package.json": "2.3.0",
    "packages/@noble/hashes/package.json": "1.8.0",
}
FIXED = {
    ENTRY: "59240af09c54cf9252b016417091157b182a2ae10993e6f3744694bef2b319d8",
    "app/src/x402-official-issued-funding-post-native-application.js": "19f147de7167ea0c20f51958b3716fb9d8fcc21e63ee6c9d74fe34dcde727cdd",
    "app/src/service-credit-bounded-https-ingress-limits.js": "35e2cc603398a929979b2f939f558d43002079038922d6248cc654c425eafb68",
    "app/qualification/issued-funding-post-native-grant-operator.fixture.draft.mjs": "b1224cc52ef9a5dd67418392b3064ea79d6a7f8c8abb9c7fb9b986a42bb4f587",
    "app/qualification/issued-funding-post-native-rpc-peer.fixture.draft.mjs": "8500fc75a7736a976a9b07efb537e70f7f4f4ca3a1c7a2ee41d33496f8cb706b",
    "app/src/zenon/dynamic-plasma-native-funding-service-client.js": "5ed9ac6189f2f86bcc2195c5c6da03ecec7e1e779c4084490029270e617743a8",
}
EDGES = [
    (ENTRY, "@noble/ed25519", "packages/@noble/ed25519/index.js"),
    (ENTRY, "@noble/hashes/sha2", "packages/@noble/hashes/esm/sha2.js"),
    ("app/src/zenon-payment.js", "znn-typescript-sdk", "packages/znn-typescript-sdk/dist/index.js"),
    ("app/src/zenon-payment.js", "@noble/ed25519", "packages/@noble/ed25519/index.js"),
    ("app/src/zenon-payment.js", "@noble/hashes/sha2", "packages/@noble/hashes/esm/sha2.js"),
    ("app/src/x402-official-selected-payment-client.js", "@x402/core/client", "packages/@x402/core/dist/esm/client/index.mjs"),
    ("app/src/x402-official-selected-settlement-server.js", "@x402/core/server", "packages/@x402/core/dist/esm/server/index.mjs"),
    ("packages/@x402/core/dist/esm/chunk-N4QXZG2Z.mjs", "zod", "packages/zod/index.js"),
]
BUILTINS = sorted({"node:assert/strict", "node:async_hooks", "node:buffer", "node:crypto", "node:events",
    "node:fs", "node:fs/promises", "node:http", "node:https", "node:module", "node:net", "node:path",
    "node:perf_hooks", "node:sqlite", "node:stream", "node:test", "node:timers", "node:tls", "node:url",
    "node:util", "node:vm", "node:zlib"})


def require(condition, code="ISSUED_NATIVE_PROFILE_REJECTED"):
    if not condition:
        raise ValueError(code)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("ascii")


def pin(name, raw):
    return dict(path=name, bytes=len(raw), LF=raw.count(b"\n"), sha256=hashlib.sha256(raw).hexdigest(),
                gitBlob=hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest())


def effects():
    return dict(selectedCases=1, maximumRuns=1, opensslCommands=1, nodeCommands=1, nodeChildren=0,
        newSqlitePaths=5, independentPinFiles=2, syntheticEd25519Keys=4, transactionSignatures=1,
        capabilitySignatures=3, providerSignatures=2, testTlsMaterialSeparate=True,
        maxRpcConnections=174, maxApplicationConnections=8, maxTotalConnections=182, expectedTotalConnections=96,
        maxCandidatesPerSearch=4096, maxReferenceCandidates=32768, producerCandidateReservation=4096,
        fixedVerificationReservation=16384, maxAggregateCandidates=65536, taskQuotaBytes=4194304,
        maximumSourceReadBytes=MAX_SOURCE_BYTES, existingSourcesRecopied=False, externalNetwork=False,
        install=False, realWallet=False, realPayment=False, sdkPrepareBlock=False, nativeOsNetworkSandbox=False)


def policy():
    return dict(min_free_bytes=10737418240, safety_margin_bytes=1073741824,
        task_quota_bytes=4194304, scratch_quota_bytes=4194304, store_quota_bytes=4194304,
        metadata_quota_bytes=4194304, max_tasks=1, max_objects=48, max_commands_per_task=2,
        max_output_bytes=65536, abandoned_after_seconds=86400, unreferenced_after_seconds=1209600)


def validate_manifest(value):
    require(type(value) is dict and set(value) == {"kind", "version", "sourceParent", "entry", "preload",
        "applicationInputs", "packageInputs", "sourceRowsSha256", "sourceBytes", "bareBindings", "allowedBuiltins",
        "packageVersions", "effectsCeiling", "storagePolicy", "launcherInputs", "packageInputReferences",
        "sourceTransforms", "nativeBuiltinAliases", "ordinaryInstalledNamespaceQualified", "nativeCasesExecuted"})
    require(value["kind"] == MANIFEST_KIND and type(value["version"]) is int and value["version"] == 1)
    require(type(value["sourceParent"]) is str and re.fullmatch(r"[0-9a-f]{40}", value["sourceParent"]) is not None)
    require(value["entry"] == ENTRY and value["preload"] == PRELOAD)
    require(value["sourceTransforms"] is False and value["nativeBuiltinAliases"] is False
            and value["ordinaryInstalledNamespaceQualified"] is False
            and type(value["nativeCasesExecuted"]) is int and value["nativeCasesExecuted"] == 0)
    require(type(value["applicationInputs"]) is list and len(value["applicationInputs"]) == APP_FILES)
    require(type(value["packageInputs"]) is list and len(value["packageInputs"]) == PACKAGE_FILES)
    rows = value["applicationInputs"] + value["packageInputs"]
    require(all(type(row) is dict and type(row.get("path")) is str for row in rows))
    rows = sorted(rows, key=lambda row: row["path"])
    indexed = {}
    for row in rows:
        require(type(row) is dict and set(row) == FIELDS)
        name = row["path"]
        require(type(name) is str and len(name) <= 512 and re.fullmatch(r"(?:app|packages)/[A-Za-z0-9@._/-]+", name) is not None
            and not any(part in ("", ".", "..") for part in name.split("/")) and name not in indexed)
        require(type(row["bytes"]) is int and 0 <= row["bytes"] <= 1048576
            and type(row["LF"]) is int and 0 <= row["LF"] <= row["bytes"]
            and type(row["sha256"]) is str and re.fullmatch(r"[0-9a-f]{64}", row["sha256"]) is not None
            and type(row["gitBlob"]) is str and re.fullmatch(r"[0-9a-f]{40}", row["gitBlob"]) is not None)
        indexed[name] = row
    require(all(row["path"].startswith("app/") for row in value["applicationInputs"]))
    require(all(row["path"].startswith("packages/") for row in value["packageInputs"]))
    require(ENTRY in indexed and PRELOAD in indexed and "app/package.json" in indexed)
    require(all(indexed.get(name, {}).get("sha256") == digest for name, digest in FIXED.items()))
    require(type(value["sourceBytes"]) is int and value["sourceBytes"] == sum(row["bytes"] for row in rows)
            and value["sourceBytes"] <= MAX_SOURCE_BYTES)
    require(value["sourceRowsSha256"] == hashlib.sha256(canonical(rows)).hexdigest())
    expected_edges = [dict(parent=parent, specifier=specifier, target=target) for parent, specifier, target in EDGES]
    require(canonical(value["bareBindings"]) == canonical(expected_edges))
    require(all(parent in indexed and target in indexed for parent, _specifier, target in EDGES))
    require(value["allowedBuiltins"] == BUILTINS and value["packageVersions"] == VERSIONS)
    require(canonical(value["effectsCeiling"]) == canonical(effects()) and canonical(value["storagePolicy"]) == canonical(policy()))
    return rows


def load_read_guards(application_root):
    """Only this exact unchanged standard-library helper source may execute."""
    require(type(application_root) is str and os.path.isabs(application_root)
            and os.path.normpath(application_root) == application_root, "ABSOLUTE_APPLICATION_ROOT")
    path = Path(application_root) / BASE
    for candidate in (path, *path.parents):
        require(not candidate.is_symlink(), "READ_GUARD_LINK")
    before = path.lstat()
    identity = lambda s: (s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode, s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
    require(stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid() and before.st_nlink == 1
        and before.st_size <= 65536, "READ_GUARD_IDENTITY")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        require(identity(os.fstat(stream.fileno())) == identity(before))
        raw = stream.read(65537)
        require(identity(os.fstat(stream.fileno())) == identity(before))
    require(len(raw) == before.st_size and hashlib.sha256(raw).hexdigest() == BASE_SHA, "READ_GUARD_PIN")
    require(identity(path.lstat()) == identity(before))
    spec = importlib.util.spec_from_file_location("issued_native_unchanged_read_guards", path)
    require(spec is not None and spec.loader is not None)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    require(identity(path.lstat()) == identity(before), "READ_GUARD_CHANGED")
    return module


def build_profile(application_root, package_root, manifest, mode):
    """Read exact existing inputs and return a PRIVATE profile in memory only."""
    rows = validate_manifest(manifest)
    require(mode in ("clean", "lost-ack"), "EXACT_CASE_MODE")
    guard = load_read_guards(application_root)
    app, app_id = guard._root(application_root)
    packages, packages_id = guard._root(package_root)
    inputs, by_name, versions = [], {}, {}
    for row in rows:
        name = row["path"]
        path = app / name[4:] if name.startswith("app/") else packages / name[9:]
        raw, identity = guard._capture(path)
        require(pin(name, raw) == row, "CURRENT_SOURCE_OR_PACKAGE_PIN")
        item = dict(logicalPath=name, url=guard._url(path), bytes=len(raw), sha256=row["sha256"], identity=identity)
        inputs.append(item)
        by_name[name] = item
        if name in VERSIONS:
            versions[name] = json.loads(raw).get("version")
    require(versions == VERSIONS, "EXACT_EXISTING_PACKAGE_VERSIONS")
    bindings = [dict(parentURL=by_name[parent]["url"], specifier=specifier, targetURL=by_name[target]["url"])
                for parent, specifier, target in EDGES]
    profile = dict(profileVersion=1, profileKind=KIND, runtime=dict(node="24.19.0", platform="darwin", arch="arm64"),
        mode=mode, entryURL=by_name[ENTRY]["url"], inputs=inputs, bareBindings=bindings, allowedBuiltins=BUILTINS,
        sourceRowsSha256=manifest["sourceRowsSha256"], sourceTransform=False, ordinaryInstalledNamespace=False)
    raw = canonical(profile) + b"\n"
    require(len(raw) <= MAX_PROFILE_BYTES, "PRIVATE_PROFILE_SIZE")
    require(guard._identity(app.lstat()) == app_id and guard._identity(packages.lstat()) == packages_id, "ROOT_REPLACED")
    return dict(profileBytes=raw, profileSha256=hashlib.sha256(raw).hexdigest(), profileBytesCount=len(raw),
        sourceRowsSha256=manifest["sourceRowsSha256"], sourceBytes=manifest["sourceBytes"],
        applicationFiles=APP_FILES, packageFiles=PACKAGE_FILES, mode=mode,
        sourceTransforms=False, effectsExecuted=False, existingSourcesRecopied=False)


def validate_native_capture(stdout, stderr, receipt, mode, source_rows_sha256, source_bytes):
    """A parser is not execution evidence; only a matching actual receipt is."""
    require(type(stdout) is bytes and type(stderr) is bytes and len(stdout) <= 65536 and len(stderr) <= 65536,
            "NATIVE_CAPTURE_BOUND")
    require(mode in ("clean", "lost-ack") and receipt["state"] == "COMPLETE" and receipt["output_complete"] is True
            and type(receipt["actual_exit"]) is int and receipt["actual_exit"] == 0, "NATIVE_FAILED_OR_UNKNOWN")
    lines = stdout.decode("ascii").splitlines()
    def footer(prefix):
        chosen = [line[len(prefix):] for line in lines if line.startswith(prefix)]
        require(len(chosen) == 1, "NATIVE_EXACT_FOOTER")
        return json.loads(chosen[0])
    case = footer("# actual-issued-native-vertical ")
    namespace = footer("# pinned-issued-native-vertical-namespace ")
    require(type(case) is dict and set(case) == {"mode", "caseCompleted", "counts", "expectedHeldV6", "taskScratchDisposition",
        "sourceTransforms", "nativeModuleAliases", "actualApplication", "actualNativeHTTPS", "actualOfficialCore", "sameV6File",
        "fundingPosts", "actualClientServiceRequests", "grantActivation", "chainObservations", "producerCandidateReservation",
        "fixedVerificationReservation", "aggregateCandidateReservation", "sdkPrepareBlock", "realPayment", "productionQualified", "nativePhysicalDrain"})
    require(type(namespace) is dict and set(namespace) == {"profileKind", "profileVersion", "mode", "inputsVerifiedBeforeCase",
        "applicationFiles", "packageFiles", "declaredSourceBytes", "sourceRowsSha256", "resolveCalls", "bareImportOverrideHits",
        "declaredFilesResolved", "sourceTransforms", "nativeBuiltinAliases", "ordinaryInstalledNamespaceQualified", "nativeOsNetworkSandbox"})
    require(case["mode"] == mode and case["caseCompleted"] is True and case["expectedHeldV6"] is (mode == "lost-ack"))
    require(case["taskScratchDisposition"] == ("HELD" if mode == "lost-ack" else "PRESERVE_CHILD_FILES"))
    counts = case["counts"]
    expected = dict(walletKeys=1, walletAddresses=1, walletSignatures=1, capabilityKeys=2, capabilitySignatures=3,
        independentPinFiles=2, verify=1, firstSettle=1, pendingObserve=2, executions=2, rawClientStarts=3,
        rawAuthenticated=3, rawCleanCloses=3, originalClientRepeatRefusals=1, backendExactReplays=1,
        foreignGrantRefusals=1, sameFileInitialCloses=1, borrowedSqlCloses=2)
    require(type(counts) is dict and set(counts) == set(expected) | {"referenceCandidates", "referenceWindows"})
    require(all(type(counts[k]) is int and counts[k] == v for k, v in expected.items()), "NATIVE_CASE_COUNTS")
    require(type(counts["referenceCandidates"]) is int and 1 <= counts["referenceCandidates"] <= 32768
            and type(counts["referenceWindows"]) is int and 1 <= counts["referenceWindows"] <= 8)
    require(all(type(case[k]) is int for k in ("producerCandidateReservation", "fixedVerificationReservation",
        "aggregateCandidateReservation", "sourceTransforms", "nativeModuleAliases", "fundingPosts", "actualClientServiceRequests")))
    require(case["producerCandidateReservation"] == 4096 and case["fixedVerificationReservation"] == 16384
            and case["aggregateCandidateReservation"] == counts["referenceCandidates"] + 4096 + 16384
            and case["aggregateCandidateReservation"] <= 65536, "NATIVE_NONCE_SCOPE")
    require(case["sourceTransforms"] == 0 and case["nativeModuleAliases"] == 0
            and all(case[k] is True for k in ("actualApplication", "actualNativeHTTPS", "actualOfficialCore", "sameV6File"))
            and case["fundingPosts"] == 1 and case["actualClientServiceRequests"] == 2)
    require(case["grantActivation"] == "ACTUAL_COMPOSITION_WITH_SYNTHETIC_SIGNED_PROVIDER_ENVELOPES"
            and case["chainObservations"] == "DECLARED_NOT_AUTHENTICATED"
            and case["sdkPrepareBlock"] is False and case["realPayment"] is False and case["productionQualified"] is False
            and case["nativePhysicalDrain"] == "NOT_QUALIFIED")
    require(all(type(namespace[k]) is int for k in ("profileVersion", "inputsVerifiedBeforeCase", "applicationFiles", "packageFiles",
        "declaredSourceBytes", "resolveCalls", "bareImportOverrideHits", "declaredFilesResolved", "sourceTransforms", "nativeBuiltinAliases")))
    require(namespace["declaredSourceBytes"] == source_bytes and 0 < source_bytes <= MAX_SOURCE_BYTES
        and 1 <= namespace["resolveCalls"] <= 8192 and 0 <= namespace["bareImportOverrideHits"] <= namespace["resolveCalls"]
        and 1 <= namespace["declaredFilesResolved"] <= APP_FILES + PACKAGE_FILES, "NATIVE_NAMESPACE_COUNTS")
    require(namespace["profileKind"] == KIND and namespace["profileVersion"] == 1 and namespace["mode"] == mode
            and namespace["inputsVerifiedBeforeCase"] == APP_FILES + PACKAGE_FILES
            and namespace["applicationFiles"] == APP_FILES and namespace["packageFiles"] == PACKAGE_FILES
            and namespace["sourceRowsSha256"] == source_rows_sha256 and namespace["sourceTransforms"] == 0
            and namespace["nativeBuiltinAliases"] == 0 and namespace["ordinaryInstalledNamespaceQualified"] is False
            and namespace["nativeOsNetworkSandbox"] is False, "NATIVE_NAMESPACE_SCOPE")
    for name, expected_value in (("tests", 1), ("pass", 1), ("fail", 0), ("skipped", 0), ("cancelled", 0), ("todo", 0)):
        require([line for line in lines if line.startswith("# " + name + " ")] == ["# " + name + " " + str(expected_value)],
                "NATIVE_EXACT_TAP_SET")
    require(lines.count("1..1") == 1 and not any(line.startswith("not ok ") for line in lines), "NATIVE_TAP_PLAN")
    return dict(case=case, namespace=namespace, productionQualified=False, nativePhysicalDrain="NOT_QUALIFIED")
