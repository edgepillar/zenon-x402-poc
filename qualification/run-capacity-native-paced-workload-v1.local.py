"""Real task-owned paced native capacity launcher; default SOURCE-ONLY.

No native permission is granted by this program, manifest, flags or source pass.
--execute needs a NEW exact finite paced scope, never an old unpaced R4 grant.
The manager must own a NEW unused private store/task; this launcher never
initializes/adopts a root, transforms a source, repeats a command or cleans
historical data. Source-only mode imports no SDK, manager or JavaScript.
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
from urllib.parse import unquote, urlparse

SELF = "qualification/run-capacity-native-paced-workload-v1.local.py"
MANIFEST = "qualification/capacity-native-paced-workload-v2.launch-inputs.json"
PLAN = "qualification/capacity-native-paced-workload-v1.plan.json"
PARENT = "qualification/capacity-native-paced-parent-v2.inputs.json"
INVENTORY = "qualification/capacity-native-full-graph-v3.inputs.json"
BASELINE = "qualification/issued-funding-post-native-vertical.inputs-v3.json"
KIND = "ONE_PACED_NATIVE_CAPACITY_V2_MANAGED_LAUNCH_SOURCE_NOT_EXECUTION"
FROZEN = (
    ("qualification/funding_tls_current_gate.py", "9777b8dca3c8c86e543c1f202c0cde248280ed3a108df4a688565ccf83132936"),
    ("qualification/native_capacity_full_profile_v3.py", "6928303c36f034fc295145563e40304641a91fe7db35d62eb364031bbcff7e6a"),
    ("qualification/native_capacity_managed_workload_v3.py", "6d4e2d726bd600b84be387147ee7cd6555daa8b72b8940a8719861a1078b4567"),
    ("qualification/native_capacity_paced_outer_capture_data_v1.py", "34623109c9810c1e04cc15efe9d8f39ab18ed894c4ae2b1c308fad95bde13e85"),
    ("qualification/native_capacity_paced_parent_profile_v1.py", "6160d349760d0dc98a477f543384736ccad055c889659a637229654e0d393f43"),
    ("qualification/native_capacity_paced_profile_bundle_v1.py", "2054c2a7f68ad7f2464a41b7e15eabade5d94ef31d1c36d61b52257d78a70f06"),
    ("qualification/native_capacity_paced_resource_plan_v1.py", "fb680d472ad261bf28aa2b703cf7b51ac93fed4a329ff1443cb021ea7a8991a9"),
    ("qualification/native_capacity_paced_timing_envelope_data_v1.py", "96d332f0a3e56edf03db54e47a078535d01a5e0665a3bf29834f582039cc0a99"),
    ("qualification/recovery_crash_native_profile.py", "75c2c9478b7e792a7bade739161af2bb8fb624cd407924ead2cf822dc23dacbd"),
    ("qualification/run-capacity-native-workload-v3.local.py", "4e2e29c31ae10c661bd5599506cda87482d030fc328dbde1e3e1066db5dba9e6"),
)
STORAGE_SHA = "a4d82a72214c9698fda7ae363c38b2470c08da5e2e04c63ee9284e43f638f081"
CLI_SHA = "0bf13cdc1f25a6b31ab14cfb124908808ca7ddc89073ecbcd0263bef4d52238c"
OPENSSL_SHA = "49db04c17e3a8c169ebc48a1149d78c165a86c04913203f46b2a14ce7f4a14fc"
HASH = re.compile(r"[0-9a-f]{64}")


def require(value, code):
    if not value:
        raise ValueError(code)


def identity(s):
    return [str(v) for v in (s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode, s.st_nlink,
        s.st_size, s.st_mtime_ns, s.st_ctime_ns)]


def no_links(path):
    require(path.is_absolute() and os.path.normpath(str(path)) == str(path), "ABSOLUTE_INPUT_PATH")
    for at in (path, *path.parents):
        require(not at.is_symlink(), "INPUT_LINK")


def read(path, maximum=262144):
    no_links(path); s = path.lstat()
    require(stat.S_ISREG(s.st_mode) and s.st_uid == os.getuid() and s.st_nlink == 1 and s.st_size <= maximum,
        "OWNED_INPUT_IDENTITY")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        require(identity(os.fstat(stream.fileno())) == identity(s), "INPUT_OPEN_IDENTITY")
        raw = stream.read(maximum + 1)
        require(len(raw) == s.st_size and identity(os.fstat(stream.fileno())) == identity(s), "INPUT_READ_IDENTITY")
    require(identity(path.lstat()) == identity(s), "INPUT_AFTER_IDENTITY")
    return raw, identity(s)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def pin(name, raw):
    return dict(path=name, bytes=len(raw), LF=raw.count(b"\n"), sha256=sha(raw),
        gitBlob=hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest())


def strict(raw):
    def pairs(items):
        out = {}
        for k, v in items:
            require(k not in out, "DUPLICATE_INPUT_KEY"); out[k] = v
        return out
    def constant(value):
        raise ValueError("NON_JSON_NUMERIC_CONSTANT")
    return json.loads(raw.decode("ascii"), object_pairs_hook=pairs, parse_constant=constant)


def same(left, right):
    """Bounded exact JSON DATA equality; bool is never an integer alias."""
    pending = [(left, right, 0)]; count = 0
    while pending:
        a, b, depth = pending.pop(); count += 1
        require(count <= 16384 and depth <= 16, "BOUNDED_DECLARATION_DATA")
        if type(a) is not type(b):
            return False
        if type(a) is dict:
            if set(a) != set(b) or not all(type(k) is str for k in a):
                return False
            pending.extend((a[k], b[k], depth + 1) for k in a)
        elif type(a) is list:
            if len(a) != len(b):
                return False
            pending.extend((v, w, depth + 1) for v, w in zip(a, b))
        elif a is None:
            continue
        elif type(a) not in (str, bool, int) or a != b:
            return False
    return True


def load_verified(path, raw, label):
    """Compile captured exact bytes, including manager dataclass registration."""
    spec = importlib.util.spec_from_file_location(label, path)
    require(spec is not None and spec.loader is not None, "EXACT_CONTROL_LOADER")
    value = importlib.util.module_from_spec(spec); sys.modules[label] = value
    exec(spec.loader.source_to_code(raw, str(path)), value.__dict__)
    require(read(path, max(262144, len(raw)))[0] == raw, "CONTROL_CHANGED_ON_LOAD")
    return value


def validate_launch_data(manifest, inputs, effects, policy):
    """Closed source declaration DATA only; no permission or native entry."""
    fields = {"kind", "version", "sourceParent", "pythonControls", "parentSelection", "legacyInventory",
        "legacyBaseline", "workload", "effectsCeiling", "storagePolicy", "parentSourceRowsSha256",
        "childSourceRowsSha256", "managedLauncherSourceAuthored", "nativeExecuted", "nativeAllowanceGranted",
        "nativeOsNetworkSandbox", "authority"}
    require(type(manifest) is dict and set(manifest) == fields, "CLOSED_PACED_LAUNCH_FIELDS")
    require(type(manifest["version"]) is int and manifest["version"] == 2 and manifest["kind"] == KIND
        and type(manifest["sourceParent"]) is str and re.fullmatch(r"[0-9a-f]{40}", manifest["sourceParent"])
        and manifest["managedLauncherSourceAuthored"] is True and manifest["authority"] == "NONE"
        and all(manifest[k] is False for k in ("nativeExecuted", "nativeAllowanceGranted", "nativeOsNetworkSandbox")),
        "SOURCE_DECLARATION_NOT_NATIVE_AUTHORITY")
    require(type(manifest["pythonControls"]) is list and all(type(p) is dict for p in manifest["pythonControls"])
        and [p.get("path") for p in manifest["pythonControls"]] == sorted([SELF] + [p for p, digest in FROZEN]),
        "EXACT_PYTHON_CONTROL_SET")
    require(type(inputs) is dict and set(inputs) == {SELF, *[p for p, digest in FROZEN], PARENT, INVENTORY, BASELINE, PLAN},
        "EXACT_LAUNCH_INPUT_BYTES")
    for row in manifest["pythonControls"]:
        require(same(pin(row["path"], inputs[row["path"]]), row), "EXACT_PYTHON_CONTROL_PIN")
    for name, digest in FROZEN:
        require(sha(inputs[name]) == digest, "FROZEN_CONTROL_NOT_REWRITTEN")
    for key, name in (("parentSelection", PARENT), ("legacyInventory", INVENTORY), ("legacyBaseline", BASELINE), ("workload", PLAN)):
        require(same(manifest[key], pin(name, inputs[name])), "EXACT_VERSIONED_SELECTION_PIN")
    require(same(manifest["effectsCeiling"], effects) and same(manifest["storagePolicy"], policy)
        and manifest["parentSourceRowsSha256"] == effects["parentSourceRowsSha256"]
        and manifest["childSourceRowsSha256"] == effects["childSourceRowsSha256"]
        and effects["authority"] == "NONE" and effects["nativeAllowanceGranted"] is False, "EXACT_PACED_EFFECT_RESERVATION")


def source_admission(repo, manifest_sha256):
    no_links(repo)
    raw, ident = read(repo / MANIFEST, 65536)
    require(type(manifest_sha256) is str and HASH.fullmatch(manifest_sha256) and sha(raw) == manifest_sha256,
        "EXPLICIT_PACED_LAUNCH_DIGEST")
    manifest = strict(raw); inputs = {}
    for name in [SELF] + [p for p, digest in FROZEN] + [PARENT, INVENTORY, BASELINE, PLAN]:
        inputs[name] = read(repo / name, 262144)
    require(Path(__file__).absolute() == repo / SELF, "ACTUAL_PACED_LAUNCHER_PATH")
    # Check ALL trusted Python pins before compiling any source control.
    for name, digest in FROZEN:
        require(sha(inputs[name][0]) == digest, "FROZEN_CONTROL_NOT_REWRITTEN")
    controls = {}
    for label, name in (("common", "qualification/run-capacity-native-workload-v3.local.py"),
            ("resource", "qualification/native_capacity_paced_resource_plan_v1.py"),
            ("producer", "qualification/native_capacity_paced_parent_profile_v1.py"),
            ("bundle", "qualification/native_capacity_paced_profile_bundle_v1.py"),
            ("outer", "qualification/native_capacity_paced_outer_capture_data_v1.py"),
            ("tls", "qualification/funding_tls_current_gate.py"),
            ("data", "qualification/native_capacity_managed_workload_v3.py")):
        controls[label] = load_verified(repo / name, inputs[name][0], "paced_launcher_" + label)
    resource, producer = controls["resource"], controls["producer"]
    workload = resource.capture_plan(strict(inputs[PLAN][0]))
    effects, policy = resource.resource_plan(workload), resource.storage_policy(workload)
    validate_launch_data(manifest, {n: pair[0] for n, pair in inputs.items()}, effects, policy)
    base, legacy = producer.load_dependencies(repo)
    selection = producer.capture_selection(base, legacy, inputs[PARENT][0], inputs[INVENTORY][0], inputs[BASELINE][0])
    require(len(selection["rows"]) == 549 and len(selection["legacyRows"]) == 543, "COMPLETE_UNCHANGED_SOURCE_GRAPHS")
    app = {}
    for row in selection["rows"]:
        if row["path"].startswith("app/"):
            name = row["path"][4:]; pair = inputs.get(name) or read(repo / name)
            require(pin(row["path"], pair[0]) == row, "ALL_PACED_APPLICATION_PINS"); app[name] = pair
    controls["base"], controls["legacy"] = base, legacy
    controls["captureValidator"] = controls["outer"].prepare_from_source(str(repo))
    def unchanged():
        require(read(repo / MANIFEST, 65536) == (raw, ident), "LAUNCH_SELECTION_CHANGED")
        for name, pair in {**inputs, **app}.items():
            require(read(repo / name, max(262144, len(pair[0]))) == pair, "LAUNCH_INPUT_CHANGED")
    unchanged()
    return dict(manifest=manifest, controls=controls, inputs=inputs, unchanged=unchanged,
        workload=workload, effects=effects, policy=policy)


def capacity_data(available, reserved, effects, roots):
    """Conservative DATA predicate, never a measurement or admission by itself."""
    require(type(available) is int and type(reserved) is int and type(roots) is int
        and 0 <= available <= 2**53 - 1 and 0 <= reserved <= 2**53 - 1 and 1 <= roots <= 256, "BOUNDED_CAPACITY_DATA")
    require(type(effects) is dict and type(effects.get("taskQuotaBytes")) is int and 0 < effects["taskQuotaBytes"] <= 2**53 - 1
        and type(effects.get("minimumFreeBytes")) is int and effects["minimumFreeBytes"] == 10 * 1024**3
        and type(effects.get("safetyMarginBytes")) is int and effects["safetyMarginBytes"] == 1024**3,
        "UNCHANGED_PRODUCTION_FLOOR")
    required = effects["minimumFreeBytes"] + effects["safetyMarginBytes"] + effects["taskQuotaBytes"] + reserved
    require(required <= 2**53 - 1 and available >= required, "PRODUCTION_FLOOR_AND_ALL_STORE_RESERVATIONS")
    return dict(availableBytes=available, requiredBytes=required, reservedBytes=reserved, storeRoots=roots,
        minimumFreeBytes=effects["minimumFreeBytes"], taskQuotaBytes=effects["taskQuotaBytes"])


def capacity(volume, volume_uuid, root, common, effects, own_task=None):
    """Read every recognized sibling store, not a task-storage name prefix."""
    common.no_links(volume); common.no_links(root)
    r = subprocess.run(["/usr/sbin/diskutil", "info", "-plist", str(volume)], capture_output=True, timeout=10)
    require(r.returncode == 0 and len(r.stdout) <= 65536 and len(r.stderr) <= 8192, "MOUNT_QUERY")
    v = plistlib.loads(r.stdout)
    require(v.get("VolumeUUID") == volume_uuid and v.get("MountPoint") == str(volume)
        and root.parent == volume / "spv2" and root.parent.is_dir()
        and root.parent.stat().st_dev == volume.stat().st_dev == root.stat().st_dev, "PINNED_PHYSICAL_STORAGE_PARENT")
    before = common.private_directory(root.parent) if stat.S_IMODE(root.parent.stat().st_mode) == 0o700 else identity(root.parent.stat())[:5]
    siblings = list(root.parent.iterdir()); require(len(siblings) <= 4096, "BOUNDED_STORAGE_PARENT")
    candidates = []
    for candidate in siblings:
        require(not candidate.is_symlink(), "UNCLASSIFIED_STORAGE_PARENT_LINK")
        if not candidate.is_dir():
            continue
        path = candidate / "storage.json"
        try:
            raw, ident = read(path, 65536)
        except FileNotFoundError:
            require(not (candidate / "tasks").exists() and not (candidate / "objects").exists(),
                "MANAGED_LAYOUT_WITHOUT_STORAGE_METADATA")
            continue
        meta = strict(raw)
        if meta.get("schema") != "zenon-owned-task-storage/v2":
            require(not (candidate / "tasks").exists() and not (candidate / "objects").exists(),
                "UNKNOWN_STORAGE_SCHEMA_WITH_MANAGED_LAYOUT")
            continue
        common.private_directory(candidate)
        require(candidate.stat().st_dev == root.stat().st_dev, "SIBLING_STORE_MOUNT")
        candidates.append((candidate, raw, ident, meta.get("id")))
    require(1 <= len(candidates) <= 256 and root in [v[0] for v in candidates]
        and len({v[3] for v in candidates}) == len(candidates), "COMPLETE_DISTINCT_STORE_SCOPE")
    reserved = sum(common.reservations(path, own_task)["reservedBytes"] for path, raw, ident, store_id in candidates)
    for path, raw, ident, store_id in candidates:
        require(read(path / "storage.json", 65536) == (raw, ident), "STORAGE_INVENTORY_CHANGED")
    require(identity(root.parent.stat())[:5] == before and set(root.parent.iterdir()) == set(siblings),
        "STORAGE_PARENT_CHANGED")
    space = os.statvfs(volume)
    return capacity_data(space.f_bavail * space.f_frsize, reserved, effects, len(candidates))


def recheck_profile_sources(profile, common, node):
    for row in profile["inputs"]:
        url = urlparse(row["url"])
        require(url.scheme == "file" and url.netloc == "", "ACTUAL_SOURCE_FILE_URL")
        path = Path(unquote(url.path)); common.no_links(path)
        require(identity(path.lstat()) == row["identity"], "INSTALLED_SOURCE_IDENTITY_CHANGED")
    common.no_links(node)
    require(identity(node.lstat()) == profile["runtime"]["nodeIdentity"], "PINNED_NODE_IDENTITY_CHANGED")


def native_intent(args, effects):
    """Flags are tripwires, NOT human authorization."""
    require(args.execute is True and args.native_selection == "one-new-approved-native-paced-capacity-v2"
        and args.approval_launch_sha256 == args.manifest_sha256
        and args.approval_plan_sha256 == effects["workloadPlanSha256"], "NEW_EXACT_PACED_FINITE_SCOPE_REQUIRED")


def execute(args, repo, admitted, planner):
    c, effects = admitted["controls"], admitted["effects"]
    common, resource, producer = c["common"], c["resource"], c["producer"]
    require(sys.platform == "darwin" and os.uname().machine == "arm64" and sys.version.split()[0] == "3.12.14",
        "NATIVE_DRIVER_RUNTIME")
    require(all(getattr(args, k) is not None for k in ("manager", "node", "root", "store_id", "storage_sha256",
        "volume", "volume_uuid")), "EXPLICIT_PRIVATE_NATIVE_INPUTS")
    require(re.fullmatch(r"[0-9a-f]{32}", args.store_id) and HASH.fullmatch(args.storage_sha256)
        and re.fullmatch(r"[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}", args.volume_uuid), "EXACT_PRIVATE_IDS")
    manager, node, root, volume = map(Path, (args.manager, args.node, args.root, args.volume))
    source_roots = [(path, common.private_directory(path) if stat.S_IMODE(path.stat().st_mode) == 0o700
        else identity(path.stat())[:5]) for path in (repo, Path(args.packages))]
    for path, ident in source_roots:
        common.no_links(path)
        require(stat.S_ISDIR(path.lstat().st_mode) and path.lstat().st_uid == os.getuid(), "OWNED_SOURCE_ROOT")
    manager_raw, manager_id = read(manager / "storage.py"); cli_raw, cli_id = read(manager / "cli.py", 65536)
    require(sha(manager_raw) == STORAGE_SHA and sha(cli_raw) == CLI_SHA, "APPROVED_UNCHANGED_MANAGER")
    meta_raw, meta_id = read(root / "storage.json", 65536); meta = strict(meta_raw)
    require(meta.get("id") == args.store_id and sha(meta_raw) == args.storage_sha256, "PINNED_NEW_PRIVATE_STORE")
    openssl = Path("/usr/bin/openssl"); openssl_id = common.binary(openssl, OPENSSL_SHA, 0)
    admitted["unchanged"]()
    capacity(volume, args.volume_uuid, root, common, effects)
    if args.pre_native_plan:
        print(json.dumps(dict(event="PACED_NATIVE_READ_ONLY_PREFLIGHT",nativeExecuted=False,
            expectedPeakBytes=effects["expectedPeakBytesReserved"], authority="NONE")), flush=True)
        return 0
    native_intent(args, effects)
    storage = load_verified(manager / "storage.py", manager_raw, "paced_actual_owned_storage")
    store = storage.Store(root, metadata_lock_timeout=5)
    require(store.id == args.store_id and same(dataclasses.asdict(store.policy), admitted["policy"]) and not store._tasks()
        and not store._objects() and not list((root / "object-records").iterdir())
        and {path.name for path in root.iterdir()} == {"storage.json", "objects", "object-records", "tasks", "locks"},
        "NEW_UNUSED_EXACT_POLICY_STORE")
    original_env, original_umask = dict(os.environ), os.umask(0o077)
    os.environ.clear(); os.environ.update(PATH="/usr/bin:/bin", LANG="C", LC_ALL="C", TZ="UTC",
        NODE_DISABLE_COMPILE_CACHE="1", WS_NO_BUFFER_UTIL="1", WS_NO_UTF_8_VALIDATE="1")
    source_profile = None; aliases = []; private_inputs = []; task = None; observed = None
    def before_native():
        admitted["unchanged"]()
        require(read(manager / "storage.py") == (manager_raw, manager_id)
            and read(manager / "cli.py", 65536) == (cli_raw, cli_id)
            and read(root / "storage.json", 65536) == (meta_raw, meta_id)
            and identity(openssl.lstat()) == openssl_id, "NATIVE_CONTROL_IDENTITY_CHANGED")
        require(source_profile is not None, "FULL_SOURCE_CONTEXT_BEFORE_NATIVE_COMMAND")
        for path, ident in source_roots:
            common.no_links(path)
            require(identity(path.lstat())[:5] == ident, "SOURCE_ROOT_IDENTITY_CHANGED")
        recheck_profile_sources(source_profile, common, node)
        for path, raw, ident in aliases + private_inputs:
            require(read(path, max(262144, len(raw))) == (raw, ident), "PRIVATE_INPUT_CHANGED")
        return capacity(volume, args.volume_uuid, root, common, effects,
            None if task is None else (store.id, task.id))
    try:
        with store.task("zenon-x402-paced-native-capacity-v2-once", expected_bytes=effects["expectedPeakBytesReserved"],
                quota_bytes=effects["taskQuotaBytes"]) as task:
            def retained(relative, raw):
                path = task.write(relative, raw)
                kept = task.preserve(path, sha(raw), len(raw))
                result = dict(path=str(store.object(kept["sha256"], kept["bytes"])), sha256=kept["sha256"])
                check_raw, ident = read(Path(result["path"]), max(262144, len(raw)))
                require(check_raw == raw, "EXACT_RETAINED_PRIVATE_INPUT")
                private_inputs.append((Path(result["path"]), raw, ident))
                return result
            for name in (MANIFEST, PLAN, PARENT):
                retained("inputs/" + Path(name).name, read(repo / name)[0])
            run_id = sha((store.id + ":" + task.id + ":" + producer.PARENT_SEAL + ":" + effects["workloadPlanSha256"]).encode("ascii"))
            task.record("scope.json", dict(runId=run_id, launchSha256=args.manifest_sha256,
                effectsCeiling=effects, automaticRetry=False, nativeOsNetworkSandbox=False))
            bundles, role_roots = [], []
            for ordinal, lane_id in enumerate(admitted["workload"]["laneIds"], 1):
                for role in ("PAYER", "SERVICE"):
                    relative = "lanes/" + format(ordinal, "02d") + "/" + role.lower()
                    marker = task.write(relative + "/admission.json", resource.canonical_bytes(dict(runId=run_id,
                        laneId=lane_id, role=role)), disposable=True)
                    private_inputs.append((marker, *read(marker)))
                    root_data = dict(path=str(marker.parent), identity=common.private_directory(marker.parent))
                    built = planner.plan_child(role, dict(runId=run_id, laneId=lane_id), root_data)
                    reference = retained("profiles/" + format(ordinal, "02d") + "-" + role.lower() + ".json", built["profileBytes"])
                    full = strict(built["profileBytes"])
                    bundle = dict(reference=dict(role=role, laneId=lane_id, path=reference["path"], sha256=reference["sha256"],
                        entryURL=full["entryURL"], preloaderURL=full["preloaderURL"],
                        rootPath=root_data["path"], rootIdentity=root_data["identity"]), profileBytes=built["profileBytes"])
                    bundles.append(bundle)
                    role_roots.append((role, relative))
            assembly = c["bundle"].assemble(planner, resource, admitted["workload"], run_id,
                dict(path=str(task.scratch), identity=common.private_directory(task.scratch)), bundles)
            built, planned = assembly["parentProfile"], assembly["entryPlan"]
            parent = retained("profiles/supervisor.json", built["profileBytes"])
            source_profile = strict(built["profileBytes"])
            entry_plan = retained("profiles/workload.json", planned["planBytes"])
            task.record("profile-entry-binding-data.json", assembly["summary"])
            config = task.write("tls.cnf", common.TLS_CONFIG)
            private_inputs.append((config, *read(config)))
            before_native()
            tls_receipt = task.run([str(openssl), "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "1",
                "-keyout", "/dev/stdout", "-config", str(config)], cwd=task.scratch,
                timeout=effects["opensslTimeoutSeconds"], stdout_limit=effects["opensslStdoutLimit"], retain_argv=False)
            task.record("tls-command.json", tls_receipt)
            require(tls_receipt["state"] == "COMPLETE" and tls_receipt["output_complete"] is True
                and type(tls_receipt["actual_exit"]) is int and tls_receipt["actual_exit"] == 0, "TEST_TLS_FAILED_OR_UNKNOWN")
            pem = read(store.object(tls_receipt["stdout"]["sha256"], tls_receipt["stdout"]["bytes"]), 16384)[0]
            material = c["tls"].split_test_tls_stdout(pem)
            objects = {name: retained("test-" + name, raw) for name, raw in material.items()}
            for role, relative in role_roots:
                for name in (("tls-cert.pem",) if role == "PAYER" else ("tls-key.pem", "tls-cert.pem")):
                    alias = task.materialize(objects[name]["sha256"], relative + "/" + name, method="clone")
                    alias.chmod(0o600); raw, ident = read(alias, 16384)
                    require(raw == material[name] and alias.stat().st_ino != Path(objects[name]["path"]).stat().st_ino,
                        "INDEPENDENT_TLS_ALIAS")
                    aliases.append((alias, raw, ident))
            os.environ.update(X402_NATIVE_CAPACITY_SUPERVISOR_SELECTION="native-capacity-paced-supervisor-source-draft-v1",
                X402_NATIVE_CAPACITY_WORKLOAD_SELECTION="native-capacity-paced-workload-source-draft-v1",
                X402_NATIVE_CAPACITY_RUN_SCOPE="one-reviewed-native-capacity-paced-parent-v1",
                X402_NATIVE_CAPACITY_RUN_ID=run_id, X402_NATIVE_CAPACITY_LANE_ID="workload.parent",
                X402_NATIVE_CAPACITY_SUPERVISOR_PROFILE_PATH=parent["path"], X402_NATIVE_CAPACITY_SUPERVISOR_PROFILE_SHA256=parent["sha256"],
                X402_NATIVE_CAPACITY_PLAN_PATH=entry_plan["path"], X402_NATIVE_CAPACITY_PLAN_SHA256=entry_plan["sha256"])
            before_native()
            receipt = task.run([str(node), "--no-addons", "--disallow-code-generation-from-strings", "--disable-proto=throw",
                "--unhandled-rejections=strict", "--import=" + str(repo / producer.PARENT_PRELOAD[4:]),
                str(repo / producer.PARENT_ENTRY[4:]), str(task.scratch)], cwd=repo, timeout=effects["nodeTimeoutSeconds"],
                stdout_limit=effects["nodeStdoutLimit"], retain_argv=False)
            task.record("parent-command.json", receipt)
            stdout = read(store.object(receipt["stdout"]["sha256"], receipt["stdout"]["bytes"]), effects["nodeStdoutLimit"])[0]
            stderr = read(store.object(receipt["stderr"]["sha256"], receipt["stderr"]["bytes"]), effects["nodeStderrLimit"])[0]
            observed = c["captureValidator"].validate(stdout, stderr, receipt, admitted["workload"], run_id)
            task.record("component-data.json", dict(observed=observed, storageCleanupStatus="NOT_ESTABLISHED", authority="NONE"))
            # Actual SQL/pin descendants remain unknown files. Never adopt them,
            # retry a command/payment, or erase evidence to force task cleanup.
        closed = strict(read(task.directory / "task.json", 4194304)[0])
        cleanup = strict(read(task.evidence / "cleanup.json", 65536)[0])
        storage_data = c["data"].closed_storage_data(closed, cleanup, store.id, task.id)
        print(json.dumps(dict(event="PACED_COMPONENT_DATA_STORAGE_SEPARATE", component=observed, storage=storage_data,
            nativeResourcesQualified=False, sustainableCapacityQualified=False, productionQualified=False, authority="NONE")), flush=True)
        return 0 if storage_data["storageDecision"] in ("CLEANED", "ALREADY_CLEAN") else 1
    finally:
        os.environ.clear(); os.environ.update(original_env); os.umask(original_umask)


def arguments(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    for name in ("repo", "manifest-sha256"):
        p.add_argument("--" + name, required=True)
    mode = p.add_mutually_exclusive_group()
    for name in ("source-only", "pre-native-plan", "execute"):
        mode.add_argument("--" + name, action="store_true")
    for name in ("packages", "node", "manager", "root", "store-id", "storage-sha256", "volume", "volume-uuid",
            "native-selection", "approval-launch-sha256", "approval-plan-sha256"):
        p.add_argument("--" + name)
    return p.parse_args(argv)


def main(argv=None):
    args = arguments(argv)
    require(sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode, "ISOLATED_NO_BYTECODE_REQUIRED")
    repo = Path(args.repo)
    admitted = source_admission(repo, args.manifest_sha256)
    print(json.dumps(dict(event="PACED_MANAGED_LAUNCH_SOURCE_ONLY_NOT_NATIVE", applicationFilesRead=145,
        packageFilesDeclared=404, sourceControls=len(FROZEN) + 1, effectsCeiling=admitted["effects"],
        completeManagedControlSourceAuthored=True, nativeAllowanceGranted=False, nativeExecuted=False, authority="NONE")), flush=True)
    planner = None
    if args.packages is not None:
        require(args.node is not None, "EXISTING_PINNED_NODE_REQUIRED")
        planner = admitted["controls"]["producer"].build_source_context(repo, args.packages, args.node)
        admitted["unchanged"]()
        print(json.dumps(dict(event="PACED_MANAGED_COMPLETE_SOURCE_READ_ONLY", **planner.info())), flush=True)
    if not args.execute and not args.pre_native_plan:
        return 0
    require(planner is not None, "COMPLETE_SOURCE_CONTEXT_BEFORE_NATIVE_PREFLIGHT")
    return execute(args, repo, admitted, planner)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, TypeError, RuntimeError) as problem:
        code = str(problem) if type(problem) is ValueError and re.fullmatch(r"[A-Z0-9_]+", str(problem)) else "PRESERVE_PRIVATE_OWNED_RECEIPTS"
        print(json.dumps(dict(event="PACED_MANAGED_REFUSED_OR_UNKNOWN", code=code,
            errorType=type(problem).__name__, automaticRetry=False, authority="NONE")), file=sys.stderr, flush=True)
        sys.exit(1)
