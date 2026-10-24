# Private paced source timing capture

Status: **75 current selected DATA controls passed**: 56 paced-owner regressions
and 19 new private-timing controls. This is source-bound event capture, not
native execution, sustainable throughput or a live-pilot qualification.

The changed [paced owner](../src/service-credit-capacity-paced-workload-owner-core.js)
has a separate explicit factory, createServiceCreditCapacityPacedWorkloadOwnerCoreWithPrivateTimingTrace.
It selects the genuine private [windowed core](../src/service-credit-capacity-windowed-async-workload-owner-core.js),
not a recorder facade or copied implementation. The ordinary factory still
returns only run, stop and inspect and does not allocate the private event array.

## One shared parent clock, no extra host calls

Private instrumentation uses only timestamps already accepted at actual queue,
dispatch, withdrawal and source-Promise observation boundaries. The selected
comparison observed the same source, clock, schedule and cancel call counts
and the same ordinary result as the non-private factory. No extra clock read
is introduced. Parent observations remain distinct from child/L1/SQL clocks.

The genuine core's private trace is retained by reference, not copied or
converted into a guessed timeline. Its independent existing JavaScript checker
matches the actual core recorder report in the selected tests.

## Explicit private event contract

After the run has finalized, captureTimingEvidence() returns one frozen cached
capsule. Earlier capture or wrong arity refuses. Raw events never enter the
ordinary result or inspect response.

| Private event | Retained local DATA | Meaning |
| --- | --- | --- |
| REQUEST | Bounded ordinal, lane index and per-lane call ordinal | Logical reservation before any trusted clock can reenter |
| WAIT_BEGIN | Request ordinal and existing parent timestamp | A real queue-recorder observation began |
| DISPATCH | Request ordinal and existing parent timestamp | Queue wait ended and the source-entry observation began |
| SOURCE_TERMINAL | Request ordinal, declared outcome and existing timestamp | The genuine returned Promise was observed settling |
| WITHDRAW | Request ordinal, whether waiting was recorded, timestamp or null | No source entry; an unavailable clock is not fabricated |
| UNOBSERVABLE | Request ordinal only | Entered source returned no safely observable native Promise |
| FINALIZE | Sequence and fixed kind only | Private event retention ends permanently |

Request/lane ordinals are local positions, not payment/grant/request identifiers
or identities. No command object, ledger capability, wallet, address, balance,
header, transaction, grant, exception payload or provider material is retained.
Every row contains frozen primitive DATA.

Both the paced and genuine core traces remain untrusted declarations. The
capsule's false native/authentication flags and NONE authority do not change
when all observed source outcomes are successful.

## Boundaries that cannot become success

A clock reentrant stop can withdraw a reserved request before WAIT_BEGIN. That
case has no invented queue duration or source latency. Withdrawn requests stay
out of the genuine dispatched-call distribution.

An unobservable return retains UNKNOWN rather than a manufactured terminal
success. Fixed drain expiry freezes incomplete private DATA. Late settlement
may drain live counters, but does not append an event, unfreeze the cached
array, update its pending counts or authorize retry/replacement.

If the genuine core could not finalize its timing capture, the private capsule
records a null core trace and UNKNOWN. Stop-before-run is likewise not a
fabricated complete measurement window. Private capture can still preserve
failure DATA without claiming clock or resource authentication.

## Finite memory retention, no native quota claim

The paced array retains at most four events per selected recorder sample plus
one final event: 4 * maxSamplesPerPhase + 1, at most 16,385 rows. The separate
genuine core bound is 7 * maxSamplesPerPhase + 4, at most 28,676 rows. Their
combined logical ceiling is 45,061 events. There is one frozen array per trace;
repeated captures return the same capsule and reuse the genuine core array.

These are event-count ceilings, not a physical heap or native output-byte
guarantee. The 4,080-call virtual-time stress case retained 16,321 paced events
within its 16,385-row bound and independently matched both genuine recorder
reports and the existing core checker. It did not measure a native workload.

The existing native R4 graph does not select the paced factories. Its 1 MiB
stdout reservation and 71 MiB task quota are not silently extended to this
new private capture. Future native selection needs its own complete graph,
byte/host-effect accounting and applicable exact execution authority.

## Actual selected evidence and historical provenance

The [new selected entry](../qualification/service-credit-capacity-paced-private-timing.behavior.mjs)
imports the existing 56 controls and reuses their declared host fixtures. It adds
19 controls without copying a source tree or emulating SDK/SQL/native behavior.
An independent test reference recomputes every queue and dispatched recorder
field, including nearest-rank percentiles, peaks, denominators, empty series and
full spans. It does not replay the recorders. This is test reference arithmetic;
a reusable paced-capture runtime verifier is not claimed.

The [actual current result](../qualification/service-credit-capacity-paced-private-timing.actual-local-result.json)
pins all eight loaded source inputs and complete stream digests. One command
passed all 75 tests with no failures, cancellations, skips, TODOs or stderr.
Its local test duration was about 0.83 seconds, not a native benchmark.

The [prior 56-case report](../qualification/service-credit-capacity-paced-workload-owner-core.actual-local-result.json)
is unchanged. Its source and earlier 47-case reconstruction recipe belong to
[the immutable 45cbc1a baseline](https://github.com/edgepillar/zenon-x402-poc/commit/45cbc1a41c517a8a061f44bcbcaf6c5c44c40b43),
not the current changed source. Old 111/49 standalone results are not relabeled
or rerun just to regenerate metadata.

No SDK/x402 package, SQLite, key, signature, nonce search, socket, application
worker, manager task, private root, qualification scratch, installer,
source/package copy, historical cleanup or automation ran. The unchanged hosted
profile remains 27 selected DATA/component cases and does not execute these 75
controls. Same-ledger pressure, authenticated native balance correctness,
economic/provider acceptance, pilot and production remain separate open gates.
