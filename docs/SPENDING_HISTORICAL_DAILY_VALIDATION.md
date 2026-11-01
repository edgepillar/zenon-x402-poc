# Historical daily exposure validation

The spending journal retains every original reservation. RESERVED and UNKNOWN
amounts count on each later admission day. A SPENT row counts from its reservation
day through its recorded spend day, inclusive. Lifetime exposure never decreases.

Historical validation groups amounts by their existing integer day. For each day
in ascending order, it adds all new reservations, checks the daily limit, then
removes amounts whose spend day is that day. Checking before removal preserves
same-day overlap and zero-length intervals. Unresolved originals have no removal
event. No successor-day calculation is needed at the maximum supported day.

With `n` rows and `u` distinct reservation/spend days, this takes
`O(n + u log u)` work and `O(u)` temporary memory, with `u <= 2n <= 2048` in the
existing profile. The prior implementation scanned all rows at every distinct
day. Events are temporary DATA: no new stored field, index, schema, record,
revision, lease, cache, release, pruning or owner operation is introduced.

Canonical state bytes, exact decimal/BigInt limits, corruption rejection,
one-original admission, UNKNOWN exposure, CAS, reopen and current-owner checks
retain their existing contracts. The actual native application still checks its
selected owner before each operation; this change does not establish atomic
fencing of an external dispatch.

The focused DATA controls compare the actual validator with an independent
closed-interval reference. They cover same-day starts/ends, expired historical
peaks, unresolved carry, order permutations, 1024-row inputs, maximum day,
amounts beyond Number precision, 255-bit limits and declared-memory reopen/CAS.
They perform no SDK/core, SQLite/file-owner, socket, key/signature, nonce or native
application execution. See the exact local result in
[`spending-day-events.actual-local-result.json`](../qualification/spending-day-events.actual-local-result.json).

The complexity bound follows from the source algorithm. No native latency,
throughput, physical release, disk reclaim or end-to-end acceptance is claimed.
Native SQLite/runtime qualification and all G0-G5 gates remain OPEN or
NOT_ESTABLISHED.
