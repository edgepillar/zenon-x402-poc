# Original signer-result custody

The fixed API-credit native application now selects the spending-file owner
with signer custody and the custodied SDK 1.0.5 wallet owner. The same operator
RUN entry and explicit configuration remain; generic legacy wallet/file/store
exports keep their original two-table/noncustodied contract. This is source
implementation with DATA/declared-port coverage, not native signer acceptance.

The selected application data profile has the existing two spending tables and
one bounded `original_spending_signer_v1` table in the same private SQLite file.
The original policy, reservation schema and owner token stay unchanged. A
two-table existing file is refused by this entry, not migrated or adopted.
A new private application file is appropriate only for a genuinely new ledger.
This entry does not authorize resetting an existing account's exposure/history;
carrying an existing two-table ledger forward needs a separately reviewed
migration. Preserve its original file/evidence. No directory or file is silently
cleaned, replaced or repaired.

1. The actual application commits its existing exact-CAS budget reservation.
2. Before entering the synchronous SDK method, the wallet commits one INTENT
   containing that reservation's id/digest and the exact prepared unsigned
   block/hash/public key. Duplicate intent/result history refuses another sign.
3. The SDK method runs outside a database transaction. Its returned signature
   bytes are detached by the existing owner; no arbitrary thenable is awaited.
4. The wallet commits the exact resulting signed block before acknowledging
   its candidate. Field/hash/encoding checks forbid replacement or reassembly.
   Actual cryptographic preflight remains downstream before funding custody.

Both writes use the same selected store/epoch and BEGIN IMMEDIATE checks.
They do not form an atomic transaction around an external signer. If process
death occurs before the result write, INTENT is insufficient to reconstruct a
signature: the account remains uncertain and cannot sign again. A committed
SIGNED record retains its exact bytes even if its acknowledgement is lost.
No receipt is independently authenticated against same-user file rewriting.

The actual file port exposes explicit existing-record inspection for a future
keyless recovery consumer. It is historical data, never dispatch, new funding,
signature validity, inclusion, settlement or permission to repeat signing.
The operator original funding-checkpoint inspector is unchanged; it does not
silently substitute a signer record when a funding checkpoint is absent.

An UNKNOWN budget reservation remains reserved. Neither intent nor result is
deleted/reset, and a SPENT transition in this profile requires a SIGNED record.
Record count follows the existing policy maxRecords; each record is at most
16384 bytes and existing file/journal/free-space bounds remain enforced. A
capacity or commit refusal cannot fall through to SDK entry or a fresh attempt.

Close blocks new operations. A result copied after close is retained before a
clean close where its original port remains available, but cannot escape as a
new candidate. If the file was already revoked or the write is uncertain, the
original wallet/intent stays HELD; a late receipt cannot upgrade the failure.
CLEAR_RETURNED still means a method receipt, not private-memory erasure.

DATA tests use deliberately invalid signature-shaped bytes and declared
synchronous methods/memory stores, not a private key or signing algorithm.
No native SDK/core/SQLite/HTTPS, socket, key/signature, nonce or payment run was
performed. Actual commit cutpoints, restart/contention, signer response loss,
owner fencing, native release and Linux/G1/G2 acceptance remain OPEN.
