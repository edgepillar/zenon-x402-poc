"""Timer-parent V3 managed command planning: complete declared DATA, no I/O.

Bind full parent-profile bytes, all 551 public source-row declarations, whole
entry bytes and every resource field to the real Node command/environment.
Caller provenance, physical source/root/CAS identities, manager receipts and
human authority are NOT inferred from a matching DATA plan.
"""
import hashlib
import json
import re
from urllib.parse import quote

HASH = re.compile(r"[0-9a-f]{64}")
PARENT_SEAL = "0e0533ba2e3bfdf97b2670a0ee693c64ddc04ea93bf52b4e779d9d073cb51c90"
CHILD_SEAL = "d756740994aeb53ebeee47320d732583d96381dfa8c00e18a30f414e70a77027"
NODE_SHA = "dbedff294bab84a0a86c04e15fbcbeb1c97ca10bef1b32b0634cd24b36f62100"
ENTRY = "qualification/capacity-native-paced-workload-v3.entry.draft.mjs"
PRELOAD = "qualification/capacity-native-paced-supervisor-v3.namespace.preload.draft.mjs"
PROFILE_FIELDS = {"profileVersion", "profileKind", "role", "runtime", "entryURL", "preloaderURL", "inputs",
    "bareBindings", "allowedBuiltins", "sourceRowsSha256", "childSourceRowsSha256", "sourceTransform",
    "ordinaryInstalledNamespace", "baselineManifestSha256", "runId", "laneId", "rootPath", "rootIdentity", "childProfiles"}
ROW_FIELDS = {"logicalPath", "url", "bytes", "LF", "sha256", "gitBlob", "identity"}
REF_FIELDS = {"role", "laneId", "path", "sha256", "entryURL", "preloaderURL", "rootPath", "rootIdentity"}
ROLES = {
    "PAYER": ("app/qualification/capacity-native-payer-lane-v3.worker.draft.mjs",
        "app/qualification/capacity-native-payer-lane-v3.namespace.preload.draft.mjs"),
    "SERVICE": ("app/qualification/capacity-native-service-lane-v3.worker.draft.mjs",
        "app/qualification/capacity-native-service-lane-v3.namespace.preload.draft.mjs"),
}


def require(value, code):
    if not value:
        raise ValueError(code)


def fields(value, names, code):
    require(type(value) is dict and set(value) == set(names), code)


def same(left, right):
    """Resource outputs exceed the workload parser's 32-field object limit."""
    pending = [(left, right, 0)]; count = 0
    while pending:
        a, b, depth = pending.pop(); count += 1
        require(count <= 16384 and depth <= 16, "BOUNDED_RESOURCE_COMPARISON")
        if type(a) is not type(b):
            return False
        if type(a) is dict:
            if len(a) > 512 or set(a) != set(b) or not all(type(k) is str for k in a):
                return False
            pending.extend((a[k], b[k], depth + 1) for k in a)
        elif type(a) is list:
            if len(a) > 1024 or len(a) != len(b):
                return False
            pending.extend((v, w, depth + 1) for v, w in zip(a, b))
        elif type(a) is str:
            if len(a) > 4096 or a != b:
                return False
        elif type(a) not in (int, bool) and a is not None:
            raise ValueError("EXACT_RESOURCE_DATA_TYPES")
        elif a != b:
            return False
    return True


def absolute(value):
    require(type(value) is str and 1 < len(value) <= 4096 and value.startswith("/")
        and all(32 <= ord(c) <= 126 for c in value)
        and all(part not in ("", ".", "..") for part in value[1:].split("/")), "CANONICAL_COMMAND_PATH")
    return value


def identity(value, count):
    require(type(value) is list and len(value) == count
        and all(type(v) is str and re.fullmatch(r"0|[1-9][0-9]{0,19}", v) for v in value),
        "DECLARED_EXACT_IDENTITY")
    require(int(value[0]) > 0 and int(value[1]) > 0, "DECLARED_NONZERO_IDENTITY")
    return value


def decode(raw, maximum):
    require(type(raw) is bytes and 1 < len(raw) <= maximum and raw.isascii()
        and raw[:1] == b"{" and raw[-1:] == b"\n" and raw.count(b"\n") == 1, "ONE_COMPLETE_PRIVATE_JSON_FRAME")
    def pairs(items):
        out = {}
        for key, value in items:
            require(key not in out, "DUPLICATE_PRIVATE_KEY"); out[key] = value
        return out
    def invalid(_):
        raise ValueError("NON_INTEGER_PRIVATE_JSON")
    def integer(text):
        require(text != "-0" and len(text) <= 17, "SAFE_PRIVATE_INTEGER")
        value = int(text)
        require(-(2**53 - 1) <= value <= 2**53 - 1, "SAFE_PRIVATE_INTEGER")
        return value
    return json.loads(raw.decode("ascii"), object_pairs_hook=pairs,
        parse_float=invalid, parse_constant=invalid, parse_int=integer)


def retained_data(value, store, maximum):
    fields(value, {"path", "sha256", "raw"}, "WHOLE_RETAINED_INPUT_FIELDS")
    require(type(value["sha256"]) is str and HASH.fullmatch(value["sha256"])
        and absolute(value["path"]) == store + "/objects/" + value["sha256"], "SAME_DECLARED_STORE_CAS_REFERENCE")
    raw = value["raw"]
    require(type(raw) is bytes and 0 < len(raw) <= maximum
        and hashlib.sha256(raw).hexdigest() == value["sha256"], "WHOLE_RETAINED_BYTES_DIGEST")
    return decode(raw, maximum)


def plan(resource, workload, effects, repo, node, task_root, parent_input, entry_input, run_id):
    """Return exact PRIVATE argv/env plus the one decoded parent profile.

    Genuine source-admitted resource/producer controls are required by the
    managed caller. This DATA API does not authenticate their provenance.
    No installed source, task, profile, Node, clock or receipt is accessed.
    """
    value = resource.capture_plan(workload)
    expected = resource.resource_plan(value)
    require(same(effects, expected), "WHOLE_TIMER_RESOURCE_SELECTION")
    require(expected["resourcePlanVersion"] == 3 and expected["pacedCaptureVersion"] == 4
        and expected["pacedTimerCaptureVersion"] == 1 and expected["parentProfileVersion"] == 3
        and expected["parentSourceRowsSha256"] == PARENT_SEAL and expected["childSourceRowsSha256"] == CHILD_SEAL
        and expected["captureReservationFitsEntryCap"] is True
        and expected["effectsExecuted"] is False and expected["nativeAllowanceGranted"] is False
        and expected["authority"] == "NONE", "EXACT_CURRENT_TIMER_RESOURCE_CONTEXT")
    repo, node, task_root = map(absolute, (repo, node, task_root))
    parts = task_root.rsplit("/", 3)
    require(len(parts) == 4 and parts[0] and parts[1] == "tasks"
        and re.fullmatch(r"[0-9a-f]{32}", parts[2]) and parts[3] == "scratch", "DECLARED_OWNED_TASK_SCRATCH")
    store = absolute(parts[0])
    require(type(run_id) is str and HASH.fullmatch(run_id), "EXACT_COMMAND_RUN_ID")
    profile = retained_data(parent_input, store, 524288)
    entry = retained_data(entry_input, store, 65536)
    require(parent_input["path"] != entry_input["path"] and parent_input["sha256"] != entry_input["sha256"],
        "DISTINCT_PARENT_AND_ENTRY_INPUTS")
    fields(profile, PROFILE_FIELDS, "EXACT_COMPLETE_TIMER_PARENT_FIELDS")
    require(type(profile["profileVersion"]) is int and profile["profileVersion"] == 3
        and profile["profileKind"] == "NATIVE_CAPACITY_PACED_SUPERVISOR_NODE24_V3"
        and profile["role"] == "SUPERVISOR" and profile["runId"] == run_id
        and profile["laneId"] == "workload.parent" and profile["rootPath"] == task_root
        and profile["sourceRowsSha256"] == PARENT_SEAL and profile["childSourceRowsSha256"] == CHILD_SEAL
        and profile["sourceTransform"] is False and profile["ordinaryInstalledNamespace"] is False
        and profile["baselineManifestSha256"] == "51ffb5b0ff0052523c1b7f3d75fa24e9be27e60ca3bcc09236b1f439096aaed1",
        "TIMER_PARENT_VERSION_GRAPH_CONTEXT")
    rt = profile["runtime"]
    fields(rt, {"node", "platform", "arch", "nodeSha256", "nodeIdentity"}, "PINNED_NODE_DECLARATION_FIELDS")
    require(rt["node"] == "24.19.0" and rt["platform"] == "darwin" and rt["arch"] == "arm64"
        and rt["nodeSha256"] == NODE_SHA, "EXACT_NODE_RUNTIME_DECLARATION")
    ident = identity(rt["nodeIdentity"], 9)
    require(int(ident[4]) & 0o170000 == 0o100000 and int(ident[4]) & 0o111
        and ident[5] == "1" and ident[6] == "121304480", "DECLARED_NODE_FILE_IDENTITY")
    root_id = identity(profile["rootIdentity"], 5)
    require(root_id[4] == "16832" and root_id[2] == ident[2], "DECLARED_PRIVATE_PARENT_ROOT")
    rows = profile["inputs"]
    require(type(rows) is list and len(rows) == 551, "COMPLETE_551_DECLARED_INPUTS")
    public, urls = [], {}
    for row in rows:
        fields(row, ROW_FIELDS, "COMPLETE_DECLARED_SOURCE_ROW")
        path = row["logicalPath"]
        require(type(path) is str and 0 < len(path) <= 1024 and path not in urls
            and (path.startswith("app/") or path.startswith("packages/"))
            and all(part not in ("", ".", "..") for part in path.split("/")), "DECLARED_SOURCE_LOGICAL_PATH")
        require(type(row["url"]) is str and row["url"].startswith("file:///") and len(row["url"]) <= 4096,
            "DECLARED_SOURCE_FILE_URL")
        require(type(row["bytes"]) is int and 0 <= row["bytes"] <= 6291456
            and type(row["LF"]) is int and 0 <= row["LF"] <= row["bytes"]
            and type(row["sha256"]) is str and HASH.fullmatch(row["sha256"])
            and type(row["gitBlob"]) is str and re.fullmatch(r"[0-9a-f]{40}", row["gitBlob"]), "DECLARED_SOURCE_PIN_VALUES")
        source_id = identity(row["identity"], 9)
        require(source_id[2] == root_id[2] and source_id[5] == "1" and source_id[6] == str(row["bytes"])
            and int(source_id[4]) & 0o170000 == 0o100000, "DECLARED_SOURCE_FILE_IDENTITY")
        public.append(dict(path=path, bytes=row["bytes"], LF=row["LF"], sha256=row["sha256"], gitBlob=row["gitBlob"]))
        urls[path] = row["url"]
    require([row["path"] for row in public] == sorted(urls)
        and sum(path.startswith("app/") for path in urls) == 147
        and hashlib.sha256(resource.canonical_bytes(public)[:-1]).hexdigest() == PARENT_SEAL,
        "WHOLE_DECLARED_PARENT_SOURCE_ROW_SEAL")
    require(profile["entryURL"] == urls["app/" + ENTRY] and profile["preloaderURL"] == urls["app/" + PRELOAD],
        "TIMER_PARENT_ENTRY_PRELOADER_URLS")
    require(profile["entryURL"] == "file://" + quote(repo + "/" + ENTRY, safe="/")
        and profile["preloaderURL"] == "file://" + quote(repo + "/" + PRELOAD, safe="/"),
        "COMMAND_REPOSITORY_MATCHES_PARENT_SOURCE_URLS")
    require(type(profile["allowedBuiltins"]) is list and "node:child_process" in profile["allowedBuiltins"],
        "GENUINE_PARENT_CHILD_PROCESS_DECLARATION")
    refs = profile["childProfiles"]
    require(type(refs) is list and len(refs) == 2 * len(value["laneIds"]), "EXACT_TIMER_PARENT_CHILD_COUNT")
    lanes, paths, roots = [], {parent_input["path"], entry_input["path"]}, {tuple(root_id[:2])}
    for ordinal, lane_id in enumerate(value["laneIds"], 1):
        lane = dict(laneId=lane_id)
        for offset, role in enumerate(("PAYER", "SERVICE")):
            ref = refs[2 * (ordinal - 1) + offset]
            fields(ref, REF_FIELDS, "EXACT_TIMER_PARENT_CHILD_REFERENCE")
            require(ref["role"] == role and ref["laneId"] == lane_id and type(ref["sha256"]) is str
                and HASH.fullmatch(ref["sha256"]) and absolute(ref["path"]) == store + "/objects/" + ref["sha256"]
                and ref["path"] not in paths, "ORDERED_SAME_STORE_CHILD_REFERENCE")
            require(ref["entryURL"] == urls[ROLES[role][0]] and ref["preloaderURL"] == urls[ROLES[role][1]],
                "ORIGINAL_R4_CHILD_ROLE_URLS")
            rid = identity(ref["rootIdentity"], 5)
            require(ref["rootPath"] == task_root + "/lanes/" + format(ordinal, "02d") + "/" + role.lower()
                and rid[0] == root_id[0] and rid[2] == root_id[2] and rid[4] == "16832"
                and tuple(rid[:2]) not in roots, "DECLARED_INDEPENDENT_PLANNED_ROLE_ROOTS")
            roots.add(tuple(rid[:2])); paths.add(ref["path"])
            lane[role.lower() + "Profile"] = dict(path=ref["path"], sha256=ref["sha256"])
        lanes.append(lane)
    expected_entry = resource.entry_plan(value, run_id, lanes)
    require(entry_input["raw"] == expected_entry["planBytes"], "WHOLE_ENTRY_BYTES_MATCH_PARENT_AND_WORKLOAD")
    require(type(entry) is dict, "EXACT_ENTRY_OBJECT")
    argv = [node, "--no-addons", "--disallow-code-generation-from-strings", "--disable-proto=throw",
        "--unhandled-rejections=strict", "--import=" + repo + "/" + PRELOAD, repo + "/" + ENTRY, task_root]
    env = dict(X402_NATIVE_CAPACITY_SUPERVISOR_SELECTION="native-capacity-paced-supervisor-source-draft-v3",
        X402_NATIVE_CAPACITY_WORKLOAD_SELECTION="native-capacity-paced-workload-source-draft-v3",
        X402_NATIVE_CAPACITY_RUN_SCOPE="one-reviewed-native-capacity-paced-parent-v3",
        X402_NATIVE_CAPACITY_RUN_ID=run_id, X402_NATIVE_CAPACITY_LANE_ID="workload.parent",
        X402_NATIVE_CAPACITY_SUPERVISOR_PROFILE_PATH=parent_input["path"],
        X402_NATIVE_CAPACITY_SUPERVISOR_PROFILE_SHA256=parent_input["sha256"],
        X402_NATIVE_CAPACITY_PLAN_PATH=entry_input["path"], X402_NATIVE_CAPACITY_PLAN_SHA256=entry_input["sha256"])
    return dict(argv=argv, envDelta=env, sourceProfile=profile, timeoutSeconds=expected["nodeTimeoutSeconds"],
        stdoutLimit=expected["nodeStdoutLimit"], stderrLimit=expected["nodeStderrLimit"],
        summary=dict(kind="PACED_TIMER_PARENT_V3_MANAGED_COMMAND_BINDING_DATA", parentSourceRows=551,
            childSourceRows=543, childProfiles=len(refs), parentProfileVersion=3, pacedCaptureVersion=4,
            pacedTimerCaptureVersion=1, resourcePlanVersion=3, wholeEntryBytesBound=True,
            wholeDeclaredSourceRowSealRecomputed=True, completeResourceFieldsBound=True,
            nativeCommandExecuted=False, sourceBytesPhysicallyAuthenticated=False,
            rootsPhysicallyAuthenticated=False, casOriginsAuthenticated=False,
            managerReceiptOriginsAuthenticated=False, nativeAllowanceGranted=False, authority="NONE"))
