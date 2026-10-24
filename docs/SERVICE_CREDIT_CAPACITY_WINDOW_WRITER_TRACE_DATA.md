# Same-child capacity writer-window DATA

Status: **54 selected DATA controls passed** on Node 24.19.0, darwin/arm64.
This opt-in [module](../src/service-credit-capacity-window-writer-trace-data.js)
does not read a clock, authenticate a process, open a store or run a workload.

## Strict inputs, whole intervals

The window capture accepts only an exact frozen OPEN or STOPPED service-child
record, matching run/lane/source context and bounded clock-read count for the
independent finite plan. A STOPPED record needs a strictly positive interval,
no uncertainty and PARENT_STOP, never owner-close fallback. These are DATA
checks, not authentication of the declared namespace, source or IPC sender.

The trace owner directly reuses the genuine
[cohort/page owner](../src/service-credit-capacity-cohort-writer-trace-data.js).
Independently observed completed-original counters and exact original-command
bindings remain necessary. A writer row alone does not prove an original
succeeded. CONTROL, WARMUP and MEASUREMENT cohorts remain separate.

Each whole bracket is classified against ONE declared service-child clock:

- BEFORE or AFTER;
- strictly INSIDE;
- CROSSES_OPEN, CROSSES_STOP or CROSSES_BOTH;
- TOUCHES_BOUNDARY if an endpoint equals either boundary.

Equal nanoseconds do not establish call ordering. Contacts stay separate rather
than being guessed inside/outside. No bracket or inside-transaction duration
is clipped to a boundary. Overlaps, contacts, errors and incomplete coverage
cannot be discarded to improve a percentile. Parent/client and service-child
clocks are never subtracted, merged or relabelled as the same observation.

## Honest completion and bounds

The independent plan admits at most 256 originals, 3,136 writer rows and 49
pages. The new owner plus its genuine cohort owner retain at most four logical
duration references per row (12,544 total), plus at most 256 command references.
This is not a measured physical-heap byte guarantee. Finalization releases both
owners' retained sample collections and command lookup; real application
resources and caller-held DATA are not erased.

A malformed later row does not partially commit the window page. UNKNOWN,
active writers, changed totals, foreign originals, missing independently
completed originals, missing pages or replay stop admission and withhold ALL
incomplete window latency distributions. Finalization caches one immutable
result. Raw request IDs, operation names and run/lane/source identity context
are excluded from returned summaries.

## What actually ran

The [selected tests](../qualification/service-credit-capacity-window-writer-trace-data.behavior.mjs)
directly import this module and the genuine cohort/page implementation.
All 54 passed in one bounded local command with complete output capture,
exit zero, no stderr, failures, cancellations, skips or TODOs.
The [actual result](../qualification/service-credit-capacity-window-writer-trace-data.actual-local-result.json)
pins the five loaded files and stdout/stderr digests.

Tests cover whole-interval classes, equal boundaries, exact large integers,
strict window/context/clock-budget shapes, independent completion, atomic
paging, incomplete withholding, maximum logical retention and final release.
Events and windows are explicitly declared DATA, not native clock observations.

No SDK, SQLite, key, signature, nonce, socket, native child, task-store scratch,
package install, source copy or cleanup ran. No default payment flow, script
or workflow changes. The existing 27-case hosted profile is unchanged and does
not execute these 54 controls. Native windows, pure SQL latency, sustained TPS,
economic acceptance, live pilot and production are not qualified.

