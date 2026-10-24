# Managed native capacity V3 source, revision 2

Historical revision at
[1aa075a](https://github.com/edgepillar/zenon-x402-poc/tree/1aa075ae8e4d848abd2b6b2e565ec138ee9cea6b).
Its result is byte-preserved. See the
[revision 3 source rebinding](NATIVE_CAPACITY_MANAGED_WORKLOAD_V3_R3_SOURCE.md)
for the changed shared core and fresh current-source DATA checks.

Status: complete managed control source authored; **no native execution**.
The source-only graph remains the complete 138-application/404-package graph,
preserving the exact 117/404 baseline. A fresh finite native allowance is
required; the still-unanswered V2 proposal and all consumed P2 scopes remain
separate and unchanged.

## Real evidence seam, not a weaker checker

The first V3 graph retained raw timestamp intervals but not enough correlated
private attribution to independently recompute cohort/window percentiles.
This revision updates the real
[adapter](../qualification/capacity-native-workload-adapter-v3.draft.mjs) and
[parent entry](../qualification/capacity-native-workload-v3.entry.draft.mjs)
to retain private per-row cohort/original ordinal/window class and actual
original-command digest alongside the genuine timestamp interval.

That digest stays in private evidence, never the public component report.
No header, witness, key or raw operation name is added. The
[DATA checker](../qualification/native_capacity_managed_workload_v3.py)
independently binds the fresh manager run/lane/source, reconstructs each
original-command digest and recomputes every group and percentile.
It checks conservative source-clock read counts without merging parent and
service-child time. UNKNOWN, partial streams, missing rows or storage HOLD
cannot be repaired into success.

The original first-source
[result](../qualification/capacity-native-full-graph-v3.source-only-result.json)
is byte-preserved and historical at
[25c62dc](https://github.com/edgepillar/zenon-x402-poc/tree/25c62dc7fc511f9ebed3b33a92908f8ed8d42c4f).
It does not qualify this changed graph. V2 sources and failed native evidence
were not rewritten.

## Actual managed source path

The [launcher](../qualification/run-capacity-native-workload-v3.local.py)
defaults to source-only reads. Its
[launch manifest](../qualification/capacity-native-workload-v3.launch-inputs.json)
pins all five real Python controls, the full
[inventory](../qualification/capacity-native-full-graph-v3.inputs.json),
the frozen baseline and the finite
[workload](../qualification/capacity-native-workload-v3.plan.json).
The role builder and genuine preloaders share the new complete source seal.

The source-only mode imports no manager, opens no private storage root, writes
no profile and executes no Node/OpenSSL/SDK/SQL work. It can read the existing
542 inputs in place and hash the existing Node once for all roles, with no
source/package copies.

Native mode additionally needs a NEW exact operator scope, matching launch and
plan digests, a newly initialized private store, verified mount/store identity,
the unchanged trusted manager, 10 GiB floor plus all reservations, and complete
source/runtime identities immediately before each owned command. Source tokens
are cooperative tripwires, not human permission or an OS/network sandbox.
The launcher never initializes/adopts a root or silently falls back elsewhere.

If separately approved later, one TLS command and one real parent/four owned
children implement the exact source path. Complete private streams are retained
before interpretation. No native retry, replacement payment, re-sign, unknown
child-file adoption or historical cleanup occurs. Task closure and storage
cleanup stay separate; unknown child-created SQLite/pin files may remain HOLD.

## Honest bounds and actual local validation

Private attribution is quota-accounted: up to 248 rows for the selected plan,
four marker messages, at most five pending IPC tickets per child, a conservative
784,384-byte logical frame bound, 786,432-byte stdout cap and 71 MiB task quota.
The entry still has its real 16 MiB cap. An oversized bound refuses native
entry rather than silently shrinking work. These are reservations, not measured
allocations, disk enforcement or a heap guarantee.

The [current source-only result](../qualification/capacity-native-workload-v3.source-only-result.json)
records:

- 135 new pure DATA controls, with original binding and percentile recomputation;
- 17 current inert adapter/clock-owner controls;
- 87 current role-profile DATA controls;
- two changed JavaScript sources parsed and five Python sources compiled;
- the actual managed source-only CLI verifying all 542 inputs in place.

All selected controls passed without skips. Changed sources were requalified;
the unchanged earlier 54-case window math and 111-case core results were not
rerun merely for metadata. No native command, task root/scratch, SDK, SQLite,
key, signature, nonce, socket, native child, cleanup or automation ran.

The 27-case hosted profile remains unchanged and separate. Native protocol,
physical resource drain, real pressure/throughput, P2 lost-ACK/socket recovery,
economic acceptance, pilot and production remain unqualified.

