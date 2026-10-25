# Paced timer-parent V3 resource and entry DATA plan

Status: **90/90 actual local DATA controls passed** on 2026-10-25.
This standalone planner imports no application, SDK or storage manager. It
constructs proposed resource policy and entry-plan bytes in memory only.

## Distinct context and complete reservation

The resource plan is V3, for parent profile V3, outer capture V4 and timer envelope
V1. The workload input remains format V1. Parent declarations bind 147 application
and 404 package rows; original children remain 139/404. Source selection
`90eba86d5f14f4226867815667213dc4ac3799e146d65b74eb75441c047a1236`
and producer
`6d67d698b9c76088852426be0c1b8d11f90e067c7e850fde227f906a618727de`
are explicit future-composition pins, not proof that the separate development
native graph is present or executable on main.

Timer raw events reserve the actual hard ceiling
`4 * maxSamplesPerPhase + 1`, not the smaller clean-timer-only estimate.
EARLY_FIRE/REFUSED and safe UNKNOWN diagnostic retention are included.
Each timer event reserves 256 bytes, with 8,192 bytes for its trace wrapper,
4,096 for check overhead and 2,048 for envelope overhead. Each raw parent,
paced, timer and balance trace occurs once; the original parent trace is not
duplicated under a second old envelope.

The full stdout reservation also retains balance raw/scalar/check/lane fields,
complete child streams and writer evidence. Both Node and OpenSSL stdout/stderr,
all complete profiles, the 65,536-byte entry plan, native files, TLS aliases,
receipts and separate metadata quota remain accounted for.

## Unreduced default proposal

The same two lanes request one warmup and four measured calls each.

| Quantity | Proposed bound |
| --- | ---: |
| Core / paced / timer / balance events | 900 / 513 / 513 / 12 |
| Unique raw timing events | 1,938 |
| Timer outer-capture bytes | 145,664 |
| Full capture reservation | 1,323,520 bytes |
| Rounded Node stdout cap | 1,376,256 bytes |
| Rounded task quota / separate metadata quota | 71 MiB / 4 MiB |
| Node timeout | 72 seconds |

Node stdout grows by 196,608 bytes relative to the previous balance-only proposal.
The rounded task quota happens to stay 71 MiB; this does not renew or transfer any
old native allowance. Requested calls, signatures, files, connections, nonce
candidate ceilings and timeout are unchanged, and none of those effects ran.

The 16 MiB entry cap is preserved. An oversized proposal returns a non-ready
resource summary and refuses storage policy; it does not silently truncate,
reduce samples, extend the window or retry. The 10 GiB floor, 1 GiB safety margin,
expected allocations and separate metadata reservation are retained. All other
tasks' reservations and actual available capacity must still be admitted by the
future controller. `managedStoragePolicyReady` means only that this arithmetic
fits the entry cap; `actualStorageAdmissionQualified` remains false.

## Actual local evidence and limits

The isolated Python 3.12.14 command exited 0 with 90 passes, no failures/errors/skips
and empty stderr. Tests cover strict workload/refusal grammar, complete entry
bytes, one-to-sixteen-lane arithmetic, maximum-width timer row kinds, overflow,
full command streams and unchanged effect budgets. Maximum-width row DATA is not
a native trajectory; no second full 16,385-row payload was needed for that bound.

The four selected Python sources and 47 protected inputs were stable. No root,
profile, scratch or storage task was created. No installed package, native
application, SDK, SQLite, key, signature, nonce work, socket or application child
was entered. No physical storage admission, timer liveness, sustainable capacity,
heap bound, OS quota or production result is claimed.

See the [planner](../qualification/native_capacity_paced_timer_resource_plan_v3.py),
[controls](../qualification/native_capacity_paced_timer_resource_plan_v3.behavior.py)
and [normalized result](../qualification/native-capacity-paced-timer-resource-plan-v3.actual-local-result.json).
These Python controls are local evidence, not additions to the separate unchanged
27-case hosted DATA/component CI profile.

The timer-specific Python verifier, complete outer-V4 verifier, managed launcher,
physical root/full-reservation admission and fresh finite native scope remain
open. This plan is safe to review as standalone DATA tooling; it does not activate
the separate development graph or change the default payment path.
