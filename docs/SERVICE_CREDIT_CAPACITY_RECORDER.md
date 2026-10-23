# Service-credit capacity recorder

Status: **implemented; 23 selected DATA-only controls passed** on Node 24.19.0,
darwin/arm64. This is bounded measurement infrastructure for P4, not a capacity
benchmark, pilot, active runtime integration or throughput claim.

The existing `service-credit-local-benchmark.js` measures whole synthetic demo
invocations. It and its CLI are unchanged. The new
[recorder](../src/service-credit-capacity-recorder.js) separates observations of
funding, funded API calls and ledger transactions. It imports only
`node:util`; it starts no operation and reads no clock, store or network.

## Record actual boundaries separately

`createServiceCreditCapacityRecorder({maxSamplesPerPhase, maxInFlightPerPhase})`
returns `begin`, `recordLedgerBalanceCheck`, `inspect` and `finalize`.
Configuration is detached from exact, plain own-DATA fields. No callbacks,
labels, raw identifiers, headers, responses or exceptions are accepted.

The phase labels are exactly `FUNDING`, `FUNDED_CALL` and
`LEDGER_TRANSACTION`. A funded-call observation does not imply a ledger
transaction. Instrument the real boundaries explicitly; do not infer L1
inclusion latency or sustainable throughput from Momentum timing or API samples.

This example supplies **synthetic DATA**, not an actual measured request:

```js
import { createServiceCreditCapacityRecorder } from './src/service-credit-capacity-recorder.js';

const recorder = createServiceCreditCapacityRecorder({
  maxSamplesPerPhase: 100, maxInFlightPerPhase: 4,
});
const observation = recorder.begin('FUNDED_CALL', 1000n);
observation.finish('SUCCEEDED', 1200n);
recorder.recordLedgerBalanceCheck({
  observed: { availableUnits: 8n, heldUnits: 0n, consumedUnits: 2n },
  expected: { availableUnits: 8n, heldUnits: 0n, consumedUnits: 2n },
});
const summary = recorder.finalize();
```

In a later approved real driver, supply monotonic nanoseconds from one selected
clock. Events must arrive in globally nondecreasing timestamp order; this is not
a cross-process clock reconciliation protocol. Times are nonnegative bigint
values through `2^128-1`. Durations remain exact decimal nanosecond strings:
there is no floating-point conversion or implicit rounding.

Finish each entered handle exactly once with `SUCCEEDED`, `REJECTED` or
`UNKNOWN`. These are the caller's classifications, not payment verification.
An UNKNOWN timestamp records the caller's declaration of uncertainty; it does
not prove the real operation stopped. Recorder failure must never authorize a
retry, replacement payment, re-sign, skipped operational drain or store release.

## Bounded and failure-aware summaries

Each phase retains at most the explicit sample limit, between 1 and 4096.
In-flight observations are separately limited to 1-64 per phase and cannot
exceed the sample limit. The maximum retained duration-reference count across
three fully successful lanes is `3 * 4096 * 2 = 24576`, not a heap-byte limit.
No raw duration file, dependency copy or per-request log is created.

A sample/concurrency refusal never evicts a slow or failed observation.
Malformed input, a refused start or a missing finish permanently makes recorder
coverage INCOMPLETE. Existing valid handles may finish after an input refusal,
but that cannot repair the coverage verdict. UNKNOWN and a balance mismatch
stop new recorder observations; they do not themselves abort real operations.

Every recorded terminal outcome remains in the terminal-latency distribution
and its denominator. Successful latency has its own distribution. Rejected,
unknown, pending and refused observations are reported explicitly; error
fractions retain exact integer numerator/denominator. Empty lanes use null
percentiles rather than a fabricated zero success.

Each distribution uses exact nearest rank for p50, p95 and p99. These are not
the old whole-demo benchmark's averaged median. Per-phase peak in-flight counts
are independent, and no TPS/window-throughput value is derived from overlapping
latencies. `observedSpanNanoseconds` spans accepted observation events only:
it is not full benchmark wall time, warmup policy or sustained-load duration.

`recordLedgerBalanceCheck` compares observed and independently expected
available/held/consumed units, not conservation alone. Units must be nonnegative
bigints, each and their sum at most `2^128-1`. Only comparison counts are retained;
raw balances are not logged. Expected values remain caller-declared: matching
them is not authenticated ledger correctness or an exactly-once debit proof.

Finalize sorts each private series in place once, caches deeply frozen scalar
summaries and releases the recorder's own sample/handle collections. It owns
no application resource. A cached result cannot be upgraded by a late finish;
unfinished observations remain INCOMPLETE. COMPLETE means recorder input
coverage, not all-successful operations. Capacity qualification, ledger
correctness, authenticated execution and live/production authority remain
explicitly unestablished.

## Actual selected qualification and next gate

The [result](../qualification/service-credit-capacity-recorder.actual-local-result.json)
pins package metadata and the exact module and
[selected controls](../qualification/service-credit-capacity-recorder.behavior.draft.mjs).
One Node command executed 23 controls, all passing, with complete streams,
exit zero and no skips/cancels/todos. The command used Node's Permission Model
and only the three selected source-file read paths; it did not start a demo,
SDK, SQLite, socket, key, signature, nonce search, child or benchmark.

The initial capture wrapper expected TAP but received Node's SPEC reporter.
Its parser consequently returned no cases and exited one even though Node
exited zero and printed 23 passes. A separate read-only evaluator checked that
preserved SPEC stream's hashes, exact names, totals and unchanged source pins.
It did not replay Node. The original wrapper result is preserved, not silently
relabelled as a fresh execution or an application failure.

No historical source pin, P0 profile, package command, default buyer, workflow
or old benchmark changed. Hosted CI is not run or green for this batch. Node
permissions/cooperative source checks are not an OS/network sandbox or CPU,
memory, cancellation or wall-time guarantee.

P4 still requires an actual approved driver on the qualified P1 runtime:
separate funding and funded-call workloads, explicit ledger transaction
boundaries, an independent balance oracle under pressure, full run/warmup
accounting and sustained-load/error measurements. Those measurements, native
integration and pilot readiness are not supplied by this recorder's unit data.
