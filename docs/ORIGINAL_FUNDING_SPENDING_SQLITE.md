# Spending journal SQLite source candidate

Acceptance IDs: G1-SPENDING-RESERVATIONS, OWNER-FENCING, RL-LATE-CLOSE.
This candidate implements the real SQLite port consumed by the existing spending
owner and a separate SDK105 lifecycle assembly that hardwires that constructor.
It is source-only. Parser/DATA checks do not establish SQLite execution,
fresh-process durability, native resource release or product acceptance.

The selected profile is explicit CREATE_NEW or OPEN_EXISTING for one account,
one policy and one dedicated file. A missing mode/state is not permission to
create a budget. The schema contains exactly one metadata row and one non-null
state row. The initial row stores the explicit `null` sentinel at revision zero;
deleting either row is corruption. State transitions cannot remove/reorder
originals, change policy/amounts, downgrade UNKNOWN, rewrite SPENT or reset the
record. The same exported pure transition contract is used by the owner-facing
native port. This is consistency checking, not authentication against an actor
deliberately rewriting the file and its independent owner inputs.

The candidate checks the actual selected file path, exact schema, policy and
owner epoch inside its transaction. It requests `BEGIN IMMEDIATE`; another writer
can cause SQLITE_BUSY, as described in the [SQLite transaction documentation](https://www.sqlite.org/lang_transaction.html).
No automatic transaction retry occurs. Uncertain COMMIT/ROLLBACK latches HELD.
Configuration requires DELETE journaling, FULL/EXTRA synchronization, memory temp
storage, foreign keys/check constraints and a busy timeout no greater than 100 ms.
These source checks do not prove power-loss safety on an unqualified platform.

Ownership handoff is explicit and preserves the full spending state. Even reuse
of an owner label advances its epoch; the returned revision floor cannot move
backward. Earlier backend instances must match the current owner/epoch on their
next transaction. No TTL, forced takeover, budget reset, release or pruning API
is provided. Ownership context and an observed revision are not independent
funding, signing, dispatch or delivery authority.

The assembly receives an already acquired real DatabaseSync, existing child
client and wallet owner. It creates the real spending port and passes it to
`createSpendingBoundedSdk105FundingServiceLifecycle`; no backend factory is
injected into that assembly. Close first revokes the client and retains active
uncertainty, then independently revokes the store's logical admission. It never
calls DatabaseSync.close. File/mount/identity/quota admission, fresh exclusive
child ownership and physical database close remain with the caller. Partial
construction is retained and not reported as successful resource cleanup.

Current validation executes the actual pure spending/lifecycle/codec behavior
with declared memory ports and child capabilities. Native modules are parsed
only. No SQLite statement, SDK package, key/signature, socket, nonce search or
real PREPARE is executed. Actual two-connection contention, persisted restart,
owner handoff, file-corruption refusal and physical close remain native gates.
The supported product entry, Linux setup and one-grant/100-request acceptance
remain open. Current user instruction prohibits native execution.
