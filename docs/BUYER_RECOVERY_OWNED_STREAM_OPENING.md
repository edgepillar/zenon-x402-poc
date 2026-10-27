# Recovery stream ownership before native opening

The direct retained-original command entry now reserves both actual command
streams before loading or opening its native payer or borrowed-backend reader.
The new recovery-specific coordinator returns the existing recovery connector
and command session; it does not manufacture an SDK105 funding facade.

Previously, importing the direct entry eagerly resolved effectful SDK/SQLite
dependencies, and its channel was constructed only after payer opening. Merely
capturing the stream configuration did not reserve ownership. An already-owned
stream could therefore be rejected after an unnecessary payer/store acquisition.

The baseline control refuses the effectful module resolution before evaluation.
It observes the old entry attempting to resolve the native client before any
stream validation. On the current entry, invalid or already-owned streams are
rejected without resolving either effectful edge. This is actual negative entry
evaluation with an explicit resolve refusal, not native SDK or SQLite execution.
The hook does not replace module source, loading format or native operations.

## Ownership, deadline and late completion

`openBuyerOriginalRecoveryOwnedStreamSession` accepts the externally selected
original checkpoint, grant and challenge plus frozen trusted binding openers.
Those openers cannot be supplied through command JSON, argv or a module path.
The actual native binding retains its closed configuration and fixed imports.

One monotonic opening deadline covers channel reservation, optional backend
reader, payer, connector validation and session setup. It is not reset between
reader and payer. Each opener receives a frozen zero-argument current-opening
check. The check requires its original pending, unaccepted leg, a live deadline
and an open idle channel. The binding checks before and after each dynamic
import, before acquiring the reader or payer. A retired backend check cannot
admit payer acquisition.

The coordinator also checks the current Node stream state. A synchronous
`destroy()` or `end()` can precede delivery of the channel's close/end event;
that gap must not admit another native acquisition. A control reproduced this
gap during implementation, and the current check rejects it before acquisition.

A timeout does not cancel an entered import or native operation. Original
opening and stop receipts remain retained. A returned late payer is stopped
once; a returned late reader is fenced once through its synchronous CLOSED DATA
receipt. The reader borrows its backend store, which this owner never closes.
Before connector transfer, native and reader stops are attempted independently.
After transfer, cleanup uses the actual connector/session ownership contract.
Rejected or non-void stop receipts do not become successful cleanup evidence.
No late completion changes an already refused opening to success.

## Current validation and remaining qualification

The [local result](../qualification/buyer-recovery-owned-stream-session.actual-local-result.json)
records 24 main-compatible component controls and three development-only
negative native-entry controls. The successful component cases execute actual
canonical inspect/close commands through the real channel and recovery session.
Native payer/store callbacks are explicitly declared. Controls include shared
budget exhaustion, deferred/synchronous opening expiry, late owners, failed
stops, malformed receipts, setup overrun, external stream revocation, and stale
or cross-leg guards. Borrowed stores are not closed and no funding, service,
restore or backend operation is admitted by these controls.

The runner defaults to `LOCAL`, whose closed selection excludes the native
binding. `ENTRY` requires the development-only binding and evaluates only the
three negative entry cases behind both effectful resolution refusals. `ALL`
combines the two explicit selections. The source digest includes the profile,
runner, package metadata and complete selected relative import closure. Input
identities and digests are checked before and after every bounded command.

Main receives the tested pure coordinator, control/runner, result and this
document. The fixed native binding remains on development. Its positive native
acquisition, SDK/SQLite behavior, owner-epoch writes and physical release have
not been qualified by these tests. No installed SDK/x402/Noble package, SQLite,
socket, key/signature, nonce search, managed scratch or native application ran.
The unchanged hosted 108-control profile does not contain these 27 controls.

The separate source-pinned P1 native candidate, historical results, finite
native permissions, default buyer selection and storage policies are unchanged.
Full current native recovery, interruption/lost-ACK/HELD-store handling, runtime
acceptance, service delivery, economic pilot and production remain open gates.
