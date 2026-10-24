# Full native capacity V3 window source

Historical first-source selection at
[25c62dc](https://github.com/edgepillar/zenon-x402-poc/tree/25c62dc7fc511f9ebed3b33a92908f8ed8d42c4f).
The results below bind that revision, not the changed current graph. See the
[managed V3 source revision](./NATIVE_CAPACITY_MANAGED_WORKLOAD_V3_SOURCE.md)
for current private attribution and independent capture recomputation.

Status: source implemented and locally parsed; **not natively executed**.
The source-only graph contains 138 application files and the same 404 package
files. All 117 baseline P1 application rows and all 404 package rows remain
byte-for-byte pinned; no compact SDK/SQL application is substituted.

This version is independent of native V2 and its pending scope. Existing V2
sources, launch inputs, historical results and failed P2 evidence are unchanged.
No old allowance is renewed. The complete managed V3 launcher is still absent;
native execution and sustainable capacity are NOT established.

## Actual source-owned handoff path

The [V3 adapter](../qualification/capacity-native-workload-adapter-v3.draft.mjs)
directly composes the genuine
[windowed asynchronous core](../src/service-credit-capacity-windowed-async-workload-owner-core.js)
and the [real paired supervisor](../qualification/capacity-native-paired-lane-v3.supervisor.draft.mjs).

The [service window owner](../qualification/capacity-native-service-window-v3.owner.draft.mjs)
captures the real process monotonic clock; there is no injected clock, worker,
namespace getter, SQL store, signer or SDK substitute. Construction and
snapshot are inert. Valid entry requires the genuine full V3 service namespace,
source seal, runtime and run/lane binding. First clock entry and marker entry
observe full namespace identity; ordinary writer reads retain the admitted
function identity without repeating filesystem metadata walks per timestamp.

OPEN occurs after warmup and its fresh all-lane balance barrier. Every OPEN
acknowledgement must return before parent measured dispatch starts.
The [real worker](../qualification/capacity-native-service-lane-v3.worker.draft.mjs)
handles WINDOW_STOP before its ordinary active/stage gate, so STOP is not queued
behind an armed or pending original. The service takes its own boundary after
its source identity checks; parent send/receive times are never substituted.

The supervisor reserves the original before entering its ARM send, rather than
deferring the send until after a later STOP could overtake it. Marker and
ordinary operation tickets have separate finite gates. Explicit marker UNKNOWN
or timeout rejects measurement without itself aborting an existing operation.
That original can still reach its real FINISH; no replacement or replay occurs.

Unobserved tickets remain visible at EOF. Only their already-owned obsolete
timers are stopped; no missing ACK, successful drain or released resource is
manufactured. Protocol/transport faults still preserve operational uncertainty.
Owner-close fallback is explicitly unknown and cannot substitute for STOP.

These statements are SOURCE REVIEW, not a passing native protocol experiment.

## Writer evidence and separate clocks

Actual store writer hooks use the same service-child window owner for their
timestamps. Measurement failure is caught outside the store transaction's
authority path and does not itself throw into/quarantine SQL.
The independent service deadline clock remains the original real process
clock; it does not consume the finite writer-marker read budget.

After original drain and acknowledged STOP, the final fresh balance barrier
reads genuine writer pages. The genuine
[window/cohort DATA owner](../src/service-credit-capacity-window-writer-trace-data.js)
classifies full brackets, retains boundary contacts and keeps incomplete
distributions withheld. No latency is clipped and no parent-child clock
subtraction is performed. A service-child window can have IPC-delay prefixes
or spill-out relative to the parent/client window; they are not aligned.

Private evidence retains the source-bound service window and original page
intervals. Public component reports omit request/grant IDs, private paths and
operation names; the declared lane labels remain visible.
All native/benchmark/sustainable-capacity/production flags remain false.

## Full-source admission and actual controls

The [exact inventory](../qualification/capacity-native-full-graph-v3.inputs.json)
adds 21 application rows to the unchanged 117/404 baseline, for 542 total inputs.
The [V3 role profile builder](../qualification/native_capacity_full_profile_v3.py)
and [real full-namespace preloader](../qualification/capacity-native-full-namespace-v3.preload-common.draft.mjs)
bind all three roles, complete child profile bytes, independent five-field
private-root identities, immutable nine-field source/runtime identities and
the unchanged exact bare-package edges. They provide cooperative admission,
not human authority or an OS/network sandbox.

Actual local evidence is in the
[source-only result](../qualification/capacity-native-full-graph-v3.source-only-result.json):

- 54 separate window/cohort DATA controls passed.
- 17 inert adapter/clock-owner controls passed; valid native run/stop/marker
  entry was deliberately not made, and no fake namespace was installed.
- 87 Python role-profile DATA controls passed, using explicitly synthetic
  in-memory root/identity DTOs, not opened private roots.
- 15 JavaScript files parsed and two Python sources compiled without native
  entry.
- The real read-only profile CLI verified all 138/404 source/package files
  (4,754,533 bytes), without importing SDK/SQL or executing Node. It hashed the
  existing Node binary once for all roles; it created no source/package copies.

DATA and inert tests do not qualify the full native application. No native
TLS, SDK, SQLite, key/signature, nonce, worker/IPC or benchmark ran, no private
task root/profile was created, and no cleanup or automation changed.
The historical 111-case core result and current 27-case hosted CI remain
separate and were not rerun to regenerate metadata.

Next: source-bound managed V3 planning/capture checks, fresh managed-root and
capacity admission, then a separately reviewed finite native scope. P2 crash,
lost-ACK/socket/HELD behavior, real P4 pressure/throughput, P3 economics/live
pilot and production remain independent gates.

