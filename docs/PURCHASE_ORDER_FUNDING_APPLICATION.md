# Original-order funding application startup

This opt-in application selects one independently pinned original payment,
claims an explicit expected receipt envelope under a new ownership epoch,
and runs the actual grant-free order funding owner through the fenced receipt
port. It retains the original before authentication. It never sends a payment,
refreshes a failed claim, retries verification automatically, manufactures a
grant, starts service execution, or settles compensation.

The selection contains accepted terms, the original payment checkpoint and
independent pins, issuance context, selected store and owner IDs, the exact
expected envelope (or `null`), an immutable verification-attempt limit, and a
cooperative close budget. Capture performs no database I/O. Changing any receipt
binding or recovering without independent original pins is refused before claim.

`start()` is explicit and single-use. Verified recovery rebinds the persisted
record without authenticating it again; this requires a trusted selected writer
and store. The original payment time remains unknown. A paid expired order keeps
its liability; quantity owed and grant funding units remain separate. Neither a
verified receipt nor a cached response establishes grant activation or delivery.

`verifyFunding(candidateJson)` is an explicit bounded attempt. Concurrent calls
and pending-candidate replacement are refused. A lost commit acknowledgement
holds the application. Another explicitly selected owner can reconcile the same
payment and receipt under a new epoch. Reusing a worker name never reuses its
previous fencing token.

`exportRecoveryRecord()` reads protected operator DATA containing the unchanged
original inputs and current complete envelope. Its checksum grants no authority.
`purchasedOrderFundingSelectionFromRecovery(recordJson, independentlySelectedDigest,
nextOwnerId)` requires a digest selected through a separate trusted channel.
The public funding view and status do not include checkpoint or recovery bytes.
Do not serve protected recovery records through public HTTP responses or logs.

`close()` revokes ingress before draining the actual owner and receipt port. One
watchdog bounds cooperative observation of a stuck verifier. Timer delivery and
monotonic time are checked; a delayed watchdog cannot turn an elapsed deadline
into a successful close. This is not an OS deadline guarantee. Unknown control,
an in-flight verification at close, or a lost acknowledgement remains `HELD`.
Late completion can establish a drained logical wrapper but never changes a
rejected close into success. The core never closes its borrowed backend or
releases ownership automatically.

## Explicit native binding

`createPurchasedOrderFundingNativeApplication` fixes the real SQLite store and
native deadline-owner constructors. Construction captures DATA only; `start()`
opens `CREATE_NEW` or `OPEN_EXISTING` against a caller-owned configured dedicated
`DatabaseSync`. The caller retains responsibility for file identity, leases,
quota, mount and capacity admission, and physical database close. No custom
database facade, package loader or alternate clock is accepted as native proof.

After the core drains, the native controller captures a protected recovery
record before closing its logical backend wrapper. A timed-out controller keeps
the wrapper until an explicit `retireLogicalBackendAfterDrain()` observes drain.
That operation does not repair the rejected verdict or close the physical DB.
`readPurchasedOrderFundingNativeRecoveryRecord` performs an explicit selected
read without taking ownership or verifying funding.

## Evidence boundary

The DATA composition uses the actual application, funding owner, receipt
contract and deadline core with a synthetic atomic backend, authenticator and
timer actuators. It exercises startup, original recovery, fencing, lost
acknowledgements, pending verification, reentrant close and deadline failures.
It loads no SQLite, SDK, native timer binding, key, signature, socket or nonce
search. The native entry receives a syntax check only and remains unqualified
for native startup. The earlier eighteen-file receipt-store SQLite result does
not cover this added application or timer binding. The existing hosted CI
selection is unchanged and does not run these new DATA cases.

Existing fresh-intake HTTPS application wiring is unchanged. Mounting this
grant-free recovery entry into the full funding/service application, authentic
funding integration, signer restart, physical resource release, crash recovery,
late-order delivery or compensation, and economic acceptance remain open.
