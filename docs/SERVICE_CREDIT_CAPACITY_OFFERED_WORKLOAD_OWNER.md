# Funding and warmup joined to the offered-calendar workload

The [new opt-in source owner](../src/service-credit-capacity-offered-workload-owner-core.js)
composes the genuine fixed-calendar measurement owner with funding, warmup and
delegated source-owner close. Forty-five current local SOURCE/DATA cases passed.
The real supervised native binding is a separate parsed, unexecuted candidate.
This is neither a native capacity run nor pilot or production acceptance.

## One actual source pipeline

The source coordinator captures six distinct frozen capabilities per lane:

```js
{ fund, execute, checkBalances, openMeasurementWindow, stopMeasurementWindow, close }
```

Its completed flow is:

1. Enter one funding original per lane; wait for all original outcomes.
2. Obtain a fresh all-lane balance barrier.
3. Run the configured warmup independently per lane, without a slow-lane round
   barrier. Never overlap originals on a lane.
4. Hand the actual execute/check/OPEN/STOP capabilities to the genuine
   `createServiceCreditCapacityOfferedWindowOwnerCore`, not an injected factory.
   Its precheck and final postcheck supply the second and third fresh barriers.
5. Request each captured source owner's close once. Observe actual returned
   Promises under the fixed stop deadline, preserving pending/unknown work.

The existing measurement owner remains the borrower: it never closes stores or
source owners. The outer coordinator delegates close only through the captured
owner capability. No DB close, process kill, recovery, retry or replacement
capability is introduced.

Funding/warmup records remain separate from measured-call and start-delay data.
Prefix operations have their genuine operation-scoped ledger instrumentation;
post-stop prefix ledger observations have a separate recorder. Measured SQL/L1
timing is never inferred from a Promise. Source balance expectations remain
declared, not independently authenticated ledger correctness.

## Budgeting cannot assume equal lane shares

The calendar is global; a fast lane can receive more than an equal share.
Before any callback, the owner requires each configured per-lane service-call
reservation to cover every planned global offer. It refuses under-reservation
instead of re-funding or replaying dropped arrivals.

The native candidate further requires that per-lane reservation to equal the
global offer count exactly. Existing real pair limits remain intact: warmup plus
that reservation must fit 256 calls per lane. Unused synthetic units stay in the
actual store. This is not authority to make a real funding payment or increase
a previous finite native allowance.

## Deadlines, reentry and uncertainty

One absolute setup fence spans funding, the first fresh balance barrier, warmup
and the inner balance/OPEN acknowledgements. The inner receives only remaining
setup time; the outer monotonic fence independently prevents deadline renewal.
A late microtask cannot start the next stage after an expired queued timer.

The run Promise is reserved before trusted callback entry. Reentrant stop during
the genuine inner run's return compares its exact original Promise once captured;
it does not mistake a not-yet-assigned reference for a different operation.
An uncertain outer setup cancellation fences the otherwise healthy inner owner
before measured dispatch.

Manual stop fences new source work and asks the inner measurement owner to stop.
Owner close normally follows its bounded original drain/postcheck result.
If the outer fixed deadline expires first, every captured source close is still
attempted before publishing HELD. That is an owner stop request, not force-close
or physical-release evidence. Late settlement may drain live counts, never
rewrite the cached report or create a fresh budget.

The whole cooperative plan is bounded to 60,000 configured milliseconds.
Trusted clocks/timers and source owners remain premises; no OS lifetime,
network sandbox, exact RSS or physical native drain is guaranteed.

## Actual checks and execution boundary

The [45-case selection](../qualification/service-credit-capacity-offered-workload-owner-core.behavior.mjs)
directly imports the actual source coordinator, actual offered owner and actual
recorders. It covers complete flow, independent warmup, overload, sixteen lanes,
original-Promise identity, ledger boundaries, partial setup, late results,
uncertain cancellation, independent close attempts and configuration refusals.
Its host capabilities, clocks, timers, balances and ledger outcomes are declared.

Three actual development runs are retained at their own digests. The initial
44 cases passed. An added cancellation case failed in the 45-case selection;
the corrected current 45 cases passed. Counts are not additive coverage.
The existing 67-case inner-owner record is preserved and was not replayed merely
to generate metadata. The companion result includes actual capture/source pins.

No SDK/x402 package, SQLite, key, signature, nonce search, socket, application
child, manager task or storage root was entered. No package install, workflow,
default buyer, old manifest or historical result was changed. The existing
automatic 27-case CI lane does not execute these 45 cases.

## Separate real supervised native binding

The development-only
[native offered adapter](https://github.com/edgepillar/zenon-x402-poc/blob/x402/p1-router-late-pending-close-integration-v2/qualification/capacity-native-offered-workload-adapter-v1.draft.mjs)
hardwires the existing real issued payer/service paired supervisor. It maps the
genuine POSTCHECK phase to the third actual balance/writer-trace read and keeps
all original profile, namespace, root and child checks. It does not fabricate the
old owner's unavailable parent timing capsule.

One parser-only `node --check` command passed. The adapter and its native
dependencies were not imported or executed. A new complete parent/role selection,
finite native effects allowance and genuine managed storage admission are still
required. Neither old R4 nor the separately approved one-clean graph admits it.
Native code remains off main in this batch; the source coordinator is independently
qualified only for the declared-capability tests described above.

P1/P2, native offered-load observations, independent pressure/balance correctness,
runtime/chain/provider acceptance, economic pilot and production remain open.
