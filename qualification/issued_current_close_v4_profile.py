"""Current full issued-funding/close selection; metadata and read-only builders.

No application/package execution, native authority, task creation or cleanup.
The complete immutable 117/404 baseline is retained. Explicit current-source
replacements/additions are separate; historical manifests/results are never
rebound. Private profile URLs/identities must not be published.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
from urllib.parse import quote

KIND = "OFFICIAL_ISSUED_CURRENT_CLOSE_ONE_CLEAN_NODE24_V4"
DELTA_KIND = "CURRENT_ISSUED_CLOSE_FULL_GRAPH_DELTA_NOT_EXECUTION_V4"
SOURCE_PARENT = "61f7c11967afcb4310fb50700c8e91d7acdb8a25"
BASE = json.loads("{\"path\":\"qualification/issued-funding-post-native-vertical.inputs-v3.json\",\"bytes\":138777,\"LF\":3836,\"sha256\":\"51ffb5b0ff0052523c1b7f3d75fa24e9be27e60ca3bcc09236b1f439096aaed1\",\"gitBlob\":\"3dc05ccffd306e97056b4ed168d8121f63acebbc\"}")
BASE_CONTENT_SHA = "acdf3a91474ccbb24890516fc4644958ce95d8da9658d0aaa65dab602144fad1"
ENTRY = "app/qualification/issued-current-close-v4.case.mjs"
PRELOAD = "app/qualification/issued-current-close-v4.preload.mjs"
APP_FILES, PACKAGE_FILES = 123, 404
MAX_SOURCE_BYTES, MAX_PROFILE_BYTES = 6291456, 524288
FIELDS = {"path", "bytes", "LF", "sha256", "gitBlob"}
FIXED = json.loads("{\"app/src/service-credit-bounded-operation-drain.js\":\"4ea81e010451f91bb8f0ca668dd6bd3966763ea23385bdd0d511c200e4b3eecd\",\"app/src/service-credit-funding-post-native-https-transport.js\":\"61751ba97d98f02393cdf95fba166ece9f517b6e98db66ee05f3d4a52762f3fe\",\"app/src/service-credit-native-client-close-owner.js\":\"519809b2cc6b2bf2d37cf6048e68847255f75dc9869a1fc1119bae310462fbd7\",\"app/src/service-credit-native-client-request-stop-owner.js\":\"c030e52ba8ff25da68b590fb32f54ba58d983ed80b22aa0c611fb81c17ad4a63\",\"app/src/service-credit-native-guarded-store-close.js\":\"9110b9127388c893163f153a7bbea373955a44a49bc5f0ca595e6b179389e885\",\"app/src/zenon/dynamic-plasma-native-funding-service-client.js\":\"71b6a60c926d66dbc1b70888a2dc1720abc6886cb3c98cac28722d7be4089a01\",\"app/src/zenon/dynamic-plasma-original-funding-data.js\":\"8a416a548e827dc71bc6f87e675e265d01c20d6e8147de8617d47b8b8b8b0770\",\"app/src/zenon/dynamic-plasma-original-funding-preparation.js\":\"2d21e84d097c9814a3501a5742795df924ea59053c023825f4d9a9125f8f3451\",\"app/qualification/issued-current-close-v4-grant.fixture.mjs\":\"0134331b571eda461c8af2398e7dccd67010ed8b0f2c563b11415efc57ef8422\",\"app/qualification/issued-current-close-v4-rpc.fixture.mjs\":\"f54f75f6e6f50d2ebf9b47323cb16764dc885b754aef3bde390495c973046fc7\",\"app/qualification/issued-current-close-v4.case.mjs\":\"b79e955adffd83cd727e613fa9e54bede5edb06c678e303dbbea3578cfbbf883\",\"app/qualification/issued-current-close-v4.preload.mjs\":\"d105a810a164b717224d69e2c3e975c7412de62c88d5b0cdd7ab85fb17bf6700\",\"app/src/service-credit-bounded-close-completion.js\":\"1d59ec72cf9b8877947ba766316746be1e2ca5b82029c9b656757c2953ff7e5e\",\"app/src/zenon/dynamic-plasma-funding-post-preparation-input.js\":\"d45623eca3536309de46df816cafb05db14ec25a13a7b2e9a52625591d5a9972\"}")
REPLACED_NAMES = json.loads("[\"app/src/service-credit-bounded-operation-drain.js\",\"app/src/service-credit-funding-post-native-https-transport.js\",\"app/src/service-credit-native-client-close-owner.js\",\"app/src/service-credit-native-client-request-stop-owner.js\",\"app/src/service-credit-native-guarded-store-close.js\",\"app/src/zenon/dynamic-plasma-native-funding-service-client.js\",\"app/src/zenon/dynamic-plasma-original-funding-data.js\",\"app/src/zenon/dynamic-plasma-original-funding-preparation.js\"]")
ADDED_NAMES = json.loads("[\"app/qualification/issued-current-close-v4-grant.fixture.mjs\",\"app/qualification/issued-current-close-v4-rpc.fixture.mjs\",\"app/qualification/issued-current-close-v4.case.mjs\",\"app/qualification/issued-current-close-v4.preload.mjs\",\"app/src/service-credit-bounded-close-completion.js\",\"app/src/zenon/dynamic-plasma-funding-post-preparation-input.js\"]")
EDGES = json.loads("[{\"parent\":\"app/qualification/issued-funding-post-native-vertical.case.draft.mjs\",\"specifier\":\"@noble/ed25519\",\"target\":\"packages/@noble/ed25519/index.js\"},{\"parent\":\"app/qualification/issued-funding-post-native-vertical.case.draft.mjs\",\"specifier\":\"@noble/hashes/sha2\",\"target\":\"packages/@noble/hashes/esm/sha2.js\"},{\"parent\":\"app/src/zenon-payment.js\",\"specifier\":\"znn-typescript-sdk\",\"target\":\"packages/znn-typescript-sdk/dist/index.js\"},{\"parent\":\"app/src/zenon-payment.js\",\"specifier\":\"@noble/ed25519\",\"target\":\"packages/@noble/ed25519/index.js\"},{\"parent\":\"app/src/zenon-payment.js\",\"specifier\":\"@noble/hashes/sha2\",\"target\":\"packages/@noble/hashes/esm/sha2.js\"},{\"parent\":\"app/src/x402-official-selected-payment-client.js\",\"specifier\":\"@x402/core/client\",\"target\":\"packages/@x402/core/dist/esm/client/index.mjs\"},{\"parent\":\"app/src/x402-official-selected-settlement-server.js\",\"specifier\":\"@x402/core/server\",\"target\":\"packages/@x402/core/dist/esm/server/index.mjs\"},{\"parent\":\"packages/@x402/core/dist/esm/chunk-N4QXZG2Z.mjs\",\"specifier\":\"zod\",\"target\":\"packages/zod/index.js\"},{\"parent\":\"app/qualification/issued-current-close-v4.case.mjs\",\"specifier\":\"@noble/ed25519\",\"target\":\"packages/@noble/ed25519/index.js\"},{\"parent\":\"app/qualification/issued-current-close-v4.case.mjs\",\"specifier\":\"@noble/hashes/sha2\",\"target\":\"packages/@noble/hashes/esm/sha2.js\"}]")
BUILTINS = json.loads("[\"node:assert/strict\",\"node:async_hooks\",\"node:buffer\",\"node:crypto\",\"node:events\",\"node:fs\",\"node:fs/promises\",\"node:http\",\"node:https\",\"node:module\",\"node:net\",\"node:path\",\"node:perf_hooks\",\"node:sqlite\",\"node:stream\",\"node:test\",\"node:timers\",\"node:tls\",\"node:url\",\"node:util\",\"node:vm\",\"node:zlib\"]")
VERSIONS = json.loads("{\"packages/@x402/core/package.json\":\"2.23.0\",\"packages/zod/package.json\":\"3.25.76\",\"packages/znn-typescript-sdk/package.json\":\"1.0.5\",\"packages/@noble/ed25519/package.json\":\"2.3.0\",\"packages/@noble/hashes/package.json\":\"1.8.0\"}")
PACKAGE_ROWS_SHA = "6de2ebf27c64de96e4823d3c504347593490061b0c6510db378311258730a31f"
EFFECTS = json.loads("{\"selectedCases\":1,\"maximumRuns\":1,\"opensslCommands\":1,\"nodeCommands\":1,\"nodeChildren\":0,\"newSqlitePaths\":5,\"independentPinFiles\":2,\"syntheticEd25519Keys\":4,\"transactionSignatures\":1,\"capabilitySignatures\":3,\"providerSignatures\":2,\"testTlsMaterialSeparate\":true,\"maxRpcConnections\":174,\"maxApplicationConnections\":8,\"maxTotalConnections\":182,\"expectedTotalConnections\":96,\"maxCandidatesPerSearch\":4096,\"maxReferenceCandidates\":32768,\"producerCandidateReservation\":4096,\"fixedVerificationReservation\":16384,\"maxAggregateCandidates\":65536,\"taskQuotaBytes\":4194304,\"maximumSourceReadBytes\":6291456,\"existingSourcesRecopied\":false,\"externalNetwork\":false,\"install\":false,\"realWallet\":false,\"realPayment\":false,\"sdkPrepareBlock\":false,\"nativeOsNetworkSandbox\":false}")
CONTROL_NAMES = ["qualification/issued_current_close_v4_profile.py", "qualification/run-issued-current-close-v4.local.py",
    "qualification/funding_tls_current_gate.py",
    "qualification/run-funding-post-native-loopback-tls.local.py"]


def require(ok, code="CURRENT_ISSUED_CLOSE_V4_REJECTED"):
    if not ok:
        raise ValueError(code)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("ascii")


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def pin(name, raw):
    return dict(path=name, bytes=len(raw), LF=raw.count(b"\n"), sha256=sha(raw),
        gitBlob=hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest())


def row(value):
    require(type(value) is dict and set(value) == FIELDS, "SOURCE_ROW_FIELDS")
    name = value["path"]
    require(type(name) is str and len(name) <= 512
        and re.fullmatch(r"(?:app|packages)/[A-Za-z0-9@._/-]+", name) is not None
        and all(part not in ("", ".", "..") for part in name.split("/")), "SOURCE_ROW_PATH")
    require(type(value["bytes"]) is int and 0 <= value["bytes"] <= 1048576
        and type(value["LF"]) is int and 0 <= value["LF"] <= value["bytes"]
        and type(value["sha256"]) is str and re.fullmatch(r"[0-9a-f]{64}", value["sha256"]) is not None
        and type(value["gitBlob"]) is str and re.fullmatch(r"[0-9a-f]{40}", value["gitBlob"]) is not None,
        "SOURCE_ROW_VALUES")
    return name


def expand_manifest(delta, baseline):
    """Pure full-graph expansion; no filesystem, Node, package or manager import."""
    require(type(baseline) is dict and sha(canonical(baseline)) == BASE_CONTENT_SHA, "EXACT_IMMUTABLE_BASELINE_CONTENT")
    require(type(delta) is dict and set(delta) == {"kind", "version", "sourceParent", "baseline",
        "applicationReplacements", "applicationAdditions", "resolvedApplicationFiles", "packageFiles",
        "resolvedSourceRowsSha256", "resolvedSourceBytes", "packageRowsSha256", "entry", "preload",
        "bareBindings", "allowedBuiltins", "packageVersions", "effectsCeiling", "taskPolicy", "controlInputs",
        "sourceTransforms", "nativeBuiltinAliases", "nativeCasesExecuted"}, "EXACT_DELTA_FIELDS")
    require(delta["kind"] == DELTA_KIND and type(delta["version"]) is int and delta["version"] == 4
        and delta["sourceParent"] == SOURCE_PARENT and delta["baseline"] == BASE
        and delta["entry"] == ENTRY and delta["preload"] == PRELOAD, "EXACT_CURRENT_SELECTION")
    require(type(delta["resolvedApplicationFiles"]) is int and delta["resolvedApplicationFiles"] == APP_FILES
        and type(delta["packageFiles"]) is int and delta["packageFiles"] == PACKAGE_FILES
        and delta["sourceTransforms"] is False and delta["nativeBuiltinAliases"] is False
        and type(delta["nativeCasesExecuted"]) is int and delta["nativeCasesExecuted"] == 0, "NO_REDUCTION_OR_EXECUTION_RELABEL")
    require(type(baseline["applicationInputs"]) is list and len(baseline["applicationInputs"]) == 117
        and type(baseline["packageInputs"]) is list and len(baseline["packageInputs"]) == PACKAGE_FILES, "FULL_BASELINE_117_404")
    full = {}
    for value in baseline["applicationInputs"] + baseline["packageInputs"]:
        name = row(value)
        require(name not in full, "BASELINE_DUPLICATE")
        full[name] = dict(value)
    packages = sorted(baseline["packageInputs"], key=lambda r: r["path"])
    require(sha(canonical(packages)) == PACKAGE_ROWS_SHA == delta["packageRowsSha256"], "ALL_404_PACKAGE_ROWS_UNCHANGED")
    replacements, additions = delta["applicationReplacements"], delta["applicationAdditions"]
    require(type(replacements) is list and [v["input"].get("path") if type(v) is dict and type(v.get("input")) is dict else None
        for v in replacements] == REPLACED_NAMES, "EXACT_EIGHT_CURRENT_REPLACEMENTS")
    require(type(additions) is list and [v.get("path") if type(v) is dict else None for v in additions] == ADDED_NAMES,
        "EXACT_SIX_ADDITIONS_NO_SHADOW")
    for value in replacements:
        require(type(value) is dict and set(value) == {"beforeSha256", "input"}, "REPLACEMENT_FIELDS")
        name = row(value["input"])
        require(name.startswith("app/") and name in full
            and value["beforeSha256"] == full[name]["sha256"]
            and value["input"]["sha256"] == FIXED[name] != value["beforeSha256"], "EXACT_REPLACEMENT_BINDING")
        full[name] = dict(value["input"])
    for value in additions:
        name = row(value)
        require(name.startswith("app/") and name not in full and value["sha256"] == FIXED[name], "ADDITION_NOT_BASELINE_SHADOW")
        full[name] = dict(value)
    result = sorted(full.values(), key=lambda r: r["path"])
    require(len(result) == APP_FILES + PACKAGE_FILES
        and sum(v["path"].startswith("app/") for v in result) == APP_FILES
        and all(full.get(name, {}).get("sha256") == digest for name, digest in FIXED.items()), "FULL_CURRENT_GRAPH")
    require(type(delta["resolvedSourceBytes"]) is int
        and delta["resolvedSourceBytes"] == sum(v["bytes"] for v in result) <= MAX_SOURCE_BYTES
        and delta["resolvedSourceRowsSha256"] == sha(canonical(result)), "COMPLETE_CURRENT_SOURCE_SEAL")
    require(canonical(delta["bareBindings"]) == canonical(EDGES)
        and delta["allowedBuiltins"] == BUILTINS and delta["packageVersions"] == VERSIONS
        and canonical(delta["effectsCeiling"]) == canonical(EFFECTS), "EXACT_NAMESPACE_AND_FINITE_EFFECTS")
    require(all(v["parent"] in full and v["target"] in full for v in EDGES), "ALL_TEN_BARE_BINDINGS_PRESENT")
    require(canonical(delta["taskPolicy"]) == canonical(dict(quotaBytes=4194304, minimumFreeBytes=10737418240,
        existingApprovedRootOnly=True, rootPolicyOverride=False, maximumRuns=1)), "TASK_ONLY_POLICY_NOT_NEW_ROOT")
    controls = delta["controlInputs"]
    require(type(controls) is list and [v.get("path") if type(v) is dict else None for v in controls] == CONTROL_NAMES,
        "EXACT_LAUNCH_CONTROL_SET")
    for value in controls:
        require(type(value) is dict and set(value) == FIELDS and type(value["path"]) is str
            and value["path"].startswith("qualification/"), "CONTROL_FIELDS")
        row({**value, "path": "app/" + value["path"]})
    return result


def identity(s):
    return [str(v) for v in (s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode,
        s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns)]


def no_links(path):
    for at in (path, *path.parents):
        require(not stat.S_ISLNK(at.lstat().st_mode), "SOURCE_LINK")


def root(value):
    require(type(value) is str and os.path.isabs(value) and os.path.normpath(value) == value, "ABSOLUTE_SOURCE_ROOT")
    path = Path(value)
    no_links(path)
    s = path.lstat()
    require(stat.S_ISDIR(s.st_mode) and s.st_uid == os.getuid(), "SOURCE_ROOT_IDENTITY")
    return path, identity(s)


def capture(path, maximum=1048576):
    no_links(path)
    before = path.lstat()
    require(stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid() and before.st_nlink == 1
        and 0 <= before.st_size <= maximum, "SOURCE_FILE_IDENTITY")
    ident = identity(before)
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        require(identity(os.fstat(stream.fileno())) == ident, "SOURCE_FD_IDENTITY")
        raw = stream.read(maximum + 1)
        require(len(raw) == before.st_size and identity(os.fstat(stream.fileno())) == ident, "SOURCE_READ_IDENTITY")
    require(identity(path.lstat()) == ident, "SOURCE_PATH_IDENTITY")
    return raw, ident


def load_selection(application_root, delta):
    app, app_id = root(application_root)
    raw, _ = capture(app / BASE["path"], 524288)
    require(pin(BASE["path"], raw) == BASE, "BASELINE_BYTES_UNCHANGED")
    baseline = json.loads(raw)
    rows = expand_manifest(delta, baseline)
    for item in delta["controlInputs"]:
        raw, _ = capture(app / item["path"])
        require(pin(item["path"], raw) == item, "CONTROL_SOURCE_CHANGED")
    require(identity(app.lstat()) == app_id, "APPLICATION_ROOT_REPLACED")
    return app, app_id, baseline, rows


def verify_application_inputs(application_root, delta):
    """Read all current app inputs once, not an application or package import."""
    app, app_id, _base, rows = load_selection(application_root, delta)
    inputs = []
    for item in rows:
        if not item["path"].startswith("app/"):
            continue
        raw, ident = capture(app / item["path"][4:])
        require(pin(item["path"], raw) == item, "CURRENT_APPLICATION_SOURCE_PIN")
        inputs.append(dict(logicalPath=item["path"], bytes=len(raw), sha256=item["sha256"], identity=ident))
    require(identity(app.lstat()) == app_id, "APPLICATION_ROOT_REPLACED")
    return dict(applicationFiles=len(inputs), packageFilesDeclared=PACKAGE_FILES, packageFilesRead=0,
        inputs=inputs, sourceRowsSha256=delta["resolvedSourceRowsSha256"], nativeCasesExecuted=0,
        applicationOrPackageImported=False, storageAdmissionPerformed=False)


def build_profile(application_root, package_root, delta, mode="clean"):
    """Private read-only profile. Returning it does NOT admit a native command."""
    require(type(mode) is str and mode == "clean", "ONLY_CURRENT_CLEAN_MODE")
    app, app_id, _base, rows = load_selection(application_root, delta)
    packages, package_id = root(package_root)
    inputs, indexed, versions = [], {}, {}
    for item in rows:
        name = item["path"]
        path = app / name[4:] if name.startswith("app/") else packages / name[9:]
        raw, ident = capture(path)
        require(pin(name, raw) == item, "CURRENT_SOURCE_OR_PACKAGE_PIN")
        require(re.fullmatch(r"/[A-Za-z0-9@._ /-]+", str(path)) is not None, "NARROW_CANONICAL_FILE_URL")
        value = dict(logicalPath=name, url="file://" + quote(str(path), safe="/@"),
            bytes=len(raw), sha256=item["sha256"], identity=ident)
        inputs.append(value)
        indexed[name] = value
        if name in VERSIONS:
            versions[name] = json.loads(raw).get("version")
    require(versions == VERSIONS, "EXACT_EXISTING_PACKAGE_VERSIONS")
    bindings = [dict(parentURL=indexed[v["parent"]]["url"], specifier=v["specifier"],
        targetURL=indexed[v["target"]]["url"]) for v in EDGES]
    profile = dict(profileVersion=4, profileKind=KIND, runtime=dict(node="24.19.0", platform="darwin", arch="arm64"),
        mode="clean", entryURL=indexed[ENTRY]["url"], inputs=inputs, bareBindings=bindings, allowedBuiltins=BUILTINS,
        sourceRowsSha256=delta["resolvedSourceRowsSha256"], sourceTransform=False, ordinaryInstalledNamespace=False)
    raw = canonical(profile) + b"\n"
    require(len(raw) <= MAX_PROFILE_BYTES and identity(app.lstat()) == app_id
        and identity(packages.lstat()) == package_id, "PROFILE_SIZE_OR_ROOT_REPLACEMENT")
    return dict(profileBytes=raw, profileSha256=sha(raw), profileBytesCount=len(raw),
        sourceRowsSha256=delta["resolvedSourceRowsSha256"], sourceBytes=delta["resolvedSourceBytes"],
        applicationFiles=APP_FILES, packageFiles=PACKAGE_FILES, mode="clean",
        effectsExecuted=False, existingSourcesRecopied=False)


def validate_native_capture(stdout, stderr, receipt, delta, baseline):
    """A pure parser: fabricated DATA is never an actual native execution."""
    rows = expand_manifest(delta, baseline)
    require(type(stdout) is bytes and type(stderr) is bytes and len(stdout) <= 65536 and len(stderr) <= 65536,
        "NATIVE_CAPTURE_BOUND")
    require(type(receipt) is dict and receipt.get("state") == "COMPLETE"
        and receipt.get("output_complete") is True and type(receipt.get("actual_exit")) is int
        and receipt["actual_exit"] == 0, "NATIVE_FAILED_OR_UNKNOWN")
    lines = stdout.decode("utf8").splitlines()
    def footer(prefix):
        found = [v[len(prefix):] for v in lines if v.startswith(prefix)]
        require(len(found) == 1, "EXACT_NATIVE_FOOTER")
        return json.loads(found[0])
    case = footer("# actual-issued-native-close-completion-v4 ")
    namespace = footer("# pinned-issued-native-current-close-v4-namespace ")
    expected_keys = {"mode", "caseCompleted", "counts", "expectedHeldV6", "taskScratchDisposition", "closeProof",
        "sourceTransforms", "nativeModuleAliases", "actualApplication", "actualNativeHTTPS", "actualOfficialCore", "sameV6File",
        "fundingPosts", "actualClientServiceRequests", "grantActivation", "chainObservations", "producerCandidateReservation",
        "fixedVerificationReservation", "aggregateCandidateReservation", "sdkPrepareBlock", "realPayment",
        "productionQualified", "nativePhysicalDrain"}
    require(type(case) is dict and set(case) == expected_keys and case["mode"] == "clean"
        and case["caseCompleted"] is True and case["expectedHeldV6"] is False
        and case["taskScratchDisposition"] == "PRESERVE_CHILD_FILES", "EXACT_CURRENT_CLEAN_RESULT")
    expected_counts = dict(walletKeys=1, walletAddresses=1, walletSignatures=1, capabilityKeys=2, capabilitySignatures=3,
        independentPinFiles=2, verify=1, firstSettle=1, pendingObserve=2, executions=2, rawClientStarts=3,
        rawAuthenticated=3, rawCleanCloses=3, originalClientRepeatRefusals=1, backendExactReplays=1,
        foreignGrantRefusals=1, sameFileInitialCloses=1, borrowedSqlCloses=2)
    counts = case["counts"]
    require(type(counts) is dict and set(counts) == set(expected_counts) | {"referenceCandidates", "referenceWindows"}
        and all(type(counts[k]) is int and counts[k] == v for k, v in expected_counts.items()), "ACTUAL_CASE_COUNTS")
    require(type(counts["referenceCandidates"]) is int and 1 <= counts["referenceCandidates"] <= 32768
        and type(counts["referenceWindows"]) is int and 1 <= counts["referenceWindows"] <= 8, "BOUNDED_NONCE_REFERENCE")
    close = case["closeProof"]
    expected_close = dict(wholeCloseBudgetObserved=True, budgetMs=1000, outcome="CLOSED", observationStarts=1,
        completionProbeEntries=1, operationDrain="DRAINED", fundingClose="CLOSED", serviceClose="CLOSED",
        historicalClose="FULFILLED_UNDEFINED", applicationSlotHeld=False, currentFundingClosed=True,
        currentServiceClosed=True, actualFundingStoreCloseReturned=True)
    require(type(close) is dict and canonical(close) == canonical(expected_close), "WHOLE_CLOSE_ACTUAL_PROOF_REQUIRED")
    for name, expected in (("sourceTransforms", 0), ("nativeModuleAliases", 0), ("fundingPosts", 1),
        ("actualClientServiceRequests", 2), ("producerCandidateReservation", 4096), ("fixedVerificationReservation", 16384)):
        require(type(case[name]) is int and case[name] == expected, "EXACT_EFFECT_COUNTER")
    require(type(case["aggregateCandidateReservation"]) is int
        and case["aggregateCandidateReservation"] == counts["referenceCandidates"] + 4096 + 16384 <= 65536,
        "TOTAL_NONCE_RESERVATION")
    require(all(case[k] is True for k in ("actualApplication", "actualNativeHTTPS", "actualOfficialCore", "sameV6File"))
        and case["sdkPrepareBlock"] is False and case["realPayment"] is False and case["productionQualified"] is False
        and case["nativePhysicalDrain"] == "NOT_QUALIFIED"
        and case["grantActivation"] == "ACTUAL_COMPOSITION_WITH_SYNTHETIC_SIGNED_PROVIDER_ENVELOPES"
        and case["chainObservations"] == "DECLARED_NOT_AUTHENTICATED", "NO_ECONOMIC_OR_PRODUCTION_UPGRADE")
    ns_keys = {"profileKind", "profileVersion", "mode", "inputsVerifiedBeforeCase", "applicationFiles", "packageFiles",
        "declaredSourceBytes", "sourceRowsSha256", "resolveCalls", "bareImportOverrideHits", "declaredFilesResolved",
        "sourceTransforms", "nativeBuiltinAliases", "ordinaryInstalledNamespaceQualified", "nativeOsNetworkSandbox"}
    require(type(namespace) is dict and set(namespace) == ns_keys, "EXACT_NAMESPACE_FIELDS")
    for name, expected in (("profileVersion", 4), ("inputsVerifiedBeforeCase", len(rows)), ("applicationFiles", APP_FILES),
        ("packageFiles", PACKAGE_FILES), ("declaredSourceBytes", delta["resolvedSourceBytes"]),
        ("sourceTransforms", 0), ("nativeBuiltinAliases", 0)):
        require(type(namespace[name]) is int and namespace[name] == expected, "FULL_CURRENT_NAMESPACE_COUNTS")
    require(namespace["profileKind"] == KIND and namespace["mode"] == "clean"
        and namespace["sourceRowsSha256"] == delta["resolvedSourceRowsSha256"]
        and namespace["ordinaryInstalledNamespaceQualified"] is False and namespace["nativeOsNetworkSandbox"] is False,
        "EXACT_CURRENT_NAMESPACE_SELECTION")
    require(type(namespace["resolveCalls"]) is int and 1 <= namespace["resolveCalls"] <= 8192
        and type(namespace["bareImportOverrideHits"]) is int and 0 <= namespace["bareImportOverrideHits"] <= namespace["resolveCalls"]
        and type(namespace["declaredFilesResolved"]) is int and 1 <= namespace["declaredFilesResolved"] <= len(rows), "RESOLUTION_BOUNDS")
    for name, expected in (("tests", 1), ("pass", 1), ("fail", 0), ("skipped", 0), ("cancelled", 0), ("todo", 0)):
        require([v for v in lines if v.startswith("# " + name + " ")] == ["# " + name + " " + str(expected)],
            "EXACT_TAP_TOTAL")
    require(lines.count("1..1") == 1 and not any(v.startswith("not ok ") for v in lines), "EXACT_SINGLE_CASE_TAP_PLAN")
    return dict(case=case, namespace=namespace, productionQualified=False, nativePhysicalDrain="NOT_QUALIFIED")
