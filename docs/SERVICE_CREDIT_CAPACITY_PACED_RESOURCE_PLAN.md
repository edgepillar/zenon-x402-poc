# Paced capture resource and entry-plan preparation

Status: implemented with 75 selected passing DATA controls. This is the real
in-memory planner for the future paced managed controller, not that controller
or a native experiment. The unchanged unpaced R4 launcher is NOT rebound,
replaced, executed or granted authority by this selection.

The [planner](../qualification/native_capacity_paced_resource_plan_v1.py)
accepts an explicit paced workload version, complete lane IDs, the actual
adapter/core plan and recorder limits, the public synthetic payee, bounded
pair budgets and the minimum start gap. It imports no application or package,
opens no private root/profile and creates no storage task.

## Complete capture accounting

For the configured maximum samples per phase S, the genuine recorders have:

- Inner parent trace: 7*S + 4 event slots.
- Paced trace: 4*S + 1 event slots.
- Single-copy v2 envelope: 11*S + 5 unique raw event slots.

The inner trace is reserved exactly once. Both genuine check summaries stay in
the envelope. Byte-per-event, wrapper, per-lane writer/attribution and summary
allowances remain conservative policy reservations, NOT measured serialization,
peak heap, APFS allocation or guaranteed native output bounds. Actual overflow
must remain UNKNOWN with retained complete receipts, not a successful truncated
capture, smaller sample count or automatically repeated test.

The proposed policy accounts for full private role profiles, native-file
allowances, independent TLS aliases, receipt overhead and BOTH commands'
stdout/stderr. Stderr follows the reviewed manager rule:
min(policy max_output_bytes, 1 MiB) PER command. The future controller must use
the declared explicit stdout caps as well; this planner does not execute it.

If the rounded requested stdout reservation exceeds the actual entry's 16 MiB
cap, resource planning reports that mismatch and storage-policy construction
refuses it. The workload is not silently rewritten. This conservative admission
can refuse a workload that might fit at runtime; it is not an observed size.

The ten GiB minimum floor remains unchanged. The planner additionally declares
a conservative one GiB margin. Its available-space figure excludes other
stores/tasks: the real controller must observe the mounted identity, free space
and all relevant current reservations before admission, not trust this DATA
figure as a physical observation. Existing store policies are never changed.

Pacing occurs inside the actual fixed measurement window. Increasing the gap
does not add a second per-call pacing wait to the outer timeout. The computed
minimum span for all requested starts is only arithmetic; closed-loop lanes,
source latency, STOP and drain may prevent completion. No offered-rate or
sustainable-throughput conclusion follows.

## Canonical complete entry plan, no profile shortcut

entry_plan() produces the actual entry's complete canonical plan bytes IN MEMORY,
including the independent run ID, ordered lane references, entire workload plan,
recorder limits and pacing configuration. It enforces the real 65,536-byte plan
cap, distinct canonical reference paths and exact digests. It does not replace
full profiles with a digest-only source graph.

Lexically distinct references are NOT evidence of distinct inodes, owned roots,
leases or profile contents. Whole canonical child profiles and root identities
must still be authenticated by the real producer/preloader/controller. The
returned flags explicitly deny that authentication and native authority.

## Selected result and remaining implementation

The [75-control actual result](../qualification/native-capacity-paced-resource-plan-v1.actual-local-result.json)
records one successful isolated Python command, no failures/errors/skips and
zero stderr. Eighteen existing R4 control inputs and six paced runtime files
remained unchanged. Runtime observations are not performance benchmarks.

No manager, SDK, SQL, clock/timer, key, signature, nonce, socket, child, profile
write or qualification scratch entered this DATA selection. No new actual
native allowance is implied. The 27-control hosted profile is unchanged and
does not select these 75 controls.

The real task-owned controller/writer, exact source/tool/root admission, owned
command receipts and independent native v2 capture verification are still
required. Historical unpaced inputs and results remain separate and unchanged.
