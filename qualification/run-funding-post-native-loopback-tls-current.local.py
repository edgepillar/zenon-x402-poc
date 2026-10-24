"""One current funding-TLS selection. Default is SOURCE-ONLY, not permission.

--pre-native-plan is read-only admission; --execute requires separate human
scope approval, one explicitly selected new private store and its exact ID.
Neither a flag, manifest nor an empty store is itself authorization.
No implicit retry, historical rebinding, installer or old-root cleanup.
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

MANIFEST = "qualification/funding-post-native-loopback-tls-current.inputs.json"
GATE = "qualification/funding_tls_current_gate.py"
LEGACY = "qualification/run-funding-post-native-loopback-tls.local.py"
LAUNCHER = "qualification/run-funding-post-native-loopback-tls-current.local.py"
TLS_CONFIG = b"""RANDFILE = /dev/null
[req]
prompt = no
distinguished_name = dn
x509_extensions = ext
[dn]
CN = 127.0.0.1
[ext]
subjectAltName = @alt_names
basicConstraints = critical,CA:TRUE
keyUsage = critical,digitalSignature,keyEncipherment,keyCertSign
extendedKeyUsage = serverAuth
[alt_names]
IP.1 = 127.0.0.1
"""


def require(value, code):
    if not value:
        raise ValueError(code)


def identity(s):
    return tuple(str(v) for v in (s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode,
        s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns))


def read(path, cap=262144):
    require(path.is_absolute() and str(path) == os.path.normpath(path), "ABSOLUTE_INPUT")
    for ancestor in (path, *path.parents):
        require(not ancestor.is_symlink(), "INPUT_LINK")
    before = path.lstat()
    require(stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid()
        and before.st_nlink == 1 and 0 <= before.st_size <= cap, "OWNED_INPUT")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        require(identity(os.fstat(stream.fileno())) == identity(before), "INPUT_OPEN_IDENTITY")
        raw = stream.read(cap + 1)
        require(len(raw) == before.st_size and identity(os.fstat(stream.fileno())) == identity(before), "INPUT_READ_IDENTITY")
    require(identity(path.lstat()) == identity(before), "INPUT_AFTER_IDENTITY")
    return raw, identity(before)


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    require(spec is not None and spec.loader is not None, "MODULE_SPEC")
    value = importlib.util.module_from_spec(spec)
    sys.modules[name] = value
    spec.loader.exec_module(value)
    return value


def source_admission(repo, expected_manifest):
    raw, manifest_id = read(repo / MANIFEST)
    require(re.fullmatch(r"[0-9a-f]{64}", expected_manifest) is not None
        and hashlib.sha256(raw).hexdigest() == expected_manifest, "MANIFEST_DIGEST")
    manifest = json.loads(raw)
    rows = manifest.get("inputs")
    require(type(rows) is list and 1 <= len(rows) <= 16, "INPUT_COUNT")
    sources, identities = {}, {}
    for row in rows:
        require(type(row) is dict and type(row.get("path")) is str, "INPUT_ROW")
        name = row["path"]
        require(re.fullmatch(r"[A-Za-z0-9_./-]{1,200}", name) is not None
            and not name.startswith("/") and ".." not in Path(name).parts
            and name not in sources, "INPUT_NAME")
        content, file_id = read(repo / name)
        require(type(row.get("sha256")) is str and hashlib.sha256(content).hexdigest() == row["sha256"], "BOOTSTRAP_SOURCE_PIN")
        sources[name] = content; identities[name] = file_id
    require(GATE in sources and LEGACY in sources and LAUNCHER in sources, "BOOTSTRAP_FIXED_HELPERS")
    require(Path(__file__).absolute() == repo / LAUNCHER
        and identity((repo / LAUNCHER).lstat()) == identities[LAUNCHER], "ACTUAL_LAUNCHER_IDENTITY")
    gate = load(repo / GATE, "funding_tls_current_gate")
    require(identity((repo / GATE).lstat()) == identities[GATE], "GATE_CHANGED")
    summary = gate.validate_manifest(manifest, sources)

    def unchanged():
        require(identity((repo / MANIFEST).lstat()) == manifest_id, "MANIFEST_CHANGED")
        for name, content in sources.items():
            after, after_id = read(repo / name)
            require(after == content and after_id == identities[name], "SOURCE_CHANGED")
        gate.validate_manifest(manifest, sources)

    unchanged()
    return gate, manifest, raw, sources, summary, unchanged


def native_admission(args, repo, gate, unchanged):
    for name in ("manager", "node", "root", "volume", "volume_uuid"):
        require(getattr(args, name) is not None, "NATIVE_ARGUMENT_REQUIRED")
    manager, node, root, volume = map(Path, (args.manager, args.node, args.root, args.volume))
    require(all(path.is_absolute() and str(path) == os.path.normpath(path)
        for path in (manager, node, root, volume)), "NATIVE_PATH_SELECTION")
    require(re.fullmatch(r"[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}", args.volume_uuid), "VOLUME_UUID_SELECTION")
    require(args.previous_root and len(args.previous_root) == len(set(args.previous_root))
        and len(args.previous_root) <= 16 and str(root) not in args.previous_root, "RESERVATION_SCOPE")
    unchanged()
    # Reuse unchanged, source-pinned read/binary/capacity helpers only. Do not
    # invoke the old two-attempt main, alter its globals or its source file.
    legacy = load(repo / LEGACY, "funding_tls_historical_read_helpers")
    unchanged()
    storage_raw, storage_id = legacy.read(manager / "storage.py", 262144)
    cli_raw, cli_id = legacy.read(manager / "cli.py", 65536)
    require(legacy.sha(storage_raw) == legacy.STORAGE_SHA and legacy.sha(cli_raw) == legacy.CLI_SHA, "MANAGER_PIN")
    node_id = legacy.binary(node, legacy.NODE_SHA, os.getuid(), 121304480)
    openssl = Path("/usr/bin/openssl")
    openssl_id = legacy.binary(openssl, legacy.OPENSSL_SHA, 0)
    available = legacy.capacity(volume, args.volume_uuid, root, args.previous_root)

    def pre_native():
        unchanged()
        require(identity(node.lstat()) == node_id and identity(openssl.lstat()) == openssl_id
            and identity((manager / "storage.py").lstat()) == storage_id
            and identity((manager / "cli.py").lstat()) == cli_id, "NATIVE_IDENTITY_CHANGED")
        return legacy.capacity(volume, args.volume_uuid, root, args.previous_root)

    return legacy, manager, node, root, openssl, available, pre_native


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True); parser.add_argument("--manifest-sha256", required=True)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--source-only", action="store_true")
    modes.add_argument("--pre-native-plan", action="store_true")
    modes.add_argument("--execute", action="store_true")
    for name in ("manager", "node", "root", "store-id", "volume", "volume-uuid"):
        parser.add_argument("--" + name)
    parser.add_argument("--previous-root", action="append")
    args = parser.parse_args()
    require(sys.dont_write_bytecode, "BYTECODE_DISABLED_REQUIRED")
    repo = Path(args.repo)
    require(repo.is_absolute() and str(repo) == os.path.normpath(repo), "REPO_SELECTION")
    gate, manifest, manifest_raw, sources, summary, unchanged = source_admission(repo, args.manifest_sha256)
    print(json.dumps(dict(event="CURRENT_FUNDING_TLS_SOURCE_ADMITTED", **summary)), flush=True)
    if not args.execute and not args.pre_native_plan:
        return 0
    legacy, manager, node, root, openssl, available, pre_native = native_admission(args, repo, gate, unchanged)
    print(json.dumps(dict(event="CURRENT_FUNDING_TLS_PRE_NATIVE_PLAN", capacity=available,
        maximumRuns=1, nativeCommandsExecuted=0, authority="NONE")), flush=True)
    if not args.execute:
        require(not root.exists() and not root.is_symlink(), "FRESH_UNINITIALIZED_ROOT_REQUIRED")
        return 0
    require(args.store_id is not None and root.exists() and not root.is_symlink(), "EXPLICIT_NEW_STORE_REQUIRED")
    storage = legacy.module(manager / "storage.py", "storage")
    unchanged(); pre_native()
    store = storage.Store(root, metadata_lock_timeout=5)
    require(store.id == args.store_id
        and gate.canonical(dataclasses.asdict(store.policy)) == gate.canonical(gate.policy()), "EXACT_NEW_STORE_POLICY")
    require(len(store._tasks()) == 0, "ONE_SHOT_ALREADY_CONSUMED")
    os.umask(0o077)
    os.environ.clear()
    os.environ.update(PATH="/usr/bin:/bin", LANG="C", LC_ALL="C", TZ="UTC",
        NODE_DISABLE_COMPILE_CACHE="1", X402_FUNDING_TLS_SELECTION="four-current-loopback-cases-only",
        X402_FUNDING_TLS_NATIVE_MODE="reviewed-current-one-shot-tls")
    with store.task("zenon-x402-current-funding-tls-once", expected_bytes=4194304, quota_bytes=4194304) as task:
        for name, raw in [*sources.items(), (MANIFEST, manifest_raw)]:
            path = task.write("inputs/" + name, raw)
            task.preserve(path, legacy.sha(raw), len(raw))
        task.record("scope.json", dict(maximumRuns=1, effectsCeiling=gate.ceiling(),
            sourceRowsSha256=manifest["sourceRowsSha256"], nativeOsNetworkSandbox=False))
        config = task.write("tls.cnf", TLS_CONFIG)
        pre_native()
        certificate = task.run([str(openssl), "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256",
            "-days", "1", "-keyout", "/dev/stdout", "-config", str(config)], cwd=task.scratch,
            timeout=20, stdout_limit=65536, retain_argv=False)
        task.record("tls-generation-receipt.json", certificate)
        require(certificate["state"] == "COMPLETE" and certificate["output_complete"]
            and certificate["actual_exit"] == 0, "TEST_TLS_GENERATION_FAILED_OR_UNKNOWN")
        # This capture contains a NEW TEST private key. Never print/export it.
        captured = store.object(certificate["stdout"]["sha256"], certificate["stdout"]["bytes"]).read_bytes()
        components = gate.split_test_tls_stdout(captured)
        for name, raw in components.items():
            path = task.write(name, raw)  # registered, mode 0600, quota charged
            stored, _ = read(path, 16384)
            require(stored == raw and stat.S_IMODE(path.lstat().st_mode) == 0o600, "PRIVATE_TEST_TLS_INPUT")
        captured = None; components = None
        pre_native()
        argv = [str(node), "--permission", "--no-addons", "--disallow-code-generation-from-strings",
            "--disable-proto=throw", "--unhandled-rejections=strict", "--test-reporter=tap"]
        for name in ("package.json", *gate.APPLICATION, gate.ENTRY, gate.BODY):
            argv.append("--allow-fs-read=" + str(repo / name))
        argv.extend(["--allow-fs-read=" + str(task.scratch), str(repo / gate.ENTRY), str(task.scratch)])
        receipt = task.run(argv, cwd=repo, timeout=30, stdout_limit=65536, retain_argv=False)
        task.record("native-receipt.json", receipt)
        print(json.dumps(dict(event="CURRENT_FUNDING_TLS_PRIVATE_CAPTURE_RETAINED", actualExit=receipt["actual_exit"],
            outputComplete=receipt["output_complete"], stdout=receipt["stdout"], stderr=receipt["stderr"],
            rawOutputPrinted=False)), flush=True)
        require(receipt["state"] == "COMPLETE" and receipt["output_complete"], "NATIVE_CAPTURE_UNKNOWN")
        unchanged()
        stdout = store.object(receipt["stdout"]["sha256"], receipt["stdout"]["bytes"]).read_bytes()
        stderr = store.object(receipt["stderr"]["sha256"], receipt["stderr"]["bytes"]).read_bytes()
        counts = gate.validate_native_capture(stdout, stderr, receipt["actual_exit"], receipt["output_complete"])
        task.record("selected-result.json", dict(status="PASS", counts=counts, actualExit=receipt["actual_exit"],
            stdout=receipt["stdout"], stderr=receipt["stderr"], sourceRowsSha256=manifest["sourceRowsSha256"],
            fullDpGraph=False, productionQualified=False))
        # Retain exact new test inputs privately before normal owned-task close.
        for name in ("tls.cnf", "tls-key.pem", "tls-cert.pem"):
            raw, _ = read(task.scratch / name, 16384)
            task.preserve(task.scratch / name, legacy.sha(raw), len(raw))
    closed_raw, _ = legacy.read(task.directory / "task.json", 4194304)
    closed = json.loads(closed_raw)
    require(closed["state"] == "CLOSED" and closed["outcome"] == "SUCCESS", "TASK_CLOSE_UNKNOWN")
    print(json.dumps(dict(event="CURRENT_FUNDING_TLS_SELECTED_SUCCESS", cases=4,
        taskOutcome=closed["outcome"], fullDpGraph=False, productionQualified=False)), flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, TypeError) as problem:
        code = str(problem) if type(problem) is ValueError and re.fullmatch(r"[A-Z_]+", str(problem)) else "REVIEW_PRIVATE_RECEIPTS"
        print(json.dumps(dict(event="CURRENT_FUNDING_TLS_REFUSED_OR_FAILED", code=code,
            errorType=type(problem).__name__)), file=sys.stderr, flush=True)
        sys.exit(1)
