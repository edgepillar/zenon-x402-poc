# Windowed asynchronous capacity owner

Status: implemented as a separate opt-in V3 source component; **111 selected
DATA controls passed** on Node 24.19.0, darwin/arm64. This is not a native
workload run, authenticated service-child window, throughput benchmark or
production qualification. The original qualification did not execute a native adapter.

The historical result below retains its original source pins. The changed shared
core was rerun through the same 111 controls for the
[private parent timing selection](SERVICE_CREDIT_CAPACITY_PARENT_TIMING_TRACE.md).
Native V3 revision 4 explicitly selects the private factory in source; see the
[current controller contract](SERVICE_CREDIT_CAPACITY_PARENT_CAPTURE_CONTROLLER.md).
Its graph and changed capture budget remain unexecuted as native work.

The [new owner](../src/service-credit-capacity-windowed-async-workload-owner-core.js)
composes the existing [window recorder](../src/service-credit-capacity-window-recorder.js)
and [base recorder](../src/service-credit-capacity-recorder.js) directly.
The V2 core, its historical 65-case result, and the closed native V2 graph and
launcher are unchanged. The 65 regression cases are exercised against the NEW
V3 implementation in this result; they do not renew old native permissions.

## Owned marker handoffs

Each captured frozen source lane now supplies six distinct capabilities:
`fund`, `execute`, `checkBalances`, `openMeasurementWindow`,
`stopMeasurementWindow`, and `close`. Marker entry must return a genuine
native Promise that fulfills with exactly `undefined`. Synchronous cached
values, thenables, Promise subclasses, own accessors, proxy capabilities and
non-undefined acknowledgement values are not compatibility fallbacks.

1. Fund every lane; complete the fresh all-lane funding balance barrier.
2. Complete warmup and its fresh balance barrier.
3. Reserve OPEN ownership before entering each source capability. Keep the
   setup deadline active until ALL entered OPEN acknowledgements return.
   Do not start the parent measurement timer or measured originals earlier.
4. At planned completion, manual stop, measurement expiry or uncertainty,
   stop new dispatch and enter STOP immediately for each already-entered OPEN.
   Do not wait for an already-entered service original to complete first.
5. Reserve all eligible STOPs before entering the first trusted cleanup
   callback, so reentrant deadline expiry cannot skip a sibling owned STOP.
6. Normal final balance reads and owner closes wait for entered operations,
   ledger boundaries, balance reads, OPENs and STOPs. One fixed drain deadline
   can force close requests, but the cached result remains HELD with exact
   pending counts. No timer renewal or automatic work replacement occurs.

An OPEN failure stops later admission. Already-entered sibling markers remain
observed. A STOP failure does not skip independent STOP or close attempts.
Late success or rejection settles only live counters; it never rewrites the
frozen HELD result, repairs an incomplete recorder or authorizes a retry.
Stopping before run enters no funding, balance or marker capability.

## Two different clock domains

A returned source marker Promise is a handoff observation, not an authenticated
timestamp. A future actual service adapter must take OPEN and STOP timestamps
inside the real service child, using that child's own monotonic clock and
instrumentation ownership. Parent dispatch time cannot be substituted for the
service-child receipt time, backdated into it, or subtracted from it.

The parent/client window and service-child observation window are distinct:
IPC delay and in-flight originals can cross a boundary. The existing
[cohort writer trace](./CAPACITY_COHORT_WRITER_TRACE_DATA.md) still attributes
whole-run writer rows by their original cohort; it is not a time-window filter.
This V3 core performs no child-time alignment, transaction clipping or native
writer-window qualification. Its native/benchmark/capacity flags and authority
remain false/NONE even when every declared host fixture returns successfully.

## Actual selected validation

The [selected tests](../qualification/service-credit-capacity-windowed-async-workload-owner-core.behavior.mjs)
directly import this module and the genuine recorders. They include 65
regression cases plus 46 new marker controls: all-lane OPEN gating, bounded
setup, STOP before original drain, final-read/close gating, reentrant cleanup,
malformed marker contracts, accessor/proxy non-entry, sibling failure,
never-settling markers and immutable late-result handling.

One bounded Node command completed all 111 tests with exit zero, no stderr,
failures, cancellations, skips or TODOs. The
[actual local result](../qualification/service-credit-capacity-windowed-async-workload-owner-core.actual-local-result.json)
pins the exact five loaded source inputs and complete output digests. The
clock, timers, lane outcomes and marker acknowledgements are explicitly
declared DATA host fixtures, not fake native runtime qualification.

No SDK, SQLite, socket, key, signature, nonce search, child process, task-store
scratch, dependency install or benchmark was executed. Node Permission Model
restrictions are not an OS/network sandbox. No default buyer, payment flow,
package script, native V2 input manifest or workflow changes. The existing
27-control hosted profile is separate; it does not execute these 111 controls.

P4 still needs real service-child marker ownership, out-of-band worker STOP
handling, an exact full-source adapter/profile, same-child-clock writer
classification and separately authorized native measurement. P2 recovery,
economic acceptance, live pilot and production remain separate gates.

An opt-in [paced source workload composition](SERVICE_CREDIT_CAPACITY_PACED_WORKLOAD_OWNER.md)
now adds bounded minimum-gap measured-call admission with separate queue and
actual source-entry latency distributions. Its 56 DATA controls passed, including
4,080 synthetic measured calls. It is not selected by the pending native R4
graph and does not establish fixed-rate load or native sustainable capacity.

