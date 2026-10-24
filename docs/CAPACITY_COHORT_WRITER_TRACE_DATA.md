# Capacity writer trace cohort DATA

This opt-in helper classifies the real capacity service's raw writer-page shape
without running that service. It matches command ids to the same deterministic
run/lane/cohort/original-ordinal SHA-256 binding used by the
[pinned payer](https://github.com/edgepillar/zenon-x402-poc/blob/7525efc6218b2e6eef1c104270e789e4c2e280ff/qualification/capacity-native-payer-lane-v2.worker.draft.mjs)
and [paired supervisor](https://github.com/edgepillar/zenon-x402-poc/blob/7525efc6218b2e6eef1c104270e789e4c2e280ff/qualification/capacity-native-paired-lane-v2.supervisor.draft.mjs).
Those native files are reference sources, not imported dependencies or executed
test substitutes. Their source, evidence and pending finite allowance are unchanged.

The helper reuses the existing strict
[writer-page DATA capture](../src/service-credit-capacity-native-observation-data.js).
It does not introduce a smaller application, fake namespace, SDK, SQL store,
transport, clock or process factory. Nothing is wired into default payment,
signing, reconciliation or the current native V2 graph.

## Contract

Create the frozen owner with frozen context (runId, laneId), plan
(warmupCallsPerLane, measurementCallsPerLane) and independently obtained completion
(warmupCompleted, measuredCompleted). Append complete 64-row pages, except the
tail, from one stable raw snapshot; then finalize once.

Writer rows alone cannot establish original-operation completion. Planned but
unobserved originals, foreign ids, missing prefixes, reordered/reopened commands,
changed totals, replayed pages, unknown/active writers and invalid clocks refuse
the page. Validation is staged: a later malformed row cannot partially commit
earlier rows. Refusal remains sticky; a late plausible page cannot clear it.

CONTROL, WARMUP and MEASUREMENT counts and span distributions stay separate.
Returned rows omit raw request ids, operation names and caller identity context.
The private command lookup is retained only while reading, then released with
duration references at finalization. Redaction is not permission to publish an
actual native trace: high-resolution timing DATA still needs privacy review.

Missing/incomplete input keeps accepted sample counts for diagnostics but
withholds every min/percentile/max. Complete input reports explicitly declared
cohort spans, not authenticated latency. Finalization is immutable and idempotent.

## Bounds and evidence

The actual plan range is at most 256 originals and 12 times that count plus
64 control records: at most 3136 writer rows, read in at most 49 pages.
Only one page is staged at a time. No raw page timeline is retained by the owner;
at most two duration references per accepted writer row are retained, then
released. These are logical reference bounds, not measured physical heap usage.

The [source-bound local result](../qualification/service-credit-capacity-cohort-writer-trace-data.actual-local-result.json)
records 51 passing selected DATA tests, zero failures/skips, including the full
256-original/3136-row/49-page boundary. Independent literal binding vectors,
partial-page rollback, missing completion, redaction, exact 128-bit spans,
sticky uncertainty, withheld incomplete distributions and reference release
are covered. All rows and completion counters in those tests are synthetic DATA.

No SDK, SQLite, key/signature, nonce search, socket, native child, native workload
timer or qualification scratch ran. The Node permission model restricted test
file access and child creation; this is not an OS/network sandbox claim.
The unchanged hosted CI profile remains separate from these selected local tests.

## What remains unestablished

A call's MEASUREMENT cohort is NOT proof that its writer transaction occurred
inside the measurement time window. A measured call can finish after that window.
True window-only attribution still needs source-pinned service-child-local window
boundaries and real IPC/runtime evidence; child and parent clocks must not be
cross-subtracted.

The spans include JavaScript and identity-check overhead, not pure SQL latency
or proof of causality. Native-event/resource authentication, sustainable
throughput, economic acceptance, live settlement and production remain
unqualified. Integrating this helper into a later native source version requires
fresh exact source pins; the fixed V2 graph awaiting approval is not silently
changed or covered by this helper's DATA tests.
