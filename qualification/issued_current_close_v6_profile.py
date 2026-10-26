"""Complete current one-clean source/profile admission; no native authority.

Cold capture hashes every source once. Warm cooperative rechecks compare full
nine-field identities; the real native preloader hashes the complete graph anew.
No source rewriting, installed-package fallback, root creation or retry.
"""
import hashlib,json,os,re,stat
from pathlib import Path
from urllib.parse import quote
KIND = 'OFFICIAL_ISSUED_CURRENT_CLOSE_ONE_CLEAN_NODE24_V6'
APP_FILES, PACKAGE_FILES = 123, 404
MAX_PROFILE_BYTES = 524288
FIELDS = {'path','bytes','LF','sha256','gitBlob'}
FROZEN = json.loads('{"kind":"CURRENT_ISSUED_CLOSE_COMPLETE_GRAPH_V6_NOT_NATIVE_AUTHORITY","version":6,"sourceParent":"da41797548ca709c301057b72980a2f6e713b3f5","previousSelection":{"path":"qualification/issued-current-close-v5.inputs.json","bytes":7605,"LF":231,"sha256":"4a7b2f42c89363bf5d60de80fb18ecb2373963a2d5e0079d4f7225ce02c74985","gitBlob":"d113c6b048dbea38f4da04d9467d1a769a482423"},"previousSourceRowsSha256":"0c270548aceb8bb5589776e5f5a8cdb68bfe5f03472ed1c1e507c044fcddea70","baseline":{"path":"qualification/issued-funding-post-native-vertical.inputs-v3.json","bytes":138777,"LF":3836,"sha256":"51ffb5b0ff0052523c1b7f3d75fa24e9be27e60ca3bcc09236b1f439096aaed1","gitBlob":"3dc05ccffd306e97056b4ed168d8121f63acebbc"},"applicationReplacements":[{"before":{"path":"app/src/service-credit-original-request-custody-contract.js","bytes":14051,"LF":356,"sha256":"fd349de553a17abcc2e0567ba6640e6e3d5d26cfa79ee1e355928dc9fa8d3915","gitBlob":"f911d42d01b69e6577f9bcd66f4ed59aab8ab882"},"input":{"path":"app/src/service-credit-original-request-custody-contract.js","bytes":15100,"LF":376,"sha256":"483d20e90d78ba95a8c5d5458dd201910e8d42aecbdc0dc03812e7044a464054","gitBlob":"94d67559a11f87f283a5cd99d2aaf8074374eb0a"}},{"before":{"path":"app/src/x402-original-payment-checkpoint-client.js","bytes":12251,"LF":246,"sha256":"b98c64fb071a55578bfd5c49790d11f8fca443e59e32beb8498eb67941201103","gitBlob":"6fdc3917e64f9dbad61ffb4b236951e3cb9ebcf5"},"input":{"path":"app/src/x402-original-payment-checkpoint-client.js","bytes":13457,"LF":262,"sha256":"bba2439e40a2decb75b330440919d8d1ea1fea53f6e684f77b57a9bb66129af1","gitBlob":"bd732c2c739e6dbe1d4ed583b6b55040bf8aecfd"}},{"before":{"path":"app/src/zenon/bounded-json-rpc-read-core.js","bytes":21759,"LF":582,"sha256":"10cc529bfb0676bb03dc4dad56059663f4a578b586c52f6404fc859d27d18f76","gitBlob":"3bd98a83413eb13e3bceb097d35fb874b4c030a2"},"input":{"path":"app/src/zenon/bounded-json-rpc-read-core.js","bytes":22116,"LF":586,"sha256":"1d8873868274045825717ee70b9a402d91cd6235fdaf410d93ddb365fc2d7ca3","gitBlob":"82d49d18a92c1074819e8976d94a2cfef3975466"}},{"before":{"path":"app/qualification/issued-current-close-v5.case.mjs","bytes":35789,"LF":493,"sha256":"fc40cdfd0b574f6b9a5ab95eb8837d9240cf1a77e9f673c15a6eb979651444ba","gitBlob":"1b4970ed44c1de932c91d984240938e82b03b7cd"},"input":{"path":"app/qualification/issued-current-close-v6.case.mjs","bytes":35789,"LF":493,"sha256":"9f69ef8142c7fdedb91d593d771a142f28ea744311fca1d399bd71055a6551bd","gitBlob":"3ff9c14d91240b8fa1ff77e6221e5f867f359247"}},{"before":{"path":"app/qualification/issued-current-close-v5.preload.mjs","bytes":12639,"LF":176,"sha256":"eb684c3762a9b34bb8c1c5306486eac65f66001475870a25e8af187fe02989b2","gitBlob":"ae41957fde574fe47fc1bd43b00545dbd29c134d"},"input":{"path":"app/qualification/issued-current-close-v6.preload.mjs","bytes":13040,"LF":179,"sha256":"95a8e3026fd3b2ed54947eee2ca8bcb24084839bb337e0664cdd3deb3a4880be","gitBlob":"e6c51fd7943519d35a5514cdc0dd0b151267527a"}}],"resolvedApplicationFiles":123,"packageFiles":404,"resolvedSourceRowsSha256":"a08f5f9a3e962cca07155c256c107b02b0bff72da8cf3b7ae36360ca801bc1d3","resolvedSourceBytes":4476572,"packageRowsSha256":"6de2ebf27c64de96e4823d3c504347593490061b0c6510db378311258730a31f","entry":"app/qualification/issued-current-close-v6.case.mjs","preload":"app/qualification/issued-current-close-v6.preload.mjs","bareBindings":[{"parent":"app/qualification/issued-funding-post-native-vertical.case.draft.mjs","specifier":"@noble/ed25519","target":"packages/@noble/ed25519/index.js"},{"parent":"app/qualification/issued-funding-post-native-vertical.case.draft.mjs","specifier":"@noble/hashes/sha2","target":"packages/@noble/hashes/esm/sha2.js"},{"parent":"app/src/zenon-payment.js","specifier":"znn-typescript-sdk","target":"packages/znn-typescript-sdk/dist/index.js"},{"parent":"app/src/zenon-payment.js","specifier":"@noble/ed25519","target":"packages/@noble/ed25519/index.js"},{"parent":"app/src/zenon-payment.js","specifier":"@noble/hashes/sha2","target":"packages/@noble/hashes/esm/sha2.js"},{"parent":"app/src/x402-official-selected-payment-client.js","specifier":"@x402/core/client","target":"packages/@x402/core/dist/esm/client/index.mjs"},{"parent":"app/src/x402-official-selected-settlement-server.js","specifier":"@x402/core/server","target":"packages/@x402/core/dist/esm/server/index.mjs"},{"parent":"packages/@x402/core/dist/esm/chunk-N4QXZG2Z.mjs","specifier":"zod","target":"packages/zod/index.js"},{"parent":"app/qualification/issued-current-close-v6.case.mjs","specifier":"@noble/ed25519","target":"packages/@noble/ed25519/index.js"},{"parent":"app/qualification/issued-current-close-v6.case.mjs","specifier":"@noble/hashes/sha2","target":"packages/@noble/hashes/esm/sha2.js"}],"allowedBuiltins":["node:assert/strict","node:async_hooks","node:buffer","node:crypto","node:events","node:fs","node:fs/promises","node:http","node:https","node:module","node:net","node:path","node:perf_hooks","node:sqlite","node:stream","node:test","node:timers","node:tls","node:url","node:util","node:vm","node:zlib"],"packageVersions":{"packages/@x402/core/package.json":"2.23.0","packages/zod/package.json":"3.25.76","packages/znn-typescript-sdk/package.json":"1.0.5","packages/@noble/ed25519/package.json":"2.3.0","packages/@noble/hashes/package.json":"1.8.0"},"effectsCeiling":{"selectedCases":1,"maximumRuns":1,"opensslCommands":1,"nodeCommands":1,"nodeChildren":0,"newSqlitePaths":5,"independentPinFiles":2,"syntheticEd25519Keys":4,"transactionSignatures":1,"capabilitySignatures":3,"providerSignatures":2,"testTlsMaterialSeparate":true,"maxRpcConnections":174,"maxApplicationConnections":8,"maxTotalConnections":182,"expectedTotalConnections":96,"maxCandidatesPerSearch":4096,"maxReferenceCandidates":32768,"producerCandidateReservation":4096,"fixedVerificationReservation":16384,"maxAggregateCandidates":65536,"taskQuotaBytes":4194304,"maximumSourceReadBytes":6291456,"existingSourcesRecopied":false,"externalNetwork":false,"install":false,"realWallet":false,"realPayment":false,"sdkPrepareBlock":false,"nativeOsNetworkSandbox":false},"taskPolicy":{"quotaBytes":4194304,"minimumFreeBytes":10737418240,"existingApprovedRootOnly":true,"rootPolicyOverride":false,"maximumRuns":1},"nativeAuthority":"NOT_GRANTED","nativeCasesExecuted":0,"installedPackageFilesRead":0,"sourceTransforms":false,"historicalEvidenceRebound":false}')
BASE=FROZEN['baseline']; ENTRY=FROZEN['entry']; PRELOAD=FROZEN['preload']
EDGES=FROZEN['bareBindings']; BUILTINS=FROZEN['allowedBuiltins']; VERSIONS=FROZEN['packageVersions']; EFFECTS=FROZEN['effectsCeiling']
CONTROL_NAMES=['qualification/issued_current_close_v6_profile.py', 'qualification/run-issued-current-close-v6.local.py', 'qualification/funding_tls_current_gate.py', 'qualification/run-funding-post-native-loopback-tls.local.py']

def require(ok, code="CURRENT_ISSUED_CLOSE_V6_REJECTED"):
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


def expand_manifest(delta, baseline):
    """Closed complete DATA inventory. Historical/native results are not input."""
    require(type(delta) is dict and set(delta) == set(FROZEN) | {"sourceRows", "controlInputs"}, "EXACT_V6_MANIFEST_FIELDS")
    require(canonical({k:delta[k] for k in FROZEN}) == canonical(FROZEN), "EXACT_CURRENT_V6_SELECTION")
    require(sha(canonical(baseline)) == "acdf3a91474ccbb24890516fc4644958ce95d8da9658d0aaa65dab602144fad1", "PRESERVED_BASELINE_CONTENT")
    rows = delta["sourceRows"]
    require(type(rows) is list and len(rows) == APP_FILES + PACKAGE_FILES, "COMPLETE_527_ROWS")
    names = [row(p) for p in rows]
    require(names == sorted(set(names)) and sum(n.startswith("app/") for n in names) == APP_FILES, "COMPLETE_DISTINCT_APPLICATION_ROWS")
    require(sha(canonical(rows)) == FROZEN["resolvedSourceRowsSha256"]
        and sum(p["bytes"] for p in rows) == FROZEN["resolvedSourceBytes"], "EXACT_WHOLE_SOURCE_GRAPH")
    packages = [p for p in rows if p["path"].startswith("packages/")]
    require(len(packages) == PACKAGE_FILES and sha(canonical(packages)) == FROZEN["packageRowsSha256"], "ALL_404_PACKAGE_ROWS")
    controls = delta["controlInputs"]
    require(type(controls) is list and len(controls) == len(CONTROL_NAMES)
        and all(type(p) is dict and set(p) == FIELDS for p in controls)
        and [p["path"] for p in controls] == CONTROL_NAMES, "EXACT_FOUR_CONTROLS")
    for edge in EDGES:
        require(edge["parent"] in names and edge["target"] in names, "COMPLETE_BARE_EDGES")
    return rows

def recheck_captured_files(captures):
    """Only source-owned cold captures are used by the launcher; no read opens."""
    require(type(captures) is tuple and len(captures) <= 700, "BOUNDED_COLD_CAPTURE")
    for name, expected in captures:
        require(type(name) is str and os.path.isabs(name) and os.path.normpath(name) == name
            and type(expected) is tuple and len(expected) == 9
            and all(type(v) is str and re.fullmatch(r"[0-9]+", v) for v in expected), "EXACT_CAPTURE_IDENTITY")
        path = Path(name)
        no_links(path)
        require(identity(path.lstat()) == list(expected), "CAPTURED_SOURCE_IDENTITY_CHANGED")

def verify_application_inputs(application_root, delta):
    app, app_id, _baseline, rows = load_selection(application_root, delta)
    inputs, captures = [], []
    for item in rows:
        if not item["path"].startswith("app/"):
            continue
        path = app / item["path"][4:]
        raw, ident = capture(path)
        require(pin(item["path"], raw) == item, "CURRENT_APPLICATION_SOURCE_PIN")
        captures.append((str(path), tuple(ident)))
        inputs.append(dict(logicalPath=item["path"], bytes=len(raw), sha256=item["sha256"], identity=ident))
    captures.append((str(app), tuple(app_id)))
    captured = tuple(captures)
    recheck_captured_files(captured)
    return dict(applicationFiles=len(inputs), packageFilesDeclared=PACKAGE_FILES, packageFilesRead=0,
        inputs=inputs, sourceRowsSha256=FROZEN["resolvedSourceRowsSha256"], nativeCasesExecuted=0,
        applicationOrPackageImported=False, storageAdmissionPerformed=False, _captures=captured)

def recheck_application_inputs(captured):
    require(type(captured) is dict and captured.get("applicationFiles") == APP_FILES
        and captured.get("packageFilesRead") == 0 and captured.get("sourceRowsSha256") == FROZEN["resolvedSourceRowsSha256"],
        "CURRENT_SOURCE_CAPTURE_REQUIRED")
    require(type(captured.get("_captures")) is tuple and len(captured["_captures"]) == APP_FILES + 1
        and type(captured.get("inputs")) is list and len(captured["inputs"]) == APP_FILES, "COMPLETE_SOURCE_CAPTURE_REQUIRED")
    recheck_captured_files(captured["_captures"])



def plan_declared_profile(delta, baseline, application_root, package_root, inputs):
    """Pure complete-profile encoding; caller facts are not installed-source proof."""
    rows = expand_manifest(delta, baseline)
    for name in (application_root, package_root):
        require(type(name) is str and re.fullmatch(r"/[A-Za-z0-9@._ /-]+", name) is not None
            and os.path.normpath(name) == name, "CANONICAL_DECLARED_ROOT")
    require(application_root != package_root, "INDEPENDENT_DECLARED_ROOT_PATHS")
    require(type(inputs) is list and len(inputs) == len(rows), "ALL_527_DECLARED_INPUTS")
    expected = {p["path"]:p for p in rows}
    indexed, physical = {}, set()
    for value in inputs:
        require(type(value) is dict and set(value) == {"logicalPath","url","bytes","sha256","identity"}, "EXACT_DECLARED_INPUT_FIELDS")
        name = value["logicalPath"]
        require(type(name) is str and name in expected and name not in indexed, "COMPLETE_DISTINCT_DECLARED_NAMES")
        row = expected[name]
        base, relative = (application_root, name[4:]) if name.startswith("app/") else (package_root, name[9:])
        require(type(value["url"]) is str and value["url"] == "file://" + quote(base + "/" + relative, safe="/@")
            and type(value["bytes"]) is int and value["bytes"] == row["bytes"]
            and type(value["sha256"]) is str and value["sha256"] == row["sha256"], "EXACT_DECLARED_SOURCE_CONTENT_AND_URL")
        ident = value["identity"]
        require(type(ident) is list and len(ident) == 9
            and all(type(v) is str and re.fullmatch(r"(?:0|[1-9][0-9]{0,19})", v) is not None and int(v) < 2**64 for v in ident),
            "EXACT_NINE_FIELD_DECLARED_IDENTITY")
        numbers = list(map(int, ident))
        require(numbers[1] > 0 and numbers[2] == os.getuid() and numbers[4] <= 0o177777
            and stat.S_IFMT(numbers[4]) == stat.S_IFREG and numbers[5] == 1 and numbers[6] == row["bytes"],
            "DECLARED_OWNED_SINGLE_LINK_FILE")
        key = tuple(ident[:2])
        require(key not in physical, "NO_DECLARED_SOURCE_ALIAS"); physical.add(key)
        indexed[name] = dict(logicalPath=name, url=value["url"], bytes=row["bytes"], sha256=row["sha256"], identity=list(ident))
    ordered = [indexed[p["path"]] for p in rows]
    bindings = [dict(parentURL=indexed[p["parent"]]["url"], specifier=p["specifier"], targetURL=indexed[p["target"]]["url"]) for p in EDGES]
    profile = dict(profileVersion=6, profileKind=KIND, runtime=dict(node="24.19.0", platform="darwin", arch="arm64"),
        mode="clean", entryURL=indexed[ENTRY]["url"], inputs=ordered, bareBindings=bindings,
        allowedBuiltins=list(BUILTINS), sourceRowsSha256=FROZEN["resolvedSourceRowsSha256"],
        sourceTransform=False, ordinaryInstalledNamespace=False)
    encoded = canonical(profile) + b"\n"
    require(len(encoded) <= MAX_PROFILE_BYTES, "BOUNDED_COMPLETE_PROFILE")
    return dict(profileBytes=encoded, profileSha256=sha(encoded), profileBytesCount=len(encoded),
        sourceRowsSha256=FROZEN["resolvedSourceRowsSha256"], sourceBytes=FROZEN["resolvedSourceBytes"],
        applicationFiles=APP_FILES, packageFiles=PACKAGE_FILES, mode="clean",
        effectsExecuted=False, existingSourcesRecopied=False)


def build_profile(application_root, package_root, delta, mode="clean"):
    """Private read-only profile. Returning it does NOT admit a native command."""
    require(type(mode) is str and mode == "clean", "ONLY_CURRENT_CLEAN_MODE")
    app, app_id, _base, rows = load_selection(application_root, delta)
    packages, package_id = root(package_root)
    inputs, indexed, versions = [], {}, {}
    captures = [(str(app), tuple(app_id)), (str(packages), tuple(package_id))]
    require(app_id[:2] != package_id[:2], "INDEPENDENT_SOURCE_ROOTS")
    physical = set()
    for item in rows:
        name = item["path"]
        path = app / name[4:] if name.startswith("app/") else packages / name[9:]
        raw, ident = capture(path)
        require(tuple(ident[:2]) not in physical, "NO_PHYSICAL_INPUT_ALIAS")
        physical.add(tuple(ident[:2])); captures.append((str(path), tuple(ident)))
        require(pin(name, raw) == item, "CURRENT_SOURCE_OR_PACKAGE_PIN")
        require(re.fullmatch(r"/[A-Za-z0-9@._ /-]+", str(path)) is not None, "NARROW_CANONICAL_FILE_URL")
        value = dict(logicalPath=name, url="file://" + quote(str(path), safe="/@"),
            bytes=len(raw), sha256=item["sha256"], identity=ident)
        inputs.append(value)
        indexed[name] = value
        if name in VERSIONS:
            versions[name] = json.loads(raw).get("version")
    require(versions == VERSIONS, "EXACT_EXISTING_PACKAGE_VERSIONS")
    built = plan_declared_profile(delta, _base, str(app), str(packages), inputs)
    require(identity(app.lstat()) == app_id and identity(packages.lstat()) == package_id, "PROFILE_ROOT_REPLACEMENT")
    return {**built, "_captures": tuple(captures)}

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
    case = footer("# actual-issued-native-close-completion-v6 ")
    namespace = footer("# pinned-issued-native-current-close-v6-namespace ")
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
    for name, expected in (("profileVersion", 6), ("inputsVerifiedBeforeCase", len(rows)), ("applicationFiles", APP_FILES),
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
