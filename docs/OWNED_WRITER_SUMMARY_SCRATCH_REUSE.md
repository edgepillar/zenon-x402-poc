# Owned writer summary scratch reuse

The V5 native adapter report now sorts each writer column's fresh mapped scratch
array directly. Previously the summary helper copied that scratch array again
before sorting. Raw writer intervals remain complete and in their original order.
The balance timing column still gets its explicit copy before sorting. Exact
nearest-rank percentiles, BigInt duration strings and report field values are
preserved.

This is a source change with actual extracted-definition tests over declared
states. The native adapter module and application graph were not imported or
executed.

## Evidence

Nineteen focused Node 24.19.0 cases exercise the exact report and summary
definitions. The original helper fails the two scratch-ownership cases; the
updated helper passes all 19. Empty inputs, ties, odd ranks, large integer
durations, held outcomes and maximum declared writer rows are covered. Report
payloads match the V4 baseline except its already different adapter version
(V4 versus V5). Frozen original arrays, raw row bytes, row identities and order
are checked.

| Declared report input or observed work | Before | After |
| --- | ---: | ---: |
| Lanes | 16 | 16 |
| Complete raw writer rows retained | 50,176 | 50,176 |
| Values mapped into the two writer columns | 100,352 | 100,352 |
| Additional writer values copied by the summary helper | 100,352 | 0 |
| Balance values copied before sorting | 48 | 48 |

These are counted reference-copy operations in isolated extracted report
definitions. They are not measured heap savings, native throughput, or reclaimed
disk bytes.

The repaired current source bindings pass 329 complete Python pipeline cases,
the actual source-only CLI and a parser-only check of the changed adapter.
Twenty-four exact extracted pair namespace guard cases also pass against the
current parent manifest. Installed packages, SQLite, keys, signatures, nonce
searches and sockets were not used. The three unchanged native source parsers
retain their prior results; they were not repeated.

The focused 19-case result predates the metadata repairs. Its three actually
consumed files (current adapter, V4 baseline adapter and test) were rechecked by
bytes and nine-field file identity after those repairs. Old watched metadata
pins do not qualify the repaired bindings; the fresh pipeline result does.

## Preserved failures and source bindings

The first full pipeline attempt refused before tests because the adapter grew
by 98 bytes while the parent producer still required the old total byte count.
The total is now recomputed and pinned to all 567 selected rows: 5,161,251 bytes.
A second attempt ran 329 tests and reported five source-admission errors because
the launcher still required the previous source parent. The launcher and its
binding hashes now match source parent
0c113f8823a0ed5562beeb9862444da4f4831d70. Both unsuccessful attempt receipts
remain preserved; neither is treated as a successful or native run.

The parent remains 163 application files plus 404 declared package files. The
558-row child graph is unchanged. The 38 MiB task ceiling, 10 GiB free-space
floor, 1 GiB safety margin and 4 MiB metadata reservation remain unchanged.
No task, root, physical storage admission or native permission was created.
All 409 other protected input files remain unchanged. Historical receipts keep
their original source scope.

The machine-readable receipt is
[owned-writer-summary.actual-local-result.json](../qualification/owned-writer-summary.actual-local-result.json).
The focused executable is
[owned-writer-summary.behavior.mjs](../qualification/owned-writer-summary.behavior.mjs).
This development-only publication does not qualify native composition, hosted CI
for these component cases, live payments or production activation.
