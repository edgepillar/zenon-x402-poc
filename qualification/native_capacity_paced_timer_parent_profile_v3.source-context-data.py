"""Actual timer-parent V3 installed-source read and complete in-memory plans.

Read all 551 selected files and the existing Node executable ONCE per capture.
No JavaScript, SDK, Node, manager, SQL, key, signature, nonce or socket executes.
Task/role/CAS roots below are synthetic DTOs: never created, opened or adopted.
Private source-identity metadata may be retained separately; profile BYTES and
source URLs are never printed or saved by this program.
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
        or os.environ.get("X402_TIMER_INSTALLED_SOURCE_DATA") != "timer-parent-v3-existing-source-context-data"):
    raise ValueError("EXPLICIT_ISOLATED_TIMER_EXISTING_SOURCE_CONTEXT")
repo = Path(__file__).absolute().parents[1]
packages = Path(os.environ["X402_EXISTING_PACKAGES"])
node = Path(os.environ["X402_EXISTING_NODE"])
PINS = (
    ("producer", "qualification/native_capacity_paced_timer_parent_profile_v3.py",
        "6d67d698b9c76088852426be0c1b8d11f90e067c7e850fde227f906a618727de"),
    ("resource", "qualification/native_capacity_paced_timer_resource_plan_v3.py",
        "5519fe20147ae3d03910daf089111a5803648bb5f245916659f07c151bf07997"),
    ("bundle", "qualification/native_capacity_paced_timer_profile_bundle_v3.py",
        "8dedf77f16e4984cd8b2f225965882e352cb2dd72fe01e28ee320a779d0c7efc"),
    ("command", "qualification/native_capacity_paced_timer_managed_command_data_v3.py",
        "689dfacd2c94dadf880fe19f1365e15c878a6fc14f9d35b33ecff2e546ca40d5"),
    ("managed", "qualification/run-capacity-native-paced-timer-managed-v3.local.py",
        "5f3f6893559a9fdce3d7c19b9d729996a14f157822d1938bbad3ae25daeef22e"),
)
effects = dict(nativeProcesses=0, sockets=0, sqlite=0, writeOpens=0, managerExecutions=0)
reads = dict(nodeReadOpens=0, packageReadOpens=0)
package_paths, application_reads = set(), {}
phase = "CONTROL"

def audit(event, args):
    if event in ("subprocess.Popen", "os.system", "os.fork", "os.posix_spawn"):
        effects["nativeProcesses"] += 1
        raise AssertionError("NO_NATIVE_PROCESS_IN_INSTALLED_SOURCE_READ")
    if event.startswith("socket."):
        effects["sockets"] += 1
        raise AssertionError("NO_SOCKET_IN_INSTALLED_SOURCE_READ")
    if event == "sqlite3.connect":
        effects["sqlite"] += 1
        raise AssertionError("NO_SQLITE_IN_INSTALLED_SOURCE_READ")
    if event == "exec" and args and str(getattr(args[0], "co_filename", "")).endswith(("/storage.py", "/cli.py")):
        effects["managerExecutions"] += 1
        raise AssertionError("NO_MANAGER_IN_INSTALLED_SOURCE_READ")
    if event == "open":
        if type(args[2]) is int and args[2] & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC):
            effects["writeOpens"] += 1
            raise AssertionError("NO_WRITE_IN_INSTALLED_SOURCE_READ")
        if type(args[0]) is str:
            name = args[0]
            if name.startswith("/synthetic-installed-source/"):
                raise AssertionError("SYNTHETIC_ROLE_CAS_DTO_MUST_NOT_BE_OPENED")
            if name == str(node):
                reads["nodeReadOpens"] += 1
            if name.startswith(str(packages) + "/"):
                reads["packageReadOpens"] += 1
                package_paths.add(name)
            if phase == "CAPTURE" and name.startswith(str(repo) + "/"):
                application_reads[name] = application_reads.get(name, 0) + 1

sys.addaudithook(audit)

def need(value, code):
    if not value:
        raise ValueError(code)

def identity(s):
    return [str(v) for v in (s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode,
        s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns)]

def no_links(path):
    need(path.is_absolute() and os.path.normpath(str(path)) == str(path), "CANONICAL_SOURCE_PATH")
    for at in (path, *path.parents):
        need(not at.is_symlink(), "PHYSICAL_SOURCE_ANCESTORS_NO_LINKS")

def read(path, maximum=65536):
    no_links(path); s = path.lstat(); ident = identity(s)
    need(stat.S_ISREG(s.st_mode) and s.st_uid == os.getuid() and s.st_nlink == 1
        and 0 < s.st_size <= maximum, "OWNED_SOURCE_CONTROL")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        need(identity(os.fstat(stream.fileno())) == ident, "SOURCE_CONTROL_OPEN_IDENTITY")
        raw = stream.read(maximum + 1)
        need(len(raw) == s.st_size and identity(os.fstat(stream.fileno())) == ident, "SOURCE_CONTROL_READ_IDENTITY")
    need(identity(path.lstat()) == ident, "SOURCE_CONTROL_AFTER_IDENTITY")
    return raw, ident

for path in (repo, packages):
    no_links(path); status = path.lstat()
    need(stat.S_ISDIR(status.st_mode) and status.st_uid == os.getuid(), "EXISTING_OWNED_SOURCE_ROOT")
no_links(node)
captured = {name: read(repo / name) for _, name, _ in PINS}
for _, name, digest in PINS:
    need(hashlib.sha256(captured[name][0]).hexdigest() == digest, "UNCHANGED_SOURCE_CONTROL_PIN")
controls = {}
for label, name, _ in PINS:
    spec = importlib.util.spec_from_file_location("timer_installed_source_v3_" + label, repo / name)
    need(spec is not None and spec.loader is not None, "ACTUAL_SOURCE_CONTROL_SPEC")
    module = importlib.util.module_from_spec(spec); sys.modules[spec.name] = module
    exec(spec.loader.source_to_code(captured[name][0], str(repo / name)), module.__dict__)
    controls[label] = module

p, resource, bundle, command, managed = [controls[k] for k in ("producer", "resource", "bundle", "command", "managed")]
base, legacy = p.load_dependencies(repo)
phase = "CAPTURE"
planner = p.build_source_context(repo, str(packages), str(node))
phase = "PLANNING"
info = planner.info()
need(info["sourceFilesReadOnlyVerified"] is True and info["sourceFilesRead"] == 551
    and info["nodeBinaryHashesForContext"] == 1 and info["parentApplicationFiles"] == 147
    and info["parentPackageFiles"] == 404 and info["childApplicationFiles"] == 139, "COMPLETE_ACTUAL_TIMER_SOURCE_CONTEXT")
need(reads == dict(nodeReadOpens=1, packageReadOpens=404) and len(package_paths) == 404,
    "ONE_NODE_HASH_AND_ONE_PACKAGE_CAPTURE_PASS")
# This only checks source precondition DATA. execute(), mount/capacity queries,
# Store and all private/native setup branches remain unentered.
managed.validate_full_source_context(planner)
workload_raw = p.read_owned(repo / managed.PLAN, 65536)[0]
workload = resource.capture_plan(base.decode_json(workload_raw, 65536))
need(hashlib.sha256(workload_raw).hexdigest() == "cbbf3b62215473ea614867461eb27ceefc3c5478f6a70eeac781982ad5689a2f",
    "UNCHANGED_FULL_SELECTED_DEFAULT")
run_id = "2" * 64
store = "/synthetic-installed-source"
scratch = store + "/tasks/" + "7" * 32 + "/scratch"
parent_root = dict(path=scratch, identity=["1", "100", str(os.getuid()), str(os.getgid()), "16832"])
children = []
for ordinal, lane_id in enumerate(workload["laneIds"], 1):
    for offset, role in enumerate(("PAYER", "SERVICE")):
        root = dict(path=scratch + "/lanes/" + format(ordinal, "02d") + "/" + role.lower(),
            identity=["1", str(100 + 2 * ordinal + offset), str(os.getuid()), str(os.getgid()), "16832"])
        child = planner.plan_child(role, dict(runId=run_id, laneId=lane_id), root)
        spec = legacy.SPECS[role]; digest = child["profileSha256"]
        children.append(dict(reference=dict(role=role, laneId=lane_id, path=store + "/objects/" + digest, sha256=digest,
            entryURL=base.source_url(str(repo), spec["entry"][4:]), preloaderURL=base.source_url(str(repo), spec["preloader"][4:]),
            rootPath=root["path"], rootIdentity=root["identity"]), profileBytes=child["profileBytes"]))
assembly = bundle.assemble(planner, resource, workload, run_id, parent_root, children)
parent_bytes = assembly["parentProfile"]["profileBytes"]; entry_bytes = assembly["entryPlan"]["planBytes"]
planned = command.plan(resource, workload, assembly["resourcePlan"], str(repo), str(node), scratch,
    dict(path=store + "/objects/" + hashlib.sha256(parent_bytes).hexdigest(), sha256=hashlib.sha256(parent_bytes).hexdigest(), raw=parent_bytes),
    dict(path=store + "/objects/" + hashlib.sha256(entry_bytes).hexdigest(), sha256=hashlib.sha256(entry_bytes).hexdigest(), raw=entry_bytes), run_id)
full = planned["sourceProfile"]
need(len(full["inputs"]) == 551 and len(full["childProfiles"]) == 4 and full["profileVersion"] == 3
    and full["sourceRowsSha256"] == p.PARENT_SEAL and full["childSourceRowsSha256"] == p.CHILD_SEAL,
    "COMPLETE_ACTUAL_TIMER_PROFILE_COMMAND_BINDING")
inventory_raw = p.read_owned(repo / legacy.INVENTORY, 65536)[0]
baseline_raw = p.read_owned(repo / legacy.BASELINE, 262144)[0]
original = legacy.capture_selection(base, inventory_raw, baseline_raw)
paths = {row["path"] for row in original["rows"]}
registry = dict(inputs=[row for row in full["inputs"] if row["logicalPath"] in paths], bareBindings=full["bareBindings"],
    runtime=full["runtime"], sourceRowsSha256=p.CHILD_SEAL, applicationRoot=str(repo), packageRoot=str(packages),
    sourceIdentitiesRead=True, sourcesCopied=False, nativeExecuted=False, authority="NONE")
for child in children:
    ref = child["reference"]
    old = legacy.plan_role_profile(base, registry, inventory_raw, baseline_raw, ref["role"],
        dict(runId=run_id, laneId=ref["laneId"]), dict(path=ref["rootPath"], identity=ref["rootIdentity"]), [])
    need(child["profileBytes"] == old["profileBytes"], "WHOLE_OBSERVED_SOURCE_CHILD_BYTES_MATCH_ORIGINAL_R4_PRODUCER")
application_opens = application_files = 0
private_identities = []
for row in full["inputs"]:
    url = urlparse(row["url"])
    need(url.scheme == "file" and url.netloc == "", "ACTUAL_SOURCE_URL")
    path = Path(unquote(url.path)); no_links(path)
    need(p.identity(path.lstat()) == row["identity"], "ACTUAL_SOURCE_IDENTITY_UNCHANGED_AFTER_PLANNING")
    private_identities.append(dict(logicalPath=row["logicalPath"], identity=row["identity"]))
    if row["logicalPath"].startswith("app/"):
        observed = application_reads.get(str(path), 0)
        expected = 2 if row["logicalPath"] == "app/" + legacy.BASELINE else 1
        need(observed == expected, "ONE_ACTUAL_APPLICATION_SOURCE_CAPTURE_PLUS_BASELINE_PREREAD")
        application_files += 1; application_opens += observed
need(application_files == 147 and application_opens == 148, "EXACT_APPLICATION_CAPTURE_COUNTS")
need(p.identity(node.lstat()) == full["runtime"]["nodeIdentity"], "NODE_IDENTITY_UNCHANGED_WITHOUT_SECOND_HASH")
for _, name, _ in PINS:
    need(read(repo / name) == captured[name], "ACTUAL_SOURCE_CONTROL_UNCHANGED")
need(reads == dict(nodeReadOpens=1, packageReadOpens=404) and not any(effects.values()),
    "ZERO_EXECUTION_EFFECTS_AND_ONE_INSTALLED_SOURCE_CAPTURE")
need("sqlite3" not in sys.modules, "NO_SQLITE_MODULE")
print(json.dumps(dict(event="PACED_TIMER_V3_ACTUAL_551_INSTALLED_SOURCE_AND_COMPLETE_IN_MEMORY_COMMAND_DATA",
    successful=True, sourceContext=planner.info(), actualReadObservations=reads,
    uniqueApplicationSourcesRead=147, applicationSourceReadOpens=148, uniquePackageSourcesRead=404,
    baselineSelectionMetadataPrereads=1, wholeSourceCapturePasses=1,
    completeChildProfilesPlanned=4, completeParentProfilesPlanned=1, completeEntryPlansPlanned=1,
    completeOriginalChildBytesMatched=True, independentReferenceWholeChildEncodings=4,
    privateProfileBytesTotal=assembly["summary"]["completePrivateProfileBytes"], parentProfileBytes=len(parent_bytes),
    entryPlanBytes=len(entry_bytes), plannedArgvFields=len(planned["argv"]), plannedEnvironmentFields=len(planned["envDelta"]),
    selectedDefaultUnchanged=True, sourceOnlyManagedPreconditionAccepted=True,
    rawProfilesOrSourceUrlsPublished=False, rootTaskAndCasDtosSynthetic=True, privateRoleRootsOpened=False,
    privateProfilesWritten=False, nodeExecuted=False, SDKExecuted=False, managerExecuted=False,
    SQLiteExecuted=False, keySignatureNonceExecuted=False, storageAdmissionPerformed=False,
    nativeApplicationExecuted=False, physicalRootOrCasOriginsAuthenticated=False, osSandboxClaim=False,
    auditedEffects=effects, privateSourceIdentityRows=private_identities, privateNodeIdentity=full["runtime"]["nodeIdentity"],
    nativeAuthorityGranted=False, authority="NONE"), sort_keys=True), flush=True)
