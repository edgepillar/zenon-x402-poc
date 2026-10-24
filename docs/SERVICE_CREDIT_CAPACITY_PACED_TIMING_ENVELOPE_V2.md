# Private paced timing envelope v2

Status: 163 current selected DATA controls passed: all 155 prior owner/checker
controls reran on the changed runtime, plus eight envelope controls.
This is a standalone source/runtime component, NOT native execution, a
throughput benchmark, live service delivery or production qualification.

The [new capture export](../src/service-credit-capacity-paced-timing-trace-data.js)
keeps the existing checker API and ordinary reports unchanged. It creates one
private envelope from frozen trace/report DATA, independent source expectations
and a separately bounded caller context. It reads no file, clock or timer and
invokes no source callback.

## One raw trace, both genuine checks

The paced capsule already contains its genuine inner parent-recorder capsule.
Serializing that capsule AND another top-level parent capsule duplicates the
same raw parent event sequence. Envelope v2 stores raw evidence at exactly:

`pacedTimingData.trace.coreParentTimingTrace`

The result has `pacedTimingCaptureVersion: 2`, one context, the original paced
trace reference, a genuine paced check, a genuine parent check, a fixed
`parentTraceLocation` and status. It copies neither the raw trace nor report.
Both summaries come from the real existing arithmetic in one envelope check;
a caller cannot supply a successful check result. The old direct checker
continues returning the exact same public summary shape.

Safe frozen HELD/mismatched DATA is retained with both checks null and
`UNKNOWN_OR_MISMATCHED_PACED_TRACE`. Late completion cannot upgrade an already
HELD capsule. Unsafe getters, proxies, cycles, non-frozen or oversized DATA
refuse before becoming a serializable payload. Context fields bind only
declared DATA: they do not authenticate the caller, host, source graph or IPC.

## Actual DATA serialization evidence

The [selected tests](../qualification/service-credit-capacity-paced-timing-envelope-v2.behavior.mjs)
exercise the genuine private paced owner, recorders and parent/checker code.
Host callbacks and time remain explicitly synthetic DATA; no SDK/store/transport
facade is substituted as native evidence.

For the 16-lane, 4,080-call DATA case:

| Timing-only JSON | Bytes |
| --- | ---: |
| Reconstructed old two-trace layout | 3,025,919 |
| New single-trace envelope | 2,159,109 |
| Removed serialization | 866,810 |

The original 8,244 parent and 16,321 paced events remain intact, with both
checks. One raw parent occurrence replaces two; no sample or check is dropped.
The comparison reconstructs only the old JSON layout using current genuine
source DATA. It does NOT run/replay the old native entry, measure a full native
capture, establish physical storage reclaim or provide a peak-memory guarantee.
No raw comparison frame is written to disk or exported.

The [actual local result](../qualification/service-credit-capacity-paced-timing-envelope-v2.actual-local-result.json)
pins all 11 loaded source/module-scope inputs. One Node command passed all 163
controls, with no failed/skipped/cancelled/TODO cases and no stderr. Its roughly
1.82-second duration is not a capacity or latency benchmark.

## Main adoption is not native activation

This component's main batch includes only the checker/capture source, selected
test, result and documentation. The developmental native entry adopts the v2
layout separately, through a new source selection. Its private profile producer,
managed launch controls, real SDK/SQL/HTTPS effects and finite authority remain
separate. No default buyer, signer, workflow, package or hosted selection changes.

The unchanged hosted profile still selects 27 DATA/component controls, not the
new 163 controls. Green hosted CI cannot reclassify these local DATA results as
native or production qualification. Old source-pinned records remain unchanged.

## Independent cross-language DATA check

The separate [Python timing-envelope checker](SERVICE_CREDIT_CAPACITY_PACED_TIMING_ENVELOPE_PYTHON_CHECK.md)
now reconstructs the entire parent, queue and source recorder reports directly
from this v2 single-copy raw layout. Its 65 selected controls use six clean and
one HELD fixture produced by the genuine source owner/recorders. It imports no
JavaScript, rewrites no R4 context and does not treat supplied check objects as
proof. This remains timing DATA, not full native command/writer qualification;
the timer and post-stop duration-series limitations remain explicit.

