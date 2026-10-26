# Merge reservation reading with its recheck witness

The current managed capacity controller now captures a store's reservations and
the full task/record/scratch identity witness in one pass. Previously it built
the witness, traversed the same tasks again to read reservations, and then built
the final witness. The final independent witness and the complete storage-parent
and metadata recheck remain unchanged.

Both paths retain the existing identity-keyed in-memory reservation cache.
Changed file identities force a fresh read; the cache is not a durable record,
ownership receipt, cleanup authority or reservation exemption. No manager,
historical helper, task, root, policy, lease or persisted reservation is changed.

## Actual source and DATA checks

All **31 controls** pass against the real new capture definition and preserved
reservation/snapshot definitions. Filesystem callbacks are explicitly declared
DATA. No physical storage root is read by these controls.

The controls compare the complete returned reservation dictionary and the full
sorted witness for zero, one, three, 64 and 4,096 tasks, with cold and warm caches.
They cover exact own-task exclusion, open/closed-with-scratch reservations,
invalid task/store/state/byte fields, record ownership/type/link/size refusal,
record change during reading, final record/scratch/task/membership changes, a
changed warm-cache identity, invalid replacement data and task insertion during
capture even when the declared directory timestamps stay unchanged.

| Declared stable store with 4,096 tasks | Previous path | Merged path |
| --- | ---: | ---: |
| Task-directory enumerations including final recheck | 5 | 4 |
| Task-record reads with a cold cache | 4,096 | 4,096 |
| Task-record reads with a warm unchanged cache | 0 | 0 |

The three logical stages become two; each strict witness also verifies directory
membership. The counted enumeration reduction is 20%. This is not measured
filesystem latency, CPU savings, APFS reclaim or physical storage admission.

The initial 28-case selection passed. Its source and stream are preserved.
Three cache/membership cases were then added, and the current 31-case selection
passed. No unsuccessful test attempt is hidden or relabeled.

## Complete current controller integration

The real capacity reader selects the merged capture. Its independent final
snapshot, prefix refusal algorithm, complete metadata inventory, safe aggregate
bounds, 10 GiB floor and resource arithmetic remain unchanged. A stable
insufficient prefix still refuses; unread stores are never treated as zero.
The source gate still precedes physical storage and installed-package capture.

All **331 complete pipeline controls** pass with the new aggregate callback
boundary. The actual default source-only CLI also exits zero. Their audit sees
zero children, sockets, SQL calls, write opens, outside-source reads and mutations.
The aggregate pipeline fixtures declare their store observations; the separate
31 controls execute the real per-task definitions over declared filesystem DATA.

The 174-application/404-package parent graph, 578 parent rows, 567 prior child
rows, 32 complete child-profile bindings, all 89 resource fields and native
task/command/closure statements remain preserved. No native JavaScript source
changed, and no old finite native allowance was consumed or expanded.

This is a development controller update. It does not qualify SDK/HTTPS/SQLite
composition, native EOF/close, crash recovery, real capacity or production.
No new physical admission is inferred from earlier storage observations.
Main and its unchanged 27-control hosted CI selection remain separate.

See the [source-bound result](../qualification/reservation-capture.actual-local-result.json),
[real-definition DATA controls](../qualification/native_capacity_reservation_capture.behavior.py)
and [managed source controller](../qualification/run-capacity-native-current-offered-v5.local.py).
