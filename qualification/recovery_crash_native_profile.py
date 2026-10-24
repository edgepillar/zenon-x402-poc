"""Full issued-application P2 crash selection: DATA and read-only profile builder.

No application/package import, manager, subprocess, SQLite, signer, nonce,
socket, task root, write or deletion. A private profile is not native authority.
The immutable V3 graph and the published full child inventory are preserved.
Private URLs/identities are returned only to the trusted managed launcher.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
from urllib.parse import quote

KIND = "OFFICIAL_ISSUED_FULL_GRAPH_CRASH_PAIR_NODE24_V1"
INVENTORY = "qualification/recovery-crash-full-graph.source-inputs.json"
INVENTORY_SHA = "68cc83addfc65c0679d6289ae67b33602c29b470c8689e3169c069efdf3e7aaf"
BASELINE = "qualification/issued-funding-post-native-vertical.inputs-v3.json"
BASELINE_SHA = "51ffb5b0ff0052523c1b7f3d75fa24e9be27e60ca3bcc09236b1f439096aaed1"
SOURCE_SEAL = "5aff94f7427ba46bbf3cc8e8ddc4f896672909773e44ff0335a26dc52502e979"
SOURCE_BYTES = 4710510
ENTRY = "app/qualification/recovery-crash-committed-intent.child.draft.mjs"
PRELOAD = "app/qualification/recovery-crash-full-namespace.preload.draft.mjs"
SUPERVISOR = "app/qualification/recovery-crash-cutpoint-supervisor.draft.mjs"
PROTOCOL = "app/qualification/recovery-crash-cutpoint-protocol-v2.js"
DATA_TEST = "app/qualification/recovery-crash-cutpoint-protocol-v2.behavior.mjs"
PARENT_ENTRY = "app/qualification/recovery-crash-pair.entry.draft.mjs"
PARENT_KIND = "OFFICIAL_ISSUED_CRASH_PAIR_PARENT_CONTROL_V1"
PARENT_INPUTS = (
    PARENT_ENTRY, SUPERVISOR, PROTOCOL,
    "app/src/service-credit-pilot-original-payment-checkpoint.js", "app/package.json",
)
APP_FILES, PACKAGE_FILES = 130, 404
MAX_SOURCE_BYTES, MAX_PROFILE_BYTES = 6291456, 524288
PARENT_STDOUT_LIMIT = 524288
FIELDS = {"path", "bytes", "LF", "sha256", "gitBlob"}
INVENTORY_FIELDS = {
    "sourceSelectionVersion", "profileKind", "status", "runtime", "entry", "preload",
    "baselineManifest", "sourceRowsSha256", "baselineApplicationInputsPreserved",
    "baselinePackageInputsPreserved", "applicationInputs", "packageInputs", "controlInputs",
    "packageVersions", "allowedBuiltins", "bareBindings", "literalSourceInventory",
    "effectAuthority", "managedLauncherComplete", "nativeExecuted", "nativeCrashQualified",
    "ordinaryInstalledNamespaceQualified", "sourceTransform", "nativeBuiltinAlias", "osNetworkSandbox",
}
BUILTINS = sorted({
    "node:assert/strict", "node:async_hooks", "node:buffer", "node:crypto", "node:events",
    "node:fs", "node:fs/promises", "node:http", "node:https", "node:module", "node:net",
    "node:path", "node:perf_hooks", "node:sqlite", "node:stream", "node:test",
    "node:timers", "node:tls", "node:url", "node:util", "node:vm", "node:zlib",
})
VERSIONS = {
    "packages/@x402/core/package.json": "2.23.0", "packages/zod/package.json": "3.25.76",
    "packages/znn-typescript-sdk/package.json": "1.0.5",
    "packages/@noble/ed25519/package.json": "2.3.0", "packages/@noble/hashes/package.json": "1.8.0",
}
CONTROL_SHA = {
    SUPERVISOR: "9ee02372219c18a750a7dff2c3689f59ecd20922694e3c8e108ce1db84d09558",
    PROTOCOL: "5b599b1e1ee7b048baf1ace99a170bc5a633be7667b00c069103eed8f4e1fa39",
    DATA_TEST: "f4f0daeb731dbb8788dc1430e43ab0570a697ad226f9e858325a22b16e6315df",
}
HASH = re.compile(r"[0-9a-f]{64}")
PATH = re.compile(r"(?:app|packages)/[A-Za-z0-9@._/-]+")


def require(value, code="RECOVERY_CRASH_PROFILE_REJECTED"):
    if not value:
        raise ValueError(code)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("ascii")


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def pin(name, raw):
    require(type(raw) is bytes and len(raw) <= 1048576, "SOURCE_BYTES_BOUND")
    return dict(path=name, bytes=len(raw), LF=raw.count(b"\n"), sha256=sha(raw),
        gitBlob=hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest())


def _plain(value):
    """Detach bounded JSON DATA; never coerce subclasses or call caller hooks."""
    nodes = 0
    def visit(item, depth):
        nonlocal nodes
        nodes += 1
        require(nodes <= 20000 and depth <= 12, "JSON_DATA_BOUND")
        kind = type(item)
        if kind is dict:
            require(len(item) <= 64 and all(type(k) is str for k in item), "JSON_OBJECT_SHAPE")
            return {visit(k, depth + 1): visit(v, depth + 1) for k, v in item.items()}
        if kind is list:
            require(len(item) <= 660, "JSON_ARRAY_BOUND")
            return [visit(v, depth + 1) for v in item]
        if kind is str:
            require(len(item) <= 2048 and item.isascii() and "\0" not in item, "JSON_STRING_BOUND")
            return item
        if kind is int:
            require(-(2 ** 53 - 1) <= item <= 2 ** 53 - 1, "JSON_INTEGER_BOUND")
            return item
        require(item is None or kind is bool, "JSON_EXACT_TYPES")
        return item
    return visit(value, 0)


def _pairs(pairs):
    result = {}
    for name, value in pairs:
        require(name not in result, "DUPLICATE_JSON_FIELD")
        result[name] = value
    return result


def decode_json(raw, maximum=262144):
    require(type(raw) is bytes and 0 < len(raw) <= maximum, "JSON_BYTES_BOUND")
    def invalid(_value):
        raise ValueError("NON_INTEGER_OR_NONFINITE_JSON")
    try:
        return _plain(json.loads(raw.decode("ascii"), object_pairs_hook=_pairs,
            parse_float=invalid, parse_constant=invalid))
    except (UnicodeError, json.JSONDecodeError, RecursionError):
        raise ValueError("INVALID_ASCII_JSON") from None


def _rows(value, prefix, count):
    require(type(value) is list and len(value) == count, "FULL_SOURCE_COUNT")
    result = {}
    prior = ""
    for row in value:
        require(type(row) is dict and set(row) == FIELDS, "SOURCE_ROW_FIELDS")
        name = row["path"]
        require(type(name) is str and len(name) <= 512 and PATH.fullmatch(name) is not None
            and name.startswith(prefix) and name > prior
            and not any(p in ("", ".", "..") for p in name.split("/")), "SOURCE_LOGICAL_PATH")
        require(type(row["bytes"]) is int and 0 <= row["bytes"] <= 1048576
            and type(row["LF"]) is int and 0 <= row["LF"] <= row["bytes"]
            and type(row["sha256"]) is str and HASH.fullmatch(row["sha256"]) is not None
            and type(row["gitBlob"]) is str and re.fullmatch(r"[0-9a-f]{40}", row["gitBlob"]) is not None,
            "SOURCE_ROW_VALUES")
        prior = name
        result[name] = row
    return result


def validate_source_data(inventory, baseline):
    """Semantic DATA validation only; supplied dictionaries are not file proof."""
    inventory, baseline = _plain(inventory), _plain(baseline)
    require(type(inventory) is dict and set(inventory) == INVENTORY_FIELDS, "INVENTORY_FIELDS")
    require(type(baseline) is dict and baseline.get("kind") == "ACTUAL_ISSUED_NATIVE_VERTICAL_INPUTS_NOT_EXECUTION",
        "BASELINE_KIND")
    require(type(inventory["sourceSelectionVersion"]) is int and inventory["sourceSelectionVersion"] == 1
        and inventory["profileKind"] == KIND and inventory["status"] == "SOURCE_ONLY_NOT_NATIVE_QUALIFIED"
        and inventory["runtime"] == dict(node="24.19.0", platform="darwin", arch="arm64")
        and inventory["entry"] == ENTRY and inventory["preload"] == PRELOAD, "EXACT_SOURCE_SELECTION")
    require(inventory["effectAuthority"] == "NONE" and all(inventory[k] is False for k in (
        "managedLauncherComplete", "nativeExecuted", "nativeCrashQualified", "ordinaryInstalledNamespaceQualified",
        "sourceTransform", "nativeBuiltinAlias", "osNetworkSandbox")), "NO_EXECUTION_OR_SANDBOX_CLAIM")
    app = _rows(inventory["applicationInputs"], "app/", APP_FILES)
    packages = _rows(inventory["packageInputs"], "packages/", PACKAGE_FILES)
    require(type(inventory["controlInputs"]) is list and len(inventory["controlInputs"]) == 3
        and all(type(r) is dict and type(r.get("path")) is str for r in inventory["controlInputs"]), "CONTROL_ROWS")
    controls = _rows(sorted(inventory["controlInputs"], key=lambda r: r["path"]), "app/", 3)
    require(set(controls) == set(CONTROL_SHA)
        and all(controls[k]["sha256"] == v for k, v in CONTROL_SHA.items()), "EXACT_PROTOCOL_CONTROL_PINS")
    require(not set(controls).intersection(app), "NO_PARENT_IN_CHILD_NAMESPACE")
    base_app = _rows(baseline["applicationInputs"], "app/", 117)
    base_packages = _rows(baseline["packageInputs"], "packages/", PACKAGE_FILES)
    require(all(app.get(k) == v for k, v in base_app.items()), "ALL_117_BASELINE_APP_ROWS_REQUIRED")
    require(packages == base_packages, "ALL_404_BASELINE_PACKAGE_ROWS_REQUIRED")
    for name, wanted in (("baselineApplicationInputsPreserved", 117), ("baselinePackageInputsPreserved", 404)):
        require(type(inventory[name]) is int and inventory[name] == wanted, "BASELINE_PRESERVATION_COUNT")
    rows = sorted([*app.values(), *packages.values()], key=lambda r: r["path"])
    require(sum(r["bytes"] for r in rows) == SOURCE_BYTES <= MAX_SOURCE_BYTES
        and inventory["sourceRowsSha256"] == sha(canonical(rows)) == SOURCE_SEAL, "COMPLETE_SOURCE_SEAL")
    require(inventory["allowedBuiltins"] == baseline["allowedBuiltins"] == BUILTINS
        and inventory["packageVersions"] == baseline["packageVersions"] == VERSIONS, "BASELINE_NAMESPACE_REQUIRED")
    edges = baseline["bareBindings"] + [
        dict(parent=ENTRY, specifier="@noble/ed25519", target="packages/@noble/ed25519/index.js"),
        dict(parent=ENTRY, specifier="@noble/hashes/sha2", target="packages/@noble/hashes/esm/sha2.js"),
    ]
    require(len(edges) == 10 and inventory["bareBindings"] == edges, "ONLY_EXACT_BARE_EDGES")
    require(all(type(e) is dict and set(e) == {"parent", "specifier", "target"}
        and e["parent"] in {**app, **packages} and e["target"] in packages for e in edges), "BARE_EDGE_INPUT")
    base_pin = inventory["baselineManifest"]
    require(type(base_pin) is dict and set(base_pin) == FIELDS and base_pin["path"] == "app/" + BASELINE
        and base_pin["sha256"] == BASELINE_SHA and app.get(base_pin["path"]) == base_pin, "BASELINE_MANIFEST_INPUT")
    require(inventory["literalSourceInventory"] == dict(
        method="LITERAL_SOURCE_SUPERSET_NOT_RUNTIME_EXECUTION_PROOF",
        applicationJavaScriptFilesScanned=128, literalImportOccurrences=600, nonLiteralImportExpressions=0,
        unresolvedLiteralRelativeOrBareImports=0, unapprovedChildBuiltins=0,
        allBaselineApplicationRowsRequired=True, allBaselinePackageRowsRequired=True), "STATIC_SCAN_NOT_RUNTIME_PROOF")
    return dict(rows=rows, applicationInputs=list(app.values()), packageInputs=list(packages.values()),
        controlInputs=list(controls.values()), bareBindings=edges, sourceRowsSha256=SOURCE_SEAL,
        sourceBytes=SOURCE_BYTES, authority="NONE", effectsExecuted=False)


def capture_inventory(inventory_raw, baseline_raw):
    """Admit exactly the published bytes BEFORE any file/URL profile construction."""
    require(type(inventory_raw) is bytes and sha(inventory_raw) == INVENTORY_SHA, "PUBLISHED_INVENTORY_PIN")
    require(type(baseline_raw) is bytes and sha(baseline_raw) == BASELINE_SHA, "FROZEN_BASELINE_PIN")
    inventory, baseline = decode_json(inventory_raw), decode_json(baseline_raw)
    selected = validate_source_data(inventory, baseline)
    require(inventory["baselineManifest"] == pin("app/" + BASELINE, baseline_raw), "BASELINE_MANIFEST_BYTES")
    return selected


def _absolute(value):
    require(type(value) is str and 0 < len(value) <= 4096 and value.startswith("/")
        and value == os.path.normpath(value) and not value.startswith("//")
        and re.fullmatch(r"/[A-Za-z0-9@._ /-]+", value) is not None
        and not any(p in (".", "..") for p in value.split("/")), "EXACT_POSIX_SOURCE_ROOT")
    return value


def source_url(root, relative):
    _absolute(root)
    require(type(relative) is str and not relative.startswith("/")
        and not any(p in ("", ".", "..") for p in relative.split("/")), "SOURCE_RELATIVE_PATH")
    # Match Node pathToFileURL on the narrow admitted alphabet, including @.
    return "file://" + quote(root + "/" + relative, safe="/@")


def _captured_inputs(rows, captures, application_root, package_root):
    require(type(captures) is list and len(captures) == len(rows), "CAPTURED_INPUT_COUNT")
    captures = _plain(captures)
    by_name, urls, inputs = {}, set(), []
    for row, value in zip(rows, captures):
        require(type(value) is dict and set(value) == {"logicalPath", "url", "bytes", "LF", "sha256", "gitBlob", "identity"},
            "CAPTURED_INPUT_FIELDS")
        logical = row["path"]
        root, relative = (application_root, logical[4:]) if logical.startswith("app/") else (package_root, logical[9:])
        require(value["logicalPath"] == logical and value["url"] == source_url(root, relative)
            and all(type(value[k]) is type(row[k]) and value[k] == row[k] for k in ("bytes", "LF", "sha256", "gitBlob")),
            "CAPTURED_SOURCE_BINDING")
        ident = value["identity"]
        require(type(ident) is list and len(ident) == 9 and all(
            type(v) is str and re.fullmatch(r"[0-9]{1,24}", v) is not None for v in ident),
            "CAPTURED_PHYSICAL_IDENTITY")
        require(ident[5] == "1" and ident[6] == str(row["bytes"]) and stat.S_ISREG(int(ident[4])), "CAPTURED_FILE_KIND")
        require(value["url"] not in urls, "CAPTURED_URL_ALIAS")
        urls.add(value["url"]); inputs.append(value); by_name[logical] = value
    return inputs, by_name


def plan_private_profile(inventory_raw, baseline_raw, captures, application_root, package_root):
    """Captured identities are DATA here, not authenticated filesystem observations."""
    selected = capture_inventory(inventory_raw, baseline_raw)
    inputs, by_name = _captured_inputs(selected["rows"], captures, _absolute(application_root), _absolute(package_root))
    bindings = [dict(parentURL=by_name[e["parent"]]["url"], specifier=e["specifier"], targetURL=by_name[e["target"]]["url"])
        for e in selected["bareBindings"]]
    profile = dict(profileVersion=1, profileKind=KIND, runtime=dict(node="24.19.0", platform="darwin", arch="arm64"),
        entryURL=by_name[ENTRY]["url"], inputs=inputs, bareBindings=bindings, allowedBuiltins=BUILTINS,
        sourceRowsSha256=SOURCE_SEAL, sourceTransform=False, ordinaryInstalledNamespace=False,
        baselineManifestSha256=BASELINE_SHA)
    raw = canonical(profile) + b"\n"
    require(len(raw) <= MAX_PROFILE_BYTES, "PRIVATE_PROFILE_SIZE")
    return dict(profileBytes=raw, profileSha256=sha(raw), profileBytesCount=len(raw), sourceRowsSha256=SOURCE_SEAL,
        sourceBytes=SOURCE_BYTES, applicationFiles=APP_FILES, packageFiles=PACKAGE_FILES,
        capturedIdentitiesAuthenticated=False, existingSourcesRecopied=False, effectsExecuted=False, authority="NONE")


def identity(s):
    return [str(v) for v in (s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode,
        s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns)]


def _no_links(path):
    for candidate in (path, *path.parents):
        require(not stat.S_ISLNK(os.lstat(candidate).st_mode), "READ_SOURCE_LINK")


def _root(value):
    path = Path(_absolute(value)); _no_links(path)
    s = path.lstat()
    require(stat.S_ISDIR(s.st_mode) and s.st_uid == os.getuid(), "SOURCE_ROOT_IDENTITY")
    return path, identity(s)


def read_owned(path, maximum=1048576):
    require(type(path) is Path or isinstance(path, Path), "SOURCE_PATH_TYPE")
    _absolute(str(path)); _no_links(path); before = path.lstat(); ident = identity(before)
    require(stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid() and before.st_nlink == 1
        and 0 <= before.st_size <= maximum, "READ_SOURCE_IDENTITY")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        require(identity(os.fstat(stream.fileno())) == ident, "OPEN_SOURCE_IDENTITY")
        raw = stream.read(maximum + 1)
        require(len(raw) == before.st_size and identity(os.fstat(stream.fileno())) == ident, "READ_SOURCE_CHANGED")
    require(identity(path.lstat()) == ident, "SOURCE_PATH_REPLACED")
    return raw, ident


def build_profile(application_root, package_root, inventory_raw, baseline_raw):
    """Physically verify all existing files in place, without importing packages."""
    selected = capture_inventory(inventory_raw, baseline_raw)
    app, app_id = _root(application_root); packages, packages_id = _root(package_root)
    captures, versions = [], {}
    for row in selected["rows"]:
        name = row["path"]; path = app / name[4:] if name.startswith("app/") else packages / name[9:]
        raw, ident = read_owned(path)
        require(pin(name, raw) == row, "ACTUAL_SOURCE_OR_PACKAGE_PIN")
        if name in VERSIONS:
            versions[name] = json.loads(raw.decode("utf8"), object_pairs_hook=_pairs).get("version")
        captures.append(dict(logicalPath=name, url=source_url(application_root if name.startswith("app/") else package_root,
            name[4:] if name.startswith("app/") else name[9:]), bytes=row["bytes"], LF=row["LF"],
            sha256=row["sha256"], gitBlob=row["gitBlob"], identity=ident))
    require(versions == VERSIONS, "ACTUAL_PACKAGE_VERSIONS")
    for row in selected["controlInputs"]:
        raw, _ = read_owned(app / row["path"][4:])
        require(pin(row["path"], raw) == row, "ACTUAL_PROTOCOL_CONTROL_PIN")
    require(identity(app.lstat()) == app_id and identity(packages.lstat()) == packages_id, "SOURCE_ROOT_REPLACED")
    result = plan_private_profile(inventory_raw, baseline_raw, captures, application_root, package_root)
    result["capturedIdentitiesAuthenticated"] = True  # Local read guards only, not authority.
    return result


def effects():
    """Prospective finite scope only; does not authorize or execute any operation."""
    return dict(selectedCases=1, maximumRuns=1, opensslCommands=1, nodeParentCommands=1, nodeChildren=2,
        maximumChildSignalRequests=2, selectedSeedSigkillRequests=1, ownedCommandGroupsOnly=True,
        newSqlitePaths=5, auxiliaryReadonlySqliteOpens=8, independentPinFiles=2, syntheticEd25519Keys=4,
        transactionSignatures=1, capabilitySignatures=2, providerSignatures=2, testTlsMaterialSeparate=True,
        maxRpcConnections=174, maxApplicationConnections=8, maxTotalConnections=182,
        maxCandidatesPerSearch=4096, maxReferenceCandidates=32768, producerCandidateReservation=4096,
        fixedVerificationReservation=16384, maxAggregateCandidates=65536, maximumCutpointWaitMs=5000,
        childObserverMs=45000, parentCommandTimeoutSeconds=120, parentStdoutBytes=PARENT_STDOUT_LIMIT,
        childStdoutBytes=65536, childStderrBytes=8192, taskQuotaBytes=4194304,
        maximumSourceReadBytes=MAX_SOURCE_BYTES, existingSourcesRecopied=False, externalNetwork=False,
        install=False, realWallet=False, realPayment=False, sdkPrepareBlock=False, nativeOsNetworkSandbox=False)


def policy():
    return dict(min_free_bytes=10737418240, safety_margin_bytes=1073741824,
        task_quota_bytes=4194304, scratch_quota_bytes=4194304, store_quota_bytes=4194304,
        metadata_quota_bytes=4194304, max_tasks=1, max_objects=48, max_commands_per_task=2,
        max_output_bytes=PARENT_STDOUT_LIMIT, abandoned_after_seconds=86400, unreferenced_after_seconds=1209600)

def validate_parent_controls(rows, selected):
    rows = _plain(rows)
    require(type(rows) is list and all(type(r) is dict and type(r.get("path")) is str for r in rows),
        "PARENT_CONTROL_ROWS")
    indexed = _rows(sorted(rows, key=lambda r: r["path"]), "app/", 5)
    require(set(indexed) == set(PARENT_INPUTS), "EXACT_PARENT_NAMESPACE")
    child = {r["path"]: r for r in selected["rows"]}
    for name in PARENT_INPUTS:
        if name != PARENT_ENTRY:
            wanted = next((r for r in selected["controlInputs"] if r["path"] == name), child.get(name))
            require(indexed[name] == wanted, "PARENT_CONTROL_SOURCE_BINDING")
    return list(indexed.values())


def plan_parent_profile(inventory_raw, baseline_raw, controls, captures, application_root):
    """Parent control DATA plan, not permission to import or spawn the pair."""
    selected = capture_inventory(inventory_raw, baseline_raw)
    rows = validate_parent_controls(controls, selected)
    inputs, by_name = _captured_inputs(rows, captures, _absolute(application_root), application_root)
    child = {r["path"]: r for r in selected["rows"]}
    profile = dict(profileVersion=1, profileKind=PARENT_KIND, entryURL=by_name[PARENT_ENTRY]["url"],
        inputs=inputs, sourceRowsSha256=SOURCE_SEAL, childEntrySha256=child[ENTRY]["sha256"],
        childPreloadSha256=child[PRELOAD]["sha256"])
    raw = canonical(profile) + b"\n"
    require(len(raw) <= 32768, "PARENT_PROFILE_SIZE")
    return dict(profileBytes=raw, profileSha256=sha(raw), profileBytesCount=len(raw),
        sourceRowsSha256=SOURCE_SEAL, capturedIdentitiesAuthenticated=False, effectsExecuted=False, authority="NONE")


def build_parent_profile(application_root, inventory_raw, baseline_raw, controls):
    selected = capture_inventory(inventory_raw, baseline_raw)
    rows = validate_parent_controls(controls, selected)
    app, app_id = _root(application_root)
    captures = []
    for row in rows:
        raw, ident = read_owned(app / row["path"][4:])
        require(pin(row["path"], raw) == row, "ACTUAL_PARENT_SOURCE_PIN")
        captures.append(dict(logicalPath=row["path"], url=source_url(application_root, row["path"][4:]),
            bytes=row["bytes"], LF=row["LF"], sha256=row["sha256"], gitBlob=row["gitBlob"], identity=ident))
    require(identity(app.lstat()) == app_id, "PARENT_SOURCE_ROOT_REPLACED")
    result = plan_parent_profile(inventory_raw, baseline_raw, controls, captures, application_root)
    result["capturedIdentitiesAuthenticated"] = True
    return result

def _fields(value, names, code):
    require(type(value) is dict and set(value) == set(names), code)


def _capture_blob(value, cap):
    import base64
    _fields(value, ("bytes", "sha256", "base64"), "PRIVATE_BLOB_FIELDS")
    size, digest, encoded = value["bytes"], value["sha256"], value["base64"]
    require(type(size) is int and 0 <= size <= cap and type(digest) is str and HASH.fullmatch(digest) is not None
        and type(encoded) is str and len(encoded) <= ((cap + 2) // 3) * 4 and encoded.isascii(), "PRIVATE_BLOB_BOUND")
    try:
        raw = base64.b64decode(encoded, validate=True)
    except ValueError:
        raise ValueError("PRIVATE_BLOB_BASE64") from None
    require(len(raw) == size and sha(raw) == digest and base64.b64encode(raw).decode("ascii") == encoded,
        "PRIVATE_BLOB_DIGEST")
    return raw


def _namespace(value, mode):
    names = ("profileKind", "profileVersion", "mode", "sourceRowsSha256", "applicationFiles", "packageFiles",
        "inputsVerifiedBeforeCase", "declaredSourceBytes", "baselineApplication117Preserved", "baselinePackages404Preserved",
        "resolveCalls", "bareImportOverrideHits", "declaredFilesResolved", "sourceTransforms", "nativeBuiltinAliases",
        "ordinaryInstalledNamespaceQualified", "nativeOsNetworkSandbox")
    _fields(value, names, "NAMESPACE_FIELDS")
    for name in ("profileVersion", "applicationFiles", "packageFiles", "inputsVerifiedBeforeCase", "declaredSourceBytes",
                 "resolveCalls", "bareImportOverrideHits", "declaredFilesResolved", "sourceTransforms", "nativeBuiltinAliases"):
        require(type(value[name]) is int, "NAMESPACE_INTEGER")
    require(value["profileKind"] == KIND and value["profileVersion"] == 1 and value["mode"] == mode
        and value["sourceRowsSha256"] == SOURCE_SEAL and value["applicationFiles"] == APP_FILES
        and value["packageFiles"] == PACKAGE_FILES and value["inputsVerifiedBeforeCase"] == APP_FILES + PACKAGE_FILES
        and value["declaredSourceBytes"] == SOURCE_BYTES and value["baselineApplication117Preserved"] is True
        and value["baselinePackages404Preserved"] is True and value["sourceTransforms"] == value["nativeBuiltinAliases"] == 0
        and value["ordinaryInstalledNamespaceQualified"] is False and value["nativeOsNetworkSandbox"] is False,
        "NAMESPACE_COMPLETE_SOURCE_BINDING")
    require(0 <= value["bareImportOverrideHits"] <= value["resolveCalls"] <= 8192
        and 0 <= value["declaredFilesResolved"] <= APP_FILES + PACKAGE_FILES, "NAMESPACE_COUNTER_BOUND")


def _effects(value, seed):
    fields = ("walletKeys", "transactionSignatures", "capabilityKeys", "capabilitySignatures", "providerKeys", "providerSignatures",
        "referenceCandidates", "producerCandidateReservation", "fixedVerificationReservation", "aggregateCandidateReservation",
        "independentPinFiles", "readonlySqliteOpens", "fundingPosts", "serviceExecutions", "foreignGrantRefusals",
        "sdkPrepareBlock", "realPayment")
    _fields(value, fields, "PAIR_EFFECT_FIELDS")
    require(all(type(value[k]) is int and value[k] >= 0 for k in fields[:-2])
        and value["sdkPrepareBlock"] is False and value["realPayment"] is False and value["readonlySqliteOpens"] == 4,
        "PAIR_EFFECT_TYPES")
    expected = dict(walletKeys=1, transactionSignatures=1, capabilityKeys=2, capabilitySignatures=2,
        providerKeys=1, providerSignatures=2, independentPinFiles=2, fundingPosts=1, serviceExecutions=1, foreignGrantRefusals=1)
    require(all(value[k] == (v if seed else 0) for k, v in expected.items()), "PAIR_EFFECT_COUNTS")
    if seed:
        require(1 <= value["referenceCandidates"] <= 32768 and value["producerCandidateReservation"] == 4096
            and value["fixedVerificationReservation"] == 16384
            and value["aggregateCandidateReservation"] == value["referenceCandidates"] + 4096 + 16384
            and value["aggregateCandidateReservation"] <= 65536, "PAIR_NONCE_SCOPE")
    else:
        require(all(value[k] == 0 for k in fields[6:10]), "NO_RECOVERY_NONCE")


def _private_json(raw, maximum):
    require(type(raw) is bytes and 0 < len(raw) <= maximum, "PRIVATE_JSON_BOUND")
    def invalid(_value):
        raise ValueError("PRIVATE_JSON_NUMBER")
    try:
        return json.loads(raw.decode("ascii"), object_pairs_hook=_pairs, parse_float=invalid, parse_constant=invalid)
    except (UnicodeError, json.JSONDecodeError, RecursionError):
        raise ValueError("PRIVATE_JSON_INVALID") from None


def validate_native_capture(stdout, stderr, receipt):
    """Strict DATA parser; a fabricated transcript/receipt is NOT native proof.

    Only a source-pinned managed command's actual complete receipt may be used
    as execution evidence. Return a sanitized summary, never original witnesses.
    Raw child bytes and independent originals remain in the ONE private stdout
    CAS object, without a second capture file/ZIP or fabricated EOF.
    """
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
        prefix = b"# pinned-recovery-crash-namespace-admitted "
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



