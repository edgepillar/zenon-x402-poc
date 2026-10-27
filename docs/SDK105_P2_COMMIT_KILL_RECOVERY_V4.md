# SDK105 P2 commit, process termination and recovery candidate V4

Status: SOURCE_ONLY_ADMITTED, native executions 0, native authority NONE.
The current [source-only result](../qualification/sdk105-p2-commit-recovery-v4.source-only-result.json)
records 152 application inputs, the unchanged 404 package rows and 699 literal
import edges. The changed parent/preload pass parse-only checks; four unchanged
entry/helpers reuse their exact earlier parse records. The added private-output
encoder/decoder pass their separate actual DATA controls. Installed packages were
not read or evaluated. V3 case/preload/controller sources remain unchanged.

This candidate joins the current actual issued-funding SDK105 application to
a fresh-process recovery of the same files. It does not substitute a declared
store or transport for the native application. No native trial has run, so the
following assertions are requirements of a future trial, not observed results.

| Role | Required behavior |
| --- | --- |
| funding-child | Execute the real original DP funding, selected/foreign grant activation and first service through the owned command host. After the actual backend commit, validate the exact compound original snapshot and send one bounded IPC frame before the service HTTP continuation. |
| parent | Bind that frame to the two independently retained pin files and five physical SQLite file identities. Request SIGKILL only on its exact owned child; require the actual matching exit and subsequent close before opening recovery. |
| recovery-child | Open the existing backend and no-dispatch V6 recovery root in a different process. Match the independent original checkpoint, retained dispatch intent and absent response receipt; observe backend CACHED_SUCCESS while client reconciliation remains required. |

The recovery child must show one execution and two consumed units, unchanged
backend execution state/revision, unchanged foreign-grant balance, no second
service request, the same independent pin bytes and the same five physical file
identities. It exposes no submission method, creates no wallet or service
transport, and performs no new funding POST, service dispatch or signing.
Existing-open acquisition can advance owner_epoch and persist quarantine; this
is not SQLite readOnly. It does not close the first process's hidden payer.

The exact current committed-response-loss gate supplies the boundary. After a
matching commit, the funding child parks its event loop for at most five seconds
while the separate parent receives the frame and terminates it. A missed kill
exits that child with code 87 before returning into the HTTP continuation; this
is FAILURE and permits no recovery start. Error paths stop only exact owned
ChildProcess capabilities, once each. Signal-return values, PID equality or a
normal exit are insufficient. Output caps or uncertain exits cannot qualify a
trial or trigger a retry. The actual parent/child IPC, event-loop ordering,
termination and SQLite reopen remain unexecuted requirements.

The [12 DATA controls](../qualification/sdk105-p2-recovery-boundary-data.actual-local-result.json)
cover the frame and exit predicates with declared observations only. The real
parent uses those same validators, rechecks the private profile table and pin/
file identities immediately before the second spawn, and separately verifies
the fresh recovery child and its source-namespace footer.

The controller is source-only by default. Its sole mode is commit-kill-recover;
an inherited clean default was found by the initial source-only observation,
preserved and corrected before native entry. Final admission binds the corrected
controller and manifest. The six unchanged/changed JavaScript parse results
retain their exact source-row association; they are not native runs.

Proposed finite ceiling: one test-TLS OpenSSL command, one managed Node parent
command and at most two sequential Node children; five new synthetic SQLite
paths and two independent pin files; four ephemeral synthetic keys, one
transaction signature, three capability signatures and two provider signatures;
loopback only, at most 182 connections; nonce windows at most 4096 and aggregate
reservation at most 65536. One planned SIGKILL, at most two failure-only child
stops and one failure-only child self-exit are explicit. Each child stdout/stderr
is capped at 64 KiB. A bounded 448 KiB private byte transcript is streamed into
the ONE managed parent stdout object, capped at 512 KiB; parent stderr uses the
unchanged manager's policy-derived cap, at most 1 MiB. The managed parent budget
is 90 seconds. Missing/truncated output remains failure evidence. The original
hash-only candidate's source and reports remain preserved at their old revision;
the current selection adds [private byte preservation](P2_PRIVATE_CHILD_CAPTURE_DATA.md).

Existing source and dependency bytes are read in place. One source inventory
build derives three role-specific profile DATA objects and a private child-profile
table; it copies no source/dependency directory. Those metadata allocations are
charged to the proposed 4 MiB task. The approved existing root, 10 GiB free-space
floor plus reservations, tool/package/disk identities and a fresh exact finite
authority must all admit execution. Old permissions are not transferred.

No storage manager, task, native child, signal, socket, SQLite, generated key,
signature, nonce search, historical cleanup or metadata rebinding ran during
source preparation. The controller is not an OS/network sandbox. A future
successful SIGKILL trial would not qualify power loss, native physical drain,
all socket failure cases, live chain/funding, economic pilot or production.
