"""V3 managed P2 pair with the real, full-graph diagnostic seed.

SOURCE-ONLY by default. Both previous native one-shot allowances are consumed.
--execute requires a NEW explicit finite approval and a fresh owned task/root.
The unchanged V2 source admission is called only to preserve its complete
inherited source/control chain; its native recipe is never invoked. Current
profiles use the genuine V2 child namespace, not a relabeled legacy profile.
This cooperative launcher is not an OS/network sandbox.
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

MANIFEST = "qualification/recovery-crash-pair-v3.launch-inputs.json"
LAUNCHER = "qualification/run-recovery-crash-pair-v3.local.py"
PROFILE = "qualification/recovery_crash_diagnostic_native_profile.py"
EXTENSION = "qualification/recovery-crash-full-graph-v2.source-inputs.json"
FROZEN = "qualification/run-recovery-crash-pair-v2.local.py"
FROZEN_MANIFEST = "qualification/recovery-crash-pair-v2.launch-inputs.json"
FROZEN_MANIFEST_SHA = "d180e3b0f65e48ac1df8ff38003fd71acab0346b93602b60a38081d56175bbfd"
FROZEN_LAUNCHER_SHA = "7fd18925308d2cdb0342afbea05b7a2d854bdfc17f288c487bdbcd5692659904"
ENTRY = "qualification/recovery-crash-pair-v3.entry.draft.mjs"
SUPERVISOR = "qualification/recovery-crash-cutpoint-supervisor-v3.draft.mjs"
HELPER = "src/native-private-directory-identity.js"
PARENT_NAMES = sorted("app/" + p for p in (ENTRY, SUPERVISOR, HELPER, "package.json",
    "qualification/recovery-crash-cutpoint-protocol-v2.js", "src/service-credit-pilot-original-payment-checkpoint.js"))
KIND = "ONE_FULL_ISSUED_P2_DIAGNOSTIC_CRASH_PAIR_V3_LAUNCH_SOURCE_NOT_A_RESULT"
PARENT_KIND = "OFFICIAL_ISSUED_CRASH_PAIR_PARENT_CONTROL_V3"
QUOTA = 4194304


def require(value, code):
    if not value:
        raise ValueError(code)


def identity(s):
    return [str(v) for v in (s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode,
        s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns)]


def read(path, maximum=262144):
    require(path.is_absolute() and os.path.normpath(str(path)) == str(path), "ABSOLUTE_SOURCE_PATH")
    for at in (path, *path.parents):
        require(not at.is_symlink(), "SOURCE_LINK")
    before = path.lstat(); ident = identity(before)
    require(stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid() and before.st_nlink == 1
        and 0 <= before.st_size <= maximum, "SOURCE_IDENTITY")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        require(identity(os.fstat(stream.fileno())) == ident, "SOURCE_OPEN_IDENTITY")
        raw = stream.read(maximum + 1)
        require(len(raw) == before.st_size and identity(os.fstat(stream.fileno())) == ident, "SOURCE_READ_IDENTITY")
    require(identity(path.lstat()) == ident, "SOURCE_AFTER_IDENTITY")
    return raw, ident


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def pin(name, raw):
    return dict(path=name, bytes=len(raw), LF=raw.count(b"\n"), sha256=sha(raw),
        gitBlob=hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest())


def module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    require(spec is not None and spec.loader is not None, "PINNED_MODULE_SPEC")
    value = importlib.util.module_from_spec(spec); sys.modules[name] = value
    spec.loader.exec_module(value)
    return value


def source_admission(repo, digest):
    require(type(digest) is str and re.fullmatch(r"[0-9a-f]{64}", digest), "EXPLICIT_MANIFEST_PIN")
    raw, ident = read(repo / MANIFEST, 65536); require(sha(raw) == digest, "V3_MANIFEST_PIN")
    manifest = json.loads(raw)
    require(type(manifest) is dict and set(manifest) == {"kind", "version", "sourceParent", "frozenLaunch", "extension",
        "pythonControls", "parentControls", "effectsCeiling", "storagePolicy", "sourceRowsSha256",
        "sourceTransforms", "nativeBuiltinAliases", "nativeExecuted", "nativeOsNetworkSandbox"}, "V3_MANIFEST_FIELDS")
    require(manifest["kind"] == KIND and type(manifest["version"]) is int and manifest["version"] == 3
        and type(manifest["sourceParent"]) is str and re.fullmatch(r"[0-9a-f]{40}", manifest["sourceParent"]), "V3_SOURCE_KIND")
    require(all(manifest[k] is False for k in ("sourceTransforms", "nativeBuiltinAliases", "nativeExecuted", "nativeOsNetworkSandbox")),
        "NO_NATIVE_CLAIM")
    owned = {MANIFEST: (raw, ident)}
    frozen_raw, frozen_id = read(repo / FROZEN_MANIFEST)
    require(sha(frozen_raw) == FROZEN_MANIFEST_SHA and pin(FROZEN_MANIFEST, frozen_raw) == manifest["frozenLaunch"], "FROZEN_V2_LAUNCH_PIN")
    controls = manifest["pythonControls"]
    require(type(controls) is list and all(type(p) is dict for p in controls)
        and [p.get("path") for p in controls] == [FROZEN, PROFILE, LAUNCHER], "V3_PYTHON_CONTROLS")
    for row in controls:
        data, file_id = read(repo / row["path"]); require(pin(row["path"], data) == row, "V3_PYTHON_PIN")
        owned[row["path"]] = (data, file_id)
    require(sha(owned[FROZEN][0]) == FROZEN_LAUNCHER_SHA and Path(__file__).absolute() == repo / LAUNCHER, "EXACT_V3_LAUNCHERS")
    previous = module(repo / FROZEN, "owned_committed_pair_v2_source_admission")
    frozen, old, base, inherited, old_unchanged = previous.source_admission(repo, FROZEN_MANIFEST_SHA)
    profile = module(repo / PROFILE, "owned_committed_pair_v3_diagnostic_profile")
    extension_raw, extension_id = read(repo / EXTENSION, 65536)
    require(pin(EXTENSION, extension_raw) == manifest["extension"], "V3_EXTENSION_PIN")
    selected = profile.capture_extension(base, extension_raw, inherited[old.INVENTORY][0], inherited[old.BASELINE][0])
    require(base.canonical(manifest["effectsCeiling"]) == base.canonical(frozen["effectsCeiling"])
        and base.canonical(manifest["storagePolicy"]) == base.canonical(frozen["storagePolicy"])
        and manifest["sourceRowsSha256"] == selected["sourceRowsSha256"], "V3_FINITE_SCOPE_AND_FULL_GRAPH")
    rows = base._rows(sorted(manifest["parentControls"], key=lambda r: r["path"]), "app/", 6)
    require(sorted(rows) == PARENT_NAMES, "EXACT_SIX_V3_PARENT_INPUTS")
    original_rows = {r["path"]: r for r in selected["rows"] + selected["controlInputs"]}
    for name, row in rows.items():
        if name not in ("app/" + ENTRY, "app/" + SUPERVISOR, "app/" + HELPER):
            require(row == original_rows[name], "UNCHANGED_V3_PARENT_DATA_INPUT")
        data, file_id = read(repo / name[4:]); require(pin(name, data) == row, "V3_PARENT_PIN")
        owned[name[4:]] = (data, file_id)
    owned.update(inherited)
    for row in selected["rows"]:
        if row["path"].startswith("app/"):
            name = row["path"][4:]
            pair = owned.get(name) or read(repo / name)
            require(pin(row["path"], pair[0]) == row, "V3_COMPLETE_APP_SOURCE_PIN")
            owned[name] = pair
    owned[FROZEN_MANIFEST] = (frozen_raw, frozen_id)
    owned[EXTENSION] = (extension_raw, extension_id)
    def unchanged():
        old_unchanged()
        for name, value in owned.items():
            require(read(repo / name) == value, "V3_SOURCE_CHANGED")
    unchanged()
    return manifest, old, base, profile, owned, unchanged


def build_parent(repo, manifest, old, base, profile, owned):
    selected = profile.capture_extension(base, owned[EXTENSION][0], owned[old.INVENTORY][0], owned[old.BASELINE][0])
    rows = sorted(manifest["parentControls"], key=lambda r: r["path"])
    captures = []
    for row in rows:
        raw, ident = read(repo / row["path"][4:]); require(pin(row["path"], raw) == row, "ACTUAL_V3_PARENT_INPUT")
        captures.append(dict(logicalPath=row["path"], url=base.source_url(str(repo), row["path"][4:]),
            bytes=row["bytes"], LF=row["LF"], sha256=row["sha256"], gitBlob=row["gitBlob"], identity=ident))
    inputs, indexed = base._captured_inputs(rows, captures, str(repo), str(repo))
    child = {r["path"]: r for r in selected["rows"]}
    value = dict(profileVersion=1, profileKind=PARENT_KIND, entryURL=indexed["app/" + ENTRY]["url"],
        inputs=inputs, sourceRowsSha256=profile.SOURCE_SEAL, childEntrySha256=child[profile.ENTRY]["sha256"],
        childPreloadSha256=child[profile.PRELOAD]["sha256"])
    raw = base.canonical(value) + b"\n"; require(len(raw) <= 32768, "V3_PARENT_PROFILE_BOUND")
    return dict(profileBytes=raw, profileSha256=sha(raw), profileBytesCount=len(raw))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("repo", "manifest-sha256"):
        parser.add_argument("--" + name, required=True)
    mode = parser.add_mutually_exclusive_group()
    for name in ("source-only", "pre-native-plan", "execute"):
        mode.add_argument("--" + name, action="store_true")
    for name in ("packages", "manager", "node", "root", "store-id", "volume", "volume-uuid", "native-selection"):
        parser.add_argument("--" + name)
    parser.add_argument("--previous-root", action="append")
    args = parser.parse_args()
    require(sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode, "ISOLATED_NO_BYTECODE_REQUIRED")
    repo = Path(args.repo)
    manifest, old, base, profile, owned, unchanged = source_admission(repo, args.manifest_sha256)
    parent = build_parent(repo, manifest, old, base, profile, owned)
    print(json.dumps(dict(event="P2_V3_SOURCE_ADMITTED_NOT_NATIVE", fullChildApplicationFiles=134,
        packageFilesDeclared=404, parentControlFiles=6, parentPrivateProfileBytes=parent["profileBytesCount"],
        frozenV1Preserved=True, frozenV2Preserved=True, effectsExecuted=False)), flush=True)
    if not args.execute and not args.pre_native_plan:
        if args.packages is not None:
            built = profile.build_profile(base, str(repo), args.packages, owned[EXTENSION][0],
                owned[old.INVENTORY][0], owned[old.BASELINE][0])
            unchanged()
            print(json.dumps(dict(event="P2_V3_READ_ONLY_FULL_PROFILE_BUILT_NOT_NATIVE",
                applicationFiles=134, packageFilesRead=404, sourceRowsSha256=profile.SOURCE_SEAL,
                sourceBytesReadOnly=built["sourceBytes"], childPrivateProfileBytes=built["profileBytesCount"],
                existingSourcesRecopied=False, effectsExecuted=False, nativeAuthority="NONE")), flush=True)
        return 0
    require(all(getattr(args, k) is not None for k in ("packages", "manager", "node", "root", "volume", "volume_uuid")), "EXPLICIT_NATIVE_PATHS")
    packages, manager, node, root, volume = map(Path, (args.packages, args.manager, args.node, args.root, args.volume))
    require(all(p.is_absolute() and os.path.normpath(str(p)) == str(p) for p in (repo, packages, manager, node, root, volume)), "NORMALIZED_NATIVE_PATHS")
    require(re.fullmatch(r"[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}", args.volume_uuid), "VOLUME_UUID")
    require(type(args.previous_root) is list and 1 <= len(args.previous_root) <= 32
        and len(args.previous_root) == len(set(args.previous_root)) and str(root) not in args.previous_root, "SCOPED_RESERVATIONS")
    legacy = old.module(repo / old.LEGACY, "owned_pair_v3_unchanged_capacity")
    gate = old.module(repo / old.TLS_GATE, "owned_pair_v3_unchanged_tls")
    built = profile.build_profile(base, str(repo), str(packages), owned[EXTENSION][0], owned[old.INVENTORY][0], owned[old.BASELINE][0])
    storage_raw, storage_id = read(manager / "storage.py"); cli_raw, cli_id = read(manager / "cli.py", 65536)
    require(sha(storage_raw) == legacy.STORAGE_SHA and sha(cli_raw) == legacy.CLI_SHA, "UNCHANGED_APPROVED_MANAGER")
    node_id = list(legacy.binary(node, legacy.NODE_SHA, os.getuid(), 121304480))
    openssl = Path("/usr/bin/openssl"); openssl_id = list(legacy.binary(openssl, legacy.OPENSSL_SHA, 0))
    def before_native():
        unchanged()
        now = profile.build_profile(base, str(repo), str(packages), owned[EXTENSION][0], owned[old.INVENTORY][0], owned[old.BASELINE][0])
        require(now["profileBytes"] == built["profileBytes"] and build_parent(repo, manifest, old, base, profile, owned) == parent, "V3_PROFILE_CHANGED")
        require(identity(node.lstat()) == node_id and identity(openssl.lstat()) == openssl_id
            and identity((manager / "storage.py").lstat()) == storage_id and identity((manager / "cli.py").lstat()) == cli_id, "V3_TOOL_CHANGED")
        return legacy.capacity(volume, args.volume_uuid, root, args.previous_root)
    capacity = before_native()
    print(json.dumps(dict(event="P2_V3_READ_ONLY_PRE_NATIVE_PLAN", capacity=capacity, childProfileBytes=built["profileBytesCount"],
        parentProfileBytes=parent["profileBytesCount"], sourceBytesReadOnly=built["sourceBytes"], existingSourcesRecopied=False)), flush=True)
    if not args.execute:
        require(not root.exists() and not root.is_symlink(), "NEW_UNINITIALIZED_ROOT_REQUIRED")
        return 0
    require(args.native_selection == "one-reviewed-full-p2-diagnostic-crash-pair-v3" and args.store_id is not None, "NEW_V3_FINITE_APPROVAL_REQUIRED")
    storage = old.module(manager / "storage.py", "storage"); unchanged(); before_native()
    store = storage.Store(root, metadata_lock_timeout=5)
    require(store.id == args.store_id and base.canonical(dataclasses.asdict(store.policy)) == base.canonical(base.policy())
        and not store._tasks(), "EXACT_UNUSED_V3_STORE")
    os.umask(0o077); os.environ.clear()
    os.environ.update(PATH="/usr/bin:/bin", LANG="C", LC_ALL="C", TZ="UTC", NODE_DISABLE_COMPILE_CACHE="1",
        WS_NO_BUFFER_UTIL="1", WS_NO_UTF_8_VALIDATE="1", X402_RECOVERY_CRASH_PARENT_SELECTION="one-owned-crash-pair-v3-source-draft-v1")
    with store.task("zenon-x402-full-issued-p2-crash-pair-v3-once", expected_bytes=QUOTA, quota_bytes=QUOTA) as task:
        for name in (MANIFEST, FROZEN_MANIFEST, EXTENSION, old.INVENTORY):
            raw = owned[name][0]; path = task.write("inputs/" + name, raw); task.preserve(path, sha(raw), len(raw))
        for label, planned in (("child", built), ("parent", parent)):
            raw = planned["profileBytes"]; path = task.write("private-" + label + "-profile.json", raw)
            kept = task.preserve(path, planned["profileSha256"], len(raw))
            selected = store.object(kept["sha256"], kept["bytes"])
            prefix = "X402_RECOVERY_CRASH_PARENT_PROFILE" if label == "parent" else "X402_RECOVERY_CRASH_PROFILE"
            os.environ.update({prefix + "_PATH": str(selected), prefix + "_SHA256": planned["profileSha256"]})
        os.environ["X402_RECOVERY_CRASH_RUN_ID"] = sha((store.id + ":" + task.id + ":" + profile.SOURCE_SEAL).encode())
        task.record("scope.json", dict(effectsCeiling=base.effects(), sourceRowsSha256=profile.SOURCE_SEAL,
            supervisorVersion=3, frozenAttemptReused=False, maximumRuns=1, nativeOsNetworkSandbox=False))
        config = task.write("tls.cnf", old.TLS_CONFIG); before_native()
        tls = task.run([str(openssl), "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "1",
            "-keyout", "/dev/stdout", "-config", str(config)], cwd=task.scratch, timeout=20, stdout_limit=65536, retain_argv=False)
        task.record("tls-receipt.json", tls)
        require(tls["state"] == "COMPLETE" and tls["output_complete"] is True and type(tls["actual_exit"]) is int
            and tls["actual_exit"] == 0, "V3_TEST_TLS_FAILED_OR_UNKNOWN")
        raw = store.object(tls["stdout"]["sha256"], tls["stdout"]["bytes"]).read_bytes()
        parts = gate.split_test_tls_stdout(raw)
        for name, value in parts.items():
            path = task.write(name, value); require(read(path, 16384)[0] == value
                and stat.S_IMODE(path.lstat().st_mode) == 0o600, "PRIVATE_V3_TEST_TLS_FILE")
        raw = None; parts = None; before_native()
        receipt = task.run([str(node), "--no-addons", "--disallow-code-generation-from-strings", "--disable-proto=throw",
            "--unhandled-rejections=strict", str(repo / ENTRY), str(task.scratch)], cwd=repo,
            timeout=120, stdout_limit=profile.PARENT_STDOUT_LIMIT, retain_argv=False)
        task.record("parent-private-capture-receipt.json", receipt); unchanged()
        stdout = store.object(receipt["stdout"]["sha256"], receipt["stdout"]["bytes"]).read_bytes()
        stderr = store.object(receipt["stderr"]["sha256"], receipt["stderr"]["bytes"]).read_bytes()
        diagnostic = profile.observe_failed_capture(base, stdout, stderr, receipt)
        if diagnostic is not None:
            task.record("operation-diagnostic.json", diagnostic)
        result = profile.validate_native_capture(base, stdout, stderr, receipt)
        task.record("selected-result.json", dict(result=result, supervisorVersion=3, cleanupStatus="NOT_ESTABLISHED",
            sourceRowsSha256=profile.SOURCE_SEAL, productionQualified=False))
        print(json.dumps(dict(event="P2_V3_SELECTED_PAIR_OBSERVED_BEFORE_TASK_CLOSE", result=result, cleanupStatus="NOT_ESTABLISHED")), flush=True)
        for name in ("tls.cnf", "tls-key.pem", "tls-cert.pem"):
            raw, _ = read(task.scratch / name, 16384); task.preserve(task.scratch / name, sha(raw), len(raw))
    closed = json.loads(read(task.directory / "task.json")[0])
    require(closed["state"] == "CLOSED" and closed["outcome"] == "SUCCESS", "V3_TASK_CLOSE_FAILED_OR_UNKNOWN")
    cleanup = json.loads(read(task.evidence / "cleanup.json")[0])
    print(json.dumps(dict(event="P2_V3_TASK_CLOSED", state=closed["state"], outcome=closed["outcome"], cleanup=cleanup,
        childFilesPreservedNotDisposable=True, fullP2Qualified=False, physicalDurabilityQualified=False, productionQualified=False)), flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, TypeError) as problem:
        code = str(problem) if type(problem) is ValueError and re.fullmatch(r"[A-Z0-9_]+", str(problem)) else "REVIEW_PRIVATE_RECEIPTS"
        print(json.dumps(dict(event="P2_V3_REFUSED_OR_FAILED", code=code, errorType=type(problem).__name__)), file=sys.stderr, flush=True)
        sys.exit(1)
