# Versioned fulfillment storage and explicit ownership handoff

The fulfillment owner now has a concrete versioned state-store port. Each order
slot contains an exact canonical envelope with store ID, order ID, owner ID,
owner epoch, revision, fulfillment JSON and its domain-separated checksum.
Revisions increase for writes and ownership transitions. Epochs increase for
claims and logical releases. Counters never wrap or silently reset.

The port implements the existing `load(orderId)` and
`compareAndSwap(orderId, expectedJson, nextJson)` interface of
`createPurchasedServiceFulfillmentOwner`. Its first load captures one full
envelope. Subsequent CAS operations compare that exact envelope, including its
revision and epoch, rather than only the business JSON. A second load cannot
silently refresh the baseline. This rejects an ABA sequence where a newer
worker changes a result and later restores byte-identical business JSON.
Create a dedicated port for one owner; do not share it behind another owner.

`claimPurchasedFulfillmentOwnership` requires the exact expected envelope or
null for a new slot. A privileged composition layer supplies the new owner ID.
It preserves the complete fulfillment record while advancing epoch and
revision. The operator must separately establish that handoff is permitted.
There is no TTL, stale-process inference, automatic takeover, retry or deletion.
A lost claim acknowledgement remains UNKNOWN and does not trigger an inspection
or another claim. Reconciliation must inspect the exact retained slot explicitly.

A stale owner cannot update the slot after a successful handoff. Reusing the
same textual worker ID still changes the epoch and fences its old port.
`releasePurchasedFulfillmentOwnership` also preserves the record and advances
both counters; it does not close a database, terminate a worker, stop an already
issued external action or prove physical resource release. This is a storage
write fence, not a distributed executor or an authorization to run a service.

Record transitions preserve immutable purchase binding, retained funding,
existing delivery identities and terminal results, and the original compensation
identity. Fulfillment records cannot be removed. A newly claimed empty slot must
first receive an unfunded empty fulfillment record. The owner still checks
independent original/policy binding, quantities, prices and trusted verifier
witnesses. Storage checksums and structure do not authenticate those facts.

An atomic backend must expose `readEnvelope(orderId)` and
`compareAndSwapEnvelope(orderId, expectedEnvelopeJson, nextEnvelopeJson)`.
A successful CAS returns the exact proposed string after a known durable commit;
null means a known compare failure. A thrown or malformed acknowledgement holds
the port unavailable. Its cached revision advances only after a valid reply.
The fulfillment owner then remains HELD until a new owner recovers the same
durable state. No method dispatches, signs, pays or starts compensation.

The source candidate `src/service-purchase-fulfillment-sqlite-cas-store.js` on the
development branch implements this backend with dedicated borrowed
`DatabaseSync`, exact STRICT metadata/slot tables, explicit record limits and
BEGIN IMMEDIATE. Reading, checking the expected envelope and updating all
version columns occur under the same transaction. It requires DELETE journaling,
FULL-or-stronger synchronization, memory temp storage, enabled check constraints
and foreign keys, and no attached database or temporary user objects. Startup
and detected external changes trigger bounded full validation; stable operations
check their selected row. Version epochs are captured before COMMIT while the
lock is held. Close fences this wrapper and never closes the borrowed connection.
File identity, permissions, leases, quota and physical close remain caller duties.

The SQLite implementation has not been executed and is not adopted by main.
Its syntax check does not execute the SQLite module or verify transaction,
crash, corruption or file-reopen behavior. Its tests require a distinct finite
native selection; the pending original-purchase-store allowance does not cover
this new fulfillment backend.

The separate local DATA composition uses the actual fulfillment owner, versioned
port and transition code with a synthetic atomic envelope backend and selected
synthetic original-store/verifier ports. It exercises stale-worker handoff,
same-name new epochs, ABA, lost acknowledgements, retained compensation and
explicit logical release in one Node process.
[All 23 local controls passed](../qualification/service-purchase-fulfillment-cas.actual-local-result.json)
on Node 24.19.0 / darwin-arm64. A separate `node --check` passed for the native
SQLite source without evaluating its imports. The DATA entry's complete literal
import graph excludes that source and `node:sqlite`. These results are not SQLite durability,
worker termination, native process restart, physical release, real payment or
full P1/P2 acceptance. The existing selected hosted CI profile remains separate.

The backend is a trusted capability. Envelope owner IDs/tokens and checksums
are metadata, not authentication secrets. Do not expose raw ownership acquisition
or backend CAS to request-side callers. Same-user rewrites, out-of-band file
modification and external executor fencing remain outside this contract.
