"""Full P4 V3 role profiles: exact-source DATA and read-only construction.

No native application import, SDK, SQL, signer, nonce, socket, process launch,
task-store creation, write or cleanup. Source files are read in place once and
shared by all role plans. Private profiles stay in memory. Root/child-profile
DATA is never native authority; the future approved manager must own fresh
roots and bind actual receipts. This is NOT that managed native launcher.
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

INVENTORY = "qualification/capacity-native-full-graph-v3.inputs.json"
INVENTORY_SHA = "73624c02d9bc39a7186ae994434ced83311ed718a6499997b3ee5cc4fdcda10a"
BASELINE = "qualification/issued-funding-post-native-vertical.inputs-v3.json"
BASELINE_SHA = "51ffb5b0ff0052523c1b7f3d75fa24e9be27e60ca3bcc09236b1f439096aaed1"
HELPERS = "qualification/recovery_crash_native_profile.py"
HELPERS_SHA = "75c2c9478b7e792a7bade739161af2bb8fb624cd407924ead2cf822dc23dacbd"
SOURCE_SEAL = "c517355f0eaa2b21eea7289b91f40d3464adb5966f60ff085dbc0b0a96d8a92c"
SOURCE_BYTES = 4759641
NODE_SHA = "dbedff294bab84a0a86c04e15fbcbeb1c97ca10bef1b32b0634cd24b36f62100"
NODE_BYTES = 121304480
SPECS = {
  "PAYER": {
    "kind": "NATIVE_CAPACITY_PAYER_LANE_NODE24_V3",
    "entry": "app/qualification/capacity-native-payer-lane-v3.worker.draft.mjs",
    "preloader": "app/qualification/capacity-native-payer-lane-v3.namespace.preload.draft.mjs",
    "namespace": "getPinnedNativeCapacityPayerLaneNamespaceSnapshotV3",
    "pathEnv": "X402_NATIVE_CAPACITY_PROFILE_PATH",
    "shaEnv": "X402_NATIVE_CAPACITY_PROFILE_SHA256"
  },
  "SERVICE": {
    "kind": "NATIVE_CAPACITY_SERVICE_LANE_NODE24_V3",
    "entry": "app/qualification/capacity-native-service-lane-v3.worker.draft.mjs",
    "preloader": "app/qualification/capacity-native-service-lane-v3.namespace.preload.draft.mjs",
    "namespace": "getPinnedNativeCapacityServiceLaneNamespaceSnapshotV3",
    "pathEnv": "X402_NATIVE_CAPACITY_SERVICE_PROFILE_PATH",
    "shaEnv": "X402_NATIVE_CAPACITY_SERVICE_PROFILE_SHA256"
  },
  "SUPERVISOR": {
    "kind": "NATIVE_CAPACITY_SUPERVISOR_NODE24_V3",
    "entry": "app/qualification/capacity-native-workload-v3.entry.draft.mjs",
    "preloader": "app/qualification/capacity-native-supervisor-v3.namespace.preload.draft.mjs",
    "namespace": "getPinnedNativeCapacitySupervisorNamespaceSnapshotV3",
    "pathEnv": "X402_NATIVE_CAPACITY_SUPERVISOR_PROFILE_PATH",
    "shaEnv": "X402_NATIVE_CAPACITY_SUPERVISOR_PROFILE_SHA256"
  }
}
ADDITIONS = [
  "app/qualification/capacity-native-full-namespace-v3.preload-common.draft.mjs",
  "app/qualification/capacity-native-paired-lane-v3.supervisor.draft.mjs",
  "app/qualification/capacity-native-payer-lane-v3.namespace.preload.draft.mjs",
  "app/qualification/capacity-native-payer-lane-v3.owner.draft.mjs",
  "app/qualification/capacity-native-payer-lane-v3.worker.draft.mjs",
  "app/qualification/capacity-native-payer-lane.protocol.js",
  "app/qualification/capacity-native-service-lane-v3.namespace.preload.draft.mjs",
  "app/qualification/capacity-native-service-lane-v3.owner.draft.mjs",
  "app/qualification/capacity-native-service-lane-v3.worker.draft.mjs",
  "app/qualification/capacity-native-service-window-v3.owner.draft.mjs",
  "app/qualification/capacity-native-supervisor-v3.namespace.preload.draft.mjs",
  "app/qualification/capacity-native-workload-adapter-v3.draft.mjs",
  "app/qualification/capacity-native-workload-v3.entry.draft.mjs",
  "app/qualification/issued-funding-post-native-vertical.inputs-v3.json",
  "app/src/native-private-directory-identity.js",
  "app/src/service-credit-capacity-cohort-writer-trace-data.js",
  "app/src/service-credit-capacity-native-observation-data.js",
  "app/src/service-credit-capacity-recorder.js",
  "app/src/service-credit-capacity-window-recorder.js",
  "app/src/service-credit-capacity-window-writer-trace-data.js",
  "app/src/service-credit-capacity-windowed-async-workload-owner-core.js"
]
MANIFEST_FIELDS = ["sourceSelectionVersion","kind","sourceParent","runtime","baselineManifest","baselineApplicationInputsPreserved","baselinePackageInputsPreserved","additionalApplicationInputs","roleSpecs","applicationFiles","packageFiles","sourceRowsSha256","declaredSourceBytes","rolePreloadersImplemented","completeManagedLauncherImplemented","nativeExecuted","sourceTransforms","nativeBuiltinAliases","ordinaryInstalledNamespaceQualified","nativeOsNetworkSandbox","authority"]


def require(value, code):
    if not value:
        raise ValueError(code)


def identity(s):
    return [str(v) for v in (s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode,
        s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns)]


def _no_links(path):
    require(path.is_absolute() and os.path.normpath(str(path)) == str(path), "ABSOLUTE_SOURCE_PATH")
    for at in (path, *path.parents):
        require(not at.is_symlink(), "SOURCE_LINK")


def read_owned(path, maximum=1048576, private=False):
    _no_links(path); before = path.lstat(); ident = identity(before)
    require(stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid() and before.st_nlink == 1
        and 0 <= before.st_size <= maximum and (not private or private_profile_mode(before.st_mode)), "SOURCE_FILE_IDENTITY")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as f:
        require(identity(os.fstat(f.fileno())) == ident, "SOURCE_OPEN_IDENTITY")
        raw = f.read(maximum + 1)
        require(len(raw) == before.st_size and identity(os.fstat(f.fileno())) == ident, "SOURCE_READ_IDENTITY")
    require(identity(path.lstat()) == ident, "SOURCE_AFTER_IDENTITY")
    return raw, ident


def private_profile_mode(mode):
    """DATA only: manager scratch 0600 or protected CAS 0400, never broader."""
    return type(mode) is int and stat.S_ISREG(mode) and stat.S_IMODE(mode) in (0o400, 0o600)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("ascii")


def load_helpers(repo):
    raw, ident = read_owned(repo / HELPERS, 65536)
    require(sha(raw) == HELPERS_SHA, "FROZEN_HELPER_PIN")
    spec = importlib.util.spec_from_file_location("p4_frozen_source_helpers", repo / HELPERS)
    require(spec is not None and spec.loader is not None, "SOURCE_HELPER_SPEC")
    value = importlib.util.module_from_spec(spec); sys.modules[spec.name] = value
    spec.loader.exec_module(value)
    require(read_owned(repo / HELPERS, 65536) == (raw, ident), "SOURCE_HELPER_CHANGED")
    return value


def capture_selection(base, inventory_raw, baseline_raw):
    require(type(inventory_raw) is bytes and sha(inventory_raw) == INVENTORY_SHA, "FULL_V3_INVENTORY_PIN")
    require(type(baseline_raw) is bytes and sha(baseline_raw) == BASELINE_SHA, "FULL_V3_BASELINE_PIN")
    inv, baseline = base.decode_json(inventory_raw, 65536), base.decode_json(baseline_raw, 262144)
    require(type(inv) is dict and set(inv) == set(MANIFEST_FIELDS), "FULL_V3_INVENTORY_FIELDS")
    require(type(inv["sourceSelectionVersion"]) is int and inv["sourceSelectionVersion"] == 3
        and inv["kind"] == "FULL_NATIVE_CAPACITY_V3_ALL_ROLES_SOURCE_NOT_EXECUTION"
        and inv["roleSpecs"] == SPECS and inv["baselineManifest"] == base.pin("app/" + BASELINE, baseline_raw), "FULL_V3_SELECTION")
    require(inv["runtime"] == dict(node="24.19.0", platform="darwin", arch="arm64", nodeSha256=NODE_SHA, nodeBytes=NODE_BYTES)
        and inv["authority"] == "NONE" and inv["rolePreloadersImplemented"] is True
        and inv["completeManagedLauncherImplemented"] is True
        and all(inv[k] is False for k in ("nativeExecuted", "sourceTransforms",
            "nativeBuiltinAliases", "ordinaryInstalledNamespaceQualified", "nativeOsNetworkSandbox")), "SOURCE_NOT_NATIVE_OR_PERMISSION")
    require(type(inv["sourceParent"]) is str and re.fullmatch(r"[0-9a-f]{40}", inv["sourceParent"]), "SOURCE_PARENT_PIN")
    for name, wanted in (("baselineApplicationInputsPreserved", 117), ("baselinePackageInputsPreserved", 404),
                         ("applicationFiles", 138), ("packageFiles", 404), ("declaredSourceBytes", SOURCE_BYTES)):
        require(type(inv[name]) is int and inv[name] == wanted, "FULL_V3_SOURCE_COUNTS")
    apps = base._rows(baseline["applicationInputs"], "app/", 117)
    packages = base._rows(baseline["packageInputs"], "packages/", 404)
    extra = base._rows(inv["additionalApplicationInputs"], "app/", 21)
    require(sorted(extra) == ADDITIONS and not set(extra).intersection(apps)
        and extra["app/" + BASELINE] == inv["baselineManifest"], "FULL_V3_NO_REPLACED_BASELINE")
    rows = sorted([*apps.values(), *packages.values(), *extra.values()], key=lambda r: r["path"])
    require(len(rows) == 542 and sum(r["bytes"] for r in rows) == SOURCE_BYTES <= 6291456
        and inv["sourceRowsSha256"] == sha(canonical(rows)) == SOURCE_SEAL, "FULL_V3_COMPLETE_SOURCE_SEAL")
    require(baseline["allowedBuiltins"] == base.BUILTINS and baseline["packageVersions"] == base.VERSIONS, "EXACT_BASELINE_DEPENDENCIES")
    entry = SPECS["PAYER"]["entry"]
    edges = baseline["bareBindings"] + [
        dict(parent=entry, specifier="@noble/ed25519", target="packages/@noble/ed25519/index.js"),
        dict(parent=entry, specifier="@noble/hashes/sha2", target="packages/@noble/hashes/esm/sha2.js"),
        dict(parent=entry, specifier="znn-typescript-sdk", target="packages/znn-typescript-sdk/dist/index.js"),
    ]
    require(len(edges) == len({(e["parent"], e["specifier"]) for e in edges}) == 11, "FULL_V3_BARE_EDGES")
    return dict(rows=rows, bareBindings=edges, authority="NONE", nativeExecuted=False)


def directory_data(base, value):
    """Exact five-field DATA, not proof of an actual fresh/owned directory."""
    data = base._plain(value)
    base._fields(data, ("path", "identity"), "ROOT_DATA_FIELDS")
    path = base._absolute(data["path"]); ident = data["identity"]
    require(type(ident) is list and len(ident) == 5
        and all(type(v) is str and re.fullmatch(r"(?:0|[1-9][0-9]{0,19})", v) for v in ident), "FIVE_ROOT_FIELDS")
    values = [int(v) for v in ident]
    require(all(0 <= n < 2 ** 64 for n in values) and values[1] > 0 and values[2] == os.getuid()
        and values[4] <= 0o177777 and stat.S_ISDIR(values[4]) and stat.S_IMODE(values[4]) == 0o700, "PRIVATE_ROOT_DATA")
    return dict(path=path, identity=ident)


def capture_directory(base, value, private=True):
    path = Path(base._absolute(value)); _no_links(path); s = path.lstat()
    require(stat.S_ISDIR(s.st_mode) and s.st_uid == os.getuid()
        and (not private or stat.S_IMODE(s.st_mode) == 0o700), "DIRECTORY_READ_IDENTITY")
    return dict(path=value, identity=[str(v) for v in (s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode)])


def node_pin(path):
    path = Path(path); _no_links(path); before = path.lstat(); ident = identity(before)
    require(stat.S_ISREG(before.st_mode) and before.st_uid in (0, os.getuid()) and before.st_nlink == 1
        and before.st_size == NODE_BYTES and stat.S_IMODE(before.st_mode) & 0o111 != 0, "PINNED_NODE_IDENTITY")
    digest = hashlib.sha256()
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        require(identity(os.fstat(stream.fileno())) == ident, "PINNED_NODE_OPEN")
        for part in iter(lambda: stream.read(1048576), b""):
            digest.update(part)
        require(identity(os.fstat(stream.fileno())) == ident, "PINNED_NODE_AFTER_HASH")
    require(identity(path.lstat()) == ident and digest.hexdigest() == NODE_SHA, "PINNED_NODE_BYTES")
    return dict(node="24.19.0", platform="darwin", arch="arm64", nodeSha256=NODE_SHA, nodeIdentity=ident)


def build_source_registry(base, repo, packages, node, inventory_raw, baseline_raw):
    selected = capture_selection(base, inventory_raw, baseline_raw)
    repo, packages = base._absolute(repo), base._absolute(packages)
    source_root = capture_directory(base, repo, False); package_root = capture_directory(base, packages, False)
    captures, versions, bindings = [], {}, []
    for row in selected["rows"]:
        logical = row["path"]; is_app = logical.startswith("app/")
        root, tail = (repo, logical[4:]) if is_app else (packages, logical[9:])
        raw, ident = read_owned(Path(root) / tail)
        require(base.pin(logical, raw) == row, "ACTUAL_FULL_V3_SOURCE_PIN")
        if logical in base.VERSIONS:
            versions[logical] = json.loads(raw.decode("utf8"), object_pairs_hook=base._pairs).get("version")
        captures.append(dict(logicalPath=logical, url=base.source_url(root, tail), bytes=row["bytes"],
            LF=row["LF"], sha256=row["sha256"], gitBlob=row["gitBlob"], identity=ident))
    require(versions == base.VERSIONS, "ACTUAL_FULL_V3_PACKAGE_VERSIONS")
    require(capture_directory(base, repo, False) == source_root and capture_directory(base, packages, False) == package_root,
        "SOURCE_DIRECTORY_REPLACED")
    for value in captures:
        path = Path(repo) / value["logicalPath"][4:] if value["logicalPath"].startswith("app/") else Path(packages) / value["logicalPath"][9:]
        require(identity(path.lstat()) == value["identity"], "SOURCE_REGISTRY_CHANGED_DURING_CAPTURE")
    inputs, indexed = base._captured_inputs(selected["rows"], captures, repo, packages)
    for edge in selected["bareBindings"]:
        bindings.append(dict(parentURL=indexed[edge["parent"]]["url"], specifier=edge["specifier"], targetURL=indexed[edge["target"]]["url"]))
    # Hash the existing executable ONCE for all role profiles; later guards pin
    # its full identity before startup/fork, not another 120 MB binary copy.
    runtime = node_pin(node)
    return dict(inputs=inputs, bareBindings=bindings, runtime=runtime, sourceRowsSha256=SOURCE_SEAL,
        applicationRoot=repo, packageRoot=packages, sourceIdentitiesRead=True, sourcesCopied=False, nativeExecuted=False, authority="NONE")


def validate_registry_data(base, registry, inventory_raw, baseline_raw):
    selected = capture_selection(base, inventory_raw, baseline_raw)
    r = base._plain(registry)
    base._fields(r, ("inputs", "bareBindings", "runtime", "sourceRowsSha256", "applicationRoot", "packageRoot",
        "sourceIdentitiesRead", "sourcesCopied", "nativeExecuted", "authority"), "SOURCE_REGISTRY_FIELDS")
    require(type(r["sourceIdentitiesRead"]) is bool and r["sourcesCopied"] is False and r["nativeExecuted"] is False
        and r["authority"] == "NONE" and r["sourceRowsSha256"] == SOURCE_SEAL, "SOURCE_REGISTRY_NOT_AUTHORITY")
    inputs, indexed = base._captured_inputs(selected["rows"], r["inputs"], r["applicationRoot"], r["packageRoot"])
    expected = [dict(parentURL=indexed[e["parent"]]["url"], specifier=e["specifier"], targetURL=indexed[e["target"]]["url"])
        for e in selected["bareBindings"]]
    require(r["bareBindings"] == expected, "FULL_V3_ONLY_EXACT_BARE_BINDINGS")
    runtime = r["runtime"]; base._fields(runtime, ("node", "platform", "arch", "nodeSha256", "nodeIdentity"), "RUNTIME_DATA_FIELDS")
    require(all(runtime[k] == v for k, v in dict(node="24.19.0", platform="darwin", arch="arm64", nodeSha256=NODE_SHA).items())
        and type(runtime["nodeIdentity"]) is list and len(runtime["nodeIdentity"]) == 9
        and all(type(v) is str and re.fullmatch(r"(?:0|[1-9][0-9]{0,19})", v) and int(v) < 2 ** 64 for v in runtime["nodeIdentity"])
        and runtime["nodeIdentity"][5] == "1" and runtime["nodeIdentity"][6] == str(NODE_BYTES)
        and int(runtime["nodeIdentity"][1]) > 0 and int(runtime["nodeIdentity"][2]) in (0, os.getuid())
        and stat.S_ISREG(int(runtime["nodeIdentity"][4])) and int(runtime["nodeIdentity"][4]) <= 0o177777
        and int(runtime["nodeIdentity"][4]) & 0o111 != 0, "PINNED_RUNTIME_DATA")
    return r, indexed


def plan_role_profile(base, registry, inventory_raw, baseline_raw, role, context, root, children):
    """Construct bounded private bytes from DATA; do not authenticate roots."""
    require(type(role) is str and role in SPECS, "CLOSED_NATIVE_ROLE")
    r, indexed = validate_registry_data(base, registry, inventory_raw, baseline_raw)
    context, root, children = base._plain(context), directory_data(base, root), base._plain(children)
    base._fields(context, ("runId", "laneId"), "ROLE_CONTEXT_FIELDS")
    require(type(context["runId"]) is str and re.fullmatch(r"[0-9a-f]{64}", context["runId"])
        and type(context["laneId"]) is str and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}", context["laneId"]), "ROLE_CONTEXT_VALUES")
    require(type(children) is list and (len(children) == 0 if role != "SUPERVISOR" else 2 <= len(children) <= 32 and len(children) % 2 == 0),
        "SUPERVISOR_OWNED_ROLE_COUNT")
    roots, physical, paths, digests, lanes = {root["path"]}, {tuple(root["identity"][:2])}, set(), set(), {}
    for child in children:
        base._fields(child, ("role", "laneId", "path", "sha256", "entryURL", "preloaderURL", "rootPath", "rootIdentity"), "CHILD_REFERENCE_FIELDS")
        require(child["role"] in ("PAYER", "SERVICE") and type(child["laneId"]) is str
            and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}", child["laneId"]), "CHILD_ROLE_CONTEXT")
        child_root = directory_data(base, dict(path=child["rootPath"], identity=child["rootIdentity"]))
        base._absolute(child["path"])
        require(type(child["sha256"]) is str and re.fullmatch(r"[0-9a-f]{64}", child["sha256"])
            and child["entryURL"] == indexed[SPECS[child["role"]]["entry"]]["url"]
            and child["preloaderURL"] == indexed[SPECS[child["role"]]["preloader"]]["url"]
            and child["path"] not in paths and child["sha256"] not in digests and child_root["path"] not in roots
            and tuple(child_root["identity"][:2]) not in physical, "CHILD_PATH_ROOT_OR_SOURCE_ALIAS")
        lane = lanes.setdefault(child["laneId"], set())
        require(child["role"] not in lane, "DUPLICATE_CHILD_ROLE")
        lane.add(child["role"]); roots.add(child_root["path"]); physical.add(tuple(child_root["identity"][:2]))
        paths.add(child["path"]); digests.add(child["sha256"])
    require(all(len(v) == 2 for v in lanes.values()), "COMPLETE_PAYER_SERVICE_PAIRS")
    allowed = sorted(base.BUILTINS + (["node:child_process"] if role == "SUPERVISOR" else []))
    spec = SPECS[role]
    value = dict(profileVersion=3, profileKind=spec["kind"], role=role, runtime=r["runtime"],
        entryURL=indexed[spec["entry"]]["url"], preloaderURL=indexed[spec["preloader"]]["url"],
        inputs=r["inputs"], bareBindings=r["bareBindings"], allowedBuiltins=allowed, sourceRowsSha256=SOURCE_SEAL,
        sourceTransform=False, ordinaryInstalledNamespace=False, baselineManifestSha256=BASELINE_SHA,
        runId=context["runId"], laneId=context["laneId"], rootPath=root["path"], rootIdentity=root["identity"], childProfiles=children)
    raw = canonical(value) + b"\n"; require(len(raw) <= 524288, "BOUNDED_PRIVATE_ROLE_PROFILE")
    return dict(profileBytes=raw, profileSha256=sha(raw), profileBytesCount=len(raw),
        sourceIdentitiesAuthenticated=False, rootIdentitiesAuthenticated=False, privateChildProfilesAuthenticated=False,
        privateProfileIsNativeAuthority=False, nativeExecuted=False, authority="NONE")


def validate_child_profile_data(base, raw, child, registry, inventory_raw, baseline_raw, run_id):
    """Exact complete child bytes from DATA, never root/source authentication."""
    child = base._plain(child)
    base._fields(child, ("role", "laneId", "path", "sha256", "entryURL", "preloaderURL", "rootPath", "rootIdentity"), "CHILD_REFERENCE_FIELDS")
    require(type(child["role"]) is str and child["role"] in ("PAYER", "SERVICE"), "CHILD_ROLE_CONTEXT")
    base._absolute(child["path"])
    expected = plan_role_profile(base, registry, inventory_raw, baseline_raw, child["role"],
        dict(runId=run_id, laneId=child["laneId"]), dict(path=child["rootPath"], identity=child["rootIdentity"]), [])
    value = base._private_json(expected["profileBytes"], 524288)
    require(type(raw) is bytes and 0 < len(raw) <= 524288 and raw == expected["profileBytes"]
        and child["sha256"] == expected["profileSha256"]
        and child["entryURL"] == value["entryURL"] and child["preloaderURL"] == value["preloaderURL"], "EXACT_COMPLETE_CHILD_PROFILE_DATA")
    return dict(completeChildBytesMatch=True, nativeExecuted=False, privateProfileIsNativeAuthority=False, authority="NONE")


def build_role_profile(base, registry, inventory_raw, baseline_raw, role, context, root_path, children):
    """Read local root/profile guards only; no writes/launches or task ownership proof."""
    root = capture_directory(base, root_path)
    planned = plan_role_profile(base, registry, inventory_raw, baseline_raw, role, context, root, children)
    for child in children:
        require(capture_directory(base, child["rootPath"])["identity"] == child["rootIdentity"], "ACTUAL_CHILD_ROOT_CHANGED")
        raw, _ = read_owned(Path(child["path"]), 524288, True)
        validate_child_profile_data(base, raw, child, registry, inventory_raw, baseline_raw, context["runId"])
    require(capture_directory(base, root_path) == root, "ACTUAL_ROLE_ROOT_REPLACED")
    planned["rootIdentitiesAuthenticated"] = True  # Local observations, NOT task ownership/native authority.
    planned["privateChildProfilesAuthenticated"] = True
    return planned


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("repo", "packages", "node", "inventory-sha256"):
        parser.add_argument("--" + name, required=True)
    parser.add_argument("--source-only", action="store_true")
    args = parser.parse_args()
    require(sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode, "ISOLATED_SOURCE_ONLY_REQUIRED")
    require(args.source_only is True, "EXPLICIT_SOURCE_ONLY_REQUIRED")
    require(args.inventory_sha256 == INVENTORY_SHA, "EXPLICIT_CURRENT_INVENTORY_PIN")
    repo = Path(args.repo); base = load_helpers(repo)
    inventory_raw = read_owned(repo / INVENTORY, 65536)[0]
    baseline_raw = read_owned(repo / BASELINE, 262144)[0]
    registry = build_source_registry(base, str(repo), args.packages, args.node, inventory_raw, baseline_raw)
    print(json.dumps(dict(event="P4_FULL_V3_SOURCE_REGISTRY_READ_ONLY_NOT_NATIVE", sourceRowsSha256=SOURCE_SEAL,
        applicationFilesRead=138, packageFilesRead=404, sourceBytesReadOnly=SOURCE_BYTES, sourceCopiesCreated=0,
        nodeBinaryBytesHashedOnce=NODE_BYTES, nodeBinaryExecuted=False, roleKinds=sorted(SPECS),
        newTaskRoots=0, qualificationScratchCreated=False, profilesWritten=False, privateRootsOpened=False,
        nativeExecuted=False, managedNativeLauncherSourceComplete=True, managedNativeLauncherNativeQualified=False, authority="NONE")), flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, TypeError) as problem:
        code = str(problem) if type(problem) is ValueError and re.fullmatch(r"[A-Z0-9_]+", str(problem)) else "REVIEW_SOURCE_INPUTS"
        print(json.dumps(dict(event="P4_FULL_V3_SOURCE_REFUSED", code=code, errorType=type(problem).__name__)), file=sys.stderr, flush=True)
        sys.exit(1)

