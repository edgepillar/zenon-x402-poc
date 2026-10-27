# P1 V4 bounded pending result and V5 expectation repair

The single newly authorized **V4 pending native trial failed**. The
[actual local result](../qualification/sdk105-issued-command-application-v4.pending.actual-local-result.json)
records one test, zero passes and one assertion failure. The existing SDK 1.0.5,
core 2.23.0, SQLite and loopback HTTPS components executed with new synthetic
fixtures. The namespace admitted all 135 application and 404 installed package
files, all nine selected bare edges and the unchanged canonical URL spelling.
The tested V4 sources are pinned at
[development d90eb561](https://github.com/edgepillar/zenon-x402-poc/tree/d90eb561daa4436d4839fb50fdfcbd03bda816bf).

## Failure and existing contract

At `sdk105-issued-command-application-v4.case.mjs:562`, the second pending
observation returned `EXHAUSTED`; the test expected `PENDING`. From the pinned
source order and failure location, the preceding funding BOUND and first PENDING
assertions had completed. The case stopped before its final no-grant, command
close and application close checks, and emitted no completed-case footer. Those
later outcomes are not inferred from an exited process or CLOSED storage task.

This matches the existing bounded observation contract. With
`maxPendingReconciliations: 2`, the
[selected continuation bridge](https://github.com/edgepillar/zenon-x402-poc/blob/d90eb561daa4436d4839fb50fdfcbd03bda816bf/src/x402-selected-settlement-server-bridge.js)
retains the unresolved settlement and marks its continuation `PENDING_EXHAUSTED`
after the second unsuccessful observation. The intake projects that to
`INTAKE_BOUND_OFFICIAL_EXHAUSTED`, and the application binding exposes
`EXHAUSTED`. Grant admission still requires `SETTLED`. Exhaustion neither grants
service authority nor permits a replacement payment or another first settlement.

The defect found here is the V4 test's expected phase. The runtime and the
observation budget remain unchanged. The prior
[V4 clean PASS](../qualification/sdk105-issued-command-application-v4.clean.actual-local-result.json)
and this failed pending result remain separate immutable records.

## Concrete source-only correction

A new V5 case/preloader/controller/manifest is retained on
`x402/p1-router-late-pending-close-integration-v2`. It changes the two stale
pending assertions to `EXHAUSTED` without increasing the budget or removing the
no-grant/no-service/owner-close assertions. The completion footer now captures
the actual official phase, and the result decoder requires `EXHAUSTED` for
pending and `SETTLED` for clean/loss. The V4 source and failure are preserved.

The corrected V5 selection has passed source/inventory admission only: 135
application files, 404 declared package files and 603 reviewed literal edges.
Its manifest SHA-256 is
`087df3b143f1802f75e7bbaaf295371bc32ef82eba2f75f8ee7a644a5b3ceb24`.
No V5 entry, SDK package, SQL engine, signature, nonce search or socket was
executed. V5 clean, pending and response-loss remain **NOT_EXECUTED**. Changing a
test expectation is not retrospective native qualification.

## Preservation and roadmap

Both command streams are complete: test TLS exited zero; Node exited one with
empty stderr. The failed task closed FAILURE, and four SQLite files, one
independent pin file and test TLS files remain under HOLD. Their bytes were
hashed read-only for retention; no post-trial SQLite engine was opened and no
unregistered file was adopted for cleanup. Logical/physical native release is
not qualified by that disposition.

Next: qualify the corrected bounded-pending selection under a separate finite
scope, then response-loss and P2 interruption/recovery. Source preparation can
continue while those native scopes remain separate. Main receives the sanitized
failure and roadmap evidence; the versioned V5 draft stays on development. No
main runtime/default activation, workflow/package update, CI retry or pilot is
part of this change. The existing 108-control hosted profile does not execute
this native case. Economic acceptance and sustained capacity remain open.
