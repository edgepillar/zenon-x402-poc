"""Current packed offered V3 managed command binding. Complete DATA, never execution.

All current profile and entry bytes are checked with the genuine current full
producer. Whole resource fields bind the command. Supplied roots, CAS paths and
matching DATA are not authenticated origins, native authority or OS quotas.
"""
import hashlib
import json
import re
from urllib.parse import quote

HASH=re.compile(r"[0-9a-f]{64}")
PARENT_SEAL="9c9681a1229d69824c4859c1bf9a57498bc5ed9a24755c63280e6b4b528bea5d"
CHILD_SEAL="92646a2cf5edf717a1d24468fa6277c48c4f59f43db5b6e607b6071acc79c2b2"
NODE_SHA="dbedff294bab84a0a86c04e15fbcbeb1c97ca10bef1b32b0634cd24b36f62100"
ENTRY="qualification/capacity-native-current-offered-v5.entry.draft.mjs"
PRELOAD="qualification/capacity-native-current-offered-v5.namespace.preload.draft.mjs"
NATIVE_SCOPE="one-reviewed-native-capacity-current-offered-parent-v5"

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



def assemble(planner,resource,workload,run_id,root,children):
    """Full current profiles and actual offered entry bytes, only in memory."""
    value=resource.capture_plan(workload);effects=resource.resource_plan(value)
    require(effects["captureReservationFitsEntryCap"]is True,"COMPLETE_OFFERED_CAPTURE_MUST_FIT")
    require(type(children)is list and len(children)==2*len(value["laneIds"]),"COMPLETE_CURRENT_CHILD_PROFILE_COUNT")
    lanes=[]
    for ordinal,lane in enumerate(value["laneIds"],1):
        refs={}
        for offset,role in enumerate(("PAYER","SERVICE")):
            bundle=children[2*(ordinal-1)+offset]
            fields(bundle,{"reference","profileBytes"},"COMPLETE_CURRENT_BUNDLE")
            ref=bundle["reference"]
            require(type(ref)is dict and ref.get("role")==role and ref.get("laneId")==lane,"ORDERED_CURRENT_ROLES_AND_LANES")
            require(ref.get("rootPath")==root["path"]+"/lanes/"+format(ordinal,"02d")+"/"+role.lower(),"PLANNED_INDEPENDENT_ROLE_ROOT")
            refs[role.lower()+"Profile"]=dict(path=ref["path"],sha256=ref["sha256"])
        lanes.append(dict(laneId=lane,**refs))
    parent=planner.plan_parent(dict(runId=run_id,laneId="workload.parent"),root,children)
    entry=resource.entry_plan(value,run_id,lanes)
    return dict(parentProfile=parent,entryPlan=entry,resourcePlan=effects,
        summary=dict(kind="COMPLETE_CURRENT_OFFERED_PROFILE_AND_ENTRY_DATA",parentSourceRows=578,childSourceRows=567,
            parentProfileVersion=8,childProfileVersion=6,childProfiles=len(children),wholeCurrentChildBytesPreserved=True,
            originalEntryPlanBytesBound=True,rootsPhysicallyAuthenticated=False,casOriginsAuthenticated=False,
            effectsExecuted=False,nativeAllowanceGranted=False,authority="NONE"))


def plan(planner,resource,workload,effects,repo,node,task_root,parent_input,entry_input,run_id,children):
    """Exact private argv/environment; no source or storage access."""
    value=resource.capture_plan(workload);expected=resource.resource_plan(value)
    require(same(effects,expected),"WHOLE_CURRENT_OFFERED_RESOURCE_SELECTION")
    require(expected["resourcePlanVersion"]==4 and expected["offeredCaptureVersion"]==3
        and expected["parentProfileVersion"]==8 and expected["childProfileVersion"]==6
        and expected["parentSourceRowsSha256"]==PARENT_SEAL and expected["childSourceRowsSha256"]==CHILD_SEAL
        and expected["captureReservationFitsEntryCap"]is True and expected["effectsExecuted"]is False
        and expected["nativeAllowanceGranted"]is False and expected["authority"]=="NONE","CURRENT_OFFERED_GRAPH_AND_AUTHORITY")
    repo,node,task_root=map(absolute,(repo,node,task_root))
    parts=task_root.rsplit("/",3)
    require(len(parts)==4 and parts[0] and parts[1]=="tasks" and re.fullmatch(r"[0-9a-f]{32}",parts[2])
        and parts[3]=="scratch","DECLARED_MANAGED_TASK_ROOT")
    store=absolute(parts[0])
    require(type(run_id)is str and HASH.fullmatch(run_id),"EXACT_CURRENT_RUN_ID")
    profile=retained_data(parent_input,store,524288);retained_data(entry_input,store,65536)
    require(parent_input["path"]!=entry_input["path"] and parent_input["sha256"]!=entry_input["sha256"],"DISTINCT_FULL_PARENT_AND_ENTRY")
    root=dict(path=task_root,identity=profile.get("rootIdentity"))
    full=assemble(planner,resource,value,run_id,root,children)
    require(parent_input["raw"]==full["parentProfile"]["profileBytes"],"WHOLE_GENUINE_CURRENT_PARENT_PROFILE_BYTES")
    require(entry_input["raw"]==full["entryPlan"]["planBytes"],"WHOLE_CURRENT_ENTRY_PLAN_BYTES")
    require(profile["rootPath"]==task_root and profile["runId"]==run_id
        and profile["laneId"]=="workload.parent" and profile["profileVersion"]==8,"CURRENT_PARENT_TASK_CONTEXT")
    # Keep the full-profile canonical source URL rule, including unescaped @.
    require(profile["entryURL"]=="file://"+quote(repo+"/"+ENTRY,safe="/@")
        and profile["preloaderURL"]=="file://"+quote(repo+"/"+PRELOAD,safe="/@"),"CURRENT_COMMAND_SOURCE_ROOT")
    require(profile["runtime"]["nodeSha256"]==NODE_SHA,"CURRENT_NODE_RUNTIME")
    paths={parent_input["path"],entry_input["path"]}
    for bundle in children:
        ref=bundle["reference"]
        require(absolute(ref["path"])==store+"/objects/"+ref["sha256"] and ref["path"]not in paths,"SAME_STORE_DISTINCT_CHILD_CAS")
        paths.add(ref["path"])
    argv=[node,"--no-addons","--disallow-code-generation-from-strings","--disable-proto=throw",
        "--unhandled-rejections=strict","--import="+repo+"/"+PRELOAD,repo+"/"+ENTRY,task_root]
    env=dict(X402_NATIVE_CAPACITY_SUPERVISOR_SELECTION="native-capacity-current-offered-supervisor-source-draft-v5",
        X402_NATIVE_CAPACITY_WORKLOAD_SELECTION="native-capacity-current-offered-workload-source-draft-v5",
        X402_NATIVE_CAPACITY_RUN_SCOPE=NATIVE_SCOPE,X402_NATIVE_CAPACITY_RUN_ID=run_id,X402_NATIVE_CAPACITY_LANE_ID="workload.parent",
        X402_NATIVE_CAPACITY_SUPERVISOR_PROFILE_PATH=parent_input["path"],X402_NATIVE_CAPACITY_SUPERVISOR_PROFILE_SHA256=parent_input["sha256"],
        X402_NATIVE_CAPACITY_PLAN_PATH=entry_input["path"],X402_NATIVE_CAPACITY_PLAN_SHA256=entry_input["sha256"])
    return dict(argv=argv,envDelta=env,sourceProfile=profile,timeoutSeconds=expected["nodeTimeoutSeconds"],
        stdoutLimit=expected["nodeStdoutLimit"],stderrLimit=expected["nodeStderrLimit"],
        summary=dict(kind="CURRENT_OFFERED_V5_MANAGED_COMMAND_BINDING_DATA",parentSourceRows=578,childSourceRows=567,
            childProfiles=len(children),parentProfileVersion=8,childProfileVersion=6,offeredCaptureVersion=3,
            resourcePlanVersion=4,wholeEntryBytesBound=True,wholeGenuineCurrentProfileBytesBound=True,
            completeResourceFieldsBound=True,nativeCommandExecuted=False,sourceBytesPhysicallyAuthenticated=False,
            rootsPhysicallyAuthenticated=False,casOriginsAuthenticated=False,managerReceiptOriginsAuthenticated=False,
            nativeAllowanceGranted=False,authority="NONE"))
