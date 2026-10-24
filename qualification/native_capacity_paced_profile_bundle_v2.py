"""Complete parent V2 / outer V3 profile, resource and entry assembly.

Only bounded DATA and canonical private BYTES IN MEMORY are produced.
The caller must supply the genuine source-verified profile/resource producers;
the managed launcher pins those controls before entry. This is not a native
namespace, manager/SDK substitute, root observation, alias or execution grant.
"""
import hashlib
import re

HASH = re.compile(r"[0-9a-f]{64}")
TASK_ID = re.compile(r"[0-9a-f]{32}")
PROFILE_CAP = 524288
PARENT_SOURCE = "38bb4557357dd42bcd7dedacb4b7ec2fc750d474e7f9c14045376b73b0739160"
SOURCE_SELECTION = "b7fd574d4959738215f61e3a96c7d2de62eeda833b1484696a6a299bcb6c966b"
PRODUCER_SOURCE = "20888e7480166916343a49715ec8bf30bc789036719ad0a36c8206a110de8850"
CHILD_SOURCE = "d756740994aeb53ebeee47320d732583d96381dfa8c00e18a30f414e70a77027"
REFERENCE_FIELDS = {"role", "laneId", "path", "sha256", "entryURL", "preloaderURL", "rootPath", "rootIdentity"}


def require(value, code):
    if not value:
        raise ValueError(code)


def absolute(value):
    require(type(value) is str and 1 < len(value) <= 4096 and value.startswith("/")
        and all(32 <= ord(c) <= 126 for c in value)
        and all(part not in ("", ".", "..") for part in value[1:].split("/")), "CANONICAL_PRIVATE_REFERENCE_PATH")
    return value


def root_data(value):
    require(type(value) is dict and set(value) == {"path", "identity"}, "EXACT_DECLARED_ROOT")
    path = absolute(value["path"]); ident = value["identity"]
    require(type(ident) is list and len(ident) == 5
        and all(type(v) is str and re.fullmatch(r"0|[1-9][0-9]{0,19}", v) for v in ident)
        and int(ident[0]) > 0 and int(ident[1]) > 0 and int(ident[4]) == 16832, "DECLARED_PRIVATE_DIRECTORY_IDENTITY")
    return dict(path=path, identity=list(ident))


def store_from_scratch(root):
    """Lexical schema binding only, never physical store ownership."""
    parts = absolute(root).rsplit("/", 3)
    require(len(parts) == 4 and parts[0] and parts[1] == "tasks"
        and TASK_ID.fullmatch(parts[2]) and parts[3] == "scratch", "OWNED_TASK_SCRATCH_SCHEMA")
    return absolute(parts[0])


def reference_data(value):
    require(type(value) is dict and set(value) == REFERENCE_FIELDS, "EXACT_COMPLETE_CHILD_REFERENCE")
    require(all(type(value[k]) is str and 0 < len(value[k]) <= 4096 and all(32 <= ord(c) <= 126 for c in value[k])
        for k in REFERENCE_FIELDS - {"rootIdentity"}), "BOUNDED_REFERENCE_STRINGS")
    out = dict(value); out["rootIdentity"] = root_data(dict(path=value["rootPath"], identity=value["rootIdentity"]))["identity"]
    absolute(out["path"])
    require(HASH.fullmatch(out["sha256"]), "CHILD_CAS_DIGEST")
    return out


def assemble(planner, resource, workload, run_id, parent_root, children):
    """Bind actual complete profile bytes and the corresponding entry plan.

    No full registry/tree copy, file open, child-profile JSON decoding or second
    parent serialization is added here. The genuine planner compares each entire
    child to its exact canonical expected bytes. Only small references detach.
    Physical identities remain declarations even with an installed-source context.
    """
    value = resource.capture_plan(workload)
    # The managed caller must still authenticate these genuine Python controls.
    # Shape/context checks here bind artifacts, not an arbitrary producer object.
    context = planner.info()
    require(type(context) is dict and context.get("parentApplicationFiles") == 146
        and context.get("parentPackageFiles") == context.get("childPackageFiles") == 404
        and context.get("childApplicationFiles") == 139
        and context.get("parentSourceRowsSha256") == PARENT_SOURCE
        and context.get("childSourceRowsSha256") == CHILD_SOURCE
        and context.get("sourceFilesReadOnlyVerified") is True and context.get("sourceFilesRead") == 550
        and context.get("privateProfileIsNativeAuthority") is False and context.get("authority") == "NONE",
        "ACTUAL_COMPLETE_NEW_PARENT_SOURCE_CONTEXT")
    proposed = resource.resource_plan(value)
    require(proposed.get("resourcePlanVersion") == 2 and proposed.get("pacedCaptureVersion") == 3
        and proposed.get("parentProfileVersion") == 2
        and proposed.get("parentSourceRowsSha256") == PARENT_SOURCE
        and proposed.get("childSourceRowsSha256") == CHILD_SOURCE
        and proposed.get("sourceSelectionSha256") == SOURCE_SELECTION
        and proposed.get("parentProfileProducerSha256") == PRODUCER_SOURCE
        and proposed.get("effectsExecuted") is False and proposed.get("nativeAllowanceGranted") is False
        and proposed.get("authority") == "NONE", "NEW_RESOURCE_SELECTION_CONTEXT")
    require(proposed.get("captureReservationFitsEntryCap") is True,
        "COMPLETE_CAPTURE_RESERVATION_REQUIRED_NO_REDUCTION")
    require(type(run_id) is str and HASH.fullmatch(run_id), "EXACT_ASSEMBLY_RUN_ID")
    parent = root_data(parent_root); store = store_from_scratch(parent["path"])
    require(type(children) is list and len(children) == 2 * len(value["laneIds"]), "EXACT_PLANNED_LANE_ROLE_COUNT")
    bundles, lanes, raw_bytes = [], [], 0
    for ordinal, lane_id in enumerate(value["laneIds"], 1):
        lane = dict(laneId=lane_id)
        for offset, role in enumerate(("PAYER", "SERVICE")):
            bundle = children[2 * (ordinal - 1) + offset]
            require(type(bundle) is dict and set(bundle) == {"reference", "profileBytes"}, "EXACT_CHILD_PROFILE_BUNDLE")
            ref = reference_data(bundle["reference"]); raw = bundle["profileBytes"]
            require(ref["role"] == role and ref["laneId"] == lane_id, "ORDERED_PLANNED_LANE_ROLE_BINDING")
            require(ref["rootPath"] == parent["path"] + "/lanes/" + format(ordinal, "02d") + "/" + role.lower(),
                "EXACT_TASK_OWNED_ROLE_ROOT_PATH")
            require(ref["path"] == store + "/objects/" + ref["sha256"], "SAME_STORE_CONTENT_ADDRESSED_PROFILE_PATH")
            require(type(raw) is bytes and 0 < len(raw) <= PROFILE_CAP
                and hashlib.sha256(raw).hexdigest() == ref["sha256"], "WHOLE_CHILD_PROFILE_BYTES_DIGEST")
            bundles.append(dict(reference=ref, profileBytes=raw)); raw_bytes += len(raw)
            lane[role.lower() + "Profile"] = dict(path=ref["path"], sha256=ref["sha256"])
        lanes.append(lane)
    # This actual producer checks full canonical children, all source records,
    # private contexts, role URLs and declared root/reference alias independence.
    supervisor = planner.plan_parent(dict(runId=run_id, laneId="workload.parent"), parent, bundles)
    require(type(supervisor) is dict and type(supervisor.get("profileBytes")) is bytes
        and 0 < len(supervisor["profileBytes"]) <= PROFILE_CAP
        and supervisor.get("profileSha256") == hashlib.sha256(supervisor["profileBytes"]).hexdigest()
        and supervisor.get("nativeExecuted") is False and supervisor.get("privateProfileIsNativeAuthority") is False
        and supervisor.get("authority") == "NONE", "ACTUAL_PARENT_PROFILE_RESULT")
    entry = resource.entry_plan(value, run_id, lanes)
    require(entry["nativeExecuted"] is False and entry["authority"] == "NONE", "ENTRY_DATA_NOT_NATIVE")
    complete_bytes = raw_bytes + len(supervisor["profileBytes"])
    require(complete_bytes <= proposed["privateProfileBytesReserved"]
        and entry["planBytesCount"] <= proposed["entryPlanBytesReserved"], "COMPLETE_ARTIFACTS_FIT_RESERVATIONS")
    # Do not publish raw profiles, source URLs, roots, identities or run context.
    summary = dict(kind="PACED_COMPLETE_PROFILE_RESOURCE_ENTRY_BINDING_DATA_V2",
        resourcePlanVersion=2, pacedCaptureVersion=3, parentProfileVersion=2,
        lanes=len(lanes), childProfiles=len(bundles), parentProfiles=1,
        childSourceRows=543, parentSourceRows=550,
        childSourceRowsSha256=CHILD_SOURCE, parentSourceRowsSha256=PARENT_SOURCE,
        completePrivateProfileBytes=complete_bytes, entryPlanBytes=entry["planBytesCount"],
        completePrivateProfilesFitReservedBytes=True, completeEntryFitsReservedBytes=True,
        resourceSelectionAndWorkloadBound=True,
        completeCanonicalChildBytesCompared=True, exactPlannedLaneRolesBound=True,
        sameDeclaredStoreCasPathsBound=True, physicalRootsAuthenticated=False, physicalAliasesCreated=False,
        profilesWritten=False, nativeExecuted=False, nativeAllowanceGranted=False, authority="NONE")
    return dict(parentProfile=supervisor, entryPlan=entry, resourcePlan=proposed, summary=summary)
