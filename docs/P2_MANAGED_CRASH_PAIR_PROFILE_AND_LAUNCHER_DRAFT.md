# Full P2 crash pair: private profiles and managed launcher draft

## Current results, 2026-10-24

The [profile builder and capture parser](../qualification/recovery_crash_native_profile.py),
[managed Python launcher](../qualification/run-recovery-crash-pair.local.py) and
[pinned parent command entry](../qualification/recovery-crash-pair.entry.draft.mjs)
are implemented in source. The parent Node entry passed a syntax-only check;
it was not imported or run. The effectful execute branch remains unexecuted.

The [52 DATA tests](../qualification/recovery-crash-native-profile.test.py) all
passed, with zero skips and caller hooks. They use DECLARED file identities,
process events and receipt dictionaries. They do not open a fixture database,
spawn an application child, send a signal, generate/sign a key, search a nonce
or run a package, socket or crash case.

The actual source-only CLI also exited zero. A separate read-only call built
the complete private child and parent profiles in memory: 130 application plus
404 package files, 4,710,510 source bytes read in place, a 255,967-byte child
profile and a 2,930-byte parent profile. No source/package copy, scratch, task
or new storage root was created.

The read-only pre-native plan passed the current source/control/package,
runtime/tool, mounted-volume and historical-reservation checks. Its capacity
numbers are a point-in-time observation, not future admission or permission.

See the [source-bound result](../qualification/recovery-crash-pair-profile.actual-local-result.json)
and [launch source selection](../qualification/recovery-crash-pair.launch-inputs.json).
The initial DATA run was 33/36. Its negative tests had mutated shared fixture
rows. The test helper now deep-copies those rows; admission was not weakened.
The separate corrected 36-case and current expanded 52-case results are
source-bound history, not a summed qualification total.

## Complete graph and private profiles

The prior [full child source milestone](P2_FULL_GRAPH_COMMITTED_INTENT_CRASH_SOURCE_DRAFT.md)
is preserved unchanged in its inventory/result. All 117 baseline V3 application
rows and all 404 package rows remain mandatory. The full 130-file child graph
is not reduced to fit the storage quota or replaced with a simpler SQLite demo.

The builder emits the exact preloader row fields, including LF, Git blob,
SHA-256 and nine-part local file identity. It validates strict file URLs for the
current narrow path alphabet, including scoped-package @ and spaces, without
weakening Node's canonical-URL guard. Local file-identity checks are not
authentication against same-user mutation, runtime module resolution,
ordinary installed-namespace qualification or action authority.

The parent has a separate five-file pinned namespace: its entry, existing
supervisor, V2 protocol, original-payment checkpoint module and package metadata.
All four executable Python control sources are pinned before loading. The
launcher requires isolated, no-site, no-bytecode Python.

## Managed execution branch, not yet run

The default CLI is SOURCE-ONLY. A read-only pre-native plan can additionally
verify all existing source/package bytes, the selected tools, actual mount
identity, all scoped historical reservations and free space. Neither mode
creates a root/task, generates TLS material or starts the Node entry.

A future separately approved execute mode requires a new private empty store
with the exact policy and explicit store ID. It permits one managed OpenSSL
test-TLS command and one managed Node parent command. That parent can start at
most two sequential owned children: seed, then no-dispatch recovery only after
the exact selected seed death, complete stdout/stderr EOF and IPC disconnect.

The task quota stays 4 MiB and the production free-space floor stays 10 GiB,
plus expected allocations, reservations and safety margin. Existing roots are
not adopted, reset or cleaned. The unchanged manager samples child writes;
this is not an OS-enforced disk, lifetime or network sandbox.

Existing application/package files are read in place. Only the small launch
manifest/inventory references and private profiles are retained by the task,
not another application/SDK tree. The parent captures each child's bounded raw
stdout/stderr and the independently retained funding/service originals into
one private stdout payload. The manager retains that payload once in CAS;
there is no second stdout file/ZIP copy.

Parent stdout is capped at 512 KiB; each child retains its existing 64 KiB
stdout and 8 KiB stderr caps. Capped or missing output is not complete evidence.
A child has a 45-second cooperative observer; the managed parent command has
a 120-second timeout. Owned command-group failure stopping is limited to these
managed commands and their owned descendants, never a historical process scan.
Those timers, sampling and signal requests are not OS cleanup guarantees.

The DATA parser requires complete actual command/stream receipts, the distinct
seed/recovery PIDs, SIGKILL rather than a normal seed exit, the exact namespace
and synthetic-effect ceilings, retained originals and persistent CHILD_UNKNOWN.
A fabricated transcript can test the parser but cannot establish native events.
Its returned summary excludes raw originals/proofs and grants no authority.
A selected pair observation remains separate from task close, cleanup and full
P2 qualification. Unknown child-created files remain preserved/HOLD.

## Next gate

No older consumed native allowance or pending V3 one-process clean selection
authorizes this parent/two-child/IPC/SIGKILL test. A separate finite approval
must name the complete existing SDK/x402 graph, five new SQLite paths, eight
extra read-only native opens, two independent pin files, four synthetic keys,
at most five signatures, bounded nonce work, loopback connections, bounded wait
and owned failure stopping. The public launch manifest declares the proposed
ceilings; it does not grant execution authority.

Main, hosted CI, default application/signer and historical storage/evidence
were not changed. Full P2 socket/HELD-store composition, native crash recovery
and cleanup, power-loss durability, real chain/provider authority, service
delivery, live pilot and production remain unqualified.

