# Current V6 matched-window composition

The current V5 service source imported the V3 service-window owner. That owner
requires the V3 namespace, selection, run scope, profile kind and 138-application
premise. The actual V5 worker/preloader supplies the current V5 namespace/scope
and 154-application graph, with no V3 alias. A declared V5 context therefore
cannot pass the exact window admission definition. In the actual service source,
the timing hook catches that refusal and latches timingUnknown; it does not
throw measurement failure into the real store transaction. This prevents a valid
measurement even when an unrelated source/metadata check is green.

The mismatch was reproduced by executing the exact V3 window definitions over
the actual V5 contract's declared process/namespace/clock DATA. This was not a
native execution of either service. The original failing result is preserved.

## Complete candidate path

A new V6 service-window owner captures the current V6 service namespace and
selectors directly. Its clock/window logic, read ceiling, uncertainty latch and
close-fallback behavior retain the old semantics. There is no V3 namespace alias,
injected native clock or transformed native source.

The complete V6 child family includes both workers, both source owners, both
preloaders and their common admission code. The V6 service owner imports this new
window. Its preloader proves that all 558 previous V5 source rows remain present
before publishing the preserved-V5 premise. All 404 declared package rows remain
unchanged. The three new payer package edges coexist with the preserved edges;
none replaces an older binding.

The offered V5 parent includes the real adapter/pair/entry/preloader, full parent
producer, resource/command/capture/context controls, managed launcher and exact
manifest. It admits the complete current child profiles. The entry, adapter,
worker URLs and namespace contracts agree on V6 children. This is the full
candidate composition, not a smaller substitute workload or standalone window.

| Graph | Application files | Package rows | All rows | Profile version |
| --- | ---: | ---: | ---: | ---: |
| Preserved V5 children | 154 | 404 | 558 | 5 |
| New V6 children | 163 | 404 | 567 | 6 |
| New offered V5 parent | 172 | 404 | 576 | 8 |

Equal row counts in different historical graphs never substitute for their exact
source seals. The new child source seal is
92646a2cf5edf717a1d24468fa6277c48c4f59f43db5b6e607b6071acc79c2b2.
The new parent source seal is
6f4992bb133fb399f9f28e111bd2b993a88c412c4832b163a519a357abee3b7a.
The child declares 5,127,575 source bytes; the parent declares 5,285,067.

## Actual local source and DATA results

- All 33 exact window-definition cases pass over declared contexts and clocks.
  They cover current open/stop, old selectors and hooks, runtime/namespace drift,
  clock refusal/read limits, inert construction and uncertain close fallback.
- All 66 actual V6 role-producer controls pass. All 163 application source files
  match their pins; installed package files are not read. Thirty-two complete
  child profile byte strings match independent canonical references. Three
  shared field serializations are retained, with 203,924 shared canonical bytes.
- All 330 complete offered V5/V6 pipeline controls pass. They verify all 172
  application sources, complete parent/child/resource/command/capture bindings,
  source-only default behavior, native-selection refusal (including V4), and the
  existing early-storage ordering/whole-resource guards over declared inputs.
- The actual new launcher defaults to SOURCE/DATA and exits zero with
  nativeControllerQualified false and no native authority.
- All 12 new native JavaScript sources have passing parser-only results. After
  relative URL corrections, the nine unchanged results were retained by exact
  bytes/identity and only the three changed sources were rechecked.

These are separate selections, not additive coverage or a conformance percentage.
The native worker, preloader, SDK, SQLite, signatures, nonce search, pipe or socket
was not executed. The window tests execute extracted definitions with an explicit
declared process/namespace/clock, not a native namespace or measured window.

Two full-pipeline unsuccessful attempts are preserved. The first retained old
test version expectations; the second caught six stale relative import/worker
URLs in three new parent source files. The code URLs and full binding chain were
corrected, and actual source-edge checks were strengthened before the successful
330-case result. Original failed streams and replaced source bytes are retained.
A preliminary 66-case role result also remains preserved at its original test
selection/labels; the current role result uses the V6 labels.

## Authority and retained evidence

All 425 prior protected inputs remain byte/identity unchanged. Old V3/V5 and
offered V4 sources/recipes keep their original scope; their earlier green DATA
checks did not exercise this missing cross-module window admission. No old receipt
is rebound or promoted to current native evidence.

The workload, no-queue/no-catchup scheduling and original-payment rules remain
unchanged. The 38 MiB task ceiling, 10 GiB floor, 1 GiB safety margin and 4 MiB
metadata reservation remain unchanged. The proposed native ceilings remain one
parent, two children, 181 loopback connections and 65,536 total nonce candidates;
none was allocated or executed here. No root, quota, cleanup, automation, default
buyer or pilot changed, and no finite native allowance was consumed.

The new source launcher is
[run-capacity-native-current-offered-v5.local.py](../qualification/run-capacity-native-current-offered-v5.local.py).
Its [manifest](../qualification/capacity-native-current-offered-v5.launch-inputs.json)
does not grant authority. A separately admitted current native attempt, physical
storage acceptance and real closure/load evidence remain required. Hosted main CI
is a separate unchanged 27-control selection and does not run these new suites.

See the [source-bound result](../qualification/current-window-v6-composition.actual-local-result.json),
[window DATA tests](../qualification/current-window-role-v6.behavior.mjs),
[role profile controls](../qualification/native_capacity_current_role_profiles_v6.behavior.py)
and [complete pipeline controls](../qualification/native_capacity_current_offered_pipeline_v4.behavior.py).
