# Parent timing capture and independent controller DATA

Status: **175 selected DATA controls passed**. This includes 40 new parent-trace
controls and the 135 existing selections on the changed
[managed controller](../qualification/native_capacity_managed_workload_v3.py).
These are current source-bound DATA results, not native timing or workload proof.

## Real source path, two independent checks

The source-only native adapter explicitly selects the genuine traced core.
The actual parent entry retains its one frozen raw parent trace privately,
binds the manager run/source/lane context, and checks the actual recorder report
with the independent JavaScript checker. Missing, unknown or mismatched parent
DATA cannot produce an exit-zero success. The existing failure capture retains
its uncertainty; no alternate operation, clock, SDK or store is substituted.

The controller independently recomputes that trace in Python. It does not import
or replay the JavaScript recorder or trust the returned checker flag. It checks
every recorder field, the entry check, exact expected run/source/lane order,
all phase percentiles, peaks, balance stages, whole slow latencies, spill-out
and the exact measurement-window ratio. Boolean/integer aliasing, unknown
fields, missing finishes, UNKNOWN, partial frames and mismatched reports refuse.

Parent and service-child clocks remain distinct. No elapsed time is inferred
as pure SQL latency. Post-stop ledger tracing remains explicitly separate.
A self-consistent declaration is not native authentication, economic authority,
physical release, delivery or sustainable throughput.

## Genuine, explicitly synthetic fixtures

The [DATA generator](../qualification/capacity-parent-timing-fixture-data.mjs)
ran the actual core and JavaScript checker with declared counters, timestamps,
Promise outcomes and a non-native scheduler. It generated full-completion and
window-stop/spill-out examples. The single
[versioned fixture](../qualification/fixtures/capacity-parent-timing-source-data-v1.json)
is retained once; reports refer to its digest instead of duplicating its trees.
The Python suite independently matched both genuine source outputs.

The first 175-case run failed one fixture-isolation test: returned lane IDs
shared the expected plan's list, so reversing one changed both. The fixture now
copies that list. The validator rule was not weakened, and the failed output
digests/counts remain in the [actual result](../qualification/native-capacity-parent-timing-controller.actual-local-result.json).
A small [input delta](../qualification/parent-timing-failed-data-inputs.delta.json)
reconstructs both failed input byte sequences from pinned current files. Their
SHA-256 values matched the original failure pins without executing the old
variant or retaining a second full source tree.
A subsequent source review corrected two worker admission literals before
any native attempt. Historical passing checks before that source change were
not relabeled as current passes.

## Honest finite reservations

The selected two-lane plan reserves at most 900 parent events: 256 bytes/event
plus an 8,192-byte wrapper/context allowance, 238,592 bytes total. Whole capture
reservation is 1,022,976 bytes; stdout cap is now 1 MiB, not the old 768 KiB.
The 71 MiB task quota and 10 GiB floor plus reservations remain in place.
These are source-planned bounds, not measured allocations or an OS sandbox.
No old scope permits the changed graph/capture, and no effect was executed.

The decoder validates the existing JSON tree in place. The source core retains
one frozen cached event array. The checker does not make another event-array
copy; bounded temporary duration distributions remain necessary. Native heap,
runtime throughput and resource drain were not measured.

## Scope of the current result

All 175 DATA controls passed with complete exit-zero captures and no skips.
Separate source-only checks passed 88 profile controls and 19 inert controls;
four changed native sources parsed without import. The actual managed source
entry read all 139 application and 404 package files in place, including the
genuine parent checker, without Node/application execution or a private root.

No SDK, SQLite, key/signature, nonce search, socket, native worker, manager task,
download, package copy, historical cleanup or automation ran. The unchanged
27-case hosted profile does not run these 175 controls. Earlier 49/111 component
sources are unchanged and were not rerun merely to regenerate metadata.

The complete native adapter/entry/namespace remains on the scoped source branch,
not a runtime-qualified main path. Default buyer and workflows are unchanged.
Native P2, capacity, economic acceptance, provider authority, pilot and
production remain unqualified.
