# Fenced grant-free order fulfillment journal

The [order liability owner](PURCHASE_ORDER_FULFILLMENT.md) now has a dedicated
state-store port and a native SQLite backend source candidate. The existing
grant-bound fulfillment and funding receipt stores retain their distinct formats.
No schema is adopted, migrated or repaired in place.

The journal envelope binds store, order, exact original payment scope, owner,
ownership epoch and revision. A claim requires the exact previously selected
envelope. Claim, release and every changed record advance the revision; claim or
release also advances the ownership epoch. Reusing a worker name does not reuse
its old epoch. A handoff preserves the exact liability bytes. Release is a logical
ownership change and does not prove process exit, physical close or current
dispatch authority. There is no TTL, automatic takeover or hidden retry.

`createPurchasedOrderFulfillmentStatePort(ownerTokenJson, backend)` supplies the
actual order owner's two-argument `load` and four-argument `compareAndSwap` ports.
It compares the complete envelope, rather than only the record bytes, including
for an otherwise idempotent no-op. This prevents an old session from succeeding
after the same record recurs at a later revision. A lost or malformed
acknowledgement holds the port without advancing its local cache. A new session
can explicitly recover the same persisted record; it does not repeat funding
authentication, service execution or a payout.

The monotonic record contract permits one transition per changed revision:
retain the unfunded initial record, copy verified funding, append one original
delivery intent, record one delivery observation, retain one compensation
original or record its observation. A handoff cannot also change business state.
Funding cannot be replaced or removed. Delivery identities and tombstones remain
ordered and immutable; terminal witnesses cannot change. Unknown outcomes cannot
be downgraded to unobserved states. A retained compensation original cannot be
replaced and blocks further delivery changes. The actual receipt and original
request codecs check stored-byte consistency. The order owner still checks its
independently selected purchase pins, source funding store and retained originals;
the selected verifier remains responsible for witness authentication.

The backend must enforce unique payment scope across all orders, including
released slots. It must perform an atomic compare against the complete expected
envelope, retain tombstones and refuse unacknowledged writes. A plain in-memory
map does not establish native durability or cross-process serialization.

The development-only SQLite candidate uses a separate versioned STRICT schema,
unique payment scope, `BEGIN IMMEDIATE`, exact-envelope conditional updates and
dedicated caller-owned connections. It requires DELETE journal mode, synchronous
level at least FULL, memory temporary storage and enabled constraints. It checks
the exact schema and metadata; attached databases and unexpected temporary
objects are refused. A changed database/schema/connection version triggers full
validation under the transaction lock. The reserved `sqlite_` prefix is matched
literally with `GLOB`. A store limits record count to its accepted capacity and
retains every released slot. A record is capped at 1 MiB; its escaped envelope is
capped at 4 MiB. Callers must separately budget physical database/journal costs.

Normal operations validate the selected row. Full-store scans occur at open or
after a detected version change, rather than for every unchanged operation.
Prepared statements are reused. State-port snapshots use their validated cached
envelope; they neither parse the entire liability history nor refresh authority.
Logical close drops only this backend's references. The caller remains responsible
for connection and file identity, independent pins, quotas and physical close.

The [selected DATA composition](../qualification/service-purchase-order-fulfillment-cas.behavior.mjs)
uses the actual order owner, custody codecs and fenced state port with synthetic
atomic I/O and witness authentication. The SQLite module is parsed only and is
excluded from that runtime graph. No native SQLite, TLS, SDK, network, key,
signature, nonce, service execution or payout is run. A source/syntax result is
not native journal qualification. Full P1/P2, physical release, economic pilot and
production acceptance remain open. The declined native trial stays unexecuted.
