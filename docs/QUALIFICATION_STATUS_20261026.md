# Qualification and roadmap snapshot - 2026-10-26

This dated snapshot records the checked main baseline and the current development
candidate. The source and DATA results below retain their exact selections and
do not establish native composition, economic acceptance or production readiness.
The [2026-10-25 snapshot](QUALIFICATION_STATUS_20261025.md) remains unchanged.

## Pinned evidence

| Lane | Checked reference | Actual result and scope |
| --- | --- | --- |
| Main selected CI | [main bdf073d2](https://github.com/edgepillar/zenon-x402-poc/commit/bdf073d2cca8dacb378e4d1e541ee781ed33fb01), [run 40287593651, attempt 1](https://github.com/edgepillar/zenon-x402-poc/actions/runs/40287593651) | The unchanged 27 selected controls passed on Ubuntu/Node 24.19.0. No dependency installation, SDK/x402 execution, SQL, keys, signatures, nonce search or native HTTP was selected. |
| Packed capacity recording on main | [29-case local component result](https://github.com/edgepillar/zenon-x402-poc/blob/bdf073d2cca8dacb378e4d1e541ee781ed33fb01/qualification/service-credit-capacity-packed.actual-local-result.json) | The actual builtin-only component definitions preserve reports across 364 exhaustive short outcome streams and 16 old/new owner comparisons, including the full 16-lane/4,096-offer cases. These tests are separate from hosted CI. |
| Current matched-window candidate | [development cb50d293](https://github.com/edgepillar/zenon-x402-poc/commit/cb50d29302af49b70bfd5ffd7de3614e87111aa8), [source-bound result](https://github.com/edgepillar/zenon-x402-poc/blob/cb50d29302af49b70bfd5ffd7de3614e87111aa8/qualification/current-window-v6-composition.actual-local-result.json) | The 33 exact window-definition cases, 66 role-producer controls and 330 complete pipeline controls passed in their separate local source/DATA selections. The actual source-only CLI also exited zero. Native workers, installed SDK/packages, SQLite, sockets, signing and nonce search were not executed. |

Counts describe their own lanes. They are not additive coverage or an x402
conformance percentage. The main baseline's green run is not a future commit's
CI; a documentation transfer's automatic run must be observed at its own head.

## Concrete implementation progress

The packed recorder already on main retains one packed BigInt per terminal
observation and derives terminal/success ranks from one sort per nonempty phase.
For the declared all-success full-budget input, duration references fall from
24,576 to 12,288 and finalize sorts from six to three, with identical reports.
These are counted operations, not measured heap savings or native throughput.
See the [main component explanation](https://github.com/edgepillar/zenon-x402-poc/blob/bdf073d2cca8dacb378e4d1e541ee781ed33fb01/docs/CAPACITY_PACKED_RECORDER_AND_OFFERED_CHAIN.md).

Two later development optimizations retain their own source-bound evidence:

- [Writer-summary scratch reuse](https://github.com/edgepillar/zenon-x402-poc/blob/cb50d29302af49b70bfd5ffd7de3614e87111aa8/docs/OWNED_WRITER_SUMMARY_SCRATCH_REUSE.md) passes 19 extracted-definition cases. For the declared 50,176 raw writer rows, additional summary copies fall from 100,352 references to zero. Raw rows, order, identities and exact percentile fields remain preserved.
- [Single-buffer child prefix capture](https://github.com/edgepillar/zenon-x402-poc/blob/cb50d29302af49b70bfd5ffd7de3614e87111aa8/docs/CHILD_PREFIX_SINGLE_BUFFER_CAPTURE.md) passes 27 exact nested-definition cases. Under declared one-byte fragmentation across 64 streams, Buffer constructions during additions fall from 294,912 to 64, with the same 294,912 retained prefix bytes. Explicit independent snapshots remain intentional copies.

Neither optimization result imports its native adapter/pair module or measures
real child pipes, EOF/close behavior, sustained load or reclaimed disk space.

The latest candidate also fixes a real source-contract mismatch: the current V5
service imported a V3 window requiring the old namespace, selectors and graph
premise. The actual V5 worker/preloader did not supply that contract. Executing
the exact V3 window definition against declared V5 context reproduced the refusal;
the service timing hook would retain measurement uncertainty rather than turn it
into a store-transaction failure. This was not a native service reproduction.

A complete new V6 child family and offered V5 parent/controller now agree on the
current window, namespaces, workers, entry and adapter. The previous V5 sources
remain present; no compatibility namespace alias or transformed native source is
used. The child binds 163 application files plus 404 declared package rows
(567 total); the parent binds 172 plus 404 (576 total). Complete source selection,
canonical child profiles, relative edges, command/resource/capture controls and
the managed source-only launcher are checked together. The final successful
pipeline has 330 cases; unsuccessful intermediate attempts remain preserved.

See the [candidate's full matched-window explanation](https://github.com/edgepillar/zenon-x402-poc/blob/cb50d29302af49b70bfd5ffd7de3614e87111aa8/docs/CURRENT_V6_MATCHED_WINDOW_COMPOSITION.md).
This link names a development candidate, not merged or natively qualified main
runtime behavior.

## Roadmap checkpoints

| Priority | Implemented checkpoint | Remaining acceptance evidence |
| --- | --- | --- |
| P0 - current qualification baseline | Main has a selected 27-control Node/profile lane; component and historical recipes remain separate. | Verify the intended commit's own CI and actual selected results. Preserve failed and skipped attempts. Do not expand the workflow implicitly. |
| P1 - current real application composition | Versioned x402, HTTPS, custody, selected-grant, funding and service sources exist. The current source graph now has a matched service-window contract. | A reviewed current-source real composition covering success, pending, response loss, foreign grant and the same original request, with the selected SDK/HTTPS/SQLite owners and genuine closure evidence. Source/DATA checks alone do not close this gate. |
| P1 - Dynamic Plasma path | Bounded preparation/signing/validation and original-payment custody alternatives are explicit. | Current-source positive-work preparation through signing, final validation, original signed custody and publication/reconciliation. Retain identical original bytes/hash under horizon, price, deadline and uncertainty changes. A named opt-in path is not a default cutover. |
| P2 - interruption/resource lifecycle | Source close guards, original custody and recovery recipes are versioned. | Current-source commit interruption, lost acknowledgement, late/nonclosing socket and HELD-store/reopen behavior. Prove no duplicate dispatch or automatic retry/re-signing. Normal reopen does not establish power-loss behavior. |
| P3 - bounded economic pilot | No new economic acceptance is claimed. | Independent runtime/chain acceptance, provider policy, real signer/key-custody lifecycle, funding/grant economics and operator stop/recovery procedures. |
| P4 - measured capacity | Exact recorders, paced scheduling and a complete current source pipeline are implemented; counted allocation work is reduced. | Admitted native command/closure receipts, real offered/completed/error observations, writer/balance correctness and measured latency/concurrency distributions. Keep funding, funded-session, ledger and L1 timings separate; Momentum timing is not measured TPS. |

The default buyer retains its [legacy signed-composite call](https://github.com/edgepillar/zenon-x402-poc/blob/bdf073d2cca8dacb378e4d1e541ee781ed33fb01/src/zenon-payment.js#L2115).
This snapshot does not change that wiring or enable a pilot.

## Native and main-transfer boundaries

A fresh read-only storage check refused the existing-root metadata/file-identity
binding. No task, manager import, SDK/package execution, TLS command, SQLite file,
signing material, nonce search or native application run was created. Existing
roots, policies and evidence remain untouched. Earlier reservation observations
remain historical lower bounds, not fresh storage admission or cleanup authority.
The current source recipe grants no native allowance and does not reuse a
finite approval tied to an older source graph.

The [pinned main-to-development comparison](https://github.com/edgepillar/zenon-x402-poc/compare/bdf073d2cca8dacb378e4d1e541ee781ed33fb01...cb50d29302af49b70bfd5ffd7de3614e87111aa8)
includes runtime and native-owner/controller changes beyond independent helpers.
The 27-control hosted lane does not execute their new SDK/SQL/HTTPS composition.
Those changes require their own source review and proportionate current-source
execution evidence before a runtime transfer. This requirement does not stop
independent local implementation or appropriately qualified small batches.

This update adds documentation only. It changes no package, workflow, profile,
runtime source, historical result, quota, native allowance, default buyer or
automation. Only the existing main CI profile may run automatically; its actual
new-head result is separate from the checked baseline above.
