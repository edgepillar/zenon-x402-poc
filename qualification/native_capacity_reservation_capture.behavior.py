"""Execute real reservation definitions over a declared filesystem only."""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import sys
import types
import unittest

if not (sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode):
    raise ValueError("ISOLATED_SOURCE_CONTROL_REQUIRED")
if os.environ.get("X402_RESERVATION_CAPTURE_DATA_SELECTION") != "merged-real-helpers-declared-fs-v1":
    raise ValueError("EXACT_RESERVATION_CAPTURE_DATA_SELECTION")
repo = Path(__file__).absolute().parents[1]
specs = [
    ("qualification/run-capacity-native-current-offered-v5.local.py", "075d267e5a3cfc20ec3d3507424e575ac688323901ade4cd4b736048f9c07121"),
    ("qualification/run-capacity-native-workload-v3.local.py", "4e2e29c31ae10c661bd5599506cda87482d030fc328dbde1e3e1066db5dba9e6"),
]
captured = {}
def file_identity(value):
    return tuple(getattr(value, name) for name in ("st_dev", "st_ino", "st_uid", "st_gid", "st_mode",
        "st_nlink", "st_size", "st_mtime_ns", "st_ctime_ns"))
for name, digest in specs:
    path = repo / name
    if any(at.is_symlink() for at in (path, *path.parents)):
        raise ValueError("NO_SOURCE_LINKS")
    before = path.lstat()
    if not stat.S_ISREG(before.st_mode) or before.st_uid != os.getuid() or before.st_nlink != 1 or before.st_size > 131072:
        raise ValueError("OWNED_SOURCE_ONLY")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as source:
        if file_identity(os.fstat(source.fileno())) != file_identity(before):
            raise ValueError("SOURCE_OPEN_IDENTITY")
        raw = source.read(131073)
        if file_identity(os.fstat(source.fileno())) != file_identity(before):
            raise ValueError("SOURCE_READ_IDENTITY")
    if len(raw) != before.st_size or hashlib.sha256(raw).hexdigest() != digest or file_identity(path.lstat()) != file_identity(before):
        raise ValueError("EXACT_STABLE_SOURCE")
    captured[name] = raw
allowed = {str(repo / name) for name, _ in specs}
stdlib = str(Path(sys.base_prefix) / "lib" / "python3.12") + "/"
effects = dict(children=0, sockets=0, sqlite=0, writeOpens=0, outsideSourceReads=0, mutations=0)
def audit(event, args):
    if event in ("subprocess.Popen", "os.system", "os.fork", "os.posix_spawn"):
        effects["children"] += 1
        raise AssertionError("NO_SOURCE_CONTROL_CHILD")
    if event.startswith("socket."):
        effects["sockets"] += 1
        raise AssertionError("NO_SOURCE_CONTROL_SOCKET")
    if event == "sqlite3.connect":
        effects["sqlite"] += 1
        raise AssertionError("NO_SOURCE_CONTROL_SQL")
    if event in ("os.remove", "os.rename", "os.mkdir", "os.rmdir", "os.link", "os.symlink"):
        effects["mutations"] += 1
        raise AssertionError("NO_SOURCE_CONTROL_MUTATION")
    if event == "open":
        if type(args[2]) is int and args[2] & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC):
            effects["writeOpens"] += 1
            raise AssertionError("NO_SOURCE_CONTROL_WRITE")
        if type(args[0]) is str and args[0] not in allowed and not args[0].startswith(stdlib):
            effects["outsideSourceReads"] += 1
            raise AssertionError("ONLY_PINNED_SOURCE_AND_STDLIB_READS")
sys.addaudithook(audit)
def module(index, label):
    path = repo / specs[index][0]
    spec = importlib.util.spec_from_file_location(label, path)
    value = importlib.util.module_from_spec(spec)
    sys.modules[label] = value
    exec(spec.loader.source_to_code(captured[specs[index][0]], str(path)), value.__dict__)
    return value
launcher = module(0, "declared_merged_reservation_launcher")
common = module(1, "declared_preserved_reservation_common")

class DeclaredPath:
    def __init__(self, tree, value): self.tree, self.value = tree, value
    def __str__(self): return self.value
    def __truediv__(self, name): return DeclaredPath(self.tree, self.value + "/" + name)
    def __hash__(self): return hash((id(self.tree), self.value))
    def __eq__(self, other): return type(other) is DeclaredPath and self.tree is other.tree and self.value == other.value
    @property
    def name(self): return self.value.rsplit("/", 1)[-1]
    def lstat(self): return self.tree.node(self.value)["stat"]
    def is_symlink(self): return stat.S_ISLNK(self.lstat().st_mode)
    def iterdir(self):
        if self.value != self.tree.tasks: raise AssertionError("DECLARED_TASK_LIST_ONLY")
        self.tree.enumerations += 1
        return iter(DeclaredPath(self.tree, name) for name in self.tree.entries)

class DeclaredTree:
    def __init__(self, count=3):
        self.base = "/declared/store"; self.tasks = self.base + "/tasks"
        self.nodes = {}; self.entries = []; self.enumerations = 0; self.record_reads = 0
        self.before_read = None
        self.directory(self.base); self.directory(self.tasks)
        self.file(self.base + "/storage.json", dict(schema="zenon-owned-task-storage/v2", id="a" * 32))
        for i in range(count):
            name = self.tasks + "/" + format(i + 1, "032x")
            self.directory(name); self.entries.append(name)
            self.file(name + "/task.json", dict(id=format(i + 1, "032x"), store_id="a" * 32,
                state="OPEN" if i % 3 == 0 else "CLOSED", expected_bytes=100 + i))
            if i % 3 == 1: self.directory(name + "/scratch")
    def node(self, name):
        if name not in self.nodes: raise FileNotFoundError(name)
        return self.nodes[name]
    def identity(self, kind, size=0):
        return types.SimpleNamespace(st_dev=1, st_ino=len(self.nodes) + 10, st_uid=os.getuid(), st_gid=20,
            st_mode=kind, st_nlink=1, st_size=size, st_mtime_ns=1, st_ctime_ns=1)
    def directory(self, name): self.nodes[name] = dict(stat=self.identity(stat.S_IFDIR | 0o700))
    def file(self, name, value):
        raw = json.dumps(value, sort_keys=True).encode()
        self.nodes[name] = dict(stat=self.identity(stat.S_IFREG | 0o600, len(raw)), raw=raw)
    def private(self, path):
        value = path.lstat()
        if not stat.S_ISDIR(value.st_mode) or value.st_uid != os.getuid() or stat.S_IMODE(value.st_mode) != 0o700:
            raise ValueError("PRIVATE_DIRECTORY")
        return launcher.identity(value)[:5]
    def read(self, path, maximum=1048576, uid=None):
        if self.before_read is not None: self.before_read(path)
        n = self.node(str(path)); s = n["stat"]
        if not stat.S_ISREG(s.st_mode) or s.st_uid != os.getuid() or s.st_nlink != 1 or s.st_size > maximum:
            raise ValueError("OWNED_SOURCE_FILE")
        if path.name == "task.json": self.record_reads += 1
        return n["raw"], launcher.identity(s)
    def reset_counts(self): self.enumerations = 0; self.record_reads = 0

names = []; metrics = {}
class Cases(unittest.TestCase): pass
def check(name, body):
    names.append(name)
    setattr(Cases, "test_" + name, body)
def bound(tree, work):
    original = common.private_directory, common.read, common._reservation_cache
    common.private_directory, common.read, common._reservation_cache = tree.private, tree.read, {}
    try: return work(DeclaredPath(tree, tree.base))
    finally: common.private_directory, common.read, common._reservation_cache = original
def full(root, merged, own=None, between=None):
    if merged:
        captured = launcher.reservation_capture(root, common, own)
        before, reservation = captured["snapshot"], captured["reservations"]
    else:
        before = launcher.reservation_snapshot(root, common)
        reservation = common.reservations(root, own)
    if between is not None: between()
    if launcher.reservation_snapshot(root, common) != before:
        raise ValueError("RESERVATION_RECORD_OR_SCRATCH_CHANGED")
    return before, reservation

for count in (0, 1, 3, 64, 4096):
    for warm in (False, True):
        def run(self, count=count, warm=warm):
            results = []; counts = []
            for merged in (False, True):
                tree = DeclaredTree(count)
                def execute(root):
                    if warm: common.reservations(root)
                    tree.reset_counts()
                    result = full(root, merged)
                    counts.append((tree.enumerations, tree.record_reads))
                    return result
                results.append(bound(tree, execute))
            self.assertEqual(results[0], results[1])
            self.assertEqual(counts, [(5, 0 if warm else count), (4, 0 if warm else count)])
            if count == 4096:
                metrics["maxTasksWarm" if warm else "maxTasksCold"] = dict(tasks=count,
                    directoryEnumerationsBefore=5, directoryEnumerationsAfter=4,
                    recordReadsBefore=counts[0][1], recordReadsAfter=counts[1][1])
        check("same_full_snapshot_and_reservation_" + str(count) + ("_warm" if warm else "_cold"), run)

def own_exclusion(self):
    for own in (None, ("a" * 32, format(1, "032x")), ("f" * 32, format(1, "032x"))):
        values = []
        for merged in (False, True):
            tree = DeclaredTree(3); values.append(bound(tree, lambda root: full(root, merged, own)))
        self.assertEqual(values[0], values[1])
        self.assertEqual(values[0][1]["reservedBytes"], 101 if own and own[0] == "a" * 32 else 201)
check("open_and_scratch_reservations_and_exact_own_exclusion", own_exclusion)

for field, value in (("id", "f" * 32), ("store_id", "f" * 32), ("state", "UNKNOWN"),
    ("expected_bytes", True), ("expected_bytes", -1), ("expected_bytes", 2**53)):
    def invalid(self, field=field, value=value):
        for merged in (False, True):
            tree = DeclaredTree(1); path = tree.entries[0] + "/task.json"
            data = json.loads(tree.nodes[path]["raw"]); data[field] = value; tree.file(path, data)
            with self.assertRaises(ValueError): bound(tree, lambda root: full(root, merged))
    check("reject_invalid_" + field + "_" + str(value), invalid)

for field, value in (("st_uid", -1), ("st_nlink", 2), ("st_mode", stat.S_IFLNK | 0o600), ("st_size", 4194305)):
    def bad_record(self, field=field, value=value):
        for merged in (False, True):
            tree = DeclaredTree(1); setattr(tree.nodes[tree.entries[0] + "/task.json"]["stat"], field, value)
            with self.assertRaises(ValueError): bound(tree, lambda root: full(root, merged))
    check("reject_record_identity_" + field, bad_record)

def changed_read(self):
    tree = DeclaredTree(1)
    def change(path):
        if path.name == "task.json": tree.nodes[str(path)]["stat"].st_ctime_ns += 1
    tree.before_read = change
    with self.assertRaisesRegex(ValueError, "RESERVATION_RECORD_CHANGED_DURING_CAPTURE"):
        bound(tree, lambda root: full(root, True))
check("record_change_between_stat_and_read_is_refused", changed_read)

for kind in ("record", "scratch", "task", "membership"):
    def changed(self, kind=kind):
        for merged in (False, True):
            tree = DeclaredTree(2)
            def mutate():
                if kind == "record": tree.nodes[tree.entries[0] + "/task.json"]["stat"].st_ctime_ns += 1
                elif kind == "scratch": tree.directory(tree.entries[0] + "/scratch")
                elif kind == "task": tree.nodes[tree.entries[0]]["stat"].st_ino += 100
                else:
                    tree.nodes[tree.tasks]["stat"].st_ctime_ns += 1
            with self.assertRaises(ValueError): bound(tree, lambda root: full(root, merged, between=mutate))
    check("final_snapshot_refuses_changed_" + kind, changed)

def too_many(self):
    for merged in (False, True):
        tree = DeclaredTree(4097)
        with self.assertRaises(ValueError): bound(tree, lambda root: full(root, merged))
check("task_bound_is_not_widened", too_many)

def sorted_snapshot(self):
    results = []
    for merged in (False, True):
        tree = DeclaredTree(5); tree.entries.reverse()
        results.append(bound(tree, lambda root: full(root, merged)))
    self.assertEqual(results[0], results[1])
    self.assertEqual([row[0] for row in results[0][0][1]], [format(i + 1, "032x") for i in range(5)])
check("snapshot_stays_canonical_for_reversed_enumeration", sorted_snapshot)

def cache_identity_changed(self):
    values = []
    for merged in (False, True):
        tree = DeclaredTree(1)
        def run(root):
            common.reservations(root)
            record = tree.nodes[tree.entries[0] + "/task.json"]
            data = json.loads(record["raw"]); data["expected_bytes"] = 900
            record["raw"] = json.dumps(data, sort_keys=True).encode()
            record["stat"].st_size = len(record["raw"])
            record["stat"].st_ctime_ns += 1
            tree.reset_counts()
            value = full(root, merged)
            self.assertEqual(tree.record_reads, 1)
            return value
        values.append(bound(tree, run))
    self.assertEqual(values[0], values[1])
    self.assertEqual(values[0][1]["reservedBytes"], 900)
check("warm_cache_reload_requires_the_new_full_file_identity", cache_identity_changed)

def cache_changed_invalid_data(self):
    for merged in (False, True):
        tree = DeclaredTree(1)
        def run(root):
            common.reservations(root)
            record = tree.nodes[tree.entries[0] + "/task.json"]
            data = json.loads(record["raw"]); data["expected_bytes"] = True
            record["raw"] = json.dumps(data, sort_keys=True).encode()
            record["stat"].st_size = len(record["raw"])
            record["stat"].st_ctime_ns += 1
            return full(root, merged)
        with self.assertRaises(ValueError): bound(tree, run)
check("warm_cache_never_hides_changed_invalid_reservation_data", cache_changed_invalid_data)

def membership_during_capture(self):
    for merged in (False, True):
        tree = DeclaredTree(1); added = False
        def mutate(path):
            nonlocal added
            if path.name != "task.json" or added: return
            added = True
            name = tree.tasks + "/" + format(2, "032x")
            tree.directory(name); tree.entries.append(name)
            tree.file(name + "/task.json", dict(id=format(2, "032x"), store_id="a" * 32,
                state="OPEN", expected_bytes=200))
            # Directory timestamps intentionally stay unchanged in this DATA model.
            # The retained full membership witness must still refuse the change.
        tree.before_read = mutate
        with self.assertRaises(ValueError): bound(tree, lambda root: full(root, merged))
check("membership_change_during_capture_is_not_hidden_by_directory_timestamps", membership_during_capture)

suite = unittest.defaultTestLoader.loadTestsFromTestCase(Cases)
stream = __import__("io").StringIO()
result = unittest.TextTestRunner(stream=stream, verbosity=2).run(suite)
print(json.dumps(dict(event="REAL_MERGED_RESERVATION_HELPERS_DECLARED_FILESYSTEM", testsRun=result.testsRun,
    selected=len(names), successful=result.wasSuccessful(), failures=len(result.failures), errors=len(result.errors),
    skipped=len(result.skipped), names=names, metrics=metrics, auditedEffects=effects,
    actualSourceDefinitionsExecuted=True, filesystemDeclaredOnly=True, physicalRootRead=False,
    managerImported=False, nativeExecuted=False, authority="NONE", diagnostics=stream.getvalue())))
sys.exit(0 if result.wasSuccessful() else 1)
