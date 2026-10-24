# P2 retained native read response-close gate

## Scope

The retained-custody native read selection now requires the assigned response's
own `close` observation before retiring a clean generation. Request close,
socket close and body completion cannot substitute for that observation.
This is a source integration into the actual native read core, not a replacement
HTTPS owner or an alternative successful application graph.

The shared boolean policy and two existing cooperative components passed ten
selected local tests. The changed native owner was syntax-checked only. It was
not imported, constructed or exercised against HTTPS. Native physical drain,
actual deadlines, SQLite lifetime, full P1/P2 and production remain unqualified.

Source parent: `ca02f5f4b8f7d9b79f95ae727e50a8835a6a05d7`.
Main parent: `4d6d3e69ff4d5557e57f85181e2d88f03285dc2e`.

## Actual source change

The internal six-argument retained-custody selection uses
`nativeReadGenerationHandlesClosed` in both normal completion and existing
grace-expiry handling. Each generation starts with `responseClosed: false`.
The response's own close callback records that observation, checks the existing
clock/deadline/grace policy, then attempts completion. A missing close at grace
expiry is uncertain; a late close cannot repair a retired uncertain generation.

The shared predicate accepts only six booleans and rejects inconsistent flag
combinations. Of the 64 boolean rows, four describe internally consistent closed
handle sets: no started request; closed request with no socket/response;
closed request/socket without a response; or closed request/socket/response.
A request without an assigned socket still needs the actual owner's existing
late-socket grace guard. The predicate itself supplies no grace or TLS proof.

The legacy four/five-argument branches retain their previous request/socket
predicate and response callback selection. The shared source file did change;
historical native results are not evidence for these current bytes. No default
buyer, endpoint, request budget, timer count, retry, re-signing or store policy
was added or relaxed.

## Selected actual checks

[Result and exact source pins](../qualification/native-read-response-close-gate.actual-local-result.json)
record one direct Node 24.19.0 command on darwin/arm64, zero Node children,
ten tests passed, zero failures/skips, and complete bounded stdout/stderr.
Only these application modules were imported:

- The actual new shared handle-close predicate.
- The existing actual retired-error latch.
- The existing actual original-funding read-close coordinator.

The tests cover all 64 boolean combinations, response/request/socket separation,
wrong arity and non-boolean/proxy inputs without invoking their hooks. Three
component compositions exercise the actual coordinator: holding funding close
until a declared response closes; retaining a declared grace refusal after a
late close; and vetoing funding after the actual latch observes a declared
late error while an operation is still being joined.

All event flags and resource callbacks in these cases are declared data.
The funding-close callback does not close a real store. The grace-refusal case
does not run a native clock/deadline. The tests do not authenticate native
events, prove physical cleanup or qualify the native application graph.

One additional `node --check` command parsed the changed native core with exit
zero and empty stdout/stderr. It loaded no application imports and established
no native behavior. The exact parsed file is pinned in the result.

## Efficient and bounded local work

The component command read existing source in place with exact read grants and
no child/worker/addon/filesystem-write grants. Compile caching was disabled.
Each output stream had a 64 KiB capture limit and the component supervisor had a
15-second deadline. These are selected-run controls, not an OS/network sandbox.

No download, extraction, archive, SQLite file, test certificate, task-storage
root/task or qualification scratch was created. Existing failed TLS evidence
and held stores were not cleaned up or modified. This is not a storage,
latency or throughput benchmark.

## Publication and remaining gates

Only the tested shared predicate, its test, result and this document are
eligible for this small main transfer. The changed native core remains on the
source branch; main's existing native core is not replaced. The two unchanged
tested dependencies and package manifest match both parent trees.

Both parents had zero check-runs, statuses and Actions runs at review.
No workflow was dispatched; neither the local component checks nor a normal
push is a hosted-CI pass. Historical result records remain source-bound and
unchanged.

The next native acceptance must exercise the current actual read/funding/store
graph with missing/late response close, socket drain, held-store recovery and
original-operation preservation under an appropriate separately reviewed scope.
The previous funding-TLS allowance is not expanded or reused by these tests.
P0 current-head CI, full P1 integration, native P2 lifecycle, the economic pilot
and measured capacity remain open. Provider activation guards remain unchanged.
