# Single-copy private paced timer envelope

The actual parent-entry transport can now use
captureServiceCreditCapacityPacedTimerEnvelopeData from the
[timer DATA module](../src/service-credit-capacity-paced-timer-trace-data.js).
It retains one genuine paced trace, its one inner parent trace and one timer
trace. It neither replays an owner nor accepts a caller-supplied check.

The genuine earlier envelope factory supplies the actual paced and parent
arithmetic once. The timer checker reuses that genuine result privately, then
checks the complete timer/dispatch relation. The caller cannot supply this
internal reuse argument through either public API. A matching result retains
both the enriched timer check (including its paced check) and the genuine parent
check, without serializing the old envelope or raw report a second time.

## Actual source-DATA result

[228/228 selected controls passed](../qualification/service-credit-capacity-paced-timer-envelope-data.actual-local-result.json)
on Node 24.19.0/darwin/arm64: all 212 earlier regressions plus 16 envelope cases.
The first selected command returned actual exit 0 with complete captures, no
stderr, no fail/cancel/skip/todo and all source/protected pins unchanged.

Coverage includes reference-preserving capture, exact field/arity admission,
genuine check equality, serialization/decoding, in-bound timer-count drift,
cross-trace mismatch, source-metric drift, synchronous delivery, refused
registration, uncertain cancellation, missing/unsafe rows and late held source
completion. Unsafe getters/proxies and raw token fields refuse without hooks or
retained private exception material. Safe UNKNOWN observations retain their
original raw capsules, but both check summaries are withheld; a partial parent
pass is not returned when timer arithmetic fails.

The 4,080-call declared-time stress selection retains all 12,238 timer rows.
One serialized envelope is 3,264,188 bytes. A deliberately duplicated timer
layout would be 4,368,615 bytes: 1,104,427 additional bytes, not an omitted sample.
This comparison reconstructs a counterfactual DATA layout, not an old native
execution. JSON serialization still allocates output bytes; there is no zero-copy
JSON, heap-byte, native capture-size, latency or sustainable-capacity claim.

The selected import closure contains only the actual source factories/checkers
and node:util, node:test and node:assert/strict. No SDK, x402, SQL, key, signature,
nonce search, socket, child, manager, private storage root, qualification scratch,
installer or source/package-tree copy was selected. Read-only grants and bounded
supervision are not an OS/network sandbox. The test wall time is not throughput.

## Native integration remains separate

A separate development-only V3 native entry/adapter/preloader proposal selects
the real timer-producing owner, uses a distinct namespace/profile and emits outer
capture version 4 with this new envelope. Its child application rows retain the
original 139-file graph; the proposed parent has 147 application rows. These
source proposals are not part of this module's executed DATA import closure or
its small main batch. Syntax/source checks do not execute their constructors,
SDK/SQL/TLS graph, resolution hooks, children or close paths.

A current managed parent-profile builder, conservative timer capture/resource
policy, independent V4 Python outer verifier and reviewed managed launcher must
still bind the proposed graph before any native request. Existing V2 paced
profiles and original unpaced R4 inputs are not rewritten, relabeled or reused
as execution authority. The earlier 15- and 212-case records keep their original
source pins.

Caller/run context, native clocks and receipts, physical timer absence, post-stop
ledger durations, physical resource release, economic acceptance and production
remain unqualified. Main CI remains the unchanged 27-control lane, not this
228-case selection. Only the independently executed DATA component is eligible
for main here; the native proposal and four pending SDK/SQL/native runtime edits
remain outside that transfer.
