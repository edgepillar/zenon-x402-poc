"""Current V4 capacity role profiles: full current source, no native execution.

Eight explicit runtime overlays and six current additions remain part of the
complete selected application, not substituted historical bytes. Registry DATA
and physical source observations are separate. Private profiles stay in memory.
This module neither opens role roots nor writes files, installs packages,
launches processes, or imports SDK/SQL/native application modules.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import sys

MANIFEST = "qualification/capacity-native-current-roles-v4.inputs.json"
MANIFEST_SHA = "6a819a3e87e89927c05e292f8f0ee4332ac0a884199ab68d0f6cf286327a1662"
CURRENT = "qualification/issued-current-close-v4.inputs.json"
CURRENT_SHA = "8339b2a8e04e7e3c573b1c26d8162f1c821df91182738409693d188121a21893"
SOURCE_SEAL = "db33115ac37137f5b0212cb33d748154b498ec1b15ca106dfb757575da692a6e"
SOURCE_BYTES = 4995543
APP_FILES, PACKAGE_FILES, SOURCE_ROWS = 153, 404, 557
MAX_PROFILE, MAX_SHARED = 524288, 1048576
SPECS = json.loads("{\"PAYER\":{\"kind\":\"NATIVE_CAPACITY_CURRENT_PAYER_NODE24_V4\",\"entry\":\"app/qualification/capacity-native-current-payer-v4.worker.draft.mjs\",\"preloader\":\"app/qualification/capacity-native-current-payer-v4.namespace.preload.draft.mjs\",\"namespace\":\"getPinnedNativeCapacityCurrentPayerNamespaceSnapshotV4\",\"pathEnv\":\"X402_NATIVE_CAPACITY_PROFILE_PATH\",\"shaEnv\":\"X402_NATIVE_CAPACITY_PROFILE_SHA256\"},\"SERVICE\":{\"kind\":\"NATIVE_CAPACITY_CURRENT_SERVICE_NODE24_V4\",\"entry\":\"app/qualification/capacity-native-current-service-v4.worker.draft.mjs\",\"preloader\":\"app/qualification/capacity-native-current-service-v4.namespace.preload.draft.mjs\",\"namespace\":\"getPinnedNativeCapacityCurrentServiceNamespaceSnapshotV4\",\"pathEnv\":\"X402_NATIVE_CAPACITY_SERVICE_PROFILE_PATH\",\"shaEnv\":\"X402_NATIVE_CAPACITY_SERVICE_PROFILE_SHA256\"}}")
NATIVE_PATHS = tuple(["app/qualification/capacity-native-current-namespace-v4.preload-common.draft.mjs","app/qualification/capacity-native-current-payer-v4.namespace.preload.draft.mjs","app/qualification/capacity-native-current-payer-v4.owner.draft.mjs","app/qualification/capacity-native-current-payer-v4.worker.draft.mjs","app/qualification/capacity-native-current-service-v4.namespace.preload.draft.mjs","app/qualification/capacity-native-current-service-v4.owner.draft.mjs","app/qualification/capacity-native-current-service-v4.worker.draft.mjs"])
HASH = re.compile(r"[0-9a-f]{64}")
LANE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}")


def require(ok, code):
    if not ok:
        raise ValueError(code)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("ascii")


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def identity(s):
    return [str(v) for v in (s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode,
        s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns)]


def read_owned(path, maximum=1048576):
    require(isinstance(path, Path) and path.is_absolute()
        and os.path.normpath(str(path)) == str(path), "ABSOLUTE_SOURCE_PATH")
    for at in (path, *path.parents):
        require(not stat.S_ISLNK(at.lstat().st_mode), "SOURCE_LINK")
    s = path.lstat(); before = identity(s)
    require(stat.S_ISREG(s.st_mode) and s.st_uid == os.getuid() and s.st_nlink == 1
        and 0 <= s.st_size <= maximum, "SOURCE_FILE_IDENTITY")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        require(identity(os.fstat(stream.fileno())) == before, "SOURCE_OPEN_IDENTITY")
        raw = stream.read(maximum + 1)
        require(len(raw) == s.st_size and identity(os.fstat(stream.fileno())) == before, "SOURCE_READ_IDENTITY")
    require(identity(path.lstat()) == before, "SOURCE_PATH_IDENTITY")
    return raw, before


def load_dependencies(repo):
    """Only exact captured Python bytes; no .pyc or application import."""
    require(sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode, "ISOLATED_SOURCE_REQUIRED")
    repo = Path(repo); modules = []
    for name, relative, digest in (
        ("current_capacity_v4_base", "qualification/recovery_crash_native_profile.py", "75c2c9478b7e792a7bade739161af2bb8fb624cd407924ead2cf822dc23dacbd"),
        ("current_capacity_v4_selection", "qualification/issued_current_close_v4_profile.py", "b3a8edc522471b0d34f33857e6bd2aae9286b101ec7ea24b6a0f0275e6e447e7"),
        ("current_capacity_v4_legacy_metadata", "qualification/native_capacity_full_profile_v3.py", "6928303c36f034fc295145563e40304641a91fe7db35d62eb364031bbcff7e6a"),
    ):
        path = repo / relative; raw, before = read_owned(path, 65536)
        require(sha(raw) == digest, "EXACT_PYTHON_SOURCE_PIN")
        spec = importlib.util.spec_from_file_location(name, path)
        require(spec is not None and spec.loader is not None, "PYTHON_SOURCE_SPEC")
        module = importlib.util.module_from_spec(spec); sys.modules[name] = module
        exec(spec.loader.source_to_code(raw, str(path)), module.__dict__)
        require(read_owned(path, 65536) == (raw, before), "PYTHON_SOURCE_CHANGED")
        modules.append(module)
    return tuple(modules)


def capture_selection(base, current, legacy, manifest_raw, inventory_raw, baseline_raw, current_raw):
    require(type(manifest_raw) is bytes and sha(manifest_raw) == MANIFEST_SHA, "CURRENT_ROLE_MANIFEST_PIN")
    require(type(current_raw) is bytes and sha(current_raw) == CURRENT_SHA, "CURRENT_RUNTIME_DELTA_PIN")
    manifest = base.decode_json(manifest_raw, 65536)
    base._fields(manifest, ("version", "kind", "sourceParent", "runtime", "baseline", "currentSelection",
        "legacyCapacityInventory", "roleSpecs", "additionalNativeRoleInputs", "applicationFiles", "packageFiles",
        "sourceRows", "sourceRowsSha256", "declaredSourceBytes", "currentRuntimeReplacements",
        "currentApplicationAdditions", "currentMetadataIncludedAsSource", "historicalR4ChildrenAcceptCurrentSources",
        "historicalR4FilesModified", "sourceEvidence", "remaining", "authority"), "CURRENT_ROLE_MANIFEST_FIELDS")
    require(type(manifest["version"]) is int and manifest["version"] == 4
        and manifest["kind"] == "COMPLETE_CURRENT_CAPACITY_ROLES_153_404_SOURCE_NOT_NATIVE_EXECUTION"
        and manifest["sourceParent"] == "06a9e59d2c9391f0112c2b0c4a674d53e9786314"
        and manifest["roleSpecs"] == SPECS and manifest["authority"] == "NONE", "CURRENT_ROLE_SELECTION")
    old = legacy.capture_selection(base, inventory_raw, baseline_raw)
    delta = base.decode_json(current_raw, 65536)
    rows = current.expand_manifest(delta, base.decode_json(baseline_raw, 262144))
    require(manifest["baseline"] == base.pin(legacy.BASELINE, baseline_raw)
        and manifest["currentSelection"] == base.pin(CURRENT, current_raw)
        and manifest["legacyCapacityInventory"] == base.pin(legacy.INVENTORY, inventory_raw), "EXACT_SELECTION_INPUTS")
    full = {row["path"]: row for row in rows}
    for row in old["rows"]:
        if row["path"] not in full:
            full[row["path"]] = row
    # Exactly 22 capacity rows beyond the complete current 123/404 base.
    require(len(full) == 549, "COMPLETE_CURRENT_BASE_AND_CAPACITY_ROWS")
    native = base._rows(manifest["additionalNativeRoleInputs"], "app/", 7)
    require(tuple(native) == NATIVE_PATHS and not set(native).intersection(full), "EXACT_SEVEN_CURRENT_ROLES")
    full.update(native)
    metadata = base.pin("app/" + CURRENT, current_raw)
    require(metadata["path"] not in full, "CURRENT_METADATA_NOT_SHADOWED")
    full[metadata["path"]] = metadata
    selected = sorted(full.values(), key=lambda row: row["path"])
    require(len(selected) == SOURCE_ROWS and sum(row["path"].startswith("app/") for row in selected) == APP_FILES
        and sum(row["path"].startswith("packages/") for row in selected) == PACKAGE_FILES
        and sha(canonical(selected)) == SOURCE_SEAL == manifest["sourceRowsSha256"]
        and sum(row["bytes"] for row in selected) == SOURCE_BYTES == manifest["declaredSourceBytes"] <= 6291456,
        "COMPLETE_CURRENT_153_404_SEAL")
    require(manifest["applicationFiles"] == APP_FILES and manifest["packageFiles"] == PACKAGE_FILES
        and manifest["sourceRows"] == SOURCE_ROWS and manifest["currentRuntimeReplacements"] == 8
        and manifest["currentApplicationAdditions"] == 6 and manifest["currentMetadataIncludedAsSource"] is True
        and manifest["historicalR4ChildrenAcceptCurrentSources"] is False and manifest["historicalR4FilesModified"] is False,
        "NO_HISTORICAL_PROFILE_RELABEL")
    require(manifest["runtime"] == dict(node="24.19.0", platform="darwin", arch="arm64",
        nodeSha256=legacy.NODE_SHA, nodeBytes=legacy.NODE_BYTES)
        and manifest["sourceEvidence"]["nativeAppExecutions"] == 0
        and manifest["sourceEvidence"]["nativeAllowanceConsumed"] is False
        and all(value is False for value in manifest["remaining"].values()), "SOURCE_NOT_NATIVE_AUTHORITY")
    old_entry = legacy.SPECS["PAYER"]["entry"]
    new_entry = SPECS["PAYER"]["entry"]
    edges = delta["bareBindings"] + [
        dict(parent=entry, specifier=specifier, target=target)
        for entry in (old_entry, new_entry) for specifier, target in (
            ("@noble/ed25519", "packages/@noble/ed25519/index.js"),
            ("@noble/hashes/sha2", "packages/@noble/hashes/esm/sha2.js"),
            ("znn-typescript-sdk", "packages/znn-typescript-sdk/dist/index.js"))]
    require(len(edges) == len({(edge["parent"], edge["specifier"]) for edge in edges}) == 16
        and all(edge["parent"] in full and edge["target"] in full for edge in edges), "ALL_CURRENT_BARE_EDGES")
    return dict(rows=selected, bareBindings=edges, nativeRows=list(native.values()), authority="NONE")


def validate_registry_data(base, legacy, registry, selection):
    r = base._plain(registry)
    base._fields(r, ("inputs", "bareBindings", "runtime", "sourceRowsSha256", "applicationRoot", "packageRoot",
        "sourceIdentitiesRead", "sourcesCopied", "nativeExecuted", "authority"), "CURRENT_REGISTRY_FIELDS")
    require(type(r["sourceIdentitiesRead"]) is bool and r["sourcesCopied"] is False
        and r["nativeExecuted"] is False and r["authority"] == "NONE"
        and r["sourceRowsSha256"] == SOURCE_SEAL, "CURRENT_REGISTRY_NOT_AUTHORITY")
    app, packages = base._absolute(r["applicationRoot"]), base._absolute(r["packageRoot"])
    inputs, indexed = base._captured_inputs(selection["rows"], r["inputs"], app, packages)
    for row in inputs:
        ident = row["identity"]
        require(all(re.fullmatch(r"(?:0|[1-9][0-9]{0,19})", v) and int(v) < 2**64 for v in ident)
            and int(ident[1]) > 0 and int(ident[2]) == os.getuid()
            and int(ident[4]) <= 0o177777, "CURRENT_SOURCE_IDENTITY_DATA")
    expected = [dict(parentURL=indexed[edge["parent"]]["url"], specifier=edge["specifier"],
        targetURL=indexed[edge["target"]]["url"]) for edge in selection["bareBindings"]]
    require(r["bareBindings"] == expected, "CURRENT_BARE_BINDINGS")
    runtime = r["runtime"]
    base._fields(runtime, ("node", "platform", "arch", "nodeSha256", "nodeIdentity"), "CURRENT_RUNTIME_FIELDS")
    require(all(runtime[k] == v for k, v in dict(node="24.19.0", platform="darwin", arch="arm64",
        nodeSha256=legacy.NODE_SHA).items()) and type(runtime["nodeIdentity"]) is list
        and len(runtime["nodeIdentity"]) == 9, "CURRENT_RUNTIME_SELECTION")
    ident = runtime["nodeIdentity"]
    require(all(type(v) is str and re.fullmatch(r"(?:0|[1-9][0-9]{0,19})", v) and int(v) < 2**64 for v in ident)
        and int(ident[1]) > 0 and int(ident[2]) in (0, os.getuid())
        and ident[5] == "1" and ident[6] == str(legacy.NODE_BYTES)
        and stat.S_ISREG(int(ident[4])) and int(ident[4]) <= 0o177777 and int(ident[4]) & 0o111, "CURRENT_NODE_IDENTITY_DATA")
    return r, inputs, indexed


class _Planner:
    """One detached full source table; no whole-source copies per role."""
    __slots__ = ("_base", "_legacy", "_runtime", "_inputs", "_index", "_bindings", "_shared",
        "_shared_bytes", "_source_read", "_planned")

    def __init__(self):
        raise ValueError("USE_EXPLICIT_CURRENT_ROLE_FACTORY")

    @classmethod
    def _create(cls, base, legacy, registry, selection, observed=False):
        self = object.__new__(cls)
        r, inputs, indexed = validate_registry_data(base, legacy, registry, selection)
        self._base, self._legacy, self._runtime = base, legacy, r["runtime"]
        self._inputs, self._index, self._bindings = inputs, indexed, r["bareBindings"]
        self._source_read, self._planned = observed, 0
        self._shared = {name: canonical(value) for name, value in (
            ("inputs", inputs), ("runtime", self._runtime), ("bareBindings", self._bindings))}
        self._shared_bytes = sum(map(len, self._shared.values()))
        require(self._shared_bytes <= MAX_SHARED, "BOUNDED_CURRENT_SHARED_FIELDS")
        return self

    def info(self):
        return dict(applicationFiles=APP_FILES, packageFiles=PACKAGE_FILES, sourceRows=SOURCE_ROWS,
            sourceRowsSha256=SOURCE_SEAL, currentRuntimeReplacements=8, originalR4SourceAccepted=False,
            sourceFilesReadOnlyVerified=self._source_read, sourceFilesRead=SOURCE_ROWS if self._source_read else 0,
            nodeBinaryHashesForContext=1 if self._source_read else 0, sharedFieldSerializations=3,
            sharedCanonicalBytes=self._shared_bytes, sharedCanonicalByteLimit=MAX_SHARED,
            profilesPlanned=self._planned, sourceOrPackageTreeCopies=0, privateRootsOpened=False,
            profilesWritten=False, nativeExecuted=False, privateProfileIsNativeAuthority=False, authority="NONE")

    def plan_child(self, role, context, root):
        require(type(role) is str and role in SPECS, "CLOSED_CURRENT_LEAF_ROLE")
        base = self._base; context = base._plain(context)
        base._fields(context, ("runId", "laneId"), "CURRENT_CONTEXT_FIELDS")
        require(type(context["runId"]) is str and HASH.fullmatch(context["runId"])
            and type(context["laneId"]) is str and LANE.fullmatch(context["laneId"]), "CURRENT_CONTEXT_VALUES")
        root = self._legacy.directory_data(base, root)
        spec = SPECS[role]
        value = dict(profileVersion=4, profileKind=spec["kind"], role=role, runtime=self._runtime,
            entryURL=self._index[spec["entry"]]["url"], preloaderURL=self._index[spec["preloader"]]["url"],
            inputs=self._inputs, bareBindings=self._bindings, allowedBuiltins=list(base.BUILTINS),
            sourceRowsSha256=SOURCE_SEAL, sourceTransform=False, ordinaryInstalledNamespace=False,
            baselineManifestSha256=self._legacy.BASELINE_SHA, currentManifestSha256=CURRENT_SHA,
            runId=context["runId"], laneId=context["laneId"], rootPath=root["path"], rootIdentity=root["identity"],
            childProfiles=[])
        pieces = [b"{"]
        for index, field in enumerate(sorted(value)):
            if index:
                pieces.append(b",")
            pieces.extend((canonical(field), b":",
                self._shared[field] if field in self._shared else canonical(value[field])))
        pieces.append(b"}\n")
        require(sum(map(len, pieces)) <= MAX_PROFILE, "BOUNDED_CURRENT_ROLE_PROFILE")
        raw = b"".join(pieces); self._planned += 1
        return dict(profileBytes=raw, profileSha256=sha(raw), profileBytesCount=len(raw),
            sourceIdentitiesAuthenticated=False, rootIdentitiesAuthenticated=False,
            privateProfileIsNativeAuthority=False, nativeExecuted=False, authority="NONE")


def prepare_from_registry_data(base, current, legacy, registry, manifest_raw, inventory_raw, baseline_raw, current_raw):
    selection = capture_selection(base, current, legacy, manifest_raw, inventory_raw, baseline_raw, current_raw)
    return _Planner._create(base, legacy, registry, selection, False)


def build_source_context(repo, packages, node):
    """Explicit read-only installed source capture; hash the existing Node once."""
    repo = Path(repo); base, current, legacy = load_dependencies(repo)
    manifest_raw = read_owned(repo / MANIFEST, 65536)[0]
    inventory_raw = read_owned(repo / legacy.INVENTORY, 65536)[0]
    baseline_raw = read_owned(repo / legacy.BASELINE, 262144)[0]
    current_raw = read_owned(repo / CURRENT, 65536)[0]
    selection = capture_selection(base, current, legacy, manifest_raw, inventory_raw, baseline_raw, current_raw)
    app, package_root = base._absolute(str(repo)), base._absolute(packages)
    roots_before = (legacy.capture_directory(base, app, False), legacy.capture_directory(base, package_root, False))
    inputs = []
    for row in selection["rows"]:
        is_app = row["path"].startswith("app/")
        root, relative = (app, row["path"][4:]) if is_app else (package_root, row["path"][9:])
        raw, ident = read_owned(Path(root) / relative)
        require(base.pin(row["path"], raw) == row, "ACTUAL_CURRENT_SOURCE_PIN")
        if row["path"] in base.VERSIONS:
            package = json.loads(raw.decode("utf8"), object_pairs_hook=base._pairs)
            require(type(package) is dict and package.get("version") == base.VERSIONS[row["path"]], "ACTUAL_PINNED_PACKAGE_VERSION")
        inputs.append(dict(logicalPath=row["path"], url=base.source_url(root, relative),
            **{k: row[k] for k in ("bytes", "LF", "sha256", "gitBlob")}, identity=ident))
    indexed = {row["logicalPath"]: row for row in inputs}
    registry = dict(inputs=inputs, bareBindings=[dict(parentURL=indexed[edge["parent"]]["url"],
        specifier=edge["specifier"], targetURL=indexed[edge["target"]]["url"]) for edge in selection["bareBindings"]],
        runtime=legacy.node_pin(node), sourceRowsSha256=SOURCE_SEAL, applicationRoot=app, packageRoot=package_root,
        sourceIdentitiesRead=True, sourcesCopied=False, nativeExecuted=False, authority="NONE")
    for row in inputs:
        root, relative = (app, row["logicalPath"][4:]) if row["logicalPath"].startswith("app/") else (package_root, row["logicalPath"][9:])
        require(identity((Path(root) / relative).lstat()) == row["identity"], "CURRENT_SOURCE_CHANGED_AFTER_CAPTURE")
    require(identity(Path(node).lstat()) == registry["runtime"]["nodeIdentity"]
        and roots_before == (legacy.capture_directory(base, app, False), legacy.capture_directory(base, package_root, False)),
        "CURRENT_SOURCE_ROOT_OR_NODE_CHANGED")
    return _Planner._create(base, legacy, registry, selection, True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for field in ("repo", "packages", "node", "selection-sha256"):
        parser.add_argument("--" + field, required=True)
    parser.add_argument("--source-only", action="store_true")
    args = parser.parse_args()
    require(args.source_only is True and args.selection_sha256 == MANIFEST_SHA, "EXPLICIT_CURRENT_SOURCE_ONLY_REQUIRED")
    planner = build_source_context(args.repo, args.packages, args.node)
    print(json.dumps(dict(event="CURRENT_CAPACITY_V4_SOURCE_CONTEXT_NOT_NATIVE", **planner.info()), sort_keys=True), flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, TypeError, SyntaxError) as error:
        code = str(error) if type(error) is ValueError and re.fullmatch(r"[A-Z0-9_]+", str(error)) else "REVIEW_CURRENT_SOURCE_INPUTS"
        print(json.dumps(dict(event="CURRENT_CAPACITY_V4_SOURCE_REFUSED", code=code,
            nativeExecuted=False, authority="NONE"), sort_keys=True), file=sys.stderr, flush=True)
        sys.exit(1)
