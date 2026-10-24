# Service-credit capacity measurement windows

Status: **implemented; 36 selected DATA controls passed** on Node 24.19.0,
darwin/arm64. This is P4 accounting infrastructure, not an executed workload,
capacity benchmark, sustainable-throughput result or production qualification.

The [window recorder](../src/service-credit-capacity-window-recorder.js) composes the genuine
[capacity recorder](../src/service-credit-capacity-recorder.js), whose source
and historical 23-case result are unchanged. No source copy, clock callback,
operation factory or alternate implementation is substituted. The new local
36-case result is not added to that historical count.

## Explicit boundaries and cohorts

`createServiceCreditCapacityWindowRecorder({maxSamplesPerPhase, maxInFlightPerPhase})`
exposes `startWarmup`, `startMeasurement`, `stopMeasurement`, `begin`,
`recordLedgerBalanceCheck`, `inspect` and `finalize`.

Every timestamp is caller-supplied monotonic nanosecond bigint DATA through
`2^128-1`. All accepted event timestamps are globally nondecreasing. Calls,
rather than invented sub-nanosecond ordering, disambiguate equal timestamps.
The recorder reads no clock and authenticates neither caller time nor outcomes.

1. Optional `startWarmup(at)` starts the run. Warmup operations remain in their
   warmup cohort even if they finish during measurement or drain.
2. `startMeasurement(at)` records carry-in and begins the explicit observation
   window. It may be used directly without warmup.
3. `stopMeasurement(at)` closes a strictly positive elapsed window and rejects
   new observation starts. Existing observations may still finish.
4. `finalize(at)` records full run/drain time, keeps missing finishes visible,
   caches one immutable result and releases only recorder-owned collections.
   A changed finalization timestamp cannot rewrite that result.

An UNKNOWN or balance mismatch stops NEW recorder observations, not real work.
Existing handles still need actual operational drain. A warmup UNKNOWN cannot
be discarded by starting a new measurement generation. No boundary retries,
aborts, releases a store or grants payment/re-signing authority.

A missing measurement start/stop, malformed input, refused start, duplicate
finish or pending observation cannot be silently repaired into complete
coverage. Same-timestamp completion before the stop call is inside; the same
timestamp after the stop call is spill-out. A zero-duration stop refuses.

## Correct denominator, visible slow work

Each phase remains independent: `FUNDING`, `FUNDED_CALL` and
`LEDGER_TRANSACTION`. Ledger transactions must be explicitly instrumented;
they are not inferred from funded calls.

The ratio numerator contains only measurement-cohort successes observed before
the stop call. The denominator is the explicit window's elapsed nanoseconds,
not the sum, average or inverse of overlapping request latencies. Ratios remain
exact rational strings: successful completion count times one billion divided
by elapsed nanoseconds. No floating-point rounding or implicit time window is
used.

Warmup carry-in completions and measurement spill-out never inflate that
numerator. Their counts and complete terminal/success latency distributions
remain visible in their original start cohort. Rejection, UNKNOWN, pending
work, refused starts, carry-in, spill-out and peak concurrent observations are
reported separately. Incomplete, stopped or undrained recording withholds
window ratios. An empty measurement lane reports no fabricated success rate.

These are arithmetic ratios of caller-declared events, not authenticated
native measurements, L1 inclusion latency, physical drain or sustainable TPS.

## Bounds and storage

The sample limit (1-4096) and in-flight limit (1-64, no larger than the sample
limit) apply per phase across BOTH cohorts together. Starting measurement
does not reset the budget or allow twice as much work. Balance checks have one
shared sample budget across warmup, measurement and drain; only counts and
mismatch flags are retained, not raw balances.

Both cohort recorders share the same total sample gate. At most
`3 * 4096 * 2 = 24576` duration references are retained across them together,
not per cohort. This is a reference-count bound, not a heap-byte guarantee.
Only active observation handles and fixed aggregate counters are additionally
retained. Finalization clears the recorder's own sample/handle collections;
caller-held handles or real application resources are not erased or closed.

The local command needed no task-storage root, scratch, download, package copy,
archive or raw duration file. Native dependencies were neither installed nor
executed.

## Actual validation and publication boundary

The [selected controls](../qualification/service-credit-capacity-window-recorder.behavior.mjs) directly import the
real new module and original recorder. One pinned Node command passed all 36
named controls, with complete stdout/stderr, exit zero and zero failures,
cancellations, skips or TODOs. The [actual result](../qualification/service-credit-capacity-window-recorder.actual-local-result.json)
pins all four source inputs and output digests.

Cases cover carry-in/spill-out, overlapping calls, rejected/unknown outcomes,
cross-cohort budgets, all three balance stages, absent boundaries, unfinished
drain, equal timestamps, large exact integers, cached finalization and hostile
DATA shapes. No SDK, SQLite, socket, key, signature, nonce search, workload or
benchmark was run. Permission Model restrictions are not an OS/network sandbox.

This independent opt-in module adds no default buyer, workload driver, CLI,
package-script, workflow or native P2 graph change. The existing hosted
27-case profile remains separate and unchanged; it does not execute or qualify
these 36 new controls. Main adoption of these files is source integration
backed by the exact local controls, not new hosted benchmark evidence.

P4 still needs instrumentation on the qualified real P1 runtime, an independent
balance oracle under pressure, an approved sustained workload and actual
warmup/measurement/drain observations. Native P2, economic acceptance, provider
authority and production remain separate gates.
