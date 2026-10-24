# Independent Python check of the single-copy paced timing envelope

Status: implemented; 65 selected Python DATA controls passed. One separate Node
command generated six clean and one HELD fixture using the actual paced source
owner, parent/queue/source recorders and JavaScript envelope component.
Neither command entered the native application, a managed task, SDK, SQLite,
keys, signatures, nonce search, sockets, host timers or children.

The [Python implementation](../qualification/native_capacity_paced_timing_envelope_data_v1.py)
does not import/replay JavaScript, trust its supplied check objects, create an
old R4 envelope or translate the new parent context into an old source seal.
It reads the actual single raw inner trace directly from
trace.coreParentTimingTrace. The frozen R4 controller remains byte-unchanged.

## Reconstructed data, not a matching label

The independent caller provides the exact expected plan, recorder limits, lane
IDs, minimum gap, run ID and separate parent/child source seals. These are
declarations: this arithmetic checker does not authenticate their origin.

Python independently reconstructs the entire inner window recorder, including
cohort/outcome distributions, nearest-rank percentiles, explicit window/drain
boundaries, in-flight peaks, balance counts and completion ratios. It compares
every recorder field and independently derives the supplied parent check.

It then reconstructs the FIFO paced queue, per-lane original ordinals and
nonoverlap, actual declared minimum gaps, pre-entry withdrawals and source
terminals. Each request is cross-bound to its original logical funded-call
bracket from the genuine inner raw trace. Both complete queue/source recorder
reports and the supplied paced check must independently match.

Changing both supplied JavaScript check objects cannot repair raw/report
mismatches. Shifting the whole core trace may preserve its internal percentile
arithmetic, but cannot detach it from the paced logical brackets. Consistent
forged gap labels do not replace the observed event spacing.

## Cost and evidence boundaries

A bounded exact-built-in walk precedes arithmetic. Strict structural comparison
distinguishes booleans from integers without serializing or copying the entire
input tree. Derived observation maps and bounded duration vectors remain real
work; this is not a peak-heap bound or throughput benchmark.

No actual pacing-timer event series exists in this capsule. Timer counts remain
bounded declarations. Post-stop ledger duration distributions are checked for
finite declared shape/count/order/span consistency, NOT independently rebuilt
from absent raw ledger events. The returned flags preserve both limitations.

The [retained fixture](../qualification/fixtures/capacity-paced-cross-language-v1.json)
contains only synthetic public-safe contexts/events from genuine source
objects. It is byte-identical to the successful fixture command's output.
It is NOT private native evidence. Actual native captures/contexts/streams must
remain private; publishing this synthetic fixture grants no export authority.

The [fixture producer](../qualification/capacity-paced-cross-language-fixture-data-v1.mjs)
does not import the old test files or rerun historical test selections. Source
inputs remain pinned. The actual fixture cases cover full/mixed outcomes,
16 lanes, queued withdrawal, pre-wait withdrawal, declared post-stop ledger work
and a finalized HELD snapshot unchanged by late completion.

The [65 selected controls](../qualification/native_capacity_paced_timing_envelope_data_v1.behavior.py)
also reject modified contexts, raw events, counters, distributions, supplied
checks, gaps, FIFO order, invalid types and bounds. The
[actual result](../qualification/native-capacity-paced-timing-envelope-python-v1.actual-local-result.json)
records successful zero-stderr commands, unchanged sources and no test failures,
errors or skips. Runtime observations are not latency/capacity measurements.

## Remaining native closure

This is a complete checker for the timing-envelope DATA contract, NOT a full
native command/child/writer/receipt validator. A real managed controller must
still own profiles/tasks/commands, bind actual source/tool/root identities,
retain complete private streams, strictly decode them and independently verify
the outer native result, original child commands and service-writer evidence.
Storage closure/HOLD stays separate from component matching.

The 27-control hosted profile is unchanged and does not select the new 65
controls. No native, economic, sustainable-capacity, pilot or production gate
is marked complete by these source DATA results.

The separate [paced v2 outer-contract validator](SERVICE_CREDIT_CAPACITY_PACED_OUTER_CAPTURE_DATA.md)
now combines this timing arithmetic with per-lane DISPATCH/original counts,
complete command/child stream facts and genuine child-writer window checks.
Its 87 selected controls use explicitly declared outer pair/receipt facts;
they are not an actual native adapter run. Real task ownership, private inputs,
fresh admission, managed command receipts and storage closure remain required.
