"""Managed P4 full-workload V3 launcher; SOURCE-ONLY unless explicitly selected.

Current native allowance: NONE. Source inspection and DATA planning are not
permission. --execute requires a NEW finite approval for the exact launch and
plan digests, a newly initialized private owned store, and explicit private
store/mount identities. This program never initializes/adopts a root, rewrites
an old helper, repeats a command, retries a payment or cleans historical data.

Only the real pinned P1 application/404-package graph and three role preloaders
are used. Cooperative pins and sampled quotas are NOT an OS/network sandbox.
Child-created SQLite/pin files remain outside automatic adoption/deletion.
A successful component capture does not turn their storage HOLD into success.
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

MANIFEST = "qualification/capacity-native-workload-v3.launch-inputs.json"
LAUNCHER = "qualification/run-capacity-native-workload-v3.local.py"
PLANNER = "qualification/native_capacity_managed_workload_v3.py"
PROFILE = "qualification/native_capacity_full_profile_v3.py"
HELPER = "qualification/recovery_crash_native_profile.py"
TLS_GATE = "qualification/funding_tls_current_gate.py"
PLAN = "qualification/capacity-native-workload-v3.plan.json"
INVENTORY = "qualification/capacity-native-full-graph-v3.inputs.json"
BASELINE = "qualification/issued-funding-post-native-vertical.inputs-v3.json"
KIND = "ONE_FULL_NATIVE_CAPACITY_V3_MANAGED_LAUNCH_SOURCE_NOT_EXECUTION"
PYTHON_NAMES = sorted((LAUNCHER, PLANNER, PROFILE, HELPER, TLS_GATE))
STORAGE_SHA = "a4d82a72214c9698fda7ae363c38b2470c08da5e2e04c63ee9284e43f638f081"
CLI_SHA = "0bf13cdc1f25a6b31ab14cfb124908808ca7ddc89073ecbcd0263bef4d52238c"
OPENSSL_SHA = "49db04c17e3a8c169ebc48a1149d78c165a86c04913203f46b2a14ce7f4a14fc"
TLS_CONFIG = b"""RANDFILE = /dev/null
[req]
prompt = no
distinguished_name = dn
x509_extensions = ext
[dn]
CN = 127.0.0.1
[ext]
subjectAltName = @names
basicConstraints = critical,CA:TRUE
keyUsage = critical,digitalSignature,keyEncipherment,keyCertSign
extendedKeyUsage = serverAuth
[names]
IP.1 = 127.0.0.1
DNS.1 = localhost
"""
_reservation_cache = {}

def require(value, code):
    if not value:
        raise ValueError(code)

def identity(s):
    return [str(v) for v in (s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode,
        s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns)]

def no_links(path):
    require(path.is_absolute() and os.path.normpath(str(path)) == str(path), "ABSOLUTE_INPUT_PATH")
    for at in (path, *path.parents):
        require(not at.is_symlink(), "INPUT_LINK")

def read(path, maximum=1048576, uid=None):
    no_links(path); before = path.lstat(); ident = identity(before)
    require(stat.S_ISREG(before.st_mode) and before.st_uid == (os.getuid() if uid is None else uid)
        and before.st_nlink == 1 and 0 <= before.st_size <= maximum, "OWNED_SOURCE_FILE")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        require(identity(os.fstat(stream.fileno())) == ident, "INPUT_OPEN_IDENTITY")
        raw = stream.read(maximum+1)
        require(len(raw) == before.st_size and identity(os.fstat(stream.fileno())) == ident, "INPUT_READ_IDENTITY")
    require(identity(path.lstat()) == ident, "INPUT_AFTER_IDENTITY")
    return raw, ident

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def pin(name, raw):
    return dict(path=name, bytes=len(raw), LF=raw.count(b"\n"), sha256=sha(raw),
        gitBlob=hashlib.sha1(b"blob "+str(len(raw)).encode()+b"\0"+raw).hexdigest())

def module(path, name):
    require(name not in sys.modules, "FRESH_PINNED_CONTROL_MODULE")
    spec = importlib.util.spec_from_file_location(name, path)
    require(spec is not None and spec.loader is not None, "PINNED_CONTROL_SPEC")
    value = importlib.util.module_from_spec(spec); sys.modules[name] = value
    spec.loader.exec_module(value)
    return value

def source_admission(repo, digest):
    """Public source reads only. No manager, private store or application load."""
    raw, ident = read(repo/MANIFEST, 65536)
    require(type(digest) is str and re.fullmatch(r"[0-9a-f]{64}", digest) and sha(raw) == digest, "EXPLICIT_LAUNCH_DIGEST")
    def pairs(items):
        out = {}
        for k, v in items:
            require(k not in out, "DUPLICATE_LAUNCH_KEY"); out[k] = v
        return out
    manifest = json.loads(raw.decode("ascii"), object_pairs_hook=pairs)
    require(type(manifest) is dict and set(manifest) == {"kind", "version", "sourceParent", "pythonControls",
        "inventory", "baseline", "workload", "effectsCeiling", "storagePolicy", "sourceRowsSha256",
        "completeManagedControlSourceAuthored", "nativeExecuted", "nativeAllowanceGranted", "nativeOsNetworkSandbox", "authority"}, "LAUNCH_FIELDS")
    require(manifest["kind"] == KIND and type(manifest["version"]) is int and manifest["version"] == 3
        and type(manifest["sourceParent"]) is str and re.fullmatch(r"[0-9a-f]{40}", manifest["sourceParent"])
        and manifest["completeManagedControlSourceAuthored"] is True and manifest["authority"] == "NONE"
        and all(manifest[k] is False for k in ("nativeExecuted", "nativeAllowanceGranted", "nativeOsNetworkSandbox")), "SOURCE_NOT_NATIVE_AUTHORITY")
    require(type(manifest["pythonControls"]) is list and all(type(p) is dict for p in manifest["pythonControls"])
        and [p.get("path") for p in manifest["pythonControls"]] == PYTHON_NAMES
        and Path(__file__).absolute() == repo/LAUNCHER, "EXACT_PYTHON_CONTROLS")
    owned = {MANIFEST:(raw, ident)}
    for row in manifest["pythonControls"]:
        value, file_id = read(repo/row["path"], 262144)
        require(pin(row["path"], value) == row, "PYTHON_CONTROL_PIN")
        owned[row["path"]] = (value, file_id)
    for name, key, maximum in ((INVENTORY,"inventory",65536), (BASELINE,"baseline",262144), (PLAN,"workload",65536)):
        value, file_id = read(repo/name, maximum)
        require(pin(name, value) == manifest[key], "LAUNCH_INPUT_PIN"); owned[name] = (value, file_id)
    planner = module(repo/PLANNER, "capacity_managed_v3_data")
    profile = module(repo/PROFILE, "capacity_managed_v3_profiles")
    require(sha(owned[PROFILE][0]) == planner.PROFILE_SHA
        and sha(owned[INVENTORY][0]) == planner.INVENTORY_SHA and manifest["sourceRowsSha256"] == planner.GRAPH_SHA, "FULL_GRAPH_CONTROL_BINDING")
    base = profile.load_helpers(repo)
    require(read(repo/HELPER, 65536) == owned[HELPER], "EXACT_FROZEN_HELPER")
    tls = module(repo/TLS_GATE, "capacity_managed_v3_tls_framing")
    selected = profile.capture_selection(base, owned[INVENTORY][0], owned[BASELINE][0])
    workload = planner.capture_plan(planner.decode(owned[PLAN][0],65536))
    effects, policy = planner.resource_plan(workload), planner.storage_policy(workload)
    require(planner.canonical(manifest["effectsCeiling"]) == planner.canonical(effects)
        and planner.canonical(manifest["storagePolicy"]) == planner.canonical(policy)
        and manifest["sourceRowsSha256"] == profile.SOURCE_SEAL == effects["sourceRowsSha256"], "EXACT_WORKLOAD_AND_RESERVATION")
    for row in selected["rows"]:
        if row["path"].startswith("app/"):
            name = row["path"][4:]; value = owned.get(name) or read(repo/name)
            require(pin(row["path"], value[0]) == row, "FULL_APPLICATION_PIN"); owned[name] = value
    def unchanged():
        for name, pair in owned.items():
            require(read(repo/name, max(65536,len(pair[0]))) == pair, "LAUNCH_SOURCE_CHANGED")
    unchanged()
    return manifest, planner, profile, base, tls, owned, workload, effects, unchanged

def binary(path, digest, uid, maximum=262144000):
    no_links(path); before = path.lstat(); ident = identity(before)
    require(stat.S_ISREG(before.st_mode) and before.st_uid == uid and before.st_nlink == 1
        and before.st_mode & 0o111 and 0 < before.st_size <= maximum, "NATIVE_BINARY_IDENTITY")
    found = hashlib.sha256()
    with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW),"rb") as stream:
        require(identity(os.fstat(stream.fileno())) == ident, "NATIVE_BINARY_OPEN")
        for part in iter(lambda:stream.read(1048576),b""):
            found.update(part)
        require(identity(os.fstat(stream.fileno())) == ident, "NATIVE_BINARY_READ")
    require(found.hexdigest() == digest and identity(path.lstat()) == ident, "NATIVE_BINARY_PIN")
    return ident

def private_directory(path):
    no_links(path); s = path.lstat()
    require(stat.S_ISDIR(s.st_mode) and s.st_uid == os.getuid() and stat.S_IMODE(s.st_mode) == 0o700, "PRIVATE_DIRECTORY")
    return [str(v) for v in (s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode)]

def reservations(root, own_task=None):
    """Read declared reservations only. Never recover, adopt or clean old tasks."""
    private_directory(root); raw, metadata_id = read(root/"storage.json",65536)
    metadata = json.loads(raw); directory_id = private_directory(root/"tasks")
    require(metadata.get("schema") == "zenon-owned-task-storage/v2"
        and re.fullmatch(r"[0-9a-f]{32}",metadata.get("id","")), "EXISTING_STORE_IDENTITY")
    total = 0; count = 0
    for directory in (root/"tasks").iterdir():
        private_directory(directory); require(re.fullmatch(r"[0-9a-f]{32}",directory.name), "EXISTING_TASK_NAME")
        path = directory/"task.json"; current = identity(path.lstat()); cached = _reservation_cache.get(str(path))
        if cached is not None and cached[0] == current:
            row = cached[1]
        else:
            data, file_id = read(path,4194304); full = json.loads(data)
            row = {k:full[k] for k in ("id","store_id","state","expected_bytes")}
            _reservation_cache[str(path)] = (file_id,row)
        require(row["id"] == directory.name and row["store_id"] == metadata["id"]
            and row["state"] in ("OPEN","CLOSED") and type(row["expected_bytes"]) is int
            and 0 <= row["expected_bytes"] <= 2**53-1, "EXISTING_TASK_RESERVATION")
        scratch = directory/"scratch"
        try:
            private_directory(scratch); exists = True
        except FileNotFoundError:
            exists = False
        if (row["state"] == "OPEN" or exists) and (metadata["id"],row["id"]) != own_task:
            total += row["expected_bytes"]
        count += 1; require(count<=4096, "RESERVATION_RECORD_BOUND")
    require(identity((root/"storage.json").lstat()) == metadata_id
        and private_directory(root/"tasks") == directory_id, "RESERVATION_METADATA_CHANGED")
    return dict(tasks=count,reservedBytes=total,storageSha256=sha(raw))

def capacity(volume, uuid, root, previous_roots, quota, own_task=None):
    # This read-only OS query is only in explicitly requested pre-native/execute
    # modes, never in source-only or DATA tests.
    no_links(volume); no_links(root)
    r = subprocess.run(["/usr/sbin/diskutil","info","-plist",str(volume)],capture_output=True,timeout=10)
    require(r.returncode == 0 and len(r.stdout) <= 65536 and len(r.stderr) <= 8192, "MOUNT_QUERY")
    information = plistlib.loads(r.stdout)
    require(information.get("VolumeUUID") == uuid and information.get("MountPoint") == str(volume)
        and root.parent == volume/"spv2" and root.parent.is_dir()
        and root.parent.stat().st_dev == volume.stat().st_dev == root.stat().st_dev, "EXPECTED_MOUNT_AND_STORE")
    chosen = [root]+[Path(p) for p in previous_roots]
    require(len(chosen)<=33 and len({str(p) for p in chosen}) == len(chosen), "DISTINCT_RESERVATION_ROOTS")
    values = []
    for p in chosen:
        require(p.parent == root.parent and p.stat().st_dev == root.stat().st_dev, "SAME_APPROVED_RESERVATION_VOLUME")
        values.append(reservations(p,own_task))
    amount = sum(v["reservedBytes"] for v in values)
    space = os.statvfs(volume); available = space.f_bavail*space.f_frsize
    required = 10737418240+quota+amount
    require(available>=required, "PRODUCTION_FLOOR_AND_ALL_DECLARED_RESERVATIONS")
    return dict(availableBytes=available,requiredBytes=required,reservationBytes=amount,
        scopedRoots=len(chosen),minimumFreeBytes=10737418240,quotaBytesReservedNotAllocated=quota)

def check_registry(profile, registry):
    ancestors = set()
    for row in registry["inputs"]:
        from urllib.parse import urlparse, unquote
        path = Path(unquote(urlparse(row["url"]).path))
        require(identity(path.lstat()) == row["identity"], "FULL_SOURCE_REGISTRY_IDENTITY_CHANGED")
        ancestors.update((path,*path.parents))
    for path in ancestors:
        require(not path.is_symlink(), "FULL_SOURCE_REGISTRY_LINK")
    no_links(Path(registry["applicationRoot"])); no_links(Path(registry["packageRoot"]))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ("repo","manifest-sha256"):
        p.add_argument("--"+name,required=True)
    mode = p.add_mutually_exclusive_group()
    for name in ("source-only","pre-native-plan","execute"):
        mode.add_argument("--"+name,action="store_true")
    for name in ("packages","node","manager","root","store-id","storage-sha256","volume","volume-uuid",
                 "approval-launch-sha256","approval-plan-sha256","native-selection"):
        p.add_argument("--"+name)
    p.add_argument("--reservation-root",action="append",default=[])
    args = p.parse_args()
    require(sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode, "ISOLATED_NO_BYTECODE_REQUIRED")
    repo = Path(args.repo); no_links(repo)
    manifest, data, profile, base, tls_gate, owned, workload, effects, unchanged = source_admission(repo,args.manifest_sha256)
    print(json.dumps(dict(event="P4_MANAGED_V3_SOURCE_ONLY_NOT_NATIVE",applicationFilesRead=139,packageFilesDeclared=404,
        effectsCeiling=effects,completeManagedControlSourceAuthored=True,nativeAllowanceGranted=False,authority="NONE")),flush=True)
    registry = None
    if args.packages is not None:
        require(args.node is not None, "PINNED_NODE_FOR_SOURCE_REGISTRY")
        registry = profile.build_source_registry(base,str(repo),args.packages,args.node,owned[INVENTORY][0],owned[BASELINE][0])
        unchanged()
        print(json.dumps(dict(event="P4_MANAGED_V3_REGISTRY_READ_IN_PLACE",sourceRowsSha256=profile.SOURCE_SEAL,
            files=543,sourceCopies=0,packageCopies=0,nodeExecuted=False,privateRootsOpened=False)),flush=True)
    if not args.execute and not args.pre_native_plan:
        return 0
    require(sys.platform == "darwin" and os.uname().machine == "arm64" and sys.version.split()[0] == "3.12.14", "NATIVE_DRIVER_RUNTIME")
    require(registry is not None and all(getattr(args,k) is not None for k in
        ("manager","root","store_id","storage_sha256","volume","volume_uuid")), "EXPLICIT_NATIVE_STORAGE_SELECTION")
    require(re.fullmatch(r"[0-9a-f]{32}",args.store_id) and re.fullmatch(r"[0-9a-f]{64}",args.storage_sha256)
        and re.fullmatch(r"[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}",args.volume_uuid), "PRIVATE_STORE_AND_VOLUME_IDENTITY")
    root,volume,manager,node = map(Path,(args.root,args.volume,args.manager,args.node))
    require(len(args.reservation_root)<=32 and len(args.reservation_root)==len(set(args.reservation_root)), "BOUNDED_RESERVATION_SCOPE")
    manager_raw,manager_id = read(manager/"storage.py",262144); cli_raw,cli_id = read(manager/"cli.py",65536)
    require(sha(manager_raw)==STORAGE_SHA and sha(cli_raw)==CLI_SHA, "APPROVED_UNCHANGED_MANAGER")
    meta_raw,meta_id = read(root/"storage.json",65536)
    require(sha(meta_raw)==args.storage_sha256 and json.loads(meta_raw).get("id")==args.store_id, "EXPLICIT_STORE_METADATA_PIN")
    node_id = registry["runtime"]["nodeIdentity"]
    require(identity(node.lstat())==node_id, "ACTUAL_PINNED_NODE_IDENTITY")
    openssl = Path("/usr/bin/openssl"); openssl_id = binary(openssl,OPENSSL_SHA,0)
    capacity(volume,args.volume_uuid,root,args.reservation_root,effects["taskQuotaBytes"])
    if args.pre_native_plan:
        print(json.dumps(dict(event="P4_MANAGED_V3_READ_ONLY_PRE_NATIVE_PLAN",nativeExecuted=False,
            expectedPeakBytes=effects["expectedPeakBytes"],authority="NONE")),flush=True)
        return 0
    # These source tripwires are not human permission. The operator must have
    # supplied a NEW finite scope; source-only/DATA controls never grant it.
    require(args.native_selection=="one-new-approved-full-native-capacity-v3-workload"
        and args.approval_launch_sha256==args.manifest_sha256
        and args.approval_plan_sha256==effects["workloadPlanSha256"], "NEW_EXACT_NATIVE_ALLOWANCE_REQUIRED")
    require(effects["theoreticalCaptureMayExceedEntryCap"] is False, "FULL_CAPTURE_BOUND_EXCEEDS_REAL_ENTRY_CAP")
    storage = module(manager/"storage.py","storage")
    require(read(manager/"storage.py",262144)==(manager_raw,manager_id), "MANAGER_CHANGED_ON_IMPORT")
    store = storage.Store(root,metadata_lock_timeout=5)
    require(store.id==args.store_id and dataclasses.asdict(store.policy)==data.storage_policy(workload)
        and not store._tasks(), "NEW_UNUSED_EXACT_POLICY_STORE")
    original_env = dict(os.environ); previous_umask = os.umask(0o077)
    os.environ.clear(); os.environ.update(PATH="/usr/bin:/bin",LANG="C",LC_ALL="C",TZ="UTC",
        NODE_DISABLE_COMPILE_CACHE="1",WS_NO_BUFFER_UTIL="1",WS_NO_UTF_8_VALIDATE="1")
    task = None; observed = None; private_aliases = []
    def before_native():
        unchanged(); check_registry(profile,registry)
        require(identity(node.lstat())==node_id and identity(openssl.lstat())==openssl_id
            and read(manager/"storage.py",262144)==(manager_raw,manager_id)
            and read(manager/"cli.py",65536)==(cli_raw,cli_id)
            and read(root/"storage.json",65536)==(meta_raw,meta_id), "NATIVE_CONTROL_IDENTITY_CHANGED")
        for path,digest,file_id in private_aliases:
            raw,now_id=read(path,16384)
            require(now_id == file_id and sha(raw) == digest, "PRIVATE_TLS_ALIAS_CHANGED")
        return capacity(volume,args.volume_uuid,root,args.reservation_root,effects["taskQuotaBytes"],
            None if task is None else (store.id,task.id))
    try:
        before_native()
        with store.task("zenon-x402-full-native-capacity-v3-once",expected_bytes=effects["expectedPeakBytes"],
                        quota_bytes=effects["taskQuotaBytes"]) as task:
            def retained(name,raw):
                path=task.write(name,raw); kept=task.preserve(path,sha(raw),len(raw))
                return dict(path=str(store.object(kept["sha256"],kept["bytes"])),sha256=kept["sha256"])
            for name in (MANIFEST,PLAN):
                retained("inputs/"+Path(name).name,owned[name][0])
            run_id = sha((store.id+":"+task.id+":"+profile.SOURCE_SEAL+":"+effects["workloadPlanSha256"]).encode("ascii"))
            task.record("scope.json",dict(runId=run_id,launchSha256=args.manifest_sha256,
                workloadPlanSha256=effects["workloadPlanSha256"],sourceRowsSha256=profile.SOURCE_SEAL,
                effectsCeiling=effects,automaticRetry=False,newNativeAllowanceRequired=True,nativeOsNetworkSandbox=False))
            config = task.write("tls.cnf",TLS_CONFIG)
            before_native()
            # One native TLS command, never rerun after failure or lost metadata.
            certificate = task.run([str(openssl),"req","-x509","-newkey","rsa:2048","-nodes","-sha256","-days","1",
                "-keyout","/dev/stdout","-config",str(config)],cwd=task.scratch,timeout=effects["opensslTimeoutSeconds"],
                stdout_limit=65536,retain_argv=False)
            task.record("tls-command.json",certificate)
            require(certificate["state"]=="COMPLETE" and certificate["output_complete"] is True
                and type(certificate["actual_exit"]) is int and certificate["actual_exit"]==0, "TEST_TLS_COMMAND_FAILED_OR_UNKNOWN")
            pem_path=store.object(certificate["stdout"]["sha256"],certificate["stdout"]["bytes"])
            pem=read(pem_path,65536)[0]; material=tls_gate.split_test_tls_stdout(pem)
            tls_objects={name:retained("test-"+name,raw) for name,raw in material.items()}
            child_refs=[]; lane_profiles=[]
            for ordinal,lane_id in enumerate(workload["laneIds"],1):
                role_profiles={}
                for role in ("PAYER","SERVICE"):
                    relative="lanes/"+format(ordinal,"02d")+"/"+role.lower()
                    marker=task.write(relative+"/admission.json",data.canonical(dict(runId=run_id,laneId=lane_id,role=role))+b"\n",disposable=True)
                    lane_root=marker.parent
                    for name in (("tls-cert.pem",) if role=="PAYER" else ("tls-key.pem","tls-cert.pem")):
                        # Real independent APFS alias, never an evidence hardlink.
                        alias=task.materialize(tls_objects[name]["sha256"],relative+"/"+name,method="clone")
                        alias.chmod(0o600); alias_raw,alias_id=read(alias,16384)
                        require(alias_raw==material[name], "INDEPENDENT_PRIVATE_TLS_ALIAS")
                        private_aliases.append((alias,sha(alias_raw),alias_id))
                    built=profile.build_role_profile(base,registry,owned[INVENTORY][0],owned[BASELINE][0],
                        role,dict(runId=run_id,laneId=lane_id),str(lane_root),[])
                    ref=retained("profiles/"+format(ordinal,"02d")+"-"+role.lower()+".json",built["profileBytes"])
                    row=dict(role=role,laneId=lane_id,path=ref["path"],sha256=ref["sha256"],
                        entryURL=next(v["url"]for v in registry["inputs"]if v["logicalPath"]==profile.SPECS[role]["entry"]),
                        preloaderURL=next(v["url"]for v in registry["inputs"]if v["logicalPath"]==profile.SPECS[role]["preloader"]),
                        rootPath=str(lane_root),rootIdentity=private_directory(lane_root))
                    child_refs.append(row); role_profiles[role.lower()+"Profile"]=ref
                lane_profiles.append(dict(laneId=lane_id,**role_profiles))
            built=profile.build_role_profile(base,registry,owned[INVENTORY][0],owned[BASELINE][0],"SUPERVISOR",
                dict(runId=run_id,laneId="workload.parent"),str(task.scratch),child_refs)
            parent=retained("profiles/supervisor.json",built["profileBytes"])
            native_plan=dict(context=dict(runId=run_id),plan=workload["plan"],recordingLimits=workload["recordingLimits"],
                laneProfiles=lane_profiles,payeeAddress=workload["payeeAddress"],commandBudgetMs=workload["commandBudgetMs"],closeBudgetMs=workload["closeBudgetMs"])
            native_plan_ref=retained("profiles/workload.json",data.canonical(native_plan)+b"\n")
            os.environ.update(X402_NATIVE_CAPACITY_SUPERVISOR_SELECTION="native-capacity-supervisor-source-draft-v3",
                X402_NATIVE_CAPACITY_WORKLOAD_SELECTION="native-capacity-workload-source-draft-v3",
                X402_NATIVE_CAPACITY_RUN_SCOPE="one-reviewed-native-capacity-paired-workload-v3",
                X402_NATIVE_CAPACITY_RUN_ID=run_id,X402_NATIVE_CAPACITY_LANE_ID="workload.parent",
                X402_NATIVE_CAPACITY_SUPERVISOR_PROFILE_PATH=parent["path"],X402_NATIVE_CAPACITY_SUPERVISOR_PROFILE_SHA256=parent["sha256"],
                X402_NATIVE_CAPACITY_PLAN_PATH=native_plan_ref["path"],X402_NATIVE_CAPACITY_PLAN_SHA256=native_plan_ref["sha256"])
            before_native()
            entry=repo/profile.SPECS["SUPERVISOR"]["entry"][4:]; preload=repo/profile.SPECS["SUPERVISOR"]["preloader"][4:]
            # One actual parent, at most two hardwired children per lane. The
            # manager supervises only this task's process group and real streams.
            receipt=task.run([str(node),"--no-addons","--disallow-code-generation-from-strings","--disable-proto=throw",
                "--unhandled-rejections=strict","--import="+str(preload),str(entry),str(task.scratch)],
                cwd=repo,timeout=effects["nodeTimeoutSeconds"],stdout_limit=effects["nodeStdoutLimit"],retain_argv=False)
            task.record("parent-command.json",receipt); unchanged()
            stdout=read(store.object(receipt["stdout"]["sha256"],receipt["stdout"]["bytes"]),effects["nodeStdoutLimit"])[0]
            stderr=read(store.object(receipt["stderr"]["sha256"],receipt["stderr"]["bytes"]),1048576)[0]
            observed=data.validate_capture_data(stdout,stderr,receipt,workload,run_id)
            task.record("component-data.json",dict(observed=observed,storageCleanupStatus="NOT_ESTABLISHED",authority="NONE"))
            # Do not adopt, open SQL, rewrite pins, re-sign, retry or unlink the
            # unknown child-created files. Normal owned task closure preserves
            # them in HOLD according to the unchanged manager's contract.
        closed=json.loads(read(task.directory/"task.json",4194304)[0])
        cleanup=json.loads(read(task.evidence/"cleanup.json",65536)[0])
        end=data.closed_storage_data(closed,cleanup,store.id,task.id)
        print(json.dumps(dict(event="P4_MANAGED_V3_COMPONENT_CAPTURE_STORAGE_SEPARATE",component=observed,storage=end,
            nativeResourcesQualified=False,sustainableCapacityQualified=False,productionQualified=False,authority="NONE")),flush=True)
        return 0 if end["storageDecision"] in ("CLEANED","ALREADY_CLEAN") else 1
    finally:
        os.environ.clear(); os.environ.update(original_env); os.umask(previous_umask)

if __name__=="__main__":
    try:
        sys.exit(main())
    except (OSError,ValueError,KeyError,TypeError,RuntimeError) as error:
        code=str(error)if type(error)is ValueError and re.fullmatch(r"[A-Z0-9_]+",str(error))else "PRESERVE_PRIVATE_OWNED_RECEIPTS"
        print(json.dumps(dict(event="P4_MANAGED_V3_REFUSED_OR_UNKNOWN",code=code,errorType=type(error).__name__,
            automaticRetry=False,authority="NONE")),file=sys.stderr,flush=True)
        sys.exit(1)

