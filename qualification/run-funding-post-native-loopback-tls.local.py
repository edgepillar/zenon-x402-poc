"""Exact four-case loopback TLS qualification; dry plan unless --execute.

The selection is not authority. A separate reviewed allowance is required for
up to two attempts, one fresh private root, two native commands per attempt.
No installation, adoption, cleanup of old roots, SDK, SQL, nonce or DP graph.
Node permissions restrict file/child access, not OS/network authority.
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

MANIFEST = "qualification/funding-post-native-loopback-tls.inputs.json"
ENTRY = "qualification/funding-post-native-loopback-tls.selection.draft.mjs"
BODY = "qualification/funding-post-native-loopback-tls.behavior.draft.mjs"
POLICY = "qualification/funding-post-native-loopback-tls.storage-policy.json"
APPLICATION = ["src/service-credit-funding-post-native-https-transport.js",
    "src/service-credit-funding-post-native-response.js", "src/service-credit-native-client-close-owner.js"]
EXPECTED = ["package.json", *APPLICATION, ENTRY, BODY, POLICY]
NODE_SHA = "dbedff294bab84a0a86c04e15fbcbeb1c97ca10bef1b32b0634cd24b36f62100"
STORAGE_SHA = "a4d82a72214c9698fda7ae363c38b2470c08da5e2e04c63ee9284e43f638f081"
CLI_SHA = "0bf13cdc1f25a6b31ab14cfb124908808ca7ddc89073ecbcd0263bef4d52238c"
OPENSSL_SHA = "49db04c17e3a8c169ebc48a1149d78c165a86c04913203f46b2a14ce7f4a14fc"
QUOTA = 4194304
FLOOR = 10737418240
_RESERVATIONS = {}
TLS_CONFIG = b"""RANDFILE = ./openssl.rnd
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
    # atime changes during reads and is not a replacement/content identity.
    return tuple(str(v) for v in (s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode,
        s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns))


def read(path, cap=1048576, uid=None):
    require(path.is_absolute() and str(path) == os.path.normpath(path), "ABSOLUTE_PATH")
    for ancestor in (path, *path.parents):
        require(not ancestor.is_symlink(), "SYMLINK")
    before = path.lstat()
    require(stat.S_ISREG(before.st_mode) and before.st_uid == (os.getuid() if uid is None else uid)
        and before.st_nlink == 1 and 0 <= before.st_size <= cap, "REGULAR_OWNED_INPUT")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        require(identity(os.fstat(stream.fileno())) == identity(before), "OPEN_IDENTITY")
        raw = stream.read(cap + 1)
        require(len(raw) == before.st_size and identity(os.fstat(stream.fileno())) == identity(before), "READ_IDENTITY")
    require(identity(path.lstat()) == identity(before), "AFTER_IDENTITY")
    return raw, identity(before)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def pin(name, raw):
    return dict(path=name, bytes=len(raw), LF=raw.count(b"\n"), sha256=sha(raw),
        gitBlob=hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest())


def binary(path, expected_sha, uid, size=None):
    for ancestor in (path, *path.parents):
        require(not ancestor.is_symlink(), "BINARY_LINK")
    before = path.lstat()
    require(stat.S_ISREG(before.st_mode) and before.st_uid == uid and before.st_nlink == 1
        and (size is None or before.st_size == size), "BINARY_IDENTITY")
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        require(identity(os.fstat(stream.fileno())) == identity(before), "BINARY_OPEN")
        for chunk in iter(lambda: stream.read(1048576), b""):
            digest.update(chunk)
        require(identity(os.fstat(stream.fileno())) == identity(before), "BINARY_READ")
    require(digest.hexdigest() == expected_sha and identity(path.lstat()) == identity(before), "BINARY_DIGEST")
    return identity(before)


def reservations(root):
    raw, metadata_id = read(root / "storage.json", 65536)
    metadata = json.loads(raw)
    reserved = 0
    count = 0
    for directory in (root / "tasks").iterdir():
        require(not directory.is_symlink() and directory.is_dir(), "OLD_TASK_DIRECTORY")
        path = directory / "task.json"
        now = identity(path.lstat())
        cached = _RESERVATIONS.get(str(path))
        if cached is not None and cached[0] == now:
            row = cached[1]
        else:
            data, task_id = read(path, 4194304)
            full = json.loads(data)
            row = {key: full[key] for key in ("id", "store_id", "state", "expected_bytes")}
            _RESERVATIONS[str(path)] = (task_id, row)
        require(row["id"] == directory.name and row["store_id"] == metadata["id"], "OLD_TASK_OWNER")
        scratch = directory / "scratch"
        require(not scratch.is_symlink(), "OLD_SCRATCH_LINK")
        if row["state"] == "OPEN" or scratch.exists():
            require(type(row["expected_bytes"]) is int and row["expected_bytes"] >= 0, "RESERVATION")
            reserved += row["expected_bytes"]
        count += 1
        require(count <= 4096, "OLD_TASK_BOUND")
    require(identity((root / "storage.json").lstat()) == metadata_id, "OLD_METADATA_CHANGED")
    return dict(tasks=count, reservedBytes=reserved, storageSha256=sha(raw))


def capacity(volume, uuid, root, previous_roots):
    result = subprocess.run(["/usr/sbin/diskutil", "info", "-plist", str(volume)],
        check=True, capture_output=True, timeout=10)
    require(plistlib.loads(result.stdout).get("VolumeUUID") == uuid, "MOUNT_IDENTITY")
    require(root.parent == volume / "spv2" and root.parent.is_dir()
        and not root.parent.is_symlink() and root.parent.stat().st_dev == volume.stat().st_dev, "ROOT_VOLUME")
    rows = [reservations(Path(name)) for name in previous_roots]
    if root.exists():
        rows.append(reservations(root))
    total = sum(row["reservedBytes"] for row in rows)
    space = os.statvfs(volume)
    available = space.f_bavail * space.f_frsize
    require(available >= FLOOR + QUOTA + total + 1073741824, "EXTERNAL_FREE_FLOOR")
    return dict(availableBytes=available, requiredBytes=FLOOR + QUOTA + total + 1073741824,
        scopedReservationBytes=total, scopedRoots=len(rows), minimumFreeBytes=FLOOR)


def module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    require(spec is not None and spec.loader is not None, "MODULE_SPEC")
    value = importlib.util.module_from_spec(spec)
    sys.modules[name] = value
    spec.loader.exec_module(value)
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("repo", "manager", "node", "root", "manifest-sha256", "volume", "volume-uuid"):
        parser.add_argument("--" + name, required=True)
    parser.add_argument("--store-id")
    parser.add_argument("--run-number", type=int, choices=(1, 2), default=1)
    parser.add_argument("--previous-root", action="append", required=True)
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    require(sys.dont_write_bytecode, "BYTECODE_DISABLED_REQUIRED")
    repo, manager, node, root, volume = map(Path, (args.repo, args.manager, args.node, args.root, args.volume))
    require(all(path.is_absolute() and str(path) == os.path.normpath(path)
        for path in (repo, manager, node, root, volume)), "PATH_SELECTION")
    require(re.fullmatch(r"[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}", args.volume_uuid), "UUID_SELECTION")
    require(len(args.previous_root) == len(set(args.previous_root)) and 1 <= len(args.previous_root) <= 16
        and str(root) not in args.previous_root, "RESERVATION_SCOPE")
    manifest_raw, manifest_id = read(repo / MANIFEST)
    require(sha(manifest_raw) == args.manifest_sha256, "MANIFEST_DIGEST")
    manifest = json.loads(manifest_raw)
    require(manifest["kind"] == "FOUR_CASE_NATIVE_FUNDING_LOOPBACK_TLS_INPUTS_NOT_A_RESULT"
        and [row["path"] for row in manifest["inputs"]] == EXPECTED
        and manifest["effectsCeiling"] == dict(selectedCases=4, maximumRuns=2,
            opensslCommandsPerRun=1, nodeCommandsPerRun=1, nodeChildren=0,
            loopbackConnectionsPerRun=8, taskQuotaBytes=QUOTA, SDK=False,
            SQLite=False, nonce=False, paymentSigning=False, fullDpGraph=False,
            externalNetwork=False, nativeOsNetworkSandbox=False), "EXACT_SCOPE")
    launcher = Path(__file__).absolute()
    require(launcher == repo / "qualification/run-funding-post-native-loopback-tls.local.py", "LAUNCHER_LOCATION")
    launcher_raw, launcher_id = read(launcher, 65536)
    sources = {}

    def sources_unchanged():
        for row in manifest["inputs"]:
            raw, _ = read(repo / row["path"])
            require(pin(row["path"], raw) == row, "SOURCE_PIN")
            sources[row["path"]] = raw
        require(identity(launcher.lstat()) == launcher_id
            and identity((repo / MANIFEST).lstat()) == manifest_id, "LAUNCHER_OR_MANIFEST_CHANGED")

    sources_unchanged()
    require(json.loads(sources["package.json"])["type"] == "module", "ESM_PACKAGE")
    # Reject any newly added runtime import edge, including forbidden packages.
    imports = {}
    for name in [*APPLICATION, ENTRY, BODY]:
        source = sources[name].decode("ascii")
        imports[name] = re.findall(r"(?:from\s*|import\s*\()\s*['\"]([^'\"]+)['\"]", source)
        require(sorted(imports[name]) == sorted(manifest["imports"][name]), "IMPORT_GRAPH_CHANGED")
        require(all(value.startswith("node:") or (repo / Path(name).parent / value).resolve().relative_to(repo).as_posix()
            in APPLICATION + [BODY] for value in imports[name]), "IMPORT_GRAPH_OUTSIDE_SELECTION")
    storage_raw, storage_id = read(manager / "storage.py", 262144)
    cli_raw, cli_id = read(manager / "cli.py", 65536)
    require(sha(storage_raw) == STORAGE_SHA and sha(cli_raw) == CLI_SHA, "MANAGER_PIN")
    node_id = binary(node, NODE_SHA, os.getuid(), 121304480)
    openssl = Path("/usr/bin/openssl")
    openssl_id = binary(openssl, OPENSSL_SHA, 0)
    current_capacity = capacity(volume, args.volume_uuid, root, args.previous_root)
    plan = dict(event="FUNDING_TLS_SOURCE_PREFLIGHT", sourceInputs=len(sources), productionModules=3,
        runNumber=args.run_number, maximumRuns=2, selectedCases=4, maximumConnections=8,
        opensslCommands=1, nodeCommands=1, nodeChildren=0, effectsExecuted=False,
        NodePermissionModel=True, nativeOsNetworkSandbox=False, capacity=current_capacity)
    print(json.dumps(plan), flush=True)
    if not args.execute:
        return 0
    require(args.store_id is not None and root.exists() and not root.is_symlink(), "NEW_STORE_REQUIRED")
    storage = module(manager / "storage.py", "storage")
    require(identity((manager / "storage.py").lstat()) == storage_id, "MANAGER_CHANGED")
    store = storage.Store(root, metadata_lock_timeout=5)
    require(store.id == args.store_id and dataclasses.asdict(store.policy) == json.loads(sources[POLICY]), "STORE_POLICY")
    previous = store._tasks()
    require(len(previous) == args.run_number - 1 and all(row["state"] == "CLOSED" for _, row in previous), "RUN_SEQUENCE")
    os.umask(0o077)
    os.environ.clear()
    os.environ.update(PATH="/usr/bin:/bin", LANG="C", LC_ALL="C", TZ="UTC",
        NODE_DISABLE_COMPILE_CACHE="1", X402_FUNDING_TLS_SELECTION="four-loopback-cases-only",
        X402_FUNDING_TLS_NATIVE_MODE="reviewed-loopback-tls")

    def pre_native():
        nonlocal current_capacity
        sources_unchanged()
        require(identity(node.lstat()) == node_id and identity(openssl.lstat()) == openssl_id
            and identity((manager / "storage.py").lstat()) == storage_id
            and identity((manager / "cli.py").lstat()) == cli_id, "NATIVE_ENTRY_IDENTITIES")
        current_capacity = capacity(volume, args.volume_uuid, root, args.previous_root)

    with store.task("zenon-x402-native-funding-loopback-tls", expected_bytes=QUOTA, quota_bytes=QUOTA) as task:
        for name, raw in [*sources.items(), (MANIFEST, manifest_raw), (launcher.name, launcher_raw)]:
            path = task.write("inputs/" + name, raw)
            task.preserve(path, sha(raw), len(raw))
        task.record("scope.json", dict(runNumber=args.run_number, maximumRuns=2,
            sourceRowsSha256=manifest["sourceRowsSha256"], taskQuotaBytes=QUOTA,
            effectsCeiling=manifest["effectsCeiling"], nativeOsNetworkSandbox=False))
        config = task.write("tls.cnf", TLS_CONFIG)
        pre_native()
        print(json.dumps(dict(event="FUNDING_TLS_OPENSSL_ENTRY", runNumber=args.run_number,
            taskId=task.directory.name, attemptsConsumed=args.run_number)), flush=True)
        certificate = task.run([str(openssl), "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256",
            "-days", "1", "-keyout", str(task.scratch / "tls-key.pem"),
            "-out", str(task.scratch / "tls-cert.pem"), "-config", str(config)],
            cwd=task.scratch, timeout=20, stdout_limit=65536, retain_argv=False)
        task.record("tls-generation-receipt.json", certificate)
        require(certificate["state"] == "COMPLETE" and certificate["output_complete"]
            and certificate["actual_exit"] == 0, "TLS_GENERATION_FAILED_OR_UNKNOWN")
        for name in ("tls-key.pem", "tls-cert.pem"):
            raw, file_id = read(task.scratch / name, 16384)
            require(stat.S_IMODE((task.scratch / name).lstat().st_mode) == 0o600 and len(raw) > 0, "PRIVATE_TLS_FILE")
        pre_native()
        argv = [str(node), "--permission", "--no-addons", "--disallow-code-generation-from-strings",
            "--disable-proto=throw", "--unhandled-rejections=strict", "--test-reporter=tap"]
        for name in ["package.json", *APPLICATION, ENTRY, BODY]:
            argv.append("--allow-fs-read=" + str(repo / name))
        argv.extend(["--allow-fs-read=" + str(task.scratch), str(repo / ENTRY), str(task.scratch)])
        print(json.dumps(dict(event="FUNDING_TLS_NODE_ENTRY", runNumber=args.run_number,
            taskId=task.directory.name, maximumConnections=8, nodeChildren=0)), flush=True)
        receipt = task.run(argv, cwd=repo, timeout=30, stdout_limit=65536, retain_argv=False)
        task.record("native-receipt.json", receipt)
        require(receipt["state"] == "COMPLETE" and receipt["output_complete"], "NATIVE_CAPTURE_UNKNOWN")
        sources_unchanged()
        stdout = store.object(receipt["stdout"]["sha256"], receipt["stdout"]["bytes"]).read_bytes()
        stderr = store.object(receipt["stderr"]["sha256"], receipt["stderr"]["bytes"]).read_bytes()
        print(json.dumps(dict(event="FUNDING_TLS_NATIVE_CAPTURE", runNumber=args.run_number,
            taskId=task.directory.name, receipt=receipt, stdout=stdout.decode("utf8"),
            stderr=stderr.decode("utf8"), capacity=current_capacity)), flush=True)
        require(receipt["actual_exit"] == 0, "SELECTED_NATIVE_CASE_FAILED")
        lines = stdout.decode("utf8").splitlines()
        footers = [line for line in lines if line.startswith("# funding-post-native-loopback-tls ")]
        require(len(footers) == 1, "NATIVE_FOOTER")
        counts = json.loads(footers[0].split(" ", 2)[2])
        require(counts == dict(casesEntered=4, casesCompleted=4, connections=3, secureConnections=3,
            requests=3, serverClosed=True, fixtureCleanupDestroyedSockets=0, clientRequests=3,
            clientAuthenticatedTls=3, responseBytesObserved=7, cleanOwners=2, unknownOwners=2,
            allClientHandlesDrained=True, SDK=False, SQLite=False, nonce=False, paymentSigning=False,
            externalNetwork=False, fullDpGraph=False, nativeOsNetworkSandbox=False), "NATIVE_COUNTERS")
        require(all(line in lines for line in ("# tests 4", "# pass 4", "# fail 0", "# skipped 0", "# cancelled 0")),
            "SELECTED_TAP_CASE_SET")
        task.record("selected-result.json", dict(status="PASS", cases=4, counts=counts,
            stdout=receipt["stdout"], stderr=receipt["stderr"], actualExit=receipt["actual_exit"],
            sourceRowsSha256=manifest["sourceRowsSha256"], historicalResultNotFullDpQualification=True))
    closed_raw, _ = read(task.directory / "task.json", 4194304)
    closed = json.loads(closed_raw)
    require(closed["state"] == "CLOSED" and closed["outcome"] == "SUCCESS", "TASK_CLOSE_UNKNOWN")
    cleanup, _ = read(task.evidence / "cleanup.json")
    print(json.dumps(dict(event="FUNDING_TLS_TASK_CLOSED", runNumber=args.run_number,
        taskId=task.directory.name, outcome=closed["outcome"], cleanup=json.loads(cleanup))), flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(json.dumps(dict(event="FUNDING_TLS_REFUSED_OR_FAILED", errorType=type(error).__name__,
            code=str(error) if isinstance(error, ValueError) and re.fullmatch(r"[A-Z_]+", str(error)) else "REVIEW_RECEIPTS")),
            file=sys.stderr, flush=True)
        sys.exit(1)
