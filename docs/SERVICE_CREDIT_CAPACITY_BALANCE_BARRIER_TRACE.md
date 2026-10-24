# Bounded parent balance-barrier trace DATA

Status: the genuine recorder and checker passed 64 selected local Node DATA
controls with zero failures/skips/cancellations/TODOs/stderr. No SDK, SQLite,
signature, nonce search, socket, clock read, native child or managed scratch ran.
This is an independent DATA component, not execution of the paced native graph.

## Three whole parent barriers, not SQL latency

The [implementation](../src/service-credit-capacity-balance-barrier-trace-data.js)
records AFTER_FUNDING, AFTER_WARMUP and AFTER_DRAIN for each of 1-16 source lanes.
The operator supplies existing parent monotonic BEGIN/END observations and an
outcome; the recorder never reads a clock or invokes a callback/resource.

This is the WHOLE balance-observation barrier. In the native source adapter,
the final bracket also contains writer-trace paging and validation. Calling it
pure balance-RPC, child SQL, L1 inclusion latency or sustainable throughput would
be incorrect. Parent and child clock domains are never aligned or subtracted.

The context contains caller-declared run/source tags and ordered lane IDs.
A consumer must independently capture its expected context. Equal tags, private
data shapes and monotonic arithmetic do not authenticate native clocks/events.

## Bounded source API and uncertainty

`createServiceCreditCapacityBalanceBarrierTrace(configuration)` returns frozen
`begin`, `finalize` and `captureEvidence` capabilities. A begin returns one
frozen terminal handle. Each lane has exactly three ordered barriers and at most
one pending observation; different source lanes can overlap. All observations use
one declared parent clock with nondecreasing event observations.

At most 48 observations and 96 raw private events can exist. A fourth barrier,
duplicate finish, backward/invalid time, missing terminal, rejection or UNKNOWN
cannot be evicted, retried or converted into a clean recording. Already-entered
handles can finish before finalization, but cannot repair a sticky issue.
Finalize caches a frozen summary/evidence snapshot; late input cannot rewrite it.
Recorder closure does not cancel or drain real operations.

Successful COMPLETE means complete declared recorder input only. The public
summary contains counts and nearest-rank duration metrics, not run IDs, raw
timestamps, lane IDs, headers or operation data. Raw BEGIN/END rows remain in a
separate frozen private capsule. Temporary duration arrays are released after
finalization; no measured peak-memory bound is claimed.

## Actual raw-series validation

`validateServiceCreditCapacityBalanceBarrierTraceData(configuration)` consumes
the whole private capsule, report and separately captured expected context.
It walks raw BEGIN/END rows without replaying a recorder or source operation,
checks per-lane ordering and complete successful denominators, and recomputes
each barrier's samples/min/p50/p95/p99/max. A scalar historical percentile alone
cannot become a raw-series proof. Exact DATA admission rejects proxies/getters
without invoking hooks, sparse arrays, extra fields, noncanonical timestamps,
negative zero counts, mismatched contexts and authority claims.

The [64 selected tests](../qualification/service-credit-capacity-balance-barrier-trace-data.behavior.mjs)
include overlapping lanes, all 16 lanes/48 observations, zero and uint128-limit
durations, parent-clock offset invariance, hand-checked nearest ranks, missing
and duplicate input, sticky uncertainty, malformed evidence and zero user hooks.
They execute the actual component with declared times/outcomes, not a native
transport/store/SDK substitute.

The [actual result](../qualification/service-credit-capacity-balance-barrier-trace-data.actual-local-result.json)
pins all three inputs and one bounded command. The roughly 0.10-second duration
is a local test observation, not RTT, native memory usage or a capacity benchmark.

## Publication and remaining integration

This component is an independent small source/DATA batch. It changes no
existing runtime file, default script, workflow, package contract, old source
graph or finite native approval. The hosted profile remains the existing 27
controls; these new 64 controls were local, not silently added to CI.

The existing v1 paced native adapter does NOT emit this new capsule, and the
[existing outer validator](SERVICE_CREDIT_CAPACITY_PACED_OUTER_CAPTURE_DATA.md)
does not gain raw balance-series evidence merely because this component exists.
Actual instrumentation, source pinning, native admission/receipts and measurement
remain separate required work.

A separate [v2 source integration](SERVICE_CREDIT_CAPACITY_PACED_BALANCE_BINDING_V2.md)
now wires the genuine component into the actual versioned adapter's existing
clock brackets and an outer v3 capture. Its 53 constructor/admission-absence
controls and two parser-only checks are NOT native execution. The new private
profile/controller, resource planning and full outer verification remain open;
this does not retroactively add native series evidence to the result above.

The separate full paced main candidate currently differs in at least 47 paths,
including four pre-existing HTTP/x402 runtime edits with unestablished legacy
native regression. That full transfer was not performed or replaced by a
compatible subset. This independent component does not qualify those runtime
edits. Native resource release, sustainable capacity, chain/economic acceptance,
pilot and production remain unqualified.
