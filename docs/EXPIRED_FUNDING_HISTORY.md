# Stored expiry obligation in original-grant inspection

[17 new and 103 affected DATA controls passed](../qualification/expired-funding-history.actual-local-result.json) over declared memory ports. Another 1,693 retain exact source/runtime matches, for 1,813 distinct source-bound DATA controls. One parser check passed; 48 current source files have exact parser proofs. No SQLite, SDK, socket, key, signature, native process restart or physical release was executed for this change. G0-G5 acceptance remains OPEN.

The existing local `READ_ORIGINAL_GRANT` operation previously returned only its
original grant history. For a retained version-two official-outcome record it
now returns a closed `originalFundingHistoryVersion: 1` result containing both
`grantHistory` and `expiredFundingHistory`. Version-one originals keep their
existing closed grant-history bytes and do not receive this envelope. No new
command, HTTP route, verifier, payment, service or compensation port is added.

Independent BOUND-row and outcome digests are checked before historical record
interpretation. A retained receipt additionally requires the original challenge
from that pinned BOUND row. Its funding commitment must match the original
payment identity, and the stored receipt expiry must match the challenge's
absolute expiry. Missing or conflicting challenge data is refused before the
grant lookup. A V1 digest cannot silently become a digest for a V2 record.

The same full BOUND row, exact record and live provider must survive the existing
synchronous lookup before either history is returned. Reentry, close, changed
rows, changed records and opaque lookup results keep the owner HELD. The
existing shared sixteen-attempt limit and command output bounds remain intact.
An output loss cannot authorize automatic reading, grant admission or payment.

The two histories answer separate questions. `NOT_RECORDED` grant history is
not proof of no payment or no liability. An existing or revoked grant does not
erase the retained `RECONCILIATION_REQUIRED` obligation. Original grant units,
ledger counters, settlement identity, absolute expiries and stored observation
time are preserved. No clock observation or fresh funding authentication occurs.

The outer result reports `STORED_HISTORY_NOT_REVALIDATED`, authority NONE and
false payment, signing, grant, service and compensation flags. The stored receipt
retains its original verification label as historical data. Neither history
repairs a HELD operation, proves delivery/refund, transfers external ownership,
or substitutes for a separately authorized admission of an existing grant.

The native provider already routes this operation to the same admission owner;
that binding remains source-only. The new DATA cases compose the actual memory
recovery backend, provider/admission owners, reference ledger and command
controller. Memory reconstruction is not fresh-process SQLite recovery. The
approved hosted 108-control profile and its 22 inputs remain unchanged and
exclude this new local DATA entry.
