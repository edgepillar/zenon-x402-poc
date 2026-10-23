# Late pending-owner cleanup after router close

Status: 20 actual declared-callback component tests passed on the changed
router source. This is not an official-SDK, native HTTPS/socket, V6 SQLite or
complete-application qualification.

## Application change

The actual upfront HTTPS router can acquire a pending continuation after its
close path has already revoked admission. Previously, the late continuation
was handed to closePending only after response validation/serialization
succeeded. A malformed body or receipt header could throw after the continuation
was retained but before cleanup was scheduled. The active request could then
finish while router close had no pending-close count for that acquired owner.

Cleanup now runs from finally for an acquired payment entry whenever admission
has closed. Existing closeStarted tracking keeps the transfer single-use. The
router still waits for the returned close Promise, retains CLOSE_UNCERTAIN for
revoked/failed operations, and does not write late replies. A failed or invalid
close result never becomes clean physical resource release.

An open router still retains an unusable reply's pending owner until explicit
close. The exact original payment context remains reserved; replay does not
obtain a new funding call, reconciliation continuation, grant or service action.
No signing, resubmission, default buyer change or recovery-store reset is added.

This was a source-observed gap. The new cases ran after the patch; a runtime
reproduction against the historical preimage or a native continuation was not
performed or claimed.

## One source integration, not an implicit main transfer

The current DP/source work at
29a9284588b72edb840bdbcc9ec7db2ca82310f7 and the published HTTPS application work
at 3f9f1ac51c3f55dc41660a0d5cf9493af5bac806 have common base
ff44a7f41a00fbc26dd4aa81a636f62eddfc632a.

Their three-way source comparison has no conflicts. The HTTPS side contributes
nine existing published files and its existing ingress-owner change. The current
package declaration and DP source graph remain on the current side. Reusing
these exact public blobs brings the existing application constructor, router,
fixtures and historical results into one source tree; it does not execute them.

Only this router implementation, its new regression file, this document and a
new actual result are authored for this change. Existing qualification files,
including the prior failed native HTTPS result, remain byte-identical. Source
integration and the component pass do not qualify the imported application
factory, its newly combined dependencies, or a native funding-to-service flow.

## Actual local component evidence

See [the result](../qualification/official-x402-router-late-pending-close.actual-local-result.json)
and [new regressions](../qualification/official-x402-router-late-pending-close.behavior.draft.mjs).

One Node 24.19.0 command ran all ten unchanged prior router cases and ten new
late-owner cases. The new file was a normal --import preload, not a loader hook;
the original entry and argv were not replaced. No discovery, filter, child
process, SDK/package installation, SQLite, TLS listener, socket, key, signature,
nonce search, chain PREPARE or payment was used.

All 20 named tests passed without skips, todo, cancellation, duplicates or
unexpected registrations. Both output streams completed; stderr was empty.
Source content and nine physical identity fields matched before and after, as
did the runtime executable identity. The owned process group was absent after
join. Runtime version was asserted by both entries. Expected platform and
architecture are labeled as expected values in the result, not falsely reported
as metadata printed by this invocation.

The new cases cover:

- Close before malformed body and before an invalid receipt header.
- Reentrant close while the first callback is producing its reply.
- Rejected, pending and invalid-thenable close outcomes.
- Exact original-context replay after an unusable open reply.
- Healthy open pending ownership until explicit close.
- Late valid and unbound pending owners without reply or service authority.

Only the real router, request-binding module and existing ingress constructors
ran with declared callback/response data. The response-loss and pending-owner
seams are not native sockets, actual official continuations or physical resource
release. A returned close Promise is observed, not promoted to an OS guarantee.

The single command took about 0.13 seconds as observed by its controller. This
is not service latency or a hard deadline. There was no filesystem-write grant,
qualification scratch, package copy or new task-storage task. Captures were
bounded in memory and their complete safe text is retained in the result.

## Remaining gates

Main and hosted CI remain separate. The old native HTTPS draft pins the previous
router source and must not be relabeled as a pass for this change. A fresh,
source-matching native application profile and its own permitted execution are
still required, including actual official x402, HTTPS, V6 custody, selected grant,
response loss and restart behavior on the same graph.

The separate DP nine-case execution gate is not replaced by these unit cases.
Full P0-P4 remains incomplete, and the economic pilot remains NO_GO.
