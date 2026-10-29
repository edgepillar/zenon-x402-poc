# API-credit owner admission at existing-store acquisition

The selected API-credit application carries its private spending-file owner and
monotonic clock through funding and service construction. Brand validation alone
does not reread that owner after an asynchronous child or module-loading wait.
The guarded path now borrows one single-use admission for each existing V6 store
acquisition. Public payment/configuration JSON cannot supply or forge it.

The actual existing-store source checks the same owner immediately before
`DatabaseSync`, before the owner-epoch update, before its `COMMIT`, and before
returning the validated store. The enclosing native client checks again after
its awaited construction, before exposing a client. Both initial funding and
the later service handoff select these boundaries; service construction uses the
same selected spending-file owner. Existing unguarded library selections retain
their explicit configuration and independent close behavior.

The checks share one absolute monotonic window, starting at database admission.
The supported native callers select at most 1000 ms, also bounded by the service
payer deadline. Each stage requires a synchronous `undefined` current-owner
receipt and clean before/after file-owner views. A skipped/repeated stage,
reentry, overlapping acquisition, stale owner, unavailable clock, backward time,
non-void/async receipt or elapsed window latches refusal. Neither a late Promise
nor a new admission may reset it. The admission also vetoes wire entry until
construction completes. No timer or thread interrupts blocking native work.

If refusal occurs before native database entry, no database connection has been
requested by that acquisition. If the owner becomes unavailable after native
entry, the store module retains the exact connection and path claim, and refuses
additional guarded acquisitions. It does not launch competing rollback, close,
reopen, migration or retry. This can retain an open transaction/lock and requires
separate reviewed recovery. A committed epoch is not rolled back merely because
the later owner check or client return fails. A returned HTTP owner remains in
its existing HELD slot when its native close guard observes the latched refusal;
owned native stop may still be requested. Inspection is historical DATA with no
cleanup, funding, signing, dispatch or ownership-transfer authority.

This is cooperative point-in-time admission across two independently owned
stores. It is not atomic cross-process fencing: ownership can change between a
check and a subsequent native effect. The window is an observed elapsed-time
admission policy, not an OS timeout or resource-lifetime guarantee. Failure may
occur after a physical side effect; original payment bytes, request identity,
budget reservation and uncertainty must be retained.

Local qualification evaluates the actual admission kernel and outer application
with declared file/CAS/store/child/clock ports, including brand-only baseline
controls. Changed native adapters receive parser checks only. No SQLite, SDK,
official core package, TLS/socket, key, signature, nonce search, child process,
PREPARE, payment or pilot is executed by that qualification. Native acquisition,
physical release, fresh-process recovery, Linux and G1/G2 product acceptance
remain open. Existing historical proofs keep their original source/runtime pins.
