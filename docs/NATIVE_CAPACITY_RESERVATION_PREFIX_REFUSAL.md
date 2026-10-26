# Native capacity: stop task reads at a stable insufficient prefix

The current capacity controller still discovers every recognized sibling store
and validates the complete metadata scope. It now reads task reservations
incrementally. When the known lower bound exceeds available space, it refreshes
space, rechecks the observed task identities, all store metadata and parent
membership, and samples available space again. An unchanged insufficient lower
bound refuses the run before later stores' task sets are read.

A prefix never produces successful capacity data. If space grows during the
guard, the controller continues to a complete inventory and fresh final
checks. At most one partial stability guard is performed, so repeated free-space
growth cannot cause quadratic prefix rechecks. The returned result still
requires every store's reservations, full task/metadata/membership stability
and a final available-space sample.

## Source-bound callback observation

The real Python capacity function was exercised with declared filesystem,
mount, reservation and free-space callbacks. No physical root, mounted volume,
manager or disk utility was opened or run by these controls.

In the 111-store scenario, each store declares 1 MiB of reservations and the
available budget is one byte below the 64-store total. The previous controller
read all 111 task sets and made 222 task-snapshot callbacks before refusal.
The corrected controller reads 64 task sets and makes 128 snapshot callbacks:
**47 task readers and 94 snapshot callbacks avoided**, approximately 42%.
Complete metadata discovery/rechecks remain at 222 callbacks. This measures
declared callback work, not native elapsed time, disk I/O or reclaim.

When available space is below the unchanged base requirement, the controller
now refuses after complete metadata checks with zero task reads. The previous
path read all 111 task sets. Conversely, an exactly sufficient 111-store budget
still reads every store and performs all 222 task snapshots before returning
complete capacity data.

The initial 295-test reproduction preserved two expected failures showing the
old unnecessary reads. The corrected pipeline passed 320 tests; three final
full-inventory mutation cases were then added. The **current 323-test suite**
and actual default source-only CLI both pass with no failures, errors or skips.
Each attempt remains preserved under its own source pins.

Additional cases cover space increasing before/during a prefix guard, shrinking
at the final check, changed task identities/store metadata/parent membership in
both partial and complete paths, own-task exclusion, reservation-read failure
without retry, zero reservations, 256 stores, invalid numeric data and overflow.
Unread later rows are not interpreted as zero or qualified by a refusal.

The [machine-readable receipt](../qualification/native-capacity-reservation-prefix-refusal.actual-local-result.json)
binds the three changed current source files. All 389 other protected files
retained their recorded bytes and identities. The current resource plan's 89
fields, 32 complete child profile bindings, whole source/profile comparisons,
canonical URL correction and early storage-before-installed-source order
remain covered.

## Unchanged authority and resource limits

The production floor remains 10 GiB, safety margin 1 GiB, task quota 38 MiB,
metadata reservation 4 MiB and base requirement 11,855,200,256 bytes before
other stores' reservations. The native task and command execution body is
unchanged. No policy, root, quota, ownership, cleanup, retry or native allowance
is changed or created.

These controls read no physical storage root or installed package and execute
no Node binary, SDK, SQLite, key/signature, nonce, socket/TLS or native workload.
The default source gate still verifies the 162 admitted application files
without retaining JavaScript bodies; its unchanged-input recheck opens zero
source byte streams. Hosted main CI remains separate. Source/audit controls
are not an OS/network sandbox; physical native qualification and sustainable
capacity remain open roadmap work.
