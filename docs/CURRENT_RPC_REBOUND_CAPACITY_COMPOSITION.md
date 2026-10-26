# Current RPC-bound capacity composition

Date: 2026-10-26. Source and DATA checkpoint passed; native execution remains unqualified.

The complete source candidate is pinned at [82ed6fd40f59](https://github.com/edgepillar/zenon-x402-poc/commit/82ed6fd40f59444c077b460eea6fd2f94bab9c2b).
It contains genuine V7 payer/service loaders, workers, owners and a V6 parent family. Earlier recipes and results remain at their original source versions.

The shared [namespace contract](../src/native-capacity-role-namespace-contract-v7.js) and its [21-case local test](../qualification/native-capacity-role-namespace-contract-v7.behavior.mjs) are independent builtin-only code.
The full native candidate lives on the development commit above. Publishing it does not establish native execution, installed-package admission or production readiness.
The [actual local result](../qualification/current-rpc-rebound-capacity-composition.actual-local-result.json) binds all 25 new source files by SHA-256 and Git blob identity.

## What changed

The previous graph pins the older RPC byte-budget implementation and correctly refuses current application bytes.
The new leaf graph declares exactly one replacement: the old RPC source row becomes the current source row.
Every other previous row and all 404 declared package rows are preserved. Ten rows extend the leaf graph: eight genuine native-role modules, the shared DATA contract and one preserved manifest used as metadata.

The genuine leaf loaders validate preserved graph metadata through that declared RPC revision, then verify actual source reads against the current rows.
The revision is confined to metadata comparison; it never substitutes old bytes for current source reads, resolution or execution.
No source transformation or builtin alias is introduced.

The loader, both workers, both role owners and service-window owner use the same ten-field namespace contract.
It rejects proxies, accessors, mutable or foreign-prototype objects, unknown fields, legacy flags/kinds, altered digests and noncanonical counts.
It returns the same frozen snapshot, whose admitted values are primitives.
The loader retains that snapshot between checks while rechecking its root, Node and profile identities.
This removes a reconstructed snapshot and intermediate validation value array. No wall-clock or heap improvement was measured.

## Actual local verification

| Control | Actual result | Boundary |
| --- | --- | --- |
| Builtin-only Node namespace contract | 21 passed, zero failed/skipped | Executes the real shared DATA module; no native namespace installation |
| Complete Python source/DATA pipeline | 376 passed, zero failures/errors/skips | Retains all 360 prior cases and adds 16 composition cases |
| Default source-only CLI | Exit 0; all 184 application files verified | Installed package files read: 0; no storage root or native command |
| Genuine native module syntax | All 12 current files parsed | Imports were not linked and modules were not evaluated |
| Historical source CLI | Exit 1, COMPLETE_CURRENT_APPLICATION_SOURCE | Preserves the refusal at its original graph; no native effects |

Node was the pinned 24.19.0 Darwin/arm64 binary. Python was 3.12.14 with -I -S -B.
The complete pipeline used read-only source admission and declared callback data.
Its audit recorded zero subprocesses, sockets, SQLite connections, write opens, outside-source reads or mutations.
Physical task-storage admission was not tested.

Independent leaf and parent producers emitted identical complete V7 profile bytes for PAYER and SERVICE.
Rehashed legacy versions, kinds and historical RPC rows are rejected by the complete command binding.
The pipeline compares all 89 resource fields: only ten source/protocol/count metadata fields change.
Every other effect ceiling, reservation and policy field equals the previous generation.
Eight native storage/refusal functions remain AST-identical.

The execution commands passed where the outer recorder used an incorrect reporter expectation, field name or single-object stream parser.
Those recorder errors remain in the original receipts.
Append-only reconciliation binds the actual complete outputs without rerunning completed commands.
The pipeline output contains two source-only CLI events followed by one complete 376-case result.

## Bound source graphs

| Graph | Application files | Declared package files | Rows | Profile protocol |
| --- | ---: | ---: | ---: | ---: |
| Genuine V7 payer/service | 173 | 404 | 577 | 7 |
| Genuine V6 parent | 184 | 404 | 588 | 9 |

Leaf seal: 7561f4a96b0bb584b6b6064d7b1cb5399670ef29693d18735156c62fb7b6ec03.

Parent seal: d18a65199ada183a6a3f7823a9d4aeb65854da4afe5ef43edb61cdd092b459e0.

The [leaf manifest](https://github.com/edgepillar/zenon-x402-poc/blob/82ed6fd40f59444c077b460eea6fd2f94bab9c2b/qualification/capacity-native-current-roles-v7.inputs.json), [parent manifest](https://github.com/edgepillar/zenon-x402-poc/blob/82ed6fd40f59444c077b460eea6fd2f94bab9c2b/qualification/capacity-native-current-offered-parent-v6.inputs.json), [launch selection](https://github.com/edgepillar/zenon-x402-poc/blob/82ed6fd40f59444c077b460eea6fd2f94bab9c2b/qualification/capacity-native-current-offered-v6.launch-inputs.json) and [complete DATA pipeline](https://github.com/edgepillar/zenon-x402-poc/blob/82ed6fd40f59444c077b460eea6fd2f94bab9c2b/qualification/native_capacity_current_offered_pipeline_v5.behavior.py) are immutable links to the candidate.
The launch selection retains a maximum of one run and grants no native allowance.
Its default mode performs source-only verification. Native modes require separately admitted scope and physical storage preflight.

## Remaining roadmap evidence

The current graph has not executed native SDK/x402 code, SQLite, HTTPS, keys/signatures, nonce search, a worker or a funded payment.
The existing 108-control V3 hosted CI selection remains unchanged.
It does not execute these 21 Node cases, the 376-case Python pipeline or the native candidate.

A future native attempt still needs matching source, package, tool, storage-capacity and finite-scope admission.
These local source/DATA results do not consume or extend an older native allowance, resolve a physical storage refusal, establish sustainable capacity or qualify a live pilot.
