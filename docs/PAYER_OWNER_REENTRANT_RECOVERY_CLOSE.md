# Payer local-operation claim before reentrant recovery close

Status: **SOURCE ONLY. No Node parsing/import, SDK, SQLite or behavior test was
executed for this owner edit or the new nine-case composition.** Main/CI,
funding authority and the live-pilot boundary remain separate.

## Source-observed ordering hazard

The actual payer owner used an async IIFE that invoked its local operation
before assigning `localOperation`. An empty V6 `recoverAfterRestart()` executes
a synchronous transaction, including its existing before-commit hook, without
first yielding. If that hook reenters the payer's `close()`, close could see no
recorded local operation while the transaction was still active.

This is a source-observed ordering hazard, not a reproduced native failure,
security severity finding or production claim. The higher DP submission wrapper
already claims its own pending operation before reentry; relying only on that
wrapper would not qualify direct use of the payer owner.

## Implementation

The actual payer now creates a public Promise capability, assigns
`localOperation` and attaches settlement cleanup before invoking the operation.
The operation is still invoked synchronously: input capture is not deferred to
a later microtask. Its actual completion or synchronous failure settles that
same claimed Promise. Cleanup clears only the same still-owned operation.

A reentrant close can therefore observe and wait for the claimed operation.
The existing recovery phase check still rejects recovery when close has changed
the phase; the patch does not relabel that operation as successful. Native close
must still wait for the operation to settle. The bounded post-result drain
policy, store implementation/schema, exact funding packet and independent-pin
checks are not changed. No new replay, retry, owner-reset or default-buyer path
is added.

The replacement was compared against exact parent
`10a4a69ce193d262737ead3d75b1241d1fbcead7`, owner blob
`1663efe46708c555c1cdc117f7b04e737afb7d8c`. No owner bytes outside
`runLocal` were changed. The previous owner and every historical fixture/result
remain available at their original source references.

## A genuine regression case, not a substitute owner

[The added native fixture](../qualification/service-credit-payer-owner-reentrant-recovery-close-v1.behavior.draft.mjs)
uses the real payer factory and native V6 store directly. It creates one new
private empty SQLite file, reenters close from the real recovery transaction's
before-commit hook, and checks after-commit before close completion. Recovery
must reject with the existing CLOSED code; the same close Promise must then
fulfil CLOSED, with no fetch. A fresh real store/owner reopens the same file,
recovers EMPTY and closes normally.

This additional case needs no payment, key, signature or pin file. It does not
validate funded recovery, independent original-payment pins, crash durability
or native socket drain. A failed owner close is not bypassed with direct
store.close, file deletion, ownership reset or an automatic retry. Failure
artifacts must remain honestly HELD/UNKNOWN in a future admitted task.

## All eight original cases remain selected

[The new versioned driver](../qualification/dynamic-plasma-original-funding-submission-reentrant-v2.behavior.draft.mjs)
imports the original eight-case entry unchanged, then the new direct-payer case.
It does not filter, copy, transform or replace any old case or shared harness.
The intended total is nine genuine application cases, not a one-case shortcut.

The declared combined scope is one Node command with zero children: nine new
SQLite files (eight V6 and one V5 negative), seven independent pin files, one
in-memory synthetic Ed25519 key, seven synthetic transaction signatures, three
synthetic fetch callbacks, two recovery-close hooks and the existing one
commit-return-loss hook. The added case also observes one after-commit hook.
There is no installation, real network, wallet/provider/payment operation,
nonce search, SDK prepareBlock or real PREPARE.

The selection environment string is not human authorization. The earlier
eight-case question or consumed HTTPS scope does not authorize this new
nine-case run. A distinct direct scope is required; no such run has occurred.

## Native launch and evidence remain unqualified

No fresh full native graph, nine-case namespace profile or exact launcher has
yet been qualified. The earlier eight-case profile is bound to earlier source
and physical identities. Do not reuse or relabel it for this owner/driver.

Before any native command, inspect the entire current graph and real package
bytes, exact launcher and new physical identities. Verify the approved mounted
volume/manager, unchanged two-MiB quota, production free-space floor, retained
closed-input references and the peak of all nine databases/pins/journals plus
full capture reservations. No capacity admission is claimed here. Do not
consume the remaining task slot for a source-only probe, raise policy limits,
drop scenarios or copy packages to force a run.

[The source review](../qualification/service-credit-payer-owner-reentrant-recovery-close.source-review.json)
separates these authored assertions from execution. The previous drain helper's
16 actual unit cases remain an unchanged historical component result; they
were not rerun and do not qualify this owner edit. A complete future result
would need all nine cases, matching source/namespace, actual exit/EOF, both
fixture markers and preserved failure/close evidence.

P0-P4 remains incomplete. The economic pilot is NO-GO. This source packet is
not a native runtime result or a main-transfer candidate.
