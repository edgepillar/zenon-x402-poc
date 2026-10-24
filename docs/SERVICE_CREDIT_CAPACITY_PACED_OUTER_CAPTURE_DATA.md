# Paced v2 outer-capture DATA validation

Status: implemented with 87 selected passing Python controls and one separate
successful Node fixture command. This is the source-bound validator for the
actual paced v2 outer contract, NOT execution or qualification of the native
adapter, SDK, stores, children, manager or transport.

The [implementation](../qualification/native_capacity_paced_outer_capture_data_v1.py)
reads and compiles exactly three pinned Python DATA controls once: the unchanged
R4 arithmetic, paced resource planner and independent paced timing checker.
Verified bytes are compiled directly, without source rewriting or cached
bytecode. No application/package/manager module is imported. Validation itself
opens no file or resource.

## Actual new layout, original child context

The validator consumes pacedCaptureVersion 2 and the genuine nested paced owner
report directly. It does not flatten the report or synthesize an old unpaced
capture to satisfy the R4 controller. The separate parent/child source seals
remain bound to their original roles.

The independent timing checker reconstructs the parent, queue and source
recorders. The outer validator also checks the original per-lane pair counts,
payer command sequence, complete child/stream facts, whole writer brackets,
original command digests, cohorts and same-child-clock measurement windows.
The genuine unchanged child-window arithmetic uses its ORIGINAL child seal;
no source constant or context is rebound.

Parent, payer and service clocks are not merged or subtracted. Whole writer
intervals are classified, not clipped to imply pure SQL latency. Raw private
stream bytes must match their complete digest/length/EOF facts as DATA.

## Logical completion is not source entry

A queue withdrawal can complete a logical funded call WITHOUT entering its
child EXECUTE. Consequently the paced core's plannedCallsCompleted can be true
while not all source originals ran. The validator reconstructs DISPATCH counts
for EACH lane and binds them to that lane's actual declared completed originals,
writer bindings and payer command sequence. Global totals alone are insufficient.
No withdrawn original is replaced, invented or silently retried.

The [withdrawal fixture](../qualification/fixtures/capacity-paced-outer-contract-v1.json)
demonstrates one dispatched source and one pre-entry withdrawal while logical
planned completion is true. Its all-source-originals flag remains false.
This is declared contract DATA, not actual child execution.

## Bounded stream/framing work

Complete original stdout/stderr bytes are bound to an exact successful,
complete command receipt DATA object before interpretation. One compact ASCII
JSON object with terminal newline is required. Duplicate decoded keys, floats,
nonfinite numbers, negative zero, outside whitespace and extra frames refuse.

The checker avoids a second whole JSON serialization and a full raw-frame slice.
Valid string escapes are decoded as DATA; exact raw bytes are bound by their
stream receipt rather than re-created from normalized JSON. Parsing still
allocates its necessary decoded string/tree and derived arithmetic structures:
this is not a measured peak-memory or OS-quota guarantee.

Balance round-trip percentiles remain finite ordered declarations because their
raw duration series is absent. Pacing timers and post-stop ledger duration series
retain their previous explicit limitations. Receipt/process/EOF labels are not
independently authenticated by arithmetic.

## Selected evidence and remaining gate

The [fixture producer](../qualification/capacity-paced-outer-contract-fixture-data-v1.mjs)
uses the genuine paced owner/recorders and window/cohort writer helpers.
Pair, child-exit, command and receipt facts are explicitly SYNTHETIC declarations.
It never runs the native adapter or substitutes an SDK/namespace to claim a
native integration pass. The retained fixture is byte-identical to its successful
command output. Actual native frames/contexts/streams remain private.

The [87 selected controls](../qualification/native_capacity_paced_outer_capture_data_v1.behavior.py)
cover full, queued-withdrawal and pre-wait-withdrawal declarations, malformed
frames/receipts, incomplete evidence and independent clock-domain shifts.
The [actual result](../qualification/native-capacity-paced-outer-capture-v1.actual-local-result.json)
records zero failures/errors/skips and zero stderr with unchanged source inputs.
The existing 65 timing controls were not rerun just for metadata.

A real task-owned paced controller/profile writer must still create and bind
approved owned inputs, fresh source/package/tool/root identities, actual command
receipts, private capture bytes and separate storage closure/HOLD. The original
R4 finite grant is not consumed or moved to this graph. No actual native capture,
resource release, sustainable capacity, pilot or production is qualified here.
The unchanged 27-control hosted profile does not run these 87 controls.
