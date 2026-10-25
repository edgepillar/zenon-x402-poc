"""Timer-parent V3 / outer-V4 complete in-memory profile/entry assembly.

The caller supplies the genuine source-pinned producer and resource control.
Declared registry DATA and an installed-source context are kept distinct.
No source tree, private root, profile file, manager or native process is created.
This module is not a namespace substitute, physical observation or permission.
"""
import hashlib
import re

HASH = re.compile(r"[0-9a-f]{64}")
TASK_ID = re.compile(r"[0-9a-f]{32}")
PROFILE_CAP = 524288
PARENT_SOURCE = "0e0533ba2e3bfdf97b2670a0ee693c64ddc04ea93bf52b4e779d9d073cb51c90"
SOURCE_SELECTION = "90eba86d5f14f4226867815667213dc4ac3799e146d65b74eb75441c047a1236"
PRODUCER_SOURCE = "6d67d698b9c76088852426be0c1b8d11f90e067c7e850fde227f906a618727de"
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
    """Bind a lexical task schema only, never ownership of an actual store."""
    parts = absolute(root).rsplit("/", 3)
    require(len(parts) == 4 and parts[0] and parts[1] == "tasks"
        and TASK_ID.fullmatch(parts[2]) and parts[3] == "scratch", "OWNED_TASK_SCRATCH_SCHEMA")
    return absolute(parts[0])


def reference_data(value):
    require(type(value) is dict and set(value) == REFERENCE_FIELDS, "EXACT_COMPLETE_CHILD_REFERENCE")
    require(all(type(value[k]) is str and 0 < len(value[k]) <= 4096
        and all(32 <= ord(c) <= 126 for c in value[k]) for k in REFERENCE_FIELDS - {"rootIdentity"}),
        "BOUNDED_REFERENCE_STRINGS")
    out = dict(value)
    out["rootIdentity"] = root_data(dict(path=value["rootPath"], identity=value["rootIdentity"]))["identity"]
    absolute(out["path"])
    require(HASH.fullmatch(out["sha256"]), "CHILD_CAS_DIGEST")
    return out


def assemble(planner, resource, workload, run_id, parent_root, children):
    """Compose whole canonical bytes; do not serialize/copy a source registry.

    Planner provenance is the source admission caller's responsibility, not
    inferred from the object's shape. The genuine producer compares entire
    children to its canonical fragments; no child JSON decode/normalization,
    whole expected child allocation or extra parent serialization occurs here.
    """
    value = resource.capture_plan(workload)
    context = planner.info()
    require(type(context) is dict and type(context.get("parentApplicationFiles")) is int
        and context["parentApplicationFiles"] == 147
        and type(context.get("childApplicationFiles")) is int and context["childApplicationFiles"] == 139
        and type(context.get("parentPackageFiles")) is int and type(context.get("childPackageFiles")) is int
        and context["parentPackageFiles"] == context["childPackageFiles"] == 404
        and context.get("parentSourceRowsSha256") == PARENT_SOURCE
        and context.get("childSourceRowsSha256") == CHILD_SOURCE
        and type(context.get("sourceFilesReadOnlyVerified")) is bool
        and type(context.get("sourceFilesRead")) is int
        and context["sourceFilesRead"] == (551 if context["sourceFilesReadOnlyVerified"] else 0)
        and context.get("nativeExecuted") is False
        and context.get("privateProfileIsNativeAuthority") is False and context.get("authority") == "NONE",
        "COMPLETE_TIMER_PARENT_SOURCE_CONTEXT")
    proposed = resource.resource_plan(value)
    require(type(proposed.get("resourcePlanVersion")) is int and proposed["resourcePlanVersion"] == 3
        and type(proposed.get("pacedCaptureVersion")) is int and proposed["pacedCaptureVersion"] == 4
        and type(proposed.get("pacedTimerCaptureVersion")) is int and proposed["pacedTimerCaptureVersion"] == 1
        and type(proposed.get("parentProfileVersion")) is int and proposed["parentProfileVersion"] == 3
        and proposed.get("parentSourceRowsSha256") == PARENT_SOURCE
        and proposed.get("childSourceRowsSha256") == CHILD_SOURCE
        and proposed.get("sourceSelectionSha256") == SOURCE_SELECTION
        and proposed.get("parentProfileProducerSha256") == PRODUCER_SOURCE
        and proposed.get("effectsExecuted") is False and proposed.get("nativeAllowanceGranted") is False
        and proposed.get("authority") == "NONE", "TIMER_RESOURCE_SELECTION_CONTEXT")
    require(proposed.get("captureReservationFitsEntryCap") is True, "COMPLETE_CAPTURE_RESERVATION_NO_REDUCTION")
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
    parent_profile = planner.plan_parent(dict(runId=run_id, laneId="workload.parent"), parent, bundles)
    require(type(parent_profile) is dict and type(parent_profile.get("profileBytes")) is bytes
        and 0 < len(parent_profile["profileBytes"]) <= PROFILE_CAP
        and parent_profile.get("profileSha256") == hashlib.sha256(parent_profile["profileBytes"]).hexdigest()
        and parent_profile.get("nativeExecuted") is False
        and parent_profile.get("privateProfileIsNativeAuthority") is False
        and parent_profile.get("authority") == "NONE", "COMPLETE_TIMER_PARENT_PROFILE_RESULT")
    entry = resource.entry_plan(value, run_id, lanes)
    require(entry["nativeExecuted"] is False and entry["authority"] == "NONE", "ENTRY_DATA_NOT_NATIVE")
    complete_bytes = raw_bytes + len(parent_profile["profileBytes"])
    require(complete_bytes <= proposed["privateProfileBytesReserved"]
        and entry["planBytesCount"] <= proposed["entryPlanBytesReserved"], "COMPLETE_ARTIFACTS_FIT_RESERVATIONS")
    summary = dict(kind="PACED_TIMER_COMPLETE_PROFILE_RESOURCE_ENTRY_BINDING_DATA_V3",
        resourcePlanVersion=3, pacedCaptureVersion=4, pacedTimerCaptureVersion=1, parentProfileVersion=3,
        lanes=len(lanes), childProfiles=len(bundles), parentProfiles=1, childSourceRows=543, parentSourceRows=551,
        childSourceRowsSha256=CHILD_SOURCE, parentSourceRowsSha256=PARENT_SOURCE,
        completePrivateProfileBytes=complete_bytes, entryPlanBytes=entry["planBytesCount"],
        completePrivateProfilesFitReservedBytes=True, completeEntryFitsReservedBytes=True,
        completeCanonicalChildBytesCompared=True, exactPlannedLaneRolesBound=True,
        sameDeclaredStoreCasPathsBound=True, resourceSelectionAndWorkloadBound=True,
        sourceFilesReadOnlyVerified=context["sourceFilesReadOnlyVerified"],
        registryFactsAreDeclaredData=not context["sourceFilesReadOnlyVerified"],
        physicalRootsAuthenticated=False, physicalAliasesCreated=False, profilesWritten=False,
        nativeExecuted=False, nativeAllowanceGranted=False, authority="NONE")
    return dict(parentProfile=parent_profile, entryPlan=entry, resourcePlan=proposed, summary=summary)
