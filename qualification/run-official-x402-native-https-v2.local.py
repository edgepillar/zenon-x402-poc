"""Single-use managed launcher for the reviewed native HTTPS v2 fixture.

No default storage/tool paths and no installation or implicit retry. The caller
supplies private, source-reviewed pins. --review is read-only; execution requires
the explicit current-scope token. Public results must omit the private plan.
"""
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
from contextlib import contextmanager
from urllib.parse import unquote, urlsplit

MIB = 1048576
QUOTA = 2 * MIB
CONTROL_CAP = 98304
ENTRY = "qualification/official-x402-native-https-pending-v2.behavior.draft.mjs"
PRELOAD = "qualification/official-x402-native-https-namespace-v2.preload.draft.mjs"
PROJECT = "x402-native-https-v2-once-q65-20261023"
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


def require(value, code):
    if not value:
        raise RuntimeError(code)


def raw_json(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode() + b"\n"


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def identity(s):
    return [str(v) for v in (s.st_dev, s.st_ino, s.st_uid, s.st_gid,
                            s.st_mode, s.st_nlink, s.st_size,
                            s.st_mtime_ns, s.st_ctime_ns)]


def ancestors(path):
    require(path.is_absolute() and str(path) == os.path.abspath(path), "PATH")
    for p in [path] + list(path.parents):
        require(not stat.S_ISLNK(p.lstat().st_mode), "LINK")


def read(path, cap=262144, owner=None):
    path = Path(path)
    ancestors(path)
    s = path.lstat()
    require(stat.S_ISREG(s.st_mode) and s.st_nlink == 1
            and s.st_uid == (os.getuid() if owner is None else owner)
            and 0 <= s.st_size <= cap, "FILE")
    before = identity(s)
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        require(identity(os.fstat(stream.fileno())) == before, "OPEN_IDENTITY")
        raw = stream.read(cap + 1)
        require(len(raw) == s.st_size
                and identity(os.fstat(stream.fileno())) == before, "READ_IDENTITY")
    require(identity(path.lstat()) == before, "AFTER_IDENTITY")
    return raw, before


def check_pin(pin, cap=262144, owner=None):
    raw, ids = read(pin["path"], cap, owner)
    require(len(raw) == pin["bytes"] and sha(raw) == pin["sha256"]
            and ids == pin["identity"], "PIN_CHANGED")
    return raw


def mount(plan):
    result = subprocess.run(
        ["/usr/sbin/diskutil", "info", "-plist", plan["volume"]],
        capture_output=True, timeout=10, check=True)
    require(len(result.stdout) <= 32768 and len(result.stderr) <= 8192
            and plistlib.loads(result.stdout).get("VolumeUUID") == plan["volumeUUID"],
            "MOUNT_UUID")


def filesystem_totals(base):
    total = 0
    device = base.lstat().st_dev
    for directory, children, files in os.walk(base, followlinks=False):
        for name in children:
            s = (Path(directory) / name).lstat()
            require(stat.S_ISDIR(s.st_mode) and not stat.S_ISLNK(s.st_mode)
                    and s.st_uid == os.getuid() and s.st_dev == device, "DIRECTORY")
        for name in files:
            s = (Path(directory) / name).lstat()
            require(stat.S_ISREG(s.st_mode) and s.st_nlink == 1
                    and s.st_uid == os.getuid() and s.st_dev == device, "TREE_FILE")
            total += s.st_size
    return total


def rows(root, cap=262144):
    result = []
    directories = list((root / "tasks").iterdir())
    require(sum((d / "task.json").lstat().st_size for d in directories)
            <= 64 * MIB, "TASK_METADATA_READ_CAP")
    for directory in directories:
        ancestors(directory)
        raw, _ = read(directory / "task.json", cap)
        row = json.loads(raw)
        require(directory.name == row["id"] and row["state"] in ("OPEN", "CLOSED")
                and type(row["expected_bytes"]) is int and row["expected_bytes"] >= 0, "TASK_ID")
        result.append((directory, row))
    return result


def preflight(plan, source_raw, plan_raw):
    require(plan["authority"] == "current-human-approved-https-v2-one-attempt"
            and plan["sourceCommit"] == "6bf0c1b80cad61c1c1e7ec17453f773414b25bd6",
            "CURRENT_SCOPE")
    mount(plan)
    root = Path(plan["root"])
    ancestors(root)
    s = root.lstat()
    require(identity(s) == plan["rootIdentity"] and stat.S_ISDIR(s.st_mode)
            and s.st_uid == os.getuid() and stat.S_IMODE(s.st_mode) == 0o700, "ROOT")
    metadata, ids = read(root / "storage.json", 4096)
    require(ids == plan["metadataIdentity"]
            and sha(metadata) == plan["metadataSha256"], "METADATA")
    store = json.loads(metadata)
    require(store["id"] == plan["storeId"] and store["policy"] == plan["policy"], "STORE")
    require(sha(source_raw) == plan["launcherSha256"], "LAUNCHER")
    require(len(source_raw) + len(plan_raw) + len(raw_json(plan["profile"]))
            + len(SSL_CONFIG) <= CONTROL_CAP, "CONTROL_BUDGET")
    for pin in plan["tools"]:
        check_pin(pin, 130000000, 0 if pin["label"] == "openssl" else None)
    check_pin(plan["manager"], 65536)
    source_payloads = []
    published = {r["path"]: r for r in plan["sourceRows"]}
    for p in plan["profile"]["inputs"]:
        url = urlsplit(p["url"])
        require(url.scheme == "file" and not url.netloc and not url.query and not url.fragment,
                "SOURCE_URL")
        path = Path(unquote(url.path))
        raw, ids = read(path)
        name = p["logicalPath"]
        label = name[4:] if name.startswith("app/") else name[9:]
        public = published[label]
        require(ids == p["identity"] and len(raw) == p["bytes"] == public["bytes"]
                and sha(raw) == p["sha256"] == public["sha256"]
                and raw.count(b"\n") == public["LF"]
                and hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()
                == public["gitBlob"], "SOURCE_CHANGED")
        source_payloads.append((name, path, raw))
    require(len(source_payloads) == 36 and sum(len(r[2]) for r in source_payloads) == 701939,
            "SOURCE_GRAPH")
    public_rows = [dict(p, path=("packages/" if p["path"].startswith(("@x402/core/", "zod/"))
                                  else "app/") + p["path"]) for p in plan["sourceRows"]]
    seal = sha(json.dumps(sorted(public_rows, key=lambda p: p["path"]),
                          sort_keys=True, separators=(",", ":")).encode())
    require(seal == plan["profile"]["sourceRowsSha256"]
            == "7f96ec3a80d5f507dd30c1171613f73974790a3255e28438e75cdcc05fa6829b", "ROW_SEAL")
    tasks = rows(root)
    require(all(r["store_id"] == store["id"] for _, r in tasks)
            and not any(r["project"] == PROJECT for _, r in tasks), "PROJECT_ALREADY_USED")
    objects = list((root / "objects").iterdir())
    object_bytes = sum(p.lstat().st_size for p in objects)
    scratch_bytes = sum(filesystem_totals(d / "scratch") for d, _ in tasks
                        if (d / "scratch").exists())
    reserved = sum(r["expected_bytes"] for d, r in tasks
                   if r["state"] == "OPEN" or (d / "scratch").exists())
    other = Path(plan["otherRoot"])
    ancestors(other)
    other_meta, _ = read(other / "storage.json", 4096)
    other_store = json.loads(other_meta)
    # The other store has historical multi-megabyte task manifests. Reading
    # their reservation fields does not recover, adopt or mutate those tasks.
    other_tasks = rows(other, cap=4 * MIB)
    require(other.lstat().st_dev == root.lstat().st_dev
            and all(r["store_id"] == other_store["id"] for _, r in other_tasks),
            "OTHER_STORE")
    other_reserved = sum(r["expected_bytes"] for d, r in other_tasks
                         if r["state"] == "OPEN" or (d / "scratch").exists())
    policy = store["policy"]
    # Other projects can legitimately acquire new reservations. Enforce the
    # stricter current combined floor without rewriting either store policy,
    # lowering a floor, releasing a reservation or recovering historical work.
    require(policy["min_free_bytes"] >= 11 * 1024**3, "FREE_FLOOR_POLICY")
    effective_floor = max(policy["min_free_bytes"], 11 * 1024**3 + other_reserved)
    require(len(tasks) < policy["max_tasks"] and len(objects) + 50 <= policy["max_objects"]
            and object_bytes + QUOTA <= policy["store_quota_bytes"]
            and scratch_bytes + QUOTA <= policy["scratch_quota_bytes"]
            and shutil.disk_usage(root).free >= effective_floor + reserved + QUOTA,
            "CAPACITY")
    require(sys.version_info[:3] == (3, 12, 14), "PYTHON_RUNTIME")
    facts = {"kind": "REVIEWED_NATIVE_HTTPS_V2_SINGLE_TASK", "sourceCommit": plan["sourceCommit"],
             "sourceFiles": 36, "sourceBytes": 701939, "quotaBytes": QUOTA,
             "controlCapBytes": CONTROL_CAP, "sslPeakCapBytes": 1889779,
             "nodePeakCapBytes": 2063507, "stdoutCapBytes": 65536,
             "stderrCapBytesPerCommand": MIB, "sslStreamsGateBeforeNode": 16384,
             "taskCountBefore": len(tasks), "objectCountBefore": len(objects),
             "existingScratchBytes": scratch_bytes, "reservedBytes": reserved,
             "otherReservedBytes": other_reserved, "freeBytes": shutil.disk_usage(root).free,
             "effectiveCombinedFreeFloorBytes": effective_floor,
             "persistedStoragePoliciesChanged": False,
             "newTasks": 0, "NodeCommands": 0, "OpenSSLCommands": 0,
             "networkOrHostileCodeSandbox": False}
    return source_payloads, facts


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
    plan_raw = sys.argv[2].encode()
    require(len(plan_raw) <= 49152, "PLAN_CAP")
    plan = json.loads(plan_raw)
    source_raw, _ = read(Path(__file__).absolute(), 32768)
    payloads, facts = preflight(plan, source_raw, plan_raw)
    if sys.argv[1] == "--review":
        emit("Q65_LAUNCHER_READ_ONLY_REVIEW_PASS", **facts)
        return 0

    # Exact manager source bytes were reviewed and pinned before import. The
    # manager does not run a command or open a task merely by being imported.
    spec = importlib.util.spec_from_file_location("q65_owned_storage", plan["manager"]["path"])
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    store = module.Store(plan["root"], metadata_lock_timeout=30)
    task = store.task(PROJECT, expected_bytes=QUOTA, quota_bytes=QUOTA)
    emit("Q65_PRIVATE_TASK_OPENED", taskId=task.id)
    tools = {p["label"]: p["path"] for p in plan["tools"]}
    outcome = "FAILURE"
    with task:
        task.record("admission.json", facts)
        retained = {}
        for name, _, raw in payloads:
            p = task.write("sources/" + name, raw)
            retained[name] = task.preserve(p, sha(raw), len(raw))
        for name, raw in [("control/launcher.py", source_raw), ("control/private-plan.json", plan_raw)]:
            retained[name] = task.preserve(task.write(name, raw), sha(raw), len(raw))
        profile_raw = raw_json(plan["profile"])
        profile_path = task.write("control/namespace-profile.json", profile_raw)
        ssl_config_path = task.write("tls/openssl.cnf", SSL_CONFIG)
        key_path = task.write("tls/server-key.pem", b"")
        cert_path = task.write("tls/server-cert.pem", b"")
        ssl_argv = [tools["openssl"], "req", "-x509", "-newkey", "rsa:2048", "-nodes",
                    "-sha256", "-days", "1", "-set_serial", "1", "-batch",
                    "-config", str(ssl_config_path), "-keyout", str(key_path), "-out", str(cert_path)]
        base_env = {"PATH": "/usr/bin:/bin", "LANG": "C", "LC_ALL": "C", "TZ": "UTC",
                    "TMPDIR": str(task.scratch)}
        task.record("openssl-startup.json", {"argv": ssl_argv, "configSha256": sha(SSL_CONFIG),
                                            "keyAndCertificateCapsEach": 16384,
                                            "tlsOnly": True, "timeoutSeconds": 15,
                                            "stdoutCap": 8192, "stderrCap": MIB})
        emit("Q65_OPENSSL_ONCE_STARTING", taskId=task.id)
        with environment(dict(base_env, OPENSSL_CONF=str(ssl_config_path), RANDFILE="/dev/null")):
            ssl_receipt = task.run(ssl_argv, timeout=15, stdout_limit=8192, retain_argv=True)
        emit("Q65_OPENSSL_ONCE_CAPTURED", actualExit=ssl_receipt["actual_exit"],
             outputComplete=ssl_receipt["output_complete"])
        require(ssl_receipt["actual_exit"] == 0 and ssl_receipt["output_complete"], "SSL_FAILURE")
        require(ssl_receipt["stdout"]["bytes"] <= 8192 and ssl_receipt["stderr"]["bytes"] <= 8192,
                "SSL_STREAMS_TOO_LARGE_FOR_NODE_PHASE")
        tls_pins = []
        for role, path in [("key", key_path), ("cert", cert_path)]:
            raw, ids = read(path, 16384)
            require(raw and b"-----BEGIN " in raw, "TLS_OUTPUT")
            tls_pins.append({"role": role, "path": str(path), "bytes": len(raw),
                             "sha256": sha(raw), "identity": ids})
        by_label = {name: (path, raw) for name, path, raw in payloads}
        entry_path = by_label["app/" + ENTRY][0]
        preload_path = by_label["app/" + PRELOAD][0]
        source_pins = []
        entry_raw = by_label["app/" + ENTRY][1].decode()
        specs = json.loads(re.search(r"const SPECS = (\[[\s\S]*?\n\]);", entry_raw).group(1))
        identity_by_label = {p["logicalPath"]: p["identity"] for p in plan["profile"]["inputs"]}
        for p in specs + [next(p for p in plan["sourceRows"] if p["path"] == ENTRY)]:
            logical = ("packages/" if p["path"].startswith(("@x402/core/", "zod/")) else "app/") + p["path"]
            source_pins.append({k: p[k] for k in ("path", "bytes", "LF", "sha256")}
                               | {"identity": identity_by_label[logical]})
        node_env = dict(base_env, NODE_DISABLE_COMPILE_CACHE="1",
                        X402_NATIVE_HTTPS_V2_OPT_IN="reviewed-current-loopback-native-https-three-only",
                        X402_NATIVE_HTTPS_V2_PROFILE_PATH=str(profile_path),
                        X402_NATIVE_HTTPS_V2_PROFILE_SHA256=sha(profile_raw),
                        X402_OFFICIAL_PACKAGE_ROOTS=json.dumps(plan["packageRoots"], separators=(",", ":")),
                        X402_OFFICIAL_SOURCE_PINS=json.dumps(source_pins, separators=(",", ":")),
                        X402_NATIVE_TLS_PINS=json.dumps(tls_pins, separators=(",", ":")))
        # Exact file grants, plus this private task's scratch for its directory
        # guard. No filesystem write, child-process, worker or addon grants.
        reads = sorted({str(path) for _, path, _ in payloads} | {str(task.scratch)})
        node_argv = [tools["node"], "--permission", "--no-addons",
                     "--disallow-code-generation-from-strings", "--disable-proto=throw",
                     "--no-warnings", *["--allow-fs-read=" + p for p in reads],
                     "--require=node:https", "--import", str(preload_path), str(entry_path)]
        task.record("node-startup.json", {"argv": node_argv, "environment": node_env,
                                         "sourceRowsSha256": plan["profile"]["sourceRowsSha256"],
                                         "expectedCases": 3, "maximumConnections": 16,
                                         "NodeChildren": 0, "stdoutCap": 65536, "stderrCap": MIB,
                                         "timeoutSeconds": 45, "networkPermissionSandbox": False})
        # Recheck source contents/identities and all executable pins after TLS;
        # no second task or key-generation command is opened on a refusal.
        for p in plan["tools"]:
            check_pin(p, 130000000, 0 if p["label"] == "openssl" else None)
        for name, path, raw in payloads:
            current, ids = read(path)
            require(current == raw and ids == identity_by_label[name], "PRE_NODE_SOURCE_DRIFT")
        emit("Q65_NODE_ONCE_STARTING", taskId=task.id)
        with environment(node_env):
            node_receipt = task.run(node_argv, timeout=45, stdout_limit=65536, retain_argv=True)
        emit("Q65_NODE_ONCE_CAPTURED", actualExit=node_receipt["actual_exit"],
             outputComplete=node_receipt["output_complete"],
             stdout=node_receipt["stdout"], stderr=node_receipt["stderr"])
        raw = store.object(node_receipt["stdout"]["sha256"]).read_bytes()
        stderr = store.object(node_receipt["stderr"]["sha256"]).read_bytes()
        text = raw.decode("utf-8")
        markers = [json.loads(line.split("# pinned-native-https-v2-namespace ", 1)[1])
                   for line in text.splitlines() if "# pinned-native-https-v2-namespace " in line]
        diagnostics = [json.loads(line.split("# ", 1)[1]) for line in text.splitlines()
                       if '# {"kind":"OFFICIAL_X402_NATIVE_HTTPS_COMPOSITION_V2"' in line]
        passed = (node_receipt["actual_exit"] == 0 and node_receipt["output_complete"]
                  and not stderr and len(re.findall(r"^ok [123] - native HTTPS ", text, re.M)) == 3
                  and re.search(r"^# tests 3$", text, re.M)
                  and re.search(r"^# pass 3$", text, re.M)
                  and re.search(r"^# fail 0$", text, re.M)
                  and len(markers) == 1 and markers[0]["inputsVerifiedBeforeFixture"] == 36
                  and markers[0]["sourceRowsSha256"] == plan["profile"]["sourceRowsSha256"]
                  and markers[0]["bareImportOverrideHits"] == 3 and len(diagnostics) == 3
                  and [d["nativeConnectionAttemptsTotal"] for d in diagnostics] == [7, 11, 15]
                  and [d["authenticatedTlsHandshakesTotal"] for d in diagnostics] == [7, 11, 15]
                  and all(d["nativeClosePhase"] == "CLOSED" and d["serviceCalls"] == 0
                          and d["originalPaymentHeaderAndTupleRetained"] for d in diagnostics))
        for name, path, before in payloads:
            current, ids = read(path)
            require(current == before and ids == identity_by_label[name], "POST_SOURCE_DRIFT")
        for p in tls_pins:
            check_pin(p, 16384)
        # All generated control/TLS payloads remain private and retained. This
        # is not secure erasure and the public result must not include PEMs.
        for name, path in [("control/namespace-profile.json", profile_path),
                           ("tls/openssl.cnf", ssl_config_path),
                           ("tls/server-key.pem", key_path), ("tls/server-cert.pem", cert_path)]:
            value, _ = read(path)
            retained[name] = task.preserve(path, sha(value), len(value))
        result = {"status": "NATIVE_HTTPS_V2_PASS" if passed else "NATIVE_HTTPS_V2_FAILED_OR_INCOMPLETE",
                  "sourceCommit": plan["sourceCommit"], "sourceRowsSha256": plan["profile"]["sourceRowsSha256"],
                  "NodeCommands": 1, "OpenSSLCommands": 1, "NodeChildren": 0,
                  "node": node_receipt, "openssl": ssl_receipt,
                  "namespaceMarkers": markers, "diagnostics": diagnostics,
                  "rawStdoutBytes": len(raw), "rawStderrBytes": len(stderr),
                  "applicationFactoryExecuted": False, "fullP1": "NOT_ESTABLISHED",
                  "ordinaryInstalledNamespace": "NOT_QUALIFIED",
                  "economicPilot": "NO_GO", "retainedPayloads": len(retained)}
        task.record("qualification.json", result)
        task.package({name: value["sha256"] for name, value in retained.items()})
        outcome = "SUCCESS" if passed else "FAILURE"
        if not passed:
            task.close("FAILURE")
        emit("Q65_NATIVE_HTTPS_V2_RESULT", taskId=task.id,
             status=result["status"], nodeExit=node_receipt["actual_exit"],
             outputComplete=node_receipt["output_complete"], cases=len(diagnostics))
    emit("Q65_NATIVE_HTTPS_V2_TASK_CLOSED", taskId=task.id, outcome=outcome)
    return 0 if outcome == "SUCCESS" else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BaseException as error:
        if isinstance(error, SystemExit):
            raise
        emit("Q65_STOPPED_WITHOUT_RETRY", errorType=type(error).__name__)
        raise

