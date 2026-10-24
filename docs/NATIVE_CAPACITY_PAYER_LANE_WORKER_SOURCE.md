# Native capacity lane worker and namespace source draft

Status: authored source, syntax-checked only. Neither the worker nor preloader was
imported or executed. No native P4 allowance was requested or consumed. This is
not an end-to-end run, load measurement, throughput result or production proof.

The [paired service/supervisor source increment](NATIVE_CAPACITY_PAIRED_LANE_SOURCE.md)
adds RELEASE_IPC to the current payer worker, after CLOSE and outstanding send
callbacks. Its current command bound is 264 including release. The initial
two-file syntax result and 122/404 inventory linked below are preserved historical
source evidence, not the current paired-role admission or runtime qualification.

## Actual worker flow

The [worker](../qualification/capacity-native-payer-lane.worker.draft.mjs) uses
private Node IPC and the genuine [P1 payer-lane owner](../qualification/capacity-native-payer-lane.owner.draft.mjs).
There is no fake SDK, native client, SQLite or fetch factory and no replacement
grant/backend graph. It requires the pinned namespace before importing real
SDK/Noble packages. Source-owned callbacks use the real SDK address derivation,
real Noble transaction signing and existing capability signing-byte/verification
functions, but these effectful paths have not run in this qualification.

The command sequence is INIT, OPEN, PREPARE, COMMIT, SUBMIT, BIND, ordered EXECUTE
calls, then CLOSE. INIT would create one memory-only synthetic wallet seed and
one synthetic capability key pair. Only their public identity/commitment leaves
the worker; private keys are never serialized or written. OPEN derives the closed
loopback RPC/funding/service configuration in source, uses one existing private
certificate file and opens the actual V6/native client through its real owner.
No parent-supplied owner, wallet, signer or transport callback crosses IPC.

PREPARE returns the retained original funding witness over private IPC so the
future parent can bind real SDK verification/settlement callbacks and grant
activation to those exact headers, hash and checkpoint. That witness contains
credential-bearing original material: it must never be printed or copied into
public reports. SUBMIT only establishes BOUND intake, not a grant or finality.
The parent must perform real grant activation/admission separately.

BIND validates one selected capability commitment, generates all fixed original
request IDs/proofs once, verifies them with the existing actual capability code
and gives the complete manifest to the real lane owner before any service call.
The body digest uses the real custody contract's required `sha256:` prefix.
The plan has at most 256 calls; proof signing reserves its counter before each
actual signing call. No proof, original, transaction or nonce range is regenerated
after uncertainty. EXECUTE selects only a retained cohort/ordinal original.

IPC commands are source-correlated to run, lane, source seal and an increasing
sequence. There is one active operation, no queued replacement, at most 264 admitted
commands and bounded captured/output DATA. These are application admission bounds,
not kernel IPC-frame, hostile-parent memory or OS sandbox guarantees.

CLOSE is cached before entering the actual owner and can stop an already-entered
operation immediately. It retains pending operation accounting, waits for opening
when necessary and refuses to call a failed/hidden acquisition an empty returned
close. A returned close fact never clears HELD. No V6 handle consumed by the actual
client is directly closed or reopened. Only a non-held returned close would zero
the worker-owned wallet byte buffer and drop its capability-key reference; this
is not a general cryptographic-memory zeroization guarantee. The managed parent
must retain all unknown evidence and bound process lifetime. No child self-exit,
new scope, arbitrary process kill or successful-cleanup claim is inferred here.

Each command reports child-local monotonic operation timestamps over private IPC.
They are not SQL transaction timings; parent IPC arrival is not native transaction
latency, and unrelated process clocks cannot be combined into one timeline.

## Full real graph, no smaller substitute

The [namespace preloader](../qualification/capacity-native-payer-lane.namespace.preload.draft.mjs)
requires the entire fixed P1 baseline: all 117 application and 404 package source
rows. The [new inventory](../qualification/capacity-native-payer-lane.source-inputs.json)
references that baseline by exact digest and stores only the five additional
rows: the baseline manifest, actual lane owner/protocol, worker and preloader.
The complete resolved scope remains 122 application files, 404 packages and 526
inputs; no application or package was dropped to reduce metadata. This avoids
another full copy of the baseline's source-pin table. A read-only
inspection verified all declared byte/LF/SHA-256/Git-blob pins against the existing
files. Approximately 4.57 MB was read once, without source copies, downloads,
installation or qualification scratch. This is source evidence, not module
resolution, runtime package compatibility or physical cleanup evidence.

The private future profile must bind exact run/lane/root identity, canonical file
URLs, nine-part file identities, the full source seal and fixed bare import edges.
Admission verifies the full graph and package versions before exposing the exact
non-writable/non-configurable namespace getter required by the native owner.
Builtin imports stay real. It uses no source transform, native alias or ordinary
unqualified package fallback. Identity checks around resolution are cooperative
observations, not atomic filesystem leases, hostile-code resistance or an OS /
network sandbox. No fabricated getter was installed in DATA controls.

## Actual evidence and remaining work

The [source result](../qualification/capacity-native-payer-lane.worker-source.actual-local-result.json)
records two successful syntax-only commands and the full read-only source pins.
It records zero child processes, IPC messages, keys, signatures, SQLite files,
sockets, nonce searches, OpenSSL commands, managed tasks or scratch creation.
The [43 current protocol controls](../qualification/capacity-native-payer-lane.protocol-v2.actual-local-result.json)
are separate DATA evidence; three directly exercise real existing custody capture
and roundtrip functions. They corrected the earlier self-consistent bare-digest
fixture, whose 40-control record is preserved as historical, not current evidence.
Neither result is added to hosted CI totals or represented as native execution.

Next is the managed private-profile builder and parent supervisor: genuine
application/RPC/issued-grant orchestration, independent backend balances,
workload-coordinator adaptation, explicit native transaction boundaries and bounded
IPC/process/owner shutdown accounting. The old fixture's finite two-call/grant
budget must not silently be relabelled as sustained-load capacity. A complete
finite effect/storage/source review and a new native allowance are required before
running the worker. Existing P1/P2 selections and their approvals are unchanged.
Main receives only the corrected pure protocol/test/evidence/doc subset; these
native sources and their unmerged P1 dependencies remain on the source branch.
Pilot, measured capacity and production remain NO-GO.
