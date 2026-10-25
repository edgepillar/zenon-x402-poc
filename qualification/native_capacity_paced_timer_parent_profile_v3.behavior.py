"""Timer-parent V3 producer DATA controls; no files/roots/profiles are created.

The actual new producer and frozen R4/base Python sources run. Registry/root/file
identities are synthetic DTOs, NOT native observations. Child bytes are compared
to the real unchanged R4 producer, never a compact application or namespace.
"""
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import sys
import unittest


audited = dict(nativeProcesses=0, sockets=0, sqlite=0, writeOpens=0)
optimization_observed = None
def audit(event, args):
    if event in ("subprocess.Popen", "os.system", "os.fork", "os.posix_spawn"):
        audited["nativeProcesses"] += 1
        raise AssertionError("NO_NATIVE_PROCESS_IN_PROFILE_DATA")
    if event.startswith("socket."):
        audited["sockets"] += 1
        raise AssertionError("NO_SOCKET_IN_PROFILE_DATA")
    if event == "sqlite3.connect":
        audited["sqlite"] += 1
        raise AssertionError("NO_SQLITE_IN_PROFILE_DATA")
    if event == "open" and type(args[2]) is int and args[2] & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC):
        audited["writeOpens"] += 1
        raise AssertionError("NO_WRITE_OPEN_IN_PROFILE_DATA")
sys.addaudithook(audit)

repo = Path(__file__).absolute().parents[1]
producer_path = repo / "qualification/native_capacity_paced_timer_parent_profile_v3.py"
expected = os.environ.get("X402_PACED_TIMER_PARENT_PRODUCER_SHA256", "")
if (os.environ.get("X402_PACED_TIMER_PARENT_PROFILE_DATA_SELECTION") != "paced-timer-parent-profile-data-v3"
        or not (sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode)):
    raise ValueError("EXPLICIT_ISOLATED_PROFILE_DATA_SELECTION")
before = producer_path.lstat()
def ident(s):
    return [s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode, s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns]
for at in (producer_path, *producer_path.parents):
    if at.is_symlink():
        raise ValueError("PRODUCER_SOURCE_LINK")
if not stat.S_ISREG(before.st_mode) or before.st_uid != os.getuid() or before.st_nlink != 1 or before.st_size > 65536:
    raise ValueError("PRODUCER_SOURCE_IDENTITY")
with os.fdopen(os.open(producer_path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
    if ident(os.fstat(stream.fileno())) != ident(before):
        raise ValueError("PRODUCER_SOURCE_OPEN")
    raw = stream.read(65537)
    if len(raw) != before.st_size or ident(os.fstat(stream.fileno())) != ident(before):
        raise ValueError("PRODUCER_SOURCE_READ")
if len(expected) != 64 or hashlib.sha256(raw).hexdigest() != expected:
    raise ValueError("PRODUCER_SOURCE_PIN")
spec = importlib.util.spec_from_file_location("actual_paced_timer_parent_profile_v3", producer_path)
p = importlib.util.module_from_spec(spec); sys.modules[spec.name] = p
exec(spec.loader.source_to_code(raw, str(producer_path)), p.__dict__)
if p.read_owned(producer_path) != (raw, [str(v) for v in ident(before)]):
    raise ValueError("PRODUCER_SOURCE_CHANGED")
b, old = p.load_dependencies(repo)
manifest_raw = p.read_owned(repo / p.MANIFEST, 65536)[0]
inventory_raw = p.read_owned(repo / old.INVENTORY, 65536)[0]
baseline_raw = p.read_owned(repo / old.BASELINE, 262144)[0]
selection = p.capture_selection(b, old, manifest_raw, inventory_raw, baseline_raw)
old_selection = old.capture_selection(b, inventory_raw, baseline_raw)
APP, PACKAGES = "/synthetic-source", "/synthetic-packages"

def capture(row, n):
    app = row["path"].startswith("app/")
    return dict(logicalPath=row["path"], url=b.source_url(APP if app else PACKAGES, row["path"][4:] if app else row["path"][9:]),
        bytes=row["bytes"], LF=row["LF"], sha256=row["sha256"], gitBlob=row["gitBlob"],
        identity=["1", str(1000 + n), str(os.getuid()), "20", str(stat.S_IFREG | 0o644), "1", str(row["bytes"]), "100", "100"])
captures = [capture(row, n) for n, row in enumerate(old_selection["rows"])]
INDEX = {row["logicalPath"]: row for row in captures}
REGISTRY = dict(inputs=captures, bareBindings=[dict(parentURL=INDEX[edge["parent"]]["url"],
    specifier=edge["specifier"], targetURL=INDEX[edge["target"]]["url"]) for edge in old_selection["bareBindings"]],
    runtime=dict(node="24.19.0", platform="darwin", arch="arm64", nodeSha256=old.NODE_SHA,
        nodeIdentity=["1", "90", str(os.getuid()), "20", str(stat.S_IFREG | 0o755), "1", str(old.NODE_BYTES), "100", "100"]),
    sourceRowsSha256=old.SOURCE_SEAL, applicationRoot=APP, packageRoot=PACKAGES,
    sourceIdentitiesRead=False, sourcesCopied=False, nativeExecuted=False, authority="NONE")
EXTRA = [capture(row, n + 600) for n, row in enumerate(selection["extraRows"])]
CONTEXT = dict(runId="a"*64, laneId="supervisor")
ROOT = dict(path="/synthetic-owned-parent", identity=["1", "800", str(os.getuid()), "20", str(stat.S_IFDIR | 0o700)])

def params():
    return dict(base=b, legacy=old, registry=copy.deepcopy(REGISTRY), extra_captures=copy.deepcopy(EXTRA),
        manifest_raw=manifest_raw, inventory_raw=inventory_raw, baseline_raw=baseline_raw)

def planner(args=None):
    return p.prepare_from_registry_data(**(params() if args is None else args))

def child(plans, role, n, lane="lane.one"):
    root = dict(path="/synthetic-owned-child-" + str(n),
        identity=["1", str(900 + n), str(os.getuid()), "20", str(stat.S_IFDIR | 0o700)])
    result = plans.plan_child(role, dict(runId=CONTEXT["runId"], laneId=lane), root)
    profile = b._private_json(result["profileBytes"], 524288)
    ref = dict(role=role, laneId=lane, path="/synthetic-profile-" + str(n) + ".json",
        sha256=result["profileSha256"], entryURL=profile["entryURL"], preloaderURL=profile["preloaderURL"],
        rootPath=root["path"], rootIdentity=root["identity"])
    return dict(reference=ref, profileBytes=result["profileBytes"])

def pair(plans):
    return [child(plans, "PAYER", 1), child(plans, "SERVICE", 2)]

class Profiles(unittest.TestCase):
    maxDiff = 400
def check(name, fn):
    def run(self):
        fn(self)
    run.__name__ = "test_" + name
    setattr(Profiles, run.__name__, run)

def reject_preparation(name, edit):
    def run(self):
        args = params(); edit(args)
        with self.assertRaises(ValueError):
            planner(args)
    check("preparation_refuses_" + name, run)

def reject_parent(name, edit):
    def run(self):
        plans = planner()
        args = dict(context=copy.deepcopy(CONTEXT), root=copy.deepcopy(ROOT), children=pair(plans))
        edit(args)
        with self.assertRaises(ValueError):
            plans.plan_parent(**args)
    check("parent_refuses_" + name, run)

def setat(value, path, replacement):
    for k in path[:-1]:
        value = value[k]
    value[path[-1]] = replacement

def exact_r4_child(self, role):
    plans = planner(); actual = child(plans, role, 1)
    ref = actual["reference"]
    expected_old = old.plan_role_profile(b, REGISTRY, inventory_raw, baseline_raw, role,
        dict(runId=CONTEXT["runId"], laneId=ref["laneId"]), dict(path=ref["rootPath"], identity=ref["rootIdentity"]), [])
    self.assertTrue(actual["profileBytes"] == expected_old["profileBytes"], "whole child bytes must equal genuine frozen R4 producer")
    self.assertEqual(ref["sha256"], expected_old["profileSha256"])
    value = b._private_json(actual["profileBytes"], 524288)
    self.assertEqual(value["profileVersion"], 3)
    self.assertEqual(len(value["inputs"]), 543)
    self.assertEqual(value["sourceRowsSha256"], p.CHILD_SEAL)
    self.assertNotIn("childSourceRowsSha256", value)
    self.assertFalse(set(p.EXTRAS).intersection(row["logicalPath"] for row in value["inputs"]))
for role in ("PAYER", "SERVICE"):
    check("whole_" + role.lower() + "_bytes_equal_real_unchanged_r4_producer", lambda self, role=role: exact_r4_child(self, role))

def exact_parent(self):
    plans = planner(); children = pair(plans)
    result = plans.plan_parent(CONTEXT, ROOT, children)
    value = b._private_json(result["profileBytes"], 524288)
    self.assertEqual(value["profileVersion"], 3); self.assertEqual(value["profileKind"], p.PARENT_KIND)
    self.assertEqual(value["sourceRowsSha256"], p.PARENT_SEAL); self.assertEqual(value["childSourceRowsSha256"], p.CHILD_SEAL)
    self.assertEqual(len(value["inputs"]), 551); self.assertEqual(value["childProfiles"], [c["reference"] for c in children])
    self.assertEqual(sum(r["logicalPath"].startswith("app/") for r in value["inputs"]), 147)
    self.assertEqual(sum(r["logicalPath"].startswith("packages/") for r in value["inputs"]), 404)
    self.assertTrue(result["profileBytes"] == old.canonical(value) + b"\n", "canonical whole parent bytes")
    self.assertEqual(result["profileSha256"], hashlib.sha256(result["profileBytes"]).hexdigest())
    self.assertEqual(result["profileBytesCount"], len(result["profileBytes"]))
    self.assertLessEqual(result["profileBytesCount"], 524288)
    self.assertIn("node:child_process", value["allowedBuiltins"])
    for field in ("sourceIdentitiesAuthenticated", "rootIdentitiesAuthenticated", "privateChildProfilesAuthenticated",
            "privateProfileIsNativeAuthority", "nativeExecuted"):
        self.assertIs(result[field], False)
    self.assertEqual(result["authority"], "NONE")
check("parent_contains_eight_extensions_and_only_real_legacy_child_references", exact_parent)

def maximum_lanes(self):
    plans = planner()
    children = [child(plans, role, 2*n+i, "lane."+str(n)) for n in range(1, 17) for i, role in enumerate(("PAYER", "SERVICE"))]
    result = plans.plan_parent(CONTEXT, ROOT, children)
    self.assertEqual(len(b._private_json(result["profileBytes"], 524288)["childProfiles"]), 32)
    self.assertLessEqual(result["profileBytesCount"], 524288)
    self.assertFalse(plans.info()["sourceFilesReadOnlyVerified"])
    self.assertEqual(plans.info()["nodeBinaryHashesForContext"], 0)
check("sixteen_complete_lanes_bounded_without_source_reads_or_node_rehashes", maximum_lanes)

def detach(self):
    args = params(); before_args = copy.deepcopy({k:v for k,v in args.items() if k not in ("base", "legacy")})
    plans = planner(args); one = pair(plans)
    args["registry"]["inputs"][0]["identity"][1] = "999999"
    args["registry"]["runtime"]["nodeIdentity"][1] = "999999"
    args["extra_captures"][0]["url"] = "file:///changed"
    two = pair(plans)
    self.assertTrue(one == two, "prepared context must own detached input DATA")
    self.assertEqual(before_args["registry"]["inputs"][0]["identity"][1], REGISTRY["inputs"][0]["identity"][1])
check("prepared_source_records_are_detached_not_mutated_or_retained_from_caller", detach)

def unchanged_inputs(self):
    plans = planner(); args = dict(context=copy.deepcopy(CONTEXT), root=copy.deepcopy(ROOT), children=pair(plans))
    previous = copy.deepcopy(args)
    plans.plan_parent(**args)
    self.assertTrue(args == previous, "profile planning must not mutate roots or child references")
check("planning_does_not_mutate_caller_context_root_or_children", unchanged_inputs)

def info(self):
    data = planner().info()
    self.assertEqual(data["sourceFilesRead"], 0)
    for field in ("sourceFilesReadOnlyVerified", "privateRootsOpened", "profilesWritten", "nativeExecuted", "privateProfileIsNativeAuthority"):
        self.assertIs(data[field], False)
    self.assertEqual(data["sourceOrPackageTreeCopies"], 0)
    self.assertEqual(data["authority"], "NONE")
    self.assertNotIn(APP, json.dumps(data)); self.assertNotIn(PACKAGES, json.dumps(data))
check("declared_registry_information_is_not_file_observation_or_native_authority", info)

def caller_read_claim(self):
    args = params(); args["registry"]["sourceIdentitiesRead"] = True
    self.assertIs(planner(args).info()["sourceFilesReadOnlyVerified"], False)
check("caller_read_claim_does_not_become_an_observed_source_context", caller_read_claim)

reject_preparation("changed_manifest_bytes", lambda a: a.update(manifest_raw=manifest_raw+b" "))
reject_preparation("changed_legacy_inventory", lambda a: a.update(inventory_raw=inventory_raw+b" "))
reject_preparation("changed_legacy_baseline", lambda a: a.update(baseline_raw=baseline_raw+b" "))
reject_preparation("missing_extension_capture", lambda a: a["extra_captures"].pop())
reject_preparation("extra_extension_capture", lambda a: a["extra_captures"].append(copy.deepcopy(a["extra_captures"][0])))
reject_preparation("extension_digest_mismatch", lambda a: a["extra_captures"][0].update(sha256="0"*64))
reject_preparation("extension_source_url_redirect", lambda a: a["extra_captures"][0].update(url="file:///different"))
reject_preparation("extension_hardlink_identity", lambda a: setat(a, ["extra_captures", 0, "identity", 5], "2"))
reject_preparation("extension_directory_instead_of_file", lambda a: setat(a, ["extra_captures", 0, "identity", 4], str(stat.S_IFDIR | 0o700)))
reject_preparation("legacy_source_relabel", lambda a: a["registry"].update(sourceRowsSha256="0"*64))
reject_preparation("legacy_source_transform_claim", lambda a: a["registry"].update(sourcesCopied=True))
reject_preparation("legacy_native_execution_claim", lambda a: a["registry"].update(nativeExecuted=True))
reject_preparation("legacy_authority_claim", lambda a: a["registry"].update(authority="NATIVE"))
reject_preparation("legacy_missing_source_row", lambda a: a["registry"]["inputs"].pop())
reject_preparation("legacy_modified_source_identity", lambda a: a["registry"]["inputs"][0].update(sha256="0"*64))
reject_preparation("legacy_redirected_bare_binding", lambda a: a["registry"]["bareBindings"][0].update(targetURL="file:///different"))
reject_preparation("wrong_runtime_node_hash", lambda a: a["registry"]["runtime"].update(nodeSha256="0"*64))
reject_preparation("wrong_runtime_node_version", lambda a: a["registry"]["runtime"].update(node="24.20.0"))

reject_parent("empty_children", lambda a: a.update(children=[]))
reject_parent("one_unpaired_child", lambda a: a["children"].pop())
reject_parent("duplicate_role", lambda a: a["children"][1]["reference"].update(role="PAYER"))
reject_parent("duplicate_profile_path", lambda a: a["children"][1]["reference"].update(path=a["children"][0]["reference"]["path"]))
reject_parent("duplicate_digest", lambda a: a["children"][1]["reference"].update(sha256=a["children"][0]["reference"]["sha256"]))
reject_parent("duplicate_root_path", lambda a: a["children"][1]["reference"].update(rootPath=a["children"][0]["reference"]["rootPath"]))
reject_parent("duplicate_physical_root", lambda a: a["children"][1]["reference"].update(rootIdentity=copy.deepcopy(a["children"][0]["reference"]["rootIdentity"])))
reject_parent("parent_child_root_alias", lambda a: a["children"][0]["reference"].update(rootPath=a["root"]["path"]))
reject_parent("parent_child_physical_alias", lambda a: a["children"][0]["reference"].update(rootIdentity=copy.deepcopy(a["root"]["identity"])))
reject_parent("profile_path_is_parent_root", lambda a: a["children"][0]["reference"].update(path=a["root"]["path"]))
reject_parent("wrong_child_preloader", lambda a: a["children"][0]["reference"].update(preloaderURL="file:///different"))
reject_parent("wrong_child_entry", lambda a: a["children"][0]["reference"].update(entryURL="file:///different"))
reject_parent("missing_child_field", lambda a: a["children"][0]["reference"].pop("path"))
reject_parent("extra_child_field", lambda a: a["children"][0]["reference"].update(execute=True))
reject_parent("wrong_child_bytes_type", lambda a: a["children"][0].update(profileBytes="not bytes"))
reject_parent("truncated_child_bytes", lambda a: a["children"][0].update(profileBytes=a["children"][0]["profileBytes"][:-1]))
reject_parent("missing_root_identity", lambda a: a["root"].pop("identity"))
reject_parent("root_not_private", lambda a: setat(a, ["root", "identity", 4], str(stat.S_IFDIR | 0o755)))
reject_parent("wrong_root_uid", lambda a: setat(a, ["root", "identity", 2], str(os.getuid()+1)))
reject_parent("invalid_context_run", lambda a: a["context"].update(runId="A"*64))
reject_parent("invalid_context_lane", lambda a: a["context"].update(laneId="bad lane"))
reject_parent("extra_context_field", lambda a: a["context"].update(execute=True))

def forged_child(name, mutate):
    def run(self):
        plans = planner(); children = pair(plans)
        value = b._private_json(children[0]["profileBytes"], 524288); mutate(value)
        raw = old.canonical(value) + b"\n"
        children[0]["profileBytes"] = raw; children[0]["reference"]["sha256"] = hashlib.sha256(raw).hexdigest()
        with self.assertRaisesRegex(ValueError, "EXACT_COMPLETE_R4_CHILD_BYTES"):
            plans.plan_parent(CONTEXT, ROOT, children)
    check("matching_summary_hash_does_not_hide_" + name, run)
forged_child("missing_whole_source_row", lambda v: v["inputs"].pop())
forged_child("changed_physical_file_identity", lambda v: v["inputs"][0]["identity"].__setitem__(1, "99999"))
forged_child("redirected_file_url", lambda v: v["inputs"][0].update(url="file:///changed"))
forged_child("rewritten_source_seal", lambda v: v.update(sourceRowsSha256=p.PARENT_SEAL))
forged_child("parent_extension_on_child", lambda v: v["inputs"].append(copy.deepcopy(EXTRA[0])))
forged_child("changed_run", lambda v: v.update(runId="b"*64))
forged_child("parent_profile_version", lambda v: v.update(profileVersion=2))
forged_child("source_transform", lambda v: v.update(sourceTransform=True))
forged_child("ordinary_namespace", lambda v: v.update(ordinaryInstalledNamespace=True))
forged_child("extra_child_process_builtin", lambda v: v["allowedBuiltins"].append("node:child_process"))
forged_child("redirected_bare_binding", lambda v: v["bareBindings"][0].update(targetURL="file:///changed"))
forged_child("parent_child_seal_field", lambda v: v.update(childSourceRowsSha256=p.CHILD_SEAL))

def invalid_child_role(self):
    plans = planner()
    for role in ("SUPERVISOR", "PAYMENT", True, None):
        with self.assertRaises(ValueError):
            plans.plan_child(role, CONTEXT, ROOT)
check("leaf_factory_is_closed_to_two_genuine_child_roles", invalid_child_role)

def too_many(self):
    plans = planner()
    children = [child(plans, role, 2*n+i, "lane."+str(n)) for n in range(1, 18) for i, role in enumerate(("PAYER", "SERVICE"))]
    with self.assertRaises(ValueError):
        plans.plan_parent(CONTEXT, ROOT, children)
check("seventeenth_complete_pair_is_not_admitted", too_many)

def noncanonical(self):
    plans = planner(); children = pair(plans)
    for altered in (children[0]["profileBytes"][:-1], b" "+children[0]["profileBytes"]):
        attempt = copy.deepcopy(children)
        attempt[0]["profileBytes"] = altered; attempt[0]["reference"]["sha256"] = hashlib.sha256(altered).hexdigest()
        with self.assertRaisesRegex(ValueError, "EXACT_COMPLETE_R4_CHILD_BYTES"):
            plans.plan_parent(CONTEXT, ROOT, attempt)
check("canonical_child_newline_and_whitespace_are_exact_not_reencoded", noncanonical)

def subclass(self):
    calls = []
    class HostileDict(dict):
        def __iter__(self):
            calls.append("iter"); raise RuntimeError("not evaluated")
    plans = planner()
    with self.assertRaises(ValueError):
        plans.plan_parent(HostileDict(CONTEXT), ROOT, pair(plans))
    with self.assertRaises(ValueError):
        plans.plan_parent(CONTEXT, ROOT, [HostileDict(pair(plans)[0]), pair(plans)[1]])
    self.assertEqual(calls, [])
check("subclass_hooks_are_not_executed_for_context_or_child_bundle", subclass)


def current_parent_extensions(self):
    plans = planner(); result = plans.plan_parent(CONTEXT, ROOT, pair(plans))
    parent = b._private_json(result["profileBytes"], 524288)
    paths = {row["logicalPath"] for row in parent["inputs"]}
    self.assertEqual(len(p.EXTRAS), 8)
    self.assertEqual(set(p.EXTRAS) - paths, set())
    self.assertIn("app/src/service-credit-capacity-balance-barrier-trace-data.js", paths)
    for old_path in (
            "app/qualification/capacity-native-paced-paired-lane-v1.supervisor.draft.mjs",
            "app/qualification/capacity-native-paced-supervisor-v1.namespace.preload.draft.mjs",
            "app/qualification/capacity-native-paced-workload-adapter-v1.draft.mjs",
            "app/qualification/capacity-native-paced-workload-v1.entry.draft.mjs"):
        self.assertNotIn(old_path, paths)
check("new_parent_has_all_eight_current_rows_without_old_parent_aliases", current_parent_extensions)

def current_role_contract(self):
    manifest = b.decode_json(manifest_raw, 65536)
    self.assertEqual(manifest["sourceSelectionVersion"], 3)
    self.assertEqual(manifest["parentRole"]["profileVersion"], 3)
    self.assertEqual(manifest["parentRole"]["namespace"], "getPinnedNativeCapacityPacedSupervisorNamespaceSnapshotV3")
    self.assertEqual(manifest["capture"]["pacedCaptureVersion"], 4)
    self.assertEqual(manifest["childGraph"]["sourceRowsSha256"], old.SOURCE_SEAL)
    self.assertIs(manifest["selectionEvidence"]["newNativeAllowanceGranted"], False)
check("current_role_context_is_distinct_from_original_child_and_old_parent", current_role_contract)

def old_parent_not_rebound(self):
    old_raw = p.read_owned(repo / "qualification/capacity-native-paced-parent-v2.inputs.json", 65536)[0]
    with self.assertRaisesRegex(ValueError, "PACED_TIMER_SELECTION_PIN"):
        p.capture_selection(b, old, old_raw, inventory_raw, baseline_raw)
check("old_parent_declaration_cannot_be_relabelled_for_new_producer", old_parent_not_rebound)

def child_version_stays_original(self):
    plans = planner()
    parent = b._private_json(plans.plan_parent(CONTEXT, ROOT, pair(plans))["profileBytes"], 524288)
    for role in ("PAYER", "SERVICE"):
        raw_child = child(plans, role, 7)["profileBytes"]
        data = b._private_json(raw_child, 524288)
        self.assertEqual(data["profileVersion"], 3)
        self.assertEqual(data["profileVersion"], parent["profileVersion"])
        self.assertNotEqual(data["profileKind"], parent["profileKind"])
        self.assertEqual(data["sourceRowsSha256"], old.SOURCE_SEAL)
        self.assertNotEqual(data["sourceRowsSha256"], parent["sourceRowsSha256"])
    self.assertEqual(audited, dict(nativeProcesses=0, sockets=0, sqlite=0, writeOpens=0))
check("child_schema_and_scope_remain_original_not_parent_compatibility_aliases", child_version_stays_original)

def current_manifest_only(self):
    for relative in ("qualification/capacity-native-paced-parent-v2.inputs.json",
            "qualification/capacity-native-paced-parent-v3.inputs.json"):
        prior = p.read_owned(repo / relative, 65536)[0]
        with self.assertRaisesRegex(ValueError, "PACED_TIMER_SELECTION_PIN"):
            p.capture_selection(b, old, prior, inventory_raw, baseline_raw)
check("neither_old_parent_manifest_is_rewritten_or_accepted_as_timer_v3", current_manifest_only)

def cached_full_validation(self):
    global optimization_observed
    plans = planner()
    children = [child(plans, role, 2*n+i, "lane."+str(n)) for n in range(1, 17)
        for i, role in enumerate(("PAYER", "SERVICE"))]
    before = plans.info()
    seen = dict(largeRowsReserialized=0, wholeExpectedChildrenEncoded=0)
    original = old.canonical
    def observe(value):
        if type(value) is list and len(value) in (543, 551):
            seen["largeRowsReserialized"] += 1
        if type(value) is dict and value.get("role") in ("PAYER", "SERVICE") and "inputs" in value:
            seen["wholeExpectedChildrenEncoded"] += 1
        return original(value)
    old.canonical = observe
    try:
        result = plans.plan_parent(CONTEXT, ROOT, children)
    finally:
        old.canonical = original
    after = plans.info()
    self.assertEqual(seen, dict(largeRowsReserialized=0, wholeExpectedChildrenEncoded=0))
    self.assertEqual(after["sharedFieldSerializations"], 4)
    self.assertEqual(after["sharedCanonicalBytes"], before["sharedCanonicalBytes"])
    self.assertLessEqual(after["sharedCanonicalBytes"], 2 * 524288)
    self.assertEqual(after["sharedCanonicalByteLimit"], 2 * 524288)
    self.assertEqual(after["completeChildByteComparisons"] - before["completeChildByteComparisons"], 32)
    self.assertEqual(after["wholeExpectedChildBytesMaterialized"], 0)
    self.assertEqual(result["profileBytes"], original(b._private_json(result["profileBytes"], 524288)) + b"\n")
    optimization_observed = dict(sharedCanonicalBytes=after["sharedCanonicalBytes"],
        sharedCanonicalByteLimit=after["sharedCanonicalByteLimit"], sharedFieldSerializations=after["sharedFieldSerializations"],
        completeChildrenCompared=after["completeChildByteComparisons"] - before["completeChildByteComparisons"],
        largeRowsReserializedDuringParentValidation=seen["largeRowsReserialized"],
        wholeExpectedChildrenEncodedDuringParentValidation=seen["wholeExpectedChildrenEncoded"],
        nativePerformanceOrPeakHeapMeasured=False)
check("thirty_two_complete_child_comparisons_reuse_bounded_fields_without_full_expected_copy", cached_full_validation)

def source_rows_not_dropped(self):
    plans = planner()
    parent = b._private_json(plans.plan_parent(CONTEXT, ROOT, pair(plans))["profileBytes"], 524288)
    self.assertEqual(len(parent["inputs"]), 551)
    self.assertEqual(sum(row["bytes"] for row in parent["inputs"]), 4922944)
    self.assertIn("app/src/service-credit-capacity-paced-timer-trace-data.js",
        {row["logicalPath"] for row in parent["inputs"]})
    info = plans.info(); info["sharedFieldSerializations"] = 99
    self.assertEqual(plans.info()["sharedFieldSerializations"], 4)
check("full_551_rows_and_detached_cache_information_are_not_compact_substitutes", source_rows_not_dropped)

forged_child("last_source_identity_in_shared_fragment", lambda v: v["inputs"][-1]["identity"].__setitem__(1, "123456"))
forged_child("last_source_sha_in_shared_fragment", lambda v: v["inputs"][-1].update(sha256="f"*64))
forged_child("last_binding_in_shared_fragment", lambda v: v["bareBindings"][-1].update(targetURL="file:///different"))
forged_child("cached_runtime_identity", lambda v: v["runtime"]["nodeIdentity"].__setitem__(1, "123456"))


if __name__ == "__main__":
    output = io.StringIO()
    result = unittest.TextTestRunner(stream=output, verbosity=0).run(unittest.defaultTestLoader.loadTestsFromTestCase(Profiles))
    unchanged = p.read_owned(producer_path) == (raw, [str(v) for v in ident(before)])
    print(json.dumps(dict(event="PACED_TIMER_PARENT_PROFILE_V3_PRODUCER_ACTUAL_DATA_NOT_NATIVE",
        python=sys.version.split()[0], platform=sys.platform,
        testsRun=result.testsRun, failures=len(result.failures), errors=len(result.errors), skipped=len(result.skipped),
        successful=result.wasSuccessful() and unchanged, producerUnchanged=unchanged,
        sourceProducerSha256=expected, parentSourceRowsSha256=p.PARENT_SEAL, childSourceRowsSha256=p.CHILD_SEAL,
        profileOptimizationData=optimization_observed,
        fakeNamespaceInstalled=False, privateRootsOpened=False, SDK=False, SQLite=False, keys=False, signatures=False,
        sockets=False, nonceSearch=False, children=False, profilesWritten=False, qualificationScratchCreated=False,
        sourceCopies=0, packageCopies=0, auditedEffects=audited, authority="NONE")), flush=True)
    if not result.wasSuccessful():
        sys.stderr.write(output.getvalue())
    sys.exit(0 if result.wasSuccessful() and unchanged else 1)
