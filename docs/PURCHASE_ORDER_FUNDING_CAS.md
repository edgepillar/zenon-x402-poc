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

## SQLite implementation candidate

The separate SQLite candidate uses a dedicated caller-owned DatabaseSync
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

The new SQLite store, native entry and source-admission preload are development
source candidates. Syntax checks do not execute SQLite or qualify durability.
The prepared native fixture has write and fresh-process reopen phases on two
new private synthetic databases and one independent pin file. It combines a
committed verified receipt with lost acknowledgement, an old worker's late
result, a new owner, duplicate-payment and capacity refusals, corruption
quarantine and reopening the same retained files. It uses synthetic funding
authentication, with no SDK, key, signature, socket, nonce work, real grant,
service execution or payout. Execution needs its own finite native scope.

The previous original-purchase SQLite allowance is consumed and does not cover
this different receipt backend. Its retained successful and failed evidence is
unchanged. Full-application interruption, authentic funding, physical native
release, signer recovery and economic acceptance remain open. Default runtime
wiring and the existing 108-control hosted CI selection are unchanged.
