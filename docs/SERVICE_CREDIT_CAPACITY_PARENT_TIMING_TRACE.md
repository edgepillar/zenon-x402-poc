# Private parent timing trace and independent DATA recomputation

Status: **49 selected trace controls and 111 current core regressions passed**.
The actual source-owned async core has an explicit
`createServiceCreditCapacityWindowedAsyncWorkloadOwnerCoreWithPrivateTimingTrace`
selection. Its ordinary factory still returns exactly run/stop/inspect; its
recording, host calls and clock-read count matched the new selection in the
selected regression fixture. Neither selection constructs a native application.

## Actual recorder boundary, no extra clock

The [shared core](../src/service-credit-capacity-windowed-async-workload-owner-core.js)
wraps its genuine existing window recorder only for the explicit selection.
It retains the exact already-accepted START/STOP, begin, finish, balance-check
and finalization timestamps. It reads no additional clock, invokes no new host
callback and never substitutes a recorder or an operation implementation.

The private capture is available only after recorder finalization. It is one
cached, frozen array, absent from the ordinary run report. It contains only
local observation ordinals, phase/cohort, outcome, ordered timestamps and balance
match booleans. It contains no grant, request/payment identifier, balance value,
header, witness, key or error payload.

The sample budget remains shared across both cohorts. At most three phases
times two events per sample, plus the shared balance budget and four boundaries,
gives `7 * maxSamplesPerPhase + 4`: at most 28,676 events. No event is evicted
to make a report look complete. This is a logical event bound, not a physical
heap, disk-quota or real native-duration measurement.

A refused recorder call before finalization, pending finish or stopped/UNKNOWN recording makes the
trace ineligible for successful comparison. Forced finalization keeps missing
finishes visible. Late completion cannot replace the cached trace or grant retry.
Post-stop ledger starts use the existing separate drain recorder and are
explicitly not claimed as part of this parent trace.

## Independent arithmetic, separate clocks

The [DATA checker](../src/service-credit-capacity-parent-timing-trace-data.js)
does not import or replay the recorder. It recomputes every complete recording
field from the accepted event declarations: funding, funded-call and explicitly
entered pre-stop ledger latency distributions; nearest-rank p50/p95/p99;
terminal/success distributions; peaks; warmup carry-in; measurement spill-out;
stage balance counts; and the exact successful-window ratio.

The denominator is the explicit parent measurement window, never a sum of
overlapping durations. Equal timestamps retain event order, including finish
before versus after STOP. Full slow latencies are not clipped or removed.
The checker compares the actual frozen report with its independently computed
structure and rejects mismatches, extra fields, incomplete events, invalid
types, getters and Proxies. It traverses the already-owned frozen event array
without making a second array copy. Temporary duration arrays remain bounded;
no physical-heap or sustained-performance guarantee is inferred.

Parent event time is never aligned with or subtracted from a payer/service
child clock. A matching trace/report is consistent declared DATA, not native
authentication, original-operation identity, pure SQL latency or physical drain.

## Exact current validation

The [selected controls](../qualification/service-credit-capacity-parent-timing-trace.behavior.mjs)
exercise the actual new core selection and the genuine recorder. All 49 passed.
The unchanged 111-case core fixture was also executed against the changed
shared source and passed. It was not copied, transformed or relabeled.

The graph-only rebinding of the existing managed validator was separately
verified by all 135 of its selected DATA controls. The
[actual result](../qualification/service-credit-capacity-parent-timing-trace.actual-local-result.json)
pins current sources and complete exit-zero output digests, with no failures
or skips. Historical results retain their original source pins.

No SDK, SQLite, key/signature, nonce search, socket, application timer, native
child, new task root or qualification scratch was entered. Test host callbacks
and counters are explicitly synthetic DATA. Node permissions are not an
OS/network sandbox. The unchanged 27-case hosted profile does not run these
49/111/135 local selections.

## Native integration is not silently enabled

The current native V3 adapter still selects the ordinary core. Its full graph
was rebound to the changed shared file and remains source-only; the new private
trace is not yet in its capture. Before selecting it there, retain the raw trace
privately, bind its exact run/source context, include every new import in the
full graph, and reserve its worst-case frame/storage size. Do not reuse the
old capture ceiling or infer permission from this component result.

Native P2, sustainable load, economic acceptance, provider authority, pilot and
production remain separate and unqualified.
