# Original-funding spending reservations

Acceptance ID: G1-SPENDING-RESERVATIONS. This opt-in source binds the existing
SDK105 funding/service lifecycle to a synchronous exact-CAS spending journal.
It is part of the one-funding/one-grant API-credit slice, not another payment
mechanism. The default buyer and all existing lifecycle exports retain their
current selection. No SDK, SQL, key, signature, nonce search or network operation
is added to the DATA control lane.

`createSpendingBoundedSdk105FundingServiceLifecycle` takes the existing child
client and wallet owner, funding URL and explicit spending configuration. Missing
policy, a different network/asset or a recipient outside the selected allowlist
refuses admission. Policy fixes the exact captured payer account, network and asset; values use exact
canonical decimal atomic units. Limits include each payment, lifetime exposure,
daily exposure and retained-original record capacity.

The actual existing preparation codec captures the input. Reservation identity
includes that complete detached original input and its actual accepted amount,
recipient, network and asset. A cheaper caller-supplied parallel amount is never
used. One acknowledged reservation precedes one call into the existing lifecycle's
preparation. A duplicate ID, the same original under a different ID, stale CAS, lost acknowledgement, malformed backend
return or reentrant close cannot return a new preparation authorization.

RESERVED and UNKNOWN exposure stays charged. Every unresolved original carries
into later admission days. An observed BOUND result moves that same amount to
SPENT on the observed day without freeing lifetime budget. BOUND is a conservative
budget charge, not independent chain inclusion, economic settlement or delivery
proof. The caller supplies a trusted day source; persisted writes reject day
rollback. This contract does not authenticate the machine clock.

Reopening restores exact policy, counters and original IDs; it cannot authorize
the same original again. Concurrent owners use the complete previous record as
their CAS expectation. A stale or uncertain owner becomes HELD and cannot reload
and retry automatically. There is no expiry, release, pruning or limit-reset API.
Record exhaustion refuses new work while preserving old records. Closing the
wrapper requests the actual existing child stop and revokes the logical journal;
it never closes a borrowed physical database. Late BOUND cannot repair a
close-time UNKNOWN.

The backend must implement synchronous `load(accountId)` and
`compareAndSwap(accountId, expectedJson, proposedJson)`. Its actual transaction,
durability, ownership and exclusive schema admission remain integration duties.
Construction refusal leaves the caller responsible for its previously acquired
child resources. DATA memory-port checks are not SQLite/restart-process, signer
or native release evidence. The supported product entry, real 100-request path,
native spending integration and Linux acceptance remain open. Native execution
is disabled by the current user instruction.
