# Service-credit capacity workload owner core

Status: **48 selected component DATA controls pass; native lane binding not implemented.**

The [owner core](../src/service-credit-capacity-workload-owner-core.js) executes a bounded workload
schedule over explicitly trusted, source-owned lane functions. It directly uses
the genuine [window recorder](../src/service-credit-capacity-window-recorder.js)
and [base recorder](../src/service-credit-capacity-recorder.js). Those existing
modules, their public APIs and historical results are unchanged.

This is a real coordination implementation and selected component qualification,
not an implemented native adapter, an SDK/SQLite integration result, a live
workload, sustainable TPS, provider authority or production readiness.

## Why lane ownership matters

The existing P1 native funding/service client has one application slot per
module instance, one active public operation and a single concurrent service
request. A workload adapter must preserve those boundaries. It cannot create
several aliases of the same owner or relax the client guard to claim parallel
traffic.

This core accepts 1-16 distinct lane objects with distinct frozen functions.
It enforces one active operation per lane while allowing independent lanes to
progress concurrently. Function/object uniqueness is not proof of independent
native ownership. A later hardwired adapter must provide genuine isolated
owners/workers and the original P1 graph. The DATA fixture does not supply that
missing native binding and does not qualify a smaller replacement application.

## Closed host contract

Construction accepts exactly:

- `plan`: `warmupCallsPerLane`, `measurementCallsPerLane`, `setupBudgetMs`,
  `measurementWindowMs`, `drainGraceMs`, `maxLedgerTransactionsPerOperation`.
- `recordingLimits`: the unchanged sample and in-flight recorder limits.
- `runtime`: frozen trusted `monotonicNowNs`, `schedule`, `cancel` functions.
- `lanes`: an exact frozen array of frozen `fund`, `execute`,
  `checkBalances`, `close` capability records.

Construction invokes none of these functions. Public `run()` reserves and
caches its genuine Promise before entering any host function; repeated or
reentrant calls share it. `stop()` stops new dispatch and returns that same
Promise. Before run, stop closes already-owned lanes without entering funding
or reading balances.

Each fund/execute invocation receives one frozen command with its start cohort,
bounded ordinal and operation-scoped `beginLedgerTransaction` capability.
Fund/execute must return a genuine native Promise resolving only
`SUCCEEDED`, `REJECTED` or `UNKNOWN`. Throw, Promise rejection, malformed
outcome or thenable becomes UNKNOWN. No then getter is read or assimilated.
These are trusted host classifications, not payment/grant verification.

Balance capabilities synchronously return frozen exact `observed`/`expected`
balance DATA. Expectations must be independently derived by the actual adapter;
matching declared values here does not authenticate ledger correctness.
Close must return a genuine Promise fulfilled with `undefined`. Other
results preserve uncertainty, while every independent close is still attempted.

## Bounded schedule and stop semantics

The sequence is funding barrier, balance check, warmup, balance check,
measurement, stop/drain, final balance check, then owner close. No balance read
is attempted after the actual close capability has entered.

Warmup allows 0-256 calls per lane; measurement allows 1-256. The shared sample
budget must cover the complete planned call/ledger upper bound and three
balance barriers per lane. It does not reset at the measurement boundary.

A fixed setup budget (1-60,000 ms) covers both funding and warmup. Measurement
has its own fixed 1-60,000 ms budget. One separate drain observation budget
(1-1,000 ms) is never renewed. There are at most three source-owned timer
allocations, not a per-request timer log. Setup timeout stops new work even if
a funding/warmup Promise never settles. These are cooperative host contracts,
not OS scheduling, CPU preemption or wall-time guarantees.

UNKNOWN, rejected funding, bad balances, recorder/clock failure or invalid host
contracts stop new work globally. A declared rejected funded call stays in its
error fraction while the finite plan may continue. No next original is created,
re-signed, retried or substituted after uncertainty.

Entered operations and explicit ledger markers are still observed. Ordinary
owner close waits for both sets to drain. At drain expiry, each owned close is
requested once and the result is `HELD_UNKNOWN` with honest pending operation,
ledger and close counts. A malformed drain callback also terminates unknown;
it cannot silently consume the only deadline and leave run pending.

Returned-close observations remain distinct from still-pending or unknown
closes. HELD is observational quarantine, not a claim that every native handle
is still open. Late completions update current inspection but never upgrade
the cached result, restart dispatch or authorize resource release.

## Internal ledger work after measurement stop

The core does not infer transactions from HTTP/service completion. An actual
adapter must call `beginLedgerTransaction()` immediately around the real
selected transaction and call its `finish(outcome)` at the genuine
acknowledgement/uncertainty boundary.

Only the original still-active operation may use that capability, with one
pending marker per lane and a bounded total per operation. The opening marker
is reserved against clock reentry before admission. A stale capability cannot
borrow a newer operation's authority or exceed its budget.

An already-admitted call may enter another internal transaction after the
measurement window stops. Such ledger observations go to a separate genuine
base-recorder series, `postStopLedgerRecording`. They remain drained and
visible but never enter a window-rate numerator. The measurement cutoff does
not itself interrupt the application operation or turn valid tail work into
a rejected transaction.

Global clock order and the per-operation/total ledger limits span both ledger
series. No observed transaction is evicted. Finalization releases only
recorder-owned collections, never application resources or caller-held data.

Consumers must gate on `measurementStatus`; `WITHHELD_OWNER_UNKNOWN` cannot
be upgraded from a nested arithmetic ratio or a later fulfilled close.
The core exposes no private request, proof, key, endpoint, original bytes,
timer token or raw exception through its public result.

## Current local evidence

The [selected controls](../qualification/service-credit-capacity-workload-owner-core.behavior.mjs) directly execute the
real new core and recorders with genuine native Promises and controlled DATA
lane/clock/timer functions. The [actual result](../qualification/service-credit-capacity-workload-owner-core.actual-local-result.json)
pins all five source inputs and complete stream digests. Current counts are
48 passed, zero failed/cancelled/skipped/TODO. Earlier 40/44/45-case source
revisions are separately recorded as superseded, not summed or relabeled.

Coverage includes cross-lane concurrency without same-lane overlap, setup and
measurement deadlines, warmup and operation drain, pending closes, UNKNOWN,
Promise/thenable distinctions, source reentry, ledger tail work, marker budgets,
late timer tokens and pre-close balance barriers.

No native timer, SDK, SQLite, socket, key, signature, nonce, worker, application
workload or capacity benchmark ran. The one current-revision command needed no
scratch, task root, package/source copy, download or archive. Node Permission
Model controls are not an OS/network sandbox.

No existing native P1/P2 source selection, default buyer, package script,
workflow or hosted profile changes. The existing hosted 27-case profile is a
separate lane and does not execute these 48 controls. Native worker/factory
binding, real independent balance expectations, source-pinned native admission
and approved sustained-load measurement remain unfinished.
