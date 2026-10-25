"""Seven-case funding native-stop managed controller SOURCE draft, not authority.

Default mode reads repository source only. Pre-native and execute flags require
a NEW exact finite human scope; flags/digests/DATA are merely tripwires. Never
reuse old four-case, DP or R4 allowances for this graph. No root initialization,
adoption, historical cleanup, transport retry or automatic rerun is provided.
No private manager/root, Node binary or native JavaScript is read in default mode.
"""
import argparse
import dataclasses
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import types

SELF = "qualification/run-funding-post-native-stop-tls-v2-managed.local.py"
MANIFEST = "qualification/funding-post-native-stop-tls-v2.managed-inputs.json"
DATA = "qualification/funding_post_native_stop_tls_v2_managed_data.py"
INNER = "qualification/funding-post-native-stop-tls-v2.inputs.json"
INNER_SHA = "d6ffe79e2699758c5b2bde909c3d5255c17356836b208e2d1bbdfea789f10b91"
GATE = "qualification/funding_post_native_stop_tls_v2_source_data.py"
GATE_SHA = "53f46884e6141d4a9de9d06568c47b4ca810f5d8bfeb9c64f33a5d88e55309c4"
FROZEN = (
    ("qualification/run-capacity-native-paced-timer-managed-v3.local.py", "5f3f6893559a9fdce3d7c19b9d729996a14f157822d1938bbad3ae25daeef22e"),
    ("qualification/run-capacity-native-workload-v3.local.py", "4e2e29c31ae10c661bd5599506cda87482d030fc328dbde1e3e1066db5dba9e6"),
    ("qualification/funding_tls_current_gate.py", "9777b8dca3c8c86e543c1f202c0cde248280ed3a108df4a688565ccf83132936"),
)


def require(value, code):
    if not value:
        raise ValueError(code)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def identity(info):
    return [str(value) for value in (info.st_dev, info.st_ino, info.st_uid, info.st_gid, info.st_mode,
        info.st_nlink, info.st_size, info.st_mtime_ns, info.st_ctime_ns)]


def no_links(path):
    require(path.is_absolute() and os.path.normpath(str(path)) == str(path), "ABSOLUTE_OWNED_INPUT_PATH")
    for at in (path, *path.parents):
        require(not at.is_symlink(), "NO_INPUT_LINKS")


def read(path, maximum=262144):
    no_links(path); before = path.lstat()
    require(stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid() and before.st_nlink == 1
        and before.st_size <= maximum, "BOUNDED_OWNED_INPUT_FILE")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        require(identity(os.fstat(stream.fileno())) == identity(before), "EXACT_INPUT_OPEN_IDENTITY")
        raw = stream.read(maximum + 1)
        require(len(raw) == before.st_size and identity(os.fstat(stream.fileno())) == identity(before), "EXACT_INPUT_READ_IDENTITY")
    require(identity(path.lstat()) == identity(before), "EXACT_INPUT_AFTER_IDENTITY")
    return raw, identity(before)


def decode(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, "DUPLICATE_SOURCE_JSON_KEY"); result[key] = value
        return result
    def invalid(_):
        raise ValueError("NON_INTEGER_SOURCE_JSON")
    return json.loads(raw.decode("ascii"), object_pairs_hook=pairs, parse_float=invalid, parse_constant=invalid)


def load_verified(path, raw, label):
    # Compile captured, manifest-authenticated Python bytes; no path-based loader
    # or bytecode cache. Register dataclass modules before executing their source.
    value = types.ModuleType(label); value.__file__ = str(path); sys.modules[label] = value
    exec(compile(raw, str(path), "exec"), value.__dict__)
    require(read(path, max(262144, len(raw)))[0] == raw, "CONTROL_CHANGED_DURING_LOAD")
    return value


def source_admission(repo, manifest_sha):
    require(sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode, "ISOLATED_NO_BYTECODE_PYTHON_REQUIRED")
    repo = Path(repo); no_links(repo)
    require(Path(__file__).absolute() == repo / SELF, "ACTUAL_MANAGED_CONTROLLER_PATH")
    manifest_pair = read(repo / MANIFEST, 65536)
    require(type(manifest_sha) is str and re.fullmatch(r"[0-9a-f]{64}", manifest_sha)
        and sha(manifest_pair[0]) == manifest_sha, "EXACT_MANAGED_MANIFEST_DIGEST")
    manifest = decode(manifest_pair[0])
    names = sorted((SELF, DATA, *(name for name, _ in FROZEN)))
    controls = {name: read(repo / name) for name in names}
    require(type(manifest.get("pythonControls")) is list and len(manifest["pythonControls"]) == len(names), "MANAGED_PYTHON_PIN_COUNT")
    for name, row in zip(names, manifest["pythonControls"]):
        raw = controls[name][0]
        require(row == dict(path=name, bytes=len(raw), LF=raw.count(b"\n"), sha256=sha(raw),
            gitBlob=hashlib.sha1(b"blob " + str(len(raw)).encode("ascii") + b"\0" + raw).hexdigest()), "PIN_BEFORE_PYTHON_LOAD")
    for name, digest in FROZEN:
        require(sha(controls[name][0]) == digest, "FROZEN_HELPER_PIN_BEFORE_LOAD")
    inner_pair = read(repo / INNER, 65536)
    require(sha(inner_pair[0]) == INNER_SHA, "UNCHANGED_INNER_MANIFEST_BEFORE_LOAD")
    data = load_verified(repo / DATA, controls[DATA][0], "funding_stop_managed_data_v2")
    inner = data.decode(inner_pair[0])
    selected = data.validate_manifest(manifest, {**{name: pair[0] for name, pair in controls.items()}, INNER: inner_pair[0]}, inner)
    require(data.INNER_GATE == GATE and data.INNER_GATE_SHA == GATE_SHA, "EXACT_INNER_GATE_DECLARATION")
    gate_pair = read(repo / GATE)
    require(sha(gate_pair[0]) == GATE_SHA, "INNER_GATE_PIN_BEFORE_LOAD")
    gate = load_verified(repo / GATE, gate_pair[0], "funding_stop_actual_inner_source_gate_v2")
    sources = {name: read(repo / name) for name in gate.INPUTS}
    inner_result = gate.validate_source_selection(inner, {name: pair[0] for name, pair in sources.items()})
    owned = {**controls, **sources, INNER: inner_pair, MANIFEST: manifest_pair}
    root_identity = identity(repo.lstat())[:5]
    def unchanged():
        no_links(repo)
        require(identity(repo.lstat())[:5] == root_identity, "SOURCE_DIRECTORY_IDENTITY_CHANGED")
        for name, pair in owned.items():
            require(read(repo / name) == pair, "SOURCE_INPUT_CHANGED")
    unchanged()
    return dict(repo=repo, manifest=manifest, data=data, gate=gate, owned=owned, unchanged=unchanged,
        summary=dict(**selected, innerInputRows=inner_result["inputRows"], applicationModules=inner_result["applicationModules"],
            proposedCases=inner_result["proposedCases"], sourceFilesRead=len(owned),
            managerImported=False, nodeBinaryRead=False, listenerSocketsOpened=0,
            managedLauncherSourceAuthored=True, managedLauncherNativeQualified=False, readyOrAuthorizedToExecute=False))


def native_selection(args, admitted):
    data = admitted["data"]
    require(args.native_selection == data.NATIVE_SELECTION
        and args.approval_manifest_sha256 == args.manifest_sha256
        and args.manifest_sha256 == sha(admitted["owned"][MANIFEST][0])
        and args.approval_source_rows_sha256 == data.INNER_SEAL, "NEW_EXACT_SEVEN_CASE_HUMAN_SCOPE_REQUIRED")
    require(type(args.pre_native_plan) is bool and type(args.execute) is bool
        and args.pre_native_plan is not args.execute, "EXACT_ONE_PRE_NATIVE_OR_EXECUTE_MODE")
    for name in ("manager", "root", "store_id", "storage_sha256", "volume", "volume_uuid", "node"):
        require(type(getattr(args, name)) is str and bool(getattr(args, name)), "EXPLICIT_PRIVATE_NATIVE_IDENTITIES_REQUIRED")
    require(re.fullmatch(r"[0-9a-f]{32}", args.store_id) and data.HASH.fullmatch(args.storage_sha256)
        and re.fullmatch(r"[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}", args.volume_uuid), "EXACT_PRIVATE_ROOT_AND_VOLUME_PINS")


def unused_root(root, common, data, store_id, storage_sha):
    common.private_directory(root)
    require({p.name for p in root.iterdir()} == {"storage.json", "objects", "object-records", "tasks", "locks"}, "EXACT_NEW_STORE_LAYOUT")
    for name in ("objects", "object-records", "tasks", "locks"):
        common.private_directory(root / name)
        require(not list((root / name).iterdir()), "NEW_UNUSED_PRIVATE_STORE_REQUIRED")
    pair = read(root / "storage.json", 65536); meta = data.decode(pair[0])
    require(stat.S_IMODE((root / "storage.json").lstat().st_mode) == 0o600
        and sha(pair[0]) == storage_sha and type(meta) is dict and set(meta) == {"schema", "id", "policy"}
        and meta["schema"] == "zenon-owned-task-storage/v2" and meta["id"] == store_id
        and data.same(meta["policy"], data.policy()), "NEW_STORE_METADATA_AND_POLICY_PIN")
    return pair


def native_context(args, admitted):
    # Even this read-only plan hashes native tools and inspects private storage;
    # it is NOT part of source-only DATA qualification or permission by a flag.
    native_selection(args, admitted)
    require(sys.platform == "darwin" and os.uname().machine == "arm64", "DARWIN_ARM64_NATIVE_SCOPE_ONLY")
    data, repo = admitted["data"], admitted["repo"]
    c = {}
    for (name, digest), label in zip(FROZEN, ("capacity", "common", "tls")):
        pair = admitted["owned"][name]
        require(sha(pair[0]) == digest, "EXACT_FROZEN_HELPER_LOAD")
        c[label] = load_verified(repo / name, pair[0], "funding_stop_frozen_" + label + "_v2")
    require(data.same(c["tls"].policy(), data.policy()), "UNCHANGED_FROZEN_TLS_STORAGE_POLICY")
    manager, root, volume, node = (Path(getattr(args, name)) for name in ("manager", "root", "volume", "node"))
    for path in (manager, root, volume, node):
        data.absolute(str(path)); no_links(path)
    require(root.parent == volume / "spv2" and root not in repo.parents and repo not in root.parents
        and root != repo and manager != root and root not in manager.parents
        and node != root and root not in node.parents, "DISJOINT_PHYSICAL_NATIVE_STORAGE")
    manager_pair = read(manager / "storage.py"); cli_pair = read(manager / "cli.py", 65536)
    require(sha(manager_pair[0]) == data.STORAGE_SHA and sha(cli_pair[0]) == data.CLI_SHA, "APPROVED_UNCHANGED_MANAGER_BYTES")
    meta_pair = unused_root(root, c["common"], data, args.store_id, args.storage_sha256)
    # One hash per binary at context admission. Subsequent phases require full
    # unchanged nine-field identities, not repeated 121 MB binary hashing.
    node_id = c["common"].binary(node, data.NODE_SHA, os.getuid())
    require(node_id[6] == "121304480", "PINNED_NODE_24_FILE_SIZE")
    openssl = Path("/usr/bin/openssl")
    openssl_id = c["common"].binary(openssl, data.OPENSSL_SHA, 0)
    effects = data.resources()
    def capacity(own_task=None):
        # This frozen full-sibling reader is selected explicitly. Never invoke
        # old common.capacity (33 roots) or the four-case TLS helper's reader.
        return c["capacity"].capacity(volume, args.volume_uuid, root, c["common"], effects, own_task)
    admitted["unchanged"]()
    report = capacity()
    return dict(**c, manager=manager, root=root, node=node, nodeId=node_id, openssl=openssl, opensslId=openssl_id,
        managerPair=manager_pair, cliPair=cli_pair, metaPair=meta_pair, checkCapacity=capacity, capacityReport=report)


def execute(args, admitted, context):
    require(args.execute is True and args.pre_native_plan is False, "ONE_EXPLICIT_NATIVE_EXECUTE_MODE")
    native_selection(args, admitted)
    data, gate, repo = admitted["data"], admitted["gate"], admitted["repo"]
    c, root, manager = context, context["root"], context["manager"]
    require(unused_root(root, c["common"], data, args.store_id, args.storage_sha256) == c["metaPair"], "STORE_UNCHANGED_BEFORE_MANAGER_IMPORT")
    storage = load_verified(manager / "storage.py", c["managerPair"][0], "funding_stop_actual_owned_storage_v2")
    store = storage.Store(root, metadata_lock_timeout=5)
    require(store.id == args.store_id and data.same(dataclasses.asdict(store.policy), data.policy())
        and not store._tasks() and not store._objects(), "EXACT_NEW_UNUSED_OWNED_STORE")
    original_env, original_umask = dict(os.environ), os.umask(0o077)
    task, observed, stage = None, None, "TASK_NOT_OPENED"
    private_inputs = []
    os.environ.clear(); os.environ.update(PATH="/usr/bin:/bin", LANG="C", LC_ALL="C", TZ="UTC", NODE_DISABLE_COMPILE_CACHE="1")
    def before_native():
        admitted["unchanged"]()
        require(read(manager / "storage.py") == c["managerPair"] and read(manager / "cli.py", 65536) == c["cliPair"]
            and read(root / "storage.json", 65536) == c["metaPair"], "MANAGER_OR_STORAGE_IDENTITY_CHANGED")
        for path, expected in ((c["node"], c["nodeId"]), (c["openssl"], c["opensslId"])):
            no_links(path); require(identity(path.lstat()) == expected, "NATIVE_BINARY_IDENTITY_CHANGED")
        for path, pair in private_inputs:
            require(read(path, 16384) == pair and stat.S_IMODE(path.lstat().st_mode) == 0o600, "PRIVATE_TEST_TLS_INPUT_CHANGED")
        return c["checkCapacity"](None if task is None else (store.id, task.id))
    try:
        before_native()
        with store.task("zenon-x402-funding-stop-tls-v2-once", expected_bytes=4194304, quota_bytes=4194304) as task:
            try:
                stage = "RETAINING_EXACT_REPOSITORY_INPUTS"
                for name, pair in admitted["owned"].items():
                    path = task.write("inputs/" + name, pair[0]); task.preserve(path, sha(pair[0]), len(pair[0]))
                task.record("scope.json", dict(managedManifestSha256=args.manifest_sha256,
                    innerSourceRowsSha256=data.INNER_SEAL, effectsCeiling=admitted["manifest"]["effectsCeiling"],
                    resources=data.resources(), automaticRetry=False, nativeOsNetworkSandbox=False))
                config = task.write("tls.cnf", c["common"].TLS_CONFIG)
                private_inputs.append((config, read(config, 16384)))
                stage = "ONE_TEST_TLS_COMMAND"
                task.record("pre-tls-capacity.json", before_native())
                tls = task.run([str(c["openssl"]), "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "1",
                    "-keyout", "/dev/stdout", "-config", str(config)], cwd=task.scratch, timeout=20, stdout_limit=16384, retain_argv=False)
                task.record("tls-command.json", tls)
                def streams(receipt, out_limit):
                    values = []
                    for label, maximum in (("stdout", out_limit), ("stderr", 65536)):
                        row = receipt[label]; raw = read(store.object(row["sha256"], row["bytes"]), maximum)[0]; values.append(raw)
                    return values
                tls_out, tls_err = streams(tls, 16384)
                data.validate_receipt(tls_out, tls_err, tls, 16384, 65536)
                components = c["tls"].split_test_tls_stdout(tls_out)
                for name, raw in components.items():
                    path = task.write(name, raw); pair = read(path, 16384)
                    require(pair[0] == raw and stat.S_IMODE(path.lstat().st_mode) == 0o600, "EXACT_PRIVATE_TEST_TLS_BYTES")
                    private_inputs.append((path, pair))
                # Tiny explicit component copies are quota charged. Preserve the
                # combined TLS stdout CAS as the original actual command capture.
                components = None; tls_out = None; tls_err = None
                stage = "ONE_SEVEN_CASE_NODE_COMMAND"
                plan = data.command_plan(str(repo), str(c["node"]), str(task.scratch), gate.APPLICATION, gate.ENTRY, gate.BODY)
                os.environ.clear(); os.environ.update(plan["env"])
                task.record("pre-node-capacity.json", before_native())
                receipt = task.run(plan["argv"], cwd=repo, timeout=plan["timeoutSeconds"], stdout_limit=plan["stdoutLimit"], retain_argv=False)
                task.record("native-command.json", receipt)
                stage = "VALIDATING_ACTUAL_COMPLETE_CAPTURE"
                admitted["unchanged"]()
                stdout, stderr = streams(receipt, 65536)
                observed = data.validate_native_capture(stdout, stderr, receipt, gate.CASES)
                task.record("component-data.json", dict(observed=observed, storageCleanupStatus="NOT_ESTABLISHED", authority="NONE"))
                stage = "PRESERVING_PRIVATE_TEST_TLS_INPUTS"
                for path, pair in private_inputs:
                    require(read(path, 16384) == pair, "TLS_INPUT_CHANGED_BEFORE_PRESERVATION")
                    task.preserve(path, sha(pair[0]), len(pair[0]))
                stage = "NORMAL_OWNED_TASK_CLOSE"
            except BaseException as error:
                # Never retry a command or overwrite actual command receipts.
                # A storage-lock refusal may also prevent this extra annotation;
                # original manager receipts/partial captures remain authoritative.
                try:
                    task.record("controller-failure.json", dict(stage=stage, errorType=type(error).__name__,
                        code=str(error) if type(error) is ValueError and re.fullmatch(r"[A-Z0-9_]+", str(error)) else "PRESERVE_ORIGINAL_PRIVATE_RECEIPTS",
                        automaticRetry=False, authority="NONE"))
                except (OSError, RuntimeError, ValueError):
                    pass
                raise
        closed = c["capacity"].metadata(read(task.directory / "task.json", 4194304)[0])
        cleanup = c["capacity"].metadata(read(task.evidence / "cleanup.json", 65536)[0])
        disposition = data.closed_storage(closed, cleanup, store.id, task.id)
        print(json.dumps(dict(event="FUNDING_STOP_TLS_V2_CAPTURE_AND_STORAGE_SEPARATE", component=observed,
            storage=disposition, nativeOsNetworkSandbox=False, fullDpQualified=False, productionQualified=False, authority="NONE")), flush=True)
        return 0 if disposition["taskOutcome"] == "SUCCESS" and disposition["cleanupQualified"] is True else 1
    finally:
        os.environ.clear(); os.environ.update(original_env); os.umask(original_umask)


def arguments(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("repo", "manifest-sha256"):
        parser.add_argument("--" + name, required=True)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--pre-native-plan", action="store_true")
    modes.add_argument("--execute", action="store_true")
    for name in ("native-selection", "approval-manifest-sha256", "approval-source-rows-sha256",
            "manager", "root", "store-id", "storage-sha256", "volume", "volume-uuid", "node"):
        parser.add_argument("--" + name)
    return parser.parse_args(argv)


def main(argv=None):
    args = arguments(argv); admitted = source_admission(args.repo, args.manifest_sha256)
    if not args.pre_native_plan and not args.execute:
        print(json.dumps(dict(event="FUNDING_STOP_TLS_V2_MANAGED_SOURCE_ONLY", **admitted["summary"])), flush=True)
        return 0
    context = native_context(args, admitted)
    if args.pre_native_plan:
        print(json.dumps(dict(event="FUNDING_STOP_TLS_V2_READ_ONLY_PRE_NATIVE_PLAN", nativeExecuted=False,
            managerImported=False, capacity=context["capacityReport"], authority="NONE")), flush=True)
        return 0
    return execute(args, admitted, context)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, TypeError, RuntimeError) as error:
        code = str(error) if type(error) is ValueError and re.fullmatch(r"[A-Z0-9_]+", str(error)) else "PRESERVE_PRIVATE_OWNED_RECEIPTS"
        print(json.dumps(dict(event="FUNDING_STOP_TLS_V2_REFUSED_OR_UNKNOWN", code=code,
            errorType=type(error).__name__, automaticRetry=False, authority="NONE")), file=sys.stderr, flush=True)
        sys.exit(1)
