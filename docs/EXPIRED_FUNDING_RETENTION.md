# Expired original funding retention: source candidate

[45 new and 582 affected DATA controls passed](../qualification/expired-funding-retention.actual-local-result.json) over declared memory ports. Another 1,169 retain exact source/runtime matches, for 1,796 distinct source-bound DATA controls. Three parser checks passed; 48 current source files have exact parser proofs. The actual native application, installed packages and SQLite storage were not run. Real funding authentication, durable liability, fresh-process recovery, physical release, Linux and G0-G5 acceptance remain OPEN.

An authenticated original can expire without this operation creating a grant.
The existing closed `FUNDED_NO_NEW_GRANT` receipt preserves a reconciliation
obligation, but previously the receipt itself was not stored. This candidate
retains it on the same official-outcome row before publishing known success.
No new table, payment, service execution or compensation operation is added.

## Record and transition

The existing `intake_official_outcomes.record_json` slot accepts a closed version
two envelope containing a structured terminal version-one `officialRecord`
and a closed `expiredFunding` receipt. Canonical encoding of `officialRecord`
must recover the exact original V1 bytes. Keeping the record structured avoids
escaping the entire existing JSON string again. The only new transition is the original
SETTLED V1 bytes to this wrapper. Identical proposals are not second claims.
Replacing or removing the receipt, changing the underlying original, nesting
wrappers, or attaching one to PENDING/in-flight/exhausted state is refused.

The SDK outcome, original payment header, BOUND identity, observation count and
budget retain their exact V1 bytes. The original expiry is supplied independently
by the selected issued challenge. The real SQL adapter compares transaction,
funding commitment and expiry with that same row before accepting a read/write.
The pure codec validates historical structure; it does not authenticate funding.

Existing V1 records and table definitions remain unchanged. This is an explicit
new record-format transition: older source versions reject the V2 wrapper.
Deployment compatibility must be qualified before enabling these sources.
There is no historical rewrite, automatic migration or rollback to old binaries.
The existing 65536-byte record bound remains; an oversized wrapper is refused.
If encoding still exceeds that limit, the original row stays intact and the
validated candidate remains in the HELD owner without CAS or retry authority.
In-memory candidate retention does not establish durable receipt storage.

## Owned write and uncertainty

The fixed native preparer borrows the same explicit three-table intake port and
refuses an already-retained record before any new verifier entry. It claims one
retention controller before the selected verifier. The activation owner supplies
a frozen fence for its live provider and complete pinned BOUND row. The fence
is checked before/after reads, immediately before CAS, after acknowledgement and
after exact readback. A late result after owner close cannot start this added
write; close during an entered write remains uncertain.

Both initially expired verification and verification that crosses expiry use
explicit prepared modes. The original activation owner invokes the retention
callback only for the closed expired receipt, after observing verification and
rechecking its lifecycle/original. Grant admission never uses the receipt.
Unexpired activation follows its existing grant path without a retention write.
Legacy prepared contracts cannot add the callback implicitly.

The closed candidate is captured before bounded encoding, so encoding refusal
does not discard it. Known output requires one strict CAS, its exact acknowledgement and same-row
readback. Lost acknowledgement, wrong type, Promise/thenable result, changed
row, failed fence or missing readback keeps the owner HELD. The validated candidate receipt
and any successfully encoded proposed bytes remain retained by that owner. A matching later row does not
repair an unknown write or authorize retry, re-verification, payment or payout.
This controller's claim is process-local; cross-process fencing remains OPEN.

An already-live official-outcome custody owner can adopt only the exact terminal
V1-to-retained-wrapper extension. It cannot adopt an unobserved settlement,
renew an observation budget, or remove a receipt. The official SDK outcome
projection remains the same. Independently retained digests still pin exact
bytes: an old V1 digest does not silently become a digest for the new wrapper.

## Historical reading

`projectOfficialFundingPostExpiredReceipt` first checks a separately selected
record digest, then original transaction/commitment/expiry pins. It reports
`STORED_HISTORY_NOT_REVALIDATED` with authority NONE. All SDK, new funding,
re-verification, grant, service and compensation flags are false. Receipt
absence is not proof of no funding or permission to pay again. Stored history
does not clear a HELD owner or establish external ownership handover.

Delivery liability remains RECONCILIATION_REQUIRED. Grant existence is
NOT_QUERIED; service delivery and compensation remain NOT_ESTABLISHED. The
receipt is an obligation to reconcile, not delivery, refund or settlement proof.

## Qualification and remaining acceptance

The candidate DATA entry covers strict envelope/CAS behavior, independent
original pins, uncertainty, terminal-owner compatibility and activation-owner
fences over declared memory ports. It passed with affected regressions under
the approved task-storage manager. Native bindings were parser-checked only.
The approved 108-control hosted CI and its 22 source inputs are unchanged.
No package installation, native/SQLite/SDK/TLS execution or CI dispatch is part
of this source candidate. Preserve all previous evidence and failed/unknown
observations with their original scope.
