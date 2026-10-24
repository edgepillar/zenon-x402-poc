"""Existing-source read plus actual complete profile plans in memory only.

All source files and the existing executable are read, never imported/executed
as JavaScript. Role roots/profile references below are explicit synthetic DTOs
and are never opened or written. No private profile bytes are printed or saved.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import sys
from urllib.parse import unquote, urlparse

if (not (sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode)
        or os.environ.get("X402_PACED_PROFILE_V2_CONTEXT_DATA") != "paced-profile-v2-existing-source-memory-data"):
    raise ValueError("EXPLICIT_ISOLATED_EXISTING_SOURCE_PROFILE_DATA")
repo = Path(__file__).absolute().parents[1]
packages, node = Path(os.environ["X402_EXISTING_PACKAGES"]), Path(os.environ["X402_EXISTING_NODE"])
producer_path = repo / "qualification/native_capacity_paced_parent_profile_v2.py"
def ident(s):
    return [str(v) for v in (s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode,
        s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns)]
for at in (producer_path, *producer_path.parents):
    if at.is_symlink():
        raise ValueError("PRODUCER_SOURCE_LINK")
producer_before = producer_path.lstat()
if (not stat.S_ISREG(producer_before.st_mode) or producer_before.st_uid != os.getuid()
        or producer_before.st_nlink != 1 or producer_before.st_size > 65536):
    raise ValueError("PRODUCER_SOURCE_IDENTITY")
with os.fdopen(os.open(producer_path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
    if ident(os.fstat(stream.fileno())) != ident(producer_before):
        raise ValueError("PRODUCER_SOURCE_OPEN")
    raw = stream.read(65537)
    if len(raw) != producer_before.st_size or ident(os.fstat(stream.fileno())) != ident(producer_before):
        raise ValueError("PRODUCER_SOURCE_READ")
if ident(producer_path.lstat()) != ident(producer_before):
    raise ValueError("PRODUCER_SOURCE_AFTER")
if hashlib.sha256(raw).hexdigest() != os.environ.get("X402_PACED_PARENT_PRODUCER_SHA256"):
    raise ValueError("EXACT_ACTUAL_V2_PRODUCER_SOURCE")
effects = dict(nativeProcesses=0, sockets=0, sqlite=0, writeOpens=0)
reads = dict(nodeReadOpens=0, packageReadOpens=0)
package_paths = set()
application_reads = {}


def audit(event, args):
    if event in ("subprocess.Popen", "os.system", "os.fork", "os.posix_spawn"):
        effects["nativeProcesses"] += 1
        raise AssertionError("NO_NATIVE_PROCESS_IN_SOURCE_PROFILE_DATA")
    if event.startswith("socket."):
        effects["sockets"] += 1
        raise AssertionError("NO_SOCKET_IN_SOURCE_PROFILE_DATA")
    if event == "sqlite3.connect":
        effects["sqlite"] += 1
        raise AssertionError("NO_SQLITE_IN_SOURCE_PROFILE_DATA")
    if event == "open":
        if type(args[2]) is int and args[2] & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC):
            effects["writeOpens"] += 1
            raise AssertionError("NO_WRITE_OPEN_IN_SOURCE_PROFILE_DATA")
        if type(args[0]) is str:
            if args[0] == str(node):
                reads["nodeReadOpens"] += 1
            if args[0].startswith(str(packages) + "/"):
                reads["packageReadOpens"] += 1
                package_paths.add(args[0])
            if args[0].startswith(str(repo) + "/"):
                application_reads[args[0]] = application_reads.get(args[0], 0) + 1


sys.addaudithook(audit)
spec = importlib.util.spec_from_file_location("actual_paced_v2_source_context_data", producer_path)
p = importlib.util.module_from_spec(spec); sys.modules[spec.name] = p
exec(spec.loader.source_to_code(raw, str(producer_path)), p.__dict__)
before = p.read_owned(producer_path)
planner = p.build_source_context(repo, str(packages), str(node))
info = planner.info()
assert info["sourceFilesReadOnlyVerified"] is True and info["sourceFilesRead"] == 550
assert info["parentApplicationFiles"] == 146 and info["parentPackageFiles"] == 404
assert info["nodeBinaryHashesForContext"] == 1
assert reads["nodeReadOpens"] == 1 and reads["packageReadOpens"] == len(package_paths) == 404
run_id = "1" * 64
parent_root = dict(path="/synthetic-producer-v2-parent", identity=["1", "100", str(os.getuid()), str(os.getgid()), "16832"])
children = []
for ordinal, lane in enumerate(("lane.one", "lane.two"), 1):
    for offset, role in enumerate(("PAYER", "SERVICE")):
        root = dict(path="/synthetic-producer-v2-child-" + str(2 * ordinal + offset),
            identity=["1", str(100 + 2 * ordinal + offset), str(os.getuid()), str(os.getgid()), "16832"])
        built = planner.plan_child(role, dict(runId=run_id, laneId=lane), root)
        child = json.loads(built["profileBytes"])
        assert len(child["inputs"]) == 543 and child["profileVersion"] == 3
        assert child["sourceRowsSha256"] == p.CHILD_SEAL and child["sourceTransform"] is False
        assert child["runId"] == run_id and child["laneId"] == lane and child["rootIdentity"] == root["identity"]
        assert built["profileSha256"] == hashlib.sha256(built["profileBytes"]).hexdigest()
        assert built["rootIdentitiesAuthenticated"] is False and built["privateProfileIsNativeAuthority"] is False
        assert len(built["profileBytes"]) <= 524288
        children.append(dict(reference=dict(role=role, laneId=lane,
            path="/synthetic-producer-v2-profile-" + str(2 * ordinal + offset) + ".json", sha256=built["profileSha256"],
            entryURL=child["entryURL"], preloaderURL=child["preloaderURL"], rootPath=root["path"], rootIdentity=root["identity"]),
            profileBytes=built["profileBytes"]))
parent = planner.plan_parent(dict(runId=run_id, laneId="workload.parent"), parent_root, children)
full = json.loads(parent["profileBytes"])
assert full["profileVersion"] == 2 and full["profileKind"] == p.PARENT_KIND
assert len(full["inputs"]) == 550 and full["sourceRowsSha256"] == p.PARENT_SEAL
assert full["childSourceRowsSha256"] == p.CHILD_SEAL and full["childProfiles"] == [v["reference"] for v in children]
assert full["rootIdentity"] == parent_root["identity"] and full["runId"] == run_id
assert parent["profileSha256"] == hashlib.sha256(parent["profileBytes"]).hexdigest() and len(parent["profileBytes"]) <= 524288
assert all(parent[k] is False for k in ("sourceIdentitiesAuthenticated", "rootIdentitiesAuthenticated",
    "privateChildProfilesAuthenticated", "privateProfileIsNativeAuthority", "nativeExecuted"))
assert parent["authority"] == "NONE"
# Preserve all original source/Node identities without another source hash pass
# or a second executable read. These are source checks, never root authority.
application_source_opens = 0
application_source_files = 0
for row in full["inputs"]:
    url = urlparse(row["url"])
    assert url.scheme == "file" and url.netloc == ""
    path = Path(unquote(url.path))
    for at in (path, *path.parents):
        assert not at.is_symlink()
    assert p.identity(path.lstat()) == row["identity"]
    if row["logicalPath"].startswith("app/"):
        count = application_reads.get(str(path), 0)
        expected_count = 2 if row["logicalPath"] == "app/qualification/issued-funding-post-native-vertical.inputs-v3.json" else 1
        assert count == expected_count
        application_source_opens += count
        application_source_files += 1
assert application_source_files == 146 and application_source_opens == 147
assert p.identity(node.lstat()) == full["runtime"]["nodeIdentity"]
assert p.read_owned(producer_path) == before
assert reads["nodeReadOpens"] == 1 and reads["packageReadOpens"] == 404
assert not any(effects.values())
assert "sqlite3" not in sys.modules and "paced_actual_owned_storage" not in sys.modules
print(json.dumps(dict(event="PACED_V2_ACTUAL_550_SOURCE_CONTEXT_AND_FIVE_IN_MEMORY_PROFILES_NOT_NATIVE",
    successful=True, sourceContext=info, completeChildProfilesPlanned=4, completeParentProfilesPlanned=1,
    wholeCanonicalChildrenCompared=True, childProfilesHaveAll543Rows=True, parentProfileHasAll550Rows=True,
    actualReadObservations=reads, uniquePackageSourcesRead=len(package_paths), auditedEffects=effects,
    uniqueApplicationSourcesRead=application_source_files, applicationSourceReadOpens=application_source_opens,
    baselineSelectionMetadataPrereads=1, wholeSourceCapturePasses=1,
    rootAndProfileReferenceDtosSynthetic=True, privateRootOpened=False, privateProfilesWritten=False,
    oldBundleV1UsedForNewParent=False, sourceOrPackageCopies=0, SDKExecuted=False, NodeExecuted=False,
    SQLiteExecuted=False, signatureOrNonceExecuted=False, nativeChildExecuted=False,
    nativeAuthorityGranted=False, authority="NONE")), flush=True)
