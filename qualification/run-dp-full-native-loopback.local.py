"""Unexecuted full native loopback application launcher; SOURCE-ONLY by default.

A flag, source manifest or earlier TLS/SDK grant is not human authority.
--pre-native-plan performs read-only source/package/binary/disk admission.
--execute requires separate full-graph authority and an explicitly NEW private
store with the exact declared policy/ID. Never initialize/adopt a root here.
No retry, source transform, native builtin replacement, installer or old cleanup.
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

MANIFEST = "qualification/dynamic-plasma-full-native-loopback.inputs.json"
BUILDER = "qualification/dynamic-plasma-full-native-loopback-profile.draft.py"
LOADER = "qualification/dynamic-plasma-full-native-loopback.preload.draft.mjs"
ENTRY = "qualification/dynamic-plasma-full-native-loopback.selection.draft.mjs"
GATE = "qualification/funding_tls_current_gate.py"
LEGACY = "qualification/run-funding-post-native-loopback-tls.local.py"
LAUNCHER = "qualification/run-dp-full-native-loopback.local.py"
POLICY = "qualification/dynamic-plasma-full-native-loopback.storage-policy.json"
HELPERS = (BUILDER, GATE, LEGACY, LAUNCHER, POLICY)
KIND = "ZENON_DP_FULL_NATIVE_LOOPBACK_THREE_CASE_NODE24"
SELECTION = "three-full-native-loopback-cases-only"
QUOTA = 4194304
TLS_CONFIG = b"""RANDFILE = /dev/null
[req]
prompt = no
distinguished_name = dn
x509_extensions = ext
[dn]
CN = localhost
[ext]
subjectAltName = @alt_names
basicConstraints = critical,CA:TRUE
keyUsage = critical,digitalSignature,keyEncipherment,keyCertSign
extendedKeyUsage = serverAuth
[alt_names]
DNS.1 = localhost
IP.1 = 127.0.0.1
"""


def require(ok, code):
    if not ok:
        raise ValueError(code)


def identity(s):
    return tuple(str(v) for v in (s.st_dev, s.st_ino, s.st_uid, s.st_gid,
        s.st_mode, s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns))


def read(path, cap=1048576):
    require(path.is_absolute() and str(path) == os.path.normpath(path), "ABSOLUTE_INPUT")
    for ancestor in (path, *path.parents):
        require(not ancestor.is_symlink(), "INPUT_LINK")
    before = path.lstat()
    require(stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid()
        and before.st_nlink == 1 and 0 <= before.st_size <= cap, "OWNED_INPUT")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        require(identity(os.fstat(stream.fileno())) == identity(before), "INPUT_OPEN")
        raw = stream.read(cap + 1)
        require(len(raw) == before.st_size and identity(os.fstat(stream.fileno())) == identity(before), "INPUT_READ")
    require(identity(path.lstat()) == identity(before), "INPUT_AFTER")
    return raw, identity(before)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("ascii")


def pin(name, raw):
    return dict(path=name, bytes=len(raw), LF=raw.count(b"\n"), sha256=sha(raw),
        gitBlob=hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest())


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    require(spec is not None and spec.loader is not None, "MODULE_SPEC")
    value = importlib.util.module_from_spec(spec)
    sys.modules[name] = value
    spec.loader.exec_module(value)
    return value


def ceiling():
    return dict(maximumRuns=1, selectedCases=3, opensslCommandsPerRun=1, nodeCommandsPerRun=1,
        nodeChildren=0, loopbackConnectionsPerRun=524, expectedConnectionsIfAllPass=272,
        newSqliteFiles=3, independentPinFiles=3, syntheticKeys=1, syntheticTransactionSignatures=3,
        maximumCandidatesPerSearch=4096, maximumReferenceCandidates=32768,
        maximumProducerCandidateReservation=12288, fixedVerificationCandidateReservation=16384,
        maximumAggregateCandidates=65536, taskQuotaBytes=QUOTA, externalNetwork=False,
        realWalletOrPayment=False, providerSigning=False, capabilitySigning=False,
        SDKPrepareBlock=False, nativeOsNetworkSandbox=False)


def policy():
    return dict(min_free_bytes=10737418240, safety_margin_bytes=1073741824,
        task_quota_bytes=QUOTA, scratch_quota_bytes=QUOTA, store_quota_bytes=QUOTA,
        metadata_quota_bytes=QUOTA, max_tasks=1, max_objects=192,
        max_commands_per_task=2, max_output_bytes=65536, abandoned_after_seconds=86400,
        unreferenced_after_seconds=1209600)


def source_admission(repo, expected_manifest):
    raw, manifest_id = read(repo / MANIFEST, 262144)
    require(re.fullmatch(r"[0-9a-f]{64}", expected_manifest) is not None and sha(raw) == expected_manifest, "MANIFEST_PIN")
    m = json.loads(raw)
    require(m["kind"] == "FULL_NATIVE_LOOPBACK_INPUT_INVENTORY_NOT_EXECUTION_RESULT"
        and m["applicationFiles"] == 74 and m["applicationRuntimeFiles"] == 69
        and m["packageFiles"] == 382 and m["sourceFiles"] == 456
        and canonical(m["effectsCeiling"]) == canonical(ceiling())
        and m["executionProfile"] == dict(mode="reviewed-native-fchmod", NodePermissionModel=False,
            nativeOsSandbox=False, sourceTransforms=False), "EXACT_FULL_SCOPE")
    require(len(m["applicationInputs"]) == 74
        and tuple(row["path"] for row in m["launcherInputs"]) == HELPERS, "EXACT_INPUT_COUNT")
    sources, ids = {}, {}
    for row in m["applicationInputs"] + m["launcherInputs"]:
        name = row["path"]
        if name.startswith("app/"):
            name = name[4:]
        require(type(name) is str and re.fullmatch(r"[A-Za-z0-9_./-]{1,200}", name)
            and not name.startswith("/") and ".." not in Path(name).parts and name not in sources, "INPUT_NAME")
        content, file_id = read(repo / name)
        require(pin(row["path"], content) == row, "SOURCE_PIN")
        sources[name], ids[name] = content, file_id
    require(ENTRY in sources and LOADER in sources
        and Path(__file__).absolute() == repo / LAUNCHER, "ACTUAL_LAUNCHER")
    require(canonical(json.loads(sources[POLICY])) == canonical(policy()), "STORE_POLICY_PIN")
    reference = m["packageInputsReference"]
    require(reference["path"] == "qualification/dynamic-plasma-original-funding-native-profile.inputs.json"
        and reference["selectedRows"] == 382 and reference["selectionPrefix"] == "packages/", "PACKAGE_REFERENCE_SCOPE")
    base, base_id = read(repo / reference["path"], 262144)
    require(pin(reference["path"], base) == {key: reference[key] for key in ("path", "bytes", "LF", "sha256", "gitBlob")}, "PACKAGE_REFERENCE_PIN")
    packages = [row for row in json.loads(base)["inputs"] if row["path"].startswith("packages/")]
    require(len(packages) == 382, "PACKAGE_DECLARATION_COUNT")
    public_rows = sorted(m["applicationInputs"] + packages, key=lambda row: row["path"])
    require(sha(canonical(public_rows)) == m["sourceRowsSha256"]
        and sum(row["bytes"] for row in public_rows) == m["sourceBytes"], "SOURCE_ROWS_PIN")

    def unchanged():
        require(identity((repo / MANIFEST).lstat()) == manifest_id, "MANIFEST_CHANGED")
        for name, content in sources.items():
            again, file_id = read(repo / name)
            require(again == content and file_id == ids[name], "SOURCE_CHANGED")
        again, file_id = read(repo / reference["path"], 262144)
        require(again == base and file_id == base_id, "PACKAGE_REFERENCE_CHANGED")

    unchanged()
    return m, raw, sources, packages, unchanged


def native_admission(args, repo, m, packages, unchanged):
    for name in ("manager", "node", "packages", "root", "volume", "volume_uuid"):
        require(getattr(args, name) is not None, "NATIVE_ARGUMENT_REQUIRED")
    manager, node, package_root, root, volume = map(Path,
        (args.manager, args.node, args.packages, args.root, args.volume))
    require(all(p.is_absolute() and str(p) == os.path.normpath(p)
        for p in (manager, node, package_root, root, volume)), "NATIVE_PATH_SELECTION")
    require(re.fullmatch(r"[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}", args.volume_uuid), "VOLUME_UUID")
    require(args.previous_root and len(args.previous_root) == len(set(args.previous_root))
        and len(args.previous_root) <= 32 and str(root) not in args.previous_root, "RESERVATION_SCOPE")
    unchanged()
    builder = load(repo / BUILDER, "dp_full_loopback_readonly_profile")
    gate = load(repo / GATE, "dp_full_loopback_pem_data")
    legacy = load(repo / LEGACY, "dp_full_loopback_unchanged_capacity_helpers")
    unchanged()
    built = builder.build_full_native_loopback_profile(str(repo), str(package_root),
        m["applicationInputs"], packages, m["allowedBuiltins"])
    require(built["sourceRowsSha256"] == m["sourceRowsSha256"] and built["profile"]["profileKind"] == KIND, "PRIVATE_PROFILE")
    storage_raw, storage_id = legacy.read(manager / "storage.py", 262144)
    cli_raw, cli_id = legacy.read(manager / "cli.py", 65536)
    require(legacy.sha(storage_raw) == legacy.STORAGE_SHA and legacy.sha(cli_raw) == legacy.CLI_SHA, "MANAGER_PIN")
    node_id = legacy.binary(node, legacy.NODE_SHA, os.getuid(), 121304480)
    openssl = Path("/usr/bin/openssl")
    openssl_id = legacy.binary(openssl, legacy.OPENSSL_SHA, 0)

    def before_native():
        unchanged()
        again = builder.build_full_native_loopback_profile(str(repo), str(package_root),
            m["applicationInputs"], packages, m["allowedBuiltins"])
        require(again["profileBytes"] == built["profileBytes"], "PRIVATE_PROFILE_CHANGED")
        require(identity(node.lstat()) == node_id and identity(openssl.lstat()) == openssl_id
            and identity((manager / "storage.py").lstat()) == storage_id
            and identity((manager / "cli.py").lstat()) == cli_id, "NATIVE_IDENTITY_CHANGED")
        return legacy.capacity(volume, args.volume_uuid, root, args.previous_root)

    capacity = before_native()
    return legacy, gate, manager, node, root, openssl, built, capacity, before_native


def native_capture(stdout, stderr, receipt):
    require(type(stdout) is bytes and type(stderr) is bytes
        and len(stdout) <= 65536 and len(stderr) <= 65536, "NATIVE_CAPTURE_BOUND")
    require(receipt["state"] == "COMPLETE" and receipt["output_complete"]
        and receipt["actual_exit"] == 0, "NATIVE_FAILURE_OR_UNKNOWN")
    lines = stdout.decode("ascii").splitlines()
    prefix = "# full-native-loopback-application-fixture "
    selected = [line[len(prefix):] for line in lines if line.startswith(prefix)]
    require(len(selected) == 1, "NATIVE_FOOTER")
    value = json.loads(selected[0])
    for key, expected in (("casesEntered", 3), ("casesCompleted", 3), ("createAttempts", 3),
        ("normalCloses", 2), ("expectedHeldStores", 1), ("unexpectedHeldStores", 0),
        ("secondaryCleanupFailures", 0), ("actualFullBoundedHttpsFactoryImported", True),
        ("actualNativeHTTPS", True), ("injectedReadFetchMaterialOrOwner", False),
        ("heldStoreNotForceClosed", True), ("liveOrProduction", False)):
        require(value[key] == expected, "NATIVE_SELECTED_COUNTS")
    for key, expected in (("tcpConnections", 272), ("tlsConnections", 272), ("rpcRequests", 270),
        ("fundingRequests", 2), ("signatures", 3), ("pinFiles", 3), ("lostAcks", 1),
        ("asyncFailures", 0), ("forcedServerSocketDestructions", 0),
        ("ownedRawSockets", 0), ("ownedTlsSockets", 0)):
        require(value["fixture"][key] == expected, "NATIVE_FIXTURE_COUNTS")
    require(value["fixture"]["aggregateCandidateReservation"] <= 65536, "NATIVE_WORK_BOUND")
    for key, expected in (("tests", 3), ("pass", 3), ("fail", 0), ("skipped", 0), ("cancelled", 0), ("todo", 0)):
        require([line for line in lines if line.startswith("# " + key + " ")] == ["# " + key + " " + str(expected)], "NATIVE_TAP_SET")
    require(lines.count("1..3") == 1 and not any(line.startswith("not ok ") for line in lines), "NATIVE_TAP_PLAN")
    namespace_prefix = "# pinned-dp-full-native-loopback-node-namespace "
    namespace = [json.loads(line[len(namespace_prefix):]) for line in lines if line.startswith(namespace_prefix)]
    require(len(namespace) == 1 and namespace[0]["inputsVerifiedBeforeFixture"] == 456
        and namespace[0]["sourceTransforms"] == 0, "NATIVE_NAMESPACE_FOOTER")
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True); parser.add_argument("--manifest-sha256", required=True)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--source-only", action="store_true")
    modes.add_argument("--pre-native-plan", action="store_true")
    modes.add_argument("--execute", action="store_true")
    for name in ("manager", "node", "packages", "root", "store-id", "volume", "volume-uuid"):
        parser.add_argument("--" + name)
    parser.add_argument("--previous-root", action="append")
    args = parser.parse_args()
    require(sys.dont_write_bytecode, "BYTECODE_DISABLED_REQUIRED")
    repo = Path(args.repo)
    require(repo.is_absolute() and str(repo) == os.path.normpath(repo), "REPO_SELECTION")
    m, manifest_raw, sources, packages, unchanged = source_admission(repo, args.manifest_sha256)
    print(json.dumps(dict(event="FULL_NATIVE_LOOPBACK_SOURCE_ADMITTED", applicationFiles=74,
        applicationRuntimeFiles=69, packageFilesDeclared=382, packageFilesRead=0,
        effectsExecuted=False, authority="NONE")), flush=True)
    if not args.execute and not args.pre_native_plan:
        return 0
    legacy, gate, manager, node, root, openssl, built, capacity, before_native = native_admission(
        args, repo, m, packages, unchanged)
    print(json.dumps(dict(event="FULL_NATIVE_LOOPBACK_PRE_NATIVE_PLAN", capacity=capacity,
        maximumRuns=1, nativeCommandsExecuted=0, authority="NONE")), flush=True)
    if not args.execute:
        require(not root.exists() and not root.is_symlink(), "FRESH_UNINITIALIZED_ROOT_REQUIRED")
        return 0
    require(args.store_id is not None and root.exists() and not root.is_symlink(), "EXPLICIT_NEW_STORE_REQUIRED")
    storage = legacy.module(manager / "storage.py", "storage")
    unchanged(); before_native()
    store = storage.Store(root, metadata_lock_timeout=5)
    require(store.id == args.store_id and canonical(dataclasses.asdict(store.policy)) == canonical(policy()), "EXACT_NEW_STORE_POLICY")
    require(len(store._tasks()) == 0, "ONE_SHOT_ALREADY_CONSUMED")
    os.umask(0o077)
    os.environ.clear()
    os.environ.update(PATH="/usr/bin:/bin", LANG="C", LC_ALL="C", TZ="UTC", NODE_DISABLE_COMPILE_CACHE="1",
        WS_NO_BUFFER_UTIL="1", WS_NO_UTF_8_VALIDATE="1", X402_DP_FULL_LOCAL_SELECTION=SELECTION,
        X402_DP_FULL_LOCAL_NATIVE_MODE="reviewed-native-fchmod")
    with store.task("zenon-x402-full-native-loopback-once", expected_bytes=QUOTA, quota_bytes=QUOTA) as task:
        for name, raw in [*sources.items(), (MANIFEST, manifest_raw)]:
            source = task.write("inputs/" + name, raw)
            task.preserve(source, sha(raw), len(raw))
        profile_path = task.write("profile-full-loopback.json", built["profileBytes"])
        retained = task.preserve(profile_path, built["profileSha256"], len(built["profileBytes"]))
        profile_path = store.object(retained["sha256"], retained["bytes"])
        os.environ.update(X402_DP_FULL_LOCAL_PROFILE_PATH=str(profile_path),
            X402_DP_FULL_LOCAL_PROFILE_SHA256=built["profileSha256"])
        task.record("scope.json", dict(effectsCeiling=ceiling(), sourceRowsSha256=m["sourceRowsSha256"],
            nativeOsNetworkSandbox=False, noNodePermissionModelBecauseActualStoreFchmod=True))
        config = task.write("tls.cnf", TLS_CONFIG)
        before_native()
        tls = task.run([str(openssl), "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256",
            "-days", "1", "-keyout", "/dev/stdout", "-config", str(config)], cwd=task.scratch,
            timeout=20, stdout_limit=65536, retain_argv=False)
        task.record("tls-generation-receipt.json", tls)
        require(tls["state"] == "COMPLETE" and tls["output_complete"] and tls["actual_exit"] == 0, "TEST_TLS_GENERATION_FAILED_OR_UNKNOWN")
        captured = store.object(tls["stdout"]["sha256"], tls["stdout"]["bytes"]).read_bytes()
        parts = gate.split_test_tls_stdout(captured)  # New TEST key remains private.
        for name, raw in parts.items():
            path = task.write(name, raw)
            again, _ = read(path, 16384)
            require(again == raw and stat.S_IMODE(path.lstat().st_mode) == 0o600, "TEST_TLS_INPUT")
        captured = None; parts = None
        before_native()
        argv = [str(node), "--no-addons", "--disallow-code-generation-from-strings", "--disable-proto=throw",
            "--unhandled-rejections=strict", "--test-reporter=tap", "--import=" + str(repo / LOADER),
            str(repo / ENTRY), str(task.scratch)]
        receipt = task.run(argv, cwd=repo, timeout=120, stdout_limit=65536, retain_argv=False)
        task.record("native-receipt.json", receipt)
        print(json.dumps(dict(event="FULL_NATIVE_LOOPBACK_PRIVATE_CAPTURE_RETAINED", actualExit=receipt["actual_exit"],
            outputComplete=receipt["output_complete"], stdout=receipt["stdout"], stderr=receipt["stderr"],
            rawOutputPrinted=False)), flush=True)
        before_native()
        stdout = store.object(receipt["stdout"]["sha256"], receipt["stdout"]["bytes"]).read_bytes()
        stderr = store.object(receipt["stderr"]["sha256"], receipt["stderr"]["bytes"]).read_bytes()
        result = native_capture(stdout, stderr, receipt)
        require(result["fixture"]["signatures"] == 3, "NATIVE_RESULT_SCOPE")
        task.record("selected-result.json", dict(nativeSelectedStatus="PASS", counts=result,
            sourceRowsSha256=m["sourceRowsSha256"], stdout=receipt["stdout"], stderr=receipt["stderr"],
            cleanupStatus="SEPARATE_PENDING_TASK_CLOSE", productionQualified=False))
        print(json.dumps(dict(event="FULL_NATIVE_LOOPBACK_SELECTED_PASS_BEFORE_TASK_CLOSE",
            cases=3, cleanupStatus="NOT_ESTABLISHED", productionQualified=False)), flush=True)
        for name in ("tls.cnf", "tls-key.pem", "tls-cert.pem"):
            raw, _ = read(task.scratch / name, 16384)
            task.preserve(task.scratch / name, sha(raw), len(raw))
    closed_raw, _ = read(task.directory / "task.json", 4194304)
    closed = json.loads(closed_raw)
    require(closed["state"] == "CLOSED", "TASK_CLOSE_UNKNOWN")
    cleanup_raw, _ = read(task.evidence / "cleanup.json", 262144)
    cleanup = json.loads(cleanup_raw)
    # SQLite/pin files are child-created, NOT registered disposable scratch.
    # Keep any HOLD/refusal, never adopt/delete them to manufacture clean close.
    print(json.dumps(dict(event="FULL_NATIVE_LOOPBACK_CAPTURE_COMPLETE", nativeSelectedStatus="PASS",
        taskState=closed["state"], taskOutcome=closed["outcome"], cleanup=cleanup,
        sourceRowsSha256=m["sourceRowsSha256"], productionQualified=False)), flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, TypeError) as problem:
        code = str(problem) if type(problem) is ValueError and re.fullmatch(r"[A-Z_]+", str(problem)) else "REVIEW_PRIVATE_RECEIPTS"
        print(json.dumps(dict(event="FULL_NATIVE_LOOPBACK_REFUSED_OR_FAILED", code=code,
            errorType=type(problem).__name__)), file=sys.stderr, flush=True)
        sys.exit(1)
