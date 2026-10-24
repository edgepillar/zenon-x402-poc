"""SOURCE-ONLY by default: managed ONE full issued-application P2 crash pair.

Read-only source/package admission is NOT native authority. --execute requires a
new separately approved finite parent/two-child/IPC/SIGKILL allowance, a fresh
private task store and explicit store identity. Do not reuse the V3 clean or any
consumed allowance. No old root, helper, metadata, reservation or artifact is
edited/adopted/deleted. This cooperative launcher is NOT an OS/network sandbox.
"""
import argparse
import dataclasses
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import sys

MANIFEST = "qualification/recovery-crash-pair.launch-inputs.json"
PROFILE = "qualification/recovery_crash_native_profile.py"
LAUNCHER = "qualification/run-recovery-crash-pair.local.py"
INVENTORY = "qualification/recovery-crash-full-graph.source-inputs.json"
BASELINE = "qualification/issued-funding-post-native-vertical.inputs-v3.json"
LEGACY = "qualification/run-funding-post-native-loopback-tls.local.py"
TLS_GATE = "qualification/funding_tls_current_gate.py"
PARENT_ENTRY = "qualification/recovery-crash-pair.entry.draft.mjs"
PYTHON_CONTROLS = (PROFILE, LAUNCHER, LEGACY, TLS_GATE)
PARENT_CONTROLS = (
    "app/" + PARENT_ENTRY, "app/qualification/recovery-crash-cutpoint-supervisor.draft.mjs",
    "app/qualification/recovery-crash-cutpoint-protocol-v2.js",
    "app/src/service-credit-pilot-original-payment-checkpoint.js", "app/package.json",
)
KIND = "ONE_FULL_ISSUED_P2_CRASH_PAIR_LAUNCH_SOURCE_NOT_A_RESULT"
QUOTA = 4194304
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


def require(value, code):
    if not value:
        raise ValueError(code)


def identity(s):
    return [str(v) for v in (s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode,
        s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns)]


def read(path, maximum=1048576):
    require(path.is_absolute() and os.path.normpath(str(path)) == str(path), "ABSOLUTE_SOURCE_PATH")
    for candidate in (path, *path.parents):
        require(not candidate.is_symlink(), "SOURCE_LINK")
    before = path.lstat()
    require(stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid() and before.st_nlink == 1
        and 0 <= before.st_size <= maximum, "SOURCE_IDENTITY")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        require(identity(os.fstat(stream.fileno())) == identity(before), "SOURCE_OPEN_IDENTITY")
        raw = stream.read(maximum + 1)
        require(len(raw) == before.st_size and identity(os.fstat(stream.fileno())) == identity(before), "SOURCE_READ_IDENTITY")
    require(identity(path.lstat()) == identity(before), "SOURCE_AFTER_IDENTITY")
    return raw, identity(before)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def pin(name, raw):
    return dict(path=name, bytes=len(raw), LF=raw.count(b"\n"), sha256=sha(raw),
        gitBlob=hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest())


def module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    require(spec is not None and spec.loader is not None, "PINNED_MODULE_SPEC")
    value = importlib.util.module_from_spec(spec)
    sys.modules[name] = value
    spec.loader.exec_module(value)
    return value


def source_admission(repo, expected):
    require(type(expected) is str and re.fullmatch(r"[0-9a-f]{64}", expected) is not None, "EXPLICIT_LAUNCH_MANIFEST_PIN")
    raw, ident = read(repo / MANIFEST, 65536)
    require(sha(raw) == expected, "LAUNCH_MANIFEST_DIGEST")
    manifest = json.loads(raw)
    require(type(manifest) is dict and set(manifest) == {"kind", "version", "sourceParent", "inventory", "baseline",
        "pythonControls", "parentControls", "effectsCeiling", "storagePolicy", "sourceRowsSha256",
        "sourceTransforms", "nativeBuiltinAliases", "nativeExecuted", "nativeOsNetworkSandbox"}, "LAUNCH_MANIFEST_FIELDS")
    require(manifest["kind"] == KIND and type(manifest["version"]) is int and manifest["version"] == 1
        and type(manifest["sourceParent"]) is str and re.fullmatch(r"[0-9a-f]{40}", manifest["sourceParent"]) is not None,
        "EXACT_LAUNCH_SOURCE_KIND")
    require(all(manifest[k] is False for k in ("sourceTransforms", "nativeBuiltinAliases", "nativeExecuted", "nativeOsNetworkSandbox")),
        "NO_NATIVE_OR_SANDBOX_CLAIM")
    controls = manifest["pythonControls"]
    require(type(controls) is list and all(type(p) is dict for p in controls)
        and [p.get("path") for p in controls] == list(PYTHON_CONTROLS), "EXACT_PYTHON_CONTROLS")
    owned = {MANIFEST: (raw, ident)}
    for row in controls:
        data, file_id = read(repo / row["path"], 262144)
        require(pin(row["path"], data) == row, "PYTHON_CONTROL_PIN")
        owned[row["path"]] = (data, file_id)
    require(Path(__file__).absolute() == repo / LAUNCHER, "CURRENT_LAUNCHER_LOCATION")
    # All executable Python definitions above were pinned before import.
    profile = module(repo / PROFILE, "owned_crash_current_profile")
    for key, name in (("inventory", INVENTORY), ("baseline", BASELINE)):
        data, file_id = read(repo / name, 262144)
        require(pin(name, data) == manifest[key], "PUBLISHED_SOURCE_REFERENCE")
        owned[name] = (data, file_id)
    selected = profile.capture_inventory(owned[INVENTORY][0], owned[BASELINE][0])
    require(manifest["sourceRowsSha256"] == selected["sourceRowsSha256"]
        and profile.canonical(manifest["effectsCeiling"]) == profile.canonical(profile.effects())
        and profile.canonical(manifest["storagePolicy"]) == profile.canonical(profile.policy()), "EXACT_PROSPECTIVE_SCOPE")
    parent_rows = profile.validate_parent_controls(manifest["parentControls"], selected)
    require({p["path"] for p in parent_rows} == set(PARENT_CONTROLS), "EXACT_PARENT_CONTROL_SET")
    for row in parent_rows:
        data, file_id = read(repo / row["path"][4:], 131072)
        require(pin(row["path"], data) == row, "PARENT_CONTROL_PIN")
        owned[row["path"][4:]] = (data, file_id)
    # Preserve every application row and all five frozen V3 controls, including
    # old launchers, without invoking the old recipes or their native cases.
    for row in selected["applicationInputs"]:
        data, file_id = read(repo / row["path"][4:])
        require(pin(row["path"], data) == row, "COMPLETE_APPLICATION_SOURCE_PIN")
        owned[row["path"][4:]] = (data, file_id)
    baseline = profile.decode_json(owned[BASELINE][0])
    require(type(baseline["launcherInputs"]) is list and len(baseline["launcherInputs"]) == 5, "FROZEN_V3_CONTROLS")
    for row in baseline["launcherInputs"]:
        data, file_id = read(repo / row["path"], 262144)
        require(pin(row["path"], data) == row, "FROZEN_V3_CONTROL_PIN")
        owned[row["path"]] = (data, file_id)
    def unchanged():
        for name, pair in owned.items():
            require(read(repo / name) == pair, "SOURCE_OR_CONTROL_CHANGED")
    unchanged()
    return manifest, profile, owned, unchanged


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True)
    parser.add_argument("--manifest-sha256", required=True)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--source-only", action="store_true")
    mode.add_argument("--pre-native-plan", action="store_true")
    mode.add_argument("--execute", action="store_true")
    for name in ("packages", "manager", "node", "root", "store-id", "volume", "volume-uuid", "native-selection"):
        parser.add_argument("--" + name)
    parser.add_argument("--previous-root", action="append")
    args = parser.parse_args()
    require(sys.dont_write_bytecode and sys.flags.isolated and sys.flags.no_site, "ISOLATED_NO_SITE_NO_BYTECODE_REQUIRED")
    repo = Path(args.repo)
    manifest, profile, owned, unchanged = source_admission(repo, args.manifest_sha256)
    print(json.dumps(dict(event="RECOVERY_CRASH_SOURCE_ADMITTED", applicationFiles=130, packageFilesDeclared=404,
        packageFilesRead=0, parentControlFiles=5, PythonControlFiles=4, effectsExecuted=False, nativeAuthority="NONE")), flush=True)
    if not args.execute and not args.pre_native_plan:
        return 0
    require(all(getattr(args, name) is not None for name in ("packages", "manager", "node", "root", "volume", "volume_uuid")),
        "EXPLICIT_NATIVE_PLAN_SELECTION")
    packages, manager, node, root, volume = map(Path, (args.packages, args.manager, args.node, args.root, args.volume))
    require(all(p.is_absolute() and os.path.normpath(str(p)) == str(p) for p in (repo, packages, manager, node, root, volume)),
        "ABSOLUTE_NATIVE_PATHS")
    require(re.fullmatch(r"[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}", args.volume_uuid) is not None, "EXPLICIT_VOLUME_UUID")
    require(type(args.previous_root) is list and 1 <= len(args.previous_root) <= 32
        and len(args.previous_root) == len(set(args.previous_root)) and str(root) not in args.previous_root, "ALL_SCOPED_RESERVATIONS")
    legacy = module(repo / LEGACY, "owned_crash_unchanged_capacity")
    gate = module(repo / TLS_GATE, "owned_crash_unchanged_test_tls")
    built = profile.build_profile(str(repo), str(packages), owned[INVENTORY][0], owned[BASELINE][0])
    parent = profile.build_parent_profile(str(repo), owned[INVENTORY][0], owned[BASELINE][0], manifest["parentControls"])
    storage_raw, storage_id = read(manager / "storage.py", 262144)
    cli_raw, cli_id = read(manager / "cli.py", 65536)
    require(sha(storage_raw) == legacy.STORAGE_SHA and sha(cli_raw) == legacy.CLI_SHA, "UNCHANGED_APPROVED_MANAGER")
    node_id = list(legacy.binary(node, legacy.NODE_SHA, os.getuid(), 121304480))
    openssl = Path("/usr/bin/openssl"); openssl_id = list(legacy.binary(openssl, legacy.OPENSSL_SHA, 0))
    def before_native():
        unchanged()
        current = profile.build_profile(str(repo), str(packages), owned[INVENTORY][0], owned[BASELINE][0])
        parent_now = profile.build_parent_profile(str(repo), owned[INVENTORY][0], owned[BASELINE][0], manifest["parentControls"])
        require(current["profileBytes"] == built["profileBytes"] and parent_now["profileBytes"] == parent["profileBytes"],
            "SOURCE_PACKAGE_OR_PARENT_IDENTITY_CHANGED")
        require(identity(node.lstat()) == node_id and identity(openssl.lstat()) == openssl_id
            and identity((manager / "storage.py").lstat()) == storage_id and identity((manager / "cli.py").lstat()) == cli_id,
            "NATIVE_BINARY_OR_MANAGER_CHANGED")
        return legacy.capacity(volume, args.volume_uuid, root, args.previous_root)
    capacity = before_native()
    print(json.dumps(dict(event="RECOVERY_CRASH_READ_ONLY_PRE_NATIVE_PLAN", applicationFiles=130, packageFiles=404,
        sourceBytesReadOnly=built["sourceBytes"], childPrivateProfileBytes=built["profileBytesCount"],
        parentPrivateProfileBytes=parent["profileBytesCount"], existingSourcesRecopied=False, effectsExecuted=False,
        nativeAuthority="NONE", capacity=capacity)), flush=True)
    if not args.execute:
        require(not root.exists() and not root.is_symlink(), "FRESH_UNINITIALIZED_ROOT_REQUIRED")
        return 0
    require(args.native_selection == "one-reviewed-full-p2-crash-pair-v1", "SEPARATE_FINITE_NATIVE_ALLOWANCE_REQUIRED")
    require(args.store_id is not None and root.exists() and not root.is_symlink(), "EXPLICIT_NEW_PRIVATE_STORE")
    storage = legacy.module(manager / "storage.py", "storage")
    unchanged(); before_native()
    store = storage.Store(root, metadata_lock_timeout=5)
    require(store.id == args.store_id and profile.canonical(dataclasses.asdict(store.policy)) == profile.canonical(profile.policy()),
        "EXACT_ONE_PAIR_STORE_POLICY")
    require(len(store._tasks()) == 0, "ONE_PAIR_ALREADY_CONSUMED")
    os.umask(0o077); os.environ.clear()
    os.environ.update(PATH="/usr/bin:/bin", LANG="C", LC_ALL="C", TZ="UTC", NODE_DISABLE_COMPILE_CACHE="1",
        WS_NO_BUFFER_UTIL="1", WS_NO_UTF_8_VALIDATE="1", X402_RECOVERY_CRASH_PARENT_SELECTION="one-owned-crash-pair-source-draft-v1")
    with store.task("zenon-x402-full-issued-p2-crash-pair-once", expected_bytes=QUOTA, quota_bytes=QUOTA) as task:
        # Retain small manifest references/profiles, NOT a copied app/package
        # tree or a second stdout-to-file/ZIP payload. Child files stay HOLD.
        for name in (MANIFEST, INVENTORY):
            raw = owned[name][0]; item = task.write("inputs/" + name, raw)
            task.preserve(item, sha(raw), len(raw))
        for label, planned in (("child", built), ("parent", parent)):
            raw = planned["profileBytes"]; item = task.write("private-" + label + "-profile.json", raw)
            kept = task.preserve(item, planned["profileSha256"], len(raw))
            path = store.object(kept["sha256"], kept["bytes"])
            prefix = "X402_RECOVERY_CRASH_PARENT_PROFILE" if label == "parent" else "X402_RECOVERY_CRASH_PROFILE"
            os.environ.update({prefix + "_PATH": str(path), prefix + "_SHA256": planned["profileSha256"]})
        os.environ["X402_RECOVERY_CRASH_RUN_ID"] = sha((store.id + ":" + task.id + ":" + profile.SOURCE_SEAL).encode())
        task.record("scope.json", dict(effectsCeiling=profile.effects(), sourceRowsSha256=profile.SOURCE_SEAL,
            maximumRuns=1, existingSourcesRecopied=False, nativeOsNetworkSandbox=False))
        config = task.write("tls.cnf", TLS_CONFIG)
        before_native()
        print(json.dumps(dict(event="RECOVERY_CRASH_TEST_TLS_ENTRY", maximumAttempts=1)), flush=True)
        tls = task.run([str(openssl), "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "1",
            "-keyout", "/dev/stdout", "-config", str(config)], cwd=task.scratch, timeout=20, stdout_limit=65536, retain_argv=False)
        task.record("tls-receipt.json", tls)
        require(tls["state"] == "COMPLETE" and tls["output_complete"] is True
            and type(tls["actual_exit"]) is int and tls["actual_exit"] == 0, "TEST_TLS_FAILED_OR_UNKNOWN")
        captured = store.object(tls["stdout"]["sha256"], tls["stdout"]["bytes"]).read_bytes()
        parts = gate.split_test_tls_stdout(captured)
        for name, raw in parts.items():
            path = task.write(name, raw)
            require(read(path, 16384)[0] == raw and stat.S_IMODE(path.lstat().st_mode) == 0o600, "PRIVATE_TEST_TLS_FILE")
        captured = None; parts = None
        before_native()
        print(json.dumps(dict(event="RECOVERY_CRASH_PARENT_COMMAND_ENTRY", parentCommands=1, maximumChildren=2,
            maximumConnections=182, maximumCandidates=65536)), flush=True)
        receipt = task.run([str(node), "--no-addons", "--disallow-code-generation-from-strings", "--disable-proto=throw",
            "--unhandled-rejections=strict", str(repo / PARENT_ENTRY), str(task.scratch)], cwd=repo,
            timeout=120, stdout_limit=profile.PARENT_STDOUT_LIMIT, retain_argv=False)
        task.record("parent-private-capture-receipt.json", receipt)
        unchanged()
        stdout = store.object(receipt["stdout"]["sha256"], receipt["stdout"]["bytes"]).read_bytes()
        stderr = store.object(receipt["stderr"]["sha256"], receipt["stderr"]["bytes"]).read_bytes()
        result = profile.validate_native_capture(stdout, stderr, receipt)
        task.record("selected-result.json", dict(selectedNativeStatus="LOCAL_PAIR_OBSERVED_BEFORE_TASK_CLOSE",
            result=result, stdout=receipt["stdout"], stderr=receipt["stderr"], cleanupStatus="NOT_ESTABLISHED",
            sourceRowsSha256=profile.SOURCE_SEAL, productionQualified=False))
        print(json.dumps(dict(event="RECOVERY_CRASH_SELECTED_PAIR_OBSERVED_BEFORE_CLOSE",
            privateRawOutputPrinted=False, result=result, cleanupStatus="NOT_ESTABLISHED")), flush=True)
        for name in ("tls.cnf", "tls-key.pem", "tls-cert.pem"):
            raw, _ = read(task.scratch / name, 16384)
            task.preserve(task.scratch / name, sha(raw), len(raw))
    closed_raw, _ = read(task.directory / "task.json", 4194304); closed = json.loads(closed_raw)
    require(closed["state"] == "CLOSED" and closed["outcome"] == "SUCCESS", "TASK_CLOSE_FAILED_OR_UNKNOWN")
    cleanup_raw, _ = read(task.evidence / "cleanup.json", 262144)
    print(json.dumps(dict(event="RECOVERY_CRASH_PAIR_TASK_CLOSED", taskState=closed["state"], taskOutcome=closed["outcome"],
        cleanup=json.loads(cleanup_raw), childFilesPreservedNotDisposable=True,
        fullP2Qualified=False, physicalDurabilityQualified=False, productionQualified=False)), flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, TypeError) as problem:
        code = str(problem) if type(problem) is ValueError and re.fullmatch(r"[A-Z0-9_]+", str(problem)) else "REVIEW_PRIVATE_RECEIPTS"
        print(json.dumps(dict(event="RECOVERY_CRASH_REFUSED_OR_FAILED", code=code, errorType=type(problem).__name__)),
            file=sys.stderr, flush=True)
        sys.exit(1)

