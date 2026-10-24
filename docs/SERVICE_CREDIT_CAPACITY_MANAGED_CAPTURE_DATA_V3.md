# Managed capacity V3 capture DATA

The original result linked below is historical at
[1753877](https://github.com/edgepillar/zenon-x402-poc/tree/1753877381b0a81fa6394c5b7cda9b9b465e792b).
The validator's new source-seal binding was separately rerun through all 135
controls; see the [current component result](../qualification/service-credit-capacity-parent-timing-trace.actual-local-result.json).
Neither result is a native run or a renewal of an earlier allowance.

Status: **135 selected DATA controls passed**. This
[pure module](../qualification/native_capacity_managed_workload_v3.py)
plans finite resource ceilings and checks declared capture/receipt DATA.
It imports no manager, SDK, SQL, clock, process or native namespace.

## Independent recomputation

The checker requires an expected run ID supplied independently by the real
manager task, matching lane and full-source context. It checks complete
parent/child streams, original completion counters, OPEN/STOP acknowledgements,
pending markers, fresh balances and immutable UNKNOWN/close states.

Private writer attribution is matched to each whole writer interval. The
original command digest is recomputed from run/lane/cohort/ordinal rather than
inferred from a successful writer row. CONTROL/WARMUP/MEASUREMENT prefixes,
no reopening after CONTROL, and independently completed originals are checked.

Every window class, changed/sample count, complete percentile distribution and
whole-run bracket distribution is recomputed from the correlated private rows.
Equal-nanosecond contacts remain separate. The real window owner's clock-read
counter must fit the conservative before/through-STOP event range; no ordering
is invented for equal timestamps. Transactions are not clipped. Parent and
service-child clocks are never subtracted or aligned.

The capture needs one exact complete JSON frame with a newline, no duplicate
keys, floats, nonfinite values or unknown fields in the checked evidence.
The decoded JSON tree is validated in place instead of constructing a second
full object graph. Original bytes and a canonical framing comparison remain;
this is not zero-copy parsing or a measured physical-heap guarantee.

## Finite planning, not permission

The selected two-lane DATA plan reserves one parent/four children, four window
marker messages, at most 248 private writer/attribution rows, a 768 KiB stdout
ceiling and a 71 MiB task quota. None of those bytes were allocated by these
tests. The production floor stays 10 GiB plus the operation and other declared
reservations.

Plans whose worst-case full capture exceeds the real entry cap remain visibly
oversized. The launcher must refuse native entry; it cannot silently shorten
the requested workload. No automatic native retry, source/package copy,
child-file adoption or historical cleanup is authorized.

Even a declared CLOSED/SUCCESS task and owned cleanup receipt cannot upgrade a
storage HOLD or establish native resource release. All checker returns retain
native/production/cleanup qualification false and authority NONE.

## What ran and what did not

The [selected tests](../qualification/native_capacity_managed_workload_v3.behavior.py)
load only the actual pure module. All 135 passed in one isolated Python command,
with exit zero, complete captured output, no stderr, failures, errors or skips.
The [actual result](../qualification/native_capacity_managed_workload_v3.actual-local-result.json)
pins both source files and output digests. Capture, stream, root and receipt
examples are explicitly synthetic in-memory DATA, not a substitute native run.

No SDK, SQLite, key/signature, nonce, socket, native child, manager import,
task-store root or qualification scratch was entered. No workflow, package
script or default payment behavior changes. The unchanged 27-case hosted
profile does not execute these 135 controls.

The separate source-bound V3 launcher still needs a new exact native scope and
fresh approved storage admission. Source acceptance and DATA tests do not
renew the old V2 proposal or qualify a native window, pure SQL latency,
sustainable throughput, economics, live pilot or production.

