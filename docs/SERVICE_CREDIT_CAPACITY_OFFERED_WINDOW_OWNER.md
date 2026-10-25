# Fixed-calendar offered-window source owner

The opt-in [measurement controller](../src/service-credit-capacity-offered-window-owner-core.js)
has 67 passing current local SOURCE/DATA controls, including a 16-lane,
4,096-slot pressure case. It does not establish native offered rate, throughput,
same-ledger balance correctness, provider acceptance, pilot or production safety.

## Why this is a separate arrival model

The existing paced workload is closed-loop: busy lanes slow actual arrivals.
This new measurement controller keeps one fixed nominal calendar independent of
source completion. It does not replace or relabel the existing paced owner.

- An available lane receives one original operation. No lane overlaps originals.
- If every lane is busy, that offer is counted as busy-rejected; it is not queued.
- A late wake skips missed calendar slots and admits at most one current offer.
  No missed slot is replayed and no catch-up burst is generated.
- Nominal boundaries do not slide after slow requests. For example, a wake at
  10 ms in a 4 ms calendar can next wake at 12 ms, not 14 ms.
- Completion releases a known lane slot only; it never generates another arrival.

Every finalized report conserves the exact planned slots:

`sourceEntries + busyRejectedOffers + schedulerMissedSlots + withdrawnSlots = scheduledSlots`

Busy rejection is an admission observation, not a backend rejection or service
error. Missed scheduler slots are not service requests. Manual withdrawals are
separate again. A clean source result can still contain heavy overload or missed
arrivals; the report never turns it into a sustainable-load claim.

## Source ownership and measurement boundaries

The caller supplies 1-16 distinct frozen, already-funded/warmed source lanes.
Each has the same four explicit measurement capabilities:

```js
{ execute, checkBalances, openMeasurementWindow, stopMeasurementWindow }
```

The controller first waits for all current declared balance checks, then every
measurement OPEN acknowledgement, before capturing the fixed measurement start.
It performs no funding and receives no wallet, SDK, store or native factory.
A source command has the existing `cohort`, lane-local `ordinal` and
operation-scoped `beginLedgerTransaction` fields. The adapter remains responsible
for binding that command to exactly one real original service request.

Funded-call latency starts at actual source entry, not at a missed nominal slot.
A second recorder reports source start delay relative to the nominal calendar.
Ledger observations exist only when an entered operation explicitly uses its
ledger capability. Already-entered post-stop ledger work uses a separate recorder;
no SQL/L1 latency is inferred from a funded-call Promise.

Post-drain balance checks share the original drain deadline. Their matching
values are caller-declared observations, not independently authenticated state.
Raw balances, payloads, request identifiers and exceptions are absent from reports.

## Fixed deadlines and stopping

Setup has one absolute budget covering checks and OPEN acknowledgements.
A late Promise microtask cannot beat an expired-but-queued setup timer and start
measured work. The source boundary rechecks the monotonic deadline.

Stopping fences new admission immediately and attempts every entered window's
STOP without awaiting earlier stops. The whole stop initialization is reserved
before trusted cancellation/clock callbacks can reenter. No callback is detached
before the captured STOP sweep has been attempted.

The fixed drain deadline includes originals, explicit ledger boundaries, STOP
acknowledgements and final balance checks. Late microtasks and a blocking final
cancel cannot promote an expired observation into success. Manual stop/fault
cannot renew an already expired setup or measurement deadline. An unavailable
only-drain timer publishes HELD with pending work; it is never replaced or retried.

Unknown/non-Promise/throwing operations retain an unresolved original slot.
Late known settlement may update live pending counters, but it cannot rewrite
the frozen HELD report, authorize a replacement or release native ownership.

The controller never calls lane/store close. The enclosing real owner must retain
borrowed resource lifetime, quarantine and independent native-close duties.
Cancellation observations and monotonic callbacks are trusted host premises,
not authenticated timers, physical release or an OS/network sandbox.

## Resource and execution scope

There is no per-offer work queue or payload log. Admission is bounded to 4,096
planned slots; ledger sample capacity is reserved before construction. Only known
timer slots and bounded in-flight observations are retained. Finalization sorts
the genuine recorder's bounded duration series once and drops this controller's
callback/token references. This is not an RSS, hard-lifetime or physical-drain cap.

The [selected test entry](../qualification/service-credit-capacity-offered-window-owner-core.behavior.mjs)
directly imports the actual new controller and unchanged recorder. Its clocks,
timers, lanes, balances and ledger results are declared SOURCE/DATA; native
Promises and actual recorders run. No SDK/x402 package, SQLite, key, signature,
nonce search, socket, application child, manager task or storage root is used.

Six actual development runs are retained at their own source digests. Initial
53-case and expanded 63-case selections exposed failures; their later successful
runs do not erase them. The final selected count is 67, not the sum of historical
runs. The companion result records every actual outcome and capture digest.

Use Node 24.19.0 and the explicit environment selection to run the one test file;
no package installation or broad historical discovery is required. The production
controller imports only Node's utility module and the existing source recorder.
The default buyer, native R4/current clean graph, packages, workflow and automatic
27-case CI profile are unchanged. That hosted lane does not run these 67 controls.

Next integration must bind this separate calendar to the real supervised source
lanes, retain original requests and native ownership, and measure actual errors,
latency, contention and balance pressure. P1/P2, native P4, economic pilot and
production remain open; this source component is not a substitute for those gates.
