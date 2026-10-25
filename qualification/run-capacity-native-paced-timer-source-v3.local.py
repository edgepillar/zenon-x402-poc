"""Pinned timer-parent V3 source admission; no native execution branch.

Admit reviewed Python DATA controls and all 147 application-source byte pins.
Package rows remain declarations: no installed package/Node/private root is
opened. Registry DATA may be composed through the genuine admitted producer.
This tool cannot execute, initialize a store, import SDK, or consume any old
native allowance. Unknown/native flags refuse before source admission.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import sys

SELF = "qualification/run-capacity-native-paced-timer-source-v3.local.py"
MANIFEST = "qualification/capacity-native-paced-timer-source-v3.launch-inputs.json"
PLAN = "qualification/capacity-native-paced-workload-v1.plan.json"
PARENT = "qualification/capacity-native-paced-timer-parent-v3.inputs.json"
INVENTORY = "qualification/capacity-native-full-graph-v3.inputs.json"
BASELINE = "qualification/issued-funding-post-native-vertical.inputs-v3.json"
KIND = "PACED_TIMER_PARENT_V3_SOURCE_ASSEMBLY_NOT_NATIVE_LAUNCH"
HASH = re.compile(r"[0-9a-f]{64}")
FROZEN = (
    ("qualification/native_capacity_full_profile_v3.py", "6928303c36f034fc295145563e40304641a91fe7db35d62eb364031bbcff7e6a"),
    ("qualification/native_capacity_managed_workload_v3.py", "6d4e2d726bd600b84be387147ee7cd6555daa8b72b8940a8719861a1078b4567"),
    ("qualification/native_capacity_paced_timer_envelope_data_v1.py", "88a27b04b2cf83315d91390eef0889bc4c4732336d7fb569487950d8a75a5a28"),
    ("qualification/native_capacity_paced_timer_outer_capture_data_v3.py", "580322dbbc0173a42090b28d02e84645999c0310de333fa41db8d897d3ac248d"),
    ("qualification/native_capacity_paced_timer_parent_profile_v3.py", "6d67d698b9c76088852426be0c1b8d11f90e067c7e850fde227f906a618727de"),
    ("qualification/native_capacity_paced_timer_profile_bundle_v3.py", "8dedf77f16e4984cd8b2f225965882e352cb2dd72fe01e28ee320a779d0c7efc"),
    ("qualification/native_capacity_paced_timer_resource_plan_v3.py", "5519fe20147ae3d03910daf089111a5803648bb5f245916659f07c151bf07997"),
    ("qualification/recovery_crash_native_profile.py", "75c2c9478b7e792a7bade739161af2bb8fb624cd407924ead2cf822dc23dacbd"),
)


def require(value, code):
    if not value:
        raise ValueError(code)


def identity(s):
    return [str(v) for v in (s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode,
        s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns)]


def read(path, maximum=262144):
    require(isinstance(path, Path) and path.is_absolute() and os.path.normpath(str(path)) == str(path),
        "CANONICAL_SOURCE_PATH")
    for at in (path, *path.parents):
        require(not stat.S_ISLNK(at.lstat().st_mode), "SOURCE_LINK")
    s = path.lstat(); ident = identity(s)
    require(stat.S_ISREG(s.st_mode) and s.st_uid == os.getuid()
        and s.st_nlink == 1 and 0 <= s.st_size <= maximum, "OWNED_BOUNDED_SOURCE")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        require(identity(os.fstat(stream.fileno())) == ident, "SOURCE_OPEN_IDENTITY")
        raw = stream.read(maximum + 1)
        require(len(raw) == s.st_size and identity(os.fstat(stream.fileno())) == ident, "SOURCE_READ_IDENTITY")
    require(identity(path.lstat()) == ident, "SOURCE_AFTER_IDENTITY")
    return raw, ident


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def pin(name, raw):
    return dict(path=name, bytes=len(raw), LF=raw.count(b"\n"), sha256=sha(raw),
        gitBlob=hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest())


def strict(raw):
    require(type(raw) is bytes and 0 < len(raw) <= 262144 and raw.isascii(), "BOUNDED_ASCII_JSON")
    def pairs(items):
        out = {}
        for key, value in items:
            require(key not in out, "DUPLICATE_JSON_KEY"); out[key] = value
        return out
    def invalid(_):
        raise ValueError("NON_INTEGER_JSON")
    def number(text):
        require(text != "-0" and len(text) <= 17, "SAFE_INTEGER_LEXEME")
        value = int(text)
        require(-(2**53 - 1) <= value <= 2**53 - 1, "SAFE_JSON_INTEGER")
        return value
    return json.loads(raw.decode("ascii"), object_pairs_hook=pairs, parse_float=invalid,
        parse_constant=invalid, parse_int=number)


def same(a, b):
    """Bounded exact built-ins; no JSON copies or bool/int aliasing."""
    nodes = 0
    def match(x, y, depth):
        nonlocal nodes
        nodes += 1
        require(nodes <= 16384 and depth <= 16, "BOUNDED_DATA_COMPARISON")
        if type(x) is not type(y):
            return False
        if type(x) is dict:
            return (len(x) <= 512 and all(type(k) is str for k in x) and x.keys() == y.keys()
                and all(match(x[k], y[k], depth + 1) for k in x))
        if type(x) is list:
            return len(x) <= 1024 and len(x) == len(y) and all(match(v, w, depth + 1) for v, w in zip(x, y))
        if type(x) is str:
            return len(x) <= 4096 and x == y
        require(x is None or type(x) in (bool, int), "EXACT_COMPARISON_TYPES")
        return x == y
    return match(a, b, 0)


def load_verified(path, raw, name):
    spec = importlib.util.spec_from_file_location(name, path)
    require(spec is not None and spec.loader is not None, "PINNED_CONTROL_SPEC")
    value = importlib.util.module_from_spec(spec); sys.modules[name] = value
    exec(spec.loader.source_to_code(raw, str(path)), value.__dict__)
    require(read(path)[0] == raw, "CONTROL_CHANGED_ON_LOAD")
    return value


def validate_launch_data(manifest, inputs):
    fields = {"kind", "version", "sourceParent", "pythonControls", "parentSelection", "legacyInventory",
        "legacyBaseline", "workload", "effectsCeiling", "storagePolicy", "parentSourceRowsSha256",
        "childSourceRowsSha256", "sourceOnly", "nativeExecutionImplemented", "nativeExecuted",
        "nativeAllowanceGranted", "nativeOsNetworkSandbox", "authority"}
    require(type(manifest) is dict and set(manifest) == fields, "EXACT_SOURCE_SELECTION_FIELDS")
    require(manifest["kind"] == KIND and type(manifest["version"]) is int and manifest["version"] == 3
        and type(manifest["sourceParent"]) is str and re.fullmatch(r"[0-9a-f]{40}", manifest["sourceParent"])
        and manifest["sourceOnly"] is True and manifest["authority"] == "NONE"
        and all(manifest[k] is False for k in ("nativeExecutionImplemented", "nativeExecuted",
            "nativeAllowanceGranted", "nativeOsNetworkSandbox")), "SOURCE_NOT_NATIVE_AUTHORITY")
    names = sorted([SELF] + [name for name, _ in FROZEN])
    require(type(inputs) is dict and set(inputs) == set(names + [PARENT, INVENTORY, BASELINE, PLAN])
        and type(manifest["pythonControls"]) is list and len(manifest["pythonControls"]) == len(names)
        and all(type(row) is dict for row in manifest["pythonControls"])
        and [row.get("path") for row in manifest["pythonControls"]] == names, "EXACT_SOURCE_CONTROL_SET")
    for row in manifest["pythonControls"]:
        require(same(pin(row["path"], inputs[row["path"]]), row), "WHOLE_PYTHON_SOURCE_PIN")
    for name, digest in FROZEN:
        require(sha(inputs[name]) == digest, "UNCHANGED_FROZEN_CONTROL")
    for field, name in (("parentSelection", PARENT), ("legacyInventory", INVENTORY),
            ("legacyBaseline", BASELINE), ("workload", PLAN)):
        require(same(pin(name, inputs[name]), manifest[field]), "WHOLE_SELECTION_INPUT_PIN")
    require(manifest["parentSourceRowsSha256"] == "0e0533ba2e3bfdf97b2670a0ee693c64ddc04ea93bf52b4e779d9d073cb51c90"
        and manifest["childSourceRowsSha256"] == "d756740994aeb53ebeee47320d732583d96381dfa8c00e18a30f414e70a77027",
        "DISTINCT_CURRENT_PARENT_AND_UNCHANGED_CHILD")


def validate_effects_data(manifest, resource, workload):
    """Compare every effect and policy field, not only selected scalar caps."""
    effects, policy = resource.resource_plan(workload), resource.storage_policy(workload)
    require(same(manifest["effectsCeiling"], effects) and same(manifest["storagePolicy"], policy),
        "COMPLETE_UNCHANGED_RESOURCE_AND_POLICY")
    return effects, policy


def source_admission(repo, digest):
    """Read source bytes only; never infer installed package or root facts."""
    require(sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode, "ISOLATED_SOURCE_ONLY_REQUIRED")
    repo = Path(repo)
    require(Path(__file__).absolute() == repo / SELF, "ACTUAL_TIMER_SOURCE_DRIVER_PATH")
    raw, ident = read(repo / MANIFEST, 65536)
    require(type(digest) is str and HASH.fullmatch(digest) and sha(raw) == digest, "EXPLICIT_SOURCE_SELECTION_DIGEST")
    manifest = strict(raw)
    names = sorted([SELF] + [name for name, _ in FROZEN]) + [PARENT, INVENTORY, BASELINE, PLAN]
    inputs = {name: read(repo / name) for name in names}
    validate_launch_data(manifest, {name: pair[0] for name, pair in inputs.items()})
    controls = {}
    for label, relative in (
            ("producer", "qualification/native_capacity_paced_timer_parent_profile_v3.py"),
            ("resource", "qualification/native_capacity_paced_timer_resource_plan_v3.py"),
            ("bundle", "qualification/native_capacity_paced_timer_profile_bundle_v3.py"),
            ("outer", "qualification/native_capacity_paced_timer_outer_capture_data_v3.py")):
        controls[label] = load_verified(repo / relative, inputs[relative][0], "timer_source_v3_" + label)
    producer, resource = controls["producer"], controls["resource"]
    base, legacy = producer.load_dependencies(repo)
    selected = producer.capture_selection(base, legacy, inputs[PARENT][0], inputs[INVENTORY][0], inputs[BASELINE][0])
    require(len(selected["rows"]) == 551 and len(selected["legacyRows"]) == 543, "COMPLETE_DISTINCT_SOURCE_GRAPHS")
    app = {}
    for row in selected["rows"]:
        if row["path"].startswith("app/"):
            name = row["path"][4:]; pair = inputs.get(name) or read(repo / name)
            require(same(pin(row["path"], pair[0]), row), "ALL_TIMER_APPLICATION_SOURCE_PINS")
            app[name] = pair
    workload = resource.capture_plan(strict(inputs[PLAN][0]))
    effects, policy = validate_effects_data(manifest, resource, workload)
    controls["base"], controls["legacy"] = base, legacy
    controls["captureValidator"] = controls["outer"].prepare_from_source(str(repo))
    def unchanged():
        require(read(repo / MANIFEST, 65536) == (raw, ident), "SOURCE_SELECTION_CHANGED")
        for name, pair in {**inputs, **app}.items():
            require(read(repo / name) == pair, "SOURCE_INPUT_CHANGED")
    unchanged()
    return dict(manifest=manifest, inputs=inputs, controls=controls, workload=workload, effects=effects,
        policy=policy, selection=selected, applicationInputs=app, unchanged=unchanged)


def arguments(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True)
    parser.add_argument("--manifest-sha256", required=True)
    parser.add_argument("--source-only", action="store_true")
    return parser.parse_args(argv)


def main(argv=None):
    args = arguments(argv)
    admitted = source_admission(args.repo, args.manifest_sha256)
    print(json.dumps(dict(event="PACED_TIMER_V3_SOURCE_ADMITTED_NOT_NATIVE",
        applicationFilesRead=147, packageRowsDeclared=404, sourceControls=len(FROZEN) + 1,
        parentSourceRows=551, childSourceRows=543, effectsCeiling=admitted["effects"],
        installedPackageBytesVerified=False, sourceOnly=True, nativeExecutionImplemented=False,
        nativeExecuted=False, nativeAllowanceGranted=False, authority="NONE")), flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, TypeError, SyntaxError) as problem:
        code = str(problem) if type(problem) is ValueError and re.fullmatch(r"[A-Z0-9_]+", str(problem)) else "REVIEW_SOURCE_INPUTS"
        print(json.dumps(dict(event="PACED_TIMER_V3_SOURCE_REFUSED", code=code, errorType=type(problem).__name__,
            automaticRetry=False, nativeExecuted=False, authority="NONE")), file=sys.stderr, flush=True)
        sys.exit(1)
