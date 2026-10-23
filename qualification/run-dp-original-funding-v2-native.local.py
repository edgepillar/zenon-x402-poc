"""Run only the reviewed twelve-case DP funding v2 profile.

The operator's separate bounded authority is required; selection arguments do
not prove it. This launcher never initializes/adopts a root, installs packages,
starts a worker, changes existing evidence or uses a historical native profile.

The reviewed native-fchmod mode deliberately does NOT enable Node's Permission
Model: Node 24.19.0 disables the actual store's fchmodSync under that model.
No fs monkeypatch, alternate store, all-files permission grant or OS/network
sandbox is substituted. The exact source/namespace/effect review is required.
"""
import argparse
import dataclasses
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import plistlib
import re
import stat
import subprocess
import sys

NODE_SHA = "dbedff294bab84a0a86c04e15fbcbeb1c97ca10bef1b32b0634cd24b36f62100"
STORAGE_SHA = "a4d82a72214c9698fda7ae363c38b2470c08da5e2e04c63ee9284e43f638f081"
CLI_SHA = "0bf13cdc1f25a6b31ab14cfb124908808ca7ddc89073ecbcd0263bef4d52238c"
VOLUME_UUID = None
VOLUME = None
QUOTA = 4 * 1048576
KIND = "ZENON_DP_ORIGINAL_FUNDING_V2_TWELVE_CASE_NODE24"
SELECTION = "twelve-synthetic-v2-cases-only"
MANIFEST = "qualification/dynamic-plasma-original-funding-submission-v2-native.inputs.json"
BUILDER = "qualification/dynamic-plasma-original-funding-submission-v2-profile.draft.py"
LOADER = "qualification/dynamic-plasma-original-funding-submission-v2-native.preload.draft.mjs"
_OLD_RESERVATION_ROWS = {}


def require(ok, code):
    if not ok:
        raise ValueError(code)


def ids(s):
    return [str(v) for v in (s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode,
                             s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns)]


def read(path, cap=1048576):
    for ancestor in (path, *path.parents):
        require(not ancestor.is_symlink(), "SYMLINK")
    s = path.lstat()
    require(stat.S_ISREG(s.st_mode) and s.st_uid == os.getuid()
            and s.st_nlink == 1 and 0 <= s.st_size <= cap, "INPUT_IDENTITY")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        require(ids(os.fstat(stream.fileno())) == ids(s), "INPUT_OPEN")
        raw = stream.read(cap + 1)
        require(len(raw) == s.st_size and ids(os.fstat(stream.fileno())) == ids(s), "INPUT_READ")
    require(ids(path.lstat()) == ids(s), "INPUT_AFTER")
    return raw, ids(s)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def pin(name, raw):
    return dict(path=name, bytes=len(raw), LF=raw.count(b"\n"), sha256=sha(raw),
                gitBlob=hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest())


def existing_root_reservations(root):
    """Read only; do not run collection, adopt files or acquire old task leases."""
    before = root / "storage.json"
    data, identity = read(before, 65536)
    metadata = json.loads(data)
    reserved = 0
    count = 0
    for directory in (root / "tasks").iterdir():
        require(not directory.is_symlink() and directory.is_dir(), "OLD_TASK_DIRECTORY")
        metadata_path = directory / "task.json"
        identity_now = ids(metadata_path.lstat())
        cached = _OLD_RESERVATION_ROWS.get(str(metadata_path))
        if cached is not None and cached[0] == identity_now:
            row = cached[1]
        else:
            # Existing protected task metadata can exceed the source-file cap.
            # Bound this READ ONLY at 4 MiB without changing any store policy,
            # ownership/link guard, reservation or historical byte.
            raw, metadata_identity = read(metadata_path, 4194304)
            full = json.loads(raw)
            row = {key: full[key] for key in ("id", "store_id", "state", "expected_bytes")}
            _OLD_RESERVATION_ROWS[str(metadata_path)] = (metadata_identity, row)
        require(row["store_id"] == metadata["id"] and row["id"] == directory.name, "OLD_TASK_OWNER")
        scratch = directory / "scratch"
        require(not scratch.is_symlink(), "OLD_SCRATCH_LINK")
        if row["state"] == "OPEN" or scratch.exists():
            require(type(row["expected_bytes"]) is int and row["expected_bytes"] >= 0, "OLD_RESERVATION")
            reserved += row["expected_bytes"]
        count += 1
        require(count <= 4096, "OLD_TASK_BOUND")
    require(ids(before.lstat()) == identity, "OLD_METADATA_CHANGED")
    return dict(tasks=count, reservedBytes=reserved, storageSha256=sha(data))


def check_volume_and_capacity(root, previous_roots):
    p = subprocess.run(["/usr/sbin/diskutil", "info", "-plist", str(VOLUME)],
                       check=True, capture_output=True, timeout=10)
    require(plistlib.loads(p.stdout).get("VolumeUUID") == VOLUME_UUID, "MOUNT_IDENTITY")
    require(root.parent == VOLUME / "spv2" and root.stat().st_dev == VOLUME.stat().st_dev, "ROOT_VOLUME")
    reservations = [existing_root_reservations(Path(name)) for name in previous_roots]
    reserved = sum(row["reservedBytes"] for row in reservations)
    space = os.statvfs(VOLUME)
    available = space.f_bavail * space.f_frsize
    require(available >= 10 * 1073741824 + QUOTA + reserved, "EXTERNAL_FREE_FLOOR")
    return dict(volumeUUID=VOLUME_UUID, availableBytes=available,
                externalReservations=reservations, minimumFreeBytes=10 * 1073741824)


def load_python(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    require(spec is not None and spec.loader is not None, "PYTHON_SPEC")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def main():
    global VOLUME, VOLUME_UUID
    parser = argparse.ArgumentParser(description=__doc__)
    for option in ("repo", "packages", "manager", "node", "root", "store-id", "manifest-sha256",
                   "volume", "volume-uuid"):
        parser.add_argument("--" + option, required=True)
    parser.add_argument("--run-number", required=True, type=int, choices=(1, 2, 3))
    parser.add_argument("--profile-mode", required=True, choices=("reviewed-native-fchmod",))
    parser.add_argument("--previous-root", action="append", required=True)
    args = parser.parse_args()
    VOLUME, VOLUME_UUID = Path(args.volume), args.volume_uuid
    require(VOLUME.is_absolute() and str(VOLUME) == os.path.normpath(VOLUME)
            and re.fullmatch(r"[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}", VOLUME_UUID), "VOLUME_SELECTION")
    require(sys.dont_write_bytecode, "BYTECODE_WRITES_DISABLED_REQUIRED")
    repo, packages, manager, node, root = map(Path, (args.repo, args.packages, args.manager, args.node, args.root))
    require(all(path.is_absolute() and str(path) == os.path.normpath(path)
                for path in (repo, packages, manager, node, root)), "ABSOLUTE_PATHS")
    manifest_raw, manifest_id = read(repo / MANIFEST)
    launcher_path = Path(__file__).absolute()
    require(launcher_path.parent == repo / "qualification", "LAUNCHER_LOCATION")
    launcher_raw, launcher_id = read(launcher_path, 65536)
    require(sha(manifest_raw) == args.manifest_sha256, "MANIFEST_DIGEST")
    manifest = json.loads(manifest_raw)
    require(manifest["kind"] == "DP_ORIGINAL_FUNDING_V2_TWELVE_CASE_INPUT_INVENTORY_NOT_EXECUTION_RESULT"
            and manifest["sourceFiles"] == 436 and manifest["applicationFiles"] == 54
            and manifest["packageFiles"] == 382 and manifest["effectsCeiling"]["selectedCases"] == 12
            and manifest["effectsCeiling"]["taskQuotaBytes"] == QUOTA
            and manifest["executionProfile"]["mode"] == args.profile_mode
            and manifest["executionProfile"]["NodePermissionModel"] is False
            and manifest["executionProfile"]["nativeOsSandbox"] is False, "EXACT_SCOPE")
    package_reference = manifest["packageInputsReference"]
    base_raw, _ = read(repo / package_reference["path"])
    require(len(base_raw) == package_reference["bytes"] and sha(base_raw) == package_reference["sha256"], "PACKAGE_REFERENCE")
    package_inputs = [row for row in json.loads(base_raw)["inputs"] if row["path"].startswith("packages/")]
    builder_raw, builder_id = read(repo / BUILDER, 65536)
    builder = load_python(repo / BUILDER, "dp_funding_v2_profile")
    require(ids((repo / BUILDER).lstat()) == builder_id, "BUILDER_CHANGED")
    built = builder.build_v2_twelve_case_profile(str(repo), str(packages),
        manifest["applicationInputs"], package_inputs, manifest["allowedBuiltins"])
    require(built["profile"]["profileKind"] == KIND
            and built["sourceRowsSha256"] == manifest["sourceRowsSha256"], "PROFILE")
    storage_raw, storage_id = read(manager / "storage.py", 262144)
    cli_raw, _ = read(manager / "cli.py", 65536)
    require(sha(storage_raw) == STORAGE_SHA and sha(cli_raw) == CLI_SHA, "MANAGER_IDENTITY")
    node_state = node.lstat()
    require(stat.S_ISREG(node_state.st_mode) and not node.is_symlink()
            and node_state.st_uid == os.getuid() and node_state.st_nlink == 1
            and node_state.st_size == 121304480, "NODE_IDENTITY")
    digest = hashlib.sha256()
    with node.open("rb") as stream:
        require(ids(os.fstat(stream.fileno())) == ids(node_state), "NODE_OPEN")
        for chunk in iter(lambda: stream.read(1048576), b""):
            digest.update(chunk)
        require(ids(os.fstat(stream.fileno())) == ids(node_state), "NODE_AFTER_READ")
    require(digest.hexdigest() == NODE_SHA and ids(node.lstat()) == ids(node_state), "NODE_DIGEST")
    capacity = check_volume_and_capacity(root, args.previous_root)
    storage = load_python(manager / "storage.py", "storage")
    require(ids((manager / "storage.py").lstat()) == storage_id, "MANAGER_CHANGED")
    store = storage.Store(root, metadata_lock_timeout=5)
    policy = dataclasses.asdict(store.policy)
    require(store.id == args.store_id and policy["min_free_bytes"] >= 10 * 1073741824
            and policy["task_quota_bytes"] == QUOTA and policy["max_tasks"] == 3
            and policy["max_commands_per_task"] == 1, "NEW_STORE_POLICY")
    previous = store._tasks()
    require(len(previous) == args.run_number - 1
            and all(row["state"] == "CLOSED" for _, row in previous), "RUN_SEQUENCE")
    require(ids((repo / MANIFEST).lstat()) == manifest_id, "MANIFEST_CHANGED")
    # All sources/runtime/capacity checks above precede new task admission.
    retained_source_bytes = 0
    with store.task("zenon-x402-dp-v2", expected_bytes=QUOTA, quota_bytes=QUOTA) as task:
        profile_path = task.write("profile-v2.json", built["profileBytes"])
        profile_object = task.preserve(profile_path, built["profileSha256"], len(built["profileBytes"]))
        profile_path = store.object(profile_object["sha256"], profile_object["bytes"])
        seen_digests = set()
        for row in manifest["applicationInputs"]:
            raw, _ = read(repo / row["path"][4:])
            require(pin(row["path"], raw) == row, "SOURCE_CHANGED_BEFORE_RETENTION")
            if row["sha256"] not in seen_digests:
                source_path = task.write("inputs/" + row["path"], raw)
                task.preserve(source_path, row["sha256"], row["bytes"])
                retained_source_bytes += len(raw)
                seen_digests.add(row["sha256"])
        for name, raw in ((MANIFEST, manifest_raw), (BUILDER, builder_raw),
                          (launcher_path.name, launcher_raw)):
            source_path = task.write("launcher/" + Path(name).name, raw)
            task.preserve(source_path, sha(raw), len(raw))
        task.record("scope.json", dict(profileKind=KIND, runNumber=args.run_number,
            sourceRowsSha256=built["sourceRowsSha256"], taskQuotaBytes=QUOTA,
            selectedCases=12, sqliteFilesMaximum=12, syntheticKeysMaximum=1,
            syntheticSignaturesMaximum=10, declaredFetchMaximum=3,
            network=False, nonceSearch=False, SDKPrepareBlock=False,
            sourceTransforms=False, retainedApplicationBytes=retained_source_bytes,
            profileMode=args.profile_mode, NodePermissionModel=False, nativeOsSandbox=False))
        # Recheck current sources/packages immediately before the native entry.
        again = builder.build_v2_twelve_case_profile(str(repo), str(packages),
            manifest["applicationInputs"], package_inputs, manifest["allowedBuiltins"])
        require(again["profileBytes"] == built["profileBytes"], "PROFILE_CHANGED_BEFORE_NATIVE_ENTRY")
        require(ids(node.lstat()) == ids(node_state), "NODE_CHANGED_BEFORE_NATIVE_ENTRY")
        require(ids(launcher_path.lstat()) == launcher_id, "LAUNCHER_CHANGED_BEFORE_NATIVE_ENTRY")
        capacity = check_volume_and_capacity(root, args.previous_root)
        # fchmodSync is disabled unconditionally by Node 24.19.0's --permission,
        # even for the owned scratch. Keep the genuine descriptor-based store;
        # do not replace it or claim a filesystem/child/network sandbox here.
        argv = [str(node), "--no-addons",
            "--disallow-code-generation-from-strings", "--disable-proto=throw",
            "--unhandled-rejections=strict", "--test-reporter=tap",
            "--import=" + str(repo / LOADER), str(repo / builder.ENTRY[4:]), str(task.scratch)]
        require(len(argv) <= 256 and sum(len(v.encode()) for v in argv) <= 32768, "ARGV_BOUND")
        os.environ.clear()
        os.environ.update(PATH="/usr/bin:/bin", LANG="C", LC_ALL="C", TZ="UTC",
            NODE_DISABLE_COMPILE_CACHE="1", WS_NO_BUFFER_UTIL="1", WS_NO_UTF_8_VALIDATE="1",
            X402_DP_SUBMISSION_V2_SELECTION=SELECTION,
            X402_DP_SUBMISSION_V2_NATIVE_MODE=args.profile_mode,
            X402_DP_SUBMISSION_V2_PROFILE_PATH=str(profile_path),
            X402_DP_SUBMISSION_V2_PROFILE_SHA256=built["profileSha256"])
        print(json.dumps(dict(event="DP_V2_NATIVE_ENTRY_ADMITTED", runNumber=args.run_number,
            taskId=task.directory.name, sourceRowsSha256=built["sourceRowsSha256"],
            inputs=436, profileSha256=built["profileSha256"], nativeCommands=1,
            newSqliteMaximum=12, signaturesMaximum=10, network=False,
            taskQuotaBytes=QUOTA, profileMode=args.profile_mode,
            NodePermissionModel=False, nativeOsSandbox=False)), flush=True)
        receipt = task.run(argv, cwd=repo, timeout=60, stdout_limit=65536, retain_argv=False)
        task.record("native-receipt.json", receipt)
        require(receipt["state"] == "COMPLETE" and receipt["output_complete"], "NATIVE_CAPTURE_UNKNOWN")
        for row in manifest["applicationInputs"]:
            raw, _ = read(repo / row["path"][4:])
            require(pin(row["path"], raw) == row, "SOURCE_CHANGED_AFTER_NATIVE")
        stdout = store.object(receipt["stdout"]["sha256"], receipt["stdout"]["bytes"]).read_bytes()
        stderr = store.object(receipt["stderr"]["sha256"], receipt["stderr"]["bytes"]).read_bytes()
        result = dict(event="DP_V2_NATIVE_CAPTURE_COMPLETE", runNumber=args.run_number,
            taskId=task.directory.name, receipt=receipt,
            profileMode=args.profile_mode, NodePermissionModel=False, nativeOsSandbox=False,
            sourceRowsSha256=built["sourceRowsSha256"], profileSha256=built["profileSha256"],
            retainedApplicationBytes=retained_source_bytes, capacity=capacity,
            stdout=stdout.decode("utf8"), stderr=stderr.decode("utf8"))
    closed_raw, _ = read(task.directory / "task.json", 262144)
    closed = json.loads(closed_raw)
    require(closed["state"] == "CLOSED", "TASK_CLOSE_UNKNOWN")
    result["taskOutcome"] = closed["outcome"]
    cleanup_raw, _ = read(task.evidence / "cleanup.json", 262144)
    result["cleanup"] = json.loads(cleanup_raw)
    print(json.dumps(result), flush=True)
    return 0 if receipt["actual_exit"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
