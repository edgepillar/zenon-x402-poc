# Managed full native capacity V2 source

Status: the complete managed control source is authored and its selected DATA
checks pass. The native control branch has NOT run. This is not P4 completion.

This follows the [full V2 role preparation](NATIVE_CAPACITY_FULL_GRAPH_V2_SOURCE.md)
without editing its historical record or shrinking the application. All 135
application inputs and 404 package inputs remain pinned in place. The actual
payer/service/SDK/x402/V6-SQLite/local-HTTPS graph, role preloaders, parent entry
and asynchronous balance barriers are unchanged.

## New control source

The [launch manifest](../qualification/capacity-native-workload-v2.launch-inputs.json)
pins five Python controls, the full graph inventory, baseline and an explicit
[workload plan](../qualification/capacity-native-workload-v2.plan.json).
The standalone launcher is source-only by default. Only explicit pre-native or
execute modes may inspect private storage; no default path initializes a store.

The real managed execution path is authored, not simulated: it requires a newly
initialized private owned store and exact metadata identity, the approved
unchanged manager, real runtime/binary pins, mounted-volume identity and the
10 GiB floor plus new and existing reservations. It retains exact manager stream
receipts, uses one test-TLS command, independent APFS TLS aliases, genuine role
profiles, one real Node parent and two hardwired Node children per lane.
There is no injected process/clock/SDK/SQL factory or fake namespace getter.

The DATA planner matches the actual adapter/core admission, including recording
capacity. It supports the real one-to-sixteen-lane and bounded call ranges.
The checked-in two-lane example is an initial component selection, NOT the
definition of sustainable capacity. Its ceilings are prospective, not permission:

| Resource | Example maximum/reservation |
| --- | ---: |
| Runs | 1 |
| Test-TLS OpenSSL commands / Node parent commands | 1 / 1 |
| Native Node children | 4 |
| Warmup / measured original calls | 2 / 8 |
| Local loopback TCP connection starts | 362 |
| New SQLite paths / independent pin files | 8 / 4 |
| In-memory synthetic Ed25519 keys | 6 |
| Transaction / capability / provider signatures | 2 / 10 / 2 |
| Nonce candidates per window | 4096 |
| Total nonce candidate reservation | 131072 |
| Task quota / expected peak reservation | 71 MiB |
| Node command / test-TLS timeout | 72 s / 20 s |

The nonce reservation includes each lane's bounded reference search, producer
and validators; it is not an instruction to perform an unbounded search.
The task reservation is not an allocation or measured disk usage. Sampled
manager quotas and source checks are not an OS/network sandbox. Source/package
trees are never copied; the registry is shared across private role plans.
Large plans retain the real entry capture cap; overflow stays UNKNOWN rather
than silently shrinking, discarding evidence or rerunning a workload.

## Honest evidence and storage closure

The capture checker binds the complete stdout/stderr digests to an owned
manager receipt. It checks independent lane identities, returned closes, actual
process exit/IPC/EOF declarations, all three fresh balance barriers, ordered
service-child writer brackets and payer-child operation timing records. Child
clock domains are never cross-subtracted. Raw failure and UNKNOWN bytes must be
retained before interpretation. DATA checks do not authenticate native events,
derive pure SQL latency, or qualify throughput.

SQLite and original-pin files are created by the actual application and use
exclusive creation. They are not precreated by the manager or adopted after
the fact. The unchanged manager therefore may preserve them in storage HOLD,
even if the application processes returned successfully. The launcher reports
these conditions separately and returns a non-success status for HOLD. It
never upgrades HOLD, rewrites failed receipts, reopens SQL to manufacture
success, retries a command/payment or cleans historical roots.

## Actual checks, not a native allowance

The [source-bound result](../qualification/capacity-native-workload-v2.source-only-result.json)
records 86 passing DATA tests, zero failures/errors/skips, and one actual
source-only invocation of the real launcher. The latter read the 539 existing
inputs in place and hashed the selected Node binary without executing it.
No manager import, private-root admission, root creation, APFS clone, OpenSSL,
SDK/SQL execution, key/signature, nonce search, socket or native Node child ran.

A fresh exact finite native approval and private store provisioning are still
required before execute mode. The current manifest grants NONE. The old P2,
DP, clean, HTTPS and other allowances are not renewed. Default runtime,
main/CI, unrelated branches/PRs and historical evidence are unchanged.

The immediate next gate is the real bounded two-lane component attempt after
source, dependency, launcher, manager, volume, capacity and ownership checks.
P2 lost-ack/HELD-store qualification, isolated measurement-phase SQL attribution,
P3 economic acceptance and P4 sustainable throughput remain separate work.
No native-resource, chain, live-payment, deployment or production claim follows.
