"""P4 V3 DATA-only profile tests; never install a namespace or enter native work.

This source, the pinned builder, the frozen helper, two public JSON input tables
and the three declared worker/entry sources are read. Synthetic profile DTOs remain memory
DATA: they are NOT native observations, task ownership or execution authority.
No scratch, private roots, packages, Node, child processes or crypto keys run.
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

BUILDER_SHA = "6928303c36f034fc295145563e40304641a91fe7db35d62eb364031bbcff7e6a"
repo = Path(__file__).absolute().parents[1]
builder_path = repo / "qualification/native_capacity_full_profile_v3.py"
for at in (builder_path, *builder_path.parents):
    if at.is_symlink():
        raise ValueError("BUILDER_SOURCE_LINK")
initial = builder_path.lstat()
def ident(s):
    return [s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode, s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns]
if (not stat.S_ISREG(initial.st_mode) or initial.st_uid != os.getuid()
        or initial.st_nlink != 1 or initial.st_size > 65536):
    raise ValueError("BUILDER_SOURCE_IDENTITY")
with os.fdopen(os.open(builder_path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
    if ident(os.fstat(stream.fileno())) != ident(initial):
        raise ValueError("BUILDER_SOURCE_OPEN")
    builder_raw = stream.read(65537)
    if len(builder_raw) != initial.st_size or ident(os.fstat(stream.fileno())) != ident(initial):
        raise ValueError("BUILDER_SOURCE_READ")
if hashlib.sha256(builder_raw).hexdigest() != BUILDER_SHA or ident(builder_path.lstat()) != ident(initial):
    raise ValueError("BUILDER_SOURCE_PIN")
if not (sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode):
    raise ValueError("ISOLATED_DATA_ONLY_REQUIRED")
spec = importlib.util.spec_from_file_location("capacity_full_profile_v3", builder_path)
m = importlib.util.module_from_spec(spec); sys.modules[spec.name] = m
spec.loader.exec_module(m)
if m.read_owned(builder_path)[0] != builder_raw:
    raise ValueError("BUILDER_CHANGED_ON_IMPORT")
b = m.load_helpers(repo)
inventory_raw = m.read_owned(repo / m.INVENTORY, 65536)[0]
baseline_raw = m.read_owned(repo / m.BASELINE, 262144)[0]
selection = m.capture_selection(b, inventory_raw, baseline_raw)
APP, PACKAGES = "/synthetic-source", "/synthetic-packages"
captures = []
for n, row in enumerate(selection["rows"], 1):
    root, tail = (APP, row["path"][4:]) if row["path"].startswith("app/") else (PACKAGES, row["path"][9:])
    captures.append(dict(logicalPath=row["path"], url=b.source_url(root, tail),
        bytes=row["bytes"], LF=row["LF"], sha256=row["sha256"], gitBlob=row["gitBlob"],
        identity=["1", str(1000+n), str(os.getuid()), "20", str(stat.S_IFREG | 0o644),
            "1", str(row["bytes"]), "100", "100"]))
INDEX = {r["logicalPath"]: r for r in captures}
REGISTRY = dict(inputs=captures, bareBindings=[dict(parentURL=INDEX[e["parent"]]["url"],
    specifier=e["specifier"], targetURL=INDEX[e["target"]]["url"]) for e in selection["bareBindings"]],
    runtime=dict(node="24.19.0", platform="darwin", arch="arm64", nodeSha256=m.NODE_SHA,
        nodeIdentity=["1", "90", str(os.getuid()), "20", str(stat.S_IFREG | 0o755), "1", str(m.NODE_BYTES), "100", "100"]),
    sourceRowsSha256=m.SOURCE_SEAL, applicationRoot=APP, packageRoot=PACKAGES,
    sourceIdentitiesRead=False, sourcesCopied=False, nativeExecuted=False, authority="NONE")
ROOT = dict(path="/synthetic-owned-parent", identity=["1", "800", str(os.getuid()), "20", str(stat.S_IFDIR | 0o700)])
CONTEXT = dict(runId="a"*64, laneId="lane.one")
def child(role, n, lane="lane.one"):
    return dict(role=role, laneId=lane, path="/synthetic-profile-"+str(n)+".json", sha256=format(n, "064x"),
        entryURL=INDEX[m.SPECS[role]["entry"]]["url"], preloaderURL=INDEX[m.SPECS[role]["preloader"]]["url"],
        rootPath="/synthetic-owned-child-"+str(n),
        rootIdentity=["1", str(900+n), str(os.getuid()), "20", str(stat.S_IFDIR | 0o700)])
CHILDREN = [child("PAYER", 1), child("SERVICE", 2)]
def parameters(role="PAYER"):
    return dict(registry=copy.deepcopy(REGISTRY), inventory_raw=inventory_raw, baseline_raw=baseline_raw,
        role=role, context=copy.deepcopy(CONTEXT), root=copy.deepcopy(ROOT),
        children=copy.deepcopy(CHILDREN) if role == "SUPERVISOR" else [])
def plan(args):
    return m.plan_role_profile(b, **args)

class Profiles(unittest.TestCase):
    pass
def check(name, run):
    def method(self):
        run(self)
    method.__name__ = "test_"+name
    setattr(Profiles, method.__name__, method)
def reject(name, edit, role="PAYER"):
    def run(self):
        args = parameters(role); edit(args)
        with self.assertRaises(ValueError):
            plan(args)
    check(name, run)
def setat(value, path, replacement):
    for key in path[:-1]:
        value = value[key]
    value[path[-1]] = replacement

def full_selection(self):
    self.assertEqual(len(selection["rows"]), 543)
    self.assertEqual(sum(r["path"].startswith("app/") for r in selection["rows"]), 139)
    self.assertEqual(sum(r["path"].startswith("packages/") for r in selection["rows"]), 404)
    self.assertEqual(sum(r["bytes"] for r in selection["rows"]), m.SOURCE_BYTES)
    baseline = b.decode_json(baseline_raw)
    expected = {r["path"]: r for r in baseline["applicationInputs"]+baseline["packageInputs"]}
    self.assertEqual({r["path"]: r for r in selection["rows"] if r["path"] in expected}, expected)
    self.assertEqual(len(selection["bareBindings"]), 11)
    self.assertEqual(selection["authority"], "NONE"); self.assertIs(selection["nativeExecuted"], False)
check("complete_real_graph_table_preserved_as_data_not_execution", full_selection)

def exact_profile(self, role):
    result = plan(parameters(role)); profile = b._private_json(result["profileBytes"], 524288)
    self.assertEqual(profile["role"], role); self.assertEqual(profile["profileKind"], m.SPECS[role]["kind"])
    self.assertEqual(profile["entryURL"], INDEX[m.SPECS[role]["entry"]]["url"])
    self.assertEqual(profile["preloaderURL"], INDEX[m.SPECS[role]["preloader"]]["url"])
    self.assertEqual(len(profile["inputs"]), 543); self.assertEqual(profile["rootIdentity"], ROOT["identity"])
    self.assertEqual(profile["allowedBuiltins"], sorted(b.BUILTINS+(["node:child_process"] if role == "SUPERVISOR" else [])))
    self.assertEqual(result["profileBytes"], m.canonical(profile)+b"\n")
    self.assertEqual(result["profileSha256"], hashlib.sha256(result["profileBytes"]).hexdigest())
    self.assertEqual(result["profileBytesCount"], len(result["profileBytes"]))
    self.assertLessEqual(len(result["profileBytes"]), 524288)
    for field in ("sourceIdentitiesAuthenticated", "rootIdentitiesAuthenticated",
            "privateChildProfilesAuthenticated", "privateProfileIsNativeAuthority", "nativeExecuted"):
        self.assertIs(result[field], False)
    self.assertEqual(result["authority"], "NONE")
for role in ("PAYER", "SERVICE", "SUPERVISOR"):
    check("canonical_bounded_"+role.lower()+"_profile_not_authority", lambda self, role=role: exact_profile(self, role))

reject("wrong_inventory_pin", lambda a: a.update(inventory_raw=inventory_raw+b" "))
reject("wrong_baseline_pin", lambda a: a.update(baseline_raw=baseline_raw+b" "))
reject("unknown_role", lambda a: a.update(role="PAYMENT"))
reject("role_wrong_exact_type", lambda a: a.update(role=True))
reject("context_extra_field", lambda a: a["context"].update(execute=True))
reject("context_malformed_run", lambda a: a["context"].update(runId="A"*64))
reject("context_bad_lane", lambda a: a["context"].update(laneId="lane/other"))
reject("root_extra_field", lambda a: a["root"].update(nlink="1"))
reject("root_nine_field_file_identity", lambda a: a["root"]["identity"].extend(["1", "1", "1", "1"]))
reject("root_numeric_instead_of_string", lambda a: setat(a, ["root", "identity", 0], 1))
reject("root_zero_inode", lambda a: setat(a, ["root", "identity", 1], "0"))
reject("root_leading_zero_alias", lambda a: setat(a, ["root", "identity", 1], "0800"))
reject("root_uint64_overflow", lambda a: setat(a, ["root", "identity", 0], str(2**64)))
reject("root_wrong_uid", lambda a: setat(a, ["root", "identity", 2], str(os.getuid()+1)))
reject("root_not_private", lambda a: setat(a, ["root", "identity", 4], str(stat.S_IFDIR | 0o755)))
reject("root_is_regular_file", lambda a: setat(a, ["root", "identity", 4], str(stat.S_IFREG | 0o700)))
reject("root_relative_path", lambda a: a["root"].update(path="relative"))
reject("root_traversal_path", lambda a: a["root"].update(path="/synthetic/../other"))
reject("root_double_slash", lambda a: a["root"].update(path="//synthetic"))
reject("root_url_not_path", lambda a: a["root"].update(path="file:///synthetic"))
reject("child_on_payer", lambda a: a.update(children=copy.deepcopy(CHILDREN)))
reject("child_on_service", lambda a: a.update(children=copy.deepcopy(CHILDREN)), "SERVICE")
reject("parent_empty_children", lambda a: a.update(children=[]), "SUPERVISOR")
reject("parent_unpaired_children", lambda a: a.update(children=[copy.deepcopy(CHILDREN[0])]), "SUPERVISOR")
reject("parent_odd_children", lambda a: a["children"].append(child("PAYER", 3, "lane.two")), "SUPERVISOR")
reject("parent_duplicate_role", lambda a: a["children"].__setitem__(1, child("PAYER", 2)), "SUPERVISOR")
reject("parent_incomplete_lanes", lambda a: a["children"][1].update(laneId="lane.two"), "SUPERVISOR")
reject("child_unknown_role", lambda a: a["children"][0].update(role="PAYMENT"), "SUPERVISOR")
reject("child_invalid_lane", lambda a: a["children"][0].update(laneId="not/a/lane"), "SUPERVISOR")
reject("child_extra_field", lambda a: a["children"][0].update(execute=True), "SUPERVISOR")
reject("child_same_profile_path", lambda a: a["children"][1].update(path=a["children"][0]["path"]), "SUPERVISOR")
reject("child_same_profile_digest", lambda a: a["children"][1].update(sha256=a["children"][0]["sha256"]), "SUPERVISOR")
reject("child_wrong_entry", lambda a: a["children"][0].update(entryURL=INDEX[m.SPECS["SERVICE"]["entry"]]["url"]), "SUPERVISOR")
reject("child_wrong_preloader", lambda a: a["children"][0].update(preloaderURL=INDEX[m.SPECS["SERVICE"]["preloader"]]["url"]), "SUPERVISOR")
reject("child_same_parent_path", lambda a: a["children"][0].update(rootPath=a["root"]["path"]), "SUPERVISOR")
reject("child_same_parent_inode", lambda a: a["children"][0].update(rootIdentity=copy.deepcopy(a["root"]["identity"])), "SUPERVISOR")
reject("child_same_sibling_path", lambda a: a["children"][1].update(rootPath=a["children"][0]["rootPath"]), "SUPERVISOR")
reject("child_same_sibling_inode", lambda a: a["children"][1].update(rootIdentity=copy.deepcopy(a["children"][0]["rootIdentity"])), "SUPERVISOR")

def maximum_pairs(self):
    args = parameters("SUPERVISOR")
    args["children"] = [child(role, 2*lane+n, "lane."+str(lane)) for lane in range(1, 17) for n, role in enumerate(("PAYER", "SERVICE"))]
    self.assertEqual(len(b._private_json(plan(args)["profileBytes"], 524288)["childProfiles"]), 32)
check("sixteen_complete_independent_pairs_within_profile_bound", maximum_pairs)
reject("seventeenth_pair", lambda a: a.update(children=[child(role, 2*lane+n, "lane."+str(lane))
    for lane in range(1, 18) for n, role in enumerate(("PAYER", "SERVICE"))]), "SUPERVISOR")

reject("registry_extra_field", lambda a: a["registry"].update(execute=True))
reject("registry_relabels_authority", lambda a: a["registry"].update(authority="NATIVE"))
reject("registry_claims_native_execution", lambda a: a["registry"].update(nativeExecuted=True))
reject("registry_copies_sources", lambda a: a["registry"].update(sourcesCopied=True))
reject("registry_wrong_source_seal", lambda a: a["registry"].update(sourceRowsSha256="0"*64))
reject("registry_wrong_capture_count", lambda a: a["registry"]["inputs"].pop())
reject("registry_wrong_logical_path", lambda a: a["registry"]["inputs"][0].update(logicalPath="app/unrelated.js"))
reject("registry_wrong_capture_digest", lambda a: a["registry"]["inputs"][0].update(sha256="0"*64))
reject("registry_wrong_capture_size", lambda a: a["registry"]["inputs"][0].update(bytes=0))
reject("registry_wrong_source_url", lambda a: a["registry"]["inputs"][0].update(url="file:///unrelated.js"))
reject("registry_hardlink_identity", lambda a: setat(a, ["registry", "inputs", 0, "identity", 5], "2"))
reject("registry_file_identity_is_directory", lambda a: setat(a, ["registry", "inputs", 0, "identity", 4], str(stat.S_IFDIR | 0o700)))
reject("registry_missing_bare_binding", lambda a: a["registry"]["bareBindings"].pop())
reject("registry_added_bare_binding", lambda a: a["registry"]["bareBindings"].append(copy.deepcopy(a["registry"]["bareBindings"][0])))
reject("registry_redirected_bare_binding", lambda a: a["registry"]["bareBindings"][0].update(targetURL="file:///unrelated.js"))
reject("runtime_wrong_binary_hash", lambda a: a["registry"]["runtime"].update(nodeSha256="0"*64))
reject("runtime_wrong_node_version", lambda a: a["registry"]["runtime"].update(node="24.20.0"))
reject("runtime_wrong_platform", lambda a: a["registry"]["runtime"].update(platform="linux"))
reject("runtime_wrong_arch", lambda a: a["registry"]["runtime"].update(arch="x64"))
reject("runtime_identity_not_nine_fields", lambda a: a["registry"]["runtime"]["nodeIdentity"].pop())
reject("runtime_zero_inode", lambda a: setat(a, ["registry", "runtime", "nodeIdentity", 1], "0"))
reject("runtime_wrong_size", lambda a: setat(a, ["registry", "runtime", "nodeIdentity", 6], "1"))
reject("runtime_not_executable", lambda a: setat(a, ["registry", "runtime", "nodeIdentity", 4], str(stat.S_IFREG | 0o644)))
reject("runtime_uint64_overflow", lambda a: setat(a, ["registry", "runtime", "nodeIdentity", 8], str(2**64)))

def modes(self):
    for mode in (stat.S_IFREG | 0o400, stat.S_IFREG | 0o600):
        self.assertIs(m.private_profile_mode(mode), True)
    for mode in (stat.S_IFREG | 0o000, stat.S_IFREG | 0o644, stat.S_IFREG | 0o440,
                 stat.S_IFREG | 0o700, stat.S_IFREG | 0o4600, stat.S_IFDIR | 0o400, True, "0400", None):
        self.assertIs(m.private_profile_mode(mode), False)
check("only_0400_cas_or_0600_scratch_regular_file_mode_data", modes)
def duplicate_json(self):
    with self.assertRaises(ValueError):
        b._private_json(b'{"role":"PAYER","role":"SERVICE"}', 524288)
    with self.assertRaises(ValueError):
        b._private_json(b'{"profileVersion":2.0}', 524288)
check("private_json_rejects_duplicate_keys_and_non_integer_numbers", duplicate_json)
def detach(self):
    args = parameters(); before = copy.deepcopy(args); result = plan(args)
    self.assertEqual(args, before)
    args["root"]["identity"][1] = "99999"
    self.assertNotEqual(b._private_json(result["profileBytes"], 524288)["rootIdentity"], args["root"]["identity"])
check("profile_bytes_detached_without_mutating_input_data", detach)

def complete_child(role="PAYER"):
    row = child(role, 1)
    args = parameters(role)
    args["root"] = dict(path=row["rootPath"], identity=row["rootIdentity"])
    result = plan(args); row["sha256"] = result["profileSha256"]
    return result["profileBytes"], row
def validate_child(raw, row):
    return m.validate_child_profile_data(b, raw, row, REGISTRY, inventory_raw, baseline_raw, CONTEXT["runId"])
def matching_child(self, role):
    raw, row = complete_child(role)
    result = validate_child(raw, row)
    self.assertIs(result["completeChildBytesMatch"], True)
    self.assertIs(result["nativeExecuted"], False); self.assertEqual(result["authority"], "NONE")
    self.assertIs(result["privateProfileIsNativeAuthority"], False)
for role in ("PAYER", "SERVICE"):
    check("whole_"+role.lower()+"_child_bytes_match_not_native_observation",
        lambda self, role=role: matching_child(self, role))
def reject_child_change(name, edit):
    def run(self):
        raw, row = complete_child()
        value = b._private_json(raw, 524288); edit(value)
        altered = m.canonical(value)+b"\n"
        row["sha256"] = m.sha(altered)  # A matching summary digest is NOT enough.
        with self.assertRaises(ValueError):
            validate_child(altered, row)
    check("whole_child_rejects_"+name, run)
reject_child_change("missing_source_row", lambda v: v["inputs"].pop())
reject_child_change("changed_source_url_with_same_summary", lambda v: v["inputs"][0].update(url="file:///unrelated.js"))
reject_child_change("changed_physical_file_identity", lambda v: v["inputs"][0]["identity"].__setitem__(1, "991"))
reject_child_change("added_source_transform", lambda v: v.update(sourceTransform=True))
reject_child_change("ordinary_namespace", lambda v: v.update(ordinaryInstalledNamespace=True))
reject_child_change("child_process_builtin_on_payer", lambda v: v["allowedBuiltins"].append("node:child_process"))
reject_child_change("redirected_bare_binding", lambda v: v["bareBindings"][0].update(targetURL="file:///unrelated.js"))
reject_child_change("child_profiles_on_leaf_role", lambda v: v["childProfiles"].append(copy.deepcopy(CHILDREN[0])))
reject_child_change("changed_run", lambda v: v.update(runId="b"*64))
reject_child_change("changed_root", lambda v: v.update(rootPath="/different-synthetic-root"))
reject_child_change("unknown_field", lambda v: v.update(execute=True))
def noncanonical_child(self):
    raw, row = complete_child(); altered = raw[:-1]; row["sha256"] = m.sha(altered)
    with self.assertRaises(ValueError):
        validate_child(altered, row)
check("whole_child_requires_exact_canonical_newline_bytes", noncanonical_child)

def v3_windows(self):
    paths = {p["path"] for p in selection["rows"]}
    for name in ("app/qualification/capacity-native-service-window-v3.owner.draft.mjs",
            "app/src/service-credit-capacity-windowed-async-workload-owner-core.js",
            "app/src/service-credit-capacity-parent-timing-trace-data.js",
            "app/src/service-credit-capacity-window-writer-trace-data.js",
            "app/src/service-credit-capacity-cohort-writer-trace-data.js"):
        self.assertIn(name, paths)
    self.assertNotIn("app/src/service-credit-capacity-async-workload-owner-core.js", paths)
    self.assertEqual(len(m.ADDITIONS), 22)
check("genuine_full_v3_window_sources_not_v2_core_or_a_compact_substitute", v3_windows)
def v3_versions(self):
    for role in ("PAYER", "SERVICE", "SUPERVISOR"):
        value = b._private_json(plan(parameters(role))["profileBytes"], 524288)
        self.assertEqual(value["profileVersion"], 3)
        self.assertTrue(value["profileKind"].endswith("_V3"))
        self.assertTrue(m.SPECS[role]["namespace"].endswith("V3"))
check("all_role_profile_and_namespace_versions_are_v3", v3_versions)

def native_literal_counts(self):
    # Literal SOURCE consistency, not execution of a worker or preloader.
    import re
    indexed={p["path"]:p for p in selection["rows"]}
    for role in ("PAYER","SERVICE","SUPERVISOR"):
        logical=m.SPECS[role]["entry"];raw,ident=m.read_owned(repo/logical[4:],1048576)
        self.assertEqual(dict(path=logical,bytes=len(raw),LF=raw.count(b"\n"),sha256=hashlib.sha256(raw).hexdigest(),
            gitBlob=hashlib.sha1(b"blob "+str(len(raw)).encode()+b"\0"+raw).hexdigest()),indexed[logical])
        found=re.findall(r"(?:snapshot|admitted|namespace)\.applicationFiles\s*!==\s*([0-9]+)",raw.decode("ascii"))
        self.assertEqual(found,[str(sum(p["path"].startswith("app/")for p in selection["rows"]))])
        self.assertEqual(m.read_owned(repo/logical[4:],1048576),(raw,ident))
check("literal_native_role_admission_counts_match_complete_inventory_not_old_graph", native_literal_counts)

if __name__ == "__main__":
    output = io.StringIO()
    result = unittest.TextTestRunner(stream=output, verbosity=0).run(unittest.defaultTestLoader.loadTestsFromTestCase(Profiles))
    unchanged = m.read_owned(builder_path)[0] == builder_raw and ident(builder_path.lstat()) == ident(initial)
    print(json.dumps(dict(event="P4_FULL_V3_ROLE_PROFILE_DATA_NOT_NATIVE", testsRun=result.testsRun,
        failures=len(result.failures), errors=len(result.errors), skipped=len(result.skipped),
        successful=result.wasSuccessful() and unchanged, sourceBuilderPin=BUILDER_SHA, sourceRowsSha256=m.SOURCE_SEAL,
        builderUnchanged=unchanged, nativeExecuted=False, fakeNamespaceInstalled=False, privateRootsOpened=False,
        SDK=False, SQLite=False, keys=False, signatures=False, sockets=False, nonceSearch=False, children=False,
        profilesWritten=False, qualificationScratchCreated=False, authority="NONE")), flush=True)
    if not result.wasSuccessful():
        # Private console only; reports retain just counts and output digests.
        sys.stderr.write(output.getvalue())
    sys.exit(0 if result.wasSuccessful() and unchanged else 1)

