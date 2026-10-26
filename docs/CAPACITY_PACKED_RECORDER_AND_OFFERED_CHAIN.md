# Packed capacity recording and offered owner composition

The explicit packed recorder stores one BigInt per settled observation. Its low
bit marks success; the remaining bits retain the exact nanosecond duration.
One sort orders every terminal observation in a phase. A single pass then finds
the successful nearest-rank positions without a second duration array or sort.
Five selected success values are the only extra rank references during summary
construction. Zero, ties, values above Number precision and 128-bit durations
remain exact; a packed value may use 129 bits.

The public report schema stays at recorder version 1. Successful and terminal
latency distributions, error denominators, UNKNOWN stops, balance mismatch,
limits, immutable/cached finalization and refusal behavior are preserved.
Finalization releases the private duration/handle collections.

## Explicit application path

- service-credit-capacity-recorder-packed.js exports
  createServiceCreditCapacityRecorderPacked.
- service-credit-capacity-offered-window-packed-owner-core.js captures that
  recorder for dispatched calls, post-stop ledger observations and start delay.
- service-credit-capacity-offered-workload-packed-owner-core.js captures the
  packed recorder and the genuine packed measurement window for the complete
  funding, balance, warmup, measurement, drain and delegated-close sequence.

The two owner bodies retain the existing scheduling, admission, deadline,
reentry and resource-lifetime logic. Their only source changes from the
preserved owner implementations are the explicit imports and exported factory
names. There is no injected measurement factory or silent recorder selection.

Existing source-pinned modules and native profiles remain unchanged. An
operator can explicitly construct the packed source composition; the native
profile/driver has not switched to it. This preserves reproducibility of old
qualification receipts while providing a complete new application component
chain for subsequent native qualification.

## Actual local component results

All **29 tests** passed on the pinned Node 24.19.0 runtime. The runner loaded
built-ins and only the explicitly admitted local source/test files; it
installed no package and granted no file-write or child-process capability.
It reused the prior executable hash only after matching its complete recorded
file identity, avoiding another 121,304,480-byte executable hash read.

The tests compare both implementations and independently calculated exact
nearest-rank values across all 364 short success/rejection/UNKNOWN streams.
They cover out-of-order completion in each phase, zero and maximum 128-bit
duration, refused input, proxy/accessor configuration, limits, unknown/duplicate
finish, unresolved observations and balance mismatch.

For 12,288 all-success observations across all three phases:

| Observed component work | Existing recorder | Packed recorder |
| --- | ---: | ---: |
| Retained duration references before finalize | 24,576 | 12,288 |
| Sort calls during finalize | 6 | 3 |
| Retained duration references after finalize | 0 | 0 |

The resulting full reports are equal. This measures references and sort calls,
not heap bytes, elapsed throughput or disk reclaim. Rejected-only observations
already require one reference; the 50% reduction is the all-success case.

Sixteen old/new owner composition comparisons also produce equal complete
reports. They include success, rejection, UNKNOWN, unresolved originals,
manual stop, late timer observations, unresolved/malformed delegated close and
full 16-lane/4096-offer runs through both actual owner chains. The fixture
supplies declared clocks, timers, balances and lane outcomes; it does not create
a native service, database or payment.

The first launch omitted the required selection environment value and refused
before entering any tests. Its original failure is retained. The corrected
launch completed once with all 29 tests; no application-source repair or
native retry was involved. All 394 prior protected inputs matched their bytes
and identities before and after the controls.

The [source-bound local result](../qualification/service-credit-capacity-packed.actual-local-result.json)
contains the five new source pins, the actual attempt results and the limits
of the observation.

## Remaining roadmap boundary

Native offered-driver integration, physical SDK/HTTPS/SQLite composition,
crash recovery and measured sustainable capacity still need their own current
source qualification. These tests use actual Node components over declared
inputs; they prove no live payment, economic behavior, authenticated time,
resource close or production acceptance. No task-storage root, historical
evidence, quota, ownership, automation or finite native allowance was changed.
Hosted main CI is a separate 27-control profile and does not run this suite.
The Node permission model and source selection are not an OS/network sandbox.
