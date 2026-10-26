"""One current CLEAN native selection; source-only unless explicitly executed.

A flag is NOT human authority. Use a fresh separately approved finite scope.
Only an already approved initialized manager root is accepted. No new root,
old task recovery, policy override, source/package copying or native retry.
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

MANIFEST = "qualification/issued-current-close-v6.inputs.json"
PROFILE = "qualification/issued_current_close_v6_profile.py"
LAUNCHER = "qualification/run-issued-current-close-v6.local.py"
ENTRY = "qualification/issued-current-close-v6.case.mjs"
PRELOAD = "qualification/issued-current-close-v6.preload.mjs"
CONTROLS = (PROFILE, LAUNCHER, "qualification/funding_tls_current_gate.py",
    "qualification/run-funding-post-native-loopback-tls.local.py")
PROJECT = "x402-native-issued-current-close-v6-once"
QUOTA, FLOOR = 4194304, 10737418240
MAX_RESERVATION_ROOTS = 128
MAX_PARENT_ENTRIES = 512
TLS_CONFIG = b"""RANDFILE = /dev/null
[req]
prompt = no
distinguished_name = dn
x509_extensions = ext
[dn]
CN = 127.0.0.1
[ext]
subjectAltName = @names
basicConstraints = critical,CA:TRUE
keyUsage = critical,digitalSignature,keyEncipherment,keyCertSign
extendedKeyUsage = serverAuth
[names]
IP.1 = 127.0.0.1
DNS.1 = localhost
"""


def require(ok, code):
    if not ok:
        raise ValueError(code)


def identity(s):
    return [str(v) for v in (s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode,
        s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns)]


def read(path, maximum=1048576):
    require(path.is_absolute() and os.path.normpath(path) == str(path), "ABSOLUTE_PATH")
    for at in (path, *path.parents):
        require(not at.is_symlink(), "SOURCE_LINK")
    before = path.lstat()
    require(stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid()
        and before.st_nlink == 1 and 0 <= before.st_size <= maximum, "OWNED_REGULAR_SOURCE")
    ident = identity(before)
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        require(identity(os.fstat(stream.fileno())) == ident, "SOURCE_OPEN_IDENTITY")
        raw = stream.read(maximum + 1)
        require(len(raw) == before.st_size and identity(os.fstat(stream.fileno())) == ident, "SOURCE_READ_IDENTITY")
    require(identity(path.lstat()) == ident, "SOURCE_PATH_IDENTITY")
    return raw, ident


def pin(name, raw):
    return dict(path=name, bytes=len(raw), LF=raw.count(b"\n"), sha256=hashlib.sha256(raw).hexdigest(),
        gitBlob=hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest())


def module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    require(spec is not None and spec.loader is not None, "MODULE_SPEC")
    value = importlib.util.module_from_spec(spec)
    sys.modules[name] = value
    raw, _ = read(path)
    exec(compile(raw, str(path), "exec"), value.__dict__)
    return value


def reservation_scope(root, previous, discovered=None):
    """Pure scope validation; omitted roots can never be treated as zero."""
    require(type(previous) is list and 1 <= len(previous) < MAX_RESERVATION_ROOTS,
        "BOUNDED_HISTORICAL_RESERVATION_SCOPE")
    supplied = [str(root), *previous]
    require(all(type(name) is str and Path(name).is_absolute()
        and os.path.normpath(name) == name and Path(name).parent == root.parent
        for name in supplied) and len(set(supplied)) == len(supplied),
        "CANONICAL_DISTINCT_SIBLING_RESERVATION_ROOTS")
    if discovered is not None:
        require(type(discovered) is list and len(discovered) <= MAX_RESERVATION_ROOTS
            and len(set(discovered)) == len(discovered) and set(supplied) == set(discovered),
            "ALL_DISCOVERED_RESERVATION_ROOTS_REQUIRED")
    return sorted(supplied)


def discover_reservation_roots(parent):
    """Bounded sibling metadata discovery, not payload traversal or adoption."""
    before = identity(parent.lstat())
    result = []
    with os.scandir(parent) as entries:
        for count, entry in enumerate(entries, 1):
            require(count <= MAX_PARENT_ENTRIES, "RESERVATION_PARENT_ENTRY_BOUND")
            require(not entry.is_symlink(), "UNCERTAIN_LINKED_RESERVATION_ROOT")
            if not entry.is_dir(follow_symlinks=False):
                continue
            path = Path(entry.path)
            try:
                metadata = (path / "storage.json").lstat()
            except FileNotFoundError:
                continue
            state = path.lstat()
            require(stat.S_ISDIR(state.st_mode) and state.st_uid == os.getuid()
                and stat.S_IMODE(state.st_mode) == 0o700
                and stat.S_ISREG(metadata.st_mode) and metadata.st_uid == os.getuid()
                and metadata.st_nlink == 1, "UNCERTAIN_RESERVATION_ROOT_METADATA")
            result.append(str(path))
            require(len(result) <= MAX_RESERVATION_ROOTS, "RESERVATION_ROOT_BOUND")
    require(identity(parent.lstat()) == before, "RESERVATION_PARENT_CHANGED")
    return sorted(result)


def source_admission(repo, expected):
    require(type(expected) is str and re.fullmatch(r"[0-9a-f]{64}", expected) is not None, "EXPLICIT_MANIFEST_DIGEST")
    raw, manifest_id = read(repo / MANIFEST, 524288)
    require(hashlib.sha256(raw).hexdigest() == expected, "MANIFEST_DIGEST")
    delta = json.loads(raw)
    require(type(delta) is dict and type(delta.get("controlInputs")) is list
        and [r.get("path") if type(r) is dict else None for r in delta["controlInputs"]] == list(CONTROLS),
        "EXACT_CURRENT_CONTROL_SET")
    controls = {}
    for row in delta["controlInputs"]:
        data, ident = read(repo / row["path"])
        require(pin(row["path"], data) == row, "CONTROL_SOURCE_PIN")
        controls[row["path"]] = (data, ident)
    require(Path(__file__).absolute() == repo / LAUNCHER, "CURRENT_LAUNCHER_LOCATION")
    profile = module(repo / PROFILE, "qualified_current_issued_close_v6_profile")
    application = profile.verify_application_inputs(str(repo), delta)
    def unchanged():
        data, ident = read(repo / MANIFEST, 524288)
        require(data == raw and ident == manifest_id, "MANIFEST_CHANGED")
        for name, (before, before_id) in controls.items():
            data, ident = read(repo / name)
            require(data == before and ident == before_id, "CONTROL_CHANGED")
        profile.recheck_application_inputs(application)
    unchanged()
    return delta, raw, controls, profile, unchanged


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True)
    parser.add_argument("--manifest-sha256", required=True)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--source-only", action="store_true")
    modes.add_argument("--pre-native-plan", action="store_true")
    modes.add_argument("--execute-current-clean-v6", action="store_true")
    for name in ("packages", "manager", "node", "root", "store-id", "volume", "volume-uuid"):
        parser.add_argument("--" + name)
    parser.add_argument("--previous-root", action="append")
    args = parser.parse_args()
    require(sys.dont_write_bytecode, "BYTECODE_DISABLED_REQUIRED")
    repo = Path(args.repo)
    delta, raw, controls, profile, unchanged = source_admission(repo, args.manifest_sha256)
    print(json.dumps(dict(event="CURRENT_ISSUED_CLOSE_V6_SOURCE_ADMITTED", applicationFiles=profile.APP_FILES,
        packageFilesDeclared=profile.PACKAGE_FILES, packageFilesRead=0, effectsExecuted=False, nativeAuthority="NONE")), flush=True)
    if not args.pre_native_plan and not args.execute_current_clean_v6:
        return 0
    require(all(getattr(args, n) is not None for n in
        ("packages", "manager", "node", "root", "volume", "volume_uuid")), "EXPLICIT_NATIVE_PATHS")
    packages, manager, node, root, volume = map(Path, (args.packages, args.manager, args.node, args.root, args.volume))
    require(all(p.is_absolute() and os.path.normpath(p) == str(p) for p in
        (repo, packages, manager, node, root, volume)), "CANONICAL_NATIVE_PATHS")
    require(re.fullmatch(r"[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}", args.volume_uuid) is not None,
        "EXPLICIT_APPROVED_VOLUME_UUID")
    reservation_scope(root, args.previous_root)
    legacy = module(repo / CONTROLS[3], "qualified_current_close_v6_capacity")
    gate = module(repo / CONTROLS[2], "qualified_current_close_v6_tls_framing")
    # Verify the mounted UUID before reading package/root data on that volume.
    legacy.capacity(volume, args.volume_uuid, root, args.previous_root)
    require(root.is_dir() and not root.is_symlink(), "APPROVED_EXISTING_ROOT_REQUIRED_NO_INITIALIZATION")
    reservation_scope(root, args.previous_root, discover_reservation_roots(root.parent))
    root_metadata, root_metadata_id = read(root / "storage.json", 65536)
    root_id = identity(root.lstat())
    built = profile.build_profile(str(repo), str(packages), delta, "clean")
    storage_raw, storage_id = read(manager / "storage.py", 262144)
    cli_raw, cli_id = read(manager / "cli.py", 65536)
    require(hashlib.sha256(storage_raw).hexdigest() == legacy.STORAGE_SHA
        and hashlib.sha256(cli_raw).hexdigest() == legacy.CLI_SHA, "APPROVED_UNCHANGED_MANAGER")
    node_id = legacy.binary(node, legacy.NODE_SHA, os.getuid(), 121304480)
    openssl = Path("/usr/bin/openssl")
    openssl_id = legacy.binary(openssl, legacy.OPENSSL_SHA, 0)
    # Existing Store construction is read-only; create=True is never used.
    storage = module(manager / "storage.py", "storage")
    store = storage.Store(root, metadata_lock_timeout=5)
    require(type(store.policy.min_free_bytes) is int and store.policy.min_free_bytes >= FLOOR,
        "EXISTING_FREE_FLOOR_MAY_NOT_BE_LOWERED")
    def before_native():
        require(identity(root.lstat()) == root_id
            and read(root / "storage.json", 65536) == (root_metadata, root_metadata_id), "APPROVED_ROOT_METADATA_CHANGED")
        unchanged()
        profile.recheck_captured_files(built["_captures"])
        require(identity(node.lstat()) == node_id and identity(openssl.lstat()) == openssl_id
            and identity((manager / "storage.py").lstat()) == storage_id
            and identity((manager / "cli.py").lstat()) == cli_id, "BINARY_OR_MANAGER_REPLACED")
        capacity = legacy.capacity(volume, args.volume_uuid, root, args.previous_root)
        reservation_scope(root, args.previous_root, discover_reservation_roots(root.parent))
        extra = max(0, max(store.policy.min_free_bytes, store.policy.safety_margin_bytes) - FLOOR)
        require(capacity["availableBytes"] >= capacity["requiredBytes"] + extra, "EXISTING_LARGER_FLOOR_WITH_ALL_RESERVATIONS")
        return {**capacity, "requiredBytes": capacity["requiredBytes"] + extra}
    capacity = before_native()
    print(json.dumps(dict(event="CURRENT_ISSUED_CLOSE_V6_PRE_NATIVE_PLAN", applicationFiles=profile.APP_FILES,
        packageFilesRead=profile.PACKAGE_FILES, sourceBytes=built["sourceBytes"], profileBytes=built["profileBytesCount"],
        capacity=capacity, existingSourcesRecopied=False, effectsExecuted=False, nativeAuthority="NONE")), flush=True)
    if not args.execute_current_clean_v6:
        return 0
    require(args.store_id is not None and store.id == args.store_id, "EXPLICIT_APPROVED_EXISTING_STORE_ID")
    os.umask(0o077)
    # One fixed project lease serializes the check and task creation. Existing
    # project records permanently consume this one-shot; no root reset/recovery.
    with storage.Lock(root / "locks" / (PROJECT + ".lease")):
        with store.locked():
            tasks = store._capacity(QUOTA)
            require(not any(r["project"] == PROJECT for _, r in tasks), "CURRENT_V6_ATTEMPT_ALREADY_CONSUMED")
        unchanged()
        before_native()
        os.environ.clear()
        os.environ.update(PATH="/usr/bin:/bin", LANG="C", LC_ALL="C", TZ="UTC", NODE_DISABLE_COMPILE_CACHE="1",
            WS_NO_BUFFER_UTIL="1", WS_NO_UTF_8_VALIDATE="1", X402_ISSUED_CLOSE_NATIVE_SELECTION="current-native-issued-close-source-v4",
            X402_ISSUED_CLOSE_NATIVE_RUN_SCOPE="one-current-clean-issued-close-v6", X402_ISSUED_CLOSE_NATIVE_MODE="clean")
        with store.task(PROJECT, expected_bytes=QUOTA, quota_bytes=QUOTA) as task:
            selected = {name: value[0] for name, value in controls.items()}
            selected[MANIFEST] = raw
            selected[profile.BASE["path"]] = read(repo / profile.BASE["path"], 524288)[0]
            for name in (ENTRY, PRELOAD):
                selected[name] = read(repo / name)[0]
            for name, data in selected.items():
                file = task.write("inputs/" + name, data)
                task.preserve(file, hashlib.sha256(data).hexdigest(), len(data))
            file = task.write("private-current-close-v6-profile.json", built["profileBytes"])
            item = task.preserve(file, built["profileSha256"], len(built["profileBytes"]))
            file = store.object(item["sha256"], item["bytes"])
            os.environ.update(X402_ISSUED_CLOSE_NATIVE_PROFILE_PATH=str(file),
                X402_ISSUED_CLOSE_NATIVE_PROFILE_SHA256=built["profileSha256"])
            task.record("scope.json", dict(mode="clean", maximumRuns=1, effectsCeiling=profile.EFFECTS,
                sourceRowsSha256=delta["resolvedSourceRowsSha256"], existingSourcesRecopied=False,
                rootPolicyChanged=False, nativeOsNetworkSandbox=False))
            config = task.write("tls.cnf", TLS_CONFIG)
            before_native()
            print(json.dumps(dict(event="CURRENT_ISSUED_CLOSE_V6_OPENSSL_ENTRY", attemptsEntered=1)), flush=True)
            tls = task.run([str(openssl), "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "1",
                "-keyout", "/dev/stdout", "-config", str(config)], cwd=task.scratch, timeout=20, stdout_limit=65536, retain_argv=False)
            task.record("test-tls-generation.json", tls)
            require(tls["state"] == "COMPLETE" and tls["output_complete"] is True
                and type(tls["actual_exit"]) is int and tls["actual_exit"] == 0, "TEST_TLS_FAILED_OR_UNKNOWN")
            captured = store.object(tls["stdout"]["sha256"], tls["stdout"]["bytes"]).read_bytes()
            parts = gate.split_test_tls_stdout(captured)
            for name, data in parts.items():
                file = task.write(name, data)
                require(read(file, 16384)[0] == data and stat.S_IMODE(file.lstat().st_mode) == 0o600, "PRIVATE_TEST_TLS_INPUT")
            captured = None
            parts = None
            before_native()
            print(json.dumps(dict(event="CURRENT_ISSUED_CLOSE_V6_NODE_ENTRY", maximumConnections=182, nodeChildren=0)), flush=True)
            argv = [str(node), "--no-addons", "--disallow-code-generation-from-strings", "--disable-proto=throw",
                "--unhandled-rejections=strict", "--test-reporter=tap", "--import=" + str(repo / PRELOAD),
                str(repo / ENTRY), str(task.scratch)]
            native = task.run(argv, cwd=repo, timeout=90, stdout_limit=65536, retain_argv=False)
            task.record("actual-native-command.json", native)
            print(json.dumps(dict(event="CURRENT_ISSUED_CLOSE_V6_PRIVATE_CAPTURE_RETAINED",
                actualExit=native["actual_exit"], outputComplete=native["output_complete"],
                stdout=native["stdout"], stderr=native["stderr"], rawOutputPrinted=False)), flush=True)
            unchanged()
            stdout = store.object(native["stdout"]["sha256"], native["stdout"]["bytes"]).read_bytes()
            stderr = store.object(native["stderr"]["sha256"], native["stderr"]["bytes"]).read_bytes()
            _app, _id, baseline, _rows = profile.load_selection(str(repo), delta)
            result = profile.validate_native_capture(stdout, stderr, native, delta, baseline)
            task.record("selected-native-result.json", dict(selectedNativeStatus="PASS", result=result,
                sourceRowsSha256=delta["resolvedSourceRowsSha256"], taskCloseAndCleanup="SEPARATE_NOT_ESTABLISHED"))
            print(json.dumps(dict(event="CURRENT_ISSUED_CLOSE_V6_SELECTED_NATIVE_PASS_BEFORE_TASK_CLOSE",
                taskCloseAndCleanup="NOT_ESTABLISHED", productionQualified=False)), flush=True)
            for name in ("tls.cnf", "tls-key.pem", "tls-cert.pem"):
                data, _ = read(task.scratch / name, 16384)
                task.preserve(task.scratch / name, hashlib.sha256(data).hexdigest(), len(data))
        closed = json.loads(read(task.directory / "task.json", 4194304)[0])
        cleanup = json.loads(read(task.evidence / "cleanup.json", 262144)[0])
        require(closed["state"] == "CLOSED", "OWNED_TASK_CLOSE_UNKNOWN_NO_NATIVE_REPLAY")
        print(json.dumps(dict(event="CURRENT_ISSUED_CLOSE_V6_CAPTURE_COMPLETE", selectedNativeStatus="PASS",
            taskState=closed["state"], taskOutcome=closed["outcome"], cleanup=cleanup,
            childFilesPreservedNotDisposable=True, productionQualified=False)), flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, TypeError) as error:
        code = str(error) if type(error) is ValueError and re.fullmatch(r"[A-Z0-9_]+", str(error)) else "REVIEW_PRIVATE_RECEIPTS"
        print(json.dumps(dict(event="CURRENT_ISSUED_CLOSE_V6_REFUSED_OR_FAILED", code=code,
            errorType=type(error).__name__, nativeReplayAuthorized=False)), file=sys.stderr, flush=True)
        sys.exit(1)
