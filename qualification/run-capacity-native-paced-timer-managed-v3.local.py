"""Timer-aware parent-V3 / outer-V4 managed native controller SOURCE draft.

Default mode admits source only. No native permission is granted by source,
manifest, flags or a DATA pass. Any pre-native/execute invocation needs a NEW
exact finite timer-parent scope; an old unpaced R4 allowance cannot apply.
Use only a NEW explicitly approved, already initialized private store. Never
initialize/adopt a root, rewrite a frozen helper, retry a command/payment or
clean historical data. Child-created files stay outside automatic adoption.
No SDK, manager, JavaScript, private root or Node binary is loaded in source-only.
"""
import argparse
import dataclasses
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import plistlib
import re
import stat
import subprocess
import sys
from urllib.parse import unquote, urlparse

SELF = "qualification/run-capacity-native-paced-timer-managed-v3.local.py"
MANIFEST = "qualification/capacity-native-paced-timer-managed-v3.launch-inputs.json"
SOURCE_DRIVER = "qualification/run-capacity-native-paced-timer-source-v3.local.py"
SOURCE_SELECTION = "qualification/capacity-native-paced-timer-source-v3.launch-inputs.json"
SOURCE_SELECTION_SHA = "01460ee967f5b7880f19d4ecd31f14b2c14f3d59e0841de41e5deea81281ee9e"
PLAN = "qualification/capacity-native-paced-workload-v1.plan.json"
PARENT = "qualification/capacity-native-paced-timer-parent-v3.inputs.json"
KIND = "ONE_PACED_TIMER_PARENT_V3_MANAGED_SOURCE_NOT_NATIVE_EXECUTION"
NATIVE_SELECTION = "one-new-approved-native-paced-timer-parent-v3"
FROZEN = (
    ("qualification/funding_tls_current_gate.py", "9777b8dca3c8c86e543c1f202c0cde248280ed3a108df4a688565ccf83132936"),
    ("qualification/native_capacity_paced_timer_managed_command_data_v3.py", "689dfacd2c94dadf880fe19f1365e15c878a6fc14f9d35b33ecff2e546ca40d5"),
    (SOURCE_DRIVER, "ac1631cfd356cceaa11df85702ef0583bf6e825bec818ec476508dcb072df9e5"),
    ("qualification/run-capacity-native-workload-v3.local.py", "4e2e29c31ae10c661bd5599506cda87482d030fc328dbde1e3e1066db5dba9e6"),
)
STORAGE_SHA = "a4d82a72214c9698fda7ae363c38b2470c08da5e2e04c63ee9284e43f638f081"
CLI_SHA = "0bf13cdc1f25a6b31ab14cfb124908808ca7ddc89073ecbcd0263bef4d52238c"
OPENSSL_SHA = "49db04c17e3a8c169ebc48a1149d78c165a86c04913203f46b2a14ce7f4a14fc"
HASH = re.compile(r"[0-9a-f]{64}")


def require(value, code):
    if not value:
        raise ValueError(code)


def identity(s):
    return [str(v) for v in (s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode, s.st_nlink,
        s.st_size, s.st_mtime_ns, s.st_ctime_ns)]


def no_links(path):
    require(path.is_absolute() and os.path.normpath(str(path)) == str(path), "ABSOLUTE_INPUT_PATH")
    for at in (path, *path.parents):
        require(not at.is_symlink(), "INPUT_LINK")


def read(path, maximum=262144):
    no_links(path); s = path.lstat()
    require(stat.S_ISREG(s.st_mode) and s.st_uid == os.getuid() and s.st_nlink == 1 and s.st_size <= maximum,
        "OWNED_INPUT_IDENTITY")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        require(identity(os.fstat(stream.fileno())) == identity(s), "INPUT_OPEN_IDENTITY")
        raw = stream.read(maximum + 1)
        require(len(raw) == s.st_size and identity(os.fstat(stream.fileno())) == identity(s), "INPUT_READ_IDENTITY")
    require(identity(path.lstat()) == identity(s), "INPUT_AFTER_IDENTITY")
    return raw, identity(s)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def pin(name, raw):
    return dict(path=name, bytes=len(raw), LF=raw.count(b"\n"), sha256=sha(raw),
        gitBlob=hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest())



def strict(raw):
    def pairs(items):
        out = {}
        for key, value in items:
            require(key not in out, "DUPLICATE_SOURCE_KEY"); out[key] = value
        return out
    def invalid(_):
        raise ValueError("NON_INTEGER_SOURCE_JSON")
    return json.loads(raw.decode("ascii"), object_pairs_hook=pairs, parse_constant=invalid, parse_float=invalid)


def metadata(raw):
    """Storage timestamps may be finite floats; never parse them as a plan."""
    def pairs(items):
        out = {}
        for key, value in items:
            require(key not in out, "DUPLICATE_METADATA_KEY"); out[key] = value
        return out
    def number(text):
        value = float(text)
        require(math.isfinite(value), "FINITE_METADATA_TIMESTAMP")
        return value
    def invalid(_):
        raise ValueError("NONFINITE_METADATA_VALUE")
    return json.loads(raw.decode("ascii"), object_pairs_hook=pairs, parse_float=number, parse_constant=invalid)


def same(left, right):
    """Bounded exact JSON DATA equality; bool is never an integer alias."""
    pending = [(left, right, 0)]; count = 0
    while pending:
        a, b, depth = pending.pop(); count += 1
        require(count <= 16384 and depth <= 16, "BOUNDED_DECLARATION_DATA")
        if type(a) is not type(b):
            return False
        if type(a) is dict:
            if set(a) != set(b) or not all(type(k) is str for k in a):
                return False
            pending.extend((a[k], b[k], depth + 1) for k in a)
        elif type(a) is list:
            if len(a) != len(b):
                return False
            pending.extend((v, w, depth + 1) for v, w in zip(a, b))
        elif a is None:
            continue
        elif type(a) not in (str, bool, int) or a != b:
            return False
    return True


def load_verified(path, raw, label):
    """Compile captured exact bytes, including manager dataclass registration."""
    spec = importlib.util.spec_from_file_location(label, path)
    require(spec is not None and spec.loader is not None, "EXACT_CONTROL_LOADER")
    value = importlib.util.module_from_spec(spec); sys.modules[label] = value
    exec(spec.loader.source_to_code(raw, str(path)), value.__dict__)
    require(read(path, max(262144, len(raw)))[0] == raw, "CONTROL_CHANGED_ON_LOAD")
    return value


def validate_launch_data(manifest, inputs):
    fields = {"kind", "version", "sourceParent", "pythonControls", "sourceSelection", "effectsCeiling",
        "storagePolicy", "parentSourceRowsSha256", "childSourceRowsSha256", "nativeSelection",
        "managedLauncherSourceAuthored", "managedLauncherNativeQualified", "nativeExecuted",
        "nativeAllowanceGranted", "nativeOsNetworkSandbox", "authority"}
    require(type(manifest) is dict and set(manifest) == fields, "EXACT_TIMER_MANAGED_SOURCE_FIELDS")
    require(type(manifest["version"]) is int and manifest["version"] == 3 and manifest["kind"] == KIND
        and type(manifest["sourceParent"]) is str and re.fullmatch(r"[0-9a-f]{40}", manifest["sourceParent"])
        and manifest["nativeSelection"] == NATIVE_SELECTION and manifest["managedLauncherSourceAuthored"] is True
        and all(manifest[k] is False for k in ("managedLauncherNativeQualified", "nativeExecuted",
            "nativeAllowanceGranted", "nativeOsNetworkSandbox")) and manifest["authority"] == "NONE",
        "NEW_TIMER_MANAGED_SOURCE_IS_NOT_AUTHORITY")
    names = sorted([SELF] + [name for name, _ in FROZEN])
    require(type(inputs) is dict and set(inputs) == set(names + [SOURCE_SELECTION])
        and type(manifest["pythonControls"]) is list and all(type(row) is dict for row in manifest["pythonControls"])
        and [row.get("path") for row in manifest["pythonControls"]] == names, "EXACT_TIMER_MANAGED_SOURCE_SET")
    for row in manifest["pythonControls"]:
        require(same(row, pin(row["path"], inputs[row["path"]])), "EXACT_TIMER_MANAGED_PYTHON_PIN")
    for name, digest in FROZEN:
        require(sha(inputs[name]) == digest, "FROZEN_TIMER_MANAGED_CONTROL")
    require(same(manifest["sourceSelection"], pin(SOURCE_SELECTION, inputs[SOURCE_SELECTION]))
        and sha(inputs[SOURCE_SELECTION]) == SOURCE_SELECTION_SHA, "UNCHANGED_TIMER_SOURCE_ADMISSION_SELECTION")


def source_admission(repo, digest):
    """Compose the genuine r165 source gate, not a rewritten profile graph."""
    require(sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode, "ISOLATED_NO_BYTECODE_REQUIRED")
    repo = Path(repo); no_links(repo)
    require(Path(__file__).absolute() == repo / SELF, "ACTUAL_TIMER_MANAGED_LAUNCHER_PATH")
    raw, ident = read(repo / MANIFEST, 65536)
    require(type(digest) is str and HASH.fullmatch(digest) and sha(raw) == digest, "EXACT_TIMER_MANAGED_MANIFEST_DIGEST")
    manifest = strict(raw)
    inputs = {name: read(repo / name) for name in [SELF] + [n for n, _ in FROZEN] + [SOURCE_SELECTION]}
    validate_launch_data(manifest, {n: pair[0] for n, pair in inputs.items()})
    gate = load_verified(repo / SOURCE_DRIVER, inputs[SOURCE_DRIVER][0], "timer_managed_actual_source_gate_v3")
    admitted = gate.source_admission(repo, SOURCE_SELECTION_SHA)
    source_unchanged = admitted["unchanged"]
    c = admitted["controls"]
    for label, relative in (
            ("common", "qualification/run-capacity-native-workload-v3.local.py"),
            ("tls", "qualification/funding_tls_current_gate.py"),
            ("command", "qualification/native_capacity_paced_timer_managed_command_data_v3.py")):
        c[label] = load_verified(repo / relative, inputs[relative][0], "timer_managed_v3_" + label)
    data_name = "qualification/native_capacity_managed_workload_v3.py"
    c["data"] = load_verified(repo / data_name, admitted["inputs"][data_name][0], "timer_managed_storage_receipt_data_v3")
    require(same(manifest["effectsCeiling"], admitted["effects"])
        and same(manifest["storagePolicy"], admitted["policy"])
        and manifest["parentSourceRowsSha256"] == c["producer"].PARENT_SEAL
        and manifest["childSourceRowsSha256"] == c["producer"].CHILD_SEAL, "COMPLETE_TIMER_MANAGED_EFFECT_POLICY_BINDING")
    def unchanged():
        source_unchanged()
        require(read(repo / MANIFEST, 65536) == (raw, ident), "TIMER_MANAGED_SELECTION_CHANGED")
        for name, pair in inputs.items():
            require(read(repo / name) == pair, "TIMER_MANAGED_CONTROL_CHANGED")
    admitted.update(sourceManifest=admitted["manifest"], manifest=manifest,
        managedInputs=inputs, unchanged=unchanged)
    unchanged()
    return admitted


def native_selection(args, effects):
    """Explicit finite tripwires only; NEVER a human-approval substitute."""
    require(args.native_selection == NATIVE_SELECTION and args.approval_launch_sha256 == args.manifest_sha256
        and args.approval_plan_sha256 == effects["workloadPlanSha256"]
        and type(args.manifest_sha256) is str and HASH.fullmatch(args.manifest_sha256),
        "NEW_EXACT_TIMER_FINITE_SCOPE_REQUIRED")


def native_intent(args, effects):
    require(args.execute is True and args.pre_native_plan is False, "ONE_NEW_TIMER_NATIVE_EXECUTE_MODE")
    native_selection(args, effects)


def validate_full_source_context(planner):
    """Declared-only profile fixtures must refuse before any native setup."""
    info = planner.info()
    require(type(info) is dict and info.get("sourceFilesReadOnlyVerified") is True
        and type(info.get("sourceFilesRead")) is int and info["sourceFilesRead"] == 551
        and type(info.get("nodeBinaryHashesForContext")) is int and info["nodeBinaryHashesForContext"] == 1
        and info.get("parentApplicationFiles") == 147 and info.get("parentPackageFiles") == 404
        and info.get("childApplicationFiles") == 139 and info.get("childPackageFiles") == 404
        and info.get("parentSourceRowsSha256") == "0e0533ba2e3bfdf97b2670a0ee693c64ddc04ea93bf52b4e779d9d073cb51c90"
        and info.get("childSourceRowsSha256") == "d756740994aeb53ebeee47320d732583d96381dfa8c00e18a30f414e70a77027"
        and info.get("privateProfileIsNativeAuthority") is False and info.get("nativeExecuted") is False
        and info.get("authority") == "NONE", "ACTUAL_551_SOURCE_CONTEXT_REQUIRED_BEFORE_NATIVE_SETUP")
    return info


def capacity_data(available, reserved, effects, roots):
    """Conservative DATA predicate, never a measurement or admission by itself."""
    require(type(available) is int and type(reserved) is int and type(roots) is int
        and 0 <= available <= 2**53 - 1 and 0 <= reserved <= 2**53 - 1 and 1 <= roots <= 256, "BOUNDED_CAPACITY_DATA")
    require(type(effects) is dict and type(effects.get("taskQuotaBytes")) is int and 0 < effects["taskQuotaBytes"] <= 2**53 - 1
        and type(effects.get("minimumFreeBytes")) is int and effects["minimumFreeBytes"] == 10 * 1024**3
        and type(effects.get("safetyMarginBytes")) is int and effects["safetyMarginBytes"] == 1024**3,
        "UNCHANGED_PRODUCTION_FLOOR")
    require(type(effects.get("metadataStoreQuotaBytesReserved")) is int
        and effects["metadataStoreQuotaBytesReserved"] == 4 * 1048576, "EXACT_NEW_STORE_METADATA_RESERVATION")
    base = (effects["minimumFreeBytes"] + effects["safetyMarginBytes"] + effects["taskQuotaBytes"]
        + effects["metadataStoreQuotaBytesReserved"])
    require(type(effects.get("requiredFreeBytesBeforeOtherReservations")) is int
        and effects["requiredFreeBytesBeforeOtherReservations"] == base, "FULL_SOURCE_RESOURCE_RESERVATION_MATCH")
    required = base + reserved
    require(required <= 2**53 - 1 and available >= required, "PRODUCTION_FLOOR_AND_ALL_STORE_RESERVATIONS")
    return dict(availableBytes=available, requiredBytes=required, reservedBytes=reserved, storeRoots=roots,
        minimumFreeBytes=effects["minimumFreeBytes"], taskQuotaBytes=effects["taskQuotaBytes"],
        metadataStoreQuotaBytesReserved=effects["metadataStoreQuotaBytesReserved"])



def reservation_snapshot(root, common):
    """Read stable full identities, not contents or cleanup eligibility.

    This catches changed task rows/scratch membership across the frozen reader.
    It is a cooperative inventory snapshot, not a multi-store OS lock.
    """
    tasks = root / "tasks"; common.private_directory(tasks)
    directory_id = identity(tasks.lstat()); rows = []
    entries = list(tasks.iterdir()); require(len(entries) <= 4096, "BOUNDED_ALL_TASK_RECORDS")
    for task in entries:
        common.private_directory(task)
        require(re.fullmatch(r"[0-9a-f]{32}", task.name), "EXACT_RESERVATION_TASK_NAME")
        record = task / "task.json"; before = record.lstat()
        require(stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid()
            and before.st_nlink == 1 and before.st_size <= 4194304, "RESERVATION_RECORD_IDENTITY")
        scratch = task / "scratch"
        try:
            common.private_directory(scratch); scratch_id = identity(scratch.lstat())[:5]
        except FileNotFoundError:
            scratch_id = None
        rows.append((task.name, identity(task.lstat())[:5], identity(before), scratch_id))
    require(identity(tasks.lstat()) == directory_id and set(tasks.iterdir()) == set(entries),
        "RESERVATION_TASK_LIST_CHANGED")
    return directory_id, sorted(rows)


def capacity(volume, volume_uuid, root, common, effects, own_task=None):
    """Read every recognized sibling store, not a task-storage name prefix."""
    common.no_links(volume); common.no_links(root)
    r = subprocess.run(["/usr/sbin/diskutil", "info", "-plist", str(volume)], capture_output=True, timeout=10)
    require(r.returncode == 0 and len(r.stdout) <= 65536 and len(r.stderr) <= 8192, "MOUNT_QUERY")
    v = plistlib.loads(r.stdout)
    require(v.get("VolumeUUID") == volume_uuid and v.get("MountPoint") == str(volume)
        and root.parent == volume / "spv2" and root.parent.is_dir()
        and root.parent.stat().st_dev == volume.stat().st_dev == root.stat().st_dev, "PINNED_PHYSICAL_STORAGE_PARENT")
    before = common.private_directory(root.parent) if stat.S_IMODE(root.parent.stat().st_mode) == 0o700 else identity(root.parent.stat())[:5]
    siblings = list(root.parent.iterdir()); require(len(siblings) <= 4096, "BOUNDED_STORAGE_PARENT")
    candidates = []
    for candidate in siblings:
        require(not candidate.is_symlink(), "UNCLASSIFIED_STORAGE_PARENT_LINK")
        if not candidate.is_dir():
            continue
        path = candidate / "storage.json"
        try:
            raw, ident = read(path, 65536)
        except FileNotFoundError:
            require(not (candidate / "tasks").exists() and not (candidate / "objects").exists(),
                "MANAGED_LAYOUT_WITHOUT_STORAGE_METADATA")
            continue
        meta = metadata(raw)
        if meta.get("schema") != "zenon-owned-task-storage/v2":
            require(not (candidate / "tasks").exists() and not (candidate / "objects").exists(),
                "UNKNOWN_STORAGE_SCHEMA_WITH_MANAGED_LAYOUT")
            continue
        common.private_directory(candidate)
        require(candidate.stat().st_dev == root.stat().st_dev, "SIBLING_STORE_MOUNT")
        candidates.append((candidate, raw, ident, meta.get("id")))
    require(1 <= len(candidates) <= 256 and root in [v[0] for v in candidates]
        and all(type(v[3]) is str and re.fullmatch(r"[0-9a-f]{32}", v[3]) for v in candidates)
        and len({v[3] for v in candidates}) == len(candidates), "COMPLETE_DISTINCT_STORE_SCOPE")
    snapshots = {str(path): reservation_snapshot(path, common) for path, _, _, _ in candidates}
    reserved = sum(common.reservations(path, own_task)["reservedBytes"] for path, raw, ident, store_id in candidates)
    for path, _, _, _ in candidates:
        require(reservation_snapshot(path, common) == snapshots[str(path)], "RESERVATION_RECORD_OR_SCRATCH_CHANGED")
    for path, raw, ident, store_id in candidates:
        require(read(path / "storage.json", 65536) == (raw, ident), "STORAGE_INVENTORY_CHANGED")
    require(identity(root.parent.stat())[:5] == before and set(root.parent.iterdir()) == set(siblings),
        "STORAGE_PARENT_CHANGED")
    space = os.statvfs(volume)
    return capacity_data(space.f_bavail * space.f_frsize, reserved, effects, len(candidates))


def recheck_profile_sources(profile, common, node):
    for row in profile["inputs"]:
        url = urlparse(row["url"])
        require(url.scheme == "file" and url.netloc == "", "ACTUAL_SOURCE_FILE_URL")
        path = Path(unquote(url.path)); common.no_links(path)
        require(identity(path.lstat()) == row["identity"], "INSTALLED_SOURCE_IDENTITY_CHANGED")
    common.no_links(node)
    require(identity(node.lstat()) == profile["runtime"]["nodeIdentity"], "PINNED_NODE_IDENTITY_CHANGED")


def execute(args, repo, admitted, planner):
    c, effects = admitted["controls"], admitted["effects"]
    common, resource, producer = c["common"], c["resource"], c["producer"]
    validate_full_source_context(planner)
    native_selection(args, effects)
    require(sys.platform == "darwin" and os.uname().machine == "arm64" and sys.version.split()[0] == "3.12.14",
        "NATIVE_DRIVER_RUNTIME")
    require(all(getattr(args, k) is not None for k in ("manager", "node", "root", "store_id", "storage_sha256",
        "volume", "volume_uuid")), "EXPLICIT_PRIVATE_NATIVE_INPUTS")
    require(re.fullmatch(r"[0-9a-f]{32}", args.store_id) and HASH.fullmatch(args.storage_sha256)
        and re.fullmatch(r"[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}", args.volume_uuid), "EXACT_PRIVATE_IDS")
    manager, node, root, volume = map(Path, (args.manager, args.node, args.root, args.volume))
    source_roots = []
    for path in (repo, Path(args.packages)):
        common.no_links(path)
        source_roots.append((path, common.private_directory(path) if stat.S_IMODE(path.stat().st_mode) == 0o700
            else identity(path.stat())[:5]))
    for path, ident in source_roots:
        common.no_links(path)
        require(stat.S_ISDIR(path.lstat().st_mode) and path.lstat().st_uid == os.getuid(), "OWNED_SOURCE_ROOT")
    manager_raw, manager_id = read(manager / "storage.py"); cli_raw, cli_id = read(manager / "cli.py", 65536)
    require(sha(manager_raw) == STORAGE_SHA and sha(cli_raw) == CLI_SHA, "APPROVED_UNCHANGED_MANAGER")
    meta_raw, meta_id = read(root / "storage.json", 65536); meta = strict(meta_raw)
    require(meta.get("id") == args.store_id and sha(meta_raw) == args.storage_sha256, "PINNED_NEW_PRIVATE_STORE")
    openssl = Path("/usr/bin/openssl"); openssl_id = common.binary(openssl, OPENSSL_SHA, 0)
    admitted["unchanged"]()
    capacity(volume, args.volume_uuid, root, common, effects)
    if args.pre_native_plan:
        print(json.dumps(dict(event="PACED_TIMER_V3_PARENT_NATIVE_READ_ONLY_PREFLIGHT",nativeExecuted=False,
            expectedPeakBytes=effects["expectedPeakBytesReserved"], authority="NONE")), flush=True)
        return 0
    native_intent(args, effects)
    storage = load_verified(manager / "storage.py", manager_raw, "paced_v2_actual_owned_storage")
    store = storage.Store(root, metadata_lock_timeout=5)
    require(store.id == args.store_id and same(dataclasses.asdict(store.policy), admitted["policy"]) and not store._tasks()
        and not store._objects() and not list((root / "object-records").iterdir())
        and {path.name for path in root.iterdir()} == {"storage.json", "objects", "object-records", "tasks", "locks"},
        "NEW_UNUSED_EXACT_POLICY_STORE")
    original_env, original_umask = dict(os.environ), os.umask(0o077)
    os.environ.clear(); os.environ.update(PATH="/usr/bin:/bin", LANG="C", LC_ALL="C", TZ="UTC",
        NODE_DISABLE_COMPILE_CACHE="1", WS_NO_BUFFER_UTIL="1", WS_NO_UTF_8_VALIDATE="1")
    source_profile = None; aliases = []; private_inputs = []; task = None; observed = None
    def before_native():
        admitted["unchanged"]()
        require(read(manager / "storage.py") == (manager_raw, manager_id)
            and read(manager / "cli.py", 65536) == (cli_raw, cli_id)
            and read(root / "storage.json", 65536) == (meta_raw, meta_id)
            and identity(openssl.lstat()) == openssl_id, "NATIVE_CONTROL_IDENTITY_CHANGED")
        require(source_profile is not None, "FULL_SOURCE_CONTEXT_BEFORE_NATIVE_COMMAND")
        for path, ident in source_roots:
            common.no_links(path)
            require(identity(path.lstat())[:5] == ident, "SOURCE_ROOT_IDENTITY_CHANGED")
        recheck_profile_sources(source_profile, common, node)
        for path, raw, ident in aliases + private_inputs:
            require(read(path, max(262144, len(raw))) == (raw, ident), "PRIVATE_INPUT_CHANGED")
        return capacity(volume, args.volume_uuid, root, common, effects,
            None if task is None else (store.id, task.id))
    try:
        with store.task("zenon-x402-paced-timer-native-capacity-v3-once", expected_bytes=effects["expectedPeakBytesReserved"],
                quota_bytes=effects["taskQuotaBytes"]) as task:
            def retained(relative, raw):
                path = task.write(relative, raw)
                kept = task.preserve(path, sha(raw), len(raw))
                result = dict(path=str(store.object(kept["sha256"], kept["bytes"])), sha256=kept["sha256"])
                check_raw, ident = read(Path(result["path"]), max(262144, len(raw)))
                require(check_raw == raw, "EXACT_RETAINED_PRIVATE_INPUT")
                private_inputs.append((Path(result["path"]), raw, ident))
                return result
            for name in (MANIFEST, SOURCE_SELECTION, PLAN, PARENT):
                retained("inputs/" + Path(name).name, read(repo / name)[0])
            run_id = sha((store.id + ":" + task.id + ":" + producer.PARENT_SEAL + ":" + effects["workloadPlanSha256"]).encode("ascii"))
            task.record("scope.json", dict(runId=run_id, launchSha256=args.manifest_sha256,
                effectsCeiling=effects, automaticRetry=False, nativeOsNetworkSandbox=False))
            bundles, role_roots = [], []
            for ordinal, lane_id in enumerate(admitted["workload"]["laneIds"], 1):
                for role in ("PAYER", "SERVICE"):
                    relative = "lanes/" + format(ordinal, "02d") + "/" + role.lower()
                    marker = task.write(relative + "/admission.json", resource.canonical_bytes(dict(runId=run_id,
                        laneId=lane_id, role=role)), disposable=True)
                    private_inputs.append((marker, *read(marker)))
                    root_data = dict(path=str(marker.parent), identity=common.private_directory(marker.parent))
                    built = planner.plan_child(role, dict(runId=run_id, laneId=lane_id), root_data)
                    reference = retained("profiles/" + format(ordinal, "02d") + "-" + role.lower() + ".json", built["profileBytes"])
                    full = c["command"].decode(built["profileBytes"], 524288)
                    bundle = dict(reference=dict(role=role, laneId=lane_id, path=reference["path"], sha256=reference["sha256"],
                        entryURL=full["entryURL"], preloaderURL=full["preloaderURL"],
                        rootPath=root_data["path"], rootIdentity=root_data["identity"]), profileBytes=built["profileBytes"])
                    bundles.append(bundle)
                    role_roots.append((role, relative))
            assembly = c["bundle"].assemble(planner, resource, admitted["workload"], run_id,
                dict(path=str(task.scratch), identity=common.private_directory(task.scratch)), bundles)
            require(same(assembly["resourcePlan"], effects), "FULL_PROFILE_RESOURCE_AND_NATIVE_EFFECT_SCOPE")
            built, planned = assembly["parentProfile"], assembly["entryPlan"]
            parent = retained("profiles/supervisor.json", built["profileBytes"])
            entry_plan = retained("profiles/workload.json", planned["planBytes"])
            command_plan = c["command"].plan(resource, admitted["workload"], effects, str(repo), str(node),
                str(task.scratch), dict(path=parent["path"], sha256=parent["sha256"], raw=built["profileBytes"]),
                dict(path=entry_plan["path"], sha256=entry_plan["sha256"], raw=planned["planBytes"]), run_id)
            source_profile = command_plan["sourceProfile"]
            task.record("profile-entry-binding-data.json", assembly["summary"])
            task.record("parent-command-binding-data.json", command_plan["summary"])
            config = task.write("tls.cnf", common.TLS_CONFIG)
            private_inputs.append((config, *read(config)))
            before_native()
            tls_receipt = task.run([str(openssl), "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "1",
                "-keyout", "/dev/stdout", "-config", str(config)], cwd=task.scratch,
                timeout=effects["opensslTimeoutSeconds"], stdout_limit=effects["opensslStdoutLimit"], retain_argv=False)
            task.record("tls-command.json", tls_receipt)
            require(tls_receipt["state"] == "COMPLETE" and tls_receipt["output_complete"] is True
                and type(tls_receipt["actual_exit"]) is int and tls_receipt["actual_exit"] == 0, "TEST_TLS_FAILED_OR_UNKNOWN")
            pem = read(store.object(tls_receipt["stdout"]["sha256"], tls_receipt["stdout"]["bytes"]), 16384)[0]
            material = c["tls"].split_test_tls_stdout(pem)
            objects = {name: retained("test-" + name, raw) for name, raw in material.items()}
            for role, relative in role_roots:
                for name in (("tls-cert.pem",) if role == "PAYER" else ("tls-key.pem", "tls-cert.pem")):
                    alias = task.materialize(objects[name]["sha256"], relative + "/" + name, method="clone")
                    alias.chmod(0o600); raw, ident = read(alias, 16384)
                    require(raw == material[name] and alias.stat().st_ino != Path(objects[name]["path"]).stat().st_ino,
                        "INDEPENDENT_TLS_ALIAS")
                    aliases.append((alias, raw, ident))
            os.environ.update(command_plan["envDelta"])
            before_native()
            receipt = task.run(command_plan["argv"], cwd=repo, timeout=command_plan["timeoutSeconds"],
                stdout_limit=command_plan["stdoutLimit"], retain_argv=False)
            task.record("parent-command.json", receipt)
            stdout = read(store.object(receipt["stdout"]["sha256"], receipt["stdout"]["bytes"]), effects["nodeStdoutLimit"])[0]
            stderr = read(store.object(receipt["stderr"]["sha256"], receipt["stderr"]["bytes"]), effects["nodeStderrLimit"])[0]
            observed = c["captureValidator"].validate(stdout, stderr, receipt, admitted["workload"], run_id)
            task.record("component-data.json", dict(observed=observed, storageCleanupStatus="NOT_ESTABLISHED", authority="NONE"))
            # Actual SQL/pin descendants remain unknown files. Never adopt them,
            # retry a command/payment, or erase evidence to force task cleanup.
        closed = metadata(read(task.directory / "task.json", 4194304)[0])
        cleanup = metadata(read(task.evidence / "cleanup.json", 65536)[0])
        storage_data = c["data"].closed_storage_data(closed, cleanup, store.id, task.id)
        print(json.dumps(dict(event="PACED_TIMER_V3_PARENT_COMPONENT_DATA_STORAGE_SEPARATE", component=observed, storage=storage_data,
            nativeResourcesQualified=False, sustainableCapacityQualified=False, productionQualified=False, authority="NONE")), flush=True)
        return 0 if storage_data["storageDecision"] in ("CLEANED", "ALREADY_CLEAN") else 1
    finally:
        os.environ.clear(); os.environ.update(original_env); os.umask(original_umask)


def arguments(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("repo", "manifest-sha256"):
        parser.add_argument("--" + name, required=True)
    modes = parser.add_mutually_exclusive_group()
    for name in ("source-only", "pre-native-plan", "execute"):
        modes.add_argument("--" + name, action="store_true")
    for name in ("packages", "node", "manager", "root", "store-id", "storage-sha256", "volume", "volume-uuid",
            "native-selection", "approval-launch-sha256", "approval-plan-sha256"):
        parser.add_argument("--" + name)
    return parser.parse_args(argv)


def main(argv=None):
    args = arguments(argv)
    if not args.execute and not args.pre_native_plan:
        require(all(getattr(args, name) is None for name in ("packages", "node", "manager", "root", "store_id",
            "storage_sha256", "volume", "volume_uuid", "native_selection", "approval_launch_sha256", "approval_plan_sha256")),
            "PRIVATE_NATIVE_INPUTS_NOT_ALLOWED_IN_SOURCE_ONLY")
    admitted = source_admission(args.repo, args.manifest_sha256)
    print(json.dumps(dict(event="PACED_TIMER_V3_MANAGED_SOURCE_NOT_NATIVE",
        parentApplicationFilesRead=147, packageRowsDeclared=404, completeManagedControllerSourceAuthored=True,
        managedNativeControllerQualified=False, effectsCeiling=admitted["effects"],
        nativeExecuted=False, nativeAllowanceGranted=False, authority="NONE")), flush=True)
    if not args.execute and not args.pre_native_plan:
        return 0
    native_selection(args, admitted["effects"])
    require(args.packages is not None and args.node is not None, "EXPLICIT_INSTALLED_SOURCE_AND_NODE_INPUTS")
    planner = admitted["controls"]["producer"].build_source_context(args.repo, args.packages, args.node)
    admitted["unchanged"](); validate_full_source_context(planner)
    return execute(args, Path(args.repo), admitted, planner)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, TypeError, RuntimeError, SyntaxError) as problem:
        code = str(problem) if type(problem) is ValueError and re.fullmatch(r"[A-Z0-9_]+", str(problem)) else "PRESERVE_PRIVATE_OWNED_RECEIPTS"
        print(json.dumps(dict(event="PACED_TIMER_V3_MANAGED_REFUSED_OR_UNKNOWN", code=code,
            errorType=type(problem).__name__, automaticRetry=False, authority="NONE")), file=sys.stderr, flush=True)
        sys.exit(1)
