# Paced service-credit source workload owner

Status: **155 current selected DATA controls passed**, including a 16-lane, 4,080-call
synthetic stress case. This is an opt-in source runtime composition, not a native
workload result, fixed-rate benchmark, pilot or sustainable-throughput claim.

The [new factory](../src/service-credit-capacity-paced-workload-owner-core.js)
composes the genuine [windowed owner](../src/service-credit-capacity-windowed-async-workload-owner-core.js)
and both genuine recorders. Existing source APIs and the pending native R4 graph
are byte-preserved. No buyer, package script, workflow or native entry selects
this factory automatically.

## Controlled admission, not a catch-up burst

The configuration is the windowed owner's exact plan, recording limits,
runtime and frozen source lanes, plus exactly one pacing object:

```js
const owner = createServiceCreditCapacityPacedWorkloadOwnerCore({
  plan, recordingLimits, runtime, lanes,
  pacing: { minimumStartGapMs: 5 },
});
```

This is a source configuration example, not an instruction to enter a live
adapter. Each source lane retains its genuine funding, execution, fresh balance
read, OPEN, STOP and close capabilities. It still funds once, completes warmup,
checks balances and waits for every service-window acknowledgement before
measured work. Warmup and funding are not paced.

Measured execution is FIFO across all lanes. At most one known pacing timer
waits for the next global start gap; pending waiters are bounded by the lane
count (1-16). Every lane still has at most one logical original operation.
A slow lane is never overlapped, replaced or given a second funding.

The gap is 1-1,000 integer milliseconds. Its next boundary is anchored to the
actual source-entry observation, not to a missed historical schedule. A late
wakeup admits one original at most and then requires a fresh gap. There is no
catch-up loop, timer-per-request fanout, deadline renewal, operation replay or
automatic restart.

This is explicitly **closed-loop minimum-gap admission**. If the finite source
lanes are busy, actual arrivals slow down. It is not an open-loop fixed offered
rate, a rate guarantee, or evidence that a service sustained a requested rate.

## Three different latency meanings

| Recording | Boundaries | Interpretation |
| --- | --- | --- |
| Genuine core funded-call series | Logical admission through the returned paced Promise | Includes queue wait; withdrawn pre-entry requests can be logical rejections |
| queueWaitRecording | Waiter admission through dispatch or withdrawal | Waiting only; rejected waiters do not count as dispatched source calls |
| dispatchedCallRecording | Actual source callback entry through observed native-Promise settlement | Excludes pacing wait; parent/source latency, not pure SQL or child/L1 time |

Original command objects and operation-scoped ledger capabilities are forwarded
without copying, re-signing or inventing transaction observations. The existing
core owns separate funding, funded-call and explicit ledger boundaries. No L1
transaction, child timestamp or service SQL latency is inferred from a Promise.

Queue and source distributions are separately finalized, deeply frozen scalar
summaries. The pacer drops its own original-command reference at source entry.
The genuine recorders keep bounded private duration distributions, sort once on
finalization and release their own sample collections. Temporary allocations
remain; no fixed peak-RSS or elapsed-time guarantee is established.

## Stop, drain and uncertainty

Manual stop and genuine core measurement expiry withdraw only not-yet-entered
waiters, cancel the known pacing timer and enter service STOP without awaiting
already-entered source calls. A withdrawn original is never sent later. Its
logical rejection remains visible in the core, but it is absent from the
dispatched-call series. Consumers must not call all logical admissions real
service entries.

Entered source Promises remain observed. Their original ledger capability,
fixed core drain deadline and source-owner close contract are unchanged.
An unsafe/non-Promise return or synchronous source throw does not prove effect
cancellation: it retains an unobservable UNKNOWN source slot. Promise rejection
or an explicit/invalid UNKNOWN outcome stops future admission. A never-settling
source operation can produce a frozen HELD snapshot after the genuine fixed
drain expires. Later completion can drain live counters, never rewrite that
snapshot, release payment authority or authorize replacement.

Timer setup/cancel uncertainty, early or synchronous delivery, wrong callback
arity, reused tokens, backward/overflowing clock DATA and source-close faults
withhold clean success. Timer slots are reserved before trusted callbacks.
Stop during installation attempts cancellation of the exact late returned token.
The host must provide trusted one-shot timers, monotonic time and genuine native
Promises; cooperative guards do not authenticate a scheduler, enforce an OS
sandbox or prove physical resource absence.

The zero-argument run and stop methods share one memoized native Promise,
reserved before trusted funding entry. Construction and inspect are inert.
Stop-before-run enters no funding, warmup, measured call or service OPEN. It
still asks the captured source owners to close. Wrong-arity calls create no
admission or recovery authority.

## Actual source-bound evidence and remaining gates

The [selected tests](../qualification/service-credit-capacity-paced-workload-owner-core.behavior.mjs)
directly import the new factory, the genuine windowed owner and recorders. No
SDK/store/transport facade is substituted for a native result. Host callbacks,
balances, clocks, timers and Promise outcomes are explicitly declared DATA.

The [historical result](../qualification/service-credit-capacity-paced-workload-owner-core.actual-local-result.json)
retains the earlier 47-case selection and final 56-case selection at their own
source digests. The earlier inputs reconstruct from two bounded source edits
and a prefix of the test file at the
[immutable 45cbc1a revision](https://github.com/edgepillar/zenon-x402-poc/commit/45cbc1a41c517a8a061f44bcbcaf6c5c44c40b43);
their hashes matched without executing
old variants or keeping another source tree.
At that pinned revision, 56 controls passed with no skips, cancellations,
TODOs or stderr. Their one local command took about 0.45 seconds, including the
4,080-call case. That duration is not a throughput or capacity benchmark.

The stress plan fills the existing 4,096-slot recording admission calculation:
16 funding originals and 4,080 measured originals across 16 source lanes. It
observes 48 declared fresh balance callbacks (the genuine three all-lane
barriers), no repeated funding, no duplicate per-lane original and no residual
known pacing timer. It does not test same-ledger contention or establish
authenticated balance correctness under native pressure.

No SDK/x402 package, SQLite, key, signature, nonce search, socket, application
child, manager task, private storage root, qualification scratch, installer,
source/package copy, historical cleanup or automation ran. The unchanged hosted
profile remains 27 DATA/component cases and does not run the paced-owner controls.
The older 111/175 controls were not rerun merely to regenerate metadata.

The native R4 graph and its launch controls remain outside this addition.
A later separately scoped native driver must explicitly select this factory,
bind real source ownership and original operations, account for pacing/recorder
costs and preserve the original measurement deadline. Native sustainable load,
physical release, independent same-ledger pressure/balance checks, economic
acceptance, provider authority, pilot and production remain separate open gates.

The [prior private timing selection](SERVICE_CREDIT_CAPACITY_PACED_PRIVATE_TIMING.md)
reran all 56 controls against the changed source and added 19 private controls:
75 passed at its immutable 0c02c927 baseline. It exposes one separate frozen private capsule with no additional
host clock/timer calls. Old 47/56-case results stay tied to their old source
pins; the pending native R4 graph still does not select this paced source.

The [current runtime checker](SERVICE_CREDIT_CAPACITY_PACED_TIMING_CHECKER.md)
now validates complete private evidence against independently captured source
expectations before private success. All prior 75 controls and 80 new checker
controls passed on the changed source: 155 total. A mismatch becomes HELD_UNKNOWN;
timer observation, native execution and post-stop ledger timing are not inferred.
