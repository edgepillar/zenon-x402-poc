"""Actual full paced profile/entry composition, read-only DATA only.

Use the real pinned producer on all installed source bytes. Roots and CAS
references are explicitly synthetic DTOs, never opened or written. Complete
profiles stay only in memory. No manager, native adapter or package is executed.
"""
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import unittest

if (not (sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode)
        or os.environ.get("X402_PACED_BUNDLE_DATA") != "paced-complete-profile-bundle-data-v1"):
    raise ValueError("EXPLICIT_ISOLATED_COMPLETE_BUNDLE_DATA")
repo = Path(__file__).absolute().parents[1]
launcher_path = repo / "qualification/run-capacity-native-paced-workload-v1.local.py"
raw = launcher_path.read_bytes()
if hashlib.sha256(raw).hexdigest() != os.environ.get("X402_PACED_LAUNCHER_SOURCE_SHA256"):
    raise ValueError("EXACT_SOURCE_LAUNCHER_FOR_BUNDLE_DATA")
audit_counts = dict(nativeProcesses=0, sockets=0, sqlite=0, writeOpens=0)


def audit(event, args):
    if event in ("subprocess.Popen", "os.system", "os.fork", "os.posix_spawn"):
        audit_counts["nativeProcesses"] += 1
        raise AssertionError("NO_NATIVE_PROCESS_IN_BUNDLE_DATA")
    if event.startswith("socket."):
        audit_counts["sockets"] += 1
        raise AssertionError("NO_SOCKET_IN_BUNDLE_DATA")
    if event == "sqlite3.connect":
        audit_counts["sqlite"] += 1
        raise AssertionError("NO_SQLITE_IN_BUNDLE_DATA")
    if event == "open" and type(args[2]) is int and args[2] & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC):
        audit_counts["writeOpens"] += 1
        raise AssertionError("NO_WRITE_OPEN_IN_BUNDLE_DATA")


sys.addaudithook(audit)
spec = importlib.util.spec_from_file_location("actual_paced_bundle_launcher", launcher_path)
launcher = importlib.util.module_from_spec(spec)
exec(spec.loader.source_to_code(raw, str(launcher_path)), launcher.__dict__)
admitted = launcher.source_admission(repo, os.environ.get("X402_PACED_LAUNCHER_MANIFEST_SHA256"))
producer, resource, m = (admitted["controls"][name] for name in ("producer", "resource", "bundle"))
planner = producer.build_source_context(repo, os.environ["X402_EXISTING_PACKAGES"], os.environ["X402_EXISTING_NODE"])
info = planner.info()
if not info["sourceFilesReadOnlyVerified"] or info["sourceFilesRead"] != 549 or info["nodeBinaryHashesForContext"] != 1:
    raise ValueError("ACTUAL_INSTALLED_SOURCE_CONTEXT_REQUIRED")
workload = admitted["workload"]; run_id = "1" * 64
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
    self.assertEqual(len(full["inputs"]), 549)
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


if __name__ == "__main__":
    result = unittest.TextTestRunner(stream=io.StringIO(), verbosity=0).run(unittest.defaultTestLoader.loadTestsFromTestCase(Bundle))
    admitted["unchanged"]()
    launcher.recheck_profile_sources(source_profile, admitted["controls"]["common"], Path(os.environ["X402_EXISTING_NODE"]))
    stable = launcher.read(launcher_path)[0] == raw
    success = result.wasSuccessful() and stable and len(names) == result.testsRun and not any(audit_counts.values())
    print(json.dumps(dict(event="ACTUAL_COMPLETE_PACED_PROFILE_BUNDLE_DATA_NOT_NATIVE", testsRun=result.testsRun, selectedCases=len(names),
        failures=len(result.failures), errors=len(result.errors), skipped=len(result.skipped), successful=success,
        sourceAndInputsUnchanged=stable, sourceContext=info, syntheticRootAndCasDtos=True, completeProfileBytesKeptOnlyInMemory=True,
        managerImported=False, profilesWritten=False, auditedEffects=audit_counts, authority="NONE",
        controlNames=names, failureDetails=[dict(test=str(test), detail=detail) for test, detail in result.failures + result.errors])), flush=True)
    raise SystemExit(0 if success else 1)
