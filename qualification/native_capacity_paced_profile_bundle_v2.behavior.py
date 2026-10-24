"""Actual parent-v2 full profile/resource/entry composition, read-only DATA.

The genuine new producer reads all existing 550 source files and hashes Node
once for this command; neither Node nor any JavaScript/package module runs.
Synthetic role roots, task/CAS/profile references are never opened or written.
No old launcher is reused, patched, rebound or treated as new native authority.
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
from urllib.parse import unquote, urlparse

if (not (sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode)
        or os.environ.get("X402_PACED_BUNDLE_DATA") != "paced-complete-profile-bundle-data-v2"):
    raise ValueError("EXPLICIT_ISOLATED_COMPLETE_V2_BUNDLE_DATA")
repo = Path(__file__).absolute().parents[1]
node, packages = Path(os.environ["X402_EXISTING_NODE"]), Path(os.environ["X402_EXISTING_PACKAGES"])
audit_counts = dict(nativeProcesses=0, sockets=0, sqlite=0, writeOpens=0)
read_counts = dict(nodeReadOpens=0, packageReadOpens=0)
code_guards = {}


def audit(event, args):
    if event in ("subprocess.Popen", "os.system", "os.fork", "os.posix_spawn"):
        audit_counts["nativeProcesses"] += 1
        raise AssertionError("NO_NATIVE_PROCESS_IN_V2_BUNDLE_DATA")
    if event.startswith("socket."):
        audit_counts["sockets"] += 1
        raise AssertionError("NO_SOCKET_IN_V2_BUNDLE_DATA")
    if event == "sqlite3.connect":
        audit_counts["sqlite"] += 1
        raise AssertionError("NO_SQLITE_IN_V2_BUNDLE_DATA")
    if event == "open":
        if type(args[2]) is int and args[2] & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC):
            audit_counts["writeOpens"] += 1
            raise AssertionError("NO_WRITE_OPEN_IN_V2_BUNDLE_DATA")
        if type(args[0]) is str:
            if args[0] == str(node):
                read_counts["nodeReadOpens"] += 1
            if args[0].startswith(str(packages) + "/"):
                read_counts["packageReadOpens"] += 1


sys.addaudithook(audit)


def identity(s):
    return [str(v) for v in (s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode,
        s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns)]


def read_owned(path):
    for at in (path, *path.parents):
        if at.is_symlink():
            raise ValueError("BUNDLE_CONTROL_LINK")
    before = path.lstat(); ident = identity(before)
    if not stat.S_ISREG(before.st_mode) or before.st_uid != os.getuid() or before.st_nlink != 1 or before.st_size > 65536:
        raise ValueError("BUNDLE_CONTROL_IDENTITY")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        if identity(os.fstat(stream.fileno())) != ident:
            raise ValueError("BUNDLE_CONTROL_OPEN")
        raw = stream.read(65537)
        if len(raw) != before.st_size or identity(os.fstat(stream.fileno())) != ident:
            raise ValueError("BUNDLE_CONTROL_READ")
    if identity(path.lstat()) != ident:
        raise ValueError("BUNDLE_CONTROL_AFTER")
    return raw, ident


def read_pinned(relative, digest):
    captured = read_owned(repo / relative)
    if hashlib.sha256(captured[0]).hexdigest() != digest:
        raise ValueError("BUNDLE_EXACT_SOURCE_PIN")
    code_guards[relative] = captured
    return captured


def load_control(relative, digest, name):
    raw, ident = read_pinned(relative, digest)
    path = repo / relative
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); sys.modules[name] = module
    exec(spec.loader.source_to_code(raw, str(path)), module.__dict__)
    if read_owned(path) != (raw, ident):
        raise ValueError("BUNDLE_CONTROL_CHANGED")
    return module


producer = load_control("qualification/native_capacity_paced_parent_profile_v2.py",
    "20888e7480166916343a49715ec8bf30bc789036719ad0a36c8206a110de8850", "actual_bundle_v2_profile_producer")
resource = load_control("qualification/native_capacity_paced_resource_plan_v2.py",
    "599f19ae7989f3129a21dc0f5d173dcfc7af70817154222fa18d9783979de6ce", "actual_bundle_v2_resource_producer")
m = load_control("qualification/native_capacity_paced_profile_bundle_v2.py",
    os.environ.get("X402_PACED_BUNDLE_V2_SOURCE_SHA256", ""), "actual_complete_bundle_v2")
old_resource = load_control("qualification/native_capacity_paced_resource_plan_v1.py",
    "fb680d472ad261bf28aa2b703cf7b51ac93fed4a329ff1443cb021ea7a8991a9", "actual_preserved_legacy_resource_v1")
planner = producer.build_source_context(repo, str(packages), str(node))
info = planner.info()
if (not info["sourceFilesReadOnlyVerified"] or info["sourceFilesRead"] != 550
        or info["nodeBinaryHashesForContext"] != 1 or read_counts != dict(nodeReadOpens=1, packageReadOpens=404)):
    raise ValueError("ACTUAL_NEW_INSTALLED_SOURCE_CONTEXT_REQUIRED")

workload = json.loads(read_pinned("qualification/capacity-native-paced-workload-v1.plan.json",
    "cbbf3b62215473ea614867461eb27ceefc3c5478f6a70eeac781982ad5689a2f")[0]); run_id = "1" * 64
store = "/synthetic-profile-store"
scratch = store + "/tasks/" + "4" * 32 + "/scratch"
parent_root = dict(path=scratch, identity=["1", "100", str(os.getuid()), str(os.getgid()), "16832"])
children = []


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("ascii") + b"\n"


def child(role, lane_id, ordinal, ident=None):
    root = dict(path=scratch + "/lanes/" + format(ordinal, "02d") + "/" + role.lower(),
        identity=ident or ["1", str(100 + 2 * ordinal + (1 if role == "SERVICE" else 0)), str(os.getuid()), str(os.getgid()), "16832"])
    built = planner.plan_child(role, dict(runId=run_id, laneId=lane_id), root)
    full = json.loads(built["profileBytes"]); digest = built["profileSha256"]
    return dict(reference=dict(role=role, laneId=lane_id, path=store + "/objects/" + digest, sha256=digest,
        entryURL=full["entryURL"], preloaderURL=full["preloaderURL"], rootPath=root["path"], rootIdentity=root["identity"]),
        profileBytes=built["profileBytes"])


for ordinal, lane_id in enumerate(workload["laneIds"], 1):
    for role in ("PAYER", "SERVICE"):
        children.append(child(role, lane_id, ordinal))
source_profile = json.loads(children[0]["profileBytes"])
names = []


class Bundle(unittest.TestCase):
    maxDiff = 400


def check(name, fn):
    if name in names:
        raise ValueError("DISTINCT_BUNDLE_CONTROL_NAMES")
    names.append(name)
    def run(self):
        fn(self)
    run.__name__ = "test_" + name
    setattr(Bundle, run.__name__, run)


def assemble(rows=None, root=None, selected=None, context=None):
    return m.assemble(planner, resource, workload if selected is None else selected,
        run_id if context is None else context, parent_root if root is None else root,
        children if rows is None else rows)


def valid(self):
    old_workload, old_root, old_children = copy.deepcopy(workload), copy.deepcopy(parent_root), copy.deepcopy(children)
    result = assemble()
    full = json.loads(result["parentProfile"]["profileBytes"]); entry = result["entryPlan"]["plan"]
    self.assertEqual(len(full["inputs"]), 550)
    self.assertEqual(len(full["childProfiles"]), 4)
    self.assertEqual(full["childProfiles"], [row["reference"] for row in children])
    self.assertEqual(full["sourceRowsSha256"], m.PARENT_SOURCE)
    self.assertEqual(full["childSourceRowsSha256"], m.CHILD_SOURCE)
    self.assertEqual(full["runId"], run_id)
    self.assertEqual(full["rootPath"], scratch)
    self.assertEqual(result["parentProfile"]["profileSha256"], hashlib.sha256(result["parentProfile"]["profileBytes"]).hexdigest())
    self.assertEqual(result["entryPlan"]["planBytes"], canonical(entry))
    self.assertEqual(entry["context"], dict(runId=run_id))
    for ordinal, row in enumerate(entry["laneProfiles"]):
        self.assertEqual(row["laneId"], workload["laneIds"][ordinal])
        for offset, role in enumerate(("payer", "service")):
            ref = children[2 * ordinal + offset]["reference"]
            self.assertEqual(row[role + "Profile"], dict(path=ref["path"], sha256=ref["sha256"]))
    self.assertEqual(result["summary"]["completePrivateProfileBytes"],
        sum(len(row["profileBytes"]) for row in children) + len(result["parentProfile"]["profileBytes"]))
    self.assertTrue(result["summary"]["completeCanonicalChildBytesCompared"])
    for key in ("physicalRootsAuthenticated", "physicalAliasesCreated", "profilesWritten", "nativeExecuted", "nativeAllowanceGranted"):
        self.assertIs(result["summary"][key], False)
    self.assertEqual(workload, old_workload)
    self.assertEqual(parent_root, old_root)
    self.assertEqual(children, old_children)


check("actual_five_complete_profiles_and_entry_one_source_context", valid)


def assign(value, keys, replacement):
    for key in keys[:-1]:
        value = value[key]
    value[keys[-1]] = replacement


BAD = [
    ("foreign_lane", [0, "reference", "laneId"], "foreign.lane"),
    ("wrong_role", [0, "reference", "role"], "SERVICE"),
    ("different_store", [0, "reference", "path"], "/another-store/objects/" + children[0]["reference"]["sha256"]),
    ("cas_filename_not_digest", [0, "reference", "path"], store + "/objects/" + "a" * 64),
    ("cas_traversal", [0, "reference", "path"], store + "/other/../objects/" + children[0]["reference"]["sha256"]),
    ("cas_relative", [0, "reference", "path"], "objects/" + children[0]["reference"]["sha256"]),
    ("source_profile_url", [0, "reference", "path"], source_profile["entryURL"]),
    ("wrong_role_root", [0, "reference", "rootPath"], scratch + "/lanes/01/service"),
    ("foreign_task_root", [0, "reference", "rootPath"], store + "/tasks/" + "5" * 32 + "/scratch/lanes/01/payer"),
    ("root_parent_alias", [0, "reference", "rootPath"], scratch),
    ("reference_extra", [0, "reference", "unreviewed"], True),
    ("root_identity_float", [0, "reference", "rootIdentity", 0], 1.0),
    ("root_identity_boolean", [0, "reference", "rootIdentity", 0], True),
    ("root_identity_leading_zero", [0, "reference", "rootIdentity", 0], "01"),
    ("root_mode_not_private", [0, "reference", "rootIdentity", 4], "16877"),
    ("digest_changed", [0, "reference", "sha256"], "b" * 64),
    ("body_changed", [0, "profileBytes"], children[0]["profileBytes"] + b"\n"),
    ("mutable_body", [0, "profileBytes"], bytearray(children[0]["profileBytes"])),
    ("body_omitted", [0, "profileBytes"], b""),
    ("role_preloader_changed", [0, "reference", "preloaderURL"], children[1]["reference"]["preloaderURL"]),
]


def invalid(self, keys, replacement):
    rows = copy.deepcopy(children); assign(rows, keys, replacement)
    with self.assertRaises(ValueError):
        assemble(rows)


for name, keys, value in BAD:
    check("reject_" + name, lambda self, keys=keys, value=value: invalid(self, keys, value))


def shape(self, mode):
    rows = copy.deepcopy(children)
    if mode == "missing":
        rows.pop()
    elif mode == "extra":
        rows.append(rows[0])
    elif mode == "swapped":
        rows[0], rows[1] = rows[1], rows[0]
    elif mode == "foreign_pair":
        rows[0], rows[2] = rows[2], rows[0]
    else:
        rows[0]["unreviewed"] = True
    with self.assertRaises(ValueError):
        assemble(rows)


for name in ("missing", "extra", "swapped", "foreign_pair", "extra_bundle_field"):
    check("reject_" + name, lambda self, name=name: shape(self, name))


def forged(self, keys, replacement):
    rows = copy.deepcopy(children); full = json.loads(rows[0]["profileBytes"])
    assign(full, keys, replacement)
    raw_profile = canonical(full); digest = hashlib.sha256(raw_profile).hexdigest()
    rows[0]["profileBytes"] = raw_profile
    rows[0]["reference"]["sha256"] = digest; rows[0]["reference"]["path"] = store + "/objects/" + digest
    with self.assertRaisesRegex(ValueError, "EXACT_COMPLETE_R4_CHILD_BYTES"):
        assemble(rows)


for name, keys, replacement in (
        ("whole_source_row_omitted", ["inputs"], source_profile["inputs"][:-1]),
        ("run_changed", ["runId"], "2" * 64), ("profile_version_changed", ["profileVersion"], 2),
        ("parent_seal_in_child", ["sourceRowsSha256"], m.PARENT_SOURCE),
        ("child_bindings_omitted", ["bareBindings"], []),
        ("full_role_changed", ["role"], "SERVICE"),
        ("transform_claim", ["sourceTransform"], True)):
    check("rehashed_forged_child_" + name, lambda self, keys=keys, replacement=replacement: forged(self, keys, replacement))


def alias(self, parent):
    rows = copy.deepcopy(children)
    ident = parent_root["identity"] if parent else rows[0]["reference"]["rootIdentity"]
    rows[1] = child("SERVICE", workload["laneIds"][0], 1, list(ident))
    with self.assertRaisesRegex(ValueError, "CHILD_ALIAS_OR_DIGEST"):
        assemble(rows)


check("declared_sibling_inode_alias_refused", lambda self: alias(self, False))
check("declared_parent_inode_alias_refused", lambda self: alias(self, True))
for name, root in (
        ("root_not_scratch", dict(path=store + "/other", identity=parent_root["identity"])),
        ("root_bad_task_id", dict(path=store + "/tasks/not-a-task/scratch", identity=parent_root["identity"])),
        ("root_extra_field", dict(parent_root, adopted=True))):
    def bad_root(self, root=root):
        with self.assertRaises(ValueError):
            assemble(root=root)
    check("reject_" + name, bad_root)


def no_authority(self):
    self.assertNotIn("paced_actual_owned_storage", sys.modules)
    self.assertNotIn("sqlite3", sys.modules)
    self.assertEqual(audit_counts, dict(nativeProcesses=0, sockets=0, sqlite=0, writeOpens=0))
    self.assertIs(info["privateRootsOpened"], False)
    self.assertIs(info["profilesWritten"], False)
    self.assertIs(info["nativeExecuted"], False)


check("declared_roots_and_cas_never_opened_no_manager_or_native", no_authority)



def new_resource_binding(self):
    result = assemble(); proposal = result["resourcePlan"]; summary = result["summary"]
    full = json.loads(result["parentProfile"]["profileBytes"])
    self.assertEqual(proposal, resource.resource_plan(workload))
    self.assertEqual((proposal["resourcePlanVersion"], proposal["pacedCaptureVersion"], full["profileVersion"]), (2, 3, 2))
    self.assertEqual(summary["parentSourceRows"], 550)
    self.assertEqual(summary["childSourceRows"], 543)
    self.assertEqual(summary["kind"], "PACED_COMPLETE_PROFILE_RESOURCE_ENTRY_BINDING_DATA_V2")
    self.assertIs(summary["resourceSelectionAndWorkloadBound"], True)
    self.assertEqual({row["logicalPath"] for row in full["inputs"]}.intersection(producer.EXTRAS), set(producer.EXTRAS))
    self.assertEqual(source_profile["profileVersion"], 3)
check("new_resource_profile_and_capture_versions_bind_all_seven_parent_rows", new_resource_binding)


def old_plan_refused(self):
    with self.assertRaisesRegex(ValueError, "^NEW_RESOURCE_SELECTION_CONTEXT$"):
        m.assemble(planner, old_resource, workload, run_id, parent_root, children)
check("real_unchanged_legacy_resource_producer_cannot_qualify_new_parent", old_plan_refused)


def sixteen_full(self):
    w = copy.deepcopy(workload); w["laneIds"] = ["full.lane." + str(i) for i in range(16)]
    w["recordingLimits"] = dict(maxSamplesPerPhase=512, maxInFlightPerPhase=16)
    rows = [child(role, lane, ordinal) for ordinal, lane in enumerate(w["laneIds"], 1) for role in ("PAYER", "SERVICE")]
    previous = copy.deepcopy((w, rows))
    result = assemble(rows=rows, selected=w)
    full = json.loads(result["parentProfile"]["profileBytes"])
    self.assertEqual(len(full["inputs"]), 550)
    self.assertEqual(len(full["childProfiles"]), 32)
    self.assertEqual(len(result["entryPlan"]["plan"]["laneProfiles"]), 16)
    for row in rows:
        data = json.loads(row["profileBytes"])
        self.assertEqual((data["profileVersion"], len(data["inputs"])), (3, 543))
        self.assertEqual(data["sourceRowsSha256"], m.CHILD_SOURCE)
    self.assertEqual(result["summary"]["childProfiles"], 32)
    self.assertEqual(result["resourcePlan"]["measuredCallsRequested"], 64)
    self.assertEqual((w, rows), previous)
    self.assertEqual(read_counts, dict(nodeReadOpens=1, packageReadOpens=404))
check("sixteen_complete_lanes_and_all_33_profiles_reuse_one_whole_source_context", sixteen_full)


def oversized_refused(self):
    w = copy.deepcopy(workload); w["laneIds"] = ["full.lane." + str(i) for i in range(16)]
    w["plan"].update(warmupCallsPerLane=0, measurementCallsPerLane=255, maxLedgerTransactionsPerOperation=1)
    w["recordingLimits"] = dict(maxSamplesPerPhase=4096, maxInFlightPerPhase=16)
    original = copy.deepcopy(w)
    with self.assertRaisesRegex(ValueError, "^COMPLETE_CAPTURE_RESERVATION_REQUIRED_NO_REDUCTION$"):
        assemble(selected=w)
    self.assertEqual(w, original)
    self.assertFalse(resource.resource_plan(w)["automaticSampleReduction"])
check("oversized_complete_workload_refuses_before_profile_loop_without_reduction", oversized_refused)


def artifact_reservations(self):
    result = assemble(); summary, proposed = result["summary"], result["resourcePlan"]
    self.assertIs(summary["completePrivateProfilesFitReservedBytes"], True)
    self.assertIs(summary["completeEntryFitsReservedBytes"], True)
    self.assertLessEqual(summary["completePrivateProfileBytes"], proposed["privateProfileBytesReserved"])
    self.assertLessEqual(summary["entryPlanBytes"], proposed["entryPlanBytesReserved"])
    self.assertEqual(proposed["metadataStoreQuotaBytesReserved"], 4194304)
    self.assertIs(proposed["otherTasksReservationsIncluded"], False)
    self.assertIs(proposed["effectsExecuted"], False)
    self.assertIs(proposed["nativeAllowanceGranted"], False)
check("actual_whole_profile_and_entry_bytes_fit_explicit_source_specific_reservations", artifact_reservations)

if __name__ == "__main__":
    result = unittest.TextTestRunner(stream=io.StringIO(), verbosity=0).run(unittest.defaultTestLoader.loadTestsFromTestCase(Bundle))
    # All controls/source metadata remain unchanged. No second executable hash
    # or full package/source pass is performed after profile composition.
    full = json.loads(assemble()["parentProfile"]["profileBytes"])
    for row in full["inputs"]:
        url = urlparse(row["url"])
        if url.scheme != "file" or url.netloc != "":
            raise ValueError("ACTUAL_SOURCE_URL")
        path = Path(unquote(url.path))
        for at in (path, *path.parents):
            if at.is_symlink():
                raise ValueError("SOURCE_LINK_AFTER_BUNDLE")
        if producer.identity(path.lstat()) != row["identity"]:
            raise ValueError("SOURCE_CHANGED_AFTER_COMPLETE_BUNDLE")
    if producer.identity(node.lstat()) != full["runtime"]["nodeIdentity"]:
        raise ValueError("NODE_CHANGED_AFTER_COMPLETE_BUNDLE")
    stable = all(read_owned(repo / relative) == pair for relative, pair in code_guards.items())
    success = (result.wasSuccessful() and stable and len(names) == result.testsRun and not any(audit_counts.values())
        and read_counts == dict(nodeReadOpens=1, packageReadOpens=404))
    print(json.dumps(dict(event="ACTUAL_COMPLETE_PACED_PROFILE_RESOURCE_BUNDLE_V2_DATA_NOT_NATIVE", testsRun=result.testsRun, selectedCases=len(names),
        failures=len(result.failures), errors=len(result.errors), skipped=len(result.skipped), successful=success,
        sourceAndInputsUnchanged=stable, sourceContext=info, actualReadObservations=read_counts,
        bindingSummary=assemble()["summary"], syntheticRootAndCasDtos=True, completeProfileBytesKeptOnlyInMemory=True,
        oldLauncherImported=False, managerImported=False, profilesWritten=False, auditedEffects=audit_counts, authority="NONE",
        controlNames=names, failureDetails=[dict(test=str(test), detail=detail) for test, detail in result.failures + result.errors])), flush=True)
    raise SystemExit(0 if success else 1)
