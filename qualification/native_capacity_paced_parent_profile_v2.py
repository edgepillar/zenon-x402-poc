"""Paced parent V2 private-profile producer: real frozen children, no native entry.

This module reads installed source bytes in place or accepts explicitly declared
registry DATA. It creates canonical private profile BYTES IN MEMORY only.
No private-role root is created/opened, no profile is written and no SDK/package is
imported. No manager, process launch, SQL, key, signature, nonce or socket runs.
Native effects need a separate reviewed managed controller and finite authority.
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

MANIFEST = "qualification/capacity-native-paced-parent-v3.inputs.json"
MANIFEST_SHA = "b7fd574d4959738215f61e3a96c7d2de62eeda833b1484696a6a299bcb6c966b"
LEGACY_BUILDER = "qualification/native_capacity_full_profile_v3.py"
LEGACY_BUILDER_SHA = "6928303c36f034fc295145563e40304641a91fe7db35d62eb364031bbcff7e6a"
HELPERS = "qualification/recovery_crash_native_profile.py"
HELPERS_SHA = "75c2c9478b7e792a7bade739161af2bb8fb624cd407924ead2cf822dc23dacbd"
PARENT_SEAL = "38bb4557357dd42bcd7dedacb4b7ec2fc750d474e7f9c14045376b73b0739160"
CHILD_SEAL = "d756740994aeb53ebeee47320d732583d96381dfa8c00e18a30f414e70a77027"
PARENT_KIND = "NATIVE_CAPACITY_PACED_SUPERVISOR_NODE24_V2"
PARENT_ENTRY = "app/qualification/capacity-native-paced-workload-v2.entry.draft.mjs"
PARENT_PRELOAD = "app/qualification/capacity-native-paced-supervisor-v2.namespace.preload.draft.mjs"
EXTRAS = (
    "app/qualification/capacity-native-paced-paired-lane-v2.supervisor.draft.mjs",
    PARENT_PRELOAD,
    "app/qualification/capacity-native-paced-workload-adapter-v2.draft.mjs",
    PARENT_ENTRY,
    "app/src/service-credit-capacity-balance-barrier-trace-data.js",
    "app/src/service-credit-capacity-paced-timing-trace-data.js",
    "app/src/service-credit-capacity-paced-workload-owner-core.js",
)
MAX_PROFILE = 524288
HASH = re.compile(r"[0-9a-f]{64}")
LANE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}")


def require(value, code):
    if not value:
        raise ValueError(code)


def identity(s):
    return [str(v) for v in (s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode,
        s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns)]


def read_owned(path, maximum=262144):
    """Bootstrap read; no symlink ancestor, hardlink or changed identity."""
    require(isinstance(path, Path) and path.is_absolute()
        and os.path.normpath(str(path)) == str(path), "SOURCE_ABSOLUTE_PATH")
    for at in (path, *path.parents):
        require(not stat.S_ISLNK(at.lstat().st_mode), "SOURCE_LINK")
    before = path.lstat(); ident = identity(before)
    require(stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid()
        and before.st_nlink == 1 and 0 <= before.st_size <= maximum, "SOURCE_FILE_IDENTITY")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        require(identity(os.fstat(stream.fileno())) == ident, "SOURCE_OPEN_IDENTITY")
        raw = stream.read(maximum + 1)
        require(len(raw) == before.st_size and identity(os.fstat(stream.fileno())) == ident, "SOURCE_READ_IDENTITY")
    require(identity(path.lstat()) == ident, "SOURCE_AFTER_IDENTITY")
    return raw, ident


def load_dependencies(repo):
    """Execute exact pinned Python source, never a cached or rewritten variant."""
    require(sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode, "ISOLATED_SOURCE_ONLY_REQUIRED")
    repo = Path(repo); modules = []
    for name, relative, digest in (
            ("paced2_frozen_profile_base", HELPERS, HELPERS_SHA),
            ("paced2_frozen_profile_r4", LEGACY_BUILDER, LEGACY_BUILDER_SHA)):
        path = repo / relative; raw, ident = read_owned(path, 65536)
        require(hashlib.sha256(raw).hexdigest() == digest, "FROZEN_PYTHON_SOURCE_PIN")
        spec = importlib.util.spec_from_file_location(name, path)
        require(spec is not None and spec.loader is not None, "FROZEN_PYTHON_SOURCE_SPEC")
        module = importlib.util.module_from_spec(spec); sys.modules[name] = module
        # Compile the captured UNMODIFIED bytes. Do not reread source or accept
        # an existing .pyc between digest verification and module execution.
        exec(spec.loader.source_to_code(raw, str(path)), module.__dict__)
        require(read_owned(path, 65536) == (raw, ident), "FROZEN_PYTHON_SOURCE_CHANGED")
        modules.append(module)
    return tuple(modules)


def capture_selection(base, legacy, manifest_raw, inventory_raw, baseline_raw):
    require(type(manifest_raw) is bytes and hashlib.sha256(manifest_raw).hexdigest() == MANIFEST_SHA,
        "PACED_SELECTION_PIN")
    manifest = base.decode_json(manifest_raw, 65536)
    old = legacy.capture_selection(base, inventory_raw, baseline_raw)
    require(manifest["sourceSelectionVersion"] == 3 and manifest["authority"] == "NONE"
        and manifest["parentSourceRowsSha256"] == PARENT_SEAL
        and manifest["childSourceRowsSha256"] == legacy.SOURCE_SEAL == CHILD_SEAL
        and manifest["legacyInventory"] == base.pin(legacy.INVENTORY, inventory_raw)
        and manifest["legacyBaseline"] == base.pin(legacy.BASELINE, baseline_raw), "PACED_EXACT_FROZEN_SELECTION")
    require(manifest["parentApplicationFiles"] == 146 and manifest["parentPackageFiles"] == 404
        and manifest["childApplicationFiles"] == 139 and manifest["childPackageFiles"] == 404
        and manifest["nativeExecuted"] is False and manifest["nativeAdmissionExecuted"] is False,
        "PACED_SOURCE_NOT_NATIVE")
    extras = base._rows(manifest["parentAdditionalInputs"], "app/", 7)
    require(tuple(extras) == EXTRAS and not set(extras).intersection(row["path"] for row in old["rows"]),
        "SEVEN_PARENT_ADDITIONS_ONLY")
    rows = sorted(old["rows"] + list(extras.values()), key=lambda row: row["path"])
    require(len(rows) == 550 and sum(row["bytes"] for row in rows) == manifest["parentDeclaredSourceBytes"] == 4907208
        and hashlib.sha256(legacy.canonical(rows)).hexdigest() == PARENT_SEAL, "PACED_COMPLETE_PARENT_SEAL")
    require(manifest["parentRole"]["profileKind"] == PARENT_KIND
        and manifest["parentRole"]["entry"] == PARENT_ENTRY
        and manifest["parentRole"]["preloader"] == PARENT_PRELOAD
        and manifest["parentRole"]["profileVersion"] == 2, "PACED_PARENT_ROLE")
    return dict(rows=rows, legacyRows=old["rows"], extraRows=list(extras.values()))


def context_data(base, value):
    value = base._plain(value)
    base._fields(value, ("runId", "laneId"), "PROFILE_CONTEXT_FIELDS")
    require(type(value["runId"]) is str and HASH.fullmatch(value["runId"])
        and type(value["laneId"]) is str and LANE.fullmatch(value["laneId"]), "PROFILE_CONTEXT_VALUES")
    return value


class _Planner:
    """Owned detached source DTOs; shared rows, not repeated filesystem reads."""
    __slots__ = ("__base", "__legacy", "__child", "__parent", "__index",
        "__runtime", "__bindings", "__source_read")

    def __init__(self, *args, **kwargs):
        # The factory validates/detaches the full registry before construction.
        raise ValueError("USE_EXPLICIT_PREPARATION_FACTORY")

    @classmethod
    def _create(cls, base, legacy, registry, selection, extras, inventory_raw, baseline_raw, source_read):
        self = object.__new__(cls)
        r, indexed = legacy.validate_registry_data(base, registry, inventory_raw, baseline_raw)
        added, _ = base._captured_inputs(selection["extraRows"], extras,
            base._absolute(r["applicationRoot"]), base._absolute(r["packageRoot"]))
        self.__base, self.__legacy = base, legacy
        self.__child = [indexed[row["path"]] for row in selection["legacyRows"]]
        self.__parent = sorted(self.__child + added, key=lambda row: row["logicalPath"])
        self.__index = {row["logicalPath"]: row for row in self.__parent}
        self.__runtime, self.__bindings = r["runtime"], r["bareBindings"]
        self.__source_read = source_read
        return self

    def info(self):
        return dict(parentApplicationFiles=146, parentPackageFiles=404, childApplicationFiles=139, childPackageFiles=404,
            parentSourceRowsSha256=PARENT_SEAL, childSourceRowsSha256=CHILD_SEAL,
            sourceFilesReadOnlyVerified=self.__source_read, sourceFilesRead=550 if self.__source_read else 0,
            nodeBinaryHashesForContext=1 if self.__source_read else 0,
            sourceOrPackageTreeCopies=0, privateRootsOpened=False, profilesWritten=False,
            nativeExecuted=False, privateProfileIsNativeAuthority=False, authority="NONE")

    def _value(self, role, context, root, children):
        base, legacy = self.__base, self.__legacy
        parent = role == "SUPERVISOR"; context = context_data(base, context)
        root = legacy.directory_data(base, root)
        spec = dict(kind=PARENT_KIND, entry=PARENT_ENTRY, preloader=PARENT_PRELOAD) if parent else legacy.SPECS[role]
        value = dict(profileVersion=2 if parent else 3, profileKind=spec["kind"], role=role,
            runtime=self.__runtime, entryURL=self.__index[spec["entry"]]["url"],
            preloaderURL=self.__index[spec["preloader"]]["url"],
            inputs=self.__parent if parent else self.__child, bareBindings=self.__bindings,
            allowedBuiltins=sorted(base.BUILTINS + (["node:child_process"] if parent else [])),
            sourceRowsSha256=PARENT_SEAL if parent else CHILD_SEAL,
            sourceTransform=False, ordinaryInstalledNamespace=False, baselineManifestSha256=legacy.BASELINE_SHA,
            runId=context["runId"], laneId=context["laneId"], rootPath=root["path"], rootIdentity=root["identity"],
            childProfiles=children)
        if parent:
            value["childSourceRowsSha256"] = CHILD_SEAL
        return value

    def _result(self, value):
        raw = self.__legacy.canonical(value) + b"\n"
        require(0 < len(raw) <= MAX_PROFILE, "BOUNDED_PRIVATE_PROFILE")
        return dict(profileBytes=raw, profileSha256=hashlib.sha256(raw).hexdigest(), profileBytesCount=len(raw),
            sourceIdentitiesAuthenticated=False, rootIdentitiesAuthenticated=False, privateChildProfilesAuthenticated=False,
            privateProfileIsNativeAuthority=False, nativeExecuted=False, authority="NONE")

    def plan_child(self, role, context, root):
        require(type(role) is str and role in ("PAYER", "SERVICE"), "CLOSED_CHILD_ROLE")
        return self._result(self._value(role, context, root, []))

    def plan_parent(self, context, root, children):
        """Compare complete canonical child bytes, not only caller digests."""
        base, legacy = self.__base, self.__legacy
        context = context_data(base, context); root = legacy.directory_data(base, root)
        require(type(children) is list and 2 <= len(children) <= 32 and len(children) % 2 == 0, "COMPLETE_CHILD_PAIRS")
        roots, physical, paths, digests, lanes, references = {root["path"]}, {tuple(root["identity"][:2])}, set(), set(), {}, []
        for bundle in children:
            base._fields(bundle, ("reference", "profileBytes"), "CHILD_BUNDLE_FIELDS")
            child = base._plain(bundle["reference"])
            base._fields(child, ("role", "laneId", "path", "sha256", "entryURL", "preloaderURL", "rootPath", "rootIdentity"),
                "CHILD_REFERENCE_FIELDS")
            require(type(child["role"]) is str and child["role"] in ("PAYER", "SERVICE")
                and type(child["laneId"]) is str and LANE.fullmatch(child["laneId"]), "CHILD_ROLE_CONTEXT")
            path = base._absolute(child["path"])
            child_root = legacy.directory_data(base, dict(path=child["rootPath"], identity=child["rootIdentity"]))
            require(type(child["sha256"]) is str and HASH.fullmatch(child["sha256"])
                and path not in paths and path not in roots and child_root["path"] not in roots and child_root["path"] not in paths
                and child["sha256"] not in digests and tuple(child_root["identity"][:2]) not in physical, "CHILD_ALIAS_OR_DIGEST")
            spec = legacy.SPECS[child["role"]]
            require(child["entryURL"] == self.__index[spec["entry"]]["url"]
                and child["preloaderURL"] == self.__index[spec["preloader"]]["url"], "CHILD_FROZEN_ROLE_URLS")
            roles = lanes.setdefault(child["laneId"], set())
            require(child["role"] not in roles, "DUPLICATE_CHILD_ROLE")
            raw = bundle["profileBytes"]
            require(type(raw) is bytes and 0 < len(raw) <= MAX_PROFILE
                and hashlib.sha256(raw).hexdigest() == child["sha256"], "CHILD_PRIVATE_BYTES_DIGEST")
            expected = self.plan_child(child["role"], dict(runId=context["runId"], laneId=child["laneId"]), child_root)
            require(raw == expected["profileBytes"], "EXACT_COMPLETE_R4_CHILD_BYTES")
            roles.add(child["role"]); paths.add(path); roots.add(child_root["path"])
            physical.add(tuple(child_root["identity"][:2])); digests.add(child["sha256"]); references.append(child)
        require(all(len(roles) == 2 for roles in lanes.values()), "COMPLETE_PAYER_SERVICE_LANES")
        return self._result(self._value("SUPERVISOR", context, root, references))


def prepare_from_registry_data(base, legacy, registry, extra_captures, manifest_raw, inventory_raw, baseline_raw):
    """Trusted pinned Python helpers plus declared DTOs; no file observations."""
    selection = capture_selection(base, legacy, manifest_raw, inventory_raw, baseline_raw)
    return _Planner._create(base, legacy, registry, selection, extra_captures, inventory_raw, baseline_raw, False)


def build_source_context(repo, packages, node):
    """Capture all 550 source rows in one pass; hash the existing Node once.

    Fixed selection manifests are read before the registry pass. The baseline
    manifest is also one declared application source and is read again there;
    the source-context DATA entry records that metadata preread separately.
    """
    repo = Path(repo); base, legacy = load_dependencies(repo)
    manifest_raw = read_owned(repo / MANIFEST, 65536)[0]
    inventory_raw = read_owned(repo / legacy.INVENTORY, 65536)[0]
    baseline_raw = read_owned(repo / legacy.BASELINE, 262144)[0]
    selection = capture_selection(base, legacy, manifest_raw, inventory_raw, baseline_raw)
    app_before = legacy.capture_directory(base, str(repo), False)
    packages_before = legacy.capture_directory(base, packages, False)
    registry = legacy.build_source_registry(base, str(repo), packages, node, inventory_raw, baseline_raw)
    extras = []
    for row in selection["extraRows"]:
        relative = row["path"][4:]; raw, ident = legacy.read_owned(repo / relative)
        require(base.pin(row["path"], raw) == row, "ACTUAL_PACED_SOURCE_PIN")
        extras.append(dict(logicalPath=row["path"], url=base.source_url(str(repo), relative),
            bytes=row["bytes"], LF=row["LF"], sha256=row["sha256"], gitBlob=row["gitBlob"], identity=ident))
    planner = _Planner._create(base, legacy, registry, selection, extras, inventory_raw, baseline_raw, True)
    # No second source hash pass or Node binary copy: recheck captured identities
    # after the one whole-source read and the seven extension captures.
    for row in registry["inputs"] + extras:
        root, tail = (repo, row["logicalPath"][4:]) if row["logicalPath"].startswith("app/") else (Path(packages), row["logicalPath"][9:])
        require(identity((root / tail).lstat()) == row["identity"], "SOURCE_CHANGED_AFTER_CONTEXT_CAPTURE")
    require(identity(Path(node).lstat()) == registry["runtime"]["nodeIdentity"], "NODE_CHANGED_AFTER_CONTEXT_CAPTURE")
    require(legacy.capture_directory(base, str(repo), False) == app_before
        and legacy.capture_directory(base, packages, False) == packages_before, "SOURCE_ROOT_REPLACED")
    return planner


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("repo", "packages", "node", "selection-sha256"):
        parser.add_argument("--" + name, required=True)
    parser.add_argument("--source-only", action="store_true")
    args = parser.parse_args()
    require(args.source_only is True and args.selection_sha256 == MANIFEST_SHA, "EXPLICIT_PINNED_SOURCE_ONLY_REQUIRED")
    planner = build_source_context(args.repo, args.packages, args.node)
    print(json.dumps(dict(event="PACED_PARENT_V2_SOURCE_CONTEXT_READ_ONLY_NOT_NATIVE", **planner.info()), sort_keys=True), flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, TypeError, SyntaxError) as problem:
        code = str(problem) if type(problem) is ValueError and re.fullmatch(r"[A-Z0-9_]+", str(problem)) else "REVIEW_SOURCE_INPUTS"
        print(json.dumps(dict(event="PACED_PARENT_V2_PROFILE_SOURCE_REFUSED", code=code,
            errorType=type(problem).__name__, nativeExecuted=False, authority="NONE")), file=sys.stderr, flush=True)
        sys.exit(1)
