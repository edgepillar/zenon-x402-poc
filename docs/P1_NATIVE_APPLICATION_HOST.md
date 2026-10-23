# Explicit native application host - source draft

## Status and purpose

SOURCE_ONLY_NOT_PARSED_NOT_RUN. This default-off module composes the actual
single-origin x402/service-credit application, bounded native HTTPS server
factory and a native deadline owner. It removes the application's need for a
caller-injected HTTPS/timer/clock factory without changing the default buyer.

The P1 V2 native attempt did **not** import or execute these two new modules.
Its four passed cases and failed fifth case do not qualify this host. The
separate corrected V3 fixture still selects the old application graph; it is
not a test of this new host.

## API and ownership

`createNativeOfficialServiceCreditHttpsApplication` accepts four exact groups:

- `official`: requirement, resource, localFacilitator, validateChallenge,
  reconcilePendingSettlement, maxPendingReconciliations, contextLimit.
- `service`: store, execute, selectedDurationMs, admittedGrantId.
- `transport`: origin, generation, limits, bind, tlsMaterial.
- `deadlines`: maxScheduleStarts, maxConcurrentTimers, maxDelayMs.

The host borrows an **already initialized** backend ledger. It never opens,
initializes, migrates or closes that store. There is no server-side payer V6
database; V6 remains owned by the actual client. Caller-supplied service,
facilitator and ledger capabilities remain trusted premises, not native
funding verification or payment authority.

The actual server factory copies TLS material before the constructor awaits.
Construction starts no listener. Only explicit `start()` invokes the actual
application start. Limits, deadlines, method/resource admission and selected
grant scope remain enforced by the existing application components.

## Deadline contract

`createServiceCreditNativeApplicationDeadlineOwner` captures native
`node:timers` and monotonic `hrtime.bigint`, without an injected clock.
Construction schedules nothing. Explicit schedule calls have total-start,
concurrency and maximum-delay limits. It returns opaque frozen tickets and two
distinct interfaces:

| Consumer | Cancel result |
| --- | --- |
| Ingress runtime | boolean |
| Durable-service runtime | undefined |

Known cancelled/fired tickets remain idempotent. Kind separation rejects an
ingress ticket passed to the service interface or vice versa. Close revokes
future schedules, cancels actual armed handles and waits for an already
delivering callback. Failed cancellation, clock failure, thrown/non-void
callback or uncertain scheduling latches UNKNOWN. Late wakes are suppressed;
they do not repair a rejected close verdict.

These bounds and tracked observations are cooperative; they are not an OS
sandbox, guaranteed CPU deadline or physical timer-drain certificate.

## Ordered close and borrowed-store handoff

The host caches start/close promises and revokes its admission before closing.
It waits for the **actual application close** settlement before closing its
deadline owner once. An unobservable/throwing application close retains the
deadline owner as HELD instead of cancelling the clocks underneath an uncertain
application close.

A clean local handoff observation requires the actual application/router close,
zero tracked ingress activity, zero router operations/pending closes, a closed
service session and a clean deadline owner with zero active/delivering callbacks.
The host still does not close the borrowed store.

Any uncertainty yields CLOSE_UNKNOWN / KEEP_HELD. A late start failure can
invalidate a current handoff but cannot rewrite the historical settlement of
an already fulfilled Promise. Handoff observations are local ownership data,
not service-delivery, independent funding, restart or economic authorization.

## Qualification gates still open

Neither source module has run or even been parsed in this increment.
Current-source selected native composition and early-close/failure/late-wake
cases remain required before a native qualification claim. The explicit host
must not be substituted into a differently scoped one-shot experiment.

No SDK installation, nonce work, signer activation, real PREPARE, funding
promotion, provider setup, network deployment or pilot is performed by these
modules. Hosted CI and ordinary installed-package qualification remain separate.
Economic pilot remains NO_GO.

