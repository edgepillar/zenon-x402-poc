"""One approved P1 V2 attempt; reviewed source, existing private root, one NEW task.

One OpenSSL test-TLS command, one direct Node command, no implicit retry.
--review is read-only. Private plans, paths, TLS material and raw diagnostics
must not be published. Unknown child SQLite files remain HOLD, never adopted.
"""
import ast
from contextlib import contextmanager
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import stat
import subprocess
import sys

MIB = 1048576
QUOTA = 4 * MIB
PROJECT = "x402-p1-native-v6-two-sqlite-v2-once-q69"
ENTRY = "app/qualification/p1-native-v6-two-sqlite-once.behavior-v2.draft.mjs"
PRELOAD = "app/qualification/p1-native-v6-once.namespace-v2.preload.mjs"
SSL_CONFIG = b"""RANDFILE = /dev/null
[req]
prompt = no
distinguished_name = dn
x509_extensions = extensions
[dn]
CN = 127.0.0.1
[extensions]
subjectAltName = IP:127.0.0.1
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
"""


def require(ok, code):
    if not ok:
        raise RuntimeError(code)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def raw_json(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode() + b"\n"


def identity(s):
    return [str(v) for v in (s.st_dev, s.st_ino, s.st_uid, s.st_gid,
                            s.st_mode, s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns)]


def ancestors(path):
    require(path.is_absolute() and str(path) == os.path.abspath(path), "PATH")
    for item in [path, *path.parents]:
        require(not item.is_symlink(), "LINK")


def read(path, cap=262144, owner=None):
    path = Path(path)
    ancestors(path)
    s = path.lstat()
    require(stat.S_ISREG(s.st_mode) and s.st_nlink == 1
            and s.st_uid == (os.getuid() if owner is None else owner)
            and 0 <= s.st_size <= cap, "FILE")
    before = identity(s)
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        require(identity(os.fstat(stream.fileno())) == before, "OPEN_ID")
        raw = stream.read(cap + 1)
        require(len(raw) == s.st_size and identity(os.fstat(stream.fileno())) == before, "READ_ID")
    require(identity(path.lstat()) == before, "AFTER_ID")
    return raw, before


def check(pin, cap=262144):
    raw, ids = read(pin["path"], cap, pin.get("owner"))
    require(ids == pin["identity"] and len(raw) == pin["bytes"]
            and sha(raw) == pin["sha256"], "PIN_CHANGED")
    return raw


def reservations(root):
    root = Path(root)
    ancestors(root)
    metadata, _ = read(root / "storage.json", 4096)
    store_id = json.loads(metadata)["id"]
    directories = list((root / "tasks").iterdir())
    require(sum((d / "task.json").lstat().st_size for d in directories) <= 64 * MIB, "TASK_METADATA_CAP")
    held = 0
    for directory in directories:
        raw, _ = read(directory / "task.json", 4 * MIB)
        row = json.loads(raw)
        require(row["id"] == directory.name and row["store_id"] == store_id
                and row["state"] in ("OPEN", "CLOSED")
                and type(row["expected_bytes"]) is int and row["expected_bytes"] >= 0, "TASK")
        if row["state"] == "OPEN" or (directory / "scratch").exists():
            held += row["expected_bytes"]
    return held


def inspect(plan, own_raw):
    require(sys.version_info[:3] == (3, 12, 14), "PYTHON")
    require(plan["authority"] == "approved-one-p1-v2-native-synthetic-attempt"
            and plan["limits"] == {"tasks": 1, "quotaBytes": QUOTA, "OpenSSLCommands": 1,
                                   "NodeCommands": 1, "NodeChildren": 0, "connections": 48,
                                   "sqliteFiles": 2, "capabilityKeys": 2, "capabilitySignatures": 3}, "AUTHORITY")
    require(sha(own_raw) == plan["launcherSha256"], "LAUNCHER")
    ast.parse(own_raw)
    result = subprocess.run(["/usr/sbin/diskutil", "info", "-plist", plan["volume"]],
                            capture_output=True, check=True, timeout=10)
    require(len(result.stdout) < 32768 and not result.stderr
            and plistlib.loads(result.stdout).get("VolumeUUID") == plan["volumeUUID"], "VOLUME_UUID")
    root = Path(plan["root"])
    ancestors(root.parent)
    facts = plan["rootFacts"]
    ancestors(root)
    require(root.is_dir() and identity(root.lstat())[:5] == facts["rootIdentity"][:5]
            and root.lstat().st_dev == Path(plan["volume"]).lstat().st_dev
            and stat.S_IMODE(root.lstat().st_mode) == 0o700, "EXISTING_ROOT")
    metadata, meta_ids = read(root / "storage.json", 4096)
    meta = json.loads(metadata)
    require(meta_ids == facts["metadataIdentity"] and sha(metadata) == facts["metadataSha256"]
            and meta["id"] == facts["storeId"] and meta["policy"] == plan["policy"], "ROOT_METADATA")
    rows = []
    for directory in (root / "tasks").iterdir():
        row_raw, _ = read(directory / "task.json", 4 * MIB)
        row = json.loads(row_raw)
        require(row["id"] == directory.name and row["store_id"] == meta["id"], "ROOT_TASK")
        rows.append(row)
    require(len(rows) == 1 and rows[0]["id"] == facts["heldTask"]
            and rows[0]["state"] == "CLOSED" and rows[0]["outcome"] == "FAILURE"
            and all(r["project"] != PROJECT for r in rows), "FRESH_V2_TASK_ONLY")
    objects = list((root / "objects").iterdir())
    require(len(objects) == 65 and all(re.fullmatch("[0-9a-f]{64}", p.name) for p in objects)
            and len(rows) < plan["policy"]["max_tasks"]
            and len(objects) + 32 < plan["policy"]["max_objects"], "ROOT_LIMITS")
    for pin in [*plan["tools"], plan["manager"], plan["managerCli"]]:
        check(pin, 130000000 if pin.get("label") in ("node", "python") else 2 * MIB)
    payloads = []
    for row in plan["profile"]["inputs"]:
        from urllib.parse import urlsplit, unquote
        u = urlsplit(row["url"])
        require(u.scheme == "file" and not u.netloc and not u.query and not u.fragment, "SOURCE_URL")
        path = Path(unquote(u.path))
        raw, ids = read(path)
        require(ids == row["identity"] and len(raw) == row["bytes"] and sha(raw) == row["sha256"], "SOURCE")
        payloads.append((row["logicalPath"], path, raw))
    public = plan["sourceRows"]
    require(len(payloads) == len(public) == 57
            and sum(len(raw) for _, _, raw in payloads) <= 2 * MIB, "SOURCE_GRAPH")
    seal = sha(json.dumps(sorted(public, key=lambda r: r["path"]), sort_keys=True, separators=(",", ":")).encode())
    require(seal == plan["profile"]["sourceRowsSha256"], "SOURCE_SEAL")
    for label, _, raw in payloads:
        row = next(r for r in public if r["path"] == label)
        require(row["bytes"] == len(raw) and row["LF"] == raw.count(b"\n") and row["sha256"] == sha(raw)
                and row["gitBlob"] == hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest(), "PUBLIC_PIN")
    require(not any(b"@zenon" in raw or b"znn-typescript" in raw for label, _, raw in payloads
                    if label.startswith("app/") and label != "app/package.json"), "ZENON_SDK_EDGE")
    require(plan["profile"]["profileKind"] == "P1_NATIVE_V6_TWO_SQLITE_ONCE_V2"
            and {ENTRY, PRELOAD}.issubset({p[0] for p in payloads})
            and not any("native-https-host" in p[0] or "native-application-deadline" in p[0]
                        for p in payloads), "V2_ONLY")
    other_reserved = sum(reservations(p) for p in plan["otherRoots"])
    floor = max(plan["policy"]["min_free_bytes"], 11 * 1024**3 + other_reserved)
    own_reserved = reservations(root)
    require(plan["policy"]["min_free_bytes"] >= 10 * 1024**3
            and plan["policy"]["task_quota_bytes"] == QUOTA
            and plan["policy"]["max_output_bytes"] == 65536
            and plan["policy"]["max_commands_per_task"] == 2
            and shutil.disk_usage(root).free >= floor + own_reserved + QUOTA, "CAPACITY")
    require(len(own_raw) + len(raw_json(plan)) + len(raw_json(plan["profile"])) < 196608, "CONTROL_CAP")
    return payloads, {"sourceFiles": len(payloads), "sourceBytes": sum(len(v) for _, _, v in payloads),
                      "sourceRowsSha256": seal, "otherReservedBytes": other_reserved,
                      "effectiveCombinedFreeFloorBytes": floor, "existingOwnReservedBytes": own_reserved,
                      "configuredFreeFloorBytes": plan["policy"]["min_free_bytes"],
                      "freeBytes": shutil.disk_usage(root.parent).free, "quotaBytes": QUOTA,
                      "maximumConnections": 48, "NodeChildren": 0, "nativeOsSandbox": False}



def capacity(plan):
    # Cooperative current combined-store admission, NOT an OS quota or sandbox.
    # Existing persisted policy is unchanged even if other reservations grew.
    root = Path(plan["root"])
    other = sum(reservations(p) for p in plan["otherRoots"])
    own = reservations(root)
    floor = max(plan["policy"]["min_free_bytes"], 11 * 1024**3 + other)
    require(shutil.disk_usage(root).free >= floor + own + QUOTA, "COMBINED_CAPACITY")


@contextmanager
def environment(values):
    previous = dict(os.environ)
    os.environ.clear()
    os.environ.update(values)
    try:
        yield
    finally:
        os.environ.clear()
        os.environ.update(previous)


def emit(event, **values):
    print(json.dumps(dict(event=event, **values), separators=(",", ":")), flush=True)


def main():
    require(len(sys.argv) == 3 and sys.argv[1] in ("--review", "--execute-once"), "MODE")
    plan = json.loads(sys.argv[2])
    own_raw, _ = read(Path(__file__).absolute(), 32768)
    payloads, facts = inspect(plan, own_raw)
    if sys.argv[1] == "--review":
        emit("Q69_V2_READ_ONLY_LAUNCHER_REVIEW_PASS", **facts)
        return 0
    spec = importlib.util.spec_from_file_location("q69_approved_task_storage", plan["manager"]["path"])
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    # Existing approved private root only. Never initialize, adopt or rebind it.
    # A unique project and preflight task-count gate preserve the V1 HOLD task.
    store = module.Store(plan["root"], create=False, metadata_lock_timeout=30)
    require(store.id == plan["rootFacts"]["storeId"], "STORE_CHANGED")
    capacity(plan)
    task = store.task(PROJECT, expected_bytes=QUOTA, quota_bytes=QUOTA)
    emit("Q69_V2_EXISTING_PRIVATE_ROOT_NEW_TASK_OPENED", taskId=task.id)
    tools = {p["label"]: p["path"] for p in plan["tools"]}
    passed = False
    with task:
        task.record("admission.json", facts)
        retained = {}
        for label, _, raw in payloads:
            retained[label] = task.preserve(task.write("sources/" + label, raw), sha(raw), len(raw))
        for name, raw in [("control/launcher.py", own_raw), ("control/private-plan.json", raw_json(plan))]:
            retained[name] = task.preserve(task.write(name, raw), sha(raw), len(raw))
        profile_raw = raw_json(plan["profile"])
        profile_path = task.write("control/namespace-profile.json", profile_raw)
        config_path = task.write("tls/openssl.cnf", SSL_CONFIG)
        key_path = task.write("tls/server-key.pem", b"")
        cert_path = task.write("tls/server-cert.pem", b"")
        tls_created_ids = [identity(p.lstat())[:6] for p in (key_path, cert_path)]
        # Register the EMPTY fixture directory via a consumed owned marker.
        # Native SQLite creates its exclusive files itself. These child paths
        # are deliberately NOT retroactively adopted or marked disposable.
        retained["fixture-empty-marker"] = task.preserve(task.write("fixture/empty-marker", b"", disposable=True))
        base = {"PATH": "/usr/bin:/bin", "LANG": "C", "LC_ALL": "C", "TZ": "UTC", "TMPDIR": str(task.scratch)}
        ssl_argv = [tools["openssl"], "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256",
                    "-days", "1", "-set_serial", "1", "-batch", "-config", str(config_path),
                    "-keyout", str(key_path), "-out", str(cert_path)]
        task.record("openssl-startup.json", {"argv": ssl_argv, "configSha256": sha(SSL_CONFIG),
                                            "commands": 1, "timeoutSeconds": 15, "TLS_TEST_ONLY": True})
        emit("Q69_V2_OPENSSL_ONCE_STARTING", taskId=task.id)
        capacity(plan)
        with environment(dict(base, OPENSSL_CONF=str(config_path), RANDFILE="/dev/null")):
            ssl = task.run(ssl_argv, timeout=15, stdout_limit=8192, retain_argv=True)
        emit("Q69_V2_OPENSSL_CAPTURED", actualExit=ssl["actual_exit"], outputComplete=ssl["output_complete"])
        require(ssl["actual_exit"] == 0 and ssl["output_complete"]
                and ssl["stdout"]["bytes"] <= 8192 and ssl["stderr"]["bytes"] <= 8192, "TLS_FAILURE")
        tls = []
        for index, (role, path) in enumerate([("key", key_path), ("cert", cert_path)]):
            raw, ids = read(path, 16384)
            require(raw and b"-----BEGIN " in raw and ids[:6] == tls_created_ids[index], "TLS_PEM")
            tls.append(dict(role=role, path=str(path), bytes=len(raw), sha256=sha(raw), identity=ids))
        mapping = {name: (path, raw) for name, path, raw in payloads}
        node_env = dict(base, NODE_DISABLE_COMPILE_CACHE="1",
                        X402_P1_ONCE_OPT_IN="approved-p1-two-sqlite-loopback-once",
                        X402_P1_PROFILE_PATH=str(profile_path), X402_P1_PROFILE_SHA256=sha(profile_raw),
                        X402_P1_CORE_ROOT=plan["packageRoots"]["core"],
                        X402_P1_TLS_PINS=json.dumps(tls, separators=(",", ":")))
        argv = [tools["node"], "--no-addons", "--disallow-code-generation-from-strings",
                "--disable-proto=throw", "--no-warnings", "--unhandled-rejections=strict", "--test-reporter=tap",
                "--require=node:https", "--import", str(mapping[PRELOAD][0]), str(mapping[ENTRY][0])]
        task.record("node-startup.json", {"argv": argv, "environment": node_env, "expectedSubtests": 5,
                                         "maximumConnections": 48, "NodeChildren": 0,
                                         "sourceCommit": plan["sourceCommit"], "sourceRowsSha256": facts["sourceRowsSha256"],
                                         "stdoutCap": 65536, "stderrCap": 65536, "timeoutSeconds": 45,
                                         "childCreatedFilesCleanup": "HOLD_NOT_ADOPTED", "nativeOsSandbox": False})
        for pin in [*plan["tools"], plan["manager"], plan["managerCli"]]:
            check(pin, 130000000 if pin.get("label") in ("node", "python") else 2 * MIB)
        for name, path, before in payloads:
            current, ids = read(path)
            expected = next(p for p in plan["profile"]["inputs"] if p["logicalPath"] == name)
            require(current == before and ids == expected["identity"], "PRE_NODE_DRIFT")
        capacity(plan)
        emit("Q69_V2_NODE_ONCE_STARTING", taskId=task.id)
        with environment(node_env):
            node = task.run(argv, timeout=45, stdout_limit=65536, retain_argv=True)
        emit("Q69_V2_NODE_CAPTURED", actualExit=node["actual_exit"], outputComplete=node["output_complete"],
             stdout=node["stdout"], stderr=node["stderr"])
        out = store.object(node["stdout"]["sha256"]).read_bytes()
        err = store.object(node["stderr"]["sha256"]).read_bytes()
        text = out.decode("utf-8")
        markers, diagnostics, attempts, parse_errors = [], [], [], []
        for line in text.splitlines():
            try:
                if "# p1-native-v6-namespace " in line:
                    markers.append(json.loads(line.split("# p1-native-v6-namespace ", 1)[1]))
                elif '# {"kind":"P1_NATIVE_V6_TWO_SQLITE_ONCE"' in line:
                    diagnostics.append(json.loads(line.split("# ", 1)[1]))
                elif '# {"kind":"P1_NATIVE_V6_ATTEMPT_SUMMARY_V2"' in line:
                    attempts.append(json.loads(line.split("# ", 1)[1]))
            except (ValueError, IndexError):
                parse_errors.append("DIAGNOSTIC_UNREADABLE")
        passed = (node["actual_exit"] == 0 and node["output_complete"] and not err
                  and re.search(r"^# tests 6$", text, re.M) is not None
                  and re.search(r"^# pass 6$", text, re.M) is not None
                  and re.search(r"^# fail 0$", text, re.M) is not None
                  and re.search(r"^# skipped 0$", text, re.M) is not None
                  and re.search(r"^# cancelled 0$", text, re.M) is not None
                  and not parse_errors and len(markers) == len(diagnostics) == len(attempts) == 1
                  and re.search(r"^# todo 0$", text, re.M) is not None
                  and markers[0]["profileKind"] == "P1_NATIVE_V6_TWO_SQLITE_ONCE_V2"
                  and markers[0]["sourceTransforms"] == 0
                  and markers[0]["inputsVerifiedBeforeFixture"] == len(payloads)
                  and markers[0]["bareImportOverrideHits"] == 3
                  and markers[0]["sourceRowsSha256"] == facts["sourceRowsSha256"]
                  and diagnostics[0]["nativeConnections"] == diagnostics[0]["authenticatedTlsHandshakes"] == 8
                  and diagnostics[0]["version"] == attempts[0]["version"] == 2
                  and diagnostics[0]["ingressCancelContract"] == "BOOLEAN"
                  and diagnostics[0]["serviceCancelContract"] == "UNDEFINED"
                  and diagnostics[0]["syntheticCapabilityKeyPairs"] == 2
                  and diagnostics[0]["syntheticCapabilitySignatures"] == 3
                  and diagnostics[0]["responseLosses"] == 1
                  and diagnostics[0]["nativeServiceCallbacks"] == 2
                  and diagnostics[0]["payerReturnedStoreCloses"] == 2
                  and attempts[0]["parentErrorCode"] is None
                  and diagnostics[0]["responseLossQuarantineRetained"])
        generated = []
        fixture = task.scratch / "fixture"
        for path in sorted(fixture.iterdir()):
            raw, ids = read(path, MIB)
            require(path.name in ("p1-ledger.sqlite", "p1-payer.sqlite")
                    and stat.S_IMODE(path.lstat().st_mode) == 0o600, "CHILD_FILE_HOLD")
            generated.append(dict(name=path.name, identity=ids, bytes=len(raw), sha256=sha(raw),
                                  retention="UNKNOWN_CHILD_FILE_HOLD_NO_ADOPTION"))
        passed = passed and len(generated) == 2
        for name, path, before in payloads:
            current, ids = read(path)
            expected = next(p for p in plan["profile"]["inputs"] if p["logicalPath"] == name)
            require(current == before and ids == expected["identity"], "POST_NODE_DRIFT")
        for name, path in [("control/namespace-profile.json", profile_path), ("tls/openssl.cnf", config_path),
                           ("tls/server-key.pem", key_path), ("tls/server-cert.pem", cert_path)]:
            raw, _ = read(path)
            retained[name] = task.preserve(path, sha(raw), len(raw))
        result = {"status": "P1_NATIVE_V6_SCOPED_PASS" if passed else "P1_NATIVE_V6_FAILED_OR_INCOMPLETE",
                  "sourceCommit": plan["sourceCommit"], **facts,
                  "OpenSSLCommands": 1, "NodeCommands": 1, "node": node, "openssl": ssl,
                  "namespaceMarkers": markers, "diagnostics": diagnostics, "attemptSummaries": attempts,
                  "diagnosticParseErrors": parse_errors, "childFiles": generated,
                  "rawStdoutBytes": len(out), "rawStderrBytes": len(err),
                  "ordinaryInstalledNamespace": "NOT_QUALIFIED", "fullP1": "NOT_ESTABLISHED",
                  "providerActivationProof": "NOT_ESTABLISHED", "economicPilot": "NO_GO",
                  "cleanupExpected": "HOLD_UNREGISTERED_CHILD_FILES_NOT_ADOPTED"}
        task.record("qualification.json", result)
        task.package({name: value["sha256"] for name, value in retained.items()})
        if not passed:
            task.close("FAILURE")
        emit("Q69_V2_P1_SCOPED_RESULT", taskId=task.id, status=result["status"], cases=len(diagnostics),
             nodeExit=node["actual_exit"], outputComplete=node["output_complete"])
    cleanup, _ = read(task.evidence / "cleanup.json", 65536)
    emit("Q69_V2_TASK_CLOSED", taskId=task.id, outcome="SUCCESS" if passed else "FAILURE",
         cleanup=json.loads(cleanup))
    return 0 if passed else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BaseException as error:
        if isinstance(error, SystemExit):
            raise
        emit("Q69_V2_STOPPED_NO_RETRY", errorType=type(error).__name__)
        raise

