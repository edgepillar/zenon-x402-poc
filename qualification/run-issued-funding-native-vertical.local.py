"""SOURCE-ONLY by default: ONE separately approved actual issued-native case.

This is NOT the earlier three-case DP launcher or its allowance. Read-only
source/package planning grants no native authority. --execute requires its own
reviewed exact mode, new private managed root/task and explicit store identity.
The unchanged strict historical reservation admission is retained, not bypassed.
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

# V1/V2 inventories remain immutable historical selections. The current V3
# inventory includes the reviewed grant snapshot field-name budget correction.
MANIFEST = "qualification/issued-funding-post-native-vertical.inputs-v3.json"
PROFILE = "qualification/issued_funding_native_profile.py"
ENTRY = "qualification/issued-funding-post-native-vertical.case.draft.mjs"
PRELOAD = "qualification/issued-funding-post-native-vertical.preload.draft.mjs"
LAUNCHER = "qualification/run-issued-funding-native-vertical.local.py"
READ_BASE = "qualification/dynamic-plasma-full-native-loopback-profile.draft.py"
GATE = "qualification/funding_tls_current_gate.py"
LEGACY = "qualification/run-funding-post-native-loopback-tls.local.py"
CONTROLS = (PROFILE, LAUNCHER, READ_BASE, GATE, LEGACY)
PACKAGE_REFERENCES = ("qualification/dynamic-plasma-original-funding-native-profile.inputs.json",
    "qualification/official-x402-native-https-pending.failed-local-result.json")
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
    return tuple(str(v) for v in (s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode,
                                  s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns))


def read(path, maximum=1048576):
    require(path.is_absolute() and os.path.normpath(path) == str(path), "ABSOLUTE_PATH")
    for candidate in (path, *path.parents):
        require(not candidate.is_symlink(), "SOURCE_LINK")
    before = path.lstat()
    require(stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid() and before.st_nlink == 1
            and 0 <= before.st_size <= maximum, "SOURCE_IDENTITY")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        require(identity(os.fstat(stream.fileno())) == identity(before), "OPEN_IDENTITY")
        raw = stream.read(maximum + 1)
        require(len(raw) == before.st_size and identity(os.fstat(stream.fileno())) == identity(before), "READ_IDENTITY")
    require(identity(path.lstat()) == identity(before), "AFTER_IDENTITY")
    return raw, identity(before)


def pin(name, raw):
    return dict(path=name, bytes=len(raw), LF=raw.count(b"\n"), sha256=hashlib.sha256(raw).hexdigest(),
                gitBlob=hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest())


def module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    require(spec is not None and spec.loader is not None, "MODULE_SPEC")
    value = importlib.util.module_from_spec(spec)
    sys.modules[name] = value
    spec.loader.exec_module(value)
    return value


def source_admission(repo, expected):
    manifest_raw, manifest_id = read(repo / MANIFEST)
    require(hashlib.sha256(manifest_raw).hexdigest() == expected, "EXPLICIT_MANIFEST_PIN")
    manifest = json.loads(manifest_raw)
    require(type(manifest) is dict and type(manifest.get("launcherInputs")) is list
            and [p["path"] for p in manifest["launcherInputs"]] == list(CONTROLS), "CONTROL_SOURCE_SET")
    controls, control_ids = {}, {}
    for row in manifest["launcherInputs"]:
        raw, ident = read(repo / row["path"])
        require(pin(row["path"], raw) == row, "CONTROL_SOURCE_PIN")
        controls[row["path"]] = raw
        control_ids[row["path"]] = ident
    require(Path(__file__).absolute() == repo / LAUNCHER, "LAUNCHER_LOCATION")
    # Pin all Python code BEFORE loading its standard-library-only definitions.
    profile = module(repo / PROFILE, "issued_native_current_profile")
    rows = profile.validate_manifest(manifest)
    for row in manifest["applicationInputs"]:
        name = row["path"][4:]
        raw, _ = read(repo / name)
        require(pin(row["path"], raw) == row, "APPLICATION_SOURCE_PIN")
    references = manifest["packageInputReferences"]
    require(type(references) is list and [p["path"] for p in references] == list(PACKAGE_REFERENCES), "EXACT_PACKAGE_REFERENCES")
    retained_references = []
    for row in references:
        raw, _ = read(repo / row["path"])
        require(pin(row["path"], raw) == row, "IMMUTABLE_PACKAGE_REFERENCE")
        retained_references.append(json.loads(raw))
    package_rows = [p for p in retained_references[0]["inputs"] if p["path"].startswith("packages/")]
    for row in retained_references[1]["sourceGraph"]:
        if row["path"].startswith(("@x402/core/", "zod/")):
            package_rows.append({**row, "path": "packages/" + row["path"]})
    require(profile.canonical(sorted(package_rows, key=lambda p: p["path"])) == profile.canonical(manifest["packageInputs"]),
            "EXACT_IMMUTABLE_PACKAGE_UNION")
    def unchanged():
        again, ident = read(repo / MANIFEST)
        require(again == manifest_raw and ident == manifest_id, "MANIFEST_CHANGED")
        for row in manifest["launcherInputs"]:
            raw, ident = read(repo / row["path"])
            require(raw == controls[row["path"]] and ident == control_ids[row["path"]], "CONTROL_CHANGED")
        for row in manifest["applicationInputs"]:
            raw, _ = read(repo / row["path"][4:])
            require(pin(row["path"], raw) == row, "APPLICATION_CHANGED")
    unchanged()
    return manifest, manifest_raw, controls, profile, unchanged


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True)
    parser.add_argument("--manifest-sha256", required=True)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--source-only", action="store_true")
    mode.add_argument("--pre-native-plan", action="store_true")
    mode.add_argument("--execute", action="store_true")
    parser.add_argument("--case", choices=("clean", "lost-ack"))
    for name in ("packages", "manager", "node", "root", "store-id", "volume", "volume-uuid"):
        parser.add_argument("--" + name)
    parser.add_argument("--previous-root", action="append")
    args = parser.parse_args()
    require(sys.dont_write_bytecode, "BYTECODE_DISABLED_REQUIRED")
    repo = Path(args.repo)
    manifest, manifest_raw, controls, profile, unchanged = source_admission(repo, args.manifest_sha256)
    print(json.dumps(dict(event="ISSUED_NATIVE_SOURCE_ADMITTED", applicationFiles=profile.APP_FILES,
        packageFilesDeclared=profile.PACKAGE_FILES, packageFilesRead=0, effectsExecuted=False)), flush=True)
    if not args.execute and not args.pre_native_plan:
        return 0
    require(args.case is not None and all(getattr(args, n) is not None for n in
        ("packages", "manager", "node", "root", "volume", "volume_uuid")), "EXPLICIT_NATIVE_SELECTIONS")
    packages, manager, node, root, volume = map(Path, (args.packages, args.manager, args.node, args.root, args.volume))
    require(all(p.is_absolute() and os.path.normpath(p) == str(p) for p in
        (repo, packages, manager, node, root, volume)), "ABSOLUTE_NATIVE_PATHS")
    require(re.fullmatch(r"[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}", args.volume_uuid) is not None, "EXPLICIT_VOLUME_UUID")
    require(args.previous_root and len(args.previous_root) == len(set(args.previous_root))
        and len(args.previous_root) <= 32 and str(root) not in args.previous_root, "HISTORICAL_RESERVATION_SCOPE")
    legacy = module(repo / LEGACY, "issued_native_unchanged_capacity")
    gate = module(repo / GATE, "issued_native_unchanged_test_tls")
    built = profile.build_profile(str(repo), str(packages), manifest, args.case)
    storage_raw, storage_id = read(manager / "storage.py", 262144)
    cli_raw, cli_id = read(manager / "cli.py", 65536)
    require(hashlib.sha256(storage_raw).hexdigest() == legacy.STORAGE_SHA
        and hashlib.sha256(cli_raw).hexdigest() == legacy.CLI_SHA, "UNCHANGED_MANAGER_PIN")
    node_id = legacy.binary(node, legacy.NODE_SHA, os.getuid(), 121304480)
    openssl = Path("/usr/bin/openssl")
    openssl_id = legacy.binary(openssl, legacy.OPENSSL_SHA, 0)
    def before_native():
        unchanged()
        current = profile.build_profile(str(repo), str(packages), manifest, args.case)
        require(current["profileBytes"] == built["profileBytes"], "SOURCE_PACKAGE_IDENTITY_CHANGED")
        require(identity(node.lstat()) == node_id and identity(openssl.lstat()) == openssl_id
            and identity((manager / "storage.py").lstat()) == storage_id
            and identity((manager / "cli.py").lstat()) == cli_id, "NATIVE_BINARY_OR_MANAGER_CHANGED")
        # Do NOT ignore unknown entries, omit old reservations, edit the old
        # helper, adopt historical roots or turn a live refusal into admission.
        return legacy.capacity(volume, args.volume_uuid, root, args.previous_root)
    capacity = before_native()
    print(json.dumps(dict(event="ISSUED_NATIVE_PRE_NATIVE_PLAN", case=args.case, capacity=capacity,
        applicationFiles=built["applicationFiles"], packageFiles=built["packageFiles"],
        sourceBytesReadOnly=built["sourceBytes"], privateProfileBytes=built["profileBytesCount"],
        existingSourcesRecopied=False, effectsExecuted=False, nativeAuthority="NONE")), flush=True)
    if not args.execute:
        require(not root.exists() and not root.is_symlink(), "FRESH_UNINITIALIZED_ROOT_REQUIRED")
        return 0
    require(args.store_id is not None and root.exists() and not root.is_symlink(), "EXPLICIT_NEW_STORE")
    storage = legacy.module(manager / "storage.py", "storage")
    unchanged(); before_native()
    store = storage.Store(root, metadata_lock_timeout=5)
    require(store.id == args.store_id and profile.canonical(dataclasses.asdict(store.policy)) == profile.canonical(profile.policy()), "EXACT_NEW_STORE_POLICY")
    require(len(store._tasks()) == 0, "ONE_CASE_ALREADY_CONSUMED")
    os.umask(0o077)
    os.environ.clear()
    os.environ.update(PATH="/usr/bin:/bin", LANG="C", LC_ALL="C", TZ="UTC", NODE_DISABLE_COMPILE_CACHE="1",
        WS_NO_BUFFER_UTIL="1", WS_NO_UTF_8_VALIDATE="1",
        X402_ISSUED_NATIVE_VERTICAL_SELECTION="current-native-issued-post-source-draft-v1",
        X402_ISSUED_NATIVE_VERTICAL_RUN_SCOPE="one-reviewed-native-issued-case-v1", X402_ISSUED_NATIVE_VERTICAL_MODE=args.case)
    with store.task("zenon-x402-issued-native-vertical-once", expected_bytes=QUOTA, quota_bytes=QUOTA) as task:
        # Keep the complete source seal and published inputs. Do not create
        # another multi-megabyte SDK/application copy merely to run this case.
        selected = {**controls, MANIFEST: manifest_raw}
        for name in (ENTRY, PRELOAD):
            selected[name] = read(repo / name)[0]
        for name, raw in selected.items():
            path = task.write("inputs/" + name, raw)
            task.preserve(path, hashlib.sha256(raw).hexdigest(), len(raw))
        path = task.write("private-native-profile.json", built["profileBytes"])
        item = task.preserve(path, built["profileSha256"], len(built["profileBytes"]))
        path = store.object(item["sha256"], item["bytes"])
        os.environ.update(X402_ISSUED_NATIVE_VERTICAL_PROFILE_PATH=str(path), X402_ISSUED_NATIVE_VERTICAL_PROFILE_SHA256=built["profileSha256"])
        task.record("scope.json", dict(case=args.case, maximumRuns=1, effectsCeiling=profile.effects(),
            sourceRowsSha256=manifest["sourceRowsSha256"], existingSourcesRecopied=False, nativeOsNetworkSandbox=False))
        config = task.write("tls.cnf", TLS_CONFIG)
        before_native()
        print(json.dumps(dict(event="ISSUED_NATIVE_OPENSSL_ENTRY", case=args.case, attemptsEntered=1)), flush=True)
        tls = task.run([str(openssl), "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "1",
            "-keyout", "/dev/stdout", "-config", str(config)], cwd=task.scratch, timeout=20, stdout_limit=65536, retain_argv=False)
        task.record("tls-generation-receipt.json", tls)
        require(tls["state"] == "COMPLETE" and tls["output_complete"] is True and tls["actual_exit"] == 0, "TEST_TLS_FAILED_OR_UNKNOWN")
        captured = store.object(tls["stdout"]["sha256"], tls["stdout"]["bytes"]).read_bytes()
        parts = gate.split_test_tls_stdout(captured)
        for name, raw in parts.items():
            path = task.write(name, raw)
            require(read(path, 16384)[0] == raw and stat.S_IMODE(path.lstat().st_mode) == 0o600, "TEST_TLS_PRIVATE_INPUT")
        captured = None; parts = None
        before_native()
        print(json.dumps(dict(event="ISSUED_NATIVE_NODE_ENTRY", case=args.case, maximumConnections=182, nodeChildren=0)), flush=True)
        argv = [str(node), "--no-addons", "--disallow-code-generation-from-strings", "--disable-proto=throw",
            "--unhandled-rejections=strict", "--test-reporter=tap", "--import=" + str(repo / PRELOAD), str(repo / ENTRY), str(task.scratch)]
        receipt = task.run(argv, cwd=repo, timeout=90, stdout_limit=65536, retain_argv=False)
        task.record("native-receipt.json", receipt)
        print(json.dumps(dict(event="ISSUED_NATIVE_PRIVATE_CAPTURE_RETAINED", actualExit=receipt["actual_exit"],
            outputComplete=receipt["output_complete"], stdout=receipt["stdout"], stderr=receipt["stderr"], rawOutputPrinted=False)), flush=True)
        unchanged()
        stdout = store.object(receipt["stdout"]["sha256"], receipt["stdout"]["bytes"]).read_bytes()
        stderr = store.object(receipt["stderr"]["sha256"], receipt["stderr"]["bytes"]).read_bytes()
        result = profile.validate_native_capture(stdout, stderr, receipt, args.case, manifest["sourceRowsSha256"], manifest["sourceBytes"])
        task.record("selected-result.json", dict(selectedNativeStatus="PASS", case=args.case, result=result,
            sourceRowsSha256=manifest["sourceRowsSha256"], cleanupStatus="SEPARATE_PENDING_TASK_CLOSE", productionQualified=False))
        print(json.dumps(dict(event="ISSUED_NATIVE_SELECTED_PASS_BEFORE_TASK_CLOSE", case=args.case,
            expectedHeldV6=args.case == "lost-ack", cleanupStatus="NOT_ESTABLISHED", productionQualified=False)), flush=True)
        for name in ("tls.cnf", "tls-key.pem", "tls-cert.pem"):
            raw, _ = read(task.scratch / name, 16384)
            task.preserve(task.scratch / name, hashlib.sha256(raw).hexdigest(), len(raw))
    closed_raw, _ = read(task.directory / "task.json", 4194304)
    closed = json.loads(closed_raw)
    require(closed["state"] == "CLOSED", "TASK_CLOSE_UNKNOWN")
    cleanup_raw, _ = read(task.evidence / "cleanup.json", 262144)
    print(json.dumps(dict(event="ISSUED_NATIVE_CAPTURE_COMPLETE", selectedNativeStatus="PASS", case=args.case,
        taskState=closed["state"], taskOutcome=closed["outcome"], cleanup=json.loads(cleanup_raw),
        expectedHeldV6=args.case == "lost-ack", childFilesPreservedNotDisposable=True, productionQualified=False)), flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, TypeError) as problem:
        code = str(problem) if type(problem) is ValueError and re.fullmatch(r"[A-Z0-9_]+", str(problem)) else "REVIEW_PRIVATE_RECEIPTS"
        print(json.dumps(dict(event="ISSUED_NATIVE_REFUSED_OR_FAILED", code=code, errorType=type(problem).__name__)), file=sys.stderr, flush=True)
        sys.exit(1)
