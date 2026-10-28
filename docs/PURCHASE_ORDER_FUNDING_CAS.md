# Fenced persistence for grant-free purchased-order funding

The receipt port connects the actual grant-free order-funding owner to a
versioned storage envelope. A privileged ownership claim binds store, order and
exact payment scope before the original purchase is retained. No grant, API
request or payment callback is needed to retain that original.

## Ownership and receipt invariants

An envelope contains an owner epoch and monotonic revision in addition to the
exact receipt JSON and its checksum. The receipt port caches the full observed
envelope, so a stale write cannot succeed using only an identical business JSON
string. Reusing a worker name still creates a new epoch. An explicit handoff or
release preserves the complete receipt, original payment, proof candidate and
liability byte for byte. It cannot change the purchase or clear uncertainty.

The first receipt must be RETAINED. A verification callback requires a durable
VERIFYING candidate and a higher attempt count. A pending candidate cannot be
replaced during recovery. Only a known rejection can select new proof of the
same original payment. The attempt budget and purchase binding cannot change.
A verified receipt cannot be downgraded, rewritten or removed.

A lost claim, release or receipt acknowledgement is unknown. There is no
automatic read/retry, timer takeover, receipt deletion, payment replacement or
physical-release assertion. Late results from an old worker conflict with the
new epoch/revision. Logical ownership APIs are privileged application controls,
not capabilities that should be exposed to a client request. External lease and
physical-lifecycle supervision remain application responsibilities.

The stored-receipt inspector checks consistency using pins derived from stored
bytes. That is a corruption check, not an independent trust anchor. The actual
order owner still requires its separately selected terms and original-payment
pins during each recovery. Checksums do not authenticate funding or protect an
arbitrary rollback of every trust source. The configured writer, store and
authenticator remain trusted application components.

## Selected SQLite implementation

The separate SQLite implementation uses a dedicated caller-owned DatabaseSync
connection. Its exact two-table STRICT schema binds each payment scope to one
order using a UNIQUE constraint. Capacity is explicit and persisted. Atomic CAS
updates the canonical envelope and indexed ownership columns in one transaction.
Invalid schemas, columns, receipts or connection settings quarantine the store.

Full validation occurs on open or a changed data/schema/connection-change
version. Stable selected-row reads validate their selected envelope rather than
scan the complete history. Version observations are captured while the write
lock is held. No source-only performance estimate is a measured throughput
claim. Closing a wrapper does not close its borrowed database connection.

This candidate opens no files itself and does not adopt a historical database.
The caller owns file identity, private permissions, quotas, leases, durability
settings, SQLite sidecar accounting and physical close. The schema's uniqueness
domain is the selected store; creating unrelated stores does not create global
payment uniqueness. The original-purchase SQLite store and older grant-bound
fulfillment CAS store use different schemas and qualification scopes.

## Qualification

The selected DATA composition exercises the real grant-free owner, receipt
binding, epoch/revision contract and receipt port. The atomic unique-payment
backend and authenticator are synthetic. Handoff, late stale results, lost
acknowledgements, release, attempts, immutable liability and independent pins
are covered. It does not load SQLite or perform signing, network or payment.

The selected native SQLite trial passed on Node 24.19.0 / darwin-arm64 with
the exact eighteen-file source graph. Ten write/recovery cases used two native
connections. A separate Node process passed two same-file reopen/refusal cases
using two further connections. Both processes exited 0 with complete output.
The two new synthetic databases and independent pin file remained byte-identical
across the second process. The test task closed SUCCESS and retained every
output by digest. No second native trial was needed.

The native composition covers a retained original before verification, unique
payment refusal, an exact pending candidate through ownership handoff, a native
verified commit with lost acknowledgement, a stale worker's late result and a
new owner's recovery without another verifier call. It also covers capacity,
stable selected-row validation, wrapper/borrowed-connection separation, a
non-reserved sqliteX schema object refusal, corruption quarantine and the
preserved corrupt fixture's refusal in the new process. The schema uses a
literal reserved prefix; the earlier LIKE-pattern source and its preparation
records are preserved and were not executed natively.

The authenticator remains a fixed synthetic port. Purchased quantity and grant
funding units stay separate, payment time stays unknown, and expiry does not
erase the recorded verified liability. There is no SDK, key, signature, socket,
nonce search, Node child, real grant, service execution, payout or payment.
This qualifies selected component persistence and normal same-file fresh-process
recovery, not full-application response loss, forced interruption, authentic
funding, signer recovery, physical application release or production acceptance.

All eighteen source objects were verified and reused from CAS. Independent APFS
source clones and a small reference manifest were used; no full-text source
archive or new source-object import was needed. Quota, mounted-volume identity,
the 10 GiB floor, extra margin and all discovered reservations were checked
before each native entry. These are cooperative controls, not an OS sandbox.

The original-purchase SQLite store retains its separate fifteen-case, twelve-file
qualification and consumed allowance. The older grant-bound fulfillment CAS
backend is also a separate candidate. Default runtime wiring and the existing
108-control hosted selection remain unchanged; hosted CI does not run these
native SQLite cases. See the [actual local result](../qualification/service-purchase-order-funding-sqlite.actual-local-result.json).
