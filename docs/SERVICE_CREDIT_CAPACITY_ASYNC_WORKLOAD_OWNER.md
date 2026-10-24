# Asynchronous service-credit capacity workload owner

Status: 65 selected component DATA tests pass. No native workload or benchmark
has run. The existing synchronous owner, recorders and historical qualification
records are unchanged; this is a separately versioned asynchronous contract.

The [new owner](../src/service-credit-capacity-async-workload-owner-core.js)
uses the genuine existing window/base recorders. Each lane still owns its real
funding, service, close and optional explicit ledger-boundary capabilities.
One operation per lane, independent lanes, original ordinals, no retry after
uncertainty, cached run/stop result and fixed observation budgets remain intact.

## Fresh asynchronous balance barriers

checkBalances() must return a genuine same-runtime Promise. A synchronous
cached DTO, thenable, subclass Promise or Promise with an own then override is
refused. No then getter is assimilated. A fulfilled observation must still be
frozen exact balance DATA matching independently derived expectations.

The actual sequence is funding, all-lane balance barrier, warmup, another
all-lane barrier, measurement, entered-work drain, final balance barrier, then
owned closes. Warmup/measurement cannot start from one early lane's result.
A final read cannot be skipped in favor of a previously cached balance.
These source-owned capabilities are trusted; the core itself authenticates
neither a real SQL read nor independent native owner identity.

Every read is reserved before capability entry. pendingBalanceReads,
balanceBarrierPending, balanceReadAttempts and completedBalanceBarriers
remain observable. There are at most three rounds per lane. The existing setup
budget covers the first two rounds. The same fixed drain budget covers final
reads and closes; it is not renewed by read progress or late completion.

Manual stop during an entered pre-measurement read retains interruption as
UNKNOWN, observes that read and dispatches no replacement. Bad observations
stop all new dispatch, but already-entered sibling reads remain observed.
Normal close waits for active calls, explicit ledger markers AND balance reads.
Drain expiry requests every owned close once and caches HELD with actual
pending-read counts. Later completion changes live inspection only: it cannot
rewrite the cached result, restart a phase or authorize release/replay.

Clock/stop reentry is checked again before recording a returned balance. A drain
deadline inside that callback cannot write into a finalized recorder.

## Real adapter boundary and clock costs

The [observation DATA helper](../src/service-credit-capacity-native-observation-data.js)
derives expected units independently from total/completed finite-plan calls.
It converts an exact declared service-store balance into the recorder's BigInt
DTO. Matching DATA alone is not an authenticated native read or economic proof.

Its bounded writer-page capture requires contiguous ordinals, stable totals,
complete local transaction brackets and one child clock domain. It strips raw
operation names and original request ids. A bracket includes JavaScript and
identity checks; it is never labelled pure SQLite CPU/storage latency.

The separately authored native-pair workload binding stays on the source
branch. It calls the actual pair's new BALANCES command at every check, not its
cached inspection. Parent IPC round-trip, payer-child operation intervals and
service-child writer intervals are separate clock domains. No ledger duration
is inferred from the operation Promise or merged into a parent clock series.

## Exact current evidence and unfinished work

The [65-test owner file](../qualification/service-credit-capacity-async-workload-owner-core.behavior.mjs)
directly imports the new owner and real recorders. Genuine Promises and
controlled DATA lanes/clock/timer callbacks exercise scheduling, uncertainty,
ledger tail work, all three asynchronous read barriers, rejection, missing
completion, reentry, late completion and close ordering. The
[actual result](../qualification/service-credit-capacity-async-workload-owner-core.actual-local-result.json)
pins all five source inputs and actual complete stream digests.

The [16-test observation helper file](../qualification/service-credit-capacity-native-observation-data.behavior.mjs)
and [its separate result](../qualification/service-credit-capacity-native-observation-data.actual-local-result.json)
cover independent expectations, scalar/descriptor bounds, privacy and
child-local paged timing DATA. Neither test file starts a real timer, SQL, SDK,
socket, key, signature, nonce, worker or native application. No scratch, task
root, package copy, download or archive was needed.

The existing hosted 27-control profile is unchanged and does not execute these
65/16 checks. Full role preloaders, managed profile materialization, stable
writable-directory identity migration and a finite native workload selection
remain separate source/qualification work. No native run is approved by these
records. Finite functional/burst observations, sustained capacity, economic
acceptance and production readiness remain distinct and unproven.
