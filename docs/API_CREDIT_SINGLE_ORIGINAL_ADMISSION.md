# One unresolved original per API-credit account

The actual API-credit application now hardwires a single-original spending
lane. Before child preparation, a live exact-CAS reservation must succeed with
no other RESERVED or UNKNOWN row in the account's selected policy ledger.
A different payment id and different preparation input cannot replace that
unresolved original. Reopening the same canonical record does not renew a
preparation permit, and day rollover does not expire the exposure.

This closes a source admission gap between budget limits and the first
product's signer uncertainty rule. The generic spending journal still supports
bounded unresolved carry for its existing callers; only the API-credit
application selects the narrower lane. Command/bootstrap JSON cannot select
that generic lane or disable the application binding.

The new `reserveSingleOriginal` operation shares the existing exact-CAS write,
amount/allowlist limits, monotonic history and duplicate-id/digest checks.
No table, policy field, stored envelope, schema version or migration changes.
The first row is still RESERVED before the child can prepare/sign. A rejected
or lost preparation response preserves RESERVED/UNKNOWN; a lost CAS reply
cannot enter the child. A fresh application instance with the same ledger
refuses another preparation. A stale reader loses the CAS before child entry.

A refused single-original journal remains HELD. It cannot switch to generic
admission or use an observation to clear itself. Stored bytes remain intact.
There is no timeout, pruning, replacement, refund, forced reset or new recovery
authority. A separate original-only recovery must justify any later state
transition. The existing service grant can still serve its metered calls after
the one funding, without creating further payment reservations.

SPENT history keeps consuming total budget; it is not a dispatch or signing
permit. A genuinely new reservation may follow resolved SPENT history only
under the same existing limits and a fresh CAS. The input digest identifies
preparation DATA; it is not a recovered payment hash or signature.

## Evidence and limits

DATA controls execute the actual journal, spending binder, SDK lifecycle and
API-credit application with declared child/file/CAS ports. They cover changed
id/context after reopen, RESERVED and UNKNOWN, lost CAS and preparation replies,
two live application instances, close/reentry and late preparation, history
integrity, budget limits and the unchanged generic carry contract. Earlier
100-model-call/exact-replay controls run against the updated application.

These are memory-backed DATA instances, not new operating-system processes or
SQLite connections. Declared preparation loss is not execution of a real SDK
signer. No SDK/core/SQLite/HTTPS/key/signature/socket/nonce/prepare/payment is
executed. Unchanged native-source parser receipts are reused only when their
exact source bytes and runtime hash match the retained earlier evidence.

This is cooperative admission within the selected application. It is not
authentication against another database writer or atomic fencing of an
external network effect. Actual durability, fresh-process cutpoints, recovery
of exact signed bytes/hash, signer-response loss, stale-worker dispatch and
physical release remain G2 acceptance gates. An unrecoverable signature leaves
the account unresolved; these source checks do not claim that recovery exists.
