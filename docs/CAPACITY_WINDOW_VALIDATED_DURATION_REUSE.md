# Reuse validated writer-window durations

The current writer-window classifier already receives immutable canonical
duration strings from the genuine full-page/cohort capture. It also parses both
bracket endpoints to classify the whole interval. Re-parsing the derived bracket
duration and rendering both durations again did redundant work for every row.

The classifier now derives the retained bracket BigInt from those already parsed
endpoints and reuses the two validated duration strings in its detached public
row. It keeps the inside-transaction BigInt needed for sorting. It adds no buffer,
sample, cache or reference table, and changes no returned field.

Whole-page admission and staging still precede aggregate mutation. Original
completion/order binding, conservative boundary equality, un-clipped brackets,
sticky incomplete coverage, percentile definitions, cached finalization and
reference release remain unchanged. No raw request ID or operation label enters
the returned window report.

## Actual component checks

All **80 selected local component tests pass**, including **26 comparison cases**.
Five new cases cover zero and large exact decimals, conversion counters, late
malformed endpoints, accessors/coercion and the full 16-lane declared trace.

The comparison uses actual imported modules. The preserved reference window's
append body was byte-identical to the previous owned window's append body.
Counters bracket append only, restore the original global descriptors afterward
and subtract each path's actual cohort-owner calls. This isolates the window's
conversion work from the earlier coverage-only optimization.

| Outer window work for 50,176 declared rows | Previous owned body | Current body |
| --- | ---: | ---: |
| BigInt calls | 200,704 | 150,528 |
| String calls | 100,352 | 0 |

The raw full reference and current paths have different cohort work and include
cross-page bookkeeping. Those counts are retained separately in the result;
their entire difference is not attributed to this patch.

Every append result and final distribution remains identical to the preserved
reference. The full cases retain all rows, release duration/command references
at finalization and keep the existing 4,096-offer/16-lane budgets. No sample
downscaling, clipping, timing substitution or inferred native throughput is used.
Counts are function-entry observations, not measured heap bytes, native latency,
APFS reclaim, sustainable capacity or a benchmark speedup.

## Complete development integration

The actual current parent selection binds the changed component's bytes. Its
174 application and 404 package rows remain 578 total; all 567 child rows are
preserved. The manifest, producer, command/capture/context controls and source
launcher have matching new source pins. All **360 complete pipeline controls**
and the actual default source-only CLI pass with this selection.

All allocation, output, deadline, connection, signing and nonce ceilings are
unchanged. Storage/capacity predicates and native task/command/closure functions
are byte-for-byte equivalent as ASTs. The 10 GiB floor and all other stores'
reservations remain mandatory. No manager task or native application was run;
no finite native allowance was consumed or relabeled.

The independent helper, component tests and this result/documentation form a
small main-transfer batch. The nine native-controller/manifest binding changes
remain a separate development selection. The unchanged 27-control hosted CI
does not execute the 80-case component or 360-case source pipeline selections.
Any new main commit needs its own observed CI result.

See the [source-bound result](../qualification/service-credit-capacity-window-duration-reuse.actual-local-result.json)
and [actual comparison cases](../qualification/service-credit-capacity-window-owned-comparison.behavior.mjs).
This work advances the capacity implementation; real P1/P2 composition, economic
pilot acceptance and measured native P4 latency/concurrency remain separate gates.
